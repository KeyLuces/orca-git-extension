// Blackbox end-to-end test: the real Git Control tab (panel/tab.html + app.js + style.css) in headless
// Chrome, wired to the real worker (worker/main.mjs) in this Node process. The test only clicks, types
// and reads the page, then checks the repository from outside with plain git.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import http from 'node:http'
import puppeteer from 'puppeteer-core'

const PLUGIN = process.argv[2]
const SHOTS = process.argv[3]
mkdirSync(SHOTS, { recursive: true })
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// ---------- fixture: a repo with a remote, branches, and a diverged sandbox ----------
const root = mkdtempSync(path.join(tmpdir(), 'gitx-e2e-'))
// Never touch the person's real ~/.gitconfig: git (ours and the worker's) reads this file instead.
const GLOBAL_CFG = path.join(root, 'global.gitconfig')
writeFileSync(GLOBAL_CFG, '[user]\n\tname = Global Tester\n\temail = global@e2e.test\n')
process.env.GIT_CONFIG_GLOBAL = GLOBAL_CFG
process.env.GIT_CONFIG_NOSYSTEM = '1'
// Hide gh/glab: the test must never reach the person's real GitHub/GitLab accounts.
process.env.PATH = process.env.PATH.split(path.delimiter).filter((d) => !['gh.exe', 'glab.exe', 'gh', 'glab'].some((b) => { try { return statSync(path.join(d, b)).isFile() } catch { return false } })).join(path.delimiter)
process.env.GITX_NO_BROWSER = '1' // the merge request step must not open a real browser
let browser = null
const results = []
try {
const origin = path.join(root, 'origin.git')
const repo = path.join(root, 'app')
const g = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim()
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin])
execFileSync('git', ['clone', '-q', origin, repo])
g('config', 'user.name', 'Tester'); g('config', 'user.email', 't@e2e.test'); g('config', 'core.autocrlf', 'false')
const write = (f, t) => writeFileSync(path.join(repo, f), t)
write('a.txt', 'one\ntwo\nthree\n'); g('add', '.'); g('commit', '-qm', 'Initial commit'); g('push', '-q', '-u', 'origin', 'main')
write('b.txt', 'b\n'); g('add', '.'); g('commit', '-qm', 'Add b'); g('push', '-q')
g('switch', '-qc', 'feature'); write('f.txt', 'feature\n'); g('add', '.'); g('commit', '-qm', 'Feature work'); g('push', '-q', '-u', 'origin', 'feature')
g('switch', '-q', 'main'); g('switch', '-qc', 'sandbox'); write('s.txt', 'remote\n'); g('add', '.'); g('commit', '-qm', 'Remote sandbox work'); g('push', '-q', '-u', 'origin', 'sandbox')
g('reset', '-q', '--hard', 'HEAD~1'); write('l.txt', 'local\n'); g('add', '.'); g('commit', '-qm', 'Local sandbox work')
g('switch', '-q', 'main')
const REPO = repo.replace(/\\/g, '/')

// ---------- the worker, with a stand-in Orca host ----------
const { default: activate } = await import(pathToFileURL(path.join(PLUGIN, 'worker/main.mjs')).href)
const handlers = {}
const settings = { aiAgent: 'claude', keepGraphOpen: false }
activate({
  api: { major: 1, minor: 3 },
  log() {},
  panels: { handle: (n, f) => (handlers[n] = f), post() {} },
  commands: { register: () => ({ dispose() {} }) },
  events: { on: () => ({ dispose() {} }) },
  host: {
    has: (m) => ['settings.get', 'settings.set', 'workspace.readContext', 'workspace.list'].includes(m),
    call: async (m, p) => {
      if (m === 'settings.get') return { settings }
      if (m === 'settings.set') return ((settings[p.key] = p.value), { ok: true })
      if (m === 'workspace.readContext') return null
      if (m === 'workspace.list') return { workspaces: [], truncated: false }
      return {}
    }
  }
})

// ---------- browser ----------
browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1500,900'] })
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 900 })
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && !/favicon|status of 404/.test(m.text()) && consoleErrors.push(m.text()))
// Tests can stand in for the AI agent (no claude/codex here): name -> async (input) => output
const fakes = {}
await page.exposeFunction('__orcaRequest', async (name, input) => {
  try {
    if (fakes[name]) return { out: await fakes[name](input) }
    return { out: await handlers[name](input) }
  } catch (e) {
    return { error: e.message, code: e.code }
  }
})
await page.evaluateOnNewDocument((repoPath) => {
  document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('dark'))
  window.orca = Object.freeze({
    api: { major: 1, minor: 3 },
    locale: 'en',
    plugin: {
      request: async (name, input) => {
        const r = await window.__orcaRequest(name, input ?? null)
        if (r.error) throw Object.assign(new Error(r.error), { code: r.code || 'action_failed' })
        return r.out
      }
    },
    document: { get: async () => ({ version: 1, readOnly: false, content: { kind: 'text', text: JSON.stringify({ repo: repoPath }) } }), onDidChange() {} },
    host: { has: () => false, call: async () => ({}) },
    on: () => ({ dispose() {} })
  })
}, REPO)
await page.setRequestInterception(true)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
page.on('request', (req) => {
  const u = new URL(req.url())
  if (u.hostname !== 'gitx.test') return req.respond({ status: 404, body: '' })
  const f = path.join(PLUGIN, 'panel', u.pathname.replace(/^\//, ''))
  try {
    req.respond({ status: 200, contentType: TYPES[path.extname(f)] || 'text/plain', body: readFileSync(f) })
  } catch {
    req.respond({ status: 404, body: '' })
  }
})

// ---------- helpers: act like a person ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, label, ms = 8000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    try {
      last = await fn()
      if (last) return last
    } catch {}
    await sleep(120)
  }
  throw new Error(`timed out: ${label}`)
}
const exists = (sel) => page.$(sel).then(Boolean)
const clickSel = (sel) => until(() => page.$eval(sel, (el) => (el.click(), true)), `click ${sel}`)
/** click the first element matching `sel` whose text contains `text` */
const clickText = (sel, text) =>
  until(
    () =>
      page.evaluate(
        (sel, text) => {
          const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(text) && !e.disabled)
          if (!el) return false
          el.click()
          return true
        },
        sel,
        text
      ),
    `click "${text}" in ${sel}`
  )
/** inside the row (`rowSel`) whose text contains `rowText`, click the control titled `title` */
const clickInRow = (rowSel, rowText, title) =>
  until(
    () =>
      page.evaluate(
        (rowSel, rowText, title) => {
          const row = [...document.querySelectorAll(rowSel)].find((r) => r.textContent.includes(rowText))
          const b = row && row.querySelector(`[title="${title}"]`)
          if (!b) return false
          b.click()
          return true
        },
        rowSel,
        rowText,
        title
      ),
    `"${title}" on row "${rowText}"`
  )
const tab = (label) => clickText('.tab', label)
const refresh = () => clickSel('[title="Refresh"]')
const dialogOpen = () => until(() => exists('.overlay .dialog'), 'dialog opens')
async function fill(selector, value) {
  await page.$eval(selector, (el, v) => {
    el.focus()
    el.value = v
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}
async function submitDialog() {
  await clickSel('.overlay .dialog button[type=submit], .overlay .dialog .btn.primary')
  await until(() => page.$('.overlay').then((x) => !x), 'dialog closes')
}
const toastText = () => page.$$eval('.toast', (t) => t.map((x) => x.textContent).join(' | '))
const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })

// ---------- run ----------
async function step(name, fn) {
  const t = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - t })
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t, error: e.message, toasts: await toastText().catch(() => '') })
    await shot('FAIL-' + name.replace(/\W+/g, '_')).catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
  }
}

await page.goto('http://gitx.test/tab.html', { waitUntil: 'domcontentloaded' })

await step('opens the graph with every branch and marks the checked-out one', async () => {
  await until(() => page.$$eval('.commit-row', (r) => r.length >= 5), 'graph rows')
  const cur = await until(() => page.$eval('.ref.current .ref-t', (e) => e.textContent), 'checked-out label')
  if (cur !== 'main') throw new Error(`checked-out label says "${cur}"`)
  const subjects = await page.$$eval('.commit-row .s', (s) => s.map((x) => x.textContent))
  for (const want of ['Feature work', 'Remote sandbox work', 'Local sandbox work']) if (!subjects.includes(want)) throw new Error(`missing commit "${want}" (All branches)`)
  await shot('01-graph')
})

