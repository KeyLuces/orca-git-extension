// Git Extension panel. Plain JS, no dependencies. Talks to worker/main.mjs through orca.plugin.request.
'use strict'

/* =========================================================================
   tiny DOM helpers
   ========================================================================= */
const $ = (sel, root = document) => root.querySelector(sel)

function h(tag, props, ...children) {
  const el = document.createElement(tag)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue
      if (k === 'class') el.className = v
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v)
      else if (k === 'html') el.innerHTML = v
      else if (k in el && typeof v !== 'string') el[k] = v
      else el.setAttribute(k, v === true ? '' : v)
    }
  }
  append(el, children)
  return el
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return el
}
const clear = (el) => {
  el.replaceChildren()
  return el
}

const ICONS = {
  branch: '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  pull: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  push: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  fetch: '<path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/>',
  stash: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  commit: '<circle cx="12" cy="12" r="3"/><line x1="3" x2="9" y1="12" y2="12"/><line x1="15" x2="21" y1="12" y2="12"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  worktree: '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>',
  settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  open: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  compare: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  sparkle: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
  expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  edit: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>'
}
function icon(name, size = 14) {
  const span = document.createElement('span')
  span.style.display = 'inline-flex'
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`
  return span
}
const iconBtn = (name, title, onClick, extra = {}) =>
  h('button', { class: 'icon-btn', title, 'aria-label': title, onClick, ...extra }, icon(name))

const esc = (s) => String(s)
const basename = (p) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop()
const dirname = (p) => {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}
function ago(t) {
  const s = Date.now() / 1000 - t
  if (s < 60) return 'just now'
  const units = [
    [31536000, 'y'],
    [2592000, 'mo'],
    [604800, 'w'],
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm']
  ]
  for (const [n, u] of units) if (s >= n) return `${Math.floor(s / n)}${u} ago`
  return ''
}
const fullDate = (t) => new Date(t * 1000).toLocaleString()

/* =========================================================================
   worker bridge
   ========================================================================= */
const hasOrca = typeof window.orca !== 'undefined'
// Opened as a full editor tab (custom editor for .gitgraph files) rather than the sidebar panel.
const IN_TAB = hasOrca && !!window.orca.document
let docRepo = null
const ignoredGraphIn = new Set()

async function request(name, input, timeoutMs = 30000) {
  if (!hasOrca) throw new Error('Open this panel inside Orca')
  if (window.orca.plugin?.request) return window.orca.plugin.request(name, input, { timeoutMs })
  const r = await window.orca.host.call('plugin.request', { name, input, timeoutMs })
  return r.output
}
const NET_OPS = new Set(['fetch', 'pull', 'push', 'remoteBranchDelete', 'tagPush', 'worktreeAdd', 'commit'])
const call = (op, args = {}) =>
  request('git', { op, repo: state.repo, args }, NET_OPS.has(op) ? 120000 : 30000)

/* =========================================================================
   state
   ========================================================================= */
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('gitx.' + k)
      return v == null ? d : JSON.parse(v)
    } catch {
      return d
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('gitx.' + k, JSON.stringify(v))
    } catch {}
  }
}

const state = {
  repo: null,
  pinned: IN_TAB ? null : store.get('pinnedRepo', null), // null = follow the focused Orca workspace
  workspaces: [],
  status: null,
  tab: IN_TAB ? 'history' : store.get('tab', 'changes'),
  busy: 0,
  history: { all: store.get('historyAllV2', true), search: '', commits: [], done: false },
  configScope: store.get('configScope', 'global'),
  commitDraft: '',
  amend: false,
  sheets: []
}

/* =========================================================================
   feedback: toasts, dialogs, menus
   ========================================================================= */
function toast(msg, kind = 'ok', ms) {
  const el = h('div', { class: `toast ${kind}` }, icon(kind === 'error' ? 'alert' : 'check'), h('div', { class: 'grow' }, msg))
  el.addEventListener('click', () => el.remove())
  $('#toasts').append(el)
  setTimeout(() => el.remove(), ms ?? (kind === 'error' ? 9000 : 2600))
}

function closeOverlays() {
  document.querySelectorAll('.menu, .overlay').forEach((e) => e.remove())
}

/** fields: [{ key, label, value, placeholder, type: 'text'|'textarea'|'select'|'check', options: [[value,label]], hint }] */
function dialog({ title, message, fields = [], ok = 'OK', danger = false, cancel = 'Cancel' }) {
  closeOverlays()
  return new Promise((resolve) => {
    const inputs = {}
    const form = h('form', { class: 'dialog', onSubmit: (e) => (e.preventDefault(), done(true)) })
    const done = (okd) => {
      overlay.remove()
      document.removeEventListener('keydown', onKey)
      if (!okd) return resolve(null)
      const out = {}
      for (const [k, el] of Object.entries(inputs)) out[k] = el.type === 'checkbox' ? el.checked : el.value
      resolve(out)
    }
    const onKey = (e) => e.key === 'Escape' && done(false)
    append(form, [h('h3', null, title), message && h('p', null, message)])
    for (const f of fields) {
      let el
      if (f.type === 'check') {
        el = h('input', { type: 'checkbox', checked: !!f.value })
        form.append(h('label', { class: 'check' }, el, f.label))
      } else {
        if (f.type === 'select')
          el = h('select', null, f.options.map(([v, l]) => h('option', { value: v, selected: v === f.value }, l)))
        else if (f.type === 'textarea') el = h('textarea', { placeholder: f.placeholder || '' }, f.value || '')
        else el = h('input', { type: 'text', value: f.value || '', placeholder: f.placeholder || '', spellcheck: 'false' })
        form.append(h('div', { class: 'field' }, h('label', null, f.label), el, f.hint && h('div', { class: 'hint' }, f.hint)))
      }
      inputs[f.key] = el
    }
    form.append(
      h(
        'div',
        { class: 'buttons' },
        cancel && h('button', { type: 'button', class: 'btn', onClick: () => done(false) }, cancel),
        h('button', { type: 'submit', class: `btn ${danger ? 'danger solid' : 'primary'}` }, ok)
      )
    )
    const overlay = h('div', { class: 'overlay', onMousedown: (e) => e.target === overlay && done(false) }, form)
    document.body.append(overlay)
    document.addEventListener('keydown', onKey)
    const first = form.querySelector('input:not([type=checkbox]), textarea, select') || form.querySelector('button[type=submit]')
    first?.focus()
    first?.select?.()
  })
}
const confirmBox = (title, message, ok = 'Confirm', danger = false) =>
  dialog({ title, message, ok, danger }).then((r) => r !== null)

/** A right-click opens the row's menu at the pointer; `menu` reads it once. */
let menuPoint = null
/**
 * items: { label, icon, onClick, danger, disabled, hint, items } | '-' | { header }. anchor: an element
 * or { x, y }. An item with `items` is a cascading sub-menu: pointing at it opens the next level
 * beside it (Enter or → from the keyboard), and choosing anything closes every level.
 */
function menu(anchor, items, parent = null) {
  if (!parent) closeOverlays()
  const el = h('div', { class: 'menu', role: 'menu' })
  el.closeAll = () => {
    let root = el
    while (root.parentMenu) root = root.parentMenu
    root.closeChild?.()
    root.remove()
  }
  el.parentMenu = parent
  el.closeChild = () => {
    el.child?.closeChild?.()
    el.child?.remove()
    el.child = null
    el.querySelectorAll('button.open').forEach((b) => b.classList.remove('open'))
  }
  let hoverTimer = 0
  const openSub = (btn, it) => {
    if (el.child?.owner === btn) return
    el.closeChild()
    btn.classList.add('open')
    const r = btn.getBoundingClientRect()
    el.child = menu({ x: r.right - 2, y: r.top - 5, side: r.left + 2 }, it.items, el)
    el.child.owner = btn
  }
  for (const it of items) {
    if (!it) continue
    if (it === '-') el.append(h('hr'))
    else if (it.header) el.append(h('div', { class: 'label' }, it.header))
    else {
      const empty = it.items && !it.items.filter(Boolean).length
      const btn = h(
        'button',
        {
          class: [it.danger ? 'danger' : '', it.items ? 'has-sub' : ''].join(' ').trim(),
          disabled: it.disabled || empty,
          'aria-haspopup': it.items ? 'menu' : null,
          onMouseenter: () => {
            clearTimeout(hoverTimer)
            // A short pause lets the pointer cross other items on its way to an open sub-menu.
            hoverTimer = setTimeout(() => (it.items ? openSub(btn, it) : el.closeChild()), it.items ? 80 : 160)
          },
          onKeydown: (e) => {
            if (it.items && e.key === 'ArrowRight') (e.preventDefault(), openSub(btn, it), el.child?.querySelector('button:not(:disabled)')?.focus())
            if (e.key === 'ArrowLeft' && parent) (e.preventDefault(), el.owner?.focus(), parent.closeChild())
          },
          onClick: () => {
            if (it.items) return openSub(btn, it)
            el.closeAll()
            it.onClick()
          }
        },
        it.icon ? icon(it.icon) : h('span', { style: { width: '14px' } }),
        h('span', { class: 'grow ellipsis' }, it.label),
        it.hint && h('span', { class: 'dim', style: { fontSize: '11px' } }, it.hint),
        it.items && h('span', { class: 'dim sub-arrow', 'aria-hidden': 'true' }, '›')
      )
      el.append(btn)
    }
  }
  el.addEventListener('mouseenter', () => clearTimeout(hoverTimer))
  document.body.append(el)
  const point = menuPoint ?? (typeof anchor?.x === 'number' && !anchor.getBoundingClientRect ? anchor : null)
  menuPoint = null
  const mw = el.offsetWidth
  const mh = el.offsetHeight
  let left, top
  if (parent) {
    // Beside the item; to its left when there is no room on the right.
    left = point.x + mw > window.innerWidth - 8 ? Math.max(8, point.side - mw) : point.x
    top = Math.max(8, Math.min(point.y, window.innerHeight - mh - 8))
  } else {
    const r = point ? { left: point.x, right: point.x + mw, top: point.y, bottom: point.y } : anchor.getBoundingClientRect()
    left = Math.min(r.right - mw, window.innerWidth - mw - 8)
    if (left < 8) left = 8
    top = r.bottom + 4
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4)
  }
  el.style.left = left + 'px'
  el.style.top = top + 'px'
  if (!parent)
    setTimeout(() => {
      const off = (e) => {
        if (![...document.querySelectorAll('.menu')].some((m) => m.contains(e.target))) {
          el.closeAll()
          document.removeEventListener('mousedown', off, true)
        }
      }
      document.addEventListener('mousedown', off, true)
    })
  return el
}

/* =========================================================================
   running git operations
   ========================================================================= */
function setBusy(delta) {
  state.busy += delta
  let bar = $('.loading')
  if (state.busy > 0 && !bar) $('#main').prepend(h('div', { class: 'loading' }))
  if (state.busy <= 0) bar?.remove()
}

/** Run an op with a spinner and error toast, then refresh. Returns the result, or undefined on failure. */
async function run(op, args, { success, refresh = true, quiet = false } = {}) {
  setBusy(1)
  try {
    const out = await call(op, args)
    if (success) toast(success)
    else if (!quiet && typeof out === 'string' && out.trim() && NET_OPS.has(op)) toast(out.trim().split('\n').slice(-3).join('\n'))
    return out ?? ''
  } catch (e) {
    toast(e?.message || String(e), 'error')
    return undefined
  } finally {
    setBusy(-1)
    if (refresh) await refreshAll()
  }
}

/* =========================================================================
   repository selection
   ========================================================================= */
async function resolveRepo() {
  if (IN_TAB && !docRepo) {
    // The tab's file names the repository it was opened from: a fallback when focus is unknown.
    try {
      const doc = await window.orca.document.get()
      docRepo = JSON.parse(doc.content.text || '{}').repo || null
    } catch {}
  }
  let res = { focused: null, workspaces: [] }
  try {
    res = await request('repo.resolve', {})
  } catch (e) {
    toast(e.message, 'error')
  }
  state.workspaces = res.workspaces || []
  // A Git Graph tab belongs to one project (its file lives there), so it shows that project.
  // The sidebar panel follows whatever is focused.
  const target = state.pinned || (IN_TAB ? docRepo || res.focused : res.focused)
  if (target !== state.repo) setRepo(target)
  // A Git Graph tab file (untitled.gitgraph from the + menu) must never show up as a change.
  if (IN_TAB && target && !ignoredGraphIn.has(target)) {
    ignoredGraphIn.add(target)
    request('repo.ignoreGraphFiles', { repo: target }).catch(() => {})
  }
}

/** Point the view at another repository, showing its last snapshot right away when there is one. */
function setRepo(p) {
  state.repo = p
  state.status = null
  state.refs = null
  state.history.commits = []
  state.history.done = false
  state.history.open = null
  state.sheets = []
  if (p) store.set('lastRepo', p)
  const s = p && snap.load(p)
  if (s) {
    state.status = s.status
    state.refs = s.refs
    if (s.all === state.history.all && s.commits?.length && !state.history.search) {
      state.history.commits = s.commits
      state.history.stale = true
    }
  }
}

/* Per-repository snapshot (status, refs, first page of history) so a view renders instantly. */
const snap = {
  key: (p) => 'gitx.snap.' + p.replace(/\\/g, '/').toLowerCase(),
  load(p) {
    try {
      return JSON.parse(localStorage.getItem(snap.key(p)) || 'null')
    } catch {
      return null
    }
  },
  save() {
    if (!state.repo || !state.status) return
    const H = state.history
    const prev = snap.load(state.repo) || {}
    const commits = !H.search && H.commits.length ? H.commits.slice(0, 150) : prev.all === H.all ? prev.commits : null
    try {
      localStorage.setItem(snap.key(state.repo), JSON.stringify({ status: state.status, refs: state.refs, all: H.all, commits }))
    } catch {}
  }
}

function repoMenu(anchor) {
  const ws = state.workspaces.filter((w) => w.kind === 'worktree' || w.kind === 'folder')
  menu(anchor, [
    { header: 'Repository' },
    {
      label: 'Follow focused workspace',
      icon: state.pinned ? null : 'check',
      onClick: async () => {
        state.pinned = null
        store.set('pinnedRepo', null)
        await resolveRepo()
        refreshAll()
      }
    },
    '-',
    ...ws.slice(0, 40).map((w) => ({
      label: w.name,
      hint: w.branch || '',
      icon: state.pinned === w.path ? 'check' : w.kind === 'worktree' ? 'branch' : 'folder',
      onClick: () => pinRepo(w.path)
    })),
    ws.length ? '-' : null,
    { label: 'Clone repository…', icon: 'download', onClick: cloneRepo },
    {
      label: 'Open path…',
      icon: 'folder',
      onClick: async () => {
        const r = await dialog({
          title: 'Open repository',
          fields: [{ key: 'path', label: 'Folder path', value: state.repo || '', placeholder: 'C:\\code\\my-repo' }],
          ok: 'Open'
        })
        if (!r?.path) return
        const chk = await request('repo.check', { path: r.path.trim() })
        if (chk.ok) pinRepo(chk.toplevel)
        else {
          const init = await confirmBox('Not a Git repository', `${r.path}\n\nInitialize a new repository here?`, 'git init')
          if (init) {
            await request('git', { op: 'init', args: { path: r.path.trim() } }).catch((e) => toast(e.message, 'error'))
            pinRepo(r.path.trim())
          }
        }
      }
    }
  ])
}
function pinRepo(p) {
  state.pinned = p
  if (!IN_TAB) store.set('pinnedRepo', p)
  setRepo(p)
  renderAll()
  refreshAll()
}

/* =========================================================================
   header
   ========================================================================= */
function renderHeader() {
  const st = state.status
  clear($('#repoIcon')).append(icon(state.pinned ? 'folder' : 'worktree', 14))
  $('#repoName').textContent = state.repo ? basename(st?.toplevel || state.repo) : 'No repository'
  $('#repoBtn').title = state.repo || 'Choose a repository'
  clear($('#repoCaret')).append(icon('down', 12))

  const tb = clear($('#toolbar'))
  const dis = !state.repo || !st
  // In the full tab the main actions carry a label, like a toolbar; in the narrow panel icons only.
  const lbl = (b, text) => (IN_TAB && b.append(h('span', { class: 'tb-label' }, text)), b)
  const st0 = st || {}
  append(tb, [
    lbl(iconBtn('fetch', 'Fetch all (prune)', () => run('fetch', {}, { success: 'Fetched' }), { disabled: dis }), 'Fetch'),
    lbl(iconBtn('pull', 'Pull', (e) => pullMenu(e.currentTarget), { disabled: dis }), st0.behind ? `Pull ${st0.behind}` : 'Pull'),
    lbl(iconBtn('push', 'Push', (e) => pushMenu(e.currentTarget), { disabled: dis }), st0.ahead ? `Push ${st0.ahead}` : 'Push'),
    IN_TAB && lbl(iconBtn('stash', 'Stash changes', () => run('stashSave', { untracked: true }, { success: 'Stashed' }), { disabled: dis || !st0.files?.length }), 'Stash'),
    iconBtn('refresh', 'Refresh', () => refreshAll(true), { disabled: !state.repo }),
    iconBtn('settings', 'Git settings (identity, HTTPS, remotes)', () => setTab('settings'), { disabled: !state.repo }),
    !IN_TAB && iconBtn('expand', 'Open Git Graph in a full tab', openTab, { disabled: dis })
  ])

  const bl = clear($('#branchLine'))
  if (!st) return
  append(bl, [
    h(
      'button',
      { class: 'branch-chip', title: 'Switch branch', onClick: (e) => quickSwitch(e.currentTarget) },
      icon('branch', 12),
      h('span', { class: 'ellipsis' }, st.branch || `detached @ ${(st.oid || '').slice(0, 7)}`),
      icon('down', 11)
    ),
    st.upstream
      ? h(
          'span',
          { class: 'sync', title: `Tracking ${st.upstream}` },
          h('span', { class: 'row', style: { gap: '2px' } }, icon('push', 11), st.ahead),
          h('span', { class: 'row', style: { gap: '2px' } }, icon('pull', 11), st.behind)
        )
      : st.branch && h('span', { class: 'sync' }, 'not published')
  ])
}

async function openTab() {
  setBusy(1)
  try {
    await request('tab.open', { repo: state.repo }, 20000)
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    setBusy(-1)
  }
}

/** Ask the AI agent (Settings → Plugins → Git Extension) to resolve the current conflicts in a terminal. */
async function resolveWithAi() {
  setBusy(1)
  try {
    const r = await request('ai.resolve', { repo: state.repo }, 30000)
    toast(`${r.agent} is resolving the conflicts in a new terminal. Review its work, then press Continue.`, 'ok', 7000)
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    setBusy(-1)
  }
}

function pullMenu(anchor) {
  menu(anchor, [
    { label: 'Pull (merge)', icon: 'pull', onClick: () => run('pull', {}, { success: 'Pulled' }) },
    { label: 'Pull (rebase)', icon: 'pull', onClick: () => run('pull', { rebase: true }, { success: 'Pulled with rebase' }) },
    { label: 'Pull (fast-forward only)', icon: 'pull', onClick: () => run('pull', { ffOnly: true }, { success: 'Pulled' }) },
    '-',
    { label: 'Fetch all', icon: 'fetch', onClick: () => run('fetch', {}, { success: 'Fetched' }) }
  ])
}
function pushMenu(anchor) {
  menu(anchor, [
    { label: 'Push', icon: 'push', onClick: () => run('push', {}, { success: 'Pushed' }) },
    { label: 'Push with tags', icon: 'tag', onClick: () => run('push', { tags: true }, { success: 'Pushed' }) },
    '-',
    {
      label: 'Force push (with lease)…',
      icon: 'alert',
      danger: true,
      onClick: async () => {
        if (await confirmBox('Force push?', 'This overwrites the remote branch if nobody else pushed since your last fetch.', 'Force push', true))
          run('push', { force: true }, { success: 'Force pushed' })
      }
    }
  ])
}

async function quickSwitch(anchor) {
  let r
  try {
    r = await call('refs')
  } catch (e) {
    return toast(e.message, 'error')
  }
  const local = r.local.filter((b) => !b.current).slice(0, 15)
  menu(anchor, [
    { header: 'Switch to' },
    ...local.map((b) => ({ label: b.name, icon: 'branch', onClick: () => checkout(b.name) })),
    local.length ? '-' : null,
    { label: 'New branch…', icon: 'plus', onClick: () => newBranch() },
    { label: 'All branches', icon: 'right', onClick: () => setTab('branches') }
  ])
}

function renderBanner() {
  const b = clear($('#banner'))
  const st = state.status
  if (st?.bisect && !st.state) return b.append(bisectBanner(st))
  if (!st?.state) return
  const conflicts = st.files.filter((f) => f.conflict).length
  const labels = { merge: 'Merge', rebase: 'Rebase', 'cherry-pick': 'Cherry-pick', revert: 'Revert' }
  b.append(
    h(
      'div',
      { class: 'banner' },
      h('div', { class: 'row' }, icon('alert'), h('strong', null, `${labels[st.state]} in progress`)),
      h(
        'div',
        { class: 'dim', style: { fontSize: '11.5px' } },
        conflicts ? `${conflicts} conflicted file${conflicts > 1 ? 's' : ''}. Resolve them, then continue.` : 'No conflicts left. Continue to finish.'
      ),
      h(
        'div',
        { class: 'row' },
        conflicts > 0 && h('button', { class: 'btn sm primary', onClick: resolveWithAi }, icon('sparkle', 12), 'Resolve with AI'),
        h('button', { class: `btn sm ${conflicts ? '' : 'primary'}`, disabled: conflicts > 0, onClick: () => run('continue', {}, { success: 'Continued' }) }, 'Continue'),
        st.state !== 'merge' && h('button', { class: 'btn sm', onClick: () => run('skip', {}, { success: 'Skipped' }) }, 'Skip'),
        h(
          'button',
          {
            class: 'btn sm danger',
            onClick: async () => (await confirmBox(`Abort ${st.state}?`, 'Your branch goes back to how it was before.', 'Abort', true)) && run('abort', {}, { success: 'Aborted' })
          },
          'Abort'
        )
      )
    )
  )
}

/* =========================================================================
   tabs
   ========================================================================= */
const TABS = [
  ['history', IN_TAB ? 'Graph' : 'History', 'history'],
  ['changes', IN_TAB ? 'Commit' : 'Changes', 'file'],
  ['branches', 'Branches', 'branch'],
  ['worktrees', 'Worktrees', 'worktree'],
  ['stash', 'Stash', 'stash'],
  ['reflog', 'Reflog', 'undo'],
  ['settings', 'Settings', 'settings']
].filter(([id]) => !(IN_TAB && id === 'branches')) // the tab shows branches in its sidebar
function renderTabs() {
  const nav = clear($('#tabs'))
  const st = state.status
  for (const [id, label] of TABS) {
    const count = id === 'changes' ? st?.files.length : id === 'stash' ? st?.stashCount : 0
    nav.append(
      h('button', { class: `tab ${state.tab === id ? 'active' : ''}`, onClick: () => setTab(id) }, label, count ? h('span', { class: 'badge' }, count) : null)
    )
  }
}
function setTab(id) {
  state.tab = id
  state.sheets = []
  store.set('tab', id)
  renderTabs()
  renderView()
}

/* =========================================================================
   refresh
   ========================================================================= */
let refreshing = null
async function refreshAll(full = false) {
  if (refreshing) return refreshing
  refreshing = (async () => {
    if (full || !state.repo) {
      const before = state.repo
      await resolveRepo()
      if (state.repo !== before && state.status) renderAll() // snapshot of the new repo: show it now
    }
    if (state.repo) {
      try {
        const [st, refs] = await Promise.all([call('status'), call('refs').catch(() => state.refs)])
        state.status = st
        state.refs = refs
      } catch (e) {
        state.status = null
        state.statusError = e.message
      }
    } else state.status = null
    if (full) state.history.stale = true // reload quietly instead of emptying the list
    await renderAll()
    snap.save()
  })()
  try {
    await refreshing
  } finally {
    refreshing = null
  }
}

async function renderAll() {
  renderHeader()
  renderBanner()
  renderTabs()
  if (IN_TAB) renderSide()
  await renderView()
}

/** Light status poll: only re-render when something changed. */
async function pollStatus(force) {
  if (!force && (document.hidden || !state.repo || state.busy || refreshing || document.querySelector('.overlay'))) return
  try {
    const st = await call('status')
    if (JSON.stringify(st) !== JSON.stringify(state.status)) {
      const headMoved = st.oid !== state.status?.oid
      state.status = st
      if (headMoved) {
        state.history.stale = true
        state.refs = await call('refs').catch(() => state.refs)
      }
      if (IN_TAB && headMoved) renderSide()
      renderHeader()
      renderBanner()
      renderTabs()
      if ((!state.sheets.length || force) && (state.tab === 'changes' || headMoved)) renderView()
    }
  } catch {}
}

/* =========================================================================
   view host + sheets
   ========================================================================= */
let lastTabRendered = null
async function renderView() {
  const main = $('#main')
  const keepScroll = main.scrollTop
  const loading = main.querySelector('.loading')
  if (!state.repo) {
    clear(main).append(emptyRepo())
    return
  }
  if (!state.status) {
    clear(main).append(
      h('div', { class: 'empty' }, icon('alert', 28), h('div', null, 'Not a Git repository'), h('div', { class: 'dim mono', style: { marginTop: '6px' } }, state.statusError || state.repo))
    )
    return
  }
  const views = { changes: viewChanges, history: viewHistory, branches: viewBranches, worktrees: viewWorktrees, stash: viewStash, reflog: viewReflog, settings: viewSettings }
  if (!views[state.tab]) state.tab = 'history'
  // Nothing on screen yet (first open, no snapshot): show placeholder rows instead of a blank area.
  if (!main.querySelector('.view')) {
    clear(main).append(h('div', { class: 'view skeleton-list' }, Array.from({ length: 14 }, (_, i) => h('div', { class: 'skeleton-row', style: { animationDelay: `${i * 40}ms` } }, h('span', { class: 'dot' }), h('span', { class: 'bar', style: { width: `${35 + ((i * 37) % 45)}%` } })))))
    if (loading) main.prepend(loading)
  }
  let el
  try {
    el = await views[state.tab]()
  } catch (e) {
    el = h('div', { class: 'empty' }, icon('alert', 28), h('div', null, e.message))
  }
  if (lastTabRendered !== state.tab) el.classList.add('view-enter')
  lastTabRendered = state.tab
  clear(main).append(el)
  if (loading) main.prepend(loading)
  if (state.sheets.length) main.append(state.sheets[state.sheets.length - 1].el)
  main.scrollTop = keepScroll
}

function emptyRepo() {
  return h(
    'div',
    { class: 'empty' },
    icon('worktree', 32),
    h('div', null, 'No repository for this workspace'),
    h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn', onClick: (e) => repoMenu(e.currentTarget) }, 'Choose repository'))
  )
}

function openSheet(title, body, actions = []) {
  const el = h(
    'div',
    { class: 'sheet' },
    h('div', { class: 'sheet-head' }, iconBtn('left', 'Back', closeSheet), h('div', { class: 'sheet-title', title }, title), ...actions),
    h('div', { class: 'sheet-body' }, body)
  )
  const main = $('#main')
  main.querySelector('.sheet')?.remove()
  state.sheets.push({ el })
  main.append(el)
}
function closeSheet() {
  const main = $('#main')
  state.sheets.pop()?.el.remove()
  const prev = state.sheets[state.sheets.length - 1]
  if (prev) main.append(prev.el)
}

/* =========================================================================
   diff rendering
   ========================================================================= */
/** Split a unified diff into hunks, each a standalone patch (file header + one hunk). */
function splitHunks(text) {
  const hunks = []
  let header = []
  let cur = null
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git')) {
      header = [line]
      cur = null
    } else if (line.startsWith('@@')) {
      cur = { lines: [line], header: header.slice() }
      hunks.push(cur)
    } else if (cur) {
      if (line !== '') cur.lines.push(line)
    } else header.push(line)
  }
  return hunks.map((x) => [...x.header, ...x.lines].join('\n') + '\n')
}

/** hunkActions: [{ label, icon, run(patch) }] shown on every hunk header. */
function renderDiff(text, hunkActions) {
  const wrap = h('div', { class: 'diff' })
  if (!text.trim()) return h('div', { class: 'empty' }, 'No changes to show (binary or identical file)')
  const patches = hunkActions?.length ? splitHunks(text) : []
  let hunkIdx = -1
  let o = 0
  let n = 0
  const frag = document.createDocumentFragment()
  for (const line of text.split('\n')) {
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/)
      if (m) [o, n] = [+m[1], +m[2]]
      hunkIdx++
      const patch = patches[hunkIdx]
      frag.append(
        h(
          'div',
          { class: 'hunk' },
          h('span', { class: 'grow' }, line),
          patch && hunkActions.map((a) => h('button', { class: `hunk-btn ${a.danger ? 'danger' : ''}`, title: a.label, onClick: () => a.run(patch) }, icon(a.icon, 11), a.label))
        )
      )
    } else if (/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode)/.test(line)) {
      if (/^(diff --git|index |--- |\+\+\+ )/.test(line)) continue
      frag.append(h('div', { class: 'meta' }, line))
    } else if (line.startsWith('Binary files')) {
      frag.append(h('div', { class: 'meta' }, line))
    } else if (line.startsWith('+')) {
      frag.append(h('div', { class: 'l add' }, h('span', { class: 'n' }, ''), h('span', { class: 'n' }, n++), h('span', { class: 'c' }, line.slice(1))))
    } else if (line.startsWith('-')) {
      frag.append(h('div', { class: 'l del' }, h('span', { class: 'n' }, o++), h('span', { class: 'n' }, ''), h('span', { class: 'c' }, line.slice(1))))
    } else if (line.startsWith(' ')) {
      frag.append(h('div', { class: 'l ctx' }, h('span', { class: 'n' }, o++), h('span', { class: 'n' }, n++), h('span', { class: 'c' }, line.slice(1))))
    } else if (line.startsWith('\\')) {
      frag.append(h('div', { class: 'meta' }, line))
    }
  }
  wrap.append(frag)
  return wrap
}

async function showDiff(title, loader, actions = [], hunkActions) {
  openSheet(title, h('div', { class: 'empty' }, 'Loading…'), actions)
  const sheet = state.sheets[state.sheets.length - 1]
  const load = async () => {
    try {
      const text = await loader()
      const body = sheet.el.querySelector('.sheet-body')
      if (!text.trim() && hunkActions) {
        if (state.sheets.includes(sheet)) closeSheet()
        return
      }
      clear(body).append(
        renderDiff(
          text,
          hunkActions?.map((a) => ({
            ...a,
            run: async (patch) => {
              if (a.danger && !(await confirmBox('Discard this hunk?', 'The lines go back to how they were. This cannot be undone.', 'Discard', true))) return
              try {
                await call('applyPatch', { patch, ...a.args })
                toast(a.done)
              } catch (e) {
                toast(e.message, 'error')
              }
              await pollStatus(true)
              load()
            }
          }))
        )
      )
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  await load()
}
const HUNK_STAGE = [
  { label: 'Discard', icon: 'undo', danger: true, args: { reverse: true }, done: 'Hunk discarded' },
  { label: 'Stage', icon: 'plus', args: { cached: true }, done: 'Hunk staged' }
]
const HUNK_UNSTAGE = [{ label: 'Unstage', icon: 'minus', args: { cached: true, reverse: true }, done: 'Hunk unstaged' }]

/* =========================================================================
   Changes
   ========================================================================= */
function fileRow(f, { staged, onClick, actions }) {
  const letter = f.conflict ? 'U' : f.untracked ? '?' : staged ? f.x : f.y === '.' ? f.x : f.y
  const name = basename(f.path)
  const dir = dirname(f.path)
  return h(
    'div',
    { class: 'item', title: f.orig ? `${f.orig} → ${f.path}` : f.path, onClick },
    h('span', { class: `status-letter s-${letter}`, title: f.untracked ? 'Untracked' : '' }, f.untracked ? 'U' : letter),
    h('span', { class: 'file-name' }, name),
    dir && h('span', { class: 'file-dir grow' }, dir),
    !dir && h('span', { class: 'grow' }),
    h('div', { class: 'hover-actions', onClick: (e) => e.stopPropagation() }, actions)
  )
}

async function viewChanges() {
  const st = state.status
  const conflicts = st.files.filter((f) => f.conflict)
  const staged = st.files.filter((f) => !f.conflict && !f.untracked && f.x !== '.')
  const unstaged = st.files.filter((f) => !f.conflict && (f.untracked || f.y !== '.'))

  const root = h('div', { class: 'view', style: { paddingTop: 0 } })

  // commit box
  const ta = h('textarea', {
    placeholder: st.branch ? `Message (Ctrl+Enter to commit on ${st.branch})` : 'Commit message',
    value: state.commitDraft,
    onInput: (e) => {
      state.commitDraft = e.target.value
      updateCommitBtn()
    },
    onKeydown: (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doCommit({})
    }
  })
  ta.value = state.commitDraft
  const amend = h('input', {
    type: 'checkbox',
    checked: state.amend,
    onChange: async (e) => {
      state.amend = e.target.checked
      if (state.amend && !state.commitDraft.trim()) {
        const last = await call('lastMessage').catch(() => '')
        state.commitDraft = (last || '').trim()
        ta.value = state.commitDraft
      }
      updateCommitBtn()
    }
  })
  const commitBtn = h('button', { class: 'btn primary', onClick: () => doCommit({}) })
  const commitMore = h('button', { class: 'btn primary', title: 'More commit options', onClick: (e) => commitMenu(e.currentTarget) }, icon('down', 12))
  function updateCommitBtn() {
    const n = staged.length
    const can = !!state.commitDraft.trim() && (n > 0 || state.amend || (unstaged.length > 0))
    commitBtn.disabled = !can
    commitMore.disabled = !state.commitDraft.trim()
    clear(commitBtn).append(icon('check', 13), state.amend ? 'Amend' : n ? `Commit ${n} file${n > 1 ? 's' : ''}` : unstaged.length ? 'Commit all' : 'Commit')
  }
  updateCommitBtn()

  async function doCommit(extra) {
    if (!state.commitDraft.trim()) return
    const args = { message: state.commitDraft, amend: state.amend, ...extra }
    if (!staged.length && !state.amend && !extra.allowEmpty) {
      if (!unstaged.length) return
      // Nothing staged: stage everything first, like git-extension's "commit all".
      if (!(await confirmBox('Nothing staged', 'Stage all changes and commit them?', 'Stage all & commit'))) return
      await call('stageAll').catch((e) => toast(e.message, 'error'))
    }
    const out = await run('commit', args, { success: extra.push ? 'Committed and pushed' : state.amend ? 'Amended' : 'Committed' })
    if (out !== undefined) {
      state.commitDraft = ''
      state.amend = false
      state.history.commits = []
      refreshAll()
    }
  }
  function commitMenu(anchor) {
    menu(anchor, [
      { label: 'Commit & push', icon: 'push', onClick: () => doCommit({ push: true }) },
      { label: 'Commit with sign-off', icon: 'user', onClick: () => doCommit({ signoff: true }) },
      { label: 'Empty commit', icon: 'commit', onClick: () => doCommit({ allowEmpty: true }) }
    ])
  }

  root.append(
    h(
      'div',
      { class: 'commit-box' },
      ta,
      h(
        'div',
        { class: 'row' },
        h('label', { class: 'check' }, amend, 'Amend last commit'),
        h('span', { class: 'grow' }),
        h(
          'button',
          {
            class: 'btn sm',
            title: 'Generate a commit message with AI',
            disabled: !st.files.length,
            onClick: () =>
              aiCommitModal({
                staged: staged.length,
                total: st.files.length,
                onUse: (msg) => {
                  state.commitDraft = msg
                  ta.value = msg
                  updateCommitBtn()
                  ta.focus()
                },
                onCommit: (msg) => {
                  state.commitDraft = msg
                  ta.value = msg
                  doCommit({})
                }
              })
          },
          icon('sparkle', 12),
          'AI message'
        )
      ),
      h('div', { class: 'split' }, commitBtn, commitMore)
    )
  )

  if (!st.files.length) {
    root.append(h('div', { class: 'empty' }, icon('check', 28), h('div', null, 'Working tree clean')))
    return root
  }

  if (conflicts.length) {
    root.append(h('div', { class: 'section-head' }, 'Conflicts', h('span', { class: 'count' }, conflicts.length)))
    for (const f of conflicts)
      root.append(
        fileRow(f, {
          onClick: () => showDiff(f.path, () => call('diff', { file: f.path })),
          actions: [
            iconBtn('more', 'Resolve', (e) =>
              menu(e.currentTarget, [
                { label: 'Use mine (ours)', icon: 'left', onClick: () => run('useSide', { file: f.path, side: 'ours' }) },
                { label: 'Use theirs', icon: 'right', onClick: () => run('useSide', { file: f.path, side: 'theirs' }) },
                { label: 'Mark as resolved', icon: 'check', onClick: () => run('stage', { files: [f.path] }) }
              ])
            )
          ]
        })
      )
  }

  if (staged.length) {
    root.append(
      h(
        'div',
        { class: 'section-head' },
        'Staged',
        h('span', { class: 'count' }, staged.length),
        h('div', { class: 'actions' }, iconBtn('minus', 'Unstage all', () => run('unstageAll', {})))
      )
    )
    for (const f of staged)
      root.append(
        fileRow(f, {
          staged: true,
          onClick: () => showDiff(f.path, () => call('diff', { file: f.path, staged: true }), [iconBtn('minus', 'Unstage file', () => (closeSheet(), run('unstage', { files: [f.path] })))], HUNK_UNSTAGE),
          actions: [iconBtn('more', 'More', (e) => fileMenu(e.currentTarget, f)), iconBtn('minus', 'Unstage', () => run('unstage', { files: [f.path] }))]
        })
      )
  }

  if (unstaged.length) {
    root.append(
      h(
        'div',
        { class: 'section-head' },
        'Changes',
        h('span', { class: 'count' }, unstaged.length),
        h(
          'div',
          { class: 'actions' },
          iconBtn('undo', 'Discard all changes', () => discard(unstaged)),
          iconBtn('plus', 'Stage all', () => run('stage', { files: unstaged.map((f) => f.path) }))
        )
      )
    )
    for (const f of unstaged)
      root.append(
        fileRow(f, {
          onClick: () =>
            showDiff(
              f.path,
              () => call('diff', { file: f.path, untracked: f.untracked }),
              [iconBtn('undo', 'Discard file', () => discard([f], true)), iconBtn('plus', 'Stage file', () => (closeSheet(), run('stage', { files: [f.path] })))],
              f.untracked ? undefined : HUNK_STAGE
            ),
          actions: [
            iconBtn('more', 'More', (e) => fileMenu(e.currentTarget, f)),
            iconBtn('undo', 'Discard changes', () => discard([f])),
            iconBtn('plus', 'Stage', () => run('stage', { files: [f.path] }))
          ]
        })
      )
  }
  return root
}

async function discard(list, fromSheet) {
  const what = list.length === 1 ? basename(list[0].path) : `${list.length} files`
  const anyUntracked = list.some((f) => f.untracked)
  if (!(await confirmBox(`Discard changes to ${what}?`, anyUntracked ? 'Untracked files will be deleted. This cannot be undone.' : 'This cannot be undone.', 'Discard', true))) return
  if (fromSheet) closeSheet()
  run('discard', { files: list.filter((f) => !f.untracked).map((f) => f.path), untracked: list.filter((f) => f.untracked).map((f) => f.path) }, { success: 'Discarded' })
}

/* =========================================================================
   History + graph
   ========================================================================= */
// 8 clearly different hues, so two lines never look alike
const LANE_COLORS = ['#6d9eeb', '#7cbf6a', '#d9a84e', '#b48be8', '#4fbfcf', '#e07a8b', '#e08f55', '#a8b85a']
/** The graph colour each commit was drawn with, so its labels elsewhere (the details card) match. */
const laneOfCommit = new Map()

/**
 * Lay out commits as lanes, the way Git Extensions draws its graph:
 * - a branch keeps one colour from top to bottom;
 * - when a commit's parent is already on screen, its line joins that lane instead of opening a new one;
 * - gaps close by sliding lanes left, so the graph stays narrow.
 * Each row lists the line segments to draw: [fromLane, fromY, toLane, toY, colour].
 */
function layoutGraph(commits) {
  let lanes = [] // [{ h: hash this lane is waiting for, c: colour index }]
  let nextColor = 0
  const rows = []
  for (const c of commits) {
    const top = lanes
    let col = top.findIndex((l) => l.h === c.hash)
    const hadTop = col !== -1
    const work = top.slice()
    if (!hadTop) {
      col = work.length
      work.push({ h: c.hash, c: nextColor++ })
    }
    const color = work[col].c
    const edges = []
    const merging = []
    top.forEach((l, i) => {
      if (i !== col && l.h === c.hash) merging.push(i)
    })
    if (hadTop) edges.push([col, 0, col, 'mid', color])
    for (const i of merging) edges.push([i, 0, col, 'mid', top[i].c])
    for (const i of merging) work[i] = null

    // parents
    const targets = [] // [laneIndexInWork, colour]
    if (c.parents.length) {
      const p0 = c.parents[0]
      const k = work.findIndex((l, i) => l && i !== col && l.h === p0)
      if (k !== -1) {
        work[col] = null
        targets.push([k, work[k].c])
      } else {
        work[col] = { h: p0, c: color }
        targets.push([col, color])
      }
      for (const p of c.parents.slice(1)) {
        let j = work.findIndex((l) => l && l.h === p)
        if (j === -1) {
          j = work.length
          work.push({ h: p, c: nextColor++ })
        }
        targets.push([j, work[j].c])
      }
    } else work[col] = null

    // compact: lanes slide left over the gaps
    const newIdx = []
    const next = []
    work.forEach((l, i) => {
      if (l) {
        newIdx[i] = next.length
        next.push(l)
      }
    })
    top.forEach((l, i) => {
      if (i === col || merging.includes(i) || !work[i] || work[i] !== l) return
      edges.push([i, 0, newIdx[i], 'bottom', l.c]) // a lane passing through (maybe shifting left)
    })
    for (const [t, tc] of targets) edges.push([col, 'mid', newIdx[t], 'bottom', t === col || tc === color ? color : tc])

    rows.push({ col, color, edges, before: top.map((l) => l.h), after: next.map((l) => l.h), lanes: Math.max(top.length, next.length, col + 1) })
    lanes = next
  }
  return rows
}

const ROW_H = IN_TAB ? 28 : 40
const LANE_W = IN_TAB ? 14 : 11
const MAX_LANES = 40 // drawing width cap; lanes past it are clipped, never squashed together
const laneColor = (i) => LANE_COLORS[i % LANE_COLORS.length]
function graphSvg(row, width, merge, head) {
  const x = (i) => 9 + i * LANE_W
  const Y = { 0: 0, mid: ROW_H / 2, bottom: ROW_H }
  const curve = (x1, y1, x2, y2) =>
    x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`
  let paths = ''
  for (const [a, ya, b, yb, ci] of row.edges)
    paths += `<path d="${curve(x(a), Y[ya], x(b), Y[yb])}" stroke="${laneColor(ci)}" stroke-width="2" stroke-opacity="1" fill="none" stroke-linecap="round"/>`
  const c = laneColor(row.color)
  const cx = x(row.col)
  const cy = ROW_H / 2
  const dot = merge
    ? `<circle cx="${cx}" cy="${cy}" r="4" fill="var(--bg)" stroke="${c}" stroke-width="2"/>`
    : `<circle cx="${cx}" cy="${cy}" r="4.2" fill="${c}" stroke="var(--bg)" stroke-width="1.5"/>`
  // the checked-out commit: a ring around its node, like Git Extensions' HEAD marker
  const ring = head ? `<circle cx="${cx}" cy="${cy}" r="7.5" fill="none" stroke="${c}" stroke-width="1.5" opacity=".9"/>` : ''
  const wrap = document.createElement('span')
  wrap.style.display = 'flex'
  wrap.innerHTML = `<svg class="graph" width="${width}" height="${ROW_H}" style="overflow:hidden">${paths}${ring}${dot}</svg>`
  return wrap.firstChild
}
/** Graph column width for a set of rows. */
const graphWidth = (rows) => 9 + Math.min(MAX_LANES, Math.max(1, ...rows.map((r) => r.lanes))) * LANE_W

