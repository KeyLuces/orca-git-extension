// How fast the Pipelines tab loads, against a fake GitLab that answers like a company server:
// every request takes LATENCY ms, and the token is a personal access token (Bearer is refused, so a
// client that always tries Bearer first pays for two requests).
//   node tests/pipelines-perf.mjs            prints the timings and request counts
//   node tests/pipelines-perf.mjs --check    also fails when a load is slower than the budget
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')))
const LATENCY = 120
const CHECK = process.argv.includes('--check')
const W = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'gitx-pipeperf-'))
const gcfg = path.join(W, 'global.gitconfig')
fs.writeFileSync(gcfg, `[user]\n\tname = T\n\temail = t@e\n[credential]\n\thelper = "!f() { echo username=u; echo password=TESTTOKEN; }; f"\n[init]\n\tdefaultBranch = main\n`)
process.env.GIT_CONFIG_GLOBAL = gcfg
process.env.GIT_CONFIG_NOSYSTEM = '1'
process.env.GITX_NO_BROWSER = '1'
process.env.GITX_API_KIND = 'gitlab'
// gh/glab hidden: only the saved Git login is used
process.env.PATH = process.env.PATH.split(path.delimiter).filter((d) => !['gh.exe', 'glab.exe', 'gh', 'glab'].some((b) => fs.existsSync(path.join(d, b)))).join(path.delimiter)

// 50 pipelines; the first 3 still running
const now = Date.now()
const pipes = Array.from({ length: 50 }, (_, i) => ({ id: 1000 - i, status: i < 3 ? 'running' : i % 7 === 0 ? 'failed' : 'success', ref: i % 4 ? 'main' : `feature/f${i}`, sha: `abc${String(i).padStart(4, '0')}`, source: 'push', created_at: new Date(now - i * 600_000).toISOString(), updated_at: new Date(now - i * 600_000 + 300_000).toISOString(), web_url: `http://x/p/${1000 - i}` }))
let requests = 0
const server = http.createServer((rq, rs) => {
  requests++
  setTimeout(() => {
    const send = (code, obj) => (rs.writeHead(code, { 'Content-Type': 'application/json' }), rs.end(JSON.stringify(obj)))
    if (rq.headers['private-token'] !== 'TESTTOKEN') return send(401, { message: '401 Unauthorized' }) // a personal access token: no Bearer
    const u = rq.url.replace(/^\/api\/v4/, '').replace(/\?.*$/, '')
    let m
    if (/^\/projects\/[^/]+\/pipelines$/.test(u)) return send(200, pipes)
    if ((m = u.match(/^\/projects\/[^/]+\/pipelines\/(\d+)$/))) {
      const p = pipes.find((x) => x.id === +m[1])
      return send(200, { ...p, user: { username: 'ann', name: 'Ann' }, duration: 300, finished_at: p.updated_at, name: null, tag: false })
    }
    if ((m = u.match(/^\/projects\/[^/]+\/pipelines\/(\d+)\/jobs$/))) {
      const p = pipes.find((x) => x.id === +m[1])
      return send(200, ['build', 'test', 'deploy'].map((stage, k) => ({ id: +m[1] * 10 + k, stage, name: stage, status: p.status === 'running' && k === 2 ? 'running' : 'success' })))
    }
    if ((m = u.match(/^\/projects\/[^/]+\/repository\/commits\/(\w+)$/))) return send(200, { title: `Commit ${m[1]}` })
    send(404, { message: 'no route ' + u })
  }, LATENCY)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
process.env.GITX_API_BASE = `http://127.0.0.1:${port}/api/v4`

const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
const repo = path.join(W, 'repo')
g(W, 'init', '-q', repo)
fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n')
g(repo, 'add', '.')
g(repo, 'commit', '-qm', 'first')
g(repo, 'remote', 'add', 'origin', `http://127.0.0.1:${port}/group/proj.git`)

const handlers = {}
const orca = { panels: { handle: (n, f) => (handlers[n] = f), post() {} }, host: { has: () => false, call: async () => ({}) }, commands: { register() {} }, events: { on() {} }, log() {} }
const mod = await import(pathToFileURL(path.resolve(ROOT, '../worker/main.mjs')).href)
mod.default(orca)

const load = async (label, args = { all: true }) => {
  const r0 = requests
  const t0 = Date.now()
  const out = await handlers.git({ op: 'pipelines', repo, args })
  const ms = Date.now() - t0
  const full = out.items.filter((x) => x.stages?.length && x.commitTitle && x.by).length
  console.log(`${label.padEnd(34)} ${String(ms).padStart(5)} ms  ${String(requests - r0).padStart(3)} requests  ${out.items.length} pipelines, ${full} with stages/title/author`)
  return { ms, requests: requests - r0, out }
}
let fails = 0
try {
  const first = await load('first load (cold)')
  const again = await load('again (the tab refreshes)')
  const light = await load('list only (light)', { all: true, light: true })
  if (CHECK) {
    const budget = (name, v, max) => {
      const ok = v <= max
      if (!ok) fails++
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${v} (budget ${max})`)
    }
    budget('first load ms', first.ms, 2500)
    budget('refresh ms', again.ms, 1200)
    budget('refresh requests', again.requests, 12)
    budget('light list ms', light.ms, 600)
    const full = first.out.items.filter((x) => x.stages?.length && x.commitTitle && x.by).length
    budget('pipelines missing details on the first load', 25 - Math.min(25, full), 0)
  }
} catch (e) {
  fails++
  console.log('CRASH', e.stack)
}
server.close()
try {
  fs.rmSync(W, { recursive: true, force: true })
} catch {}
process.exit(fails ? 1 : 0)
