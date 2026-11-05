// Git Extension worker: runs git for the panel. No dependencies, plain Node.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Orca starts workers with a minimal environment. git (global config, credential helpers) and
// the Orca CLI need the usual user folders, so fill in whatever is missing.
const home = os.homedir()
const BASE_ENV = { ...process.env }
BASE_ENV.HOME ||= home
if (process.platform === 'win32') {
  BASE_ENV.USERPROFILE ||= home
  BASE_ENV.APPDATA ||= path.join(home, 'AppData', 'Roaming')
  BASE_ENV.LOCALAPPDATA ||= path.join(home, 'AppData', 'Local')
}

const NET_TIMEOUT = 110_000 // panel requests time out at 120 s
const LOCAL_TIMEOUT = 30_000

class GitError extends Error {
  constructor(message) {
    super(message)
    this.code = 'action_failed'
  }
}

/** Run git and resolve with stdout. Rejects with stderr on a non-zero exit unless `okCodes` allows it. */
/**
 * Run git. When another git (an agent in a terminal, an editor) holds the repository lock for a
 * moment, wait and try again instead of failing.
 */
async function git(cwd, args, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await gitOnce(cwd, args, opts)
    } catch (e) {
      if (attempt < 4 && /index\.lock': File exists|Unable to create '.*\.lock'/.test(e.message)) {
        await new Promise((res) => setTimeout(res, 250 * (attempt + 1)))
        continue
      }
      throw e
    }
  }
}

function gitOnce(cwd, args, { input, timeout = LOCAL_TIMEOUT, okCodes = [0], signal, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: cwd || undefined,
      windowsHide: true,
      env: {
        ...BASE_ENV,
        GIT_TERMINAL_PROMPT: '0', // never hang waiting for a password prompt
        GIT_OPTIONAL_LOCKS: '0',
        LC_ALL: 'C',
        ...env
      }
    })
    const out = []
    const err = []
    let size = 0
    const timer = setTimeout(() => child.kill(), timeout)
    const onAbort = () => child.kill()
    signal?.addEventListener('abort', onAbort)
    child.stdout.on('data', (d) => {
      size += d.length
      if (size > 8 * 1024 * 1024) child.kill() // keep answers well under the 1 MiB-ish budget after trimming
      else out.push(d)
    })
    child.stderr.on('data', (d) => err.push(d))
    child.on('error', (e) =>
      reject(new GitError(e.code === 'ENOENT' ? 'git was not found on PATH' : e.message))
    )
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      const stdout = Buffer.concat(out).toString('utf8')
      const stderr = Buffer.concat(err).toString('utf8').trim()
      if (okCodes.includes(code)) resolve(stdout)
      else reject(new GitError(stderr || stdout.trim() || `git ${args[0]} failed (exit ${code})`))
    })
    if (input != null) child.stdin.end(input)
    else child.stdin.end()
  })
}

const net = { timeout: NET_TIMEOUT }
const req = (v, name) => {
  if (typeof v !== 'string' || !v.trim()) throw new GitError(`${name} is required`)
  if (v.startsWith('-')) throw new GitError(`${name} may not start with "-"`)
  return v.trim()
}
const files = (list) => {
  if (!Array.isArray(list) || !list.length) throw new GitError('no files given')
  return list.map(String)
}
const trunc = (s, max = 400_000) =>
  s.length > max ? s.slice(0, max) + '\n… (truncated)' : s

// ---------- repository ----------

// --git-dir and --show-toplevel never change for a folder: ask git once per repository.
const repoPaths = new Map()
async function paths(repo) {
  const k = repo
  let p = repoPaths.get(k)
  if (!p) {
    p = git(repo, ['rev-parse', '--git-dir', '--show-toplevel']).then((out) => {
      const [d, top] = out.trim().split(/\r?\n/)
      return { gitDir: path.resolve(repo, d), toplevel: top || repo }
    })
    repoPaths.set(k, p)
    p.catch(() => repoPaths.delete(k))
  }
  return p
}
async function gitDir(repo) {
  return (await paths(repo)).gitDir
}

async function repoState(repo) {
  const d = await gitDir(repo)
  if (existsSync(path.join(d, 'rebase-merge')) || existsSync(path.join(d, 'rebase-apply')))
    return 'rebase'
  if (existsSync(path.join(d, 'MERGE_HEAD'))) return 'merge'
  if (existsSync(path.join(d, 'CHERRY_PICK_HEAD'))) return 'cherry-pick'
  if (existsSync(path.join(d, 'REVERT_HEAD'))) return 'revert'
  return null
}

const norm = (p) => {
  const n = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? n.toLowerCase() : n
}

let wsCache = null
async function listWorkspaces(orca) {
  if (wsCache && Date.now() - wsCache.at < 10000) return wsCache.list
  const list = await listWorkspacesUncached(orca)
  wsCache = { at: Date.now(), list }
  return list
}
async function listWorkspacesUncached(orca) {
  if (!orca.host.has('workspace.list')) return []
  try {
    const { workspaces } = await orca.host.call('workspace.list', {})
    // local only: git runs on this machine
    return workspaces.filter((w) => !w.hostId || w.hostId === 'local')
  } catch {
    return []
  }
}

// The Orca CLI knows the exact focused worktree (`--worktree active`); the host API does not.
function orcaCli() {
  const exe = process.platform === 'win32' ? 'orca.exe' : 'orca'
  const dirs = [process.cwd(), path.dirname(process.execPath)]
  for (const d of dirs) {
    for (const p of [path.join(d, 'resources', 'bin', exe), path.join(d, '..', 'bin', exe)])
      if (existsSync(p)) return p
  }
  return 'orca' // on PATH
}
const ORCA_BIN = orcaCli()

/** Map terminal ids to their worktree paths with `orca terminal list --json` (cached briefly). */
let termCache = null
function terminalWorktrees() {
  if (termCache && Date.now() - termCache.at < 8000) return termCache.p
  const p = terminalWorktreesUncached()
  termCache = { at: Date.now(), p }
  p.then((m) => Object.keys(m).length || (termCache = null))
  return p
}
function forgetFocusCaches() {
  termCache = null
  wsCache = null
}
function terminalWorktreesUncached() {
  return new Promise((resolve) => {
    const child = spawn(ORCA_BIN, ['terminal', 'list', '--json'], { windowsHide: true, env: BASE_ENV })
    const out = []
    const timer = setTimeout(() => child.kill(), 5000)
    child.stdout.on('data', (d) => out.push(d))
    child.on('error', () => resolve({}))
    child.on('close', () => {
      clearTimeout(timer)
      const map = {}
      try {
        const list = JSON.parse(Buffer.concat(out).toString('utf8')).result?.terminals || []
        for (const t of list) {
          const local = !t.executionHostId || t.executionHostId === 'local'
          if (t.handle && t.worktreePath && local) map[t.handle] = t.worktreePath
        }
      } catch {}
      resolve(map)
    })
  })
}

// ---------- status & diff ----------

function parseStatus(raw) {
  const parts = raw.split('\0')
  const res = { branch: null, oid: null, upstream: null, ahead: 0, behind: 0, files: [] }
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i]
    if (!line) continue
    if (line.startsWith('# ')) {
      const [, key, ...rest] = line.split(' ')
      const val = rest.join(' ')
      if (key === 'branch.head') res.branch = val === '(detached)' ? null : val
      else if (key === 'branch.oid') res.oid = val === '(initial)' ? null : val
      else if (key === 'branch.upstream') res.upstream = val
      else if (key === 'branch.ab') {
        const m = val.match(/\+(\d+) -(\d+)/)
        if (m) [res.ahead, res.behind] = [+m[1], +m[2]]
      }
      continue
    }
    const kind = line[0]
    if (kind === '?') {
      res.files.push({ path: line.slice(2), x: '?', y: '?', untracked: true })
    } else if (kind === '1') {
      const f = line.split(' ')
      res.files.push({ path: f.slice(8).join(' '), x: f[1][0], y: f[1][1] })
    } else if (kind === '2') {
      const f = line.split(' ')
      const orig = parts[++i]
      res.files.push({ path: f.slice(9).join(' '), orig, x: f[1][0], y: f[1][1] })
    } else if (kind === 'u') {
      const f = line.split(' ')
      res.files.push({ path: f.slice(10).join(' '), x: f[1][0], y: f[1][1], conflict: true })
    }
  }
  return res
}