/** Ref labels. With a lane, branch labels take that lane's colour, as in VS Code's Git Graph. */
function refPills(refs, lane) {
  const out = []
  const style = lane == null ? null : { '--lane': laneColor(lane) }
  const lanePill = (el) => {
    if (style && !el.classList.contains('tag')) {
      el.classList.add('laned')
      el.style.setProperty('--lane', style['--lane'])
    }
    return el
  }
  const push0 = out.push.bind(out)
  out.push = (el) => push0(lanePill(el))
  for (let r of refs) {
    if (r.startsWith('HEAD -> ')) out.push(h('span', { class: 'ref head', title: `${r.slice(8)} (checked out)` }, icon('check', 10), h('span', { class: 'ref-t' }, r.slice(8))))
    else if (r === 'HEAD') out.push(h('span', { class: 'ref head', title: 'HEAD (detached)' }, icon('commit', 10), h('span', { class: 'ref-t' }, 'HEAD')))
    else if (r.startsWith('tag: ')) out.push(h('span', { class: 'ref tag', title: `Tag ${r.slice(5)}` }, icon('tag', 10), h('span', { class: 'ref-t' }, r.slice(5))))
    else if (r.includes('/') && !state.localNames?.has(r)) out.push(h('span', { class: 'ref remote', title: `Remote branch ${r}` }, icon('globe', 10), h('span', { class: 'ref-t' }, r)))
    else if (r.startsWith('refs/stash') || r === 'stash') out.push(h('span', { class: 'ref', title: 'Stash' }, icon('stash', 10), h('span', { class: 'ref-t' }, 'stash')))
    else out.push(h('span', { class: 'ref', title: `Branch ${r}` }, icon('branch', 10), h('span', { class: 'ref-t' }, r)))
  }
  return out
}

