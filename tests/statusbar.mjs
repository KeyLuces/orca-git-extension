// The Git status bar item stays visible: node tests/statusbar.mjs
// With no way to tell the focused worktree (Orca gives no context), it must still show "Git".
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')))
process.env.GITX_NO_BROWSER = '1'
const sent = []
const orca = {
  panels: { handle() {}, post() {} },
  host: { has: (n) => n === 'statusBar.update', call: async (n, a) => { if (n === 'statusBar.update') sent.push(a); if (n === 'workspace.readContext') throw new Error('no context'); return {} } },
  commands: { register() {} }, events: { on() {} }, log() {}
}
const mod = await import(pathToFileURL(path.resolve(ROOT, '../worker/main.mjs')).href)
mod.default(orca)
const t0 = Date.now()
while (!sent.some((s) => s.id === 'branch') && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100))
const b = sent.find((s) => s.id === 'branch')
const ok = !!b && b.visible === true && b.text === 'Git'
console.log(`${ok ? 'PASS' : 'FAIL'} statusbar: Git stays visible when the worktree is unknown${ok ? '' : ' :: ' + JSON.stringify(sent)}`)
process.exit(ok ? 0 : 1)
