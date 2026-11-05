// Blackbox end-to-end test: the real Git Graph tab (panel/tab.html + app.js + style.css) in headless
// Chrome, wired to the real worker (worker/main.mjs) in this Node process. The test only clicks, types
// and reads the page, then checks the repository from outside with plain git.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
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
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1500,900'] })
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 900 })
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && !/favicon|status of 404/.test(m.text()) && consoleErrors.push(m.text()))
await page.exposeFunction('__orcaRequest', async (name, input) => {
  try {
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
const results = []
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

await step('opens commit details inline and closes them', async () => {
  await clickText('.commit-row', 'Add b')
  await until(() => page.$eval('.commit-inline .inline-files', (e) => e.textContent.includes('b.txt')), 'inline files list b.txt')
  await shot('02-inline-details')
  await clickSel('.commit-inline [title="Close"]')
  await until(() => page.$('.commit-inline').then((x) => !x), 'inline details close')
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
  await dialogOpen()
  const text = await page.$eval('.overlay .dialog', (d) => d.textContent)
  if (!/uncommitted changes/i.test(text)) throw new Error('dialog does not explain the changes: ' + text.slice(0, 120))
  if (!/Merge them/.test(text)) throw new Error('no Merge option in dialog')
  await submitDialog() // default: stash, switch, bring back
  await until(() => g('branch', '--show-current') === 'main', 'on main')
  const st = g('status', '--porcelain')
  const stashes = g('stash', 'list')
  if (!st && !stashes) throw new Error('local change was lost')
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
  await clickInRow('.view .item', '', 'Pop (apply and drop)')
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
  const text = await until(() => page.evaluate(() => [...document.querySelectorAll('.ref.synced')].map((e) => e.textContent).join('|')), 'synced label')
  if (!/main\s*origin/.test(text)) throw new Error('synced label reads: ' + text)
  const separateOriginMain = await page.$$eval('.ref.remote .ref-t', (t) => t.some((x) => x.textContent === 'origin/main'))
  if (separateOriginMain) throw new Error('origin/main is still a separate label while in sync')
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
  await clickText('.menu button', 'Merge request: mr-branch → main')
  await until(() => exists('.mr-dialog'), 'MR dialog')
  const d = await page.$eval('.mr-dialog', (x) => x.textContent)
  if (!d.includes('mr-branch') || !d.includes('gitlab.example.test')) throw new Error('dialog: ' + d.slice(0, 200))
  const t = await page.$eval('.mr-dialog input[type=text]', (i) => i.value)
  if (t !== 'Add MR change') throw new Error('title prefilled as ' + t)
  await shot('07-mr-dialog')
  await clickText('.mr-dialog .btn.primary', 'Push & open')
  await until(() => page.evaluate(() => document.querySelector('.mr-dialog')?.textContent.includes('Ready to finish')), 'finish step', 20000)
  if (!execFileSync('git', ['ls-remote', origin, 'mr-branch'], { encoding: 'utf8' }).trim()) throw new Error('branch was not pushed')
  await shot('08-mr-done')
  await clickText('.mr-dialog .btn', 'Close')
})

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
  await clickText('.ai-dialog .btn', 'Cancel')
  g('clean', '-fdq')
})

await step('no stray "false", "null" or "[object" text anywhere', async () => {
  const bad = await page.evaluate(() => {
    const out = []
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (w.nextNode()) if (/^(false|null|undefined|\[object [A-Za-z]+\])$/.test(w.currentNode.textContent.trim())) out.push(w.currentNode.parentElement.className + ': ' + w.currentNode.textContent)
    return out
  })
  if (bad.length) throw new Error(bad.join('; '))
})

await step('no page errors', async () => {
  if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 5).join(' | '))
})

await browser.close()
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms} ms)${r.ok ? '' : `\n      ${r.error}${r.toasts ? `\n      toasts: ${r.toasts}` : ''}`}`)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
try {
  rmSync(root, { recursive: true, force: true })
} catch {}
process.exit(results.every((r) => r.ok) ? 0 : 1)