async function loadHistory(more = false) {
  const H = state.history
  const page = 300
  const commits = await call('log', { all: H.all, limit: page, skip: more ? H.commits.length : 0, search: H.search, mode: H.mode || 'message' })
  H.commits = more ? H.commits.concat(commits) : commits
  H.done = commits.length < page
}

/** Reload the first page in the background; redraw only when something changed. */
let reloadingHistory = false
async function reloadHistoryQuietly() {
  const H = state.history
  if (reloadingHistory) return
  reloadingHistory = true
  const repo = state.repo
  try {
    const commits = await call('log', { all: H.all, limit: 150, skip: 0, search: H.search, mode: H.mode || 'message' })
    if (repo !== state.repo) return
    const sig = (list) => list.map((c) => c.hash + c.refs.join()).join()
    if (sig(commits) !== sig(H.commits.slice(0, commits.length)) || commits.length !== Math.min(H.commits.length, 150)) {
      H.commits = commits
      H.done = commits.length < 150
      if (state.tab === 'history') renderView()
    }
    snap.save()
  } catch {
  } finally {
    reloadingHistory = false
  }
}

/** Loads the next page when it scrolls into view (a button too, for keyboards). */
let loadingMore = false
function loadMoreSentinel() {
  const more = async () => {
    if (loadingMore) return
    loadingMore = true
    clear(btn).append(h('span', { class: 'spinner' }), 'Loading…')
    try {
      await loadHistory(true)
      await renderView()
    } finally {
      loadingMore = false
    }
  }
  const btn = h('button', { class: 'btn sm load-more', onClick: more }, 'Load more')
  const io = new IntersectionObserver((ents) => ents.some((e) => e.isIntersecting) && (io.disconnect(), more()), { root: $('#main'), rootMargin: '600px' })
  requestAnimationFrame(() => btn.isConnected && io.observe(btn))
  return btn
}

