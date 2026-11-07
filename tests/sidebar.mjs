// Right-sidebar check: panel/sidebar.html (the narrow Git Control panel) at sidebar width, wired to the
// real worker on a throwaway repository that Orca reports as the focused workspace.
//   node sidebar.mjs <plugin folder> <screenshot folder>
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const PLUGIN = process.argv[2]
const SHOTS = process.argv[3]
mkdirSync(SHOTS, { recursive: true })
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const root = mkdtempSync(path.join(tmpdir(), 'gitx-side-'))
process.env.GIT_CONFIG_GLOBAL = path.join(root, 'global.gitconfig') // never the person's real config
writeFileSync(process.env.GIT_CONFIG_GLOBAL, '[user]\n\tname = Side Tester\n\temail = side@e2e.test\n')
process.env.GIT_CONFIG_NOSYSTEM = '1'
// Hide gh/glab: the test must never reach the person's real GitHub/GitLab accounts.
process.env.PATH = process.env.PATH.split(path.delimiter).filter((d) => !['gh.exe', 'glab.exe', 'gh', 'glab'].some((b) => { try { return statSync(path.join(d, b)).isFile() } catch { return false } })).join(path.delimiter)
process.env.GITX_NO_BROWSER = '1'
let browser = null
const results = []
try {
  const origin = path.join(root, 'origin.git')
  const repo = path.join(root, 'app')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin])
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  const g = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim()
  for (let i = 1; i <= 4; i++) {
    writeFileSync(path.join(repo, `f${i}.txt`), `${i}\n`)
    g('add', '.')
    g('commit', '-qm', `Commit number ${i}`)
  }
  g('remote', 'add', 'origin', origin)
  g('push', '-qu', 'origin', 'main')
  writeFileSync(path.join(repo, 'f5.txt'), '5\n')
  g('add', '.')
  g('commit', '-qm', 'Not pushed yet')
  writeFileSync(path.join(repo, 'f1.txt'), 'changed\n')

  const { default: activate } = await import(pathToFileURL(path.join(PLUGIN, 'worker/main.mjs')).href)
  const handlers = {}
  activate({
    api: { major: 1, minor: 3 },
    log() {},
    panels: { handle: (n, f) => (handlers[n] = f), post() {} },
    commands: { register: () => ({}) },
    events: { on: () => ({}) },
    host: {
      has: (m) => ['settings.get', 'workspace.list', 'workspace.readContext'].includes(m),
      call: async (m) => {
        if (m === 'workspace.list') return { workspaces: [{ name: 'main', displayName: 'main', branch: 'main', path: repo }] }
        if (m === 'workspace.readContext') return { displayName: 'main', branch: 'main', terminals: [] }
        return { settings: {} }
      }
    }
  })

  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage()
  await page.setViewport({ width: 340, height: 820 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.exposeFunction('__orcaRequest', async (name, input) => {
    try {
      return { out: await handlers[name](input) }
    } catch (e) {
      return { error: e.message }
    }
  })
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('dark'))
    window.orca = Object.freeze({
      api: { major: 1, minor: 3 },
      locale: 'en',
      plugin: {
        request: async (name, input) => {
          const r = await window.__orcaRequest(name, input ?? null)
          if (r.error) throw new Error(r.error)
          return r.out
        }
      },
      host: { has: () => false, call: async () => ({}) },
      on: () => ({ dispose() {} })
    })
  })
  const html = readFileSync(path.join(PLUGIN, 'panel/sidebar.html'), 'utf8')
  await page.setRequestInterception(true)
  page.on('request', (req) => (new URL(req.url()).hostname === 'gitx.test' ? req.respond({ status: 200, contentType: 'text/html', body: html }) : req.respond({ status: 404, body: '' })))
  await page.goto('http://gitx.test/sidebar.html', { waitUntil: 'domcontentloaded' })

  const until = async (fn, label, ms = 10000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      try {
        if (await fn()) return
      } catch {}
      await new Promise((r) => setTimeout(r, 150))
    }
    throw new Error('timed out: ' + label)
  }
  const step = async (name, fn) => {
    try {
      await fn()
      results.push([true, name])
      console.log('PASS ', name)
    } catch (e) {
      results.push([false, name])
      console.log('FAIL ', name, '\n     ', e.message)
      await page.screenshot({ path: path.join(SHOTS, 'side-FAIL.png') }).catch(() => {})
    }
  }

  await step('follows the focused project and shows its changes', async () => {
    await until(() => page.$eval('#repoName', (e) => e.textContent === 'app'), 'repo name app')
    await until(() => page.$$eval('#main .item', (r) => r.some((x) => x.textContent.includes('f1.txt'))), 'changed file listed')
  })
  await step('push count on the Push button (green arrow), toolbar fits', async () => {
    await until(() => page.$eval('#toolbar [data-op="push"] .tb-count', (c) => c.textContent.includes('1')), 'push ↑1')
    const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
    if (over) throw new Error('the panel scrolls sideways')
  })
  await step('one button opens the full Git Control tab', async () => {
    if (!(await page.$('#toolbar [title="Open Git Control in a full tab"]'))) throw new Error('no open-in-tab button')
  })
  await page.screenshot({ path: path.join(SHOTS, 'side-panel.png') })
  if (errors.length) results.push([false, 'page errors: ' + errors.join(' | ')]), console.log('FAIL  page errors', errors)
} catch (e) {
  results.push([false, 'crash'])
  console.log('CRASH', e.stack)
} finally {
  await browser?.close()
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {}
}
const passed = results.filter((r) => r[0]).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