async function status(repo) {
  // One git process: --show-stash adds "# stash <n>" to the header (git 2.35+).
  const [raw, state, { gitDir: d, toplevel }, refsSig] = await Promise.all([
    git(repo, ['status', '--porcelain=v2', '--branch', '--show-stash', '-z', '--untracked-files=all']),
    repoState(repo),
    paths(repo),
    refsFingerprint(repo).catch(() => '') // any branch, tag or remote moving changes this
  ])
  const st = parseStatus(raw)
  const stashCount = +(raw.match(/(?:^|\0)# stash (\d+)/)?.[1] || 0)
  const bisect = existsSync(path.join(d, 'BISECT_LOG'))
  return { ...st, state, stashCount, toplevel, bisect, refsSig }
}

async function diff(repo, { file, staged, untracked, context = 3 }) {
  const f = String(file)
  if (untracked) {
    const out = await git(repo, ['diff', '--no-color', '--no-index', '--', devNull(), f], {
      okCodes: [0, 1]
    })
    return trunc(out)
  }
  const args = ['diff', '--no-color', `-U${+context || 3}`]
  if (staged) args.push('--cached')
  args.push('--', f)
  return trunc(await git(repo, args))
}
const devNull = () => (process.platform === 'win32' ? 'NUL' : '/dev/null')

// ---------- log ----------

const SEP = '\x1f'
const REC = '\x1e'

// ---------- shared cache: worktrees of one repository share history ----------
// Every worktree of a repository has the same commits and refs, so their log and commit details
// are cached once per repository (its common git dir). A cheap fingerprint of all refs tells when
// the cache is stale; only "which commit is HEAD" differs per worktree and is applied afterwards.
const commonDirs = new Map()
async function commonDir(repo) {
  const k = norm(repo)
  if (!commonDirs.has(k)) {
    const d = (await git(repo, ['rev-parse', '--git-common-dir'])).trim()
    commonDirs.set(k, norm(path.resolve(repo, d)))
  }
  return commonDirs.get(k)
}
/** Share an answer for a moment: one refresh asks the same question several times. */
const shortMemo = new Map()
function memo(key, ms, fn) {
  const hit = shortMemo.get(key)
  if (hit && Date.now() - hit.at < ms) return hit.p
  const p = fn()
  shortMemo.set(key, { at: Date.now(), p })
  p.catch(() => shortMemo.delete(key))
  if (shortMemo.size > 200) shortMemo.delete(shortMemo.keys().next().value)
  return p
}
function refsFingerprint(repo) {
  return memo('fp|' + repo, 300, async () => {
    const raw = await git(repo, ['for-each-ref', '--format=%(objectname) %(refname)'])
    return createHash('sha1').update(raw).digest('hex')
  })
}
/** HEAD's commit and branch (null when detached or before the first commit), in one git call. */
function headInfo(repo) {
  return memo('head|' + repo, 300, async () => {
    const out = await git(repo, ['rev-parse', 'HEAD', '--abbrev-ref', 'HEAD', '--'], { okCodes: [0] }).catch(() => '') // no commits yet: nothing
    const [oid, name] = out.trim().split(/\s+/)
    return { oid: /^[0-9a-f]{40}$/.test(oid || '') ? oid : null, branch: name && name !== 'HEAD' ? name : null }
  })
}
const logCache = new Map() // key -> { sig, commits }
const showCache = new Map() // common|hash -> details (commits never change)
function remember(map, key, value, max) {
  map.delete(key)
  map.set(key, value)
  if (map.size > max) map.delete(map.keys().next().value)
  return value
}

/** Move the "HEAD" decoration onto this worktree's HEAD commit. */
async function applyHead(repo, commits) {
  const { oid: head, branch } = await headInfo(repo).catch(() => ({ oid: null, branch: null }))
  return commits.map((c) => {
    let refs = c.refs.filter((r) => r !== 'HEAD').map((r) => (r.startsWith('HEAD -> ') ? r.slice(8) : r))
    if (c.hash === head) {
      if (branch) refs = [`HEAD -> ${branch}`, ...refs.filter((r) => r !== branch)]
      else refs = ['HEAD', ...refs]
    }
    return refs === c.refs ? c : { ...c, refs }
  })
}

async function log(repo, opts = {}) {
  // Search results and single-file history are not shared; the plain graph is.
  const shareable = !opts.search && !opts.file
  if (!shareable) return logUncached(repo, opts)
  const [common, sig] = await Promise.all([commonDir(repo), refsFingerprint(repo)])
  // The current-branch view depends on this worktree's HEAD; the all-branches view does not.
  const headKey = opts.all ? '' : (await headInfo(repo)).oid || ''
  const key = JSON.stringify([common, !!opts.all, opts.ref || '', headKey, +opts.limit || 200, +opts.skip || 0])
  const hit = logCache.get(key)
  let commits
  if (hit && hit.sig === sig) commits = hit.commits
  else commits = remember(logCache, key, { sig, commits: await logUncached(repo, opts) }, 60).commits
  return applyHead(repo, commits)
}

async function logUncached(repo, { all = false, limit = 200, skip = 0, search = '', mode = 'message', ref, file } = {}) {
  const args = [
    'log',
    '--date-order', // newest first across branches: a compact graph, as Git Extensions shows
    `--max-count=${Math.min(+limit || 200, 1000)}`,
    `--skip=${+skip || 0}`,
    `--format=%H${SEP}%P${SEP}%an${SEP}%ae${SEP}%at${SEP}%D${SEP}%s${REC}`
  ]
  const q = String(search || '')
  if (q && mode === 'author') args.push(`--author=${q}`, '-i', '--fixed-strings')
  else if (q && mode === 'content') args.push(`-S${q}`)
  else if (q && mode === 'hash') args.push('--no-walk', req(q, 'hash'))
  else if (q && mode !== 'file') args.push(`--grep=${q}`, '-i', '--fixed-strings')
  if (file) args.push('--follow')
  // Stashes are listed in the Stash tab; in the graph their internal commits are only noise.
  if (all && mode !== 'hash') args.push('--exclude=refs/stash', '--all')
  else if (ref) args.push(req(ref, 'ref'))
  args.push('--')
  if (file) args.push(String(file))
  else if (q && mode === 'file') args.push(`*${q}*`)
  let raw
  try {
    raw = await git(repo, args)
  } catch (e) {
    if (/does not have any commits|bad default revision|unknown revision/.test(e.message)) return []
    throw e
  }
  return raw
    .split(REC)
    .map((r) => r.replace(/^\n/, ''))
    .filter(Boolean)
    .map((r) => {
      const [hash, parents, author, email, time, refs, subject] = r.split(SEP)
      return {
        hash,
        parents: parents ? parents.split(' ') : [],
        author,
        email,
        time: +time,
        refs: refs ? refs.split(', ') : [],
        subject
      }
    })
}

async function commitShow(repo, args) {
  const key = (await commonDir(repo)) + '|' + req(args.hash, 'hash')
  const hit = showCache.get(key)
  if (hit && /^[0-9a-f]{40}$/.test(args.hash)) {
    // refs move; read the current ones (cheap) instead of trusting the cache
    const refs = (await git(repo, ['log', '-1', '--format=%D', hit.hash])).trim()
    return { ...hit, refs: refs ? refs.split(', ') : [] }
  }
  const out = await commitShowUncached(repo, args)
  if (!/^[0-9a-f]{40}$/.test(args.hash)) return out
  remember(showCache, key, out, 400)
  return out
}

async function commitShowUncached(repo, { hash }) {
  const h = req(hash, 'hash')
  const meta = await git(repo, [
    'show',
    '-s',
    `--format=%H${SEP}%P${SEP}%an${SEP}%ae${SEP}%at${SEP}%cn${SEP}%ct${SEP}%D${SEP}%B`,
    h
  ])
  const [full, parents, author, email, atime, committer, ctime, refs, body] = meta.split(SEP)
  // A merge commit has no single diff; like Git Extensions, show it against its first parent.
  const parentList = parents ? parents.split(' ') : []
  const target = parentList.length > 1 ? [parentList[0], h] : ['--root', h]
  const [numstat, nameStatus] = await Promise.all([
    git(repo, ['diff-tree', '--no-commit-id', '-r', '-M', '--numstat', '-z', ...target]),
    git(repo, ['diff-tree', '--no-commit-id', '-r', '-M', '--name-status', '-z', ...target])
  ])
  // name-status -z: STATUS\0path\0 (or STATUS\0old\0new\0 for renames)
  const ns = nameStatus.split('\0').filter((x) => x !== '')
  const filesOut = []
  for (let i = 0; i < ns.length; ) {
    const st = ns[i++]
    if (st[0] === 'R' || st[0] === 'C') {
      filesOut.push({ status: st[0], orig: ns[i++], path: ns[i++] })
    } else filesOut.push({ status: st[0], path: ns[i++] })
  }
  // numstat -z: "add\tdel\tpath\0" or "add\tdel\t\0old\0new\0"
  const nm = numstat.split('\0')
  const stats = {}
  for (let i = 0; i < nm.length; i++) {
    const m = nm[i].match(/^(\S+)\t(\S+)\t(.*)$/)
    if (!m) continue
    let p = m[3]
    if (!p) {
      i++
      p = nm[++i]
    }
    stats[p] = { add: m[1], del: m[2] }
  }
  for (const f of filesOut) Object.assign(f, stats[f.path] || {})
  return {
    hash: full,
    parents: parents ? parents.split(' ') : [],
    author,
    email,
    time: +atime,
    committer,
    ctime: +ctime,
    refs: refs ? refs.split(', ') : [],
    message: body.trim(),
    files: filesOut
  }
}

async function commitFileDiff(repo, { hash, file }) {
  const h = req(hash, 'hash')
  const out = await git(repo, [
    'show',
    '--no-color',
    '--format=',
    '-M',
    '--diff-merges=first-parent', // merges: the diff against the first parent
    h,
    '--',
    String(file)
  ])
  return trunc(out)
}

// ---------- branches & tags ----------

const refsCache = new Map() // repo -> { sig, value }
async function refs(repo) {
  const [sig, head] = await Promise.all([refsFingerprint(repo), headInfo(repo)])
  const key = sig + '|' + (head.branch || head.oid)
  const hit = refsCache.get(repo)
  if (hit && hit.key === key) return hit.value
  const value = await refsUncached(repo)
  remember(refsCache, repo, { key, value }, 30)
  return value
}

async function refsUncached(repo) {
  const fmt = [
    '%(refname)',
    '%(refname:short)',
    '%(objectname:short)',
    '%(upstream:short)',
    '%(upstream:track,nobracket)',
    '%(HEAD)',
    '%(committerdate:unix)',
    '%(subject)'
  ].join(SEP)
  const raw = await git(repo, [
    'for-each-ref',
    `--format=${fmt}`,
    '--sort=-committerdate',
    'refs/heads',
    'refs/remotes',
    'refs/tags'
  ])
  const local = []
  const remote = []
  const tags = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    const [full, name, hash, upstream, track, head, date, subject] = line.split(SEP)
    const item = { name, hash, date: +date, subject }
    if (full.startsWith('refs/heads/')) {
      const ahead = +(track.match(/ahead (\d+)/)?.[1] || 0)
      const behind = +(track.match(/behind (\d+)/)?.[1] || 0)
      local.push({ ...item, upstream, ahead, behind, gone: track === 'gone', current: head === '*' })
    } else if (full.startsWith('refs/remotes/')) {
      if (full.endsWith('/HEAD')) continue
      remote.push(item)
    } else tags.push(item)
  }
  return { local, remote, tags }
}

async function push(repo, { force = false, tags = false, remote, branch } = {}) {
  const st = parseStatus(await git(repo, ['status', '--porcelain=v2', '--branch', '-z']))
  const b = branch || st.branch
  if (!b) throw new GitError('HEAD is detached; check out a branch to push')
  const args = ['push']
  if (force) args.push('--force-with-lease')
  if (tags) args.push('--follow-tags')
  if (!st.upstream || branch) {
    const remotes = (await git(repo, ['remote'])).split('\n').filter(Boolean)
    const r = remote || (remotes.includes('origin') ? 'origin' : remotes[0])
    if (!r) throw new GitError('this repository has no remote; add one in Settings → Remotes')
    args.push('-u', r, b)
  }
  return git(repo, args, net)
}

// ---------- worktrees ----------

async function worktrees(repo) {
  const raw = await git(repo, ['worktree', 'list', '--porcelain'])
  const list = []
  let cur = null
  for (const line of raw.split('\n')) {
    if (!line) {
      if (cur) list.push(cur)
      cur = null
      continue
    }
    const sp = line.indexOf(' ')
    const key = sp < 0 ? line : line.slice(0, sp)
    const val = sp < 0 ? '' : line.slice(sp + 1)
    if (key === 'worktree') cur = { path: val, branch: null, head: null }
    else if (!cur) continue
    else if (key === 'HEAD') cur.head = val
    else if (key === 'branch') cur.branch = val.replace(/^refs\/heads\//, '')
    else if (key === 'detached') cur.detached = true
    else if (key === 'bare') cur.bare = true
    else if (key === 'locked') cur.locked = val || true
    else if (key === 'prunable') cur.prunable = val || true
  }
  if (cur) list.push(cur)
  const top = norm((await git(repo, ['rev-parse', '--show-toplevel'])).trim())
  list.forEach((w, i) => {
    w.main = i === 0
    w.current = norm(w.path) === top
  })
  return list
}

async function worktreeAdd(repo, { path: p, branch, newBranch, base, detach }) {
  const target = req(p, 'path')
  const args = ['worktree', 'add']
  if (detach) args.push('--detach')
  if (newBranch) args.push('-b', req(newBranch, 'branch name'))
  args.push(path.resolve(repo, target))
  if (newBranch && base) args.push(req(base, 'base'))
  else if (branch) args.push(req(branch, 'branch'))
  return git(repo, args, net)
}

// ---------- config ----------

async function configList(repo, { scope }) {
  const s = scope === 'global' ? '--global' : '--local'
  const raw = await git(scope === 'global' ? undefined : repo, ['config', s, '--list', '-z'], {
    okCodes: [0, 1] // exit 1 when the global file does not exist yet
  })
  return raw
    .split('\0')
    .filter(Boolean)
    .map((e) => {
      const nl = e.indexOf('\n')
      return nl < 0 ? { key: e, value: '' } : { key: e.slice(0, nl), value: e.slice(nl + 1) }
    })
}

const CONFIG_KEY = /^[a-z0-9][a-z0-9-]*(\.[^\s=]+)*\.[a-z][a-z0-9-]*$/i

async function configSet(repo, { scope, key, value }) {
  const k = req(key, 'key')
  if (!CONFIG_KEY.test(k)) throw new GitError(`"${k}" is not a valid config key`)
  const s = scope === 'global' ? '--global' : '--local'
  return git(scope === 'global' ? undefined : repo, ['config', s, k, String(value ?? '')])
}

async function configUnset(repo, { scope, key }) {
  const k = req(key, 'key')
  const s = scope === 'global' ? '--global' : '--local'
  return git(scope === 'global' ? undefined : repo, ['config', s, '--unset-all', k], {
    okCodes: [0, 5]
  })
}

// ---------- stash ----------

async function stashList(repo) {
  const raw = await git(repo, ['stash', 'list', `--format=%gd${SEP}%H${SEP}%ct${SEP}%gs`])
  return raw
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [ref, hash, time, subject] = l.split(SEP)
      return { ref, hash, time: +time, subject }
    })
}
const stashRef = (r) => {
  if (!/^stash@\{\d+\}$/.test(String(r))) throw new GitError('invalid stash ref')
  return r
}