async function viewHistory() {
  const H = state.history
  if (!H.commits.length && !H.done) await loadHistory()
  else if (H.stale) {
    H.stale = false
    reloadHistoryQuietly()
  }
  if (!state.refs) state.refs = await call('refs').catch(() => null)
  if (state.refs) state.localNames = new Set(state.refs.local.map((b) => b.name))
  const root = h('div', { class: 'view', style: { paddingTop: '8px' } })
  const modeSel = h(
    'select',
    {
      class: 'mode-select',
      title: 'Search in',
      onChange: (e) => {
        H.mode = e.target.value
        if (H.search) {
          H.commits = []
          H.done = false
          renderView()
        }
      }
    },
    [
      ['message', 'Message'],
      ['author', 'Author'],
      ['file', 'File path'],
      ['content', 'Code change'],
      ['hash', 'Commit hash']
    ].map(([v, l]) => h('option', { value: v, selected: (H.mode || 'message') === v }, l))
  )
  const search = h('input', {
    type: 'text',
    placeholder: 'Search… (Enter)',
    value: H.search,
    onKeydown: async (e) => {
      if (e.key !== 'Enter') return
      H.search = e.target.value.trim()
      H.commits = []
      H.done = false
      renderView()
    }
  })
  search.value = H.search
  const seg = h(
    'div',
    { class: 'segmented' },
    h('button', { class: H.all ? '' : 'on', onClick: () => setAll(false) }, 'Branch'),
    h('button', { class: H.all ? 'on' : '', onClick: () => setAll(true) }, 'All')
  )
  function setAll(v) {
    H.all = v
    store.set('historyAllV2', v)
    H.commits = []
    H.done = false
    renderView()
  }
  root.append(h('div', { class: 'history-bar' }, modeSel, search, seg))

  if (!H.commits.length) {
    root.append(h('div', { class: 'empty' }, icon('history', 28), h('div', null, H.search ? 'No matching commits' : 'No commits yet')))
    return root
  }
  // The graph is only meaningful for an unfiltered log.
  const rows = H.search ? null : layoutGraph(H.commits)
  if (rows) rows.forEach((r, i) => laneOfCommit.set(H.commits[i].hash, r.color))
  const width = rows ? graphWidth(rows) + 4 : 8
  const list = h('div')
  H.commits.forEach((c, i) => {
    const row = h(
        'div',
        { class: `commit-row ${H.open === c.hash ? 'selected' : ''}`, onClick: () => toggleInline(c, row), onContextmenu: (e) => commitContextMenu(e, c) },
        rows ? graphSvg(rows[i], width, c.parents.length > 1, c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD -> '))) : h('span', { style: { width: '8px' } }),
        IN_TAB
          ? [
              h('div', { class: 'commit-text' }, h('div', { class: 'commit-subject' }, refPills(c.refs, rows && rows[i] ? rows[i].color : null), h('span', { class: 's', title: c.subject }, c.subject))),
              h('div', { class: 'col-author ellipsis', title: c.email }, c.author),
              h('div', { class: 'col-date', title: fullDate(c.time) }, new Date(c.time * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })),
              h('div', { class: 'col-hash mono' }, c.hash.slice(0, 7))
            ]
          : h(
              'div',
              { class: 'commit-text' },
              h('div', { class: 'commit-subject' }, refPills(c.refs, rows && rows[i] ? rows[i].color : null), h('span', { class: 's', title: c.subject }, c.subject)),
              h('div', { class: 'commit-meta', title: fullDate(c.time) }, `${c.author} · ${ago(c.time)} · `, h('span', { class: 'mono' }, c.hash.slice(0, 7)))
            )
      )
    list.append(row)
    if (H.open === c.hash) list.append(inlineDetail(c))
  })
  root.append(list)
  if (!H.done)
    root.append(
      h(
        'div',
        { style: { padding: '10px', textAlign: 'center' } },
        loadMoreSentinel()
      )
    )
  return root
}

/* ---------- commit details, shown in a row under the commit (or in a sheet elsewhere) ---------- */
const detailCache = new Map()
async function commitDetails(hash) {
  const key = state.repo + '|' + hash
  if (!detailCache.has(key)) {
    const p = call('commitShow', { hash })
    detailCache.set(key, p)
    p.catch(() => detailCache.delete(key))
    if (detailCache.size > 200) detailCache.delete(detailCache.keys().next().value)
  }
  return detailCache.get(key)
}

function toggleInline(c, row) {
  const H = state.history
  const list = row.parentElement
  list.querySelector('.commit-inline')?.remove()
  list.querySelector('.commit-row.selected')?.classList.remove('selected')
  if (H.open === c.hash) {
    H.open = null
    return
  }
  H.open = c.hash
  row.classList.add('selected')
  const el = inlineDetail(c)
  row.after(el)
  // keep the opened details in view without jumping
  requestAnimationFrame(() => {
    const main = $('#main')
    const r = el.getBoundingClientRect()
    const m = main.getBoundingClientRect()
    if (r.bottom > m.bottom) main.scrollBy({ top: Math.min(r.bottom - m.bottom + 8, r.top - m.top - 40), behavior: 'smooth' })
  })
}

function inlineDetail(c) {
  const close = () => {
    state.history.open = null
    el.previousElementSibling?.classList.remove('selected')
    el.remove()
  }
  const body = h('div', { class: 'inline-body' }, h('div', { class: 'inline-skeleton' }, h('span'), h('span'), h('span')))
  const el = h(
    'div',
    { class: 'commit-inline', onClick: (e) => e.stopPropagation() },
    h(
      'div',
      { class: 'inline-head' },
      h('span', { class: 'mono dim' }, c.hash.slice(0, 7)),
      h('strong', { class: 'grow ellipsis', title: c.subject }, c.subject),
      iconBtn('open', 'Open in a side sheet', () => openCommit(c.hash)),
      iconBtn('x', 'Close', close)
    ),
    body
  )
  commitDetails(c.hash).then(
    (full) => el.isConnected && clear(body).append(commitBody(full, { inline: true })),
    (e) => el.isConnected && clear(body).append(h('div', { class: 'dim', style: { padding: '8px' } }, e.message))
  )
  return el
}

/** The commit's message, metadata, actions and changed files. */
function commitBody(c, { inline = false } = {}) {
  const short = c.hash.slice(0, 7)
  const body = h('div', { class: inline ? 'inline-grid' : '' })
  const [subject, ...rest] = c.message.split('\n')
  body.append(
    h(
      'div',
      { class: 'detail' },
      !inline && h('div', { style: { fontWeight: 600 } }, subject),
      rest.join('\n').trim() && h('div', { class: 'msg dim' }, rest.join('\n').trim()),
      c.refs.length ? h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, refPills(c.refs, laneOfCommit.get(c.hash))) : null,
      h(
        'dl',
        { class: 'kv' },
        h('dt', null, 'Author'),
        h('dd', { title: c.email }, `${c.author}`),
        h('dt', null, 'Date'),
        h('dd', null, fullDate(c.time)),
        c.committer !== c.author && [h('dt', null, 'Committer'), h('dd', null, c.committer)],
        h('dt', null, 'Commit'),
        h('dd', { class: 'mono' }, c.hash),
        c.parents.length ? [h('dt', null, c.parents.length > 1 ? 'Parents' : 'Parent'), h('dd', { class: 'mono' }, c.parents.map((p) => p.slice(0, 7)).join(' '))] : null
      ),
      h(
        'div',
        { class: 'actions-wrap' },
        h('button', { class: 'btn sm', onClick: () => checkoutCommit(c.hash) }, icon('commit', 12), 'Checkout'),
        h('button', { class: 'btn sm', onClick: () => newBranch(c.hash) }, icon('branch', 12), 'Branch'),
        h('button', { class: 'btn sm', onClick: (e) => commitMenu(e.currentTarget, c) }, icon('more', 12), 'More')
      )
    )
  )
  const filesBox = h('div', { class: inline ? 'inline-files' : '' })
  body.append(filesBox)
  filesBox.append(h('div', { class: 'section-head' }, 'Files', h('span', { class: 'count' }, c.files.length), c.parents.length > 1 && h('span', { class: 'dim', style: { textTransform: 'none', fontWeight: 400 } }, `vs first parent ${c.parents[0].slice(0, 7)}`)))
  for (const f of c.files) {
    filesBox.append(
      h(
        'div',
        { class: 'item', title: f.orig ? `${f.orig} → ${f.path}` : f.path, onClick: () => showDiff(`${basename(f.path)} @ ${short}`, () => call('commitFileDiff', { hash: c.hash, file: f.path })) },
        h('span', { class: `status-letter s-${f.status}` }, f.status),
        h('span', { class: 'file-name' }, basename(f.path)),
        h('span', { class: 'file-dir grow' }, dirname(f.path)),
        f.add != null && h('span', { class: 'stat' }, f.add === '-' ? 'bin' : [h('span', { class: 'a' }, `+${f.add}`), ' ', h('span', { class: 'd' }, `-${f.del}`)])
      )
    )
  }
  if (!c.files.length) filesBox.append(h('div', { class: 'dim', style: { padding: '4px 10px' } }, 'No file changes'))
  return body
}

async function openCommit(hash) {
  openSheet(hash.slice(0, 7), h('div', { class: 'inline-skeleton', style: { margin: '12px' } }, h('span'), h('span'), h('span')))
  const sheet = state.sheets[state.sheets.length - 1]
  let c
  try {
    c = await commitDetails(hash)
  } catch (e) {
    if (state.sheets.includes(sheet)) closeSheet()
    return toast(e.message, 'error')
  }
  if (!sheet.el.isConnected) return
  sheet.el.querySelector('.sheet-title').textContent = `${hash.slice(0, 7)} · ${c.message.split('\n')[0]}`
  clear(sheet.el.querySelector('.sheet-body')).append(commitBody(c))
}

/** Right-click on a commit row: the commit's menu at the pointer (the full message is loaded first). */
async function commitContextMenu(e, c) {
  e.preventDefault()
  const point = { x: e.clientX, y: e.clientY }
  let full = c
  if (c.message == null) full = { ...c, ...(await call('commitShow', { hash: c.hash }).catch(() => ({ message: c.subject || '' }))), refs: c.refs, parents: c.parents }
  commitMenu(point, full)
}

/**
 * Everything Git Extensions offers on a revision, grouped the same way: checkout and new refs, the
 * actions on the current branch, the branches and tags at this commit, inspecting, and copying.
 */
function commitMenu(anchor, c) {
  const cur = state.status?.branch || 'HEAD'
  const short = c.hash.slice(0, 7)
  const isHead = c.hash === state.status?.oid
  const isMerge = (c.parents?.length ?? 0) > 1
  const bis = state.status?.bisect
  const refs = (c.refs || []).filter((r) => r !== 'HEAD')
  const branches = refs.map((r) => r.replace(/^HEAD -> /, '')).filter((r) => !r.startsWith('tag: '))
  const local = branches.filter((b) => state.localNames?.has(b))
  const remote = branches.filter((b) => !state.localNames?.has(b) && b.includes('/'))
  const tags = refs.filter((r) => r.startsWith('tag: ')).map((r) => r.slice(5))
  const staged = state.status?.files?.some((f) => f.staged)
  const date = c.time ? new Date(c.time * 1000).toISOString() : ''
  menu(anchor, [
    { header: `${short} · ${(c.subject || c.message || '').split('\n')[0].slice(0, 48)}` },
    {
      label: 'Checkout',
      icon: 'right',
      items: [
        ...local.filter((b) => b !== cur).map((b) => ({ label: `Branch ${b}`, icon: 'branch', onClick: () => checkout(b) })),
        ...remote.map((b) => ({ label: `Remote ${b} (new local branch)`, icon: 'globe', onClick: () => checkout(b, { track: true }) })),
        { label: 'This commit (detached HEAD)', icon: 'commit', onClick: () => checkoutCommit(c.hash) }
      ]
    },
    { label: 'Create branch here…', icon: 'plus', onClick: () => newBranch(c.hash) },
    { label: 'Create tag here…', icon: 'tag', onClick: () => newTag(c.hash) },
    { label: 'New worktree here…', icon: 'worktree', onClick: () => addWorktree({ base: c.hash }) },
    '-',
    { header: `On ${cur}` },
    !isHead && { label: `Merge into ${cur}…`, icon: 'merge', onClick: () => mergeRef(local[0] || c.hash) },
    !isHead && { label: `Rebase ${cur} onto this…`, icon: 'merge', onClick: () => rebaseOnto(local[0] || c.hash) },
    !isHead && { label: 'Interactive rebase from here…', icon: 'layers', onClick: () => interactiveRebase(c.hash) },
    {
      label: 'Cherry-pick',
      icon: 'commit',
      disabled: isHead,
      items: [
        { label: 'Cherry-pick', icon: 'commit', onClick: () => run('cherryPick', { hash: c.hash, mainline: isMerge }, { success: 'Cherry-picked' }) },
        { label: 'Cherry-pick without committing', icon: 'commit', onClick: () => run('cherryPick', { hash: c.hash, mainline: isMerge, noCommit: true }, { success: 'Changes applied; review and commit' }) }
      ]
    },
    {
      label: 'Revert',
      icon: 'undo',
      items: [
        { label: 'Revert (new commit)', icon: 'undo', onClick: async () => (await confirmBox(`Revert ${short}?`, 'A new commit that undoes it will be created.', 'Revert')) && run('revert', { hash: c.hash, mainline: isMerge }, { success: 'Reverted' }) },
        { label: 'Revert without committing', icon: 'undo', onClick: () => run('revert', { hash: c.hash, mainline: isMerge, noCommit: true }, { success: 'Undo applied; review and commit' }) }
      ]
    },
    {
      label: `Reset ${cur} to here`,
      icon: 'undo',
      disabled: isHead,
      items: [
        { label: 'Soft: keep changes staged', icon: 'undo', onClick: () => resetTo(c.hash, 'soft') },
        { label: 'Mixed: keep changes unstaged', icon: 'undo', onClick: () => resetTo(c.hash, 'mixed') },
        { label: 'Keep: keep uncommitted changes', icon: 'undo', onClick: () => resetTo(c.hash, 'keep') },
        { label: 'Merge: keep changes not in conflict', icon: 'undo', onClick: () => resetTo(c.hash, 'merge') },
        '-',
        { label: 'Hard: discard all changes…', icon: 'alert', danger: true, onClick: () => resetTo(c.hash, 'hard') }
      ]
    },
    {
      label: 'Rewrite history',
      icon: 'edit',
      items: [
        isHead && { label: 'Reword message…', icon: 'edit', onClick: () => rewordLast(c) },
        !isHead && { label: 'Squash later commits into one…', icon: 'layers', onClick: () => squashSince(c.hash) },
        { label: 'Create fixup! commit of staged changes', icon: 'commit', disabled: !staged, onClick: () => run('fixupCommit', { hash: c.hash, kind: 'fixup' }, { success: `fixup! commit for ${short}` }) },
        { label: 'Create squash! commit of staged changes', icon: 'commit', disabled: !staged, onClick: () => run('fixupCommit', { hash: c.hash, kind: 'squash' }, { success: `squash! commit for ${short}` }) }
      ]
    },
    (local.length || tags.length) && '-',
    (local.length || tags.length) && { header: 'Branches and tags here' },
    ...local.map((b) => ({
      label: `Branch ${b}`,
      icon: 'branch',
      items: [
        b !== cur && { label: 'Checkout', icon: 'right', onClick: () => checkout(b) },
        { label: 'Push', icon: 'push', onClick: () => run('push', b === cur ? {} : { branch: b }, { success: `Pushed ${b}` }) },
        { label: 'Rename…', icon: 'edit', onClick: () => renameBranch(b) },
        { label: 'Show only this branch', icon: 'history', onClick: () => showBranchLog(b) },
        b !== cur && { label: 'Delete…', icon: 'trash', danger: true, onClick: () => deleteBranch(b) }
      ]
    })),
    ...tags.map((t) => ({
      label: `Tag ${t}`,
      icon: 'tag',
      items: [
        { label: 'Push tag', icon: 'push', onClick: () => run('tagPush', { name: t }, { success: `Pushed ${t}` }) },
        { label: 'Delete (local)…', icon: 'trash', danger: true, onClick: async () => (await confirmBox(`Delete tag ${t}?`, 'Only the local tag is deleted.', 'Delete', true)) && run('tagDelete', { name: t }) }
      ]
    })),
    '-',
    { label: 'Show commit details', icon: 'commit', onClick: () => openCommit(c.hash) },
    { label: 'Compare with HEAD', icon: 'compare', onClick: () => compareSheet(c.hash, 'HEAD') },
    isMerge && { label: 'Compare with first parent', icon: 'compare', onClick: () => compareSheet(c.parents[0], c.hash) },
    { label: 'Browse files at this commit', icon: 'folder', onClick: () => treeSheet(c.hash) },
    { label: 'Save as patch…', icon: 'download', onClick: () => savePatch(c) },
    {
      label: 'Bisect',
      icon: 'search',
      items: bis
        ? [
            { label: 'Mark good', icon: 'check', onClick: () => run('bisect', { action: 'good', rev: c.hash }, { success: 'Marked good' }) },
            { label: 'Mark bad', icon: 'x', onClick: () => run('bisect', { action: 'bad', rev: c.hash }, { success: 'Marked bad' }) },
            { label: 'Skip', icon: 'right', onClick: () => run('bisect', { action: 'skip', rev: c.hash }, { success: 'Skipped' }) },
            { label: 'Stop bisect', icon: 'x', onClick: () => run('bisect', { action: 'reset' }, { success: 'Bisect stopped' }) }
          ]
        : [{ label: 'Start (this is good, HEAD is bad)', icon: 'search', onClick: () => startBisect(c.hash) }]
    },
    {
      label: 'Copy',
      icon: 'copy',
      items: [
        { label: 'Full hash', icon: 'copy', hint: short, onClick: () => copy(c.hash) },
        { label: 'Short hash', icon: 'copy', onClick: () => copy(short) },
        { label: 'Message', icon: 'copy', onClick: () => copy(c.message || c.subject || '') },
        { label: 'Subject', icon: 'copy', onClick: () => copy((c.subject || c.message || '').split('\n')[0]) },
        c.author && { label: 'Author', icon: 'copy', onClick: () => copy(c.email ? `${c.author} <${c.email}>` : c.author) },
        date && { label: 'Date', icon: 'copy', onClick: () => copy(date) },
        ...branches.map((b) => ({ label: `Branch name ${b}`, icon: 'copy', onClick: () => copy(b) })),
        ...tags.map((t) => ({ label: `Tag name ${t}`, icon: 'copy', onClick: () => copy(t) }))
      ]
    }
  ])
}
async function resetTo(hash, mode) {
  const msg = mode === 'hard' ? 'All uncommitted changes will be lost. This cannot be undone.' : `Your branch will point at ${hash.slice(0, 7)}.`
  if (!(await confirmBox(`${mode[0].toUpperCase() + mode.slice(1)} reset?`, msg, 'Reset', mode === 'hard'))) return
  closeSheet()
  state.history.commits = []
  run('reset', { hash, mode }, { success: `Reset (${mode})` })
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast('Copied')
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }, text)
    document.body.append(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
    toast('Copied')
  }
}