await step('split view: a commit opens docked beside the graph; arrows follow; Esc closes', async () => {
  await clickText('.commit-row', 'Add b')
  await until(() => page.$eval('.sheet.dock', (e) => e.textContent.includes('b.txt')).catch(() => false), 'docked details list b.txt')
  // the graph makes room instead of sliding under the pane
  const room = await page.$eval('#main', (m) => parseFloat(getComputedStyle(m).marginRight))
  if (!(room > 200)) throw new Error(`graph did not make room for the docked pane (margin ${room})`)
  await shot('02-docked-details')
  await page.$$eval('.sheet.dock .item', (r) => r.find((x) => x.textContent.includes('b.txt')).click())
  await until(() => page.$('.sheet .dv .l').then(Boolean), 'file diff sheet')
  await shot('02b-file-diff')
  await clickSel('.sheet .sheet-back')
  await until(() => page.$('.sheet.dock').then(Boolean), 'Back returns to the docked details')
  // ↓ moves to the next (older) commit and the pane follows
  const before = await page.$eval('.sheet.dock .sheet-title', (e) => e.textContent)
  await page.mouse.move(5, 5)
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('ArrowDown')
  await until(async () => (await page.$eval('.sheet.dock .sheet-title', (e) => e.textContent)) !== before, 'pane follows the arrow key')
  await page.keyboard.press('Escape')
  await until(() => page.$('.sheet').then((x) => !x), 'docked pane closes')
  if (!(await page.$eval('#main', (m) => parseFloat(getComputedStyle(m).marginRight) === 0))) throw new Error('graph kept the room after closing')
})

await step('Ctrl+K runs a command; toolbar sits on the right', async () => {
  const tb = await page.$eval('#toolbar', (t) => t.getBoundingClientRect().right)
  const vw = await page.evaluate(() => innerWidth)
  if (vw - tb > 40) throw new Error(`toolbar is not on the right (right edge ${tb} of ${vw})`)
  await page.keyboard.down('Control'); await page.keyboard.press('KeyK'); await page.keyboard.up('Control')
  await until(() => page.$('.palette .pal-input').then(Boolean), 'palette opens')
  await page.keyboard.type('reflog')
  await shot('02d-palette')
  await page.keyboard.press('Enter')
  await until(() => page.$eval('.tab.active', (t) => t.textContent.includes('Reflog')), 'went to Reflog')
  await clickText('.tab', 'Graph')
  await until(() => page.$('.commit-row').then(Boolean), 'graph back')
})

await step('a narrow tab works like the sidebar: every button and tab inside, nothing cut off', async () => {
  for (const w of [420, 560, 760]) {
    await page.setViewport({ width: w, height: 900 })
    await sleep(250)
    const cut = await page.$$eval('#toolbar > button, nav.tabs .tab', (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth - 1 || r.left < 0) }).map((e) => e.textContent.trim() || e.title))
    if (cut.length) throw new Error(`cut off at ${w}px: ${cut.join(', ')}`)
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`scrolls sideways at ${w}px`)
    if (w === 420) await shot('02f-narrow-tab')
  }
  await page.setViewport({ width: 1500, height: 900 })
  await sleep(250)
})

await step('reopening comes back to the same tab; Refresh shows it worked', async () => {
  await clickText('.tab', 'Stash')
  await until(() => page.$eval('.tab.active', (t) => t.textContent.includes('Stash')), 'on Stash')
  await page.reload()
  await until(() => page.$eval('.tab.active', (t) => t.textContent.includes('Stash')).catch(() => false), 'reopened on Stash')
  await clickText('.tab', 'Graph')
  await until(() => page.$('.commit-row').then(Boolean), 'graph back')
  await clickSel('[title="Refresh"]')
  await until(() => page.$('#toolbar [data-op="refresh"].done').then(Boolean), 'refresh button ticks when done')
  await until(() => page.$$eval('.toast', (t) => t.some((x) => /Refreshed/.test(x.textContent))), 'refresh says what changed')
})

await step('tooltips come from our own component, not the browser', async () => {
  await new Promise((r) => setTimeout(r, 400)) // the toolbar redraws after the previous refresh
  await page.hover('#toolbar [title="Fetch all (prune)"]')
  await until(() => page.$eval('.tip.on', (t) => t.textContent.includes('Fetch all')).catch(() => false), 'our tooltip shows')
  if (await page.$('#toolbar [title="Fetch all (prune)"]')) throw new Error('the browser tooltip (title) is still active while hovered')
  await shot('02e-tooltip')
  await page.mouse.move(5, 400)
  await until(() => page.$('#toolbar [title="Fetch all (prune)"]').then(Boolean), 'title restored after leaving')
  await until(() => page.$('.tip.on').then((x) => !x), 'tooltip hides')
})

await step('menus: no trailing "…", and no tooltip on text that is shown in full', async () => {
  const row = await page.$('.commit-row:last-child')
  await row.click({ button: 'right' })
  await until(() => page.$('.menu button').then(Boolean), 'commit menu')
  const labels = await page.$$eval('.menu button .grow', (s) => s.map((x) => x.textContent))
  const dotted = labels.filter((t) => /…$/.test(t))
  if (dotted.length) throw new Error(`labels still end in …: ${dotted.join(', ')}`)
  let item = null
  for (const b of await page.$$('.menu button')) if ((await b.evaluate((x) => x.textContent)).includes('Create tag here')) item = b
  await item.hover()
  await new Promise((r) => setTimeout(r, 800))
  if (await page.$('.tip.on')) throw new Error('a tooltip showed for a label that is fully visible')
  await page.keyboard.press('Escape')
  await until(() => page.$('.menu').then((x) => !x), 'menu closed')
})

await step('search finds everything as you type (message, file, author, hash) and highlights it', async () => {
  const typeSearch = async (text) => {
    const box = await page.$('.history-bar input') // redrawn with each result
    await box.click()
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(text) // no Enter
  }
  const rows = () => page.$$eval('.commit-row', (r) => r.map((x) => x.textContent))
  // message, highlighted
  await typeSearch('sandbox')
  await until(() => page.$$eval('.commit-row mark.hit', (m) => m.some((x) => x.textContent.toLowerCase() === 'sandbox')), 'message match highlighted')
  // a changed file only: the row says where it matched
  await typeSearch('b.txt')
  await until(async () => (await rows()).some((t) => t.includes('Add b')) && (await page.$$eval('.commit-row .match-note', (n) => n.some((x) => x.textContent === 'file: b.txt'))), '"Add b" found by its file, and the row says which file')
  // short searches match whole words only: "b" finds "Add b" but not "sandbox" or "Feature work"
  await typeSearch('b')
  await until(async () => { const r = await rows(); return r.some((t) => t.includes('Add b')) && !r.some((t) => /sandbox work|Feature work/i.test(t)) }, 'whole-word match for a 1-letter search')
  // author
  await typeSearch('Tester')
  await until(() => page.$$eval('.commit-row .col-author mark.hit', (m) => m.length > 0), 'author highlighted')
  // hash prefix
  const h7 = g('rev-parse', '--short=7', 'HEAD')
  await typeSearch(h7)
  await until(() => page.$$eval('.commit-row .col-hash mark.hit', (m) => m.length > 0), 'hash highlighted')
  if (await page.$('.mode-select')) throw new Error('the search-in dropdown is still there')
  await shot('02c-search')
  // Escape clears and brings the graph back
  await page.focus('.history-bar input')
  await page.keyboard.press('Escape')
  await until(async () => (await page.$eval('.history-bar input', (i) => i.value)) === '' && (await rows()).length >= 5, 'cleared')
})

await step('stages and commits a new file from the Commit tab', async () => {
  write('new.txt', 'hello\n')
  await refresh()
  await tab('Commit')
  await clickInRow('.item', 'new.txt', 'Stage')
  await until(() => page.evaluate(() => document.querySelector('.view').textContent.includes('Staged')), 'file staged')
  await fill('.commit-box textarea', 'Add new file from the UI')
  await clickSel('.commit-box .split .btn:first-child')
  await until(() => g('log', '-1', '--format=%s') === 'Add new file from the UI', 'commit in git log')
  await until(() => page.evaluate(() => document.body.textContent.includes('Working tree clean')), 'clean state shown')
  // nothing left to commit, one commit not on the remote: the button offers Push (or Publish)
  await until(() => page.$eval('.commit-box .split .btn:first-child', (x) => /^(Push [0-9]+ commit|Publish )/.test(x.textContent.trim())), 'commit button turns into Push')
})