// ---------- helpers for external CLIs ----------

/** Run any program; resolves { code, stdout, stderr }. `shell` is needed for .cmd shims on Windows. */
function runProc(bin, args, { cwd, input, timeout = 60_000, shell = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, shell, windowsHide: true, env: BASE_ENV })
    const out = []
    const err = []
    const timer = setTimeout(() => child.kill(), timeout)
    child.stdout.on('data', (d) => out.push(d))
    child.stderr.on('data', (d) => err.push(d))
    child.on('error', (e) => resolve({ code: -1, stdout: '', stderr: e.message }))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input ?? '')
  })
}

// ---------- full-tab graph ----------

const TAB_FILE = '.orca-git-graph.gitgraph'

/**
 * Keep Git Graph tab files (this one and the "untitled.gitgraph" the + menu creates) out of
 * `git status` in every worktree of the repo, through .git/info/exclude: never committed or shared.
 */
async function ignoreGraphFiles(repo) {
  const common = path.resolve(repo, (await git(repo, ['rev-parse', '--git-common-dir'])).trim())
  const exclude = path.join(common, 'info', 'exclude')
  mkdirSync(path.dirname(exclude), { recursive: true })
  const cur = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  if (!cur.split(/\r?\n/).includes('*.gitgraph'))
    writeFileSync(exclude, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + '# Orca Git Extension tabs\n*.gitgraph\n')
}

/**
 * Write the tab's marker file (ignored by git) and open it as an Orca editor tab. With `focus: false`
 * the tab opens in its worktree in the background, without changing what the person is looking at.
 */
async function openGraphTab(repo, { focus = true } = {}) {
  const top = (await git(repo, ['rev-parse', '--show-toplevel'])).trim()
  const file = path.join(top, TAB_FILE)
  writeFileSync(file, JSON.stringify({ repo: top }) + '\n')
  await ignoreGraphFiles(top)
  const r = await runProc(ORCA_BIN, ['file', 'open', file, '--worktree', `path:${top}`, ...(focus ? ['--focus'] : []), '--json'], {
    timeout: 15_000
  })
  let res = null
  try {
    res = JSON.parse(r.stdout)
  } catch {}
  if (!res?.ok) throw new GitError(res?.error?.message || r.stderr.trim() || 'Orca could not open the tab')
  return { opened: true }
}

// ---------- AI ----------

const AI = {
  claude: { bin: 'claude', args: ['-p', '--output-format', 'text'], shell: false, name: 'Claude Code' },
  codex: { bin: 'codex', args: ['exec', '--skip-git-repo-check', '-'], shell: process.platform === 'win32', name: 'Codex' }
}