/* =========================================================================
   Branches
   ========================================================================= */
/**
 * Switch branch. The two usual failures get a choice instead of an error: changes in the way
 * (stash & switch, or discard & switch) and a branch already checked out in another worktree.
 */
async function checkout(name, opts = {}) {
  closeOverlays()
  const label = opts.track ? name.replace(/^[^/]+\//, '') : name
  setBusy(1)
  let out
  try {
    out = await call('checkout', { ref: name, ...opts })
  } catch (e) {
    setBusy(-1)
    const inUse = e.message.match(/checked out in another worktree:\s*(.+)$/)
    if (inUse) {
      const where = inUse[1].trim()
      const r = await dialog({
        title: `${label} is open in another worktree`,
        message: `${where}

A branch can be checked out in only one worktree at a time.`,
        ok: 'Open that worktree',
        cancel: 'Cancel'
      })
      if (r) {
        const opened = await request('worktree.open', { path: where }).catch(() => null)
        if (!opened?.opened) pinRepo(where)
      }
      return
    }
    if (/changes that this checkout would overwrite/.test(e.message)) {
      const r = await dialog({
        title: `Switch to ${label}?`,
        message: 'You have uncommitted changes that this checkout would overwrite.',
        fields: [
          {
            key: 'how',
            label: 'What to do with them',
            type: 'select',
            value: 'stash',
            options: [
              ['stash', 'Stash them, switch, then bring them back (recommended)'],
              ['discard', 'Discard them and switch']
            ]
          }
        ],
        ok: 'Switch'
      })
      if (!r) return
      if (r.how === 'discard' && !(await confirmBox('Discard your changes?', 'They cannot be recovered.', 'Discard & switch', true))) return
      return checkout(name, { ...opts, stash: r.how === 'stash', discard: r.how === 'discard' })
    }
    toast(e.message, 'error')
    return refreshAll()
  }
  setBusy(-1)
  const loc = out?.local
  const shown = loc?.name || label
  if (out?.stashKept) toast(`Switched to ${shown}. Your changes did not apply cleanly, so they are kept in the stash.`, 'error', 9000)
  else toast(out?.stashed ? `Switched to ${shown} with your changes` : `Switched to ${shown}`)
  // origin/x checked out while a local x exists: we switched to the local one; offer to catch it up.
  if (loc && loc.behind > 0 && loc.ahead === 0) {
    if (await confirmBox(`Update ${loc.name}?`, `Your local ${loc.name} is ${loc.behind} commit${loc.behind > 1 ? 's' : ''} behind ${loc.remote}. Fast-forward it?`, 'Fast-forward'))
      await run('merge', { ref: loc.remote, ffOnly: true }, { success: `${loc.name} is up to date with ${loc.remote}` })
  } else if (loc && loc.behind > 0)
    toast(`Local ${loc.name} and ${loc.remote} have diverged (${loc.ahead} ahead, ${loc.behind} behind). Merge or rebase when you are ready.`, 'ok', 8000)
  state.history.stale = true
  await refreshAll()
}
async function checkoutCommit(hash) {
  if (!(await confirmBox('Checkout commit?', `HEAD will be detached at ${hash.slice(0, 7)}. Create a branch if you want to keep new commits.`, 'Checkout'))) return
  closeSheet()
  checkout(hash, { detach: true })
}
async function newBranch(start) {
  const r = await dialog({
    title: 'New branch',
    fields: [
      { key: 'name', label: 'Branch name', placeholder: 'feature/my-change' },
      { key: 'start', label: 'Start from', value: start || '', placeholder: 'HEAD' },
      { key: 'checkout', label: 'Switch to it', type: 'check', value: true }
    ],
    ok: 'Create'
  })
  if (!r?.name.trim()) return
  if (state.sheets.length) closeSheet()
  state.history.commits = []
  run('branchCreate', { name: r.name.trim(), start: r.start.trim() || undefined, checkout: r.checkout }, { success: `Created ${r.name.trim()}` })
}
async function mergeRef(ref) {
  const cur = state.status?.branch || 'HEAD'
  const r = await dialog({
    title: `Merge ${ref.length === 40 ? ref.slice(0, 7) : ref} into ${cur}`,
    fields: [
      {
        key: 'mode',
        label: 'Strategy',
        type: 'select',
        value: 'default',
        options: [
          ['default', 'Fast-forward if possible'],
          ['noFf', 'Always create a merge commit'],
          ['ffOnly', 'Fast-forward only'],
          ['squash', 'Squash (stage changes, no commit)']
        ]
      },
      { key: 'ai', label: 'If there are conflicts, resolve them with AI', type: 'check', value: true }
    ],
    ok: 'Merge'
  })
  if (!r) return
  if (state.sheets.length) closeSheet()
  state.history.commits = []
  const out = await run('merge', { ref, [r.mode]: r.mode !== 'default' }, { success: r.mode === 'squash' ? 'Squashed; review and commit' : 'Merged' })
  if (out === undefined && r.ai && state.status?.files.some((f) => f.conflict)) resolveWithAi()
}
async function rebaseOnto(ref) {
  const cur = state.status?.branch || 'HEAD'
  if (!(await confirmBox(`Rebase ${cur} onto ${ref}?`, 'Your commits will be replayed on top of it. Avoid this on branches others already pulled.', 'Rebase'))) return
  state.history.commits = []
  const out = await run('rebase', { onto: ref }, { success: 'Rebased' })
  if (out === undefined && state.status?.files.some((f) => f.conflict) && (await confirmBox('Rebase hit conflicts', 'Resolve them with AI in a new terminal?', 'Resolve with AI'))) resolveWithAi()
}
async function newTag(hash) {
  const r = await dialog({
    title: 'Create tag',
    fields: [
      { key: 'name', label: 'Tag name', placeholder: 'v1.0.0' },
      { key: 'message', label: 'Message (optional, makes an annotated tag)', type: 'textarea' }
    ],
    ok: 'Create'
  })
  if (!r?.name.trim()) return
  state.history.commits = []
  run('tagCreate', { name: r.name.trim(), message: r.message.trim() || undefined, hash }, { success: `Tagged ${r.name.trim()}` })
}

async function viewBranches() {
  const r = await call('refs')
  const root = h('div', { class: 'view', style: { paddingTop: '8px' } })
  const filter = h('input', { type: 'text', placeholder: 'Filter branches and tags…', value: state.branchFilter || '' })
  filter.value = state.branchFilter || ''
  const listWrap = h('div')
  root.append(h('div', { class: 'history-bar' }, filter, iconBtn('plus', 'New branch', () => newBranch())))
  root.append(listWrap)
  const draw = () => {
    const q = (state.branchFilter || '').toLowerCase()
    const m = (x) => !q || x.name.toLowerCase().includes(q)
    clear(listWrap)
    const local = r.local.filter(m)
    listWrap.append(h('div', { class: 'section-head' }, 'Local', h('span', { class: 'count' }, local.length)))
    for (const b of local) listWrap.append(localBranchRow(b))
    const remote = r.remote.filter(m)
    if (remote.length) {
      listWrap.append(h('div', { class: 'section-head' }, 'Remote', h('span', { class: 'count' }, remote.length)))
      for (const b of remote) listWrap.append(remoteBranchRow(b, r.local))
    }
    const tags = r.tags.filter(m)
    if (tags.length) {
      listWrap.append(h('div', { class: 'section-head' }, 'Tags', h('span', { class: 'count' }, tags.length)))
      for (const t of tags) listWrap.append(tagRow(t))
    }
  }
  filter.addEventListener('input', () => {
    state.branchFilter = filter.value
    draw()
  })
  draw()
  return root
}

function trackInfo(b) {
  if (b.gone) return h('span', { class: 'pill', title: 'Upstream was deleted' }, 'gone')
  if (!b.upstream) return null
  const parts = []
  if (b.ahead) parts.push(`↑${b.ahead}`)
  if (b.behind) parts.push(`↓${b.behind}`)
  return parts.length ? h('span', { class: 'dim mono', title: b.upstream }, parts.join(' ')) : null
}

function localBranchRow(b) {
  const cur = state.status?.branch
  return h(
    'div',
    { class: `item ${b.current ? 'current' : ''}`, title: `${b.name}${b.upstream ? ` → ${b.upstream}` : ''}\n${b.subject}`, onDblclick: () => !b.current && checkout(b.name) },
    b.current ? icon('check', 13) : icon('branch', 13),
    h('span', { class: 'grow ellipsis' }, b.name),
    h('span', { class: 'meta-right row' }, trackInfo(b), h('span', { class: 'dim', style: { fontSize: '11px' } }, ago(b.date))),
    h(
      'div',
      { class: 'hover-actions', onClick: (e) => e.stopPropagation() },
      !b.current && iconBtn('right', 'Checkout', () => checkout(b.name)),
      iconBtn('more', 'More', (e) =>
        menu(e.currentTarget, [
          !b.current && { label: 'Checkout', icon: 'right', onClick: () => checkout(b.name) },
          !b.current && cur && { label: `Merge into ${cur}`, icon: 'merge', onClick: () => mergeRef(b.name) },
          !b.current && cur && { label: `Rebase ${cur} onto this`, icon: 'merge', onClick: () => rebaseOnto(b.name) },
          { label: 'New branch from here…', icon: 'plus', onClick: () => newBranch(b.name) },
          { label: 'New worktree…', icon: 'worktree', onClick: () => addWorktree({ branch: b.name }) },
          { label: 'Show history', icon: 'history', onClick: () => showBranchLog(b.name) },
          !b.current && { label: `Compare with ${cur || 'HEAD'}`, icon: 'compare', onClick: () => compareSheet(cur || 'HEAD', b.name) },
          '-',
          b.current && { label: 'Push', icon: 'push', onClick: () => run('push', {}, { success: 'Pushed' }) },
          !b.current && { label: 'Push', icon: 'push', onClick: () => run('push', { branch: b.name }, { success: `Pushed ${b.name}` }) },
          { label: 'Set upstream…', icon: 'globe', onClick: () => setUpstream(b) },
          { label: 'Rename…', icon: 'edit', onClick: () => renameBranch(b.name) },
          { label: 'Copy name', icon: 'copy', onClick: () => copy(b.name) },
          !b.current && '-',
          !b.current && { label: 'Delete…', icon: 'trash', danger: true, onClick: () => deleteBranch(b.name) }
        ])
      )
    )
  )
}
function remoteBranchRow(b, local) {
  const short = b.name.replace(/^[^/]+\//, '')
  const remote = b.name.split('/')[0]
  const hasLocal = local.some((l) => l.name === short)
  const cur = state.status?.branch
  return h(
    'div',
    { class: 'item', title: `${b.name}\n${b.subject}` },
    icon('globe', 13),
    h('span', { class: 'grow ellipsis' }, b.name),
    h('span', { class: 'meta-right dim', style: { fontSize: '11px' } }, ago(b.date)),
    h(
      'div',
      { class: 'hover-actions', onClick: (e) => e.stopPropagation() },
      iconBtn('more', 'More', (e) =>
        menu(e.currentTarget, [
          hasLocal ? { label: `Checkout ${short}`, icon: 'right', onClick: () => checkout(short) } : { label: `Checkout as ${short}`, icon: 'right', onClick: () => checkout(b.name, { track: true }) },
          cur && { label: `Merge into ${cur}`, icon: 'merge', onClick: () => mergeRef(b.name) },
          cur && { label: `Rebase ${cur} onto this`, icon: 'merge', onClick: () => rebaseOnto(b.name) },
          { label: 'New branch from here…', icon: 'plus', onClick: () => newBranch(b.name) },
          { label: 'New worktree…', icon: 'worktree', onClick: () => addWorktree({ newBranch: short, base: b.name }) },
          { label: 'Show history', icon: 'history', onClick: () => showBranchLog(b.name) },
          { label: `Compare with ${cur || 'HEAD'}`, icon: 'compare', onClick: () => compareSheet(cur || 'HEAD', b.name) },
          '-',
          {
            label: `Delete from ${remote}…`,
            icon: 'trash',
            danger: true,
            onClick: async () =>
              (await confirmBox(`Delete ${b.name}?`, `The branch is removed from the remote "${remote}" for everyone.`, 'Delete', true)) &&
              run('remoteBranchDelete', { remote, name: short }, { success: `Deleted ${b.name}` })
          }
        ])
      )
    )
  )
}
function tagRow(t) {
  return h(
    'div',
    { class: 'item', title: `${t.name}\n${t.subject}` },
    icon('tag', 13),
    h('span', { class: 'grow ellipsis' }, t.name),
    h('span', { class: 'meta-right dim mono' }, t.hash),
    h(
      'div',
      { class: 'hover-actions', onClick: (e) => e.stopPropagation() },
      iconBtn('more', 'More', (e) =>
        menu(e.currentTarget, [
          { label: 'Checkout (detached)', icon: 'right', onClick: () => checkout(t.name, { detach: true }) },
          { label: 'New branch from tag…', icon: 'plus', onClick: () => newBranch(t.name) },
          { label: 'Push tag', icon: 'push', onClick: () => run('tagPush', { name: t.name }, { success: `Pushed ${t.name}` }) },
          '-',
          { label: 'Delete (local)…', icon: 'trash', danger: true, onClick: async () => (await confirmBox(`Delete tag ${t.name}?`, 'Only the local tag is deleted.', 'Delete', true)) && run('tagDelete', { name: t.name }) }
        ])
      )
    )
  )
}
async function showBranchLog(ref) {
  openSheet(`History · ${ref}`, h('div', { class: 'empty' }, 'Loading…'))
  let commits
  try {
    commits = await call('log', { ref, limit: 200 })
  } catch (e) {
    closeSheet()
    return toast(e.message, 'error')
  }
  const rows = layoutGraph(commits)
  const width = graphWidth(rows) + 4
  const list = h('div')
  commits.forEach((c, i) =>
    list.append(
      h(
        'div',
        { class: 'commit-row', onClick: () => openCommit(c.hash), onContextmenu: (e) => commitContextMenu(e, c) },
        graphSvg(rows[i], width, c.parents.length > 1, c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD -> '))),
        h(
          'div',
          { class: 'commit-text' },
          h('div', { class: 'commit-subject' }, refPills(c.refs, rows && rows[i] ? rows[i].color : null), h('span', { class: 's' }, c.subject)),
          h('div', { class: 'commit-meta' }, `${c.author} · ${ago(c.time)} · ${c.hash.slice(0, 7)}`)
        )
      )
    )
  )
  clear(state.sheets[state.sheets.length - 1].el.querySelector('.sheet-body')).append(list)
}
async function renameBranch(from) {
  const r = await dialog({ title: 'Rename branch', fields: [{ key: 'to', label: 'New name', value: from }], ok: 'Rename' })
  if (!r?.to.trim() || r.to.trim() === from) return
  run('branchRename', { from, to: r.to.trim() }, { success: 'Renamed' })
}
async function deleteBranch(name) {
  const r = await dialog({
    title: `Delete ${name}?`,
    fields: [{ key: 'force', label: 'Force delete even if not merged', type: 'check', value: false }],
    ok: 'Delete',
    danger: true
  })
  if (!r) return
  run('branchDelete', { name, force: r.force }, { success: `Deleted ${name}` })
}
async function setUpstream(b) {
  const r = await dialog({ title: `Upstream for ${b.name}`, fields: [{ key: 'up', label: 'Remote branch', value: b.upstream || `origin/${b.name}` }], ok: 'Set' })
  if (!r?.up.trim()) return
  run('setUpstream', { branch: b.name, upstream: r.up.trim() }, { success: 'Upstream set' })
}

/* =========================================================================
   Worktrees
   ========================================================================= */
async function addWorktree(pre = {}) {
  let refsList = { local: [], remote: [] }
  try {
    refsList = await call('refs')
  } catch {}
  const top = state.status?.toplevel || state.repo
  const parent = top.replace(/[\\/][^\\/]+[\\/]?$/, '')
  const repoName = basename(top)
  const sep = top.includes('\\') ? '\\' : '/'
  const existing = !!pre.branch
  const r = await dialog({
    title: 'New worktree',
    message: 'A worktree is a second checkout of this repository in its own folder, on its own branch.',
    fields: [
      {
        key: 'mode',
        label: 'Branch',
        type: 'select',
        value: existing ? 'existing' : 'new',
        options: [
          ['new', 'Create a new branch'],
          ['existing', 'Use an existing branch'],
          ['detach', 'Detached at a commit']
        ]
      },
      { key: 'name', label: 'Branch name (new) or existing branch / commit', value: pre.branch || pre.newBranch || '', placeholder: 'feature/x' },
      {
        key: 'base',
        label: 'Base for a new branch',
        type: 'select',
        value: pre.base || state.status?.branch || 'HEAD',
        options: [['HEAD', 'HEAD (current)'], ...refsList.local.map((b) => [b.name, b.name]), ...refsList.remote.map((b) => [b.name, b.name])]
      },
      { key: 'path', label: 'Folder', value: '', placeholder: `${parent}${sep}${repoName}-<branch>`, hint: 'Leave empty to use the placeholder path.' }
    ],
    ok: 'Create worktree'
  })
  if (!r?.name.trim()) return
  const name = r.name.trim()
  const p = r.path.trim() || `${parent}${sep}${repoName}-${name.replace(/[\\/:*?"<>|\s]+/g, '-')}`
  const args = { path: p }
  if (r.mode === 'new') Object.assign(args, { newBranch: name, base: r.base === 'HEAD' ? undefined : r.base })
  else if (r.mode === 'existing') args.branch = name
  else Object.assign(args, { detach: true, branch: name })
  const out = await run('worktreeAdd', args, { success: `Worktree created at ${p}` })
  if (out !== undefined && state.tab !== 'worktrees') setTab('worktrees')
}

async function viewWorktrees() {
  const list = await call('worktrees')
  const root = h('div', { class: 'view' })
  root.append(
    h(
      'div',
      { class: 'section-head' },
      'Worktrees',
      h('span', { class: 'count' }, list.length),
      h('div', { class: 'actions' }, iconBtn('trash', 'Prune stale worktrees', () => run('worktreePrune', {}, { success: 'Pruned' })), iconBtn('plus', 'New worktree', () => addWorktree()))
    )
  )
  for (const w of list) {
    const name = w.bare ? '(bare)' : w.branch || `detached @ ${(w.head || '').slice(0, 7)}`
    root.append(
      h(
        'div',
        { class: 'card', 'data-wt': w.path },
        h(
          'div',
          { class: 'row' },
          icon(w.branch ? 'branch' : 'commit', 13),
          h('strong', { class: 'grow ellipsis', title: name }, name),
          w.current && h('span', { class: 'pill on' }, 'here'),
          w.main && h('span', { class: 'pill' }, 'main'),
          w.locked && h('span', { class: 'pill', title: typeof w.locked === 'string' ? w.locked : '' }, 'locked'),
          w.prunable && h('span', { class: 'pill', title: typeof w.prunable === 'string' ? w.prunable : '' }, 'missing')
        ),
        h('div', { class: 'wt-path' }, w.path),
        h(
          'div',
          { class: 'row' },
          !w.current &&
            h(
              'button',
              {
                class: 'btn sm',
                title: 'Switch Orca to this worktree',
                onClick: async () => {
                  const r = await request('worktree.open', { path: w.path }).catch((e) => (toast(e.message, 'error'), null))
                  if (r && !r.opened) toast('Orca does not list this worktree as a workspace. Use "View here" instead.', 'error')
                }
              },
              icon('open', 12),
              'Open in Orca'
            ),
          !w.current && h('button', { class: 'btn sm', title: 'Show this worktree in the panel without switching Orca', onClick: () => pinRepo(w.path) }, 'View here'),
          h('span', { class: 'grow' }),
          !w.main &&
            iconBtn('more', 'More', (e) =>
              menu(e.currentTarget, [
                { label: w.locked ? 'Unlock' : 'Lock', icon: 'lock', onClick: () => run('worktreeLock', { path: w.path, unlock: !!w.locked }) },
                { label: 'Copy path', icon: 'copy', onClick: () => copy(w.path) },
                '-',
                {
                  label: 'Remove…',
                  icon: 'trash',
                  danger: true,
                  onClick: async (ev) => {
                    const r = await dialog({
                      title: w.prunable ? 'Remove missing worktree?' : 'Remove worktree?',
                      message: w.prunable ? `${w.path}

Git no longer finds this worktree. Its record is removed; any files left in the folder stay on disk.` : w.path,
                      fields: w.prunable
                        ? []
                        : [
                            { key: 'force', label: w.locked ? 'Force (it is locked, and discard its uncommitted changes)' : 'Force (discard its uncommitted changes)', type: 'check', value: !!w.locked },
                            w.branch && { key: 'deleteBranch', label: `Also delete branch ${w.branch}`, type: 'check', value: false }
                          ].filter(Boolean),
                      ok: 'Remove',
                      danger: true
                    })
                    if (!r) return
                    const card = document.querySelector(`[data-wt="${CSS.escape(w.path)}"]`)
                    card?.classList.add('leaving')
                    let out
                    setBusy(1)
                    try {
                      out = await call('worktreeRemove', { path: w.path, force: r.force, deleteBranch: r.deleteBranch })
                    } catch (err) {
                      // Uncommitted or untracked files: say so plainly and offer to remove it anyway.
                      if (!r.force && /--force|modified|untracked/i.test(err.message)) {
                        setBusy(-1)
                        const yes = await confirmBox('This worktree has uncommitted changes', `${w.path}

Removing it deletes those changes. This cannot be undone.`, 'Remove anyway', true)
                        setBusy(1) // balanced by finally
                        if (yes) out = await call('worktreeRemove', { path: w.path, force: true, deleteBranch: r.deleteBranch }).catch((e2) => (toast(e2.message, 'error'), undefined))
                      } else toast(err.message, 'error')
                    } finally {
                      setBusy(-1)
                    }
                    if (out === undefined) card?.classList.remove('leaving')
                    else if (out.leftover) toast(`Worktree removed from Git. Some files are left in the folder:
${w.path}`, 'ok', 7000)
                    else toast('Worktree removed')
                    if (out !== undefined) await new Promise((res) => setTimeout(res, 180)) // let the card fold away
                    refreshAll()
                  }
                }
              ])
            )
        )
      )
    )
  }
  return root
}

/* =========================================================================
   Stash
   ========================================================================= */
async function viewStash() {
  const list = await call('stashList')
  const root = h('div', { class: 'view' })
  const msg = h('input', { type: 'text', placeholder: 'Stash message (optional)' })
  const untracked = h('input', { type: 'checkbox', checked: true })
  const keepIndex = h('input', { type: 'checkbox' })
  const dirty = state.status.files.length > 0
  root.append(
    h(
      'div',
      { class: 'form' },
      msg,
      h('div', { class: 'row', style: { gap: '12px' } }, h('label', { class: 'check' }, untracked, 'Include untracked'), h('label', { class: 'check' }, keepIndex, 'Keep staged')),
      h(
        'button',
        {
          class: 'btn primary',
          disabled: !dirty,
          onClick: () => run('stashSave', { message: msg.value.trim(), untracked: untracked.checked, keepIndex: keepIndex.checked }, { success: 'Stashed' })
        },
        icon('stash', 13),
        dirty ? 'Stash changes' : 'Nothing to stash'
      )
    )
  )
  root.append(h('div', { class: 'section-head' }, 'Stashes', h('span', { class: 'count' }, list.length)))
  if (!list.length) root.append(h('div', { class: 'empty' }, 'No stashes'))
  for (const s of list) {
    root.append(
      h(
        'div',
        { class: 'item', title: s.subject, onClick: () => showDiff(s.subject, () => call('stashShow', { ref: s.ref }), [iconBtn('check', 'Apply', () => (closeSheet(), run('stashApply', { ref: s.ref }, { success: 'Applied' })))]) },
        icon('stash', 13),
        h('span', { class: 'grow ellipsis' }, s.subject.replace(/^(WIP on|On) [^:]+: /, '') || s.ref),
        h('span', { class: 'meta-right dim', style: { fontSize: '11px' } }, ago(s.time)),
        h(
          'div',
          { class: 'hover-actions', onClick: (e) => e.stopPropagation() },
          iconBtn('check', 'Apply (keep stash)', () => run('stashApply', { ref: s.ref }, { success: 'Applied' })),
          iconBtn('pull', 'Pop (apply and drop)', () => run('stashPop', { ref: s.ref }, { success: 'Popped' })),
          iconBtn('trash', 'Drop', async () => (await confirmBox('Drop stash?', s.subject, 'Drop', true)) && run('stashDrop', { ref: s.ref }, { success: 'Dropped' }))
        )
      )
    )
  }
  return root
}

/* =========================================================================
   Settings: git config (global / repository) + remotes
   ========================================================================= */
const COMMON = [
  { group: 'Identity' },
  { key: 'user.name', label: 'Name', placeholder: 'Jane Doe' },
  { key: 'user.email', label: 'Email', placeholder: 'jane@example.com' },
  { group: 'Behavior' },
  {
    key: 'pull.rebase',
    label: 'Pull strategy',
    options: [
      ['', 'Not set (merge)'],
      ['false', 'Merge'],
      ['true', 'Rebase'],
      ['merges', 'Rebase, keep merges']
    ]
  },
  {
    key: 'core.autocrlf',
    label: 'Line endings (core.autocrlf)',
    options: [
      ['', 'Not set'],
      ['true', 'true (Windows: CRLF ↔ LF)'],
      ['input', 'input (convert to LF on commit)'],
      ['false', 'false (no conversion)']
    ]
  },
  { key: 'init.defaultBranch', label: 'Default branch for new repos', placeholder: 'main', globalOnly: true },
  {
    key: 'push.autoSetupRemote',
    label: 'Auto set upstream on first push',
    options: [
      ['', 'Not set'],
      ['true', 'Yes'],
      ['false', 'No']
    ]
  },
  {
    key: 'fetch.prune',
    label: 'Prune deleted remote branches on fetch',
    options: [
      ['', 'Not set'],
      ['true', 'Yes'],
      ['false', 'No']
    ]
  },
  {
    key: 'commit.gpgsign',
    label: 'Sign commits',
    options: [
      ['', 'Not set'],
      ['true', 'Yes'],
      ['false', 'No']
    ]
  },
  { key: 'core.editor', label: 'Editor', placeholder: 'code --wait' },
  { group: 'HTTPS & credentials' },
  {
    key: 'credential.helper',
    label: 'Credential helper (remembers your HTTPS login)',
    options: [
      ['', 'Not set'],
      ['manager', 'manager (Git Credential Manager, recommended)'],
      ['store', 'store (plain-text file)'],
      ['cache', 'cache (in memory for a while)']
    ]
  },
  {
    key: 'http.sslVerify',
    label: 'Verify HTTPS certificates',
    options: [
      ['', 'Not set (yes)'],
      ['true', 'Yes'],
      ['false', 'No (only for self-signed servers you trust)']
    ]
  },
  {
    key: 'http.sslBackend',
    label: 'TLS backend',
    options: [
      ['', 'Not set'],
      ['schannel', 'schannel (Windows certificate store)'],
      ['openssl', 'openssl']
    ]
  },
  { key: 'http.proxy', label: 'HTTP proxy', placeholder: 'http://proxy.example.com:8080' },
  { key: 'https.proxy', label: 'HTTPS proxy', placeholder: 'http://proxy.example.com:8080' },
  { key: 'http.sslCAInfo', label: 'Custom CA certificate file', placeholder: 'C:\certs\company-ca.pem' },
  { key: 'http.postBuffer', label: 'Upload buffer (bytes, for large pushes)', placeholder: '524288000' }
]

async function viewSettings() {
  const scope = state.configScope
  const [entries, globals] = await Promise.all([
    call('configList', { scope }),
    scope === 'local' ? call('configList', { scope: 'global' }).catch(() => []) : Promise.resolve([])
  ])
  const map = {}
  for (const e of entries) map[e.key.toLowerCase()] = e.value
  const gmap = {}
  for (const e of globals) gmap[e.key.toLowerCase()] = e.value
  const root = h('div', { class: 'view' })

  const seg = h(
    'div',
    { class: 'segmented' },
    h('button', { class: scope === 'global' ? 'on' : '', onClick: () => setScope('global') }, 'Global'),
    h('button', { class: scope === 'local' ? 'on' : '', onClick: () => setScope('local') }, 'This repository')
  )
  function setScope(s) {
    state.configScope = s
    store.set('configScope', s)
    renderView()
  }
  root.append(
    h('div', { style: { padding: '4px 10px 2px' } }, seg),
    h(
      'div',
      { class: 'dim', style: { padding: '4px 10px 0', fontSize: '11px' } },
      scope === 'global' ? 'Applies to every repository for your user (~/.gitconfig).' : 'Applies only to this repository (.git/config) and overrides global values.'
    )
  )

  // identity + common options
  root.append(h('div', { class: 'section-head' }, scope === 'global' ? 'Identity & defaults' : 'Repository overrides'))
  const inputs = {}
  const form = h('div', { class: 'form' })
  for (const f of COMMON) {
    if (f.group) {
      form.append(h('div', { class: 'cfg-group' }, f.group))
      continue
    }
    if (f.globalOnly && scope !== 'global') continue
    const cur = map[f.key.toLowerCase()] ?? ''
    const inherited = gmap[f.key.toLowerCase()]
    let el
    if (f.options) {
      const opts = (f.options.some(([v]) => v === cur) ? f.options : [...f.options, [cur, cur]]).map(([v, l]) =>
        v === '' && inherited != null ? ['', `Use global (${inherited})`] : [v, l]
      )
      el = h('select', null, opts.map(([v, l]) => h('option', { value: v, selected: v === cur }, l)))
    } else
      el = h('input', {
        type: 'text',
        value: cur,
        placeholder: inherited != null ? `${inherited}  (global)` : f.placeholder || '',
        spellcheck: 'false'
      })
    el.value = cur
    inputs[f.key] = { el, cur }
    form.append(h('div', { class: 'field' }, h('label', null, f.label, h('span', { class: 'dim mono', style: { marginLeft: '6px', fontSize: '10px' } }, f.key)), el))
  }
  form.append(
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'grow' }),
      h(
        'button',
        {
          class: 'btn primary',
          onClick: async () => {
            setBusy(1)
            try {
              for (const [key, { el, cur }] of Object.entries(inputs)) {
                const v = el.value.trim()
                if (v === cur) continue
                if (v === '') await call('configUnset', { scope, key })
                else await call('configSet', { scope, key, value: v })
              }
              toast(scope === 'global' ? 'Global config saved' : 'Repository config saved')
            } catch (e) {
              toast(e.message, 'error')
            } finally {
              setBusy(-1)
              renderView()
            }
          }
        },
        'Save'
      )
    )
  )
  root.append(form)

  // remotes
  if (scope === 'local') {
    const remotes = await call('remotes').catch(() => [])
    root.append(h('div', { class: 'section-head' }, 'Remotes', h('span', { class: 'count' }, remotes.length), h('div', { class: 'actions' }, iconBtn('plus', 'Add remote', addRemote))))
    if (!remotes.length) root.append(h('div', { class: 'dim', style: { padding: '2px 10px 8px', fontSize: '11.5px' } }, 'No remotes yet.'))
    for (const r of remotes)
      root.append(
        h(
          'div',
          { class: 'cfg-row' },
          h('div', { style: { minWidth: 0 } }, h('div', { style: { fontWeight: 600 } }, r.name), h('div', { class: 'cfg-key', style: { wordBreak: 'break-all' } }, r.fetch)),
          h(
            'div',
            { class: 'row', style: { gap: 0 } },
            /^https?:\/\//.test(r.fetch) || /^git@|^ssh:\/\//.test(r.fetch)
              ? iconBtn('globe', /^https?:/.test(r.fetch) ? 'Switch to SSH' : 'Switch to HTTPS', async () => {
                  const url = swapProtocol(r.fetch)
                  if (url && (await confirmBox(`Use ${/^https?:/.test(url) ? 'HTTPS' : 'SSH'} for ${r.name}?`, url, 'Switch')))
                    run('remoteSetUrl', { name: r.name, url }, { success: 'Remote updated' })
                })
              : null,
            iconBtn('edit', 'Change URL', async () => {
              const v = await dialog({ title: `URL for ${r.name}`, fields: [{ key: 'url', label: 'URL', value: r.fetch }], ok: 'Save' })
              if (v?.url.trim()) run('remoteSetUrl', { name: r.name, url: v.url.trim() }, { success: 'Remote updated' })
            }),
            iconBtn('trash', 'Remove remote', async () => (await confirmBox(`Remove remote ${r.name}?`, 'Its remote-tracking branches are removed too.', 'Remove', true)) && run('remoteRemove', { name: r.name }, { success: 'Remote removed' }))
          )
        )
      )
  }

  if (scope === 'local') root.append(await maintenanceSection())

  // every entry
  root.append(h('div', { class: 'section-head' }, 'All entries', h('span', { class: 'count' }, entries.length), h('div', { class: 'actions' }, iconBtn('plus', 'Add entry', () => editEntry(scope)))))
  for (const e of entries)
    root.append(
      h(
        'div',
        { class: 'cfg-row' },
        h('div', { style: { minWidth: 0 } }, h('div', { class: 'cfg-key' }, e.key), h('div', { class: 'cfg-val' }, e.value)),
        h(
          'div',
          { class: 'row', style: { gap: 0 } },
          iconBtn('edit', 'Edit', () => editEntry(scope, e)),
          iconBtn('trash', 'Unset', async () => (await confirmBox(`Unset ${e.key}?`, `Removes it from the ${scope === 'global' ? 'global' : 'repository'} config.`, 'Unset', true)) && run('configUnset', { scope, key: e.key }))
        )
      )
    )
  return root
}
/** https://host/owner/repo.git ⇄ git@host:owner/repo.git */
function swapProtocol(url) {
  let m = url.match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(\.git)?\/?$/)
  if (m) return `git@${m[1]}:${m[2]}.git`
  m = url.match(/^git@([^:]+):(.+?)(\.git)?$/) || url.match(/^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(\.git)?$/)
  if (m) return `https://${m[1]}/${m[2]}.git`
  return null
}

