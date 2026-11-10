// GitHub search rate limit: node tests/github-ratelimit.mjs
// GitHub allows 30 searches a minute. The review list must not search for merged ones unless the All
// tab asks, must reuse an answer for 90 s, and once GitHub says "rate limit exceeded" must stop
// searching and keep showing the last list instead of an error.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')))
const W = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'gitx-ratelimit-'))
const gcfg = path.join(W, 'global.gitconfig')
fs.writeFileSync(gcfg, `[user]\n\tname = T\n\temail = t@e\n[credential]\n\thelper = "!f() { echo username=u; echo password=TESTTOKEN; }; f"\n[init]\n\tdefaultBranch = main\n`)
process.env.GIT_CONFIG_GLOBAL = gcfg
process.env.GIT_CONFIG_NOSYSTEM = '1'
process.env.GITX_NO_BROWSER = '1'
process.env.GITX_API_KIND = 'github'
process.env.PATH = process.env.PATH.split(path.delimiter).filter((d) => !['gh.exe', 'glab.exe', 'gh', 'glab'].some((b) => fs.existsSync(path.join(d, b)))).join(path.delimiter)

let searches = []
let limited = false
const server = http.createServer((rq, rs) => {
  const send = (code, obj, headers = {}) => (rs.writeHead(code, { 'Content-Type': 'application/json', ...headers }), rs.end(JSON.stringify(obj)))
  const u = new URL(rq.url, 'http://x')
  if (u.pathname === '/user') return send(200, { login: 'me' })
  if (u.pathname === '/search/issues') {
    searches.push(u.searchParams.get('q'))
    if (limited) return send(403, { message: 'API rate limit exceeded for user ID 1.' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60) })
    const merged = /is:merged/.test(u.searchParams.get('q'))
    return send(200, { items: [{ html_url: `https://github.com/o/r/pull/${merged ? 2 : 1}`, number: merged ? 2 : 1, title: merged ? 'Old one' : 'Review me', repository_url: 'https://api.github.com/repos/o/r', user: { login: 'ann' }, updated_at: new Date().toISOString(), state: merged ? 'closed' : 'open', pull_request: merged ? { merged_at: new Date().toISOString() } : {} }] })
  }
  send(404, { message: 'no route' })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
process.env.GITX_API_BASE = `http://127.0.0.1:${port}`

const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
const repo = path.join(W, 'repo')
g(W, 'init', '-q', repo)
fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n')
g(repo, 'add', '.')
g(repo, 'commit', '-qm', 'first')
g(repo, 'remote', 'add', 'origin', 'https://github.com/o/r.git')

const handlers = {}
const orca = { panels: { handle: (n, f) => (handlers[n] = f), post() {} }, host: { has: () => false, call: async () => ({}) }, commands: { register() {} }, events: { on() {} }, log() {} }
const mod = await import(pathToFileURL(path.resolve(ROOT, '../worker/main.mjs')).href)
mod.default(orca)

let fails = 0
const ok = (cond, name, extra = '') => {
  if (!cond) fails++
  console.log(`${cond ? 'PASS' : 'FAIL'} ratelimit ${name}${!cond && extra ? ' :: ' + extra : ''}`)
}
try {
  const a = await handlers['reviews.list']({ repo })
  ok(searches.length <= 4 && !searches.some((q) => /is:merged/.test(q)), 'the list searches 4 times at most, no merged ones', searches.join(' | '))
  ok(a.items.some((i) => i.number === 1) && !a.errors.length, 'it lists the open one', JSON.stringify(a.errors))
  searches = []
  await handlers['reviews.list']({ repo })
  ok(searches.length === 0, 'asked again within 90 s: no new search', searches.join(' | '))
  const m = await handlers['reviews.moreMerged']({ repo, page: 1 })
  ok(searches.length <= 2 && searches.every((q) => /is:merged/.test(q)), 'merged ones (the All tab): 2 searches', searches.join(' | '))
  ok(m.items.some((i) => i.number === 2 && i.state === 'merged'), 'the merged one is listed')
  // GitHub now says the limit is reached
  limited = true
  searches = []
  const p2 = await handlers['reviews.moreMerged']({ repo, page: 2 })
  ok(!!p2.errors.length && /limit/i.test(p2.errors.join(' ')) && !/not allowed/.test(p2.errors.join(' ')), 'a new search when limited says it is the rate limit, not the login', p2.errors.join(' | '))
  const n = searches.length
  await handlers['reviews.moreMerged']({ repo, page: 3 })
  ok(searches.length === n, 'after that, no search is sent until the limit lifts', `${searches.length - n} more`)
  const b = await handlers['reviews.list']({ repo })
  ok(b.items.some((i) => i.number === 1) && !b.errors.length, 'the review list still shows the last answer, no error', JSON.stringify(b.errors))
} catch (e) {
  fails++
  console.log('CRASH', e.stack)
}
console.log(`ratelimit: ${fails ? fails + ' failed' : 'all passed'}`)
server.close()
try {
  fs.rmSync(W, { recursive: true, force: true })
} catch {}
process.exit(fails ? 1 : 0)