async function aiCommitMessage(repo, agent, { instructions = '', scope: want = 'auto' } = {}) {
  const a = AI[agent] || AI.claude
  let diff = want === 'all' ? '' : await git(repo, ['diff', '--cached', '--no-color', '-U2'])
  let scope = 'staged changes'
  if (want === 'staged' && !diff.trim()) throw new GitError('Nothing is staged')
  if (!diff.trim()) {
    diff = await git(repo, ['diff', 'HEAD', '--no-color', '-U2'], { okCodes: [0, 128] })
    scope = 'all uncommitted changes'
  }
  if (!diff.trim()) throw new GitError('There are no changes to describe')
  const recent = await git(repo, ['log', '-8', '--format=%s'], { okCodes: [0, 128] }).catch(() => '')
  const prompt = [
    `Write a git commit message for the ${scope} below.`,
    'Rules: one subject line under 72 characters in the imperative mood; if the change is not trivial,',
    'add a blank line and a short body of bullet points. Match the style of the recent commits when there are any.',
    'Output ONLY the commit message: no quotes, no code fences, no explanations.',
    String(instructions).trim() ? `Extra instructions from the user: ${String(instructions).trim()}` : '',
    recent.trim() ? `\nRecent commits:\n${recent.trim()}` : '',
    `\nDiff:\n${diff.length > 60_000 ? diff.slice(0, 60_000) + '\n… (diff truncated)' : diff}`
  ].join('\n')
  const r = await runProc(a.bin, a.args, { cwd: repo, input: prompt, timeout: 100_000, shell: a.shell })
  if (r.code !== 0) {
    const why = r.code === -1 ? `${a.name} CLI (${a.bin}) was not found on PATH` : r.stderr.trim().split('\n').slice(-3).join('\n')
    throw new GitError(why || `${a.name} failed`)
  }
  return r.stdout
    .trim()
    .replace(/^```[a-z]*\n?|```$/g, '')
    .replace(/^["']|["']$/g, '')
    .trim()
}

/** Open a terminal in the repo's Orca workspace running the agent with a conflict-resolution prompt. */
async function aiResolve(orca, repo, agent) {
  const a = AI[agent] || AI.claude
  const ws = (await listWorkspaces(orca)).find((w) => norm(w.path) === norm(repo))
  if (!ws) throw new GitError('This repository is not an Orca workspace, so a terminal cannot be opened for it')
  const state = await repoState(repo)
  const conflicted = (await git(repo, ['diff', '--name-only', '--diff-filter=U'])).trim().split('\n').filter(Boolean)
  const op = state || 'merge'
  const prompt =
    `A git ${op} is in progress in this repository and ${conflicted.length || 'some'} file${conflicted.length === 1 ? ' has' : 's have'} conflicts (run git status to list them). ` +
    'Resolve every conflict by understanding what both sides intended and keeping both changes where possible. ' +
    'Remove all conflict markers, make sure the code still builds, then stage the resolved files with git add. ' +
    `Do not commit and do not run git ${op} --continue or --abort; I will review and continue myself.`
  // The command goes through the terminal's shell: keep only plain characters (no quotes, %, $, \).
  const safe = prompt.replace(/[^\w .,:;()'\/-]/g, ' ')
  const command = a.bin === 'codex' ? `codex "${safe}"` : `claude "${safe}"`
  const { terminalId } = await orca.host.call('terminal.create', {
    workspaceId: ws.id,
    title: `AI ${op} (${a.name})`,
    command
  })
  return { terminalId, agent: a.name }
}

// ---------- merge requests (GitHub pull requests, GitLab merge requests) ----------

/** Where a remote lives: host, project path, and which service it is. */
function parseRemote(url) {
  let m = String(url).match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/)
  if (!m) m = String(url).match(/^(?:ssh:\/\/)?[^@]+@([^:/]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/)
  if (!m) return null
  const host = m[1].replace(/:\d+$/, '')
  const kind = /github/i.test(host) ? 'github' : /gitlab/i.test(host) ? 'gitlab' : 'gitlab' // self-hosted GitLab is the common case
  return { host, path: m[2], kind, web: `https://${host}/${m[2]}` }
}

const toolOk = (bin, args) => runProc(bin, args, { timeout: 15_000 }).then((r) => r.code === 0, () => false)

async function mrInfo(repo, target) {
  const { oid, branch } = await headInfo(repo)
  if (!branch) throw new GitError('Check out the branch you want to merge first (HEAD is detached)')
  const remotes = (await git(repo, ['remote'])).split(/\s+/).filter(Boolean)
  const upstream = (await git(repo, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`], { okCodes: [0, 128] }).catch(() => '')).trim()
  const remote = upstream.split('/')[0] || (remotes.includes('origin') ? 'origin' : remotes[0])
  if (!remote) throw new GitError('This repository has no remote to open a merge request on')
  const where = parseRemote((await git(repo, ['remote', 'get-url', remote])).trim())
  if (!where) throw new GitError('Could not tell where the remote is hosted')
  const targetName = String(target).replace(new RegExp(`^${remote}/`), '')
  const targetRef = (await git(repo, ['rev-parse', '--verify', '-q', `refs/remotes/${remote}/${targetName}`], { okCodes: [0, 1] })).trim()
    ? `${remote}/${targetName}`
    : targetName
  const commits = (await git(repo, ['log', '--format=%s', '-50', `${targetRef}..HEAD`], { okCodes: [0, 128] }).catch(() => ''))
    .split('\n')
    .filter(Boolean)
  const ahead = upstream ? +(await git(repo, ['rev-list', '--count', `${upstream}..HEAD`]).catch(() => '0')).trim() : null
  const tools = {}
  if (where.kind === 'github') {
    tools.cli = 'gh'
    tools.installed = await toolOk('gh', ['--version'])
    tools.signedIn = tools.installed && (await toolOk('gh', ['auth', 'status', '--hostname', where.host]))
  } else {
    tools.cli = 'glab'
    tools.installed = await toolOk('glab', ['--version'])
    tools.signedIn = tools.installed && (await toolOk('glab', ['auth', 'status', '--hostname', where.host]))
  }
  tools.canInstall = process.platform === 'win32' && (await toolOk('winget', ['--version']))
  return { source: branch, oid, target: targetName, remote, upstream: upstream || null, needsPush: !upstream || ahead > 0, ...where, commits, tools }
}

/** The service's own "new merge request" page, prefilled: works with nothing installed. */
function mrWebUrl(info, { title, body }) {
  const seg = (b) => encodeURIComponent(b).replace(/%2F/g, '/') // branch names keep their slashes in a path
  const q = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  if (info.kind === 'github')
    return `${info.web}/compare/${seg(info.target)}...${seg(info.source)}?${q({ expand: '1', title, body })}`
  return `${info.web}/-/merge_requests/new?${q({
    'merge_request[source_branch]': info.source,
    'merge_request[target_branch]': info.target,
    'merge_request[title]': title,
    'merge_request[description]': body
  })}`
}

/** Open a web page in the person's default browser (the worker is not limited to a click like frames are). */
function openInBrowser(url) {
  if (!/^https:\/\//.test(url) || process.env.GITX_NO_BROWSER) return Promise.resolve(false) // tests keep the browser closed
  const [bin, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]] // no shell, so "&" in the URL is safe
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]]
  return runProc(bin, args, { timeout: 10_000 }).then((r) => r.code === 0 || r.code === null, () => false)
}

/**
 * Push the branch if needed, then either
 * - web: open the service's prefilled "new merge request" page in the browser, or
 * - direct: create it with the service's CLI (gh / glab), signed in once.
 */
async function mrCreate(repo, { target, title, body, draft, web }) {
  const info = await mrInfo(repo, req(target, 'target branch'))
  if (info.source === info.target) throw new GitError('Pick a different branch to merge into')
  title = String(title || '').trim()
  body = String(body || '')
  if (!web && !info.tools.signedIn) throw new GitError(`${info.tools.cli} is not set up yet`)
  if (info.needsPush) await git(repo, ['push', '-u', info.remote, info.source], net)
  if (web) {
    const url = mrWebUrl(info, { title, body })
    return { url, opened: await openInBrowser(url), pushed: info.needsPush }
  }
  if (!title) throw new GitError('A title is required')
  const r =
    info.kind === 'github'
      ? await runProc('gh', ['pr', 'create', '--base', info.target, '--head', info.source, '--title', title, '--body', body, ...(draft ? ['--draft'] : [])], { cwd: repo, timeout: 90_000 })
      : await runProc('glab', ['mr', 'create', '--source-branch', info.source, '--target-branch', info.target, '--title', title, '--description', body, '--yes', ...(draft ? ['--draft'] : [])], { cwd: repo, timeout: 90_000 })
  const all = r.stdout + '\n' + r.stderr
  const url = all.match(/https?:\/\/\S+\/(?:pull|merge_requests)\/\d+/)?.[0]
  if (r.code === 0 && url) return { created: true, url, pushed: info.needsPush }
  if (url && /already exists/i.test(all)) return { created: false, exists: true, url, pushed: info.needsPush }
  throw new GitError(all.trim().split('\n').slice(-4).join('\n') || `${info.tools.cli} could not create it`)
}

/** Set up one-click merge requests in an Orca terminal, where any prompt (a browser sign-in, a token) is visible. */
async function mrSetup(orca, repo, { step }) {
  const info = await mrInfo(repo, 'HEAD').catch(() => null)
  const host = info?.host || 'gitlab.com'
  const commands = {
    'glab-install': 'winget install --id GLab.GLab -e --accept-package-agreements --accept-source-agreements',
    'glab-login': `glab auth login --hostname ${host}`,
    'gh-install': 'winget install --id GitHub.cli -e --accept-package-agreements --accept-source-agreements',
    'gh-login': `gh auth login --hostname ${host} --web --git-protocol https`
  }
  const command = commands[step]
  if (!command) throw new GitError('unknown setup step')
  if (!/^[\w.:-]+$/.test(host)) throw new GitError('unexpected host name')
  const ws = (await listWorkspaces(orca)).find((w) => norm(w.path) === norm(repo))
  if (!ws || !orca.host.has('terminal.create')) return { ran: false, command }
  await orca.host.call('terminal.create', { workspaceId: ws.id, title: 'Merge request setup', command })
  return { ran: true, command }
}

// ---------- review inbox: pull/merge requests waiting for you, across every repository ----------

/** Every GitLab host the person's Orca workspaces push to (GitHub is always github.com). */
async function gitlabHosts(orca) {
  return memo('gitlabHosts', 60_000, async () => {
    const hosts = new Set()
    const ws = orca ? await listWorkspaces(orca) : []
    await Promise.all(
      ws.slice(0, 60).map(async (w) => {
        const url = (await git(w.path, ['remote', 'get-url', 'origin']).catch(() => '')).trim()
        const r = url && parseRemote(url)
        if (r && r.kind === 'gitlab') hosts.add(r.host)
      })
    )
    return [...hosts]
  })
}

const jsonOf = (r) => {
  try {
    return JSON.parse(r.stdout)
  } catch {
    return null
  }
}

async function githubInbox() {
  const fields = 'number,title,url,repository,author,updatedAt,isDraft'
  const [rev, asg] = await Promise.all([
    runProc('gh', ['search', 'prs', '--review-requested=@me', '--state=open', '--json', fields, '--limit', '50'], { timeout: 30_000 }),
    runProc('gh', ['search', 'prs', '--assignee=@me', '--state=open', '--json', fields, '--limit', '50'], { timeout: 30_000 })
  ])
  if (rev.code !== 0 && asg.code !== 0) throw new GitError((rev.stderr || asg.stderr).trim() || 'gh could not list pull requests')
  const items = new Map()
  const add = (list, role) => {
    for (const p of list || []) {
      const it = items.get(p.url) || {
        provider: 'github',
        host: 'github.com',
        url: p.url,
        number: p.number,
        title: p.title,
        repo: p.repository?.nameWithOwner || p.repository?.name || '',
        author: p.author?.login || '',
        updated: Date.parse(p.updatedAt) / 1000,
        draft: !!p.isDraft,
        roles: []
      }
      it.roles.push(role)
      items.set(p.url, it)
    }
  }
  add(jsonOf(rev), 'review')
  add(jsonOf(asg), 'assigned')
  return [...items.values()]
}

async function gitlabInbox(host) {
  const api = (path, extra = []) => runProc('glab', ['api', '--hostname', host, ...extra, path], { timeout: 30_000 })
  const me = jsonOf(await api('user'))
  if (!me?.username) throw new GitError(`glab is not signed in to ${host}`)
  const q = 'merge_requests?state=opened&scope=all&per_page=50'
  const [rev, asg] = await Promise.all([api(`${q}&reviewer_username=${encodeURIComponent(me.username)}`), api(`${q}&assignee_username=${encodeURIComponent(me.username)}`)])
  const items = new Map()
  const add = (list, role) => {
    for (const m of Array.isArray(list) ? list : []) {
      const it = items.get(m.web_url) || {
        provider: 'gitlab',
        host,
        url: m.web_url,
        number: m.iid,
        projectId: m.project_id,
        title: m.title,
        repo: m.references?.full?.replace(/!\d+$/, '') || '',
        author: m.author?.username || '',
        source: m.source_branch,
        target: m.target_branch,
        updated: Date.parse(m.updated_at) / 1000,
        draft: !!(m.draft || m.work_in_progress),
        roles: []
      }
      it.roles.push(role)
      items.set(m.web_url, it)
    }
  }
  add(jsonOf(rev), 'review')
  add(jsonOf(asg), 'assigned')
  return [...items.values()]
}

async function reviewsList(orca) {
  const providers = []
  const items = []
  const errors = []
  // GitHub
  const ghInstalled = await toolOk('gh', ['--version'])
  const ghIn = ghInstalled && (await toolOk('gh', ['auth', 'status', '--hostname', 'github.com']))
  providers.push({ provider: 'github', host: 'github.com', cli: 'gh', installed: ghInstalled, signedIn: ghIn })
  // GitLab hosts used by the person's projects
  const glabInstalled = await toolOk('glab', ['--version'])
  for (const host of await gitlabHosts(orca)) {
    const signedIn = glabInstalled && (await toolOk('glab', ['auth', 'status', '--hostname', host]))
    providers.push({ provider: 'gitlab', host, cli: 'glab', installed: glabInstalled, signedIn })
  }
  providers.forEach((p) => (p.canInstall = process.platform === 'win32'))
  await Promise.all(
    providers
      .filter((p) => p.signedIn)
      .map((p) =>
        (p.provider === 'github' ? githubInbox() : gitlabInbox(p.host)).then(
          (list) => items.push(...list),
          (e) => errors.push(`${p.host}: ${e.message}`)
        )
      )
  )
  items.sort((a, b) => b.updated - a.updated)
  await Promise.all(items.slice(0, 25).map(async (it) => (it.ci = await reviewCi(it).catch(() => null))))
  return { items, providers, errors }
}

/** Approve, request changes or comment on a pull/merge request. */
async function reviewAct({ provider, host, url, projectId, number, action, body }) {
  const text = String(body || '').trim()
  if (!['approve', 'changes', 'comment'].includes(action)) throw new GitError('unknown review action')
  if (provider === 'github') {
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(String(url))) throw new GitError('not a GitHub pull request link')
    if (action !== 'approve' && !text) throw new GitError('Write a comment first')
    const flag = { approve: '--approve', changes: '--request-changes', comment: '--comment' }[action]
    const r = await runProc('gh', ['pr', 'review', url, flag, ...(text ? ['--body', text] : [])], { timeout: 60_000 })
    if (r.code !== 0) throw new GitError((r.stderr || r.stdout).trim() || 'gh could not submit the review')
    return { ok: true }
  }
  if (!/^[\w.-]+$/.test(String(host)) || !Number.isInteger(+projectId) || !Number.isInteger(+number)) throw new GitError('bad merge request')
  const base = `projects/${+projectId}/merge_requests/${+number}`
  const api = (path, extra) => runProc('glab', ['api', '--hostname', host, '-X', 'POST', ...extra, path], { timeout: 60_000 })
  if (text) {
    const r = await api(`${base}/notes`, ['-f', `body=${action === 'changes' ? `**Changes requested**\n\n${text}` : text}`])
    if (r.code !== 0) throw new GitError((r.stderr || r.stdout).trim() || 'could not post the comment')
  }
  if (action === 'approve') {
    const r = await api(`${base}/approve`, [])
    if (r.code !== 0) throw new GitError((r.stderr || r.stdout).trim() || 'could not approve')
  } else if (action === 'changes') {
    await api(`${base}/unapprove`, []) // takes back an earlier approval, if any
  } else if (!text) throw new GitError('Write a comment first')
  return { ok: true }
}

/** A pull/merge request's title, description and diff, from its service. */
async function reviewMaterial({ provider, host, url, projectId, number }) {
  if (provider === 'github') {
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(String(url))) throw new GitError('not a GitHub pull request link')
    const [view, diff] = await Promise.all([
      runProc('gh', ['pr', 'view', url, '--json', 'title,body,baseRefName,headRefName,headRefOid'], { timeout: 60_000 }),
      runProc('gh', ['pr', 'diff', url], { timeout: 90_000 })
    ])
    if (diff.code !== 0) throw new GitError(diff.stderr.trim() || 'gh could not read the diff')
    const v = jsonOf(view) || {}
    return { title: v.title || '', body: v.body || '', source: v.headRefName, target: v.baseRefName, diff: diff.stdout, headSha: v.headRefOid }
  }
  if (!/^[\w.-]+$/.test(String(host)) || !Number.isInteger(+projectId) || !Number.isInteger(+number)) throw new GitError('bad merge request')
  const r = await runProc('glab', ['api', '--hostname', host, `projects/${+projectId}/merge_requests/${+number}/changes`], { timeout: 90_000 })
  const m = jsonOf(r)
  if (!m) throw new GitError(r.stderr.trim() || 'glab could not read the merge request')
  const diff = (m.changes || [])
    .map((c) => `diff --git a/${c.old_path} b/${c.new_path}\n--- a/${c.old_path}\n+++ b/${c.new_path}\n${c.diff}`)
    .join('\n')
  return { title: m.title || '', body: m.description || '', source: m.source_branch, target: m.target_branch, diff, diffRefs: m.diff_refs }
}

/** Review a pull/merge request with the AI agent: summary, issues with file and line, a verdict. */
async function aiReview(input, agent) {
  const a = AI[agent] || AI.claude
  const mat = await reviewMaterial(input)
  if (!mat.diff.trim()) throw new GitError('This request has no changes to review')
  const diff = mat.diff.length > 90_000 ? mat.diff.slice(0, 90_000) + '\n… (diff truncated)' : mat.diff
  const prompt = [
    'You are a careful senior engineer reviewing a pull request. Review the diff below.',
    'Write the review as Markdown with exactly these parts:',
    '1. A first line "Verdict: APPROVE", "Verdict: REQUEST CHANGES" or "Verdict: COMMENT".',
    '2. "## Summary": two or three sentences on what the change does and whether it is sound.',
    '3. "## Issues": real problems only (bugs, security, data loss, broken edge cases), each as',
    '   "- `path:line` problem, then the suggested fix". Write "None found." when there are none.',
    '4. "## Suggestions": optional smaller improvements, at most five. Omit the section when there are none.',
    'Be specific and brief. Do not praise. Do not restate the diff. Output only the review.',
    String(input.instructions || '').trim() ? `Extra instructions from the reviewer: ${String(input.instructions).trim()}` : '',
    `\nTitle: ${mat.title}`,
    mat.source ? `Branches: ${mat.source} -> ${mat.target}` : '',
    mat.body.trim() ? `\nDescription:\n${mat.body.trim().slice(0, 4000)}` : '',
    `\nDiff:\n${diff}`
  ].join('\n')
  const r = await runProc(a.bin, a.args, { cwd: os.tmpdir(), input: prompt, timeout: 110_000, shell: a.shell })
  if (r.code !== 0) {
    const why = r.code === -1 ? `${a.name} CLI (${a.bin}) was not found on PATH` : r.stderr.trim().split('\n').slice(-3).join('\n')
    throw new GitError(why || `${a.name} failed`)
  }
  const text = r.stdout.trim().replace(/^```(?:markdown)?\n?|```$/g, '').trim()
  const v = text.match(/^\s*\**verdict:?\**\s*(approve|request changes|comment)/im)?.[1]?.toLowerCase()
  const verdict = v === 'approve' ? 'approve' : v === 'request changes' ? 'changes' : 'comment'
  // the verdict line is for the person; the posted review starts at the summary
  const review = text.replace(/^\s*\**verdict:?\**.*\n+/i, '').trim()
  return { review, verdict, title: mat.title }
}

// ---------- AI: merge request title and description ----------
async function aiMrDescription(repo, { target, instructions }, agent) {
  const a = AI[agent] || AI.claude
  const info = await mrInfo(repo, req(target, 'target branch'))
  const remoteTarget = `${info.remote}/${info.target}`
  const base = (await git(repo, ['rev-parse', '--verify', '-q', `refs/remotes/${remoteTarget}`], { okCodes: [0, 1] })).trim() ? remoteTarget : info.target
  let diff = await git(repo, ['diff', '--no-color', '-U2', `${base}...HEAD`]).catch(() => '')
  if (!diff.trim() && !info.commits.length) throw new GitError(`${info.source} has no changes compared with ${info.target}`)
  if (diff.length > 80_000) diff = diff.slice(0, 80_000) + '\n… (diff truncated)'
  const prompt = [
    `Write the title and description for a ${info.kind === 'github' ? 'GitHub pull request' : 'GitLab merge request'} from ${info.source} into ${info.target}.`,
    'Output format, exactly:',
    'Line 1: the title, under 72 characters, no prefix like "Title:".',
    'Line 2: empty.',
    'Then a Markdown description with "## Summary" (two or three sentences: what and why) and "## Changes" (short bullets).',
    'Add "## Testing" only if the diff shows tests or clear manual steps. No other text, no code fences.',
    String(instructions || '').trim() ? `Extra instructions: ${String(instructions).trim()}` : '',
    info.commits.length ? `\nCommits:\n${info.commits.map((c) => `- ${c}`).join('\n')}` : '',
    `\nDiff:\n${diff}`
  ].join('\n')
  const r = await runProc(a.bin, a.args, { cwd: repo, input: prompt, timeout: 110_000, shell: a.shell })
  if (r.code !== 0) throw new GitError(r.code === -1 ? `${a.name} CLI (${a.bin}) was not found on PATH` : r.stderr.trim().split('\n').slice(-3).join('\n') || `${a.name} failed`)
  const out = r.stdout.trim().replace(/^```(?:markdown)?\n?|```$/g, '').trim()
  const [first, ...rest] = out.split(/\r?\n/)
  return { title: first.replace(/^(title:\s*|#+\s*)/i, '').trim(), body: rest.join('\n').trim() }
}

// ---------- CI / pipeline status ----------
const CI_STATE = (s) => {
  s = String(s || '').toLowerCase()
  if (['failure', 'failed', 'error', 'timed_out', 'action_required', 'startup_failure'].includes(s)) return 'failed'
  if (['success', 'passed', 'neutral', 'skipped', 'completed'].includes(s)) return 'passed'
  if (['canceled', 'cancelled'].includes(s)) return 'canceled'
  if (s) return 'running'
  return null
}
function rollup(states) {
  const list = states.map(CI_STATE).filter(Boolean)
  if (!list.length) return null
  if (list.includes('failed')) return 'failed'
  if (list.includes('running')) return 'running'
  if (list.every((x) => x === 'canceled')) return 'canceled'
  return 'passed'
}
async function ciStatus(repo, { ref = 'HEAD' } = {}) {
  const sha = (await git(repo, ['rev-parse', '--verify', '-q', req(ref, 'ref')], { okCodes: [0, 1] })).trim()
  if (!sha) return { state: null }
  const remotes = (await git(repo, ['remote'])).split(/\s+/).filter(Boolean)
  const remote = remotes.includes('origin') ? 'origin' : remotes[0]
  if (!remote) return { state: null }
  const where = parseRemote((await git(repo, ['remote', 'get-url', remote])).trim())
  if (!where) return { state: null }
  return memo(`ci|${where.host}|${where.path}|${sha}`, 45_000, async () => {
    if (where.kind === 'github') {
      const [runs, st] = await Promise.all([
        runProc('gh', ['api', `repos/${where.path}/commits/${sha}/check-runs`, '--jq', '[.check_runs[] | (.conclusion // .status)]'], { timeout: 30_000 }),
        runProc('gh', ['api', `repos/${where.path}/commits/${sha}/status`, '--jq', '[.statuses[].state]'], { timeout: 30_000 })
      ])
      if (runs.code !== 0 && st.code !== 0) return { state: null, reason: 'gh' }
      const state = rollup([...(jsonOf(runs) || []), ...(jsonOf(st) || [])])
      return { state, sha, url: `https://github.com/${where.path}/commit/${sha}/checks` }
    }
    const r = await runProc('glab', ['api', '--hostname', where.host, `projects/${encodeURIComponent(where.path)}/repository/commits/${sha}`], { timeout: 30_000 })
    const c = jsonOf(r)
    if (!c) return { state: null, reason: 'glab' }
    return { state: CI_STATE(c.last_pipeline?.status), sha, url: c.last_pipeline?.web_url || `${where.web}/-/commit/${sha}` }
  })
}
/** CI state of one review item (pull/merge request head). */
async function reviewCi(it) {
  if (it.provider === 'github') {
    const r = await runProc('gh', ['pr', 'view', it.url, '--json', 'statusCheckRollup', '--jq', '[.statusCheckRollup[] | (.conclusion // .state // .status)]'], { timeout: 30_000 })
    return r.code === 0 ? rollup(jsonOf(r) || []) : null
  }
  const r = await runProc('glab', ['api', '--hostname', it.host, `projects/${+it.projectId}/merge_requests/${+it.number}`], { timeout: 30_000 })
  return CI_STATE(jsonOf(r)?.head_pipeline?.status)
}

// ---------- line comments on a pull/merge request ----------
async function reviewLineComment(it, { path: file, line, side, body }) {
  const text = String(body || '').trim()
  if (!text) throw new GitError('Write a comment first')
  if (!Number.isInteger(+line) || +line < 1) throw new GitError('bad line')
  const mat = await reviewMaterial(it)
  if (it.provider === 'github') {
    const repoPath = String(it.url).match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)$/)
    if (!repoPath) throw new GitError('not a GitHub pull request link')
    const r = await runProc('gh', ['api', `repos/${repoPath[1]}/pulls/${repoPath[2]}/comments`, '-f', `body=${text}`, '-f', `commit_id=${mat.headSha}`, '-f', `path=${file}`, '-F', `line=${+line}`, '-f', `side=${side === 'old' ? 'LEFT' : 'RIGHT'}`], { timeout: 60_000 })
    if (r.code !== 0) throw new GitError((r.stderr || r.stdout).trim() || 'could not post the comment')
    return { ok: true }
  }
  const d = mat.diffRefs || {}
  const args = ['api', '--hostname', it.host, '-X', 'POST', `projects/${+it.projectId}/merge_requests/${+it.number}/discussions`, '-f', `body=${text}`, '-f', 'position[position_type]=text', '-f', `position[base_sha]=${d.base_sha}`, '-f', `position[start_sha]=${d.start_sha}`, '-f', `position[head_sha]=${d.head_sha}`, '-f', `position[new_path]=${file}`, '-f', `position[old_path]=${file}`, '-F', `position[${side === 'old' ? 'old_line' : 'new_line'}]=${+line}`]
  const r = await runProc('glab', args, { timeout: 60_000 })
  if (r.code !== 0) throw new GitError((r.stderr || r.stdout).trim() || 'could not post the comment')
  return { ok: true }
}

// ---------- files in the working tree (conflict resolution) ----------
async function workPath(repo, file) {
  const { toplevel } = await paths(repo)
  const top = path.resolve(toplevel)
  const p = path.resolve(top, String(file))
  if (!(p + path.sep).startsWith(top + path.sep) && p !== top) throw new GitError('That file is outside the repository')
  return p
}

// ---------- operations exposed to the panel ----------

const ops = {
  status: (r) => status(r),
  diff: (r, a) => diff(r, a),
  stage: (r, a) => git(r, ['add', '-A', '--', ...files(a.files)]),
  stageAll: (r) => git(r, ['add', '-A']),
  unstage: async (r, a) => {
    const hasHead = await git(r, ['rev-parse', '--verify', '-q', 'HEAD'], { okCodes: [0, 1] })
    return hasHead.trim()
      ? git(r, ['restore', '--staged', '--', ...files(a.files)])
      : git(r, ['rm', '--cached', '-r', '-q', '--', ...files(a.files)])
  },
  unstageAll: async (r) => {
    const hasHead = await git(r, ['rev-parse', '--verify', '-q', 'HEAD'], { okCodes: [0, 1] })
    return hasHead.trim() ? git(r, ['reset', '-q']) : git(r, ['rm', '--cached', '-r', '-q', '.'])
  },
  discard: async (r, a) => {
    const tracked = a.files || []
    const untracked = a.untracked || []
    // from the index, so staged parts of the same file survive (and newly added files work)
    if (tracked.length) await git(r, ['restore', '--worktree', '--', ...tracked])
    if (untracked.length) await git(r, ['clean', '-f', '-d', '--', ...untracked])
    return ''
  },
  useSide: async (r, a) => {
    const side = a.side === 'theirs' ? '--theirs' : '--ours'
    await git(r, ['checkout', side, '--', String(a.file)])
    return git(r, ['add', '--', String(a.file)])
  },
  commit: async (r, a) => {
    const args = ['commit', '-F', '-']
    if (a.amend) args.push('--amend')
    if (a.signoff) args.push('--signoff')
    if (a.all) args.push('-a')
    if (a.allowEmpty) args.push('--allow-empty')
    const msg = String(a.message || '')
    if (!msg.trim()) throw new GitError('commit message is empty')
    const out = await git(r, args, { input: msg })
    if (a.push) await push(r, {})
    return out
  },
  lastMessage: (r) => git(r, ['log', '-1', '--format=%B'], { okCodes: [0, 128] }),

  log: (r, a) => log(r, a),
  commitShow: (r, a) => commitShow(r, a),
  commitFileDiff: (r, a) => commitFileDiff(r, a),

  refs: (r) => refs(r),
  checkout: async (r, a) => {
    let ref = req(a.ref, 'ref')
    let local = null
    if (a.track) {
      // origin/x when a local x already exists: switch to the local branch (as Git Extensions does)
      // and report how the two compare, so the panel can offer a fast-forward.
      const name = ref.replace(/^[^/]+\//, '')
      const exists = (await git(r, ['rev-parse', '--verify', '-q', `refs/heads/${name}`], { okCodes: [0, 1] })).trim()
      if (exists) {
        const [behind, ahead] = (await git(r, ['rev-list', '--left-right', '--count', `${ref}...${name}`])).trim().split(/\s+/).map(Number)
        local = { name, remote: ref, ahead, behind }
        ref = name
        a = { ...a, track: false }
      }
    }
    const args = ['switch']
    if (a.discard) args.push('--discard-changes')
    else if (a.merge) args.push('--merge')
    // A remote branch: create a local tracking branch with the same name.
    if (a.track) args.push('--track')
    else if (a.detach) args.push('--detach')
    args.push(ref)
    let stashed = false
    if (a.stash) {
      const dirty = (await git(r, ['status', '--porcelain'])).trim()
      if (dirty) {
        await git(r, ['stash', 'push', '--include-untracked', '-m', `Auto stash before switching to ${ref}`])
        stashed = true
      }
    }
    try {
      await git(r, args)
    } catch (e) {
      if (stashed) await git(r, ['stash', 'pop']).catch(() => {})
      const inUse = e.message.match(/(?:already (?:checked out|used by worktree) at|is already used by worktree at) '([^']+)'/)
      if (inUse) throw Object.assign(new GitError(`${ref} is checked out in another worktree:\n${inUse[1]}`), { data: { kind: 'in-worktree', path: inUse[1] } })
      if (/would be overwritten|Please commit your changes or stash them/i.test(e.message))
        throw Object.assign(new GitError('You have changes that this checkout would overwrite.'), { data: { kind: 'dirty' } })
      throw e
    }
    if (stashed) {
      try {
        await git(r, ['stash', 'pop'])
      } catch {
        return { switched: true, stashKept: true, local } // conflicts: the stash stays for the person to apply
      }
    }
    return { switched: true, stashed, local }
  },
  branchCreate: (r, a) => {
    const name = req(a.name, 'branch name')
    const args = a.checkout ? ['switch', '-c', name] : ['branch', name]
    if (a.start) args.push(req(a.start, 'start point'))
    return git(r, args)
  },
  branchRename: (r, a) => git(r, ['branch', '-m', req(a.from, 'branch'), req(a.to, 'new name')]),
  branchDelete: (r, a) => git(r, ['branch', a.force ? '-D' : '-d', req(a.name, 'branch')]),
  remoteBranchDelete: (r, a) =>
    git(r, ['push', req(a.remote, 'remote'), '--delete', req(a.name, 'branch')], net),
  setUpstream: (r, a) =>
    git(r, ['branch', `--set-upstream-to=${req(a.upstream, 'upstream')}`, req(a.branch, 'branch')]),
  merge: (r, a) => {
    const args = ['merge']
    if (a.squash) args.push('--squash')
    else if (a.noFf) args.push('--no-ff')
    else if (a.ffOnly) args.push('--ff-only')
    if (a.noCommit && !a.squash) args.push('--no-commit')
    args.push(req(a.ref, 'ref'))
    return git(r, args)
  },
  rebase: (r, a) => git(r, ['rebase', req(a.onto, 'branch')]),
  abort: async (r) => {
    const s = await repoState(r)
    if (!s) throw new GitError('nothing to abort')
    return git(r, [s, '--abort'])
  },
  continue: async (r) => {
    const s = await repoState(r)
    if (!s) throw new GitError('nothing to continue')
    // core.editor=true keeps git from opening an editor for the merge message
    return git(r, ['-c', 'core.editor=true', s, '--continue'])
  },
  skip: async (r) => {
    const s = await repoState(r)
    if (s !== 'rebase' && s !== 'cherry-pick' && s !== 'revert')
      throw new GitError('skip only applies to rebase, cherry-pick or revert')
    return git(r, [s, '--skip'])
  },
  // noCommit applies the change without committing; a merge commit is picked or reverted against its first parent.
  cherryPick: (r, a) =>
    git(r, ['cherry-pick', ...(a.noCommit ? ['-n'] : []), ...(a.mainline ? ['-m', '1'] : []), req(a.hash, 'hash')]),
  revert: (r, a) =>
    git(r, ['revert', a.noCommit ? '-n' : '--no-edit', ...(a.mainline ? ['-m', '1'] : []), req(a.hash, 'hash')]),
  /** How two refs compare: commits only in `a` (ahead) and only in `b` (behind). */
  aheadBehind: async (r, a) => {
    const [ahead, behind] = (await git(r, ['rev-list', '--left-right', '--count', `${req(a.a, 'first ref')}...${req(a.b, 'second ref')}`])).trim().split(/\s+/).map(Number)
    return { ahead, behind }
  },
  reset: (r, a) => {
    const mode = ['soft', 'mixed', 'hard', 'keep', 'merge'].includes(a.mode) ? a.mode : 'mixed'
    return git(r, ['reset', `--${mode}`, req(a.hash, 'commit')])
  },
  /** A fixup! or squash! commit of the staged changes, for a later autosquash rebase. */
  fixupCommit: (r, a) => git(r, ['commit', `--${a.kind === 'squash' ? 'squash' : 'fixup'}=${req(a.hash, 'commit')}`, '--no-edit']),
  tagCreate: (r, a) => {
    const args = ['tag']
    if (a.message) args.push('-a', '-m', String(a.message))
    args.push(req(a.name, 'tag name'))
    if (a.hash) args.push(req(a.hash, 'commit'))
    return git(r, args)
  },
  tagDelete: (r, a) => git(r, ['tag', '-d', req(a.name, 'tag')]),
  tagPush: (r, a) => git(r, ['push', req(a.remote || 'origin', 'remote'), `refs/tags/${req(a.name, 'tag')}`], net),

  fetch: (r, a = {}) => git(r, ['fetch', '--all', ...(a.prune === false ? [] : ['--prune'])], net),
  pull: (r, a = {}) =>
    git(r, ['pull', a.rebase ? '--rebase' : a.ffOnly ? '--ff-only' : '--no-rebase'], net),
  push: (r, a) => push(r, a),

  stashList: (r) => stashList(r),
  stashSave: (r, a = {}) => {
    const args = ['stash', 'push']
    if (a.untracked) args.push('--include-untracked')
    if (a.keepIndex) args.push('--keep-index')
    if (a.message) args.push('-m', String(a.message))
    return git(r, args)
  },
  stashApply: (r, a) =>
    git(r, ['stash', 'apply', '--index', stashRef(a.ref)]).catch((e) => {
      // conflicts in the files themselves: report them; only an index-only failure retries without --index
      if (!/Conflicts in index|could not restore index|--index/i.test(e.message)) throw e
      return git(r, ['stash', 'apply', stashRef(a.ref)])
    }),
  stashPop: (r, a) => git(r, ['stash', 'pop', stashRef(a.ref)]),
  stashDrop: (r, a) => git(r, ['stash', 'drop', stashRef(a.ref)]),
  stashShow: async (r, a) =>
    trunc(await git(r, ['stash', 'show', '-p', '--include-untracked', '--no-color', stashRef(a.ref)]).catch(
      () => git(r, ['stash', 'show', '-p', '--no-color', stashRef(a.ref)])
    )),

  worktrees: (r) => worktrees(r),
  worktreeAdd: (r, a) => worktreeAdd(r, a),
  worktreeRemove: async (r, a) => {
    const p = req(a.path, 'path')
    const listed = async () => (await worktrees(r)).find((x) => norm(x.path) === norm(p)) || null
    const w = await listed()
    if (!w) return { removed: true, alreadyGone: true } // removed elsewhere meanwhile: nothing to do
    if (w.main) throw new GitError('The main worktree cannot be removed')
    const reasons = []
    const done = async (extra = {}) => {
      // Git's own list is the truth: never report success while git still has the worktree.
      let still = await listed()
      if (still?.prunable || (still && !existsSync(path.join(p, '.git')))) {
        await git(r, ['worktree', 'prune']).catch(() => {})
        still = await listed()
      }
      if (still) throw new GitError(`Git still lists this worktree.\n${reasons.join('\n') || 'It may be locked or in use by another program.'}`)
      if (a.deleteBranch && w.branch) await git(r, ['branch', a.force ? '-D' : '-d', w.branch]).catch(() => {})
      return { removed: true, leftover: existsSync(p), ...extra }
    }
    // A worktree whose folder is gone or no longer linked ("missing"): drop its stale record.
    // Files left in the folder are not touched.
    if (w.prunable) return done({ pruned: true })

    // A worktree Orca shows as a workspace: let Orca remove it first. It stops the workspace's
    // terminals (on Windows git cannot delete a folder a terminal is still in) and drops it from the sidebar.
    if (ORCA && (await listWorkspaces(ORCA)).some((x) => norm(x.path) === norm(p))) {
      const cli = ['worktree', 'rm', '--worktree', `path:${p}`, '--json']
      if (a.force) cli.push('--force')
      const res = await runProc(ORCA_BIN, cli, { timeout: 60_000 })
      forgetFocusCaches()
      let out = null
      try {
        out = JSON.parse(res.stdout)
      } catch {}
      const msg = out?.ok ? '' : out?.error?.message || res.stderr.trim()
      if (!a.force && /modified|untracked|dirty|uncommitted|changes/i.test(msg))
        throw new GitError(`${msg}\nTick "Force" to remove it anyway.`)
      if (msg) reasons.push(`Orca: ${msg}`)
      if (!(await listed())) return done({ viaOrca: true })
      // Orca dropped its record (or could not find it) but git still has the worktree: git removes it.
    }
    const args = ['worktree', 'remove']
    if (a.force) args.push('--force')
    if (a.force && w.locked) args.push('--force') // a locked worktree needs it twice
    try {
      await git(r, [...args, p])
    } catch (e) {
      if (!a.force && /modified|untracked|use --force/i.test(e.message)) throw e // the panel offers "remove anyway"
      reasons.push(`git: ${e.message}`)
    }
    return done()
  },
  worktreePrune: (r) => git(r, ['worktree', 'prune', '-v']),
  worktreeLock: (r, a) => git(r, ['worktree', a.unlock ? 'unlock' : 'lock', req(a.path, 'path')]),

  remotes: async (r) => {
    const raw = await git(r, ['remote', '-v'])
    const map = {}
    for (const line of raw.split('\n')) {
      const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
      if (m) (map[m[1]] ||= { name: m[1] })[m[3]] = m[2]
    }
    return Object.values(map)
  },
  remoteAdd: (r, a) => git(r, ['remote', 'add', req(a.name, 'name'), req(a.url, 'url')]),
  remoteRemove: (r, a) => git(r, ['remote', 'remove', req(a.name, 'name')]),
  remoteSetUrl: (r, a) => git(r, ['remote', 'set-url', req(a.name, 'name'), req(a.url, 'url')]),

  configList: (r, a) => configList(r, a),
  configSet: (r, a) => configSet(r, a),
  configUnset: (r, a) => configUnset(r, a),

  ciStatus: (r, a) => ciStatus(r, a),
  readWorkFile: async (r, a) => {
    const p = await workPath(r, a.file)
    const buf = readFileSync(p)
    if (buf.length > 4 * 1024 * 1024) throw new GitError('The file is too large to resolve here')
    return buf.toString('utf8')
  },
  writeWorkFile: async (r, a) => {
    const p = await workPath(r, a.file)
    writeFileSync(p, String(a.text ?? ''))
    if (a.stage) await git(r, ['add', '--', String(a.file)])
    return ''
  },
  branchCleanup: async (r) => {
    const head = await headInfo(r)
    let base = (await git(r, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'], { okCodes: [0, 1] })).trim().replace(/^origin\//, '')
    const locals = (await git(r, ['for-each-ref', '--format=%(refname:short)%09%(upstream:track)', 'refs/heads'])).split('\n').filter(Boolean).map((l) => l.split('\t'))
    const names = locals.map(([n]) => n)
    if (!base || !names.includes(base)) base = ['main', 'master', 'develop', 'dev'].find((b) => names.includes(b)) || head.branch
    const keep = new Set([head.branch, base].filter(Boolean))
    const merged = base ? (await git(r, ['branch', '--merged', base, '--format=%(refname:short)'])).split('\n').filter((b) => b && !keep.has(b)) : []
    const gone = locals.filter(([n, t]) => t === '[gone]' && !keep.has(n)).map(([n]) => n)
    return { base, current: head.branch, merged, gone }
  },
  branchDeleteMany: async (r, a) => {
    const results = []
    for (const name of a.names || []) {
      const n = req(name, 'branch')
      try {
        await git(r, ['branch', a.force?.includes(n) ? '-D' : '-d', n])
        results.push({ name: n, ok: true })
      } catch (e) {
        results.push({ name: n, ok: false, error: e.message.split('\n')[0] })
      }
    }
    return results
  },
  undoInfo: async (r) => {
    if (await repoState(r)) return { blocked: 'Finish or abort the operation in progress first' }
    const raw = await git(r, ['reflog', '-2', `--format=%H${SEP}%gs${SEP}%ct`], { okCodes: [0, 128] }).catch(() => '')
    const [now, prev] = raw.split('\n').filter(Boolean).map((l) => {
      const [hash, subject, time] = l.split(SEP)
      return { hash, subject, time: +time }
    })
    if (!now || !prev) return { blocked: 'Nothing to undo' }
    return { what: now.subject, at: now.time, to: prev.hash, mode: /^commit/.test(now.subject) ? 'soft' : 'keep' }
  },
  undoLast: async (r) => {
    const u = await ops.undoInfo(r)
    if (u.blocked) throw new GitError(u.blocked)
    await git(r, ['reset', `--${u.mode}`, u.to])
    return u
  },
  init: (_r, a) => git(req(a.path, 'path'), ['init']),
  clone: async (_r, a) => {
    const url = req(a.url, 'url')
    const dir = path.resolve(req(a.path, 'folder'))
    mkdirSync(path.dirname(dir), { recursive: true })
    await git(path.dirname(dir), ['clone', ...(a.recursive ? ['--recurse-submodules'] : []), url, dir], net)
    return dir
  },

  // Hunks: the panel sends a patch made of one file header and one hunk.
  applyPatch: (r, a) => {
    const args = ['apply', '--recount', '--whitespace=nowarn']
    if (a.cached) args.push('--cached')
    if (a.reverse) args.push('--reverse')
    args.push('-')
    return git(r, args, { input: String(a.patch || '') })
  },
  ignore: (r, a) => {
    const file = path.join(r, '.gitignore')
    const cur = existsSync(file) ? readFileSync(file, 'utf8') : ''
    const line = String(a.pattern || '').trim()
    if (!line) throw new GitError('pattern is required')
    if (!cur.split(/\r?\n/).includes(line)) writeFileSync(file, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + line + '\n')
    return ''
  },

  blame: async (r, a) => {
    const args = ['blame', '--porcelain']
    if (a.rev) args.push(req(a.rev, 'revision'))
    args.push('--', String(a.file))
    const raw = await git(r, args)
    const meta = {}
    const lines = []
    let cur = null
    for (const l of raw.split('\n')) {
      if (/^[0-9a-f]{40} \d+ \d+/.test(l)) cur = meta[l.slice(0, 40)] ||= { hash: l.slice(0, 40) }
      else if (l.startsWith('\t')) lines.push({ h: cur.hash, t: l.slice(1) })
      else if (cur) {
        const sp = l.indexOf(' ')
        const k = l.slice(0, sp)
        const v = l.slice(sp + 1)
        if (k === 'author') cur.author = v
        else if (k === 'author-time') cur.time = +v
        else if (k === 'summary') cur.summary = v
      }
    }
    return { commits: meta, lines: lines.slice(0, 20000) }
  },
  showFile: async (r, a) => trunc(await git(r, ['show', `${req(a.rev, 'revision')}:${String(a.file)}`])),
  treeFiles: async (r, a) =>
    (await git(r, ['ls-tree', '-r', '--name-only', '-z', req(a.rev, 'revision')])).split('\0').filter(Boolean).slice(0, 20000),

  compare: async (r, a) => {
    const x = req(a.a, 'first revision')
    const y = req(a.b, 'second revision')
    const ns = (await git(r, ['diff', '--name-status', '-M', '-z', x, y])).split('\0').filter((v) => v !== '')
    const files = []
    for (let i = 0; i < ns.length; ) {
      const st = ns[i++]
      if (st[0] === 'R' || st[0] === 'C') files.push({ status: st[0], orig: ns[i++], path: ns[i++] })
      else files.push({ status: st[0], path: ns[i++] })
    }
    const counts = (await git(r, ['rev-list', '--left-right', '--count', `${x}...${y}`]).catch(() => '0 0')).trim().split(/\s+/)
    return { files, behind: +counts[0] || 0, ahead: +counts[1] || 0 }
  },
  compareFileDiff: async (r, a) =>
    trunc(await git(r, ['diff', '--no-color', '-M', req(a.a, 'first revision'), req(a.b, 'second revision'), '--', String(a.file)])),

  reflog: async (r) => {
    const raw = await git(r, ['reflog', '-n', '300', `--format=%H${SEP}%gd${SEP}%gs${SEP}%ct`], { okCodes: [0, 128] })
    return raw
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash, ref, subject, time] = l.split(SEP)
        return { hash, ref, subject, time: +time }
      })
  },

  bisect: (r, a) => {
    const act = a.action
    if (!['start', 'good', 'bad', 'skip', 'reset'].includes(act)) throw new GitError('invalid bisect action')
    const args = ['bisect', act]
    if (a.rev && act !== 'reset') args.push(req(a.rev, 'revision'))
    return git(r, args)
  },

  cleanPreview: async (r, a) =>
    (await git(r, ['clean', '-n', '-d', ...(a.ignored ? ['-x'] : [])]))
      .split('\n')
      .filter(Boolean)
      .map((l) => l.replace(/^Would remove /, '')),
  clean: (r, a) => git(r, ['clean', '-f', '-d', ...(a.ignored ? ['-x'] : [])]),
  gc: async (r) => {
    await git(r, ['gc', '--quiet'], { timeout: 110_000 })
    return git(r, ['count-objects', '-vH'])
  },

  submodules: async (r) => {
    if (!existsSync(path.join((await paths(r)).toplevel, '.gitmodules'))) return []
    const raw = await git(r, ['submodule', 'status', '--recursive'], { okCodes: [0, 128] })
    const states = { ' ': 'ok', '+': 'changed', '-': 'not initialized', U: 'conflict' }
    return raw
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/^([ +\-U])([0-9a-f]+) (\S+)(?: \((.*)\))?/)
        return m ? { state: states[m[1]], hash: m[2], path: m[3], describe: m[4] || '' } : null
      })
      .filter(Boolean)
  },
  submoduleUpdate: (r) => git(r, ['submodule', 'update', '--init', '--recursive'], net),

  formatPatch: (r, a) => git(r, ['format-patch', '-1', '--stdout', req(a.hash, 'hash')]),
  rewordLast: (r, a) => {
    const msg = String(a.message || '')
    if (!msg.trim()) throw new GitError('message is empty')
    return git(r, ['commit', '--amend', '--only', '-F', '-'], { input: msg })
  },
  squashSince: async (r, a) => {
    const base = req(a.base, 'base commit')
    // exit 0 = ancestor; 1 = not (git() rejects on 1 since only 0 is ok)
    const isAncestor = await git(r, ['merge-base', '--is-ancestor', base, 'HEAD']).then(() => true, () => false)
    if (!isAncestor) throw new GitError('That commit is not in the current branch, so there is nothing to squash onto it')
    const msg = String(a.message || '')
    if (!msg.trim()) throw new GitError('message is empty')
    if ((await git(r, ['status', '--porcelain', '--untracked-files=no'])).trim())
      throw new GitError('Commit or stash your changes before squashing')
    await git(r, ['reset', '--soft', base])
    return git(r, ['commit', '-F', '-'], { input: msg })
  },
  rebaseTodo: async (r, a) => {
    const raw = await git(r, ['log', '--reverse', `--format=%H${SEP}%s`, `${req(a.base, 'base')}..HEAD`])
    return raw
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash, subject] = l.split(SEP)
        return { hash, subject }
      })
  },
  rebaseInteractive: (r, a) => {
    const base = req(a.base, 'base')
    const ACTIONS = new Set(['pick', 'squash', 'fixup', 'drop'])
    const todo = (a.todo || [])
      .map((t) => {
        if (!ACTIONS.has(t.action) || !/^[0-9a-f]{7,40}$/.test(t.hash)) throw new GitError('invalid rebase plan')
        return `${t.action} ${t.hash}`
      })
      .join('\n')
    if (!todo) throw new GitError('nothing to rebase')
    const file = path.join(os.tmpdir(), `orca-git-todo-${Date.now()}.txt`)
    writeFileSync(file, todo + '\n')
    // Git runs the sequence editor with the todo file's path; a tiny script copies our plan over it.
    const script = path.join(os.tmpdir(), 'orca-git-seq-editor.cjs')
    writeFileSync(script, "require('fs').copyFileSync(process.env.ORCA_GIT_TODO, process.argv[2])\n")
    const q = (p) => '"' + p.replace(/\\/g, '/') + '"'
    return git(r, ['-c', `sequence.editor=${q(process.execPath)} ${q(script)}`, '-c', 'core.editor=true', 'rebase', '-i', base], {
      env: { ELECTRON_RUN_AS_NODE: '1', ORCA_GIT_TODO: file }
    })
  }
}