async function editEntry(scope, e) {
  const r = await dialog({
    title: e ? `Edit ${e.key}` : 'Add config entry',
    fields: [
      { key: 'key', label: 'Key', value: e?.key || '', placeholder: 'section.name' },
      { key: 'value', label: 'Value', value: e?.value || '' }
    ],
    ok: 'Save'
  })
  if (!r?.key.trim()) return
  run('configSet', { scope, key: r.key.trim(), value: r.value }, { success: 'Saved' })
}
async function addRemote() {
  const r = await dialog({
    title: 'Add remote',
    fields: [
      { key: 'name', label: 'Name', value: 'origin' },
      { key: 'url', label: 'URL', placeholder: 'https://github.com/owner/repo.git' }
    ],
    ok: 'Add'
  })
  if (!r?.name.trim() || !r.url.trim()) return
  run('remoteAdd', { name: r.name.trim(), url: r.url.trim() }, { success: 'Remote added' })
}


/* =========================================================================
   Git Extensions extras: file menu, blame, file history, compare, tree,
   reflog, bisect, interactive rebase, squash, patches, clone, maintenance
   ========================================================================= */
function fileMenu(anchor, f) {
  const ext = f.path.includes('.') ? '*' + f.path.slice(f.path.lastIndexOf('.')) : null
  menu(anchor, [
    !f.untracked && { label: 'Blame', icon: 'user', onClick: () => blameSheet(f.path) },
    !f.untracked && { label: 'File history', icon: 'history', onClick: () => fileHistory(f.path) },
    '-',
    { header: 'Add to .gitignore' },
    { label: f.path, icon: 'x', onClick: () => run('ignore', { pattern: '/' + f.path }, { success: 'Added to .gitignore' }) },
    ext && { label: ext, icon: 'x', onClick: () => run('ignore', { pattern: ext }, { success: 'Added to .gitignore' }) },
    dirname(f.path) && { label: dirname(f.path) + '/', icon: 'folder', onClick: () => run('ignore', { pattern: '/' + dirname(f.path) + '/' }, { success: 'Added to .gitignore' }) },
    '-',
    { label: 'Copy path', icon: 'copy', onClick: () => copy(f.path) }
  ])
}

