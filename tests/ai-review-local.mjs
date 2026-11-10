// Review with AI before a merge request / before a commit: node tests/ai-review-local.mjs
// A fake agent (GITX_AI_SCRIPT) saves the prompt it is given and answers like the real CLI. Checks
// that the right changes are sent: the branch against its target from where it split off (not the
// target's own newer commits), only the staged changes, or every change (new files too) when nothing
// is staged; that the verdict is read; and that a missing branch says so.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')))
const W = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'gitx-aireview-'))
process.env.GIT_CONFIG_GLOBAL = path.join(W, 'global.gitconfig')
fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, '[user]\n\tname = T\n\temail = t@e\n[init]\n\tdefaultBranch = main\n')
process.env.GIT_CONFIG_NOSYSTEM = '1'
process.env.GITX_NO_BROWSER = '1'
const promptFile = path.join(W, 'prompt.txt')
process.env.GITX_AI_PROMPT_FILE = promptFile
const agent = path.join(ROOT, 'fake-ai-agent.mjs')
process.env.GITX_AI_SCRIPT = agent

const g = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim()
const repo = path.join(W, 'repo')
fs.mkdirSync(path.join(repo, 'src'), { recursive: true })
g('init', '-q')
fs.writeFileSync(path.join(repo, 'src/a.js'), 'export const a = 1\n')
g('add', '.')
g('commit', '-qm', 'base')
const bare = path.join(W, 'origin.git')
execFileSync('git', ['init', '-q', '--bare', bare])
g('remote', 'add', 'origin', bare)
g('push', '-qu', 'origin', 'main')
g('switch', '-qc', 'feature')
fs.writeFileSync(path.join(repo, 'src/a.js'), 'export const a = 1\nexport const half = (x) => x / 0\n')
g('commit', '-qam', 'feature work')
// main moves on after the branch split off: that must not show up in the review
g('switch', '-q', 'main')
fs.writeFileSync(path.join(repo, 'MAIN_ONLY.md'), 'later on main\n')
g('add', '.')
g('commit', '-qm', 'main later')
g('push', '-q')
g('switch', '-q', 'feature')

const handlers = {}
const orca = { panels: { handle: (n, f) => (handlers[n] = f), post() {} }, host: { has: () => false, call: async () => ({}) }, commands: { register() {} }, events: { on() {} }, log() {} }
const mod = await import(pathToFileURL(path.resolve(ROOT, '../worker/main.mjs')).href)
mod.default(orca)
let fails = 0
const ok = (c, name, extra = '') => {
  if (!c) fails++
  console.log(`${c ? 'PASS' : 'FAIL'} ai-review ${name}${!c && extra ? ' :: ' + extra : ''}`)
}
const prompt = () => fs.readFileSync(promptFile, 'utf8')
try {
  const r = await handlers['ai.reviewLocal']({ repo, source: 'feature', target: 'main', agent: 'claude' })
  ok(r.verdict === 'fix' && /divides by zero/.test(r.review) && !/Verdict/.test(r.review), 'verdict read, review without the verdict line', JSON.stringify(r))
  ok(/x \/ 0/.test(prompt()) && !/MAIN_ONLY/.test(prompt()), "branch: its own changes, not main's later ones")
  ok(/feature before it is merged into main/.test(prompt()), 'the prompt names the direction')
  // staged only
  fs.writeFileSync(path.join(repo, 'src/b.js'), 'export const staged = true\n')
  fs.writeFileSync(path.join(repo, 'src/a.js'), 'export const a = 2\nexport const half = (x) => x / 2\n')
  g('add', 'src/b.js')
  await handlers['ai.reviewLocal']({ repo, staged: true, agent: 'claude' })
  ok(/staged = true/.test(prompt()) && !/a = 2/.test(prompt()), 'staged: only what is staged')
  // nothing staged: every change, new files too
  g('reset', '-q')
  fs.writeFileSync(path.join(repo, 'NEW.txt'), 'brand new file\n')
  await handlers['ai.reviewLocal']({ repo, staged: true, agent: 'claude' })
  ok(/a = 2/.test(prompt()) && /brand new file/.test(prompt()) && /staged = true/.test(prompt()), 'nothing staged: every change, new files included', prompt().slice(-600))
  // a branch with nothing new
  let err = ''
  await handlers['ai.reviewLocal']({ repo, source: 'main', target: 'main', agent: 'claude' }).catch((e) => (err = e.message))
  ok(!!err, 'a branch against itself says why', err)
} catch (e) {
  fails++
  console.log('CRASH', e.stack)
}
console.log(`ai-review: ${fails ? fails + ' failed' : 'all passed'}`)
try {
  fs.rmSync(W, { recursive: true, force: true })
} catch {}
process.exit(fails ? 1 : 0)