const READ_ONLY_OPS = new Set([
  'status', 'diff', 'log', 'commitShow', 'commitFileDiff', 'refs', 'worktrees', 'stashList', 'stashShow', 'remotes',
  'configList', 'blame', 'showFile', 'treeFiles', 'compare', 'compareFileDiff', 'reflog', 'cleanPreview', 'submodules',
  'aheadBehind', 'rebaseTodo', 'lastMessage', 'formatPatch', 'ciStatus', 'readWorkFile', 'branchCleanup', 'undoInfo'
])
const NO_REPO_OK = new Set(['configList', 'configSet', 'configUnset', 'init', 'clone'])

let ORCA = null
export default function activate(orca) {
  ORCA = orca
  orca.panels.handle('git', async (input) => {
    const { op, repo } = input || {}
    const args = input?.args || {}
    const fn = ops[op]
    if (!fn) throw Object.assign(new Error(`unknown operation: ${op}`), { code: 'invalid_params' })
    const scopeGlobal = args.scope === 'global'
    if (!repo && !(NO_REPO_OK.has(op) && (scopeGlobal || op === 'init' || op === 'clone')))
      throw new GitError('no repository selected')
    if (READ_ONLY_OPS.has(op)) return fn(repo, args)
    // Anything that may change the repository: drop the shared short-lived answers before and after.
    shortMemo.clear()
    try {
      return await fn(repo, args)
    } finally {
      shortMemo.clear()
    }
  })

  // Find the repository for the focused Orca workspace, plus every local workspace for the picker.
  // Which repository the focused Orca workspace is.
  async function resolveFocused() {
    const workspaces = await listWorkspaces(orca)
    let focused = null
    let ctx = null
    try {
      ctx = await orca.host.call('workspace.readContext', {})
    } catch {}
    if (ctx) {
      // Best: a terminal of the focused workspace tells us its exact worktree path.
      if (ctx.terminals?.length) {
        const map = await terminalWorktrees()
        focused = ctx.terminals.map((t) => map[t.id]).find(Boolean) || null
      }
      // Otherwise match by name and branch, but only when that is unambiguous.
      if (!focused) {
        const hits = workspaces.filter((w) => w.name === ctx.displayName && w.branch === ctx.branch)
        if (hits.length === 1) focused = hits[0].path
      }
    }
    return { focused, workspaces }
  }
  orca.panels.handle('repo.resolve', () => resolveFocused())

  // Status bar: "⎇ branch ↑1 ↓2 • 3" for the focused worktree; pressing it opens Git Graph in a tab.
  orca.commands.register('openGraph', async () => {
    const { focused } = await resolveFocused()
    if (!focused) return 'No Git repository for the focused workspace'
    await openGraphTab(focused)
    return 'Opened Git Graph'
  })
  let lastBar = ''
  let barBusy = false // a slow git must not pile up overlapping polls
  async function updateStatusBar() {
    if (barBusy || !orca.host.has('statusBar.update')) return
    barBusy = true
    try {
      await updateStatusBarOnce()
    } finally {
      barBusy = false
    }
  }
  async function updateStatusBarOnce() {
    let item = { id: 'branch', text: 'Git', tone: 'neutral', tooltip: 'Open Git Graph', visible: true }
    try {
      const { focused } = await resolveFocused()
      if (!focused) item.visible = false
      else {
        const st = await status(focused)
        const parts = [st.branch || `detached ${(st.oid || '').slice(0, 7)}`]
        if (st.ahead) parts.push(`↑${st.ahead}`)
        if (st.behind) parts.push(`↓${st.behind}`)
        if (st.files.length) parts.push(`• ${st.files.length}`)
        const conflicts = st.files.some((f) => f.conflict)
        item = {
          ...item,
          text: parts.join(' '),
          tone: conflicts || st.state ? 'warning' : 'neutral',
          tooltip: `${path.basename(st.toplevel)}${st.state ? ` · ${st.state} in progress` : ''}
Click to open Git Graph`
        }
      }
    } catch {
      item.visible = false
    }
    const key = JSON.stringify(item)
    if (key === lastBar) return
    lastBar = key
    try {
      await orca.host.call('statusBar.update', item)
    } catch {}
  }
  updateStatusBar()
  setInterval(updateStatusBar, 4000)

  // Orca keeps editor tabs per workspace, so the Git Graph tab cannot follow the person from one
  // workspace to the next. Instead, each workspace they switch to gets its own Git Graph tab:
  // - they were looking at Git Graph when they switched: it opens and comes to the front;
  // - they were on anything else (a file, a terminal): it opens in the background once per Orca
  //   session, so their tab stays in front (closing it there is respected until Orca restarts).
  const keepOpen = async () => {
    try {
      return (await orca.host.call('settings.get', {})).settings.keepGraphOpen === true
    } catch {
      return false
    }
  }
  // Each Git Graph tab reports when it is shown or hidden. Switching workspaces hides the old one a
  // moment before Orca reports the switch, so "was on Git Graph" also covers a tab hidden just now.
  const SWITCH_WINDOW = 3000
  let graphShown = false
  let graphHiddenAt = 0
  orca.panels.handle('graph.visible', ({ visible } = {}) => {
    if (graphShown && !visible) graphHiddenAt = Date.now()
    graphShown = !!visible
    return { ok: true }
  })
  const graphOpenedIn = new Set()
  let lastFocused = null
  let opening = Promise.resolve()
  // Older Orca builds have no worker events; the rest of the plugin works without them.
  orca.events?.on?.('workspace.changed', () => {
    forgetFocusCaches() // a new focus: look it up again, and update the status bar now
    updateStatusBar()
    // Read before awaiting anything: the new workspace's own tab may report itself shown meanwhile.
    const wasOnGraph = graphShown || Date.now() - graphHiddenAt < SWITCH_WINDOW
    opening = opening.then(async () => {
      if (!(await keepOpen())) return
      const { focused } = await resolveFocused()
      if (!focused) return
      const key = focused.replace(/\\/g, '/').toLowerCase()
      // The event also fires when terminals open or close; only a real switch counts.
      const switched = lastFocused !== null && lastFocused !== key
      lastFocused = key
      if (switched && wasOnGraph) {
        graphOpenedIn.add(key)
        graphHiddenAt = 0
        return openGraphTab(focused, { focus: true }).catch((e) => orca.log(`Git Graph tab not focused: ${e.message}`))
      }
      // Not on Git Graph: leave the new project alone.
    })
    return opening
  })

  const agentSetting = async () => {
    try {
      return (await orca.host.call('settings.get', {})).settings.aiAgent || 'claude'
    } catch {
      return 'claude'
    }
  }
  orca.panels.handle('ai.commitMessage', async ({ repo, agent, instructions, scope } = {}) =>
    aiCommitMessage(req(repo, 'repo'), AI[agent] ? agent : await agentSetting(), { instructions, scope })
  )
  orca.panels.handle('ai.settings', async (input) => {
    const agent = input?.agent
    if (agent && AI[agent]) await orca.host.call('settings.set', { key: 'aiAgent', value: agent }).catch(() => {})
    const available = {}
    await Promise.all(
      Object.entries(AI).map(async ([k, v]) => {
        const r = await runProc(v.bin, ['--version'], { timeout: 8000, shell: v.shell })
        available[k] = r.code === 0
      })
    )
    return { agent: await agentSetting(), agents: Object.entries(AI).map(([id, v]) => ({ id, name: v.name, available: available[id] })) }
  })
  orca.panels.handle('ai.resolve', async ({ repo } = {}) => aiResolve(orca, req(repo, 'repo'), await agentSetting()))
  orca.panels.handle('repo.ignoreGraphFiles', async ({ repo } = {}) => ignoreGraphFiles(req(repo, 'repo')).then(() => ({ ok: true })))
  orca.panels.handle('mr.info', async ({ repo, target } = {}) => mrInfo(req(repo, 'repo'), target || 'HEAD'))
  orca.panels.handle('mr.create', async (input = {}) => {
    shortMemo.clear()
    return mrCreate(req(input.repo, 'repo'), input)
  })
  orca.panels.handle('mr.setup', async ({ repo, step } = {}) => mrSetup(orca, req(repo, 'repo'), { step }))
  orca.panels.handle('reviews.list', () => reviewsList(orca))
  orca.panels.handle('ai.review', async (input = {}) => aiReview(input, AI[input.agent] ? input.agent : await agentSetting()))
  orca.panels.handle('reviews.act', (input = {}) => reviewAct(input))
  orca.panels.handle('reviews.setup', async ({ host, step } = {}) => {
    // same terminal setup as the merge request dialog, for a host instead of a repository
    if (!/^[\w.:-]+$/.test(String(host || ''))) throw new GitError('unexpected host name')
    const commands = {
      'glab-install': 'winget install --id GLab.GLab -e --accept-package-agreements --accept-source-agreements',
      'glab-login': `glab auth login --hostname ${host}`,
      'gh-install': 'winget install --id GitHub.cli -e --accept-package-agreements --accept-source-agreements',
      'gh-login': 'gh auth login --hostname github.com --web --git-protocol https'
    }
    const command = commands[step]
    if (!command) throw new GitError('unknown setup step')
    const ws = (await listWorkspaces(orca))[0]
    if (!ws || !orca.host.has('terminal.create')) return { ran: false, command }
    await orca.host.call('terminal.create', { workspaceId: ws.id, title: 'Review inbox setup', command })
    return { ran: true, command }
  })
  orca.panels.handle('ai.mrDescription', async (input = {}) => aiMrDescription(req(input.repo, 'repo'), input, AI[input.agent] ? input.agent : await agentSetting()))
  orca.panels.handle('reviews.diff', async (input = {}) => {
    const m = await reviewMaterial(input)
    return { diff: m.diff.length > 1_500_000 ? m.diff.slice(0, 1_500_000) : m.diff, title: m.title }
  })
  orca.panels.handle('reviews.lineComment', async (input = {}) => reviewLineComment(input.item || {}, input))
  orca.panels.handle('ui.pending', () => {
    const p = pendingUi
    pendingUi = null
    return p
  })

  // Reviews in the status bar, and a desktop notification when a new request arrives.
  let pendingUi = null
  let knownReviews = null
  let reviewsBusy = false
  async function pollReviews() {
    if (reviewsBusy || !orca.host.has('statusBar.update')) return
    reviewsBusy = true
    try {
      const { items, providers } = await reviewsList(orca)
      if (!providers.some((p) => p.signedIn)) return orca.host.call('statusBar.update', { id: 'reviews', visible: false }).catch(() => {})
      const waiting = items.filter((i) => i.roles.includes('review') || i.roles.includes('assigned'))
      await orca.host.call('statusBar.update', {
        id: 'reviews',
        visible: waiting.length > 0,
        text: `${waiting.length} review${waiting.length === 1 ? '' : 's'}`,
        tone: waiting.length ? 'accent' : 'neutral',
        tooltip: waiting.slice(0, 5).map((i) => `${i.repo} ${i.provider === 'github' ? '#' : '!'}${i.number}: ${i.title}`).join('\n') + '\nClick to open Reviews'
      }).catch(() => {})
      const urls = new Set(waiting.map((i) => i.url))
      if (knownReviews && orca.host.has('notifications.show'))
        for (const i of waiting.filter((x) => !knownReviews.has(x.url)).slice(0, 3))
          await orca.host.call('notifications.show', { title: i.roles.includes('review') ? 'Review requested' : 'Assigned to you', body: `${i.repo} ${i.provider === 'github' ? '#' : '!'}${i.number}: ${i.title}` }).catch(() => {})
      knownReviews = urls
    } catch (e) {
      orca.log(`reviews poll: ${e.message}`)
    } finally {
      reviewsBusy = false
    }
  }
  setTimeout(pollReviews, 15_000)
  setInterval(pollReviews, 3 * 60_000)
  orca.commands.register('openReviews', async () => {
    pendingUi = { tab: 'reviews' }
    orca.panels.post?.('ui.show', { tab: 'reviews' })
    const { focused } = await resolveFocused()
    if (focused) await openGraphTab(focused)
    return 'Opened Reviews'
  })
  orca.panels.handle('tab.open', async ({ repo } = {}) => openGraphTab(req(repo, 'repo')))

  orca.panels.handle('repo.check', async ({ path: p } = {}) => {
    try {
      const top = (await git(req(p, 'path'), ['rev-parse', '--show-toplevel'])).trim()
      return { ok: true, toplevel: top }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // Show a worktree in Orca when Orca knows it as a workspace.
  orca.panels.handle('worktree.open', async ({ path: p } = {}) => {
    const ws = (await listWorkspaces(orca)).find((w) => norm(w.path) === norm(p))
    if (!ws || !orca.host.has('workspace.open')) return { opened: false }
    try {
      await orca.host.call('workspace.open', { workspaceId: ws.id })
      return { opened: true }
    } catch {
      return { opened: false } // e.g. workspace:write not granted on this Orca version
    }
  })
}