function commitList(commits, { graph = true } = {}) {
  const rows = graph ? layoutGraph(commits) : null
  const width = rows ? graphWidth(rows) + 4 : 8
  const list = h('div')
  commits.forEach((c, i) =>
    list.append(
      h(
        'div',
        { class: 'commit-row', onClick: () => openCommit(c.hash), onContextmenu: (e) => commitContextMenu(e, c) },
        rows ? graphSvg(rows[i], width, c.parents.length > 1, c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD -> '))) : h('span', { style: { width: '8px' } }),
        h(
          'div',
          { class: 'commit-text' },
          h('div', { class: 'commit-subject' }, refPills(c.refs, rows && rows[i] ? rows[i].color : null), h('span', { class: 's', title: c.subject }, c.subject)),
          h('div', { class: 'commit-meta' }, `${c.author} · ${ago(c.time)} · `, h('span', { class: 'mono' }, c.hash.slice(0, 7)))
        )
      )
    )
  )
  if (!commits.length) list.append(h('div', { class: 'empty' }, 'No commits'))
  return list
}

async function sheetWith(title, loader) {
  openSheet(title, h('div', { class: 'empty' }, 'Loading…'))
  const sheet = state.sheets[state.sheets.length - 1]
  try {
    const el = await loader()
    clear(sheet.el.querySelector('.sheet-body')).append(el)
  } catch (e) {
    if (state.sheets.includes(sheet)) closeSheet()
    toast(e.message, 'error')
  }
}

function fileHistory(file) {
  return sheetWith(`History · ${basename(file)}`, async () => commitList(await call('log', { file, limit: 300 }), { graph: false }))
}

function blameSheet(file, rev) {
  return sheetWith(`Blame · ${basename(file)}${rev ? ` @ ${rev.slice(0, 7)}` : ''}`, async () => {
    const { commits, lines } = await call('blame', { file, rev })
    const wrap = h('div', { class: 'blame' })
    let prev = null
    const shade = {}
    let k = 0
    lines.forEach((l, i) => {
      const c = commits[l.h] || {}
      if (!(l.h in shade)) shade[l.h] = k++ % 2
      const first = l.h !== prev
      prev = l.h
      wrap.append(
        h(
          'div',
          { class: `bl ${shade[l.h] ? 'alt' : ''} ${first ? 'first' : ''}` },
          h(
            'span',
            { class: 'bl-meta', title: first ? `${c.summary || ''}\n${c.author || ''} · ${c.time ? fullDate(c.time) : ''}` : '', onClick: () => !/^0+$/.test(l.h) && openCommit(l.h) },
            first ? [h('span', { class: 'mono' }, /^0+$/.test(l.h) ? 'uncommitted' : l.h.slice(0, 7)), ' ', h('span', { class: 'dim' }, `${c.author || ''} · ${c.time ? ago(c.time) : ''}`)] : ''
          ),
          h('span', { class: 'n' }, i + 1),
          h('span', { class: 'c' }, l.t)
        )
      )
    })
    return wrap
  })
}

function compareSheet(a, b) {
  const short = (x) => (/^[0-9a-f]{40}$/.test(x) ? x.slice(0, 7) : x)
  return sheetWith(`${short(a)} ↔ ${short(b)}`, async () => {
    const r = await call('compare', { a, b })
    const wrap = h('div')
    wrap.append(
      h(
        'div',
        { class: 'detail' },
        h('div', null, h('strong', null, short(b)), ` is ${r.ahead} commit${r.ahead === 1 ? '' : 's'} ahead and ${r.behind} behind `, h('strong', null, short(a))),
        h('div', { class: 'actions-wrap' }, h('button', { class: 'btn sm', onClick: () => compareSheet(b, a) }, icon('compare', 12), 'Swap'))
      ),
      h('div', { class: 'section-head' }, 'Files', h('span', { class: 'count' }, r.files.length))
    )
    for (const f of r.files)
      wrap.append(
        h(
          'div',
          { class: 'item', title: f.orig ? `${f.orig} → ${f.path}` : f.path, onClick: () => showDiff(basename(f.path), () => call('compareFileDiff', { a, b, file: f.path })) },
          h('span', { class: `status-letter s-${f.status}` }, f.status),
          h('span', { class: 'file-name' }, basename(f.path)),
          h('span', { class: 'file-dir grow' }, dirname(f.path))
        )
      )
    if (!r.files.length) wrap.append(h('div', { class: 'empty' }, 'No differences'))
    return wrap
  })
}

function treeSheet(rev) {
  return sheetWith(`Files @ ${rev.slice(0, 7)}`, async () => {
    const files = await call('treeFiles', { rev })
    const wrap = h('div')
    const filter = h('input', { type: 'text', placeholder: `Filter ${files.length} files…` })
    const list = h('div')
    const draw = () => {
      const q = filter.value.toLowerCase()
      clear(list)
      files
        .filter((f) => !q || f.toLowerCase().includes(q))
        .slice(0, 500)
        .forEach((f) =>
          list.append(
            h(
              'div',
              { class: 'item', title: f, onClick: () => fileAt(rev, f) },
              icon('file', 13),
              h('span', { class: 'file-name' }, basename(f)),
              h('span', { class: 'file-dir grow' }, dirname(f)),
              h(
                'div',
                { class: 'hover-actions', onClick: (e) => e.stopPropagation() },
                iconBtn('user', 'Blame', () => blameSheet(f, rev)),
                iconBtn('history', 'File history', () => fileHistory(f))
              )
            )
          )
        )
    }
    filter.addEventListener('input', draw)
    draw()
    wrap.append(h('div', { class: 'history-bar', style: { paddingTop: '8px' } }, filter), list)
    return wrap
  })
}
function fileAt(rev, file) {
  return sheetWith(`${basename(file)} @ ${rev.slice(0, 7)}`, async () => {
    const text = await call('showFile', { rev, file })
    const wrap = h('div', { class: 'diff' })
    text.split('\n').forEach((t, i) => wrap.append(h('div', { class: 'l ctx' }, h('span', { class: 'n' }, i + 1), h('span', { class: 'c' }, t))))
    return wrap
  })
}

async function viewReflog() {
  const list = await call('reflog')
  const root = h('div', { class: 'view' })
  root.append(
    h('div', { class: 'section-head' }, 'Reflog', h('span', { class: 'count' }, list.length)),
    h('div', { class: 'dim', style: { padding: '0 10px 6px', fontSize: '11px' } }, 'Everywhere HEAD has been. Use it to recover commits after a reset, rebase or deleted branch.')
  )
  for (const e of list)
    root.append(
      h(
        'div',
        { class: 'item', title: e.subject, onClick: () => openCommit(e.hash) },
        h('span', { class: 'mono dim', style: { width: '56px', flex: 'none' } }, e.hash.slice(0, 7)),
        h('span', { class: 'grow ellipsis' }, e.subject),
        h('span', { class: 'meta-right dim', style: { fontSize: '11px' } }, ago(e.time)),
        h(
          'div',
          { class: 'hover-actions', onClick: (ev) => ev.stopPropagation() },
          iconBtn('plus', 'Create branch here', () => newBranch(e.hash)),
          iconBtn('undo', 'Reset current branch here', (ev) =>
            menu(ev.currentTarget, [
              { label: 'Soft reset here', icon: 'undo', onClick: () => resetTo(e.hash, 'soft') },
              { label: 'Mixed reset here', icon: 'undo', onClick: () => resetTo(e.hash, 'mixed') },
              { label: 'Hard reset here…', icon: 'alert', danger: true, onClick: () => resetTo(e.hash, 'hard') }
            ])
          )
        )
      )
    )
  return root
}

function bisectBanner(st) {
  return h(
    'div',
    { class: 'banner info' },
    h('div', { class: 'row' }, icon('search'), h('strong', null, 'Bisecting'), h('span', { class: 'dim mono' }, (st.oid || '').slice(0, 7))),
    h('div', { class: 'dim', style: { fontSize: '11.5px' } }, 'Test this commit, then mark it. Git checks out the next one to test.'),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn sm', onClick: () => run('bisect', { action: 'good' }, { success: 'Marked good' }).then(() => (state.history.commits = [])) }, icon('check', 12), 'Good'),
      h('button', { class: 'btn sm', onClick: () => run('bisect', { action: 'bad' }, { success: 'Marked bad' }).then(() => (state.history.commits = [])) }, icon('x', 12), 'Bad'),
      h('button', { class: 'btn sm', onClick: () => run('bisect', { action: 'skip' }, { success: 'Skipped' }) }, 'Skip'),
      h('button', { class: 'btn sm danger', onClick: () => run('bisect', { action: 'reset' }, { success: 'Bisect finished' }).then(() => (state.history.commits = [])) }, 'Stop')
    )
  )
}
async function startBisect(goodHash) {
  if (!(await confirmBox('Start bisect?', `Git will search between ${goodHash.slice(0, 7)} (good) and HEAD (bad) for the commit that introduced a bug.`, 'Start'))) return
  closeSheet()
  try {
    await call('bisect', { action: 'start' })
    await call('bisect', { action: 'bad', rev: 'HEAD' })
    await call('bisect', { action: 'good', rev: goodHash })
  } catch (e) {
    toast(e.message, 'error')
  }
  state.history.commits = []
  refreshAll()
}

async function rewordLast(c) {
  const r = await dialog({ title: 'Reword last commit', fields: [{ key: 'msg', label: 'Message', type: 'textarea', value: c.message }], ok: 'Save' })
  if (!r?.msg.trim()) return
  closeSheet()
  state.history.commits = []
  run('rewordLast', { message: r.msg }, { success: 'Message updated' })
}

async function squashSince(base) {
  let todo
  try {
    todo = await call('rebaseTodo', { base })
  } catch (e) {
    return toast(e.message, 'error')
  }
  if (todo.length < 2) return toast('There is only one commit after this one', 'error')
  const r = await dialog({
    title: `Squash ${todo.length} commits`,
    message: `Every commit after ${base.slice(0, 7)} on ${state.status?.branch || 'HEAD'} becomes one commit.`,
    fields: [{ key: 'msg', label: 'Message for the new commit', type: 'textarea', value: todo.map((t) => t.subject).reverse().join('\n') }],
    ok: 'Squash'
  })
  if (!r?.msg.trim()) return
  closeSheet()
  state.history.commits = []
  run('squashSince', { base, message: r.msg }, { success: 'Squashed' })
}