await step('an image change shows a picture preview, not "binary file"', async () => {
  writeFileSync(path.join(repo, 'logo.png'), readFileSync(path.join(PLUGIN, 'assets/icon.png')))
  await refresh()
  await tab('Commit')
  await until(() => page.evaluate(() => [...document.querySelectorAll('.view .item')].some((x) => x.textContent.includes('logo.png'))), 'image listed')
  await page.evaluate(() => [...document.querySelectorAll('.view .item')].find((x) => x.textContent.includes('logo.png')).click())
  await until(() => page.evaluate(() => { const i = document.querySelector('.img-preview img'); return i && i.naturalWidth === 256 }), 'image preview loaded')
  await until(() => page.evaluate(() => /256 × 256/.test(document.querySelector('.img-meta')?.textContent || '')), 'size shown')
  await shot('image-preview')
  rmSync(path.join(repo, 'logo.png'))
  await refresh()
})

await step('creates a branch from the sidebar', async () => {
  await clickSel('#side [title="New branch"]')
  await dialogOpen()
  await fill('.overlay .dialog input[type=text]', 'e2e-branch')
  await submitDialog()
  await until(() => g('branch', '--show-current') === 'e2e-branch', 'switched to e2e-branch')
})

await step('checkout with changes in the way offers stash & switch', async () => {
  write('a.txt', 'one\nCHANGED\nthree\n')
  g('switch', '-q', 'feature'); g('switch', '-q', 'e2e-branch') // keep main checkout-able
  write('a.txt', 'one\nCHANGED\nthree\n')
  // a.txt differs on main? make it conflict: change a.txt on main first
  g('stash', '-q'); g('switch', '-q', 'main'); write('a.txt', 'one\nMAIN\nthree\n'); g('commit', '-qam', 'Change a on main'); g('switch', '-q', 'e2e-branch'); g('stash', 'pop', '-q')
  await refresh()
  await until(() => page.$$eval('#side .item', (r) => r.some((x) => x.textContent.includes('main'))), 'main in sidebar')
  await clickInRow('#side .item', 'main', 'Checkout')
  // Git Extensions style: asked first, because there are uncommitted changes
  await until(() => page.$('.co-dialog'), 'local-changes dialog')
  const text = await page.$eval('.co-dialog', (d) => d.textContent)
  for (const want of ['Stash', 'Merge', 'Reset', 'Remember my choice']) if (!text.includes(want)) throw new Error('missing option: ' + want)
  // Asked before trying ("Don't change" offered), or, if git found the collision first, asked once without it.
  if (text.includes("Don't change")) {
    await submitDialog() // "Don't change" collides with main's a.txt, so it asks again
    await until(() => page.$eval('.co-dialog', (d) => !d.textContent.includes("Don't change")).catch(() => false), 'asked again without the failed option')
  }
  await submitDialog() // default now: stash, switch, bring back
  await until(() => g('branch', '--show-current') === 'main', 'on main')
  const st = g('status', '--porcelain')
  const stashes = g('stash', 'list')
  if (!st && !stashes) throw new Error('local change was lost')
})

await step('checkout with Reset discards changes (and untracked files) then switches', async () => {
  g('reset', '-q', '--hard'); g('stash', 'clear'); g('switch', '-q', 'e2e-branch')
  write('b.txt', 'b throwaway\n'); write('junk.tmp', 'junk\n')
  await refresh()
  await until(() => page.$$eval('#side .item', (r) => r.some((x) => x.textContent.includes('main'))), 'main in sidebar')
  await clickInRow('#side .item', 'main', 'Checkout')
  await until(() => page.$('.co-dialog'), 'local-changes dialog')
  await page.evaluate(() => document.querySelector('.co-option[data-mode="reset"] input').click())
  await page.evaluate(() => document.querySelector('.co-clean input').click())
  await shot('11-checkout-reset')
  await submitDialog()
  await until(() => g('branch', '--show-current') === 'main', 'on main')
  if (g('status', '--porcelain')) throw new Error('changes left after Reset: ' + g('status', '--porcelain'))
})

await step('checking out a diverged origin branch asks what to do (merge)', async () => {
  g('reset', '-q', '--hard'); g('stash', 'clear'); g('switch', '-q', 'main')
  await refresh()
  await clickText('#side .side-head', 'Remotes')
  await until(() => page.$$eval('#side .item', (r) => r.some((x) => x.textContent.includes('origin/sandbox'))), 'origin/sandbox listed')
  await clickInRow('#side .item', 'origin/sandbox', 'More')
  await until(() => exists('.menu'), 'menu opens')
  await clickText('.menu button', 'Checkout origin/sandbox')
  await dialogOpen()
  const text = await page.$eval('.overlay .dialog', (d) => d.textContent)
  if (!/gone its own way/.test(text)) throw new Error('no diverged explanation: ' + text.slice(0, 160))
  await submitDialog() // default: merge
  await until(() => g('branch', '--show-current') === 'sandbox', 'on sandbox')
  await until(() => /Merge/.test(g('log', '-1', '--format=%s')), 'merge commit made')
  const files = g('ls-files')
  if (!files.includes('s.txt') || !files.includes('l.txt')) throw new Error('merge did not keep both sides')
  await shot('03-after-remote-checkout')
})

await step('stashes from the toolbar and pops from the Stash tab', async () => {
  write('b.txt', 'b changed\n')
  await refresh()
  await until(() => page.$eval('[title="Stash changes"]', (b) => !b.disabled), 'stash enabled')
  await clickSel('[title="Stash changes"]')
  await until(() => g('stash', 'list').split('\n').filter(Boolean).length === 1, 'stash created')
  await tab('Stash')
  await clickInRow('.view .item', '', 'Apply and remove the stash')
  await until(() => !g('stash', 'list') && readFileSync(path.join(repo, 'b.txt'), 'utf8').includes('changed'), 'stash popped')
  g('checkout', '--', 'b.txt')
})

await step('discards a file change after confirming', async () => {
  write('a.txt', 'garbage\n')
  await refresh()
  await tab('Commit')
  await clickInRow('.item', 'a.txt', 'Discard changes')
  await dialogOpen()
  await submitDialog()
  await until(() => g('status', '--porcelain') === '', 'working tree clean')
})

await step('creates and removes a worktree', async () => {
  await tab('Worktrees')
  await clickSel('[title="New worktree"]')
  await dialogOpen()
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('.overlay .dialog input[type=text]')]
    inputs[0].value = 'wt-e2e'
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
  })
  await submitDialog()
  await until(() => g('worktree', 'list').includes('wt-e2e'), 'worktree added')
  await until(() => page.$$eval('.card', (c) => c.some((x) => x.textContent.includes('wt-e2e'))), 'worktree card shown')
  await shot('04-worktrees')
  await clickInRow('.card', 'wt-e2e', 'More')
  await clickText('.menu button', 'Remove')
  await dialogOpen()
  await submitDialog()
  await until(() => !g('worktree', 'list').includes('wt-e2e'), 'worktree removed')
})

