// Phone check: the single-file page (panel/graph.html) as Orca's web client loads it: one sandboxed
// document with no origin (here a data: URL, so storage is unavailable and nothing else can be
// fetched), at iPhone size with touch. Wired to the real worker on a throwaway repository.
//   node mobile.mjs <plugin folder> <screenshot folder>
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const PLUGIN = process.argv[2]
const SHOTS = process.argv[3]
mkdirSync(SHOTS, { recursive: true })
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const root = mkdtempSync(path.join(tmpdir(), 'gitx-mobile-'))
process.env.GIT_CONFIG_GLOBAL = path.join(root, 'global.gitconfig') // never the person's real config
writeFileSync(process.env.GIT_CONFIG_GLOBAL, '[user]\n\tname = Phone Tester\n\temail = phone@e2e.test\n')
process.env.GIT_CONFIG_NOSYSTEM = '1' // nor the machine's system config
process.env.GITX_NO_BROWSER = '1'
let browser = null
const results = []
try {
const repo = path.join(root, 'app')
const g = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim()
execFileSync('git', ['init', '-q', '-b', 'main', repo])
for (let i = 1; i <= 6; i++) {
  writeFileSync(path.join(repo, `f${i}.txt`), `${i}\n`)
  g('add', '.')
  g('commit', '-qm', `Commit number ${i}`)
}
g('switch', '-qc', 'feature')
writeFileSync(path.join(repo, 'feat.txt'), 'x\n')
g('add', '.')
g('commit', '-qm', 'Feature commit')
g('switch', '-q', 'main')
writeFileSync(path.join(repo, 'f1.txt'), 'changed\n')
const REPO = repo.replace(/\\/g, '/')

const { default: activate } = await import(pathToFileURL(path.join(PLUGIN, 'worker/main.mjs')).href)
const handlers = {}
activate({
  api: { major: 1, minor: 3 },
  log() {},
  panels: { handle: (n, f) => (handlers[n] = f), post() {} },
  commands: { register: () => ({}) },
  events: { on: () => ({}) },
  host: { has: (m) => m === 'settings.get', call: async () => ({ settings: {} }) }
})

browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage()
await page.emulate({
  viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
})
const errors = []
const extraRequests = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('request', (r) => !r.url().startsWith('data:') && extraRequests.push(r.url()))
await page.exposeFunction('__orcaRequest', async (name, input) => {
  try {
    return { out: await handlers[name](input) }
  } catch (e) {
    return { error: e.message }
  }
})
await page.evaluateOnNewDocument((repoPath) => {
  window.orca = Object.freeze({
    api: { major: 1, minor: 3 },
    plugin: {
      request: async (n, i) => {
        const r = await window.__orcaRequest(n, i ?? null)
        if (r.error) throw new Error(r.error)
        return r.out
      }
    },
    document: { get: async () => ({ version: 1, content: { kind: 'text', text: JSON.stringify({ repo: repoPath }) } }), onDidChange() {} },
    host: { has: () => false, call: async () => ({}) },
    on: () => ({ dispose() {} })
  })
}, REPO)

const html = readFileSync(path.join(PLUGIN, 'panel/graph.html'))
await page.goto('data:text/html;base64,' + html.toString('base64'), { waitUntil: 'domcontentloaded' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, label, ms = 10000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      const v = await fn()
      if (v) return v
    } catch {}
    await sleep(50)
  }
  throw new Error('timed out: ' + label)
}
/** wait until the element's transitions and animations have finished */
const settled = (sel) => until(() => page.$eval(sel, (el) => el.getAnimations().length === 0), `${sel} settled`)
const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') })
async function step(name, fn) {
  try {
    await fn()
    results.push(['PASS', name])
  } catch (e) {
    results.push(['FAIL', name, e.message])
    await shot('FAIL-mobile-' + name.replace(/\W+/g, '_')).catch(() => {})
  }
}

await step('graph renders on a phone, no sideways scrolling', async () => {
  await until(() => page.$$eval('.commit-row', (r) => r.length >= 7), 'rows')
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('the page scrolls sideways')
  await shot('mobile-01-graph')
})

await step('the ☰ button opens the branch drawer; the backdrop closes it', async () => {
  await page.tap('#sideToggle')
  await until(() => page.evaluate(() => document.body.classList.contains('side-open')), 'drawer open')
  await settled('#side') // slid in
  await shot('mobile-02-drawer')
  await page.touchscreen.tap(380, 400) // the dimmed strip right of the drawer
  await until(() => page.evaluate(() => !document.body.classList.contains('side-open')), 'drawer closed')
  await settled('#side') // slid away
})

await step('long-press on a commit opens its menu, on screen', async () => {
  const box = await page.$eval('.commit-row:nth-child(3)', (r) => {
    const b = r.getBoundingClientRect()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  })
  const cdp = await page.createCDPSession()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] })
  await sleep(700)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await until(() => page.$('.menu'), 'menu')
  const inView = await page.$eval('.menu', (m) => {
    const b = m.getBoundingClientRect()
    return b.left >= 0 && b.right <= window.innerWidth + 1
  })
  if (!inView) throw new Error('menu is off screen')
  await shot('mobile-03-menu')
  await page.keyboard.press('Escape')
  await page.evaluate(() => document.querySelectorAll('.menu').forEach((m) => m.remove()))
})

await step('stage and commit a change from the phone', async () => {
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((t) => t.textContent.includes('Commit')).click())
  await until(() => page.$('.commit-box textarea'), 'commit view')
  await until(() => page.evaluate(() => !!document.querySelector('.view [title="Stage"]')), 'stage button visible')
  await page.evaluate(() => document.querySelector('.view [title="Stage"]').click())
  await until(() => page.evaluate(() => document.body.textContent.includes('Staged')), 'staged')
  await page.$eval('.commit-box textarea', (t) => {
    t.value = 'Commit from phone'
    t.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await shot('mobile-04-commit')
  await page.$eval('.commit-box .split .btn:first-child', (b) => b.click())
  await until(() => g('log', '-1', '--format=%s') === 'Commit from phone', 'committed')
})

await step('no other files requested (works as one document in the web client)', async () => {
  if (extraRequests.length) throw new Error(extraRequests.slice(0, 3).join(', '))
})

await step('no page errors', async () => {
  if (errors.length) throw new Error(errors.slice(0, 3).join(' | '))
})

} catch (e) {
  results.push(['FAIL', 'setup', e.message])
} finally {
  // close Chrome and delete the throwaway repository even when a step throws outside step()
  await browser?.close().catch(() => {})
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {}
}
for (const r of results) console.log(r[0] + '  ' + r[1] + (r[2] ? '\n      ' + r[2] : ''))
console.log(`\n${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`)
process.exit(results.length && results.every((r) => r[0] === 'PASS') ? 0 : 1)