async function interactiveRebase(base) {
  let todo
  try {
    todo = (await call('rebaseTodo', { base })).map((t) => ({ ...t, action: 'pick' }))
  } catch (e) {
    return toast(e.message, 'error')
  }
  if (!todo.length) return toast('No commits after this one', 'error')
  closeOverlays()
  const list = h('div', { class: 'rebase-list' })
  const draw = () => {
    clear(list)
    todo.forEach((t, i) => {
      const sel = h(
        'select',
        { class: `act act-${t.action}`, onChange: (e) => ((t.action = e.target.value), draw()) },
        [
          ['pick', 'pick'],
          ['squash', 'squash'],
          ['fixup', 'fixup'],
          ['drop', 'drop']
        ].map(([v, l]) => h('option', { value: v, selected: t.action === v, disabled: i === 0 && (v === 'squash' || v === 'fixup') }, l))
      )
      list.append(
        h(
          'div',
          { class: `rebase-row ${t.action === 'drop' ? 'dropped' : ''}` },
          sel,
          h('span', { class: 'mono dim' }, t.hash.slice(0, 7)),
          h('span', { class: 'grow ellipsis', title: t.subject }, t.subject),
          iconBtn('push', 'Move up', () => (i > 0 && ([todo[i - 1], todo[i]] = [todo[i], todo[i - 1]]), fix(), draw()), { disabled: i === 0 }),
          iconBtn('pull', 'Move down', () => (i < todo.length - 1 && ([todo[i + 1], todo[i]] = [todo[i], todo[i + 1]]), fix(), draw()), { disabled: i === todo.length - 1 })
        )
      )
    })
  }
  const fix = () => {
    if (todo[0] && (todo[0].action === 'squash' || todo[0].action === 'fixup')) todo[0].action = 'pick'
  }
  draw()
  const close = () => overlay.remove()
  const box = h(
    'div',
    { class: 'dialog wide-dialog' },
    h('h3', null, `Interactive rebase onto ${base.slice(0, 7)}`),
    h('p', null, 'Oldest commit first. squash = merge into the commit above and keep both messages; fixup = merge and drop this message.'),
    list,
    h(
      'div',
      { class: 'buttons' },
      h('button', { class: 'btn', onClick: close }, 'Cancel'),
      h(
        'button',
        {
          class: 'btn primary',
          onClick: async () => {
            close()
            closeSheet()
            state.history.commits = []
            const out = await run('rebaseInteractive', { base, todo: todo.map(({ hash, action }) => ({ hash, action })) }, { success: 'Rebased' })
            if (out === undefined && state.status?.files.some((f) => f.conflict) && (await confirmBox('Rebase hit conflicts', 'Resolve them with AI in a new terminal?', 'Resolve with AI'))) resolveWithAi()
          }
        },
        'Start rebase'
      )
    )
  )
  const overlay = h('div', { class: 'overlay', onMousedown: (e) => e.target === overlay && close() }, box)
  document.body.append(overlay)
}

async function savePatch(c) {
  try {
    const text = await call('formatPatch', { hash: c.hash })
    const name = `${c.hash.slice(0, 7)}-${(c.message.split('\n')[0] || 'patch').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.patch`
    if (window.orca?.files?.saveAs) {
      const r = await window.orca.files.saveAs({ suggestedName: name, mimeType: 'text/x-diff', data: text })
      if (r.status === 'saved') toast('Patch saved')
    } else {
      await copy(text)
      toast('Patch copied to the clipboard')
    }
  } catch (e) {
    toast(e.message, 'error')
  }
}

async function cloneRepo() {
  const base = state.status?.toplevel ? state.status.toplevel.replace(/[\\/][^\\/]+[\\/]?$/, '') : ''
  const r = await dialog({
    title: 'Clone repository',
    fields: [
      { key: 'url', label: 'Repository URL', placeholder: 'https://github.com/owner/repo.git' },
      { key: 'path', label: 'Folder', value: base, placeholder: 'C:\\code', hint: 'The repository folder is created inside it.' },
      { key: 'recursive', label: 'Include submodules', type: 'check', value: true }
    ],
    ok: 'Clone'
  })
  if (!r?.url.trim()) return
  const name = r.url.trim().replace(/[\\/]+$/, '').split(/[\\/:]/).pop().replace(/\.git$/, '')
  const dir = r.path.trim() ? r.path.trim().replace(/[\\/]+$/, '') + (r.path.includes('\\') ? '\\' : '/') + name : name
  setBusy(1)
  try {
    const out = await request('git', { op: 'clone', args: { url: r.url.trim(), path: dir, recursive: r.recursive } }, 120000)
    toast(`Cloned into ${out}`)
    pinRepo(out)
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    setBusy(-1)
  }
}

async function maintenanceSection() {
  const wrap = h('div')
  const subs = await call('submodules').catch(() => [])
  wrap.append(h('div', { class: 'section-head' }, 'Maintenance'))
  wrap.append(
    h(
      'div',
      { class: 'form' },
      h(
        'div',
        { class: 'actions-wrap' },
        h(
          'button',
          {
            class: 'btn sm',
            onClick: async () => {
              const list = await call('cleanPreview', {}).catch((e) => (toast(e.message, 'error'), null))
              if (!list) return
              if (!list.length) return toast('No untracked files to clean')
              const r = await dialog({
                title: `Delete ${list.length} untracked item${list.length > 1 ? 's' : ''}?`,
                message: list.slice(0, 15).join('\n') + (list.length > 15 ? `\n… and ${list.length - 15} more` : ''),
                fields: [{ key: 'ignored', label: 'Also delete ignored files (build output, node_modules…)', type: 'check', value: false }],
                ok: 'Delete',
                danger: true
              })
              if (r) run('clean', { ignored: r.ignored }, { success: 'Cleaned' })
            }
          },
          icon('trash', 12),
          'Clean untracked files…'
        ),
        h('button', { class: 'btn sm', onClick: () => run('gc', {}, { success: 'Repository compressed' }) }, icon('layers', 12), 'Garbage collect'),
        h('button', { class: 'btn sm', onClick: () => run('fetch', { prune: true }, { success: 'Fetched and pruned' }) }, icon('fetch', 12), 'Fetch & prune')
      )
    )
  )
  if (subs.length) {
    wrap.append(
      h('div', { class: 'section-head' }, 'Submodules', h('span', { class: 'count' }, subs.length), h('div', { class: 'actions' }, iconBtn('refresh', 'Update all (init, recursive)', () => run('submoduleUpdate', {}, { success: 'Submodules updated' }))))
    )
    for (const m of subs)
      wrap.append(
        h(
          'div',
          { class: 'item', title: m.describe },
          icon('layers', 13),
          h('span', { class: 'grow ellipsis' }, m.path),
          h('span', { class: `pill ${m.state === 'ok' ? 'on' : ''}` }, m.state),
          h('div', { class: 'hover-actions', onClick: (e) => e.stopPropagation() }, iconBtn('right', 'View in panel', () => pinRepo((state.status.toplevel + '/' + m.path).replace(/\\/g, '/'))))
        )
      )
  }
  return wrap
}

/* ---------- full-tab sidebar (branches, remotes, tags); the repository is chosen from the header ---------- */
const sideOpen = store.get('sideOpen', { local: true, remote: false, tags: false })
async function renderSide() {
  const side = $('#side')
  if (!side) return
  let refs = state.refs || { local: [], remote: [], tags: [] }
  if (!state.refs && state.repo && state.status) refs = state.refs = (await call('refs').catch(() => null)) || refs
  state.localNames = new Set(refs.local.map((b) => b.name))
  const scroll = side.scrollTop
  clear(side)
  const section = (key, title, count, items, extra) => {
    const open = sideOpen[key]
    side.append(
      h(
        'button',
        { class: 'side-head', onClick: () => ((sideOpen[key] = !open), store.set('sideOpen', sideOpen), renderSide()) },
        icon(open ? 'down' : 'right', 12),
        h('span', { class: 'grow' }, title),
        count != null && h('span', { class: 'count' }, count),
        extra
      )
    )
    if (open) side.append(items())
  }
  if (!state.status) return
  section('local', 'Branches', refs.local.length, () => h('div', null, refs.local.map((b) => localBranchRow(b))), iconBtn('plus', 'New branch', (e) => (e.stopPropagation(), newBranch())))
  section('remote', 'Remotes', refs.remote.length, () => h('div', null, refs.remote.map((b) => remoteBranchRow(b, refs.local))))
  section('tags', 'Tags', refs.tags.length, () => h('div', null, refs.tags.map((t) => tagRow(t))))
  side.scrollTop = scroll
}


/* =========================================================================
   AI commit message modal (modeled on Orca's Source Control "Generate" dialog)
   ========================================================================= */
async function aiCommitModal({ staged, total, onUse, onCommit }) {
  closeOverlays()
  const prefs = store.get('aiPrefs', { instructions: '' })
  let agents = [
    { id: 'claude', name: 'Claude Code', available: true },
    { id: 'codex', name: 'Codex', available: true }
  ]
  let agent = 'claude'
  let gen = 0 // bumps on each run so a cancelled run's answer is ignored
  let busy = false

  const agentSel = h('select', { onChange: () => request('ai.settings', { agent: agentSel.value }).catch(() => {}) })
  const fillAgents = () => {
    clear(agentSel)
    for (const a of agents) agentSel.append(h('option', { value: a.id, selected: a.id === agent, disabled: !a.available }, a.available ? a.name : `${a.name} (not installed)`))
  }
  fillAgents()
  request('ai.settings', {}, 20000)
    .then((r) => {
      agents = r.agents
      agent = r.agent
      fillAgents()
    })
    .catch(() => {})

  const scopeSel = h(
    'select',
    null,
    h('option', { value: 'auto', selected: true }, staged ? `Staged changes (${staged} file${staged > 1 ? 's' : ''})` : `All changes (${total} file${total > 1 ? 's' : ''})`),
    staged && staged < total ? h('option', { value: 'all' }, `All changes (${total} files)`) : null
  )
  const instructions = h('textarea', { rows: 2, placeholder: 'Optional, e.g. "Use Conventional Commits", "Write in Thai", "Mention the ticket ID"' }, prefs.instructions || '')
  instructions.value = prefs.instructions || ''
  const result = h('textarea', { class: 'ai-result', rows: 6, placeholder: 'The generated message appears here. You can edit it before using it.' })
  const status = h('div', { class: 'ai-status' })
  const genBtn = h('button', { type: 'button', class: 'btn primary', onClick: () => generate() }, icon('sparkle', 13), 'Generate')
  const useBtn = h('button', { type: 'button', class: 'btn', disabled: true, onClick: () => finish(onUse) }, 'Use message')
  const commitBtn = h('button', { type: 'button', class: 'btn primary', disabled: true, onClick: () => finish(onCommit) }, icon('check', 13), 'Commit')

  const setBusy2 = (on, text) => {
    busy = on
    result.classList.toggle('generating', on)
    result.readOnly = on
    clear(status).append(on ? [h('span', { class: 'spinner' }), text] : text || '')
    clear(genBtn).append(on ? [icon('x', 13), 'Stop'] : [icon('sparkle', 13), result.value.trim() ? 'Regenerate' : 'Generate'])
    genBtn.className = `btn ${on ? '' : result.value.trim() ? '' : 'primary'}`
    const has = !on && !!result.value.trim()
    useBtn.disabled = !has
    commitBtn.disabled = !has
  }
  result.addEventListener('input', () => setBusy2(false))

  async function generate() {
    if (busy) {
      gen++
      return setBusy2(false, 'Stopped.')
    }
    const my = ++gen
    store.set('aiPrefs', { instructions: instructions.value })
    const name = agents.find((a) => a.id === agentSel.value)?.name || 'AI'
    setBusy2(true, `${name} is reading your changes…`)
    const started = Date.now()
    try {
      const msg = await request('ai.commitMessage', { repo: state.repo, agent: agentSel.value, instructions: instructions.value, scope: scopeSel.value }, 115000)
      if (my !== gen) return
      result.value = msg
      setBusy2(false, `Generated by ${name} in ${((Date.now() - started) / 1000).toFixed(1)}s. Review and edit before committing.`)
      result.focus()
    } catch (e) {
      if (my !== gen) return
      setBusy2(false, '')
      clear(status).append(h('span', { class: 'ai-error' }, icon('alert', 12), e.message))
    }
  }
  function finish(cb) {
    const msg = result.value.trim()
    if (!msg) return
    close()
    cb(msg)
  }
  const close = () => {
    gen++
    overlay.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close()
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) result.value.trim() && !busy ? finish(onCommit) : generate()
  }

  const box = h(
    'div',
    { class: 'dialog ai-dialog', role: 'dialog', 'aria-label': 'Generate commit message' },
    h('div', { class: 'ai-title' }, h('span', { class: 'ai-badge' }, icon('sparkle', 14)), h('div', null, h('h3', null, 'Generate commit message'), h('p', null, 'An AI agent reads your diff and drafts a message. Nothing is committed until you choose.'))),
    h('div', { class: 'ai-row' }, h('div', { class: 'field grow' }, h('label', null, 'Agent'), agentSel), h('div', { class: 'field grow' }, h('label', null, 'Changes'), scopeSel)),
    h('div', { class: 'field' }, h('label', null, 'Instructions'), instructions),
    h('div', { class: 'field' }, h('label', null, 'Message'), result),
    status,
    h('div', { class: 'buttons' }, h('button', { type: 'button', class: 'btn', onClick: close }, 'Cancel'), h('span', { class: 'grow' }), genBtn, useBtn, commitBtn)
  )
  const overlay = h('div', { class: 'overlay', onMousedown: (e) => e.target === overlay && !busy && close() }, box)
  document.body.append(overlay)
  document.addEventListener('keydown', onKey)
  generate() // start right away, like Orca's one-click generate
}

/* =========================================================================
   boot
   ========================================================================= */
$('#repoBtn').addEventListener('click', (e) => repoMenu(e.currentTarget))

// Right-click a branch, remote, tag, file, stash or worktree row: the same menu as its More button,
// opened at the pointer. Commit rows have their own handler; text fields keep the browser menu.
document.addEventListener('contextmenu', (e) => {
  if (e.defaultPrevented || e.target.closest('input, textarea, [contenteditable]')) return
  const row = e.target.closest('.item, .file-row, .side-item, .wt-row, .stash-row')
  const more = row?.querySelector('button[aria-label="More"], button[aria-label="Resolve"]')
  if (!more) return
  e.preventDefault()
  menuPoint = { x: e.clientX, y: e.clientY }
  more.click()
  menuPoint = null
})

if (hasOrca) {
  try {
    window.orca.on('workspace.changed', () => followFocus())
  } catch {}
}
async function followFocus() {
  if (state.pinned) return
  const before = state.repo
  await resolveRepo()
  if (state.repo !== before) refreshAll()
}
// The Git Graph tab tells the worker when it is shown or hidden, so switching to another workspace
// while on Git Graph brings that workspace's Git Graph to the front. A hidden tab may only shrink
// to nothing rather than become "hidden", so its size counts too.
if (IN_TAB) {
  let shown = null
  const report = () => {
    const now = document.visibilityState === 'visible' && window.innerWidth > 0 && window.innerHeight > 0
    if (now === shown) return
    shown = now
    request('graph.visible', { visible: now }).catch(() => {})
  }
  document.addEventListener('visibilitychange', report)
  new ResizeObserver(report).observe(document.documentElement)
  window.addEventListener('pagehide', () => request('graph.visible', { visible: false }).catch(() => {}))
  report()
}
window.addEventListener('focus', () => (state.pinned ? pollStatus() : followFocus().then(pollStatus)))
// workspace.changed may not fire for every switch, so also re-check the focused worktree now and then.
setInterval(() => !document.hidden && followFocus(), 3000)
setInterval(pollStatus, 4000)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.sheets.length && !document.querySelector('.overlay, .menu')) closeSheet()
  if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) {
    e.preventDefault()
    refreshAll(true)
  }
})

;(async () => {
  if (IN_TAB) {
    try {
      const doc = await window.orca.document.get()
      docRepo = JSON.parse(doc.content.text || '{}').repo || null
    } catch {}
  }
  const start = state.pinned || (IN_TAB ? docRepo : store.get('lastRepo', null))
  if (start) {
    setRepo(start)
    if (state.status) renderAll()
  }
  refreshAll(true)
})()