await step('sets a repository-only user name in Settings', async () => {
  await tab('Settings')
  await clickText('.segmented button', 'This repository')
  await until(() => page.evaluate(() => document.querySelector('.segmented button.on')?.textContent === 'This repository' && !document.querySelector('.view.pending') && document.body.textContent.includes('overrides global')), 'repository scope loaded')
  await until(() => page.evaluate(() => [...document.querySelectorAll('.field label')].some((l) => l.textContent.includes('user.name'))), 'identity fields')
  await page.evaluate(() => {
    const f = [...document.querySelectorAll('.field')].find((x) => x.querySelector('label')?.textContent.includes('user.name'))
    const i = f.querySelector('input')
    i.value = 'E2E Person'
    i.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const before = await page.evaluate(() => {
    const f = [...document.querySelectorAll('.field')].find((x) => x.querySelector('label')?.textContent.includes('user.name'))
    const b = [...document.querySelectorAll('.form .btn.primary')].map((x) => x.textContent + (x.disabled ? '(disabled)' : ''))
    return { value: f?.querySelector('input')?.value, buttons: b, editing: !!document.querySelector('.view[data-editing]') }
  })
  if (before.value !== 'E2E Person') throw new Error('typed value was lost before saving')
  await clickText('.form .btn.primary', 'Save')
  await until(() => g('config', '--local', 'user.name') === 'E2E Person', 'git config updated')
  const globalName = execFileSync('git', ['config', '--global', 'user.name'], { encoding: 'utf8' }).trim()
  if (globalName !== 'Global Tester') throw new Error(`the repository-only save changed the global name to "${globalName}"`)
  await shot('05-settings')
})

await step('tags a commit from its right-click menu', async () => {
  await tab('Graph')
  await until(() => page.$$eval('.commit-row', (r) => r.length > 3), 'graph back')
  const box = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.commit-row')].find((x) => x.textContent.includes('Add b')).getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.click(box.x, box.y, { button: 'right' })
  await until(() => exists('.menu'), 'context menu')
  await clickText('.menu button', 'Create tag here')
  await dialogOpen()
  await fill('.overlay .dialog input[type=text]', 'v-e2e')
  await submitDialog()
  await until(() => g('tag', '--list') .includes('v-e2e'), 'tag exists')
})

await step('a branch in sync with its remote is one label (main │ origin)', async () => {
  g('switch', '-q', 'main'); g('reset', '-q', '--hard', 'origin/main')
  await refresh()
  await tab('Graph')
  const text = await until(() => page.evaluate(() => { const t = [...document.querySelectorAll('.ref.synced')].map((e) => e.textContent).join('|'); return /main\s*origin/.test(t) && t }), 'main │ origin label').catch(() => page.evaluate(() => [...document.querySelectorAll('.ref.synced')].map((e) => e.textContent).join('|')))
  if (!/main\s*origin/.test(text)) throw new Error('synced label reads: ' + text)
  const separateOriginMain = await page.$$eval('.ref.remote .ref-t', (t) => t.some((x) => x.textContent === 'origin/main'))
  if (separateOriginMain) throw new Error('origin/main is still a separate label while in sync')
})

await step('a push made outside the app (e.g. the Orca Git panel) turns the label into main │ origin by itself', async () => {
  g('switch', '-q', 'main')
  write('outside.txt', 'pushed elsewhere\n'); g('add', '.'); g('commit', '-qm', 'Pushed from outside')
  await until(() => page.$$eval('.commit-row', (r) => r[0]?.textContent.includes('Pushed from outside')), 'new commit shows', 15000)
  g('push', '-q', 'origin', 'main')
  // no Refresh: the status poll must notice origin/main moving
  await until(() => page.evaluate(() => [...document.querySelectorAll('.commit-row')][0]?.querySelector('.ref.synced')?.textContent.replace(/\s+/g, '') === 'mainorigin'), 'main │ origin on the checked-out commit', 15000)
})

await step('pushing with the toolbar Push moves origin onto the commit (main │ origin)', async () => {
  write('ours.txt', 'pushed from the app\n'); g('add', '.'); g('commit', '-qm', 'Pushed from the app')
  await refresh()
  await until(() => page.$$eval('.commit-row', (r) => r[0]?.textContent.includes('Pushed from the app')), 'new commit shows')
  await clickSel('[title="Push"]')
  await clickText('.menu button', 'Push').catch(() => {}) // the button may open its menu
  await until(() => g('rev-parse', 'origin/main') === g('rev-parse', 'main'), 'pushed')
  await until(() => page.evaluate(() => [...document.querySelectorAll('.commit-row')][0]?.querySelector('.ref.synced')?.textContent.replace(/\s+/g, '') === 'mainorigin'), 'label is main │ origin right after the push', 10000)
})

await step('merge request: one button pushes the branch and hands over to GitLab', async () => {
  g('switch', '-q', '-c', 'mr-branch'); write('mr.txt', 'mr\n'); g('add', '.'); g('commit', '-qm', 'Add MR change')
  // looks like a GitLab project, while pushes still go to the local test remote
  g('remote', 'set-url', 'origin', 'https://gitlab.example.test/team/app.git')
  g('remote', 'set-url', '--push', 'origin', origin.replace(/\\/g, '/'))
  await refresh()
  // wait like a person until the switch to mr-branch shows (header and sidebar)
  await until(() => page.$eval('.branch-chip', (c) => c.textContent.includes('mr-branch')), 'header shows mr-branch')
  await until(() => page.$$eval('#side .item.current', (r) => r.some((x) => x.textContent.includes('mr-branch'))), 'sidebar shows mr-branch')
  await clickInRow('#side .item', 'main', 'More')
  await clickText('.menu button', 'Merge request')
  await clickText('.menu button', 'mr-branch → main')
  await until(() => exists('.mr-dialog'), 'MR dialog')
  const d = await page.$eval('.mr-dialog', (x) => x.textContent)
  if (!d.includes('mr-branch') || !d.includes('gitlab.example.test')) throw new Error('dialog: ' + d.slice(0, 200))
  const t = await page.$eval('.mr-dialog input[type=text]', (i) => i.value)
  if (t !== 'Add MR change') throw new Error('title prefilled as ' + t)
  await shot('07-mr-dialog')
  await clickText('.mr-dialog .btn', 'Open link')
  await until(() => page.evaluate(() => document.querySelector('.mr-dialog')?.textContent.includes('Ready on')), 'finish step', 20000)
  if (!execFileSync('git', ['ls-remote', origin, 'mr-branch'], { encoding: 'utf8' }).trim()) throw new Error('branch was not pushed')
  await shot('08-mr-done')
  await page.keyboard.press('Escape')
  await until(() => page.$('.mr-dialog').then((x) => !x), 'MR dialog closes')
})

// ---------- merge requests through the saved Git login, against a fake GitHub/GitLab API ----------
// Hosts are made up (*.example.test) and the API is a local server: no real account is ever used.
const api = { calls: [], deny: false, approved: new Set(), merged: new Set() }
const apiServer = http.createServer((req, res) => {
  let data = ''
  req.on('data', (c) => (data += c))
  req.on('end', () => {
    const u = new URL(req.url, 'http://x')
    api.calls.push({ method: req.method, path: u.pathname, query: u.search, auth: req.headers.authorization || req.headers['private-token'] || '', body: data ? JSON.parse(data) : null })
    const send = (code, obj) => (res.writeHead(code, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(obj)))
    if (api.deny) return send(401, { message: '401 Unauthorized' })
    if (req.method === 'POST' && /\/merge_requests$/.test(u.pathname)) return send(201, { iid: 7, web_url: 'https://gitlab2.example.test/team/app/-/merge_requests/7' })
    if (req.method === 'POST' && /\/pulls$/.test(u.pathname)) return send(201, { number: 9, html_url: 'https://github.example.test/team/app/pull/9' })
    // pipelines (GitLab) / workflow runs (GitHub)
    const now = new Date().toISOString()
    if (/\/repository\/commits\/[0-9a-f]+$/.test(u.pathname)) return send(200, { last_pipeline: { id: 100, status: 'failed', web_url: 'https://gitlab2.example.test/team/app/-/pipelines/100' } })
    if (/\/projects\/[^/]+\/pipelines$/.test(u.pathname)) return send(200, [{ id: 100, status: 'failed', ref: 'main', sha: 'abc1234def', web_url: 'https://gitlab2.example.test/team/app/-/pipelines/100', created_at: now, updated_at: now, source: 'push', user: { username: 'me' } }])
    if (/\/pipelines\/100\/jobs$/.test(u.pathname)) return send(200, [{ id: 501, name: 'build', stage: 'build', status: 'success', duration: 12, web_url: 'https://x/j/501' }, { id: 502, name: 'unit tests', stage: 'test', status: 'failed', duration: 30, web_url: 'https://x/j/502' }])
    if (/\/jobs\/502\/trace$/.test(u.pathname)) return (res.writeHead(200, { 'Content-Type': 'text/plain' }), res.end('\x1b[32m$ npm test\x1b[0m\nok 1 adds\nnot ok 2 subtracts\nERROR: Job failed: exit code 1\n'))
    if (req.method === 'POST' && /\/pipelines\/100\/retry$/.test(u.pathname)) return send(201, { id: 100 })
    if (/\/actions\/runs$/.test(u.pathname)) return send(200, { workflow_runs: [{ id: 200, name: 'CI', display_title: 'Add GitHub change', status: 'completed', conclusion: 'failure', head_branch: 'mr-gh', head_sha: 'abc1234def', event: 'push', actor: { login: 'me' }, run_started_at: now, created_at: now, updated_at: now, html_url: 'https://github.example.test/team/app/actions/runs/200' }] })
    if (/\/actions\/runs\/200\/jobs$/.test(u.pathname)) return send(200, { jobs: [{ id: 601, name: 'lint', workflow_name: 'CI', status: 'completed', conclusion: 'failure', started_at: now, completed_at: now, html_url: 'https://x/601', steps: [] }] })
    if (/\/actions\/jobs\/601\/logs$/.test(u.pathname)) return (res.writeHead(200, { 'Content-Type': 'text/plain' }), res.end('2026-11-06T00:00:00.0000000Z Run eslint\n2026-11-06T00:00:00.0000000Z ##[error]src/a.js:3 no-unused-vars\n'))
    if (req.method === 'POST' && /\/actions\/runs\/200\/rerun-failed-jobs$/.test(u.pathname)) return send(201, {})
    if (u.pathname.endsWith('/user')) return send(200, { username: 'me', login: 'me', id: 1, name: 'Me Myself' })
    if (u.pathname.endsWith('/members/all')) return send(200, [{ id: 1, username: 'me', name: 'Me Myself' }, { id: 2, username: 'dev1', name: 'Dev One' }, { id: 3, username: 'qa', name: 'Quality Person' }])
    if (u.pathname === '/api/v4/projects/team%2Fapp') return send(200, { remove_source_branch_after_merge: true, squash_option: 'default_on', merge_requests_template: '## What does this MR do?' })
    if (u.pathname.endsWith('/assignees') && req.method === 'GET') return send(200, [{ id: 1, login: 'me' }, { id: 2, login: 'dev1' }])
    if (req.method === 'POST' && /\/(assignees|requested_reviewers)$/.test(u.pathname)) return send(201, {})
    if (req.method === 'GET' && u.pathname === '/api/v4/projects/5/merge_requests/11' && !api.merged.has(11))
      return send(200, { iid: 11, title: 'MR review', description: '## Why\nKeeps **reviews** in the app.\n\n- [x] tests\n- docs', state: 'opened', author: { username: 'dev' }, source_branch: 's11', target_branch: 'main', sha: 'abc1234567', created_at: new Date().toISOString(), web_url: 'https://gitlab2.example.test/team/app/-/merge_requests/11', labels: ['backend'], reviewers: [{ username: 'dev1' }, { username: 'me' }], assignees: [{ username: 'dev' }], changes_count: '2', detailed_merge_status: api.approved.has(11) ? 'mergeable' : 'not_approved', head_pipeline: { status: 'success' }, force_remove_source_branch: true, squash: true, user: { can_merge: true } })
    const mrM = u.pathname.match(/^\/api\/v4\/projects\/5\/merge_requests\/(\d+)(\/\w+)?$/)
    if (mrM) {
      const n = +mrM[1]
      const sub = mrM[2] || ''
      if (req.method === 'POST' && sub === '/approve') return api.approved.add(n), send(201, {})
      if (req.method === 'POST' && sub === '/unapprove') return api.approved.delete(n), send(201, {})
      if (req.method === 'PUT' && sub === '/merge') return api.merged.add(n), send(200, { iid: n, state: 'merged' })
      if (req.method === 'GET' && sub === '/approvals') {
        const by = [...(n === 11 ? [{ user: { username: 'dev1' } }] : []), ...(api.approved.has(n) ? [{ user: { username: 'me' } }] : [])]
        return send(200, { approvals_required: 2, approvals_left: Math.max(0, 2 - by.length), approved_by: by, user_has_approved: api.approved.has(n), user_can_approve: n !== 13 })
      }
      if (req.method === 'GET' && !sub && n !== 11)
        return send(200, { iid: n, title: `MR ${n}`, description: '', state: api.merged.has(n) ? 'merged' : 'opened', author: { username: n === 13 ? 'me' : 'dev' }, source_branch: 's' + n, target_branch: 'main', sha: 'abc1234567', created_at: now, web_url: `https://gitlab2.example.test/team/app/-/merge_requests/${n}`, labels: [], reviewers: [], assignees: [], detailed_merge_status: 'mergeable', squash: false, force_remove_source_branch: true, head_pipeline: { status: 'success' }, user: { can_merge: true } })
    }
    if (req.method === 'GET' && u.pathname === '/api/v4/projects/5/merge_requests/11/notes')
      return send(200, [{ system: true, body: 'added 1 commit', author: { username: 'dev' } }, { body: 'Looks good to me', author: { username: 'dev1' }, created_at: new Date().toISOString() }, { body: 'Rename this?', author: { username: 'qa' }, created_at: new Date().toISOString(), position: { new_path: 'src/a.js', new_line: 3 } }])
    if (req.method === 'GET' && u.pathname === '/api/v4/projects/5/merge_requests/11/commits') return send(200, [{ id: 'abc1234567890', title: 'Add review change', author_name: 'Dev', created_at: new Date().toISOString() }])
    if (req.method === 'GET' && /merge_requests$/.test(u.pathname)) {
      const role = u.search.includes('reviewer_username') ? 'review' : u.search.includes('assignee_username') ? 'assigned' : u.search.includes('author_username') ? 'mine' : 'repo'
      const n = { review: 11, assigned: 12, mine: 13, repo: 14 }[role]
      if (api.merged.has(n)) return send(200, role === 'review' ? [{ iid: 99, project_id: 6, web_url: 'https://gitlab2.example.test/other/proj/-/merge_requests/99', title: 'MR other repo', author: { username: 'dev' }, source_branch: 'x', target_branch: 'main', updated_at: new Date().toISOString(), references: { full: 'other/proj!99' } }] : [])
      return send(200, [
        {
          iid: n,
          project_id: 5,
          web_url: `https://gitlab2.example.test/team/app/-/merge_requests/${n}`,
          title: `MR ${role}`,
          author: { username: role === 'mine' ? 'me' : 'dev' },
          source_branch: 's' + n,
          target_branch: 'main',
          updated_at: new Date().toISOString(),
          references: { full: `team/app!${n}` }
        },
        // one from another project: hidden unless "All repos"
        ...(role === 'review' ? [{ iid: 99, project_id: 6, web_url: 'https://gitlab2.example.test/other/proj/-/merge_requests/99', title: 'MR other repo', author: { username: 'dev' }, source_branch: 'x', target_branch: 'main', updated_at: new Date().toISOString(), references: { full: 'other/proj!99' } }] : [])
      ])
    }
    send(200, [])
  })
})
await new Promise((r) => apiServer.listen(0, '127.0.0.1', r))
const API = `http://127.0.0.1:${apiServer.address().port}`
const useLogin = () => g('config', 'credential.helper', '!f() { echo username=me; echo password=TESTTOKEN; }; f')

async function createNow(branch, menuTarget = 'main', pickReviewer = false) {
  await refresh()
  await until(() => page.$eval('.branch-chip', (c, b) => c.textContent.includes(b), branch), `header shows ${branch}`)
  await clickInRow('#side .item', menuTarget, 'More')
  await clickText('.menu button', 'Merge request')
  await clickText('.menu button', `${branch} → ${menuTarget}`)
  await until(() => exists('.mr-dialog'), 'MR dialog')
  await until(() => page.$$eval('.mr-dialog .btn', (b) => b.some((x) => x.textContent.includes('Create now'))), '"Create now" offered with the saved Git login')
  if (pickReviewer) {
    // nobody is picked by default; "Assign to me" adds yourself in one click
    await sleep(800)
    if (await page.$$eval('.mr-dialog .pp-chip', (c) => c.length > 0)) throw new Error('someone was picked by default')
    await clickText('.mr-dialog .link-btn', 'Assign to me')
    await until(() => page.$$eval('.mr-dialog .pp-chip', (c) => c.some((x) => x.textContent.includes('Me Myself'))), 'assigned to me')
    const inputs = await page.$$('.mr-dialog .pp-input')
    await inputs[1].click()
    await inputs[1].type('dev')
    await until(() => page.$$eval('.mr-dialog .pp-item', (i) => i.some((x) => x.textContent.includes('dev1'))), 'reviewer search lists dev1')
    await page.keyboard.press('Enter')
    await until(() => page.$$eval('.mr-dialog .pp-chip', (c) => c.some((x) => x.textContent.includes('Dev One') || x.textContent.includes('dev1'))), 'dev1 chosen as reviewer')
    await shot(`10a-mr-people-${branch}`)
  }
  await clickText('.mr-dialog .btn', 'Create now')
}
const dialogHas = (t) => page.evaluate((t) => !!document.querySelector('.mr-dialog')?.textContent.includes(t), t)

await step('merge request (GitLab): Create now uses the saved Git login, no glab', async () => {
  process.env.GITX_API_BASE = API + '/api/v4'
  g('switch', '-q', 'main'); g('switch', '-q', '-c', 'mr-gl'); write('gl.txt', 'gl\n'); g('add', '.'); g('commit', '-qm', 'Add GitLab change')
  g('remote', 'set-url', 'origin', 'https://gitlab2.example.test/team/app.git'); g('remote', 'set-url', '--push', 'origin', origin.replace(/\\/g, '/'))
  useLogin()
  api.calls = []
  await createNow('mr-gl', 'main', true)
  await until(() => dialogHas('created'), 'created', 20000)
  const post = api.calls.find((c) => c.method === 'POST')
  if (JSON.stringify(post?.body.assignee_ids) !== '[1]' || JSON.stringify(post?.body.reviewer_ids) !== '[2]') throw new Error('people ' + JSON.stringify(post?.body))
  if (post.body.remove_source_branch !== true || post.body.squash !== true) throw new Error('options ' + JSON.stringify(post.body))
  if (!post.body.description.includes('- Add GitLab change') || !post.body.description.includes('## What does this MR do?')) throw new Error('default description ' + JSON.stringify(post.body.description))
  if (!post || post.path !== '/api/v4/projects/team%2Fapp/merge_requests') throw new Error('POST went to ' + post?.path)
  if (!/TESTTOKEN/.test(post.auth)) throw new Error('no token sent')
  if (post.body.source_branch !== 'mr-gl' || post.body.target_branch !== 'main' || post.body.title !== 'Add GitLab change') throw new Error('body ' + JSON.stringify(post.body))
  if (!execFileSync('git', ['ls-remote', origin, 'mr-gl'], { encoding: 'utf8' }).trim()) throw new Error('branch was not pushed first')
  await shot('10-mr-gitlab-created')
  await page.keyboard.press('Escape')
})

await step('merge request (GitHub): Create now uses the saved Git login, no gh', async () => {
  process.env.GITX_API_BASE = API
  g('switch', '-q', 'main'); g('switch', '-q', '-c', 'mr-gh'); write('gh.txt', 'gh\n'); g('add', '.'); g('commit', '-qm', 'Add GitHub change')
  g('remote', 'set-url', 'origin', 'https://github.example.test/team/app.git'); g('remote', 'set-url', '--push', 'origin', origin.replace(/\\/g, '/'))
  g('config', 'gitcontrol.provider', 'github')
  api.calls = []
  await createNow('mr-gh', 'main', true)
  await until(() => dialogHas('created'), 'created', 20000)
  const rv = api.calls.find((c) => c.path.endsWith('/requested_reviewers'))
  if (JSON.stringify(rv?.body?.reviewers) !== '["dev1"]') throw new Error('reviewers ' + JSON.stringify(rv?.body))
  const as = api.calls.find((c) => c.path.endsWith('/issues/9/assignees'))
  if (JSON.stringify(as?.body?.assignees) !== '["me"]') throw new Error('assignees ' + JSON.stringify(as?.body))
  const post = api.calls.find((c) => c.method === 'POST')
  if (!post || post.path !== '/repos/team/app/pulls') throw new Error('POST went to ' + post?.path)
  if (post.body.head !== 'mr-gh' || post.body.base !== 'main' || post.body.title !== 'Add GitHub change') throw new Error('body ' + JSON.stringify(post.body))
  await page.keyboard.press('Escape')
})

await step('merge request: a refused Git login falls back to the web page', async () => {
  g('switch', '-q', 'main'); g('switch', '-q', '-c', 'mr-deny'); write('deny.txt', 'd\n'); g('add', '.'); g('commit', '-qm', 'Add denied change')
  api.deny = true
  await createNow('mr-deny')
  await until(() => dialogHas('Ready on'), 'web page offered instead', 20000)
  api.deny = false
  await page.keyboard.press('Escape')
})

await step('merge request: from main onto a feature branch flips to feature → main', async () => {
  g('switch', '-q', 'main')
  await refresh()
  await until(() => page.$eval('.branch-chip', (c) => c.textContent.includes('main')), 'on main')
  await clickInRow('#side .item', 'mr-gh', 'More')
  await clickText('.menu button', 'Merge request')
  await clickText('.menu button', 'main → mr-gh')
  await until(() => exists('.mr-dialog'), 'MR dialog')
  const route = await page.$eval('.mr-route', (r) => [...r.querySelectorAll('.ref-t')].map((x) => x.textContent).join(' → '))
  if (route !== 'mr-gh → main') throw new Error('route ' + route)
  const t = await page.$eval('.mr-dialog input[type=text]', (i) => i.value)
  if (!t) throw new Error('title is empty after the flip')
  // main has nothing mr-gh lacks: swapping back is offered as disabled, and the dialog stays
  if (!(await page.$eval('.mr-route .icon-btn', (b) => b.disabled))) throw new Error('swap should be disabled with nothing to merge the other way')
  await page.$eval('.mr-route .icon-btn', (b) => b.click())
  if (!(await exists('.mr-dialog'))) throw new Error('dialog closed after pressing a disabled swap')
  await page.keyboard.press('Escape')
})

await step('Inbox (GitLab, saved Git login): to review, assigned, opened by me, all open', async () => {
  g('config', '--unset', 'gitcontrol.provider')
  g('remote', 'set-url', 'origin', 'https://gitlab2.example.test/team/app.git')
  process.env.GITX_API_BASE = API + '/api/v4'
  await tab('Review & MR')
  await clickText('.reviews .btn', 'Refresh').catch(() => {})
  const seg = async (label, want, not) => {
    await page.evaluate((l) => [...document.querySelectorAll('.reviews .segmented button')].find((b) => b.textContent.trim() === l).click(), label)
    await until(() => page.$eval('.reviews', (r, w) => r.textContent.includes(w), want), `${label} lists ${want}`, 20000)
    if (not && (await page.$eval('.reviews', (r, n) => r.textContent.includes(n), not))) throw new Error(`${label} also lists ${not}`)
  }
  const tabBtn = (l) => `[...document.querySelectorAll('.reviews .rv-tabs button')].find((b) => b.textContent.startsWith('${l}'))`
  const seg2 = async (label, want, not) => {
    await page.evaluate(`${tabBtn(label)}.click()`)
    await until(() => page.$eval('.reviews', (r, w) => r.textContent.includes(w), want), `${label} lists ${want}`, 20000)
    if (not && (await page.$eval('.reviews .rv-list', (r, n) => r.textContent.includes(n), not))) throw new Error(`${label} also lists ${not}`)
  }
  await seg2('To review', 'MR assigned', 'MR mine')
  await seg2('Opened by me', 'MR mine', 'MR assigned')
  await seg2('All open', 'MR repo')
  await seg2('To review', 'MR review')
  // follows the repository's remote: another project's MR shows only with "All repos"
  if (await page.$eval('.reviews', (r) => r.textContent.includes('MR other repo'))) throw new Error('another repo listed by default')
  await clickText('.reviews .segmented button', 'All repos')
  await until(() => page.$eval('.reviews', (r) => r.textContent.includes('MR other repo')), 'All repos lists the other project', 20000)
  await clickText('.reviews .segmented button', 'app')
  await until(() => page.$eval('.reviews', (r) => !r.textContent.includes('MR other repo')), 'back to this repo')
  await shot('11-inbox')
  // a row opens the detail page: description, people, approvals, activity; then decide inside
  await clickText('.review-row', 'MR review')
  await until(() => page.$eval('.mr-detail .mrd-desc', (d) => d.textContent.includes('Keeps reviews in the app')).catch(() => false), 'description rendered', 20000)
  if (!(await page.$eval('.mr-detail .mrd-desc strong', (b) => b.textContent === 'reviews'))) throw new Error('markdown bold not rendered')
  const side = await page.$eval('.mr-detail .mrd-side', (x) => x.textContent)
  if (!side.includes('1 of 2') || !side.includes('dev1') || !side.includes('backend') || !side.includes('Opened by')) throw new Error('side: ' + side)
  const thread = await page.$eval('.mr-detail .mrd-thread', (x) => x.textContent)
  if (!thread.includes('Looks good to me') || !thread.includes('src/a.js:3') || thread.includes('added 1 commit')) throw new Error('activity: ' + thread)
  await shot('11b-mr-detail')
  await clickText('.mrd-tab', 'Commits')
  await until(() => page.$$eval('.mrd-commit', (c) => c.some((x) => x.textContent.includes('Add review change'))), 'commits tab')
  if (await page.$eval('.mr-detail', (x) => /\bfalse\b|\bnull\b|undefined|\[object/.test(x.textContent))) throw new Error('stray false/null text on the detail page')
  // the merge widget, like GitLab: pipeline, approvals with Approve, merge blocked until approved
  await clickText('.mrd-tab', 'Overview')
  await until(() => exists('.mr-detail .mrw'), 'merge widget')
  const mw = await page.$eval('.mr-detail .mrw', (x) => x.textContent)
  if (!/Pipeline passed/.test(mw) || !/Approved by dev1/.test(mw) || !/Merge blocked/.test(mw) || !/Needs approval/.test(mw)) throw new Error('widget: ' + mw)
  if (await page.$$eval('.mrd-bar .btn', (b) => b.some((x) => x.textContent.trim() === 'Approve'))) throw new Error('Approve is still in the bottom bar')
  await shot('11c-merge-widget')
  api.calls = []
  await clickSel('.mr-detail .mrw-approve')
  await until(() => api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/merge_requests/11/approve')), 'approve sent')
  await until(() => page.$eval('.mr-detail .mrw', (x) => /you approved/.test(x.textContent) && /Ready to merge/.test(x.textContent)).catch(() => false), 'widget re-read: approved and ready', 20000)
  if (!(await exists('.mr-detail .mrw-revoke'))) throw new Error('no Revoke approval after approving')
  await shot('11d-approved')
  // AI review waits for Start review, so the agent and instructions can be chosen first
  await clickText('.mrd-bar .btn', 'AI review')
  await until(() => exists('.ai-review-dialog'), 'AI review dialog')
  if (await exists('.ai-review-dialog .ai-result.generating')) throw new Error('AI review started without pressing Start review')
  if (!(await page.$$eval('.ai-review-dialog .btn', (b) => b.some((x) => x.textContent.includes('Start review'))))) throw new Error('no Start review button')
  await clickText('.ai-review-dialog .btn', 'Close')
  // a press outside the page closes it, like a modal
  await page.mouse.click(320, 700)
  await until(() => page.$('.mr-detail').then((x) => !x), 'detail closes on a click outside')
})
await step('Review & MR list: approve leaves To review, multi-select merge, real data after', async () => {
  await tab('Review & MR')
  await until(() => exists('.reviews .rv-tabs'), 'tabs')
  await page.evaluate(() => [...document.querySelectorAll('.reviews .rv-tabs button')].find((b) => b.textContent.startsWith('To review')).click())
  // MR review (11) was approved on its page: it is no longer waiting for me
  await until(() => page.$eval('.reviews .rv-list', (r) => !r.textContent.includes('MR review') && r.textContent.includes('MR assigned')).catch(() => false), 'approved MR left To review', 20000)
  api.calls = []
  await page.evaluate(() => [...document.querySelectorAll('.review-row')].find((r) => r.textContent.includes('MR assigned')).querySelector('.rv-approve').click())
  await until(() => api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/merge_requests/12/approve')), 'row approve sent', 20000)
  await until(() => exists('.review-row.rv-done-approve'), 'row shows it was approved')
  await until(() => page.$eval('.reviews .rv-list', (r) => !r.textContent.includes('MR assigned')).catch(() => false), 'row left To review', 20000)
  // All open still has them, with "You approved"
  await page.evaluate(() => [...document.querySelectorAll('.reviews .rv-tabs button')].find((b) => b.textContent.startsWith('All open')).click())
  await until(() => page.$$eval('.review-row', (rs) => rs.some((r) => r.textContent.includes('MR assigned') && r.textContent.includes('You approved'))), 'All open shows You approved after a real refresh', 20000)
  // select two, merge both
  for (const name of ['MR assigned', 'MR repo'])
    await page.evaluate((n) => [...document.querySelectorAll('.review-row')].find((r) => r.textContent.includes(n)).querySelector('.rv-check').click(), name)
  await until(() => page.$eval('.rv-bulk', (b) => b.classList.contains('on') && b.textContent.includes('2 selected')), 'bulk bar')
  await shot('11e-bulk')
  api.calls = []
  await clickText('.rv-bulk .btn', 'Merge 2')
  await until(() => exists('.overlay .dialog'), 'merge confirm')
  await page.evaluate(() => [...document.querySelectorAll('.overlay .dialog .btn')].find((b) => b.textContent.trim() === 'Merge').click())
  await until(() => ['12', '14'].every((n) => api.calls.some((c) => c.method === 'PUT' && c.path.endsWith(`/merge_requests/${n}/merge`))), 'both merges sent', 30000)
  const body = api.calls.find((c) => c.method === 'PUT')?.body || {}
  if (body.should_remove_source_branch !== true) throw new Error('merge options ' + JSON.stringify(body))
  await until(() => page.$eval('.reviews .rv-list', (r) => !r.textContent.includes('MR assigned') && !r.textContent.includes('MR repo')).catch(() => false), 'merged ones left the list', 20000)
  if (await page.$eval('.rv-bulk', (b) => b.classList.contains('on'))) throw new Error('bulk bar still showing')
})

await step('pipeline (GitLab): CI badge opens the pipeline, its jobs and the failed log; retry', async () => {
  g('remote', 'set-url', 'origin', 'https://gitlab2.example.test/team/app.git')
  process.env.GITX_API_BASE = API + '/api/v4'
  await tab('Graph')
  await refresh()
  await until(() => exists('.ci.ci-failed'), 'CI failed badge', 20000)
  await clickSel('.ci.ci-failed')
  await until(() => page.$$eval('.pipe-row', (r) => r.some((x) => x.textContent.includes('#100'))), 'pipeline #100 listed', 20000)
  await clickText('.pipe-row', '#100')
  await until(() => page.$$eval('.pipe-job', (j) => j.some((x) => x.textContent.includes('unit tests'))), 'jobs by stage', 20000)
  const stages = await page.$$eval('.pipe-stage .section-head', (h) => h.map((x) => x.textContent))
  if (stages.join(',') !== 'build,test') throw new Error('stages ' + stages)
  api.calls = []
  await clickText('.pipes .btn', 'Retry failed')
  await until(() => api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/pipelines/100/retry')), 'retry sent')
  await clickText('.pipe-job', 'unit tests')
  await until(() => exists('.pipe-log .pl.bad'), 'failed lines highlighted', 20000)
  const log = await page.$eval('.pipe-log', (l) => l.textContent)
  if (/\x1b|\[32m/.test(log)) throw new Error('colour codes left in the log')
  if (!log.includes('ERROR: Job failed')) throw new Error('log ' + log.slice(0, 200))
  if (await page.$eval('.sheet', (x) => /\bfalse\b|\bnull\b|\[object/.test(x.textContent))) throw new Error('stray false/null text in the pipeline sheet')
  await shot('12-pipeline-log')
  await page.keyboard.press('Escape')
  await clickSel('.sheet .sheet-close').catch(() => {})
})

await step('pipeline (GitHub): commit menu → Pipeline shows the run, jobs and log', async () => {
  g('remote', 'set-url', 'origin', 'https://github.example.test/team/app.git'); g('config', 'gitcontrol.provider', 'github')
  process.env.GITX_API_BASE = API
  await refresh()
  await page.click('.commit-row', { button: 'right' })
  await clickText('.menu button', 'Pipeline')
  await until(() => page.$$eval('.pipe-row', (r) => r.some((x) => x.textContent.includes('CI'))), 'run listed', 20000)
  await clickText('.pipe-row', 'CI')
  await until(() => page.$$eval('.pipe-job', (j) => j.some((x) => x.textContent.includes('lint'))), 'job listed', 20000)
  api.calls = []
  await clickText('.pipes .btn', 'Retry failed')
  await until(() => api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/rerun-failed-jobs')), 'rerun sent')
  await clickText('.pipe-job', 'lint')
  await until(() => page.$eval('.pipe-log', (l) => l.textContent.includes('no-unused-vars')).catch(() => false), 'log shown', 20000)
  const ts = await page.$eval('.pipe-log', (l) => /2026-11-06T00/.test(l.textContent))
  if (ts) throw new Error('timestamps not stripped')
  await clickSel('.sheet .sheet-close').catch(() => {})
  g('config', '--unset', 'gitcontrol.provider')
})

apiServer.close()

await step('AI commit dialog opens with agent, instructions and message', async () => {
  write('ai.txt', 'export const answer = 42\n')
  await refresh()
  await tab('Commit')
  await clickText('.commit-box .btn', 'AI message')
  await until(() => exists('.ai-dialog'), 'AI dialog')
  const labels = await page.$$eval('.ai-dialog label', (l) => l.map((x) => x.textContent))
  for (const want of ['Agent', 'Changes', 'Instructions', 'Message']) if (!labels.some((l) => l.includes(want))) throw new Error('missing ' + want)
  const status = await page.$eval('.ai-status', (s) => s.textContent)
  if (/object HTML/.test(status)) throw new Error('status shows ' + status)
  await shot('06-ai-dialog')
  // while the agent works: a skeleton over the message box and a live "…is thinking 2s" line
  fakes['ai.commitMessage'] = () => new Promise((r) => setTimeout(() => r('feat: add the answer'), 2600))
  await clickText('.ai-dialog .btn', 'Generate')
  await until(() => page.$eval('.ai-dialog .ai-skel', (k) => getComputedStyle(k).display === 'flex'), 'skeleton shown while generating')
  await until(() => page.$eval('.ai-status', (s) => /is (reading|thinking).*\d+s/.test(s.textContent)), 'status names the agent and counts seconds')
  await shot('06b-ai-working')
  await until(() => page.$eval('.ai-dialog .ai-result', (t) => t.value === 'feat: add the answer'), 'message filled in', 10000)
  if (await page.$eval('.ai-dialog .ai-skel', (k) => getComputedStyle(k).display !== 'none')) throw new Error('skeleton still shown after generating')
  delete fakes['ai.commitMessage']
  await clickText('.ai-dialog .btn', 'Close')
  g('clean', '-fdq')
})

await step('Commit tab shows the diff beside the files; arrow keys move', async () => {
  g('switch', '-q', 'main'); g('reset', '-q', '--hard', 'origin/main'); g('clean', '-fdq')
  write('a.txt', 'one\nTWO\nthree\n'); write('b.txt', 'b\nnew line\n')
  await refresh()
  await tab('Commit')
  await until(() => page.$('.changes-split .diff-pane'), 'split view')
  await clickText('.changes-list .item', 'a.txt')
  await until(() => page.$eval('.diff-pane', (p) => p.textContent.includes('TWO')), 'diff of a.txt in the pane')
  await page.mouse.click(700, 600) // focus the page, not an input
  await page.keyboard.press('ArrowDown')
  await until(() => page.$eval('.diff-pane', (p) => p.textContent.includes('new line')), 'ArrowDown shows b.txt')
  await shot('09-commit-split')
  g('checkout', '--', 'a.txt', 'b.txt')
})

await step('cleans up merged and gone branches', async () => {
  g('branch', '-q', 'done-1', 'main'); g('branch', '-q', 'done-2', 'main')
  await refresh()
  await clickSel('#side [title="Clean up merged and gone branches"]')
  await until(() => page.evaluate(() => document.querySelector('.overlay .dialog')?.textContent.includes('done-1')), 'clean-up list')
  await clickText('.overlay .btn', 'Delete selected')
  await until(() => !g('branch', '--list', 'done-1', 'done-2'), 'branches deleted')
})

await step('undo takes back the last commit and keeps its changes', async () => {
  write('undo.txt', 'u\n'); g('add', '.'); g('commit', '-qm', 'Commit to undo')
  const before = g('rev-parse', 'HEAD~1')
  await refresh()
  await clickSel('[title^="Undo the last action"]')
  await dialogOpen()
  const t = await page.$eval('.overlay .dialog', (d) => d.textContent)
  if (!t.includes('Commit to undo')) throw new Error('undo dialog: ' + t.slice(0, 120))
  await submitDialog()
  await until(() => g('rev-parse', 'HEAD') === before, 'HEAD moved back')
  if (!g('status', '--porcelain').includes('undo.txt')) throw new Error('the undone commit lost its changes')
  g('reset', '-q', '--hard'); g('clean', '-fdq')
})

await step('resolves a merge conflict block by block', async () => {
  g('switch', '-q', '-c', 'conf-a'); write('c.txt', 'top\nA side\nbottom\n'); g('add', '.'); g('commit', '-qm', 'A')
  g('switch', '-q', 'main'); g('switch', '-q', '-c', 'conf-b'); write('c.txt', 'top\nB side\nbottom\n'); g('add', '.'); g('commit', '-qm', 'B')
  try { g('merge', 'conf-a') } catch {}
  await refresh()
  await tab('Commit')
  await clickText('.changes-list .item', 'c.txt')
  await until(() => page.$('.resolver .res-block'), 'resolver opens')
  await clickText('.res-block .btn', 'Use both')
  await shot('10-resolver')
  await clickText('.sheet .btn.primary', 'Save & mark resolved')
  await until(() => !g('diff', '--name-only', '--diff-filter=U'), 'no conflicts left')
  const out = readFileSync(path.join(repo, 'c.txt'), 'utf8')
  if (!out.includes('B side') || !out.includes('A side') || out.includes('<<<<<<<')) throw new Error('resolved file: ' + out)
  g('commit', '-qm', 'merge resolved', '--no-edit')
})

await step('identity profiles: save once, use for this repo or set global with one click', async () => {
  await tab('Settings')
  await until(() => exists('.idp-section'), 'profiles section')
  await page.click('.idp-section [title="New profile"]')
  await until(() => exists('.overlay .dialog'), 'new profile dialog')
  const fill = async (label, value) => {
    const i = await page.evaluateHandle((l) => [...document.querySelectorAll('.overlay .field')].find((f) => f.querySelector('label')?.textContent.includes(l))?.querySelector('input'), label)
    await i.click({ clickCount: 3 })
    await i.type(value)
  }
  await fill('Profile name', 'Work')
  await fill('Name (user.name)', 'Work Person')
  await fill('Email (user.email)', 'work@company.test')
  await submitDialog()
  await until(() => page.$$eval('.idp', (c) => c.some((x) => x.textContent.includes('Work') && x.textContent.includes('work@company.test'))), 'Work profile listed')
  const clickIn = (btn) => page.evaluate((b) => [...[...document.querySelectorAll('.idp')].find((x) => x.textContent.includes('work@company.test')).querySelectorAll('button')].find((x) => x.textContent === b).click(), btn)
  await clickIn('Use for this repo')
  await until(() => g('config', '--local', 'user.email') === 'work@company.test', 'repo email set')
  if (g('config', '--local', 'user.name') !== 'Work Person') throw new Error('repo name not set')
  await until(() => page.$$eval('.idp', (c) => c.some((x) => x.textContent.includes('work@company.test') && x.textContent.includes('This repo'))), 'marked "This repo"')
  await clickIn('Set global')
  await until(() => readFileSync(GLOBAL_CFG, 'utf8').includes('work@company.test'), 'global email set (test config only)')
  await shot('13-identity-profiles')
  g('config', '--local', '--unset', 'user.email'); g('config', '--local', '--unset', 'user.name')
})

await step('no stray "false", "null" or "[object" text anywhere', async () => {
  const bad = await page.evaluate(() => {
    const out = []
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (w.nextNode()) if (!w.currentNode.parentElement.closest('.cfg-val, .cfg-row, input, textarea') && /^(false|null|undefined|\[object [A-Za-z]+\])$/.test(w.currentNode.textContent.trim())) out.push(w.currentNode.parentElement.className + ': ' + w.currentNode.textContent)
    return out
  })
  if (bad.length) throw new Error(bad.join('; '))
})

await step('no page errors', async () => {
  if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 5).join(' | '))
})

} catch (e) {
  results.push({ name: 'setup', ok: false, ms: 0, error: e.message })
} finally {
  // close Chrome and delete the throwaway repositories even when something throws outside step()
  await browser?.close().catch(() => {})
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {}
}
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms} ms)${r.ok ? '' : `\n      ${r.error}${r.toasts ? `\n      toasts: ${r.toasts}` : ''}`}`)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
process.exit(results.length && results.every((r) => r.ok) ? 0 : 1)
