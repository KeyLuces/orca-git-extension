// Git Control panel. Plain JS, no dependencies. Talks to worker/main.mjs through orca.plugin.request.
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
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  rows: '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="18" height="7" x="3" y="14" rx="1"/>',
  keyboard: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M7 16h10"/>',
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
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  open: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  pr: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v6"/><path d="M18 15V9a3 3 0 0 0-3-3h-4"/><path d="m13 3-3 3 3 3"/>',
  merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  compare: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  current: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="m8 12.5 2.6 2.6L16.5 9" stroke="var(--ref-head-ink, #14161b)" stroke-width="2.6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
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
  input = JSON.parse(JSON.stringify(input ?? {})) // drop undefined values: Orca rejects them as invalid input
  try {
    if (window.orca.plugin?.request) return await window.orca.plugin.request(name, input, { timeoutMs })
    const r = await window.orca.host.call('plugin.request', { name, input, timeoutMs })
    return r.output
  } catch (e) {
    if (/changed or is no longer approved/i.test(e?.message || '')) pluginUpdated()
    throw e
  }
}
/** The plugin was updated (or needs approving again): this page is the old one. Offer to reload it. */
let updateShown = false
function pluginUpdated() {
  if (updateShown) return
  updateShown = true
  const bar = h(
    'div',
    { class: 'update-bar' },
    icon('refresh', 13),
    h('span', { class: 'grow' }, 'Git Control was updated. Reload this tab to use the new version (approve it in Orca first if it asks).'),
    h('button', { class: 'btn sm primary', onClick: () => location.reload() }, 'Reload')
  )
  document.body.prepend(bar)
}
const NET_OPS = new Set(['fetch', 'pull', 'push', 'remoteBranchDelete', 'tagPush', 'worktreeAdd', 'commit', 'pipelines', 'pipelineJobs', 'jobLog', 'pipelineAct'])
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

/**
 * Every overlay and menu carries `dispose`: its own close (removes its key listeners, resolves its
 * promise). closeOverlays runs each one, so nothing is left waiting on a removed element.
 */
function closeOverlays(sel = '.menu, .overlay') {
  document.querySelectorAll(sel).forEach((e) => {
    const d = e.dispose
    e.dispose = null
    if (d) d()
    e.remove()
  })
}
/** Key handlers act only for the topmost overlay, and not while a menu is open over it. */
const isTopOverlay = (o) => {
  if (document.querySelector('.menu')) return false
  const all = document.querySelectorAll('.overlay')
  return all[all.length - 1] === o
}
/** Mount an overlay: stacked over an open one, or replacing whatever is open. */
function mountOverlay(overlay, dispose, stack = false) {
  overlay.dispose = dispose
  if (stack) overlay.classList.add('stacked')
  document.body.append(overlay)
  return overlay
}

/** fields: [{ key, label, value, placeholder, type: 'text'|'textarea'|'select'|'check', options: [[value,label]], hint }] */
function dialog({ title, message, fields = [], ok = 'OK', danger = false, cancel = 'Cancel', stack = false }) {
  if (stack) closeOverlays('.menu')
  else closeOverlays()
  return new Promise((resolve) => {
    const inputs = {}
    const form = h('form', { class: 'dialog', onSubmit: (e) => (e.preventDefault(), done(true)) })
    let closed = false
    const done = (okd) => {
      if (closed) return
      closed = true
      overlay.remove()
      document.removeEventListener('keydown', onKey)
      if (!okd) return resolve(null)
      const out = {}
      for (const [k, el] of Object.entries(inputs)) out[k] = el.type === 'checkbox' ? el.checked : el.value
      resolve(out)
    }
    const onKey = (e) => e.key === 'Escape' && isTopOverlay(overlay) && (e.preventDefault(), done(false))
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
    mountOverlay(overlay, () => done(false), stack)
    document.addEventListener('keydown', onKey)
    const first = form.querySelector('input:not([type=checkbox]), textarea, select') || form.querySelector('button[type=submit]')
    first?.focus()
    first?.select?.()
  })
}
/** Asked from inside an open modal, the confirm stacks over it: Cancel returns to the modal intact. */
const confirmBox = (title, message, ok = 'Confirm', danger = false) =>
  dialog({ title, message, ok, danger, stack: !!document.querySelector('.overlay') }).then((r) => r !== null)

/** A right-click opens the row's menu at the pointer; `menu` reads it once. */
let menuPoint = null
/**
 * items: { label, icon, onClick, danger, disabled, hint, items } | '-' | { header }. anchor: an element
 * or { x, y }. An item with `items` is a cascading sub-menu: pointing at it opens the next level
 * beside it (Enter or → from the keyboard), and choosing anything closes every level.
 */
function menu(anchor, items, parent = null) {
  if (!parent) closeOverlays('.menu') // a menu may open from inside a dialog: leave dialogs alone
  const el = h('div', { class: 'menu', role: 'menu' })
  el.closeAll = () => {
    let root = el
    while (root.parentMenu) root = root.parentMenu
    root.closeChild?.()
    root.remove()
    root.cleanup?.()
  }
  if (!parent) el.dispose = () => el.closeAll()
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
          class: [it.danger ? 'danger' : '', it.items ? 'has-sub' : '', it.cls || ''].join(' ').trim(),
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
        h('span', { class: 'grow ellipsis', title: it.label }, it.label),
        it.badge && h('span', { class: 'menu-badge' }, it.badge),
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
  if (!parent) {
    // One outside-click and one key listener for the whole cascade, removed when it closes.
    const off = (e) => {
      if (![...document.querySelectorAll('.menu')].some((m) => m.contains(e.target))) el.closeAll()
    }
    const onKey = (e) => {
      const menus = [...document.querySelectorAll('.menu')]
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        const focusBack = el.anchorEl
        el.closeAll()
        focusBack?.focus?.()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const cur = menus.find((m) => m.contains(document.activeElement)) || menus[menus.length - 1]
        const btns = [...cur.querySelectorAll(':scope > button:not(:disabled)')]
        if (!btns.length) return
        e.preventDefault()
        const i = btns.indexOf(document.activeElement)
        const next = e.key === 'ArrowDown' ? (i + 1) % btns.length : i <= 0 ? btns.length - 1 : i - 1
        btns[next].focus()
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', off, true))
    document.addEventListener('keydown', onKey, true)
    el.anchorEl = anchor instanceof Element ? anchor : null
    el.cleanup = () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', off, true)
      document.removeEventListener('keydown', onKey, true)
      el.cleanup = null
    }
  }
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

/**
 * Open a web link outside Orca. Desktop: the worker hands it to the system default browser (no Orca
 * prompt, no in-app tab). Orca's web client (e.g. on a phone): a new tab of that browser.
 */
const isDesktop = /Electron/i.test(navigator.userAgent)
async function openLink(url) {
  if (!/^https?:\/\//.test(String(url))) return
  if (isDesktop) {
    try {
      const r = await request('shell.open', { url }, 15000)
      if (r?.opened) return
    } catch {}
  }
  const w = window.open(url, '_blank', 'noopener')
  if (!w) {
    await copy(url)
    toast('The link was copied: paste it into your browser.')
  }
}
/** Run an op with a spinner and error toast, then refresh. Returns the result, or undefined on failure. */
async function run(op, args, { success, refresh = true, quiet = false } = {}) {
  setBusy(1)
  setWorking(op, true)
  // fetch, pull and push say what they changed once the view is fresh ("3 new commits", "up to date")
  const before = SYNC_NOTE[op] && state.status ? { oid: state.status.oid, ahead: state.status.ahead || 0, behind: state.status.behind || 0, upstream: state.status.upstream } : null
  let ok = false
  try {
    const out = await call(op, args)
    ok = true
    if (success && !before) toast(success)
    else if (!before && !quiet && typeof out === 'string' && out.trim() && NET_OPS.has(op)) toast(out.trim().split('\n').slice(-3).join('\n'))
    return out ?? ''
  } catch (e) {
    toast(e?.message || String(e), 'error')
    return undefined
  } finally {
    setBusy(-1)
    if (refresh) await refreshAll()
    setWorking(op, false, ok)
    if (ok && before) toast(SYNC_NOTE[op](before, state.status || {}, success, args || {}))
  }
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
const SYNC_NOTE = {
  fetch: (b, a, done) => {
    const n = (a.behind || 0) - b.behind
    if (!a.upstream) return `${done || 'Fetched'} · this branch has no remote branch`
    if (n > 0) return `${done || 'Fetched'} · ${plural(n, 'new commit')} on ${a.upstream} to pull`
    if (a.behind) return `${done || 'Fetched'} · nothing new · ${plural(a.behind, 'commit')} still to pull`
    return `${done || 'Fetched'} · already up to date`
  },
  pull: (b, a, done) => (a.oid && a.oid !== b.oid ? `${done || 'Pulled'} · ${b.behind ? plural(b.behind, 'commit') + ' · ' : ''}now at ${a.oid.slice(0, 7)}` : 'Already up to date · nothing to pull'),
  push: (b, a, done, args) => (args.branch && args.branch !== a.branch ? done || 'Pushed' : b.ahead > 0 || !b.upstream ? `${done || 'Pushed'}${b.ahead ? ' · ' + plural(b.ahead, 'commit') : ''}` : `${done || 'Pushed'} · ${a.upstream || 'the remote'} was already up to date`)
}
/** Which toolbar buttons are busy (spinning) and which just finished (a short tick). */
const working = new Set()
const justDone = new Map()
const OP_BTN = { fetch: 'fetch', pull: 'pull', push: 'push', stashSave: 'stash', refresh: 'refresh', undoLast: 'undo' }
function setWorking(op, on, ok) {
  const key = OP_BTN[op]
  if (!key) return
  if (on) working.add(key)
  else {
    working.delete(key)
    if (ok) {
      justDone.set(key, Date.now())
      setTimeout(() => (justDone.delete(key), paintWorking()), 1300)
    }
  }
  paintWorking()
}
function paintWorking() {
  for (const b of document.querySelectorAll('#toolbar [data-op]')) {
    b.classList.toggle('working', working.has(b.dataset.op))
    b.classList.toggle('done', !working.has(b.dataset.op) && justDone.has(b.dataset.op))
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
  let res = { focused: null, workspaces: state.workspaces }
  // A tab whose file names its project (or that the person pointed elsewhere) has nothing to look up:
  // asking Orca which workspace is focused costs a process launch, so only follow focus otherwise.
  if (!(IN_TAB && (state.pinned || docRepo))) {
    try {
      res = await request('repo.resolve', {})
    } catch (e) {
      toast(e.message, 'error')
    }
    state.workspaces = res.workspaces || []
  }
  // A Git Control tab belongs to one project (its file lives there), so it shows that project.
  // The sidebar panel follows whatever is focused.
  const target = state.pinned || (IN_TAB ? docRepo || res.focused : res.focused)
  if (target !== state.repo) setRepo(target)
  // A Git Control tab file (untitled.gitgraph from the + menu) must never show up as a change.
  if (IN_TAB && target && !ignoredGraphIn.has(target)) {
    ignoredGraphIn.add(target)
    request('repo.ignoreGraphFiles', { repo: target }).catch(() => {})
  }
}

/** Point the view at another repository, showing its last snapshot right away when there is one. */
function setRepo(p) {
  if (p !== state.repo) rowCache?.clear()
  state.repo = p
  state.status = null
  state.refs = null
  resetHistory()
  state.history.open = null
  clearSheets()
  if (p) store.set('lastRepo', p)
  // come back where this repository was left: its tab, scroll position and open commit
  if (p) {
    const m = viewMem.get()
    if (m.tab && TABS.some(([id]) => id === m.tab)) state.tab = m.tab
    state.history.open = m.open || null
    viewRestore = m.scroll || m.open ? { ...m } : null
  }
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

/** What each repository's view looked like when it was left (tab, scroll, open commit). */
let viewRestore = null
const viewMem = {
  key: () => 'view.' + String(state.repo || '').replace(/\\/g, '/').toLowerCase(),
  get() {
    const v = state.repo ? store.get(viewMem.key(), null) : null
    return v && typeof v === 'object' ? v : {}
  },
  set(patch) {
    if (state.repo) store.set(viewMem.key(), { ...viewMem.get(), ...patch })
  }
}
let scrollSaveTimer = null
document.addEventListener(
  'scroll',
  (e) => {
    if (e.target?.id !== 'main' || viewRestore) return
    clearTimeout(scrollSaveTimer)
    scrollSaveTimer = setTimeout(() => viewMem.set({ scroll: Math.round($('#main').scrollTop), scrollTab: state.tab }), 300)
  },
  true
)

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

const sameRepoPath = (a, b) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
/** Workspaces grouped by repository name, repositories A–Z, the main folder first in each. */
function repoGroups(ws) {
  const groups = new Map()
  for (const w of ws) {
    const name = w.repoName || basename(w.path)
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(w)
  }
  for (const list of groups.values()) list.sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0) || String(a.branch).localeCompare(String(b.branch)))
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}
async function repoMenu(anchor) {
  if (!state.workspaces.length) state.workspaces = (await request('repo.resolve', {}).catch(() => null))?.workspaces || []
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
    // grouped by repository (its worktrees under it), so many "dev" or "main" can be told apart
    ...repoGroups(ws).flatMap(([repoName, list]) => [
      { header: repoName },
      ...list.map((w) => ({
        label: w.branch || w.name,
        hint: list.length > 1 && w.main ? 'main folder' : '',
        icon: state.repo && sameRepoPath(state.repo, w.path) ? 'check' : w.kind === 'worktree' ? 'branch' : 'folder',
        onClick: () => pinRepo(w.path)
      }))
    ]),
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
  const side = $('#sideToggle')
  if (side && !side.querySelector('svg')) clear(side).append(icon('menu', 16))

  const tb = clear($('#toolbar'))
  const dis = !state.repo || !st
  // In the full tab the main actions carry a label, like a toolbar; in the narrow panel icons only.
  const lbl = (b, text) => (IN_TAB && b.append(h('span', { class: 'tb-label' }, text)), b)
  // Pull/Push carry how many commits wait (↓ to pull, ↑ to push) and stand out while any do.
  const counted = (b, n, title) => {
    if (n > 0) {
      b.append(h('span', { class: 'tb-count', title }, String(n)))
      b.classList.add('tb-hot')
    }
    return b
  }
  const st0 = st || {}
  const sep = () => IN_TAB && h('span', { class: 'tb-sep' })
  append(tb, [
    lbl(iconBtn('fetch', 'Fetch all (prune)', () => run('fetch', {}, { success: 'Fetched' }), { disabled: dis }), 'Fetch'),
    counted(lbl(iconBtn('pull', 'Pull', (e) => pullMenu(e.currentTarget), { disabled: dis }), 'Pull'), st0.behind, `Pull: ${st0.behind} commit${st0.behind > 1 ? 's' : ''} on ${st0.upstream || 'the remote'}`),
    counted(lbl(iconBtn('push', 'Push', (e) => pushMenu(e.currentTarget), { disabled: dis }), 'Push'), st0.ahead, `Push: ${st0.ahead} commit${st0.ahead > 1 ? 's' : ''} not on ${st0.upstream || 'the remote'} yet`),
    sep(),
    IN_TAB && lbl(iconBtn('stash', 'Stash changes', () => run('stashSave', { untracked: true }, { success: 'Stashed' }), { disabled: dis || !st0.files?.length }), 'Stash'),
    sep(),
    iconBtn('refresh', 'Refresh', () => manualRefresh(), { disabled: !state.repo }),
    iconBtn('undo', 'Undo the last action (commit, reset, merge, rebase…)', undoLast, { disabled: dis }),
    IN_TAB && iconBtn('search', 'Commands (Ctrl+K)', () => commandPalette(), { disabled: dis }),
    iconBtn('settings', 'Git settings (identity, HTTPS, remotes)', () => setTab('settings'), { disabled: !state.repo }),
    !IN_TAB && iconBtn('expand', 'Open Git Control in a full tab', openTab, { disabled: dis })
  ])
  const ops = { 'Fetch all (prune)': 'fetch', Pull: 'pull', Push: 'push', 'Stash changes': 'stash', Refresh: 'refresh', 'Undo the last action (commit, reset, merge, rebase…)': 'undo' }
  for (const b of tb.querySelectorAll('button')) if (ops[b.title]) b.dataset.op = ops[b.title]
  paintWorking()

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
    // ahead/behind live on the Pull and Push buttons; here only what they cannot say
    !st.upstream && st.branch && h('span', { class: 'sync', title: 'This branch has no remote branch yet: Push publishes it' }, 'not published'),
    ciBadge()
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

/** Refresh from the button or F5: the icon spins, then a short tick and what changed. */
async function manualRefresh() {
  if (working.has('refresh')) return
  const before = state.status ? state.status.oid + '|' + (state.status.files?.length || 0) + '|' + (state.status.ahead || 0) + '|' + (state.status.behind || 0) : ''
  setWorking('refresh', true)
  let ok = false
  try {
    await refreshAll(true)
    ok = true
  } finally {
    setWorking('refresh', false, ok)
  }
  const after = state.status ? state.status.oid + '|' + (state.status.files?.length || 0) + '|' + (state.status.ahead || 0) + '|' + (state.status.behind || 0) : ''
  if (ok) toast(after === before ? 'Refreshed · no changes' : 'Refreshed · updated', 'ok', 1800)
}

/** Ask the AI agent (Settings → Plugins → Git Control) to resolve the current conflicts in a terminal. */
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
  ['reviews', 'Review & MR', 'merge'],
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
    const count = id === 'changes' ? st?.files.length : id === 'stash' ? st?.stashCount : id === 'reviews' ? reviewCount() : 0
    nav.append(
      h('button', { class: `tab ${state.tab === id ? 'active' : ''}`, onClick: () => setTab(id) }, label, count ? h('span', { class: 'badge' }, count) : null)
    )
  }
  // on a narrow screen the tabs scroll: keep the chosen one in view
  const on = nav.querySelector('.tab.active')
  if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2)
}
function setTab(id) {
  state.tab = id
  clearSheets()
  if (id !== 'history') state.history.open = null
  store.set('tab', id)
  viewRestore = null
  viewMem.set({ tab: id, scroll: 0, scrollTab: id, open: id === 'history' ? state.history.open : null })
  renderTabs()
  renderView({ force: true })
}

/* =========================================================================
   refresh
   ========================================================================= */
let refreshing = null
let pendingRefresh = null
let pendingFull = false
async function refreshAll(full = false) {
  if (refreshing) {
    // something changed since that refresh started (an operation finished, the repo switched): run once
    // more, as a full refresh if any of the callers queued behind it asked for one
    pendingFull ||= full
    pendingRefresh ||= refreshing.catch(() => {}).then(() => {
      const f = pendingFull
      pendingRefresh = null
      pendingFull = false
      return refreshAll(f)
    })
    return pendingRefresh
  }
  refreshing = (async () => {
    if (full || !state.repo) {
      const before = state.repo
      await resolveRepo()
      if (state.repo !== before && state.status) renderAll() // snapshot of the new repo: show it now
    }
    const repo = state.repo
    if (repo) {
      try {
        const [st, refs] = await Promise.all([call('status', full ? { fresh: true } : {}), call('refs').catch(() => state.refs)])
        if (repo !== state.repo) return // switched meanwhile: the queued refresh handles the new repo
        // any branch, tag or remote moving (our own push, fetch, commit…) redraws the graph's labels
        if (state.status && (st.oid !== state.status.oid || st.refsSig !== state.status.refsSig)) state.history.stale = true
        state.status = st
        state.refs = refs
      } catch (e) {
        if (repo !== state.repo) return
        state.status = null
        state.statusError = e.message
      }
    } else state.status = null
    if (full) state.history.stale = true // reload quietly instead of emptying the list
    if (full) state.ci = null // an explicit Refresh asks CI again too
    await renderAll()
    snap.save()
    loadCi()
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
/** Is this tab on screen? Orca hides other projects' tabs, sometimes only by shrinking them to nothing. */
const isShown = () => document.visibilityState === 'visible' && window.innerWidth > 0 && window.innerHeight > 0
async function pollStatus(force) {
  if (!force && (!isShown() || !state.repo || state.busy || refreshing || document.querySelector('.overlay'))) return
  const repo = state.repo
  try {
    const st = await call('status')
    if (repo !== state.repo) return
    if (JSON.stringify(st) !== JSON.stringify(state.status)) {
      // HEAD moving, or any branch/tag/remote moving (an agent committing, a fetch), redraws the graph
      const headMoved = st.oid !== state.status?.oid || st.refsSig !== state.status?.refsSig
      let refs = state.refs
      if (headMoved) refs = await call('refs').catch(() => state.refs)
      if (repo !== state.repo) return // switched while the refs loaded
      state.status = st
      if (headMoved) {
        state.history.stale = true
        state.refs = refs
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
let renderSeq = 0
// A form the person is typing into (Settings and the like) must not be redrawn under them by a
// background refresh. Typing marks it; switching tabs or saving (which re-renders by tab) clears it.
document.addEventListener('input', (e) => {
  if (e.target.closest?.('#main .form')) e.target.closest('.view')?.setAttribute('data-editing', '1')
})
async function renderView({ force = false } = {}) {
  const main = $('#main')
  if (!force && lastTabRendered === state.tab && main.querySelector('.view[data-editing]')) return
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
  const views = { changes: viewChanges, history: viewHistory, branches: viewBranches, worktrees: viewWorktrees, stash: viewStash, reflog: viewReflog, reviews: viewReviews, settings: viewSettings }
  if (!views[state.tab]) state.tab = 'history'
  // Nothing on screen yet (first open, no snapshot): show placeholder rows instead of a blank area.
  if (!main.querySelector('.view')) {
    clear(main).append(h('div', { class: 'view skeleton-list' }, Array.from({ length: 14 }, (_, i) => h('div', { class: 'skeleton-row', style: { animationDelay: `${i * 40}ms` } }, h('span', { class: 'dot' }), h('span', { class: 'bar', style: { width: `${35 + ((i * 37) % 45)}%` } })))))
    if (loading) main.prepend(loading)
  }
  // Views load asynchronously; when renders overlap, only the newest may land. An older one
  // (built for another tab, scope or repository) would otherwise replace it.
  const seq = ++renderSeq
  let el
  try {
    el = await views[state.tab]()
  } catch (e) {
    el = h('div', { class: 'empty' }, icon('alert', 28), h('div', null, e.message))
  }
  if (seq !== renderSeq) return
  if (lastTabRendered !== state.tab) el.classList.add('view-enter')
  lastTabRendered = state.tab
  clear(main).append(el)
  if (loading) main.prepend(loading)
  if (state.sheets.length) placeSheet(state.sheets[state.sheets.length - 1].el)
  main.scrollTop = keepScroll
  applyViewRestore()
}
/** Once the remembered tab has its content: scroll back and reopen the commit that was open. */
function applyViewRestore() {
  const m = viewRestore
  if (!m) return
  const main = $('#main')
  if (state.tab === 'history' && !state.history.commits.length) return // wait for the list
  viewRestore = null
  if (m.scroll && (m.scrollTab || m.tab) === state.tab) main.scrollTop = m.scroll
  if (state.tab === 'history' && m.open && dockMode() && !state.sheets.length) {
    const c = state.history.commits.find((x) => x.hash === m.open)
    if (c) openDock(c)
  }
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
  const under = state.sheets[state.sheets.length - 1]
  // stacked on another sheet: Back returns to it (Esc too); Close shuts them all
  const back = under && h('button', { class: 'sheet-back', title: 'Back (Esc)', 'aria-label': 'Back', onClick: closeSheet }, icon('left', 14), h('span', { class: 'sheet-back-t' }, under.dock ? 'Details' : 'Back'))
  const closeAll = () => {
    while (state.sheets.length) closeSheet()
  }
  const el = h(
    'div',
    { class: 'sheet' },
    h('div', { class: 'sheet-head' }, back, h('div', { class: 'sheet-title', title }, title), ...actions, actions.length > 0 && h('span', { class: 'sheet-sep' }), iconBtn('x', under ? 'Close all' : 'Close (Esc)', under ? closeAll : closeSheet, { class: 'icon-btn sheet-close' })),
    h('div', { class: 'sheet-body' }, body)
  )
  document.querySelectorAll('.sheet').forEach((x) => x.remove())
  state.sheets.push({ el })
  placeSheet(el)
}
function closeSheet() {
  const gone = state.sheets.pop()
  gone?.el.remove()
  if (gone?.dock) {
    state.history.open = null
    viewMem.set({ open: null })
    document.querySelectorAll('#main .commit-row.selected').forEach((r) => r.classList.remove('selected'))
  }
  const prev = state.sheets[state.sheets.length - 1]
  if (prev) placeSheet(prev.el)
  syncDock()
}
/** Drop every sheet (tab or repository switch). */
function clearSheets() {
  state.sheets = []
  document.querySelectorAll('.sheet-host > .sheet').forEach((x) => x.remove())
  syncDock()
}

/* ---------- split view: on a wide graph the commit details dock to the right ---------- */
const dockMode = () => IN_TAB && state.tab === 'history' && window.innerWidth >= 1000
/** While the details are docked the graph makes room for them instead of sliding under. */
function syncDock() {
  const host = $('#main')?.parentElement
  if (!host) return
  const d = state.sheets.find((s) => s.dock)
  host.classList.toggle('docked', !!d)
  if (d) host.style.setProperty('--dock-w', `${(d.el.isConnected ? d.el.getBoundingClientRect().width : 0) || store.get('sheetWidth', 0) || Math.min(560, host.clientWidth * 0.45)}px`)
}
/** Show a commit in the docked pane (opening it if needed); the list keeps its place. */
async function openDock(c) {
  const H = state.history
  H.open = c.hash
  viewMem.set({ open: c.hash })
  document.querySelectorAll('#main .commit-row.selected').forEach((r) => r.classList.remove('selected'))
  document.querySelector(`#main .commit-row[data-hash="${c.hash}"]`)?.classList.add('selected')
  document.querySelector('#main .commit-inline')?.remove()
  let top = state.sheets[state.sheets.length - 1]
  if (!top?.dock) {
    clearSheets()
    openSheet('', null)
    top = state.sheets[state.sheets.length - 1]
    top.dock = true
    top.el.classList.add('dock')
  }
  const title = top.el.querySelector('.sheet-title')
  title.textContent = `${c.hash.slice(0, 7)} · ${c.subject || ''}`
  title.title = c.subject || ''
  const body = clear(top.el.querySelector('.sheet-body'))
  body.append(h('div', { class: 'inline-skeleton', style: { margin: '12px' } }, h('span'), h('span'), h('span')))
  syncDock()
  try {
    const full = await commitDetails(c.hash)
    if (H.open !== c.hash || !top.el.isConnected) return
    clear(body).append(commitBody(full))
  } catch (e) {
    if (H.open === c.hash && top.el.isConnected) clear(body).append(h('div', { class: 'dim', style: { padding: '12px' } }, e.message))
  }
}
/**
 * A sheet sits beside the scrolling area, not inside it, so it stays whole while the graph scrolls
 * behind it. It starts right under the tabs; its left edge drags to resize (remembered).
 */
function placeSheet(el) {
  const main = $('#main')
  const host = main.parentElement
  host.classList.add('sheet-host')
  el.style.top = `${main.offsetTop}px`
  const w = store.get('sheetWidth', 0)
  if (w && !el.classList.contains('wide-sheet')) el.style.width = `${Math.min(w, host.clientWidth - 120)}px`
  if (!el.querySelector('.sheet-grip')) {
    const grip = h('div', { class: 'sheet-grip', title: 'Drag to resize' })
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      grip.setPointerCapture(e.pointerId)
      const right = host.getBoundingClientRect().right
      const move = (ev) => ((el.style.width = `${Math.max(320, Math.min(right - ev.clientX, host.clientWidth - 120))}px`), syncDock())
      const up = () => {
        grip.removeEventListener('pointermove', move)
        store.set('sheetWidth', el.getBoundingClientRect().width)
      }
      grip.addEventListener('pointermove', move)
      grip.addEventListener('pointerup', up, { once: true })
    })
    el.prepend(grip)
  }
  if (el.parentElement !== host) host.append(el)
  syncDock()
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

/** Parse a unified diff into files → hunks → lines. */
function parseDiff(text) {
  const files = []
  let file = null
  let hunk = null
  let o = 0
  let n = 0
  let patch = -1
  const newFile = () => {
    file = { path: '', oldPath: '', badges: [], hunks: [], add: 0, del: 0, binary: false }
    files.push(file)
    hunk = null
  }
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git')) {
      newFile()
      const m = line.match(/^diff --git a\/(.*) b\/(.*)$/)
      if (m) [file.oldPath, file.path] = [m[1], m[2]]
    } else if (!file && (line.startsWith('--- ') || line.startsWith('@@'))) newFile()
    if (!file) continue
    if (line.startsWith('diff --git') || line.startsWith('index ')) continue
    if (line.startsWith('--- ')) {
      const p = line.slice(4).replace(/^a\//, '')
      if (p !== '/dev/null' && p !== 'NUL') file.oldPath = p
    } else if (line.startsWith('+++ ')) {
      const p = line.slice(4).replace(/^b\//, '')
      if (p !== '/dev/null' && p !== 'NUL') file.path = p
      else file.path = file.oldPath
    } else if (line.startsWith('new file')) file.badges.push('new')
    else if (line.startsWith('deleted file')) file.badges.push('deleted')
    else if (line.startsWith('rename from') || line.startsWith('similarity')) !file.badges.includes('renamed') && file.badges.push('renamed')
    else if (line.startsWith('Binary files')) file.binary = true
    else if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/)
      if (m) [o, n] = [+m[1], +m[3]]
      hunk = { oldStart: o, newStart: n, newCount: m ? +(m[4] ?? 1) : 0, oldCount: m ? +(m[2] ?? 1) : 0, context: m ? m[5] : line, lines: [], patch: ++patch }
      file.hunks.push(hunk)
    } else if (hunk && line.startsWith('+')) {
      hunk.lines.push({ k: 'add', n: n++, t: line.slice(1) })
      file.add++
    } else if (hunk && line.startsWith('-')) {
      hunk.lines.push({ k: 'del', o: o++, t: line.slice(1) })
      file.del++
    } else if (hunk && line.startsWith(' ')) hunk.lines.push({ k: 'ctx', o: o++, n: n++, t: line.slice(1) })
    else if (hunk && line.startsWith('\\')) hunk.lines.at(-1) && (hunk.lines.at(-1).noEol = true)
  }
  return files.filter((f) => f.hunks.length || f.binary || f.badges.length)
}

/** Text with the changed middle part marked, against its paired line (common prefix/suffix kept plain). */
function markChange(text, other) {
  if (other == null || text === other) return [text]
  let p = 0
  while (p < text.length && p < other.length && text[p] === other[p]) p++
  let q = 0
  while (q < text.length - p && q < other.length - p && text[text.length - 1 - q] === other[other.length - 1 - q]) q++
  const mid = text.slice(p, text.length - q)
  // a near-total rewrite reads better without marks
  if (!mid || mid.length > text.length * 0.85) return [text]
  return [text.slice(0, p), h('mark', null, mid), text.slice(text.length - q)]
}

/** Pair runs of removed and added lines, so each changed line can be shown against its counterpart. */
function pairLines(lines) {
  const out = []
  for (let i = 0; i < lines.length; ) {
    if (lines[i].k !== 'del') {
      out.push({ left: lines[i].k === 'ctx' ? lines[i] : null, right: lines[i] })
      i++
      continue
    }
    const dels = []
    while (i < lines.length && lines[i].k === 'del') dels.push(lines[i++])
    const adds = []
    while (i < lines.length && lines[i].k === 'add') adds.push(lines[i++])
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) out.push({ left: dels[k] || null, right: adds[k] || null, changed: true })
  }
  return out
}

/**
 * A readable diff: per file a header (+added −removed), hunks labelled by their lines, unified or
 * side by side (remembered), changed words marked, optional wrapping.
 * hunkActions: [{ label, icon, run(patch) }] on every hunk; onLine({ path, side, line, text }) makes lines clickable.
 */
function renderDiff(text, hunkActions, { onLine } = {}) {
  if (!text.trim()) return h('div', { class: 'empty' }, 'No changes to show (binary or identical file)')
  const files = parseDiff(text)
  const patches = hunkActions?.length ? splitHunks(text) : []
  const root = h('div', { class: 'dv' })
  const body = h('div')
  let mode = store.get('diffMode', 'unified')
  let wrapOn = store.get('diffWrap', false)
  const seg = h('div', { class: 'segmented' })
  const wrapBtn = h('button', { class: 'btn sm dv-wrap', title: 'Wrap long lines' }, icon('layers', 12), 'Wrap')
  const drawBar = () => {
    clear(seg).append(
      h('button', { class: mode === 'unified' ? 'on' : '', onClick: () => ((mode = 'unified'), store.set('diffMode', mode), draw()) }, 'Unified'),
      h('button', { class: mode === 'split' ? 'on' : '', onClick: () => ((mode = 'split'), store.set('diffMode', mode), draw()) }, 'Split')
    )
    wrapBtn.classList.toggle('on', wrapOn)
  }
  wrapBtn.addEventListener('click', () => ((wrapOn = !wrapOn), store.set('diffWrap', wrapOn), draw()))
  const total = files.reduce((t, f) => [t[0] + f.add, t[1] + f.del], [0, 0])
  root.append(
    h(
      'div',
      { class: 'dv-bar' },
      seg,
      wrapBtn,
      h('span', { class: 'grow' }),
      files.length > 1 && h('span', { class: 'dim' }, `${files.length} files`),
      files.length === 1 && !files[0].badges.includes('deleted') && h('button', { class: 'btn sm', title: `Open ${files[0].path} in the editor`, onClick: () => openRepoFile(files[0].path) }, icon('file', 12), 'Open file'),
      h('span', { class: 'dv-count' }, h('span', { class: 'a' }, `+${total[0]}`), h('span', { class: 'd' }, `−${total[1]}`))
    ),
    body
  )
  const cell = (ln, side, f) => {
    if (!ln) return [h('span', { class: 'n' }), h('span', { class: 'c empty-cell' })]
    return [h('span', { class: 'n' }, side === 'old' ? ln.o : ln.n), h('span', { class: 'c' }, ...(ln.mark || [ln.t]))]
  }
  const clickable = (el, f, ln, side) => {
    if (!onLine || !ln) return el
    el.classList.add('commentable')
    el.title = 'Click to comment on this line'
    el.addEventListener('click', () => onLine({ path: f.path, side, line: side === 'old' ? ln.o : ln.n, text: ln.t }))
    return el
  }
  // A huge file (a lockfile, generated code) shows its first lines; the rest on request.
  const MAX_LINES = 3000
  const expanded = new Set()
  function draw() {
    drawBar()
    root.classList.toggle('dv-wrapped', wrapOn)
    root.classList.toggle('dv-split', mode === 'split')
    const frag = document.createDocumentFragment()
    for (const f of files) {
      const showHead = files.length > 1 || !!onLine || f.badges.length > 0 // one plain file: the panel title names it
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : ''
      if (showHead) frag.append(
        h(
          'div',
          { class: 'dv-file' },
          icon('file', 13),
          h('span', { class: 'dv-path link', title: `Open ${f.path} in the editor`, onClick: () => openRepoFile(f.path) }, dir && h('span', { class: 'dim' }, dir), h('strong', null, f.path.slice(dir.length))),
          ...f.badges.map((b) => h('span', { class: `pill dv-${b}` }, b)),
          f.badges.includes('renamed') && f.oldPath !== f.path && h('span', { class: 'dim mono' }, `from ${f.oldPath}`),
          h('span', { class: 'grow' }),
          h('span', { class: 'dv-count' }, h('span', { class: 'a' }, `+${f.add}`), h('span', { class: 'd' }, `−${f.del}`))
        )
      )
      if (f.binary) frag.append(h('div', { class: 'dv-note' }, 'Binary file: no text to compare'))
      const lineCount = f.hunks.reduce((t, hk) => t + hk.lines.length, 0)
      let budget = expanded.has(f) ? Infinity : MAX_LINES
      for (const hk of f.hunks) {
        if (budget <= 0) break
        const patch = patches[hk.patch]
        const last = hk.newStart + Math.max(0, hk.newCount - 1)
        frag.append(
          h(
            'div',
            { class: 'dv-hunk' },
            h('span', { class: 'dv-range' }, hk.newCount ? `Lines ${hk.newStart}${last > hk.newStart ? `–${last}` : ''}` : `Removed at line ${hk.oldStart}`),
            hk.context && h('span', { class: 'dv-ctx mono' }, hk.context),
            h('span', { class: 'grow' }),
            patch && hunkActions.map((a) => h('button', { class: `hunk-btn ${a.danger ? 'danger' : ''}`, title: `${a.label} this hunk`, onClick: () => a.run(patch) }, icon(a.icon, 11), a.label))
          )
        )
        const lines = hk.lines.length > budget ? hk.lines.slice(0, budget) : hk.lines
        budget -= lines.length
        const pairs = pairLines(lines)
        for (const pr of pairs) {
          if (pr.changed && pr.left && pr.right) {
            pr.left.mark = markChange(pr.left.t, pr.right.t)
            pr.right.mark = markChange(pr.right.t, pr.left.t)
          }
        }
        if (mode === 'split') {
          for (const pr of pairs) {
            const lk = pr.left ? pr.left.k : 'none'
            const rk = pr.right ? (pr.right.k === 'ctx' && pr.left ? 'ctx' : pr.right.k) : 'none'
            frag.append(
              h(
                'div',
                { class: 'ds' },
                clickable(h('div', { class: `ds-side ${lk}` }, ...cell(pr.left, 'old', f)), f, pr.left, 'old'),
                clickable(h('div', { class: `ds-side ${rk}` }, ...cell(pr.right, 'new', f)), f, pr.right, 'new')
              )
            )
          }
        } else {
          for (const ln of lines) {
            const side = ln.k === 'del' ? 'old' : 'new'
            frag.append(
              clickable(
                h('div', { class: `l ${ln.k}` }, h('span', { class: 'n' }, ln.k === 'add' ? '' : ln.o), h('span', { class: 'n' }, ln.k === 'del' ? '' : ln.n), h('span', { class: 'sg' }, ln.k === 'add' ? '+' : ln.k === 'del' ? '−' : ''), h('span', { class: 'c' }, ...(ln.mark || [ln.t]))),
                f,
                ln,
                side
              )
            )
          }
        }
      }
      if (!expanded.has(f) && lineCount > MAX_LINES)
        frag.append(
          h(
            'div',
            { class: 'dv-note dv-more' },
            `Showing the first ${MAX_LINES} of ${lineCount} lines. `,
            h('button', { class: 'btn sm', onClick: () => (expanded.add(f), draw()) }, `Show all ${lineCount} lines`)
          )
        )
    }
    clear(body).append(frag)
  }
  draw()
  return root
}

async function openRepoFile(file) {
  try {
    await request('file.open', { repo: state.repo, file }, 20000)
  } catch (e) {
    toast(e.message, 'error')
  }
}

async function showDiff(title, loader, actions = [], hunkActions) {
  // In the Commit tab the diff opens beside the file list, not over it.
  const pane = IN_TAB && state.tab === 'changes' ? document.querySelector('#main .diff-pane') : null
  let sheet
  if (pane) {
    clear(pane).append(
      h('div', { class: 'sheet-head' }, h('div', { class: 'sheet-title', title }, title), ...actions),
      h('div', { class: 'sheet-body' }, h('div', { class: 'inline-skeleton' }, h('span'), h('span'), h('span')))
    )
    sheet = { el: pane, inPane: true }
  } else {
    openSheet(title, h('div', { class: 'empty' }, 'Loading…'), actions)
    sheet = state.sheets[state.sheets.length - 1]
  }
  const load = async () => {
    try {
      const text = await loader()
      const body = sheet.el.querySelector('.sheet-body')
      if (!text.trim() && hunkActions) {
        if (sheet.inPane) clear(sheet.el).append(h('div', { class: 'empty' }, 'No changes left in this file'))
        else if (state.sheets.includes(sheet)) closeSheet()
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
    { class: 'item', title: f.orig ? `${f.orig} → ${f.path}` : f.path, 'data-path': f.path, 'data-staged': staged ? '1' : '0', onClick: (e) => (markSelected(e.currentTarget), onClick && onClick(e)) },
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
      // Nothing staged: stage everything first, the usual "commit all".
      if (!(await confirmBox('Nothing staged', 'Stage all changes and commit them?', 'Stage all & commit'))) return
      await call('stageAll').catch((e) => toast(e.message, 'error'))
    }
    const out = await run('commit', args, { success: extra.push ? undefined : state.amend ? 'Amended' : 'Committed' })
    if (extra.push && out !== undefined) out?.pushError ? toast(`Committed, but the push failed: ${out.pushError}`, 'error') : toast('Committed and pushed')
    if (out !== undefined) {
      state.commitDraft = ''
      state.amend = false
      resetHistory()
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
    root.append(h('div', { class: 'empty clean-note' }, icon('check', 28), h('div', null, 'Working tree clean'), h('div', { class: 'dim', style: { fontSize: '11.5px', marginTop: '4px' } }, 'Nothing to commit. Edits you make will show up here.')))
    return root
  }

  if (conflicts.length) {
    root.append(h('div', { class: 'section-head' }, 'Conflicts', h('span', { class: 'count' }, conflicts.length)))
    for (const f of conflicts)
      root.append(
        fileRow(f, {
          onClick: () => resolveConflict(f.path),
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
  if (!IN_TAB) return root
  // Full tab: the file list on the left, the selected file's diff on the right (↑/↓ to move).
  root.classList.add('changes-list')
  const pane = h('div', { class: 'diff-pane' }, h('div', { class: 'empty' }, icon('file', 26), h('div', null, 'Select a file to see its changes'), h('div', { class: 'dim' }, '↑ ↓ move between files')))
  const split = h('div', { class: 'view changes-split' }, root, pane)
  root.classList.remove('view')
  requestAnimationFrame(() => {
    const sel = state.changesSel
    const row = sel && [...root.querySelectorAll('.item[data-path]')].find((r) => r.dataset.path === sel.path && r.dataset.staged === sel.staged)
    if (row) row.click()
  })
  return split
}

function markSelected(row) {
  row.parentElement?.closest('.view, .changes-list')?.querySelectorAll('.item.sel').forEach((r) => r.classList.remove('sel'))
  row.classList.add('sel')
  if (row.dataset.path) state.changesSel = { path: row.dataset.path, staged: row.dataset.staged }
}
document.addEventListener('keydown', (e) => {
  if (state.tab !== 'changes' || !IN_TAB || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
  if (e.target.closest?.('input, textarea, select, .overlay, .menu')) return
  const rows = [...document.querySelectorAll('#main .changes-list .item[data-path]')]
  if (!rows.length) return
  e.preventDefault()
  const i = rows.findIndex((r) => r.classList.contains('sel'))
  const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))] || rows[0]
  next.click()
  next.scrollIntoView({ block: 'nearest' })
})

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

// Row height: compact (28) or comfortable (34) in the tab, chosen from the graph bar.
let ROW_H = IN_TAB ? (store.get('density', 'compact') === 'comfortable' ? 34 : 28) : 40
document.documentElement.style.setProperty('--row-h', `${ROW_H}px`)
function setDensity(v) {
  store.set('density', v)
  ROW_H = v === 'comfortable' ? 34 : 28
  document.documentElement.style.setProperty('--row-h', `${ROW_H}px`)
  rowCache.clear()
  renderView({ force: true })
}
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
  const pill = (cls, iconName, text, title) => lanePill(h('span', { class: `ref ${cls}`, title }, icon(iconName, 10), h('span', { class: 'ref-t' }, text)))
  const isRemote = (r) => r.includes('/') && !r.startsWith('tag: ') && !state.localNames?.has(r)
  const remoteName = (r) => r.slice(0, r.indexOf('/'))
  const branchOf = (r) => r.slice(r.indexOf('/') + 1)

  // What is checked out at this commit: a branch ("HEAD -> x") or the commit itself (detached "HEAD").
  const headBranch = refs.find((r) => r.startsWith('HEAD -> '))?.slice(8) || null
  const detached = refs.includes('HEAD')
  const names = refs.filter((r) => r !== 'HEAD' && !r.startsWith('HEAD -> '))
  const locals = [headBranch, ...names.filter((r) => !r.startsWith('tag: ') && !isRemote(r) && r !== 'stash' && !r.startsWith('refs/stash'))].filter(Boolean)

  // A local branch and the same branch on a remote, at the same commit, are one label (they are in
  // sync): "main │ ☁ origin". Out of sync they stay two labels on two commits. Worked out first,
  // because git may list the remote before the local branch.
  const syncedOf = new Map()
  const merged = new Set()
  for (const l of locals) {
    const rs = names.filter((r) => isRemote(r) && branchOf(r) === l)
    if (rs.length) {
      syncedOf.set(l, rs)
      rs.forEach((r) => merged.add(r))
    }
  }
  const withRemotes = (el, local) => {
    const rs = syncedOf.get(local)
    if (!rs) return el
    el.classList.add('synced')
    el.title += `\nIn sync with ${rs.join(', ')}`
    el.append(h('span', { class: 'ref-remote' }, icon('cloud', 10), h('span', null, rs.map(remoteName).join(', '))))
    return el
  }

  if (headBranch) out.push(withRemotes(pill('head current', 'current', headBranch, `${headBranch} (checked out)`), headBranch))
  let marked = false
  for (const r of names) {
    if (merged.has(r)) continue
    if (r.startsWith('tag: ')) out.push(pill('tag', 'tag', r.slice(5), `Tag ${r.slice(5)}`))
    else if (r.startsWith('refs/stash') || r === 'stash') out.push(pill('', 'stash', 'stash', 'Stash'))
    else if (isRemote(r)) {
      if (detached && !marked) {
        // detached on a remote branch: that label is what is checked out
        marked = true
        out.push(pill('remote head current', 'current', r, `${r} (checked out, detached HEAD)`))
      } else out.push(pill('remote', 'globe', r, `Remote branch ${r}, not on this computer`))
    } else if (detached && !marked) {
      marked = true
      out.push(withRemotes(pill('head current', 'current', r, `${r} (checked out, detached HEAD)`), r))
    } else out.push(withRemotes(pill('', 'branch', r, `Branch ${r}`), r))
  }
  if (detached && !marked) out.push(pill('head current', 'current', 'HEAD', 'Detached HEAD (checked out)'))
  return out
}

/**
 * Every reset of the list (repo, Branch/All, search, mode, an operation that rewrote history) bumps
 * the generation, so a page or quiet reload that was in flight for the old list is dropped.
 */
let historyGen = 0
function resetHistory() {
  historyGen++
  state.history.commits = []
  state.history.done = false
  loadingMorePromise = null
}
let loadingMorePromise = null
let searchBox = null
/** Text with every case-insensitive occurrence of `q` wrapped in <mark>, as DOM nodes. */
// The same rule as the worker's search: under 3 characters, whole words only.
const searchRe = (q) => {
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return q.length < 3 ? new RegExp(`(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])`, 'giu') : new RegExp(esc, 'giu')
}
const hasHit = (text, q) => !!q && searchRe(q).test(String(text ?? ''))
function marked(text, q) {
  text = String(text ?? '')
  if (!q) return text
  const out = []
  let i = 0
  for (const m of text.matchAll(searchRe(q))) {
    if (m.index > i) out.push(text.slice(i, m.index))
    out.push(h('mark', { class: 'hit' }, m[0]))
    i = m.index + m[0].length
  }
  if (i < text.length) out.push(text.slice(i))
  return out
}

async function loadHistory(more = false) {
  const H = state.history
  // One "load more" at a time: the scroll sentinel, the button and goToHead share it.
  if (more && loadingMorePromise) return loadingMorePromise
  const repo = state.repo
  const gen = historyGen
  const page = 300
  const p = (async () => {
    const commits = await call('log', { all: H.all, limit: page, skip: more ? H.commits.length : 0, search: H.search, mode: H.mode || 'message' })
    if (repo !== state.repo || gen !== historyGen) return
    if (more) {
      const seen = new Set(H.commits.map((c) => c.hash)) // safety net against an overlapping page
      H.commits = H.commits.concat(commits.filter((c) => !seen.has(c.hash)))
    } else H.commits = commits
    H.done = commits.length < page
  })()
  if (!more) return p
  loadingMorePromise = p
  try {
    return await p
  } finally {
    if (loadingMorePromise === p) loadingMorePromise = null
  }
}

/** Built graph rows by commit, reused across renders while their look is unchanged. */
const rowCache = new Map()
// The "3m ago" text and the set of local branch names (which pills show as local) are part of the look.
const rowSignature = (c, row, width, open, names) =>
  [c.refs.join(','), open ? 1 : 0, width, names, ago(c.time), row ? row.color + ':' + row.col + ':' + JSON.stringify(row.edges) : '-'].join('|')

/** Reload the first page in the background; redraw only when something changed. */
let reloadingHistory = false
let reloadAgain = false
async function reloadHistoryQuietly() {
  const H = state.history
  // A reload already running may have read the repository before the latest change: run once more after it.
  if (reloadingHistory) return void (reloadAgain = true)
  reloadingHistory = true
  const repo = state.repo
  const gen = historyGen
  try {
    // as many commits as are on screen (at least a page), so a reload never shortens the list
    const limit = Math.min(1000, Math.max(300, H.commits.length))
    const commits = await call('log', { all: H.all, limit, skip: 0, search: H.search, mode: H.mode || 'message' })
    if (repo !== state.repo || gen !== historyGen) return
    if (loadingMorePromise) await loadingMorePromise.catch(() => {}) // let a page in flight land first
    if (repo !== state.repo || gen !== historyGen) return
    const sig = (list) => list.map((c) => c.hash + c.refs.join()).join()
    if (sig(commits) !== sig(H.commits.slice(0, commits.length)) || commits.length !== Math.min(H.commits.length, limit)) {
      H.commits = commits
      H.done = commits.length < limit
      if (state.tab === 'history') renderView()
    }
    snap.save()
  } catch {
  } finally {
    reloadingHistory = false
    if (reloadAgain) {
      reloadAgain = false
      reloadHistoryQuietly()
    }
  }
}

/** Scroll the graph to the checked-out commit, loading older pages until it is found. */
async function goToHead() {
  const H = state.history
  const oid = state.status?.oid
  if (!oid) return
  if (state.tab !== 'history') setTab('history')
  const gen = historyGen
  let row = document.querySelector(`.commit-row[data-hash="${oid}"]`)
  for (let i = 0; !row && !H.done && i < 15; i++) {
    await loadHistory(true)
    if (gen !== historyGen || state.tab !== 'history') return // the list was reset or left meanwhile
    await renderView()
    row = document.querySelector(`.commit-row[data-hash="${oid}"]`)
  }
  if (!row) return toast('The checked-out commit is not in the loaded history (try All branches).', 'error')
  row.scrollIntoView({ block: 'center', behavior: 'smooth' })
  row.classList.add('flash')
  setTimeout(() => row.classList.remove('flash'), 1400)
}

/** Loads the next page when it scrolls into view (a button too, for keyboards). */
let loadingMore = false
let moreObserver = null
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
  moreObserver?.disconnect()
  const io = (moreObserver = new IntersectionObserver((ents) => ents.some((e) => e.isIntersecting) && (io.disconnect(), more()), { root: $('#main'), rootMargin: '1500px' }))
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
  H.mode = 'all'
  let typing = null
  const runSearch = (v) => {
    clearTimeout(typing)
    if (v === H.search) return
    H.search = v
    resetHistory()
    renderView()
  }
  // One search box for the life of the panel: results redraw the view around it, never the box
  // itself, so nothing typed meanwhile is lost and the caret stays put.
  const search = (searchBox ||= h('input', {
    type: 'text',
    class: 'graph-search',
    placeholder: 'Search message, author, file, hash, branch or tag…',
    value: H.search,
    onInput: (e) => {
      clearTimeout(typing)
      const v = e.target.value.trim()
      typing = setTimeout(() => runSearch(v), v ? 300 : 0)
    },
    onKeydown: (e) => {
      if (e.key === 'Enter') runSearch(e.target.value.trim())
      else if (e.key === 'Escape' && e.target.value) {
        e.preventDefault()
        e.stopPropagation()
        e.target.value = ''
        runSearch('')
      }
    }
  }))
  if (document.activeElement !== search) search.value = H.search
  const seg = h(
    'div',
    { class: 'segmented' },
    h('button', { class: H.all ? '' : 'on', onClick: () => setAll(false) }, 'Branch'),
    h('button', { class: H.all ? 'on' : '', onClick: () => setAll(true) }, 'All')
  )
  function setAll(v) {
    H.all = v
    store.set('historyAllV2', v)
    resetHistory()
    renderView()
  }
  const headBtn = h('button', { class: 'btn sm', title: 'Scroll to the checked-out commit', onClick: () => goToHead() }, icon('current', 12), 'HEAD')
  const dense = IN_TAB && iconBtn('rows', ROW_H > 28 ? 'Compact rows' : 'Comfortable rows', () => setDensity(ROW_H > 28 ? 'compact' : 'comfortable'), { class: `icon-btn density-btn ${ROW_H > 28 ? 'on' : ''}` })
  root.append(h('div', { class: 'history-bar' }, search, seg, headBtn, dense))
  if (IN_TAB) root.append(h('div', { class: 'date-float-wrap' }, h('div', { class: 'date-float', id: 'dateFloat' })))

  if (!H.commits.length) {
    root.append(
      h(
        'div',
        { class: 'empty' },
        icon('history', 28),
        h('div', null, H.search ? `Nothing matches “${H.search}”` : 'No commits yet'),
        H.search && h('div', { class: 'dim' }, 'Searched messages, authors, changed files, hashes, branches and tags' + (H.all ? '.' : ' on this branch.')),
        H.search &&
          h(
            'div',
            { class: 'empty-actions' },
            !H.all && h('button', { class: 'btn sm primary', onClick: () => setAll(true) }, 'Search all branches'),
            h('button', { class: 'btn sm', onClick: () => ((search.value = ''), runSearch('')) }, 'Clear search')
          ),
        !H.search && h('div', { class: 'empty-actions' }, h('button', { class: 'btn sm primary', onClick: () => setTab('changes') }, icon('commit', 12), 'Make the first commit'))
      )
    )
    return root
  }
  // The graph is only meaningful for an unfiltered log.
  const rows = H.search ? null : layoutGraph(H.commits)
  if (rows) rows.forEach((r, i) => laneOfCommit.set(H.commits[i].hash, r.color))
  const width = rows ? graphWidth(rows) + 4 : 8
  const list = h('div')
  const frag = document.createDocumentFragment()
  const names = state.localNames ? [...state.localNames].sort().join(' ') : '' // branch names cannot hold spaces
  H.commits.forEach((c, i) => {
    // Rows are rebuilt only when what they show changed (lines, labels, selection): switching tabs,
    // refreshing or loading more reuses the rest instead of rebuilding hundreds of SVG rows.
    const sig = rowSignature(c, rows && rows[i], width, H.open === c.hash, names) + '|' + (H.search || '')
    const cached = rowCache.get(c.hash)
    let row = cached && cached.sig === sig ? cached.el : null
    if (!row) {
      row = buildRow(c, i)
      rowCache.set(c.hash, { sig, el: row })
    }
    row.classList.toggle('selected', H.open === c.hash) // toggleInline changes it in place
    frag.append(row)
    if (H.open === c.hash && !dockMode()) frag.append(inlineDetail(c))
  })
  if (rowCache.size > 4000) rowCache.clear()
  list.append(frag)
  // a hit only in its files, hash or a branch name: say where, since nothing in the row is marked
  function matchNote(c) {
    if (!H.search || !c.match?.length) return null
    if (hasHit(c.subject, H.search) || hasHit(c.author, H.search)) return null // already marked in the row
    const why = c.match.includes('body')
      ? 'in description'
      : c.match.includes('file')
        ? `file: ${c.matchFile}`
        : c.match.includes('ref')
          ? `${/^tag: |^v?\d/.test(c.matchRef || '') ? 'tag' : 'branch'}: ${c.matchRef}`
          : c.match.includes('hash')
            ? 'commit hash'
            : c.match.includes('author')
              ? 'author email'
              : ''
    return why ? h('span', { class: 'match-note', title: why }, why) : null
  }
  function buildRow(c, i) {
    const row = h(
        'div',
        { class: `commit-row ${H.open === c.hash ? 'selected' : ''}`, 'data-hash': c.hash, 'data-time': c.time, onClick: () => (dockMode() ? openDock(c) : toggleInline(c, row)), onContextmenu: (e) => commitContextMenu(e, c) },
        rows ? graphSvg(rows[i], width, c.parents.length > 1, c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD -> '))) : h('span', { style: { width: '8px' } }),
        IN_TAB
          ? [
              h('div', { class: 'commit-text' }, h('div', { class: 'commit-subject' }, refPills(c.refs, rows && rows[i] ? rows[i].color : null), h('span', { class: 's', title: c.subject }, marked(c.subject, H.search)), matchNote(c))),
              h('div', { class: 'col-author ellipsis', title: c.email }, marked(c.author, H.search)),
              h('div', { class: 'col-date', title: fullDate(c.time) }, new Date(c.time * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })),
              h('div', { class: 'col-hash mono' }, H.search && c.hash.toLowerCase().startsWith(H.search.toLowerCase()) ? marked(c.hash.slice(0, Math.max(7, H.search.length)), H.search) : c.hash.slice(0, 7)),
              rowActions(c)
            ]
          : h(
              'div',
              { class: 'commit-text' },
              h('div', { class: 'commit-subject' }, refPills(c.refs, rows && rows[i] ? rows[i].color : null), h('span', { class: 's', title: c.subject }, marked(c.subject, H.search)), matchNote(c)),
              h('div', { class: 'commit-meta', title: fullDate(c.time) }, marked(c.author, H.search), ` · ${ago(c.time)} · `, h('span', { class: 'mono' }, c.hash.slice(0, 7)))
            )
      )
    return row
  }
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
    viewMem.set({ open: null })
    return
  }
  H.open = c.hash
  viewMem.set({ open: c.hash })
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
  // inline: the outer box takes the row's height, the inner one scrolls inside it
  const outer = h('div', { class: inline ? 'inline-files' : '' })
  const filesBox = inline ? h('div', { class: 'if-scroll' }) : outer
  if (inline) outer.append(filesBox)
  body.append(outer)
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
  // Everyday actions on top; everything else in one "More" submenu, so the menu reads at a glance.
  const branchItems = [
    ...local.map((b) => ({
      label: `Branch ${b}`,
      icon: 'branch',
      items: [
        b !== cur && { label: 'Checkout', icon: 'right', onClick: () => checkout(b) },
        { label: 'Push', icon: 'push', onClick: () => run('push', b === cur ? {} : { branch: b }, { success: `Pushed ${b}` }) },
        { label: 'Rename…', icon: 'edit', onClick: () => renameBranch(b) },
        { label: 'Show only this branch', icon: 'history', onClick: () => showBranchLog(b) },
        b !== cur && cur && { label: `Merge request → ${b}…`, icon: 'pr', cls: 'mr-item', badge: 'MR', onClick: () => mergeRequestDialog(b) },
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
    }))
  ]
  menu(anchor, [
    { header: `${short} · ${(c.subject || c.message || '').split('\n')[0].slice(0, 48)}` },
    {
      label: 'Checkout',
      icon: 'right',
      items: [
        ...local.filter((b) => b !== cur).map((b) => ({ label: `Branch ${b}`, icon: 'branch', onClick: () => checkout(b) })),
        ...remote.map((b) => ({ label: state.localNames?.has(b.replace(/^[^/]+\//, '')) ? `Remote ${b}…` : `Remote ${b}`, icon: 'globe', onClick: () => checkout(b, { track: true }) })),
        { label: 'This commit (detached HEAD)', icon: 'commit', onClick: () => checkoutCommit(c.hash) }
      ]
    },
    ...local.map((b) => ({ label: b === cur && state.status?.ahead ? `Push ${b} (${state.status.ahead})` : `Push ${b}`, icon: 'push', onClick: () => run('push', b === cur ? {} : { branch: b }, { success: `Pushed ${b}` }) })),
    !local.length && cur && cur !== 'HEAD' && state.status?.ahead > 0 && { label: `Push ${cur} up to here`, icon: 'push', hint: short, onClick: () => run('push', { branch: cur, hash: c.hash }, { success: `Pushed ${cur} up to ${short}` }) },
    { label: 'Create branch here…', icon: 'plus', onClick: () => newBranch(c.hash) },
    { label: 'Create tag here…', icon: 'tag', onClick: () => newTag(c.hash) },
    { label: 'New worktree here…', icon: 'worktree', onClick: () => addWorktree({ base: c.hash }) },
    '-',
    !isHead && { label: `Merge into ${cur}…`, icon: 'merge', onClick: () => mergeRef(local[0] || c.hash) },
    mrItem(local, remote, cur),
    !isHead && { label: `Rebase ${cur} onto this…`, icon: 'merge', onClick: () => rebaseOnto(local[0] || c.hash) },
    !isHead && { label: 'Cherry-pick', icon: 'commit', onClick: () => run('cherryPick', { hash: c.hash, mainline: isMerge }, { success: 'Cherry-picked' }) },
    { label: 'Revert…', icon: 'undo', onClick: async () => (await confirmBox(`Revert ${short}?`, 'A new commit that undoes it will be created.', 'Revert')) && run('revert', { hash: c.hash, mainline: isMerge }, { success: 'Reverted' }) },
    !isHead && {
      label: `Reset ${cur} to here`,
      icon: 'undo',
      items: [
        { label: 'Soft: keep changes staged', icon: 'undo', onClick: () => resetTo(c.hash, 'soft') },
        { label: 'Mixed: keep changes unstaged', icon: 'undo', onClick: () => resetTo(c.hash, 'mixed') },
        { label: 'Keep: keep uncommitted changes', icon: 'undo', onClick: () => resetTo(c.hash, 'keep') },
        '-',
        { label: 'Hard: discard all changes…', icon: 'alert', danger: true, onClick: () => resetTo(c.hash, 'hard') }
      ]
    },
    branchItems.length && '-',
    branchItems.length === 1 ? branchItems[0] : branchItems.length && { label: 'Branches and tags here', icon: 'branch', items: branchItems },
    '-',
    { label: 'Pipeline', icon: 'refresh', onClick: () => openPipelines({ sha: c.hash }) },
    { label: 'Compare with HEAD', icon: 'compare', onClick: () => compareSheet(c.hash, 'HEAD') },
    isMerge && { label: 'Compare with first parent', icon: 'compare', onClick: () => compareSheet(c.parents[0], c.hash) },
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
    },
    {
      label: 'More',
      icon: 'more',
      items: [
        !isHead && { label: 'Interactive rebase from here…', icon: 'layers', onClick: () => interactiveRebase(c.hash) },
        isHead && { label: 'Reword message…', icon: 'edit', onClick: () => rewordLast(c) },
        !isHead && { label: 'Squash later commits into one…', icon: 'layers', onClick: () => squashSince(c.hash) },
        { label: 'Create fixup! commit of staged changes', icon: 'commit', disabled: !staged, onClick: () => run('fixupCommit', { hash: c.hash, kind: 'fixup' }, { success: `fixup! commit for ${short}` }) },
        !isHead && { label: 'Cherry-pick without committing', icon: 'commit', onClick: () => run('cherryPick', { hash: c.hash, mainline: isMerge, noCommit: true }, { success: 'Changes applied; review and commit' }) },
        { label: 'Revert without committing', icon: 'undo', onClick: () => run('revert', { hash: c.hash, mainline: isMerge, noCommit: true }, { success: 'Undo applied; review and commit' }) },
        '-',
        { label: 'Browse files at this commit', icon: 'folder', onClick: () => treeSheet(c.hash) },
        { label: 'Save as patch…', icon: 'download', onClick: () => savePatch(c) },
        bis
          ? { label: 'Bisect', icon: 'search', items: [
              { label: 'Mark good', icon: 'check', onClick: () => run('bisect', { action: 'good', rev: c.hash }, { success: 'Marked good' }) },
              { label: 'Mark bad', icon: 'x', onClick: () => run('bisect', { action: 'bad', rev: c.hash }, { success: 'Marked bad' }) },
              { label: 'Skip', icon: 'right', onClick: () => run('bisect', { action: 'skip', rev: c.hash }, { success: 'Skipped' }) },
              { label: 'Stop bisect', icon: 'x', onClick: () => run('bisect', { action: 'reset' }, { success: 'Bisect stopped' }) }
            ] }
          : { label: 'Start bisect (this is good, HEAD is bad)', icon: 'search', onClick: () => startBisect(c.hash) }
      ]
    }
  ])
}
async function resetTo(hash, mode) {
  const msg = mode === 'hard' ? 'All uncommitted changes will be lost. This cannot be undone.' : `Your branch will point at ${hash.slice(0, 7)}.`
  if (!(await confirmBox(`${mode[0].toUpperCase() + mode.slice(1)} reset?`, msg, 'Reset', mode === 'hard'))) return
  closeSheet()
  resetHistory()
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
 * Check out origin/x when a local x already exists. Same commit: just switch. Only behind: switch
 * and fast-forward, so you land on the remote's commit. Diverged or ahead: let the person choose.
 */
async function checkoutRemoteOverLocal(remote, local) {
  let ab
  try {
    ab = await call('aheadBehind', { a: local, b: remote }) // ahead = only in local, behind = only in remote
  } catch (e) {
    return toast(e.message, 'error')
  }
  const afterSwitch = async (fn) => {
    const ok = await checkout(local, { resolved: true, quietJump: true })
    if (ok !== true) return // the switch failed or was cancelled: change nothing else
    if (fn) await fn()
    state.history.stale = true
    await refreshAll()
    if (state.tab === 'history') setTimeout(goToHead, 120)
  }
  if (!ab.behind) return afterSwitch() // local already has everything the remote has
  if (!ab.ahead) return afterSwitch(() => run('merge', { ref: remote, ffOnly: true }, { success: `${local} is now at ${remote}`, refresh: false }))
  const r = await dialog({
    title: `Check out ${remote}`,
    message: `Your local ${local} already exists and has gone its own way: ${ab.ahead} commit${ab.ahead > 1 ? 's' : ''} only on ${local}, ${ab.behind} only on ${remote}.`,
    fields: [
      {
        key: 'how',
        label: 'What should happen to your local branch?',
        type: 'select',
        value: 'merge',
        options: [
          ['merge', `Merge ${remote} into ${local} (keeps both)`],
          ['rebase', `Rebase ${local} onto ${remote} (your ${ab.ahead} commits on top)`],
          ['reset', `Reset ${local} to ${remote} (drops your ${ab.ahead} local commits)`],
          ['detach', `Just look at ${remote} (detached, ${local} unchanged)`],
          ['local', `Switch to ${local} as it is`]
        ]
      }
    ],
    ok: 'Check out'
  })
  if (!r) return
  if (r.how === 'detach') return checkout(remote, { detach: true, resolved: true })
  if (r.how === 'local') return checkout(local, { resolved: true })
  if (r.how === 'reset' && !(await confirmBox(`Drop ${ab.ahead} local commit${ab.ahead > 1 ? 's' : ''}?`, `${local} will point at ${remote}. The dropped commits stay in the Reflog tab for a while if you need them back.`, 'Reset', true))) return
  const after = {
    merge: () => run('merge', { ref: remote }, { success: `Merged ${remote} into ${local}`, refresh: false }),
    rebase: () => run('rebase', { onto: remote }, { success: `Rebased ${local} onto ${remote}`, refresh: false }),
    reset: () => run('reset', { hash: remote, mode: 'keep' }, { success: `${local} now matches ${remote}`, refresh: false })
  }[r.how]
  return afterSwitch(after)
}

/**
 * Switch branch. The two usual failures get a choice instead of an error: changes in the way
 * (stash & switch, or discard & switch) and a branch already checked out in another worktree.
 */
/**
 * Git Extensions' "local changes" choice before a checkout: keep, stash, merge or reset.
 * Resolves { mode, clean } or null (cancelled). "Remember" stores the choice (never for reset).
 */
function checkoutChangesDialog(label, count, { collided = false } = {}) {
  closeOverlays()
  return new Promise((resolve) => {
    const options = [
      ['keep', "Don't change", 'Take the changes along. If they collide with the other branch you are asked again.'],
      ['stash', 'Stash', 'Put them aside, switch, then bring them back.'],
      ['merge', 'Merge', 'Merge them into the other branch (may leave conflicts to resolve).'],
      ['reset', 'Reset', 'Discard them. This cannot be undone.']
    ]
    if (collided) options.shift() // "Don't change" is what just failed
    let mode = collided ? 'stash' : 'keep'
    const clean = h('input', { type: 'checkbox' })
    const remember = h('input', { type: 'checkbox' })
    const cleanRow = h('label', { class: 'check co-clean hidden' }, clean, 'Also delete untracked files')
    const rows = options.map(([v, title, desc]) => {
      const radio = h('input', { type: 'radio', name: 'co-mode', value: v, checked: v === mode, onChange: () => pick(v) })
      return h('label', { class: `co-option ${v === 'reset' ? 'danger' : ''}`, 'data-mode': v }, radio, h('div', null, h('div', { class: 'co-title' }, title), h('div', { class: 'dim' }, desc)))
    })
    const ok = h('button', { type: 'submit', class: 'btn primary' }, `Checkout ${label}`)
    function pick(v) {
      mode = v
      rows.forEach((r) => r.classList.toggle('on', r.dataset.mode === v))
      cleanRow.classList.toggle('hidden', v !== 'reset')
      remember.disabled = v === 'reset'
      if (v === 'reset') remember.checked = false
      ok.className = `btn ${v === 'reset' ? 'danger solid' : 'primary'}`
      ok.textContent = v === 'reset' ? `Reset & checkout ${label}` : `Checkout ${label}`
    }
    let closed = false
    const done = (val) => {
      if (closed) return
      closed = true
      overlay.remove()
      document.removeEventListener('keydown', onKey)
      resolve(val)
    }
    const onKey = (e) => e.key === 'Escape' && isTopOverlay(overlay) && done(null)
    const form = h(
      'form',
      {
        class: 'dialog co-dialog',
        onSubmit: (e) => {
          e.preventDefault()
          const val = { mode, clean: clean.checked }
          if (remember.checked && mode !== 'reset') store.set('checkoutChanges', val)
          done(val)
        }
      },
      h('h3', null, `Checkout ${label}`),
      h('p', null, collided ? `Your uncommitted changes would be overwritten by ${label}. What should happen to them?` : `You have ${count} uncommitted change${count > 1 ? 's' : ''}. What should happen to ${count > 1 ? 'them' : 'it'}?`),
      h('div', { class: 'co-options' }, rows),
      cleanRow,
      h('label', { class: 'check' }, remember, "Remember my choice (change it in Settings)"),
      h('div', { class: 'buttons' }, h('button', { type: 'button', class: 'btn', onClick: () => done(null) }, 'Cancel'), ok)
    )
    pick(mode)
    const overlay = h('div', { class: 'overlay', onMousedown: (e) => e.target === overlay && done(null) }, form)
    mountOverlay(overlay, () => done(null))
    document.addEventListener('keydown', onKey)
    ok.focus()
  })
}

async function checkout(name, opts = {}) {
  closeOverlays()
  // origin/x while a local x exists at another commit: ask what to do, as Git Extensions does.
  if (opts.track && !opts.resolved) {
    const local = name.replace(/^[^/]+\//, '')
    const refs = state.refs || (await call('refs').catch(() => null))
    if (refs?.local.some((b) => b.name === local)) return checkoutRemoteOverLocal(name, local)
  }
  const label = opts.track ? name.replace(/^[^/]+\//, '') : name
  // Uncommitted changes: ask first what to do with them, as Git Extensions does.
  const dirty = state.status?.files?.length || 0
  if (dirty && !opts.stash && !opts.merge && !opts.discard && !opts.keep) {
    const how = store.get('checkoutChanges', null) || (await checkoutChangesDialog(label, dirty))
    if (!how) return
    const flags = { keep: how.mode === 'keep', stash: how.mode === 'stash', merge: how.mode === 'merge', discard: how.mode === 'reset', clean: how.mode === 'reset' && how.clean }
    return checkout(name, { ...opts, ...flags })
  }
  setBusy(1)
  let out
  try {
    const { keep, ...rest } = opts
    out = await call('checkout', { ref: name, ...rest })
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
      // "Don't change" collided with the other branch: ask again, without that option
      const r = await checkoutChangesDialog(label, state.status?.files?.length || 1, { collided: true })
      if (!r) return
      return checkout(name, { ...opts, keep: false, stash: r.mode === 'stash', merge: r.mode === 'merge', discard: r.mode === 'reset', clean: r.mode === 'reset' && r.clean })
    }
    toast(e.message, 'error')
    await refreshAll()
    return false
  }
  setBusy(-1)
  const loc = out?.local
  const shown = loc?.name || label
  if (out?.stashKept) toast(out.stashMessage || `Switched to ${shown}. Your changes did not apply cleanly, so they are kept in the stash.`, 'error', 9000)
  else toast(out?.stashed ? `Switched to ${shown} with your changes` : `Switched to ${shown}`)
  // origin/x checked out while a local x exists: we switched to the local one; offer to catch it up.
  if (loc && loc.behind > 0 && loc.ahead === 0) {
    if (await confirmBox(`Update ${loc.name}?`, `Your local ${loc.name} is ${loc.behind} commit${loc.behind > 1 ? 's' : ''} behind ${loc.remote}. Fast-forward it?`, 'Fast-forward'))
      await run('merge', { ref: loc.remote, ffOnly: true }, { success: `${loc.name} is up to date with ${loc.remote}` })
  } else if (loc && loc.behind > 0)
    toast(`Local ${loc.name} and ${loc.remote} have diverged (${loc.ahead} ahead, ${loc.behind} behind). Merge or rebase when you are ready.`, 'ok', 8000)
  if (opts.quietJump) return true
  state.history.stale = true
  await refreshAll()
  // show where you are now, even when that commit is far down the graph
  if (state.tab === 'history') setTimeout(goToHead, 120)
  return true
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
  resetHistory()
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
  resetHistory()
  const out = await run('merge', { ref, [r.mode]: r.mode !== 'default' }, { success: r.mode === 'squash' ? 'Squashed; review and commit' : 'Merged' })
  if (out === undefined && r.ai && state.status?.files.some((f) => f.conflict)) resolveWithAi()
}
async function rebaseOnto(ref) {
  const cur = state.status?.branch || 'HEAD'
  if (!(await confirmBox(`Rebase ${cur} onto ${ref}?`, 'Your commits will be replayed on top of it. Avoid this on branches others already pulled.', 'Rebase'))) return
  resetHistory()
  const out = await run('rebase', { onto: ref }, { success: 'Rebased' })
  if (out === undefined && state.status?.files.some((f) => f.conflict) && (await confirmBox('Rebase hit conflicts', 'Resolve them with AI in a new terminal?', 'Resolve with AI'))) resolveWithAi()
}
async function newTag(hash) {
  const r = await dialog({
    title: 'Create tag',
    fields: [
      { key: 'name', label: 'Tag name', placeholder: 'v1.0.0' },
      { key: 'message', label: 'Message (optional, makes an annotated tag)', type: 'textarea' },
      { key: 'push', label: 'Push the tag to the remote', type: 'check', value: store.get('tagPush', false) }
    ],
    ok: 'Create'
  })
  if (!r?.name.trim()) return
  const name = r.name.trim()
  store.set('tagPush', !!r.push)
  resetHistory()
  const made = await run('tagCreate', { name, message: r.message.trim() || undefined, hash }, { success: r.push ? undefined : `Tagged ${name}`, refresh: !r.push })
  if (made !== undefined && r.push) run('tagPush', { name }, { success: `Tagged and pushed ${name}` })
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
  const b0 = b
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
      iconBtn('more', 'More', (e) => branchMenu(e.currentTarget))
    )
  )
  // Built when it opens: the checked-out branch may have changed since this row was drawn.
  function branchMenu(anchor) {
    const cur = state.status?.branch
    const b = { ...b0, current: b0.name === cur }
    return menu(anchor, [
          !b.current && { label: 'Checkout', icon: 'right', onClick: () => checkout(b.name) },
          !b.current && cur && { label: `Merge into ${cur}`, icon: 'merge', onClick: () => mergeRef(b.name) },
          !b.current && cur && { label: `Merge request → ${b.name}…`, icon: 'pr', cls: 'mr-item', badge: 'MR', onClick: () => mergeRequestDialog(b.name) },
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
  }
}
function remoteBranchRow(b, local) {
  const short = b.name.replace(/^[^/]+\//, '')
  const remote = b.name.split('/')[0]
  const hasLocal = local.some((l) => l.name === short)
  const curNow = () => state.status?.branch // read when the menu opens, not when the row was drawn
  return h(
    'div',
    { class: 'item', title: `${b.name}\n${b.subject}` },
    icon('globe', 13),
    h('span', { class: 'grow ellipsis' }, b.name),
    h('span', { class: 'meta-right dim', style: { fontSize: '11px' } }, ago(b.date)),
    h(
      'div',
      { class: 'hover-actions', onClick: (e) => e.stopPropagation() },
      iconBtn('more', 'More', (e) => {
        const cur = curNow()
        return menu(e.currentTarget, [
          // Always go through the remote: when a local branch exists, checkout() asks how to bring it up to date.
          { label: hasLocal ? `Checkout ${b.name}…` : `Checkout as ${short}`, icon: 'right', onClick: () => checkout(b.name, { track: true }) },
          cur && { label: `Merge into ${cur}`, icon: 'merge', onClick: () => mergeRef(b.name) },
          cur && b.name.replace(/^[^/]+\//, '') !== cur && { label: `Merge request → ${b.name.replace(/^[^/]+\//, '')}…`, icon: 'pr', cls: 'mr-item', badge: 'MR', onClick: () => mergeRequestDialog(b.name) },
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
      })
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
      h('div', { class: 'actions' }, iconBtn('trash', 'Prune stale worktrees', async () => (await confirmBox('Prune stale worktrees?', 'Removes the records of worktrees whose folders no longer exist. Worktrees on disk are not touched.', 'Prune')) && run('worktreePrune', {}, { success: 'Pruned' })), iconBtn('plus', 'New worktree', () => addWorktree()))
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
                            w.branch && { key: 'deleteBranch', label: `Also delete branch ${w.branch} (only if it is merged)`, type: 'check', value: false },
                            w.branch && { key: 'forceBranch', label: `Delete ${w.branch} even if it has unmerged commits`, type: 'check', value: false }
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
                      out = await call('worktreeRemove', { path: w.path, force: r.force, deleteBranch: r.deleteBranch || r.forceBranch, forceBranch: r.forceBranch })
                    } catch (err) {
                      // Uncommitted or untracked files: say so plainly and offer to remove it anyway.
                      if (!r.force && !/still lists/.test(err.message) && /modified|untracked|use --force/i.test(err.message)) {
                        setBusy(-1)
                        const yes = await confirmBox('This worktree has uncommitted changes', `${w.path}

Removing it deletes those changes. This cannot be undone.`, 'Remove anyway', true)
                        setBusy(1) // balanced by finally
                        if (yes) out = await call('worktreeRemove', { path: w.path, force: true, deleteBranch: r.deleteBranch || r.forceBranch, forceBranch: r.forceBranch }).catch((e2) => (toast(e2.message, 'error'), undefined))
                      } else toast(err.message, 'error')
                    } finally {
                      setBusy(-1)
                    }
                    if (out === undefined) card?.classList.remove('leaving')
                    else if (out.alreadyGone) toast('That worktree was already removed. The list is up to date now.')
                    else if (out.leftover) toast(`Worktree removed from Git. Some files are left in the folder:
${w.path}`, 'ok', 7000)
                    else toast('Worktree removed')
                    if (out?.branchKept) toast(`Branch ${w.branch} was kept: ${out.branchKept}`, 'error', 8000)
                    if (out !== undefined) await new Promise((res) => setTimeout(res, 180)) // let the card fold away
                    // always reload the list: on failure too, so an entry removed elsewhere disappears
                    await refreshAll()
                    if (state.tab === 'worktrees') renderView({ force: true })
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
      { class: 'form stash-form' },
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
        h(
          'div',
          { class: 'grow', style: { minWidth: 0 } },
          h('div', { class: 'ellipsis', style: { color: 'var(--t1)' } }, s.subject.replace(/^(WIP on|On) [^:]+: /, '') || s.ref),
          h('div', { class: 'stash-meta' }, icon('branch', 10), (s.subject.match(/^(?:WIP on|On) ([^:]+):/) || [])[1] || '?', ` · ${ago(s.time)} · `, h('span', { class: 'mono' }, s.ref))
        ),
        h(
          'div',
          { class: 'stash-actions', onClick: (e) => e.stopPropagation() },
          h('button', { class: 'btn sm', title: 'Apply and keep the stash', onClick: () => run('stashApply', { ref: s.ref }, { success: 'Applied' }) }, icon('check', 12), 'Apply'),
          h('button', { class: 'btn sm', title: 'Apply and remove the stash', onClick: () => run('stashPop', { ref: s.ref }, { success: 'Popped' }) }, icon('pull', 12), 'Pop'),
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
  { key: 'http.sslCAInfo', label: 'Custom CA certificate file', placeholder: 'C:\\certs\\company-ca.pem' },
  { key: 'http.postBuffer', label: 'Upload buffer (bytes, for large pushes)', placeholder: '524288000' }
]

/**
 * Saved identities (name + email, optionally a signing key): pick one for this repository or make
 * it the global one, instead of typing them again. Kept in the plugin's own storage.
 */
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
async function identityProfiles() {
  const [g, l] = await Promise.all([call('configList', { scope: 'global' }).catch(() => []), state.repo ? call('configList', { scope: 'local' }).catch(() => []) : []])
  const get = (list, k) => list.find((e) => e.key.toLowerCase() === k)?.value || ''
  const cur = {
    global: { name: get(g, 'user.name'), email: get(g, 'user.email') },
    local: { name: get(l, 'user.name'), email: get(l, 'user.email') }
  }
  let list = store.get('identityProfiles', [])
  // first run: offer what is set already as profiles
  if (!list.length) {
    for (const c of [cur.global, cur.local]) if (c.name && c.email && !list.some((p) => p.email === c.email && p.name === c.name)) list.push({ id: newId(), label: '', ...c })
    if (list.length) store.set('identityProfiles', list)
  }
  const save = (next) => (store.set('identityProfiles', next), renderView({ force: true }))
  const same = (p, c) => p.name === c.name && p.email === c.email
  const effective = cur.local.name || cur.local.email ? cur.local : cur.global

  async function apply(p, scope) {
    setBusy(1)
    try {
      await call('configSet', { scope, key: 'user.name', value: p.name })
      await call('configSet', { scope, key: 'user.email', value: p.email })
      if (p.signingKey) await call('configSet', { scope, key: 'user.signingkey', value: p.signingKey })
      toast(scope === 'global' ? `${p.label || p.name} is now your global identity` : `This repository now commits as ${p.label || p.name}`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(-1)
      renderView({ force: true })
    }
  }
  async function useGlobalHere() {
    setBusy(1)
    try {
      await call('configUnset', { scope: 'local', key: 'user.name' }).catch(() => {})
      await call('configUnset', { scope: 'local', key: 'user.email' }).catch(() => {})
      toast('This repository uses the global identity again')
    } finally {
      setBusy(-1)
      renderView({ force: true })
    }
  }
  async function edit(p) {
    const r = await dialog({
      title: p ? 'Edit profile' : 'New profile',
      fields: [
        { key: 'label', label: 'Profile name (optional)', value: p?.label || '', placeholder: 'Work, Personal, Client…' },
        { key: 'name', label: 'Name (user.name)', value: p?.name || '' },
        { key: 'email', label: 'Email (user.email)', value: p?.email || '' },
        { key: 'signingKey', label: 'Signing key (optional, user.signingkey)', value: p?.signingKey || '' }
      ],
      ok: 'Save'
    })
    if (!r) return
    if (!r.name.trim() || !/^[^\s@]+@[^\s@]+$/.test(r.email.trim())) return toast('A name and a valid email are needed', 'error')
    const item = { id: p?.id || newId(), label: r.label.trim(), name: r.name.trim(), email: r.email.trim(), signingKey: r.signingKey.trim() || undefined }
    save(p ? list.map((x) => (x.id === p.id ? item : x)) : [...list, item])
  }

  const card = (p) => {
    const isGlobal = same(p, cur.global)
    const isLocal = same(p, cur.local)
    const inUse = same(p, effective)
    return h(
      'div',
      { class: `idp ${inUse ? 'on' : ''}` },
      h('span', { class: 'idp-av' }, (p.label || p.name || '?')[0].toUpperCase()),
      h(
        'div',
        { class: 'idp-main' },
        h('div', { class: 'idp-title' }, h('b', null, p.label || p.name), p.label && h('span', { class: 'dim' }, p.name), isGlobal && h('span', { class: 'pill idp-global' }, 'Global'), isLocal && h('span', { class: 'pill idp-local' }, 'This repo'), inUse && state.repo && h('span', { class: 'pill idp-use' }, icon('check', 10), 'Commits use this')),
        h('div', { class: 'dim mono idp-mail' }, p.email)
      ),
      h(
        'div',
        { class: 'idp-actions' },
        state.repo && !isLocal && h('button', { class: 'btn sm', title: 'Commit as this identity in this repository only', onClick: () => apply(p, 'local') }, 'Use for this repo'),
        !isGlobal && h('button', { class: 'btn sm', title: 'Make this the identity for every repository', onClick: () => apply(p, 'global') }, 'Set global'),
        iconBtn('edit', 'Edit profile', () => edit(p)),
        iconBtn('trash', 'Delete profile (Git settings stay as they are)', async () => (await confirmBox(`Delete profile ${p.label || p.name}?`, 'Only the saved profile is removed; your Git settings stay as they are.', 'Delete', true)) && save(list.filter((x) => x.id !== p.id)))
      )
    )
  }
  return h(
    'div',
    { class: 'idp-section' },
    h('div', { class: 'section-head' }, 'Identity profiles', h('span', { class: 'count' }, list.length), h('div', { class: 'actions' }, iconBtn('plus', 'New profile', () => edit(null)))),
    h(
      'div',
      { class: 'idp-now dim' },
      state.repo
        ? cur.local.name || cur.local.email
          ? ['This repository commits as ', h('b', null, `${cur.local.name} <${cur.local.email}>`), ' (its own setting). ', h('button', { class: 'link-btn', onClick: useGlobalHere }, 'Use the global identity instead')]
          : ['This repository uses the global identity ', h('b', null, cur.global.name ? `${cur.global.name} <${cur.global.email}>` : '(not set)'), '.']
        : ['Global identity: ', h('b', null, cur.global.name ? `${cur.global.name} <${cur.global.email}>` : '(not set)')]
    ),
    list.length ? h('div', { class: 'idp-list' }, list.map(card)) : h('div', { class: 'dim idp-empty' }, 'No profiles yet. Add one with +, then switch with one click.')
  )
}

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
    if (s === state.configScope) return
    state.configScope = s
    store.set('configScope', s)
    // Show the choice at once and lock the old form until the new scope's values arrive, so
    // nothing typed meanwhile is saved to the wrong scope.
    seg.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', (i === 0) === (s === 'global')))
    root.classList.add('pending')
    renderView({ force: true })
  }
  root.append(
    h('div', { style: { padding: '4px 10px 2px' } }, seg),
    h(
      'div',
      { class: 'dim', style: { padding: '4px 10px 0', fontSize: '11px' } },
      scope === 'global' ? 'Applies to every repository for your user (~/.gitconfig).' : 'Applies only to this repository (.git/config) and overrides global values.'
    )
  )

  root.append(await identityProfiles())

  // identity + common options
  if (scope !== 'global') root.append(h('div', { class: 'dim', style: { padding: '6px 16px 0', fontSize: '11.5px' } }, 'Empty fields use the global value shown in grey.'))
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
              renderView({ force: true })
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

  const remembered = store.get('checkoutChanges', null)
  if (remembered)
    root.append(
      h('div', { class: 'section-head' }, 'Checkout'),
      h(
        'div',
        { class: 'cfg-row' },
        h('div', null, h('div', null, `With uncommitted changes, checkout always does: `, h('strong', null, { keep: "Don't change", stash: 'Stash', merge: 'Merge' }[remembered.mode] || remembered.mode)), h('div', { class: 'cfg-key' }, 'Saved from the checkout dialog')),
        h('button', { class: 'btn sm', onClick: () => (store.set('checkoutChanges', null), toast('Checkout will ask again'), renderView({ force: true })) }, 'Ask every time')
      )
    )
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

/** "commit: msg" → a coloured label for the kind of step. */
function reflogKind(subject) {
  const k = (subject.match(/^([\w-]+)/)?.[1] || '').toLowerCase()
  const kind = ['commit', 'checkout', 'reset', 'merge', 'rebase', 'pull', 'cherry-pick', 'revert', 'branch', 'clone'].includes(k) ? k : 'other'
  return h('span', { class: `rk rk-${kind}` }, kind === 'other' ? k || 'step' : kind)
}
async function viewReflog() {
  const list = await call('reflog')
  const root = h('div', { class: 'view' })
  root.append(
    h('div', { class: 'section-head' }, 'Reflog', h('span', { class: 'count' }, list.length)),
    h('div', { class: 'dim', style: { padding: '0 16px 8px', fontSize: '11.5px' } }, 'Everywhere HEAD has been. Use it to recover commits after a reset, rebase or deleted branch.')
  )
  for (const e of list)
    root.append(
      h(
        'div',
        { class: 'item', title: e.subject, onClick: () => openCommit(e.hash) },
        h('span', { class: 'mono dim', style: { width: '56px', flex: 'none' } }, e.hash.slice(0, 7)),
        reflogKind(e.subject),
        h('span', { class: 'grow ellipsis' }, e.subject.replace(/^[\w -]+?(\(.*?\))?: /, '')),
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
      h('button', { class: 'btn sm', onClick: () => run('bisect', { action: 'good' }, { success: 'Marked good' }).then(() => resetHistory()) }, icon('check', 12), 'Good'),
      h('button', { class: 'btn sm', onClick: () => run('bisect', { action: 'bad' }, { success: 'Marked bad' }).then(() => resetHistory()) }, icon('x', 12), 'Bad'),
      h('button', { class: 'btn sm', onClick: () => run('bisect', { action: 'skip' }, { success: 'Skipped' }) }, 'Skip'),
      h('button', { class: 'btn sm danger', onClick: () => run('bisect', { action: 'reset' }, { success: 'Bisect finished' }).then(() => resetHistory()) }, 'Stop')
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
  resetHistory()
  refreshAll()
}

async function rewordLast(c) {
  const r = await dialog({ title: 'Reword last commit', fields: [{ key: 'msg', label: 'Message', type: 'textarea', value: c.message }], ok: 'Save' })
  if (!r?.msg.trim()) return
  closeSheet()
  resetHistory()
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
  resetHistory()
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
  const close = () => {
    overlay.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (e) => e.key === 'Escape' && isTopOverlay(overlay) && close()
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
            resetHistory()
            const out = await run('rebaseInteractive', { base, todo: todo.map(({ hash, action }) => ({ hash, action })) }, { success: 'Rebased' })
            if (out === undefined && state.status?.files.some((f) => f.conflict) && (await confirmBox('Rebase hit conflicts', 'Resolve them with AI in a new terminal?', 'Resolve with AI'))) resolveWithAi()
          }
        },
        'Start rebase'
      )
    )
  )
  const overlay = h('div', { class: 'overlay', onMousedown: (e) => e.target === overlay && close() }, box)
  mountOverlay(overlay, close)
  document.addEventListener('keydown', onKey)
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
  section('local', 'Branches', refs.local.length, () => h('div', null, refs.local.map((b) => localBranchRow(b))), [
    iconBtn('trash', 'Clean up merged and gone branches', (e) => (e.stopPropagation(), cleanupBranches())),
    iconBtn('plus', 'New branch', (e) => (e.stopPropagation(), newBranch()))
  ])
  section('remote', 'Remotes', refs.remote.length, () => h('div', null, refs.remote.map((b) => remoteBranchRow(b, refs.local))))
  section('tags', 'Tags', refs.tags.length, () => h('div', null, refs.tags.map((t) => tagRow(t))))
  side.scrollTop = scroll
}


/* =========================================================================
   AI commit message modal (modeled on Orca's Source Control "Generate" dialog)
   ========================================================================= */
/**
 * While an AI agent works: a shimmering skeleton over the text box it will fill (via the
 * `generating` class), and a status line that names the agent, says what it is doing and counts
 * the seconds. Returns stop().
 */
function aiWrap(textarea) {
  return h('div', { class: 'ai-wrap' }, textarea, h('div', { class: 'ai-skel', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'), h('span'), h('span')))
}
function aiTicker(statusEl, name, what = 'your changes') {
  const started = Date.now()
  const phase = (t) => (t < 6 ? `${name} is reading ${what}` : t < 20 ? `${name} is thinking` : t < 60 ? `${name} is writing` : `${name} is still working (large changes take longer)`)
  const text = h('span', { class: 'ai-phase' })
  const secs = h('span', { class: 'ai-secs mono' })
  const draw = () => {
    const t = Math.floor((Date.now() - started) / 1000)
    text.textContent = phase(t) + '…'
    secs.textContent = `${t}s`
  }
  draw()
  append(clear(statusEl), [h('span', { class: 'ai-dots' }, h('i'), h('i'), h('i')), text, secs])
  statusEl.classList.add('working')
  const id = setInterval(draw, 1000)
  return () => {
    clearInterval(id)
    statusEl.classList.remove('working')
  }
}

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

  let stopTick = () => {}
  const setBusy2 = (on, text) => {
    busy = on
    result.classList.toggle('generating', on)
    result.readOnly = on
    stopTick()
    if (on) stopTick = aiTicker(status, agents.find((a) => a.id === agentSel.value)?.name || 'AI', 'your changes')
    else append(clear(status), [text || ''])
    append(clear(genBtn), [on ? [icon('x', 13), 'Stop'] : [icon('sparkle', 13), result.value.trim() ? 'Regenerate' : 'Generate']])
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
    if (!isTopOverlay(overlay)) return
    if (e.key === 'Escape' && !busy) close()
    // Ctrl+Enter commits a ready message, or starts a run; it never stops one in flight.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !busy) result.value.trim() ? finish(onCommit) : generate()
  }

  const box = h(
    'div',
    { class: 'dialog ai-dialog', role: 'dialog', 'aria-label': 'Generate commit message' },
    h('div', { class: 'ai-title' }, h('span', { class: 'ai-badge' }, icon('sparkle', 14)), h('div', null, h('h3', null, 'Generate commit message'), h('p', null, 'An AI agent reads your diff and drafts a message. Nothing is committed until you choose.'))),
    h('div', { class: 'ai-row' }, h('div', { class: 'field grow' }, h('label', null, 'Agent'), agentSel), h('div', { class: 'field grow' }, h('label', null, 'Changes'), scopeSel)),
    h('div', { class: 'field' }, h('label', null, 'Instructions'), instructions),
    h('div', { class: 'field' }, h('label', null, 'Message'), aiWrap(result)),
    status,
    h('div', { class: 'buttons' }, h('button', { type: 'button', class: 'btn', onClick: close }, 'Cancel'), h('span', { class: 'grow' }), genBtn, useBtn, commitBtn)
  )
  const overlay = h('div', { class: 'overlay', onMousedown: (e) => e.target === overlay && !busy && close() }, box)
  mountOverlay(overlay, close)
  document.addEventListener('keydown', onKey)
  status.textContent = 'Choose the agent, add instructions if you like, then press Generate.'
  genBtn.focus() // pick the agent and instructions first; Generate (or Ctrl+Enter) starts it
}


/* =========================================================================
   Merge requests: one button pushes the branch and opens the MR/PR
   ========================================================================= */
/** Top-level "Merge request" for a commit: current branch → each branch at that commit. */
function mrItem(local, remote, cur) {
  if (!cur) return null
  const targets = [...new Set([...local, ...remote.filter((r) => !r.endsWith('/HEAD')).map((r) => r.replace(/^[^/]+\//, ''))])].filter((b) => b !== cur)
  if (!targets.length) return null
  if (targets.length === 1) return { label: `Merge request → ${targets[0]}…`, icon: 'pr', cls: 'mr-item', badge: 'MR', onClick: () => mergeRequestDialog(targets[0]) }
  return { label: 'Merge request', icon: 'pr', cls: 'mr-item', badge: 'MR', items: targets.map((b) => ({ label: `→ ${b}…`, icon: 'pr', onClick: () => mergeRequestDialog(b) })) }
}
/**
 * Pick people (assignees, reviewers): chips plus a search box with a list of the project's members.
 * `value()` gives [{ id, username }].
 */
function peoplePicker(placeholder, { me, meLabel = 'Assign to me' } = {}) {
  let people = []
  let chosen = []
  let open = false
  let active = 0
  const chips = h('div', { class: 'pp-chips' })
  const input = h('input', { type: 'text', class: 'pp-input', placeholder, autocomplete: 'off', spellcheck: 'false' })
  const list = h('div', { class: 'pp-list hidden', role: 'listbox' })
  const meBtn = h('button', { type: 'button', class: 'link-btn pp-me hidden', onClick: () => me && add(me) }, meLabel)
  const el = h('div', { class: 'pp' }, h('div', { class: 'pp-box', onMousedown: (e) => e.target !== input && (e.preventDefault(), input.focus()) }, chips, input), list)
  const matches = () => {
    const q = input.value.trim().toLowerCase()
    return people.filter((p) => !chosen.some((c) => c.id === p.id) && (!q || p.username.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))).slice(0, 30)
  }
  // plugin pages have no network, so avatar images cannot load: initials instead
  const avatar = (p) => h('span', { class: 'pp-av pp-initial' }, (p.name || p.username || '?')[0].toUpperCase())
  function drawChips() {
    clear(chips)
    for (const c of chosen) chips.append(h('span', { class: 'pp-chip', title: `@${c.username}` }, avatar(c), h('span', null, c.name || c.username), h('button', { type: 'button', class: 'pp-x', title: `Remove ${c.username}`, onClick: () => remove(c) }, '×')))
    meBtn.classList.toggle('hidden', !me || chosen.some((c) => c.id === me.id))
  }
  function drawList() {
    const m = matches()
    active = Math.min(active, Math.max(0, m.length - 1))
    clear(list)
    if (!people.length) list.append(h('div', { class: 'pp-empty dim' }, 'No members found'))
    else if (!m.length) list.append(h('div', { class: 'pp-empty dim' }, 'No match'))
    m.forEach((p, i) =>
      list.append(
        h('div', { class: `pp-item ${i === active ? 'on' : ''}`, role: 'option', onMousedown: (e) => (e.preventDefault(), add(p)) }, avatar(p), h('span', { class: 'pp-name' }, p.name), h('span', { class: 'dim mono' }, `@${p.username}`))
      )
    )
    list.classList.toggle('hidden', !open)
  }
  function add(p) {
    if (!chosen.some((c) => c.id === p.id)) chosen.push(p)
    input.value = ''
    drawChips()
    drawList()
  }
  function remove(p) {
    chosen = chosen.filter((c) => c.id !== p.id)
    drawChips()
    drawList()
  }
  input.addEventListener('focus', () => ((open = true), drawList()))
  input.addEventListener('blur', () => ((open = false), drawList()))
  input.addEventListener('input', () => ((active = 0), (open = true), drawList()))
  input.addEventListener('keydown', (e) => {
    const m = matches()
    if (e.key === 'ArrowDown') (e.preventDefault(), (active = Math.min(active + 1, m.length - 1)), drawList())
    else if (e.key === 'ArrowUp') (e.preventDefault(), (active = Math.max(active - 1, 0)), drawList())
    else if (e.key === 'Enter' && open && m[active]) (e.preventDefault(), add(m[active]))
    else if (e.key === 'Backspace' && !input.value && chosen.length) remove(chosen[chosen.length - 1])
    else if (e.key === 'Escape' && open) (e.stopPropagation(), (open = false), drawList())
  })
  drawChips()
  return {
    el,
    meBtn,
    setPeople(list2, me2) {
      people = list2 || []
      me = me2 || me
      chosen = chosen.map((c) => people.find((p) => p.id === c.id) || c)
      drawChips()
      drawList()
    },
    set(list2) {
      chosen = (list2 || []).slice()
      drawChips()
    },
    value: () => chosen.map((c) => ({ id: c.id, username: c.username, name: c.name, avatar: c.avatar })),
    focusInput: () => input.focus()
  }
}

async function mergeRequestDialog(target, source, swapped) {
  closeOverlays()
  let info
  setBusy(1)
  try {
    info = await request('mr.info', { repo: state.repo, target, source }, 30000)
  } catch (e) {
    return toast(e.message, 'error')
  } finally {
    setBusy(-1)
  }
  if (info.source === info.target) return toast(`You are on ${info.target}. Check out the branch you want to merge, then try again.`, 'error')
  // Nothing to merge this way but commits the other way: the person meant the reverse (e.g. on main,
  // right-clicking a feature branch). Flip once, and say so.
  if (!info.commits.length && info.reverse > 0 && !swapped) {
    toast(`${info.source} has nothing new for ${info.target}, so this is ${info.target} → ${info.source} instead.`, 'ok', 5000)
    return mergeRequestDialog(info.source, info.target, true)
  }
  if (!info.commits.length) return toast(`${info.source} and ${info.target} have the same commits: there is nothing to merge.`, 'error')
  const isGh = info.kind === 'github'
  const noun = isGh ? 'pull request' : 'merge request'
  const service = isGh ? 'GitHub' : info.host
  const repo = state.repo
  const humanize = (b) => b.replace(/^[\w-]+\//, '').replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase())

  const title = h('input', { type: 'text' })
  title.value = info.defaults?.title ?? (info.commits.length === 1 ? info.commits[0] : humanize(info.source))
  const body = h('textarea', { rows: 8, placeholder: 'What changed and why' })
  body.value = info.defaults?.body ?? info.commits.map((c) => `- ${c}`).join('\n')
  const draft = h('input', { type: 'checkbox' })
  draft.checked = !!info.defaults?.draft
  // People and merge options, as on the service's own form. Members load in the background.
  const peopleKey = `mrPeople:${info.host}/${info.path || ''}`
  const remembered = store.get(peopleKey, null)
  const assignees = peoplePicker('Search…')
  const reviewers = peoplePicker('Search…', { meLabel: 'Add me' })
  if (remembered?.reviewers) reviewers.set(remembered.reviewers)
  const removeSource = h('input', { type: 'checkbox' })
  removeSource.checked = true // GitLab's default for a new merge request
  const squash = h('input', { type: 'checkbox' })
  const peopleNote = h('div', { class: 'dim pp-note' }, h('span', { class: 'spinner' }), 'Loading members…')
  const gitlabOpts = !isGh && h('div', { class: 'mr-opts' }, h('label', { class: 'check' }, removeSource, 'Delete source branch when merge request is accepted'), h('label', { class: 'check' }, squash, 'Squash commits when merge request is accepted'))
  request('mr.people', { repo, query: '' }, 30000).then(
    (r) => {
      peopleNote.remove()
      if (!r.via) {
        const msg = h('div', { class: 'dim pp-note' }, `Sign in (${info.tools.cli} or your Git login) to pick people here. `, h('b', null, 'Open link'), ' lets you choose them on the web page.')
        assignees.el.before(msg)
        return
      }
      assignees.setPeople(r.people, r.me)
      reviewers.setPeople(r.people, r.me)
      if (!assignees.value().length && r.me && remembered?.assignMe !== false) assignees.set([r.me]) // GitLab's "Assign to me"
      if (!isGh && r.defaults) {
        if (typeof r.defaults.removeSource === 'boolean') removeSource.checked = r.defaults.removeSource // the project's setting
        squash.checked = !!r.defaults.squash
        squash.disabled = !!r.defaults.squashLocked
      }
    },
    (e) => ((peopleNote.textContent = `Could not load members: ${e.message}`), null)
  )
  const note = h('div', { class: 'mr-status' })
  const linkBtn = h('button', { type: 'button', class: 'btn' })
  const createBtn = h('button', { type: 'button', class: 'btn primary' })

  const drawButtons = () => {
    clear(linkBtn).append(icon('open', 13), 'Open link')
    linkBtn.title = `Push, then open ${service} with this filled in; press Create there. Nothing to install.`
    const can = !!info.tools.via
    clear(createBtn).append(icon('merge', 13), can ? 'Create now' : `Set up & create`)
    createBtn.title = can ? `Push and create the ${noun} on ${service} right here` : `Needs ${info.tools.cli}, set up once`
    clear(note)
    if (can)
      note.append(
        icon('check', 13),
        h('span', null, h('b', null, 'Create now'), ` makes the ${noun} on ${service} directly${info.tools.via === 'git' ? ', with the login Git already uses' : ` with ${info.tools.cli}`}. `, h('b', null, 'Open link'), ' opens it in your browser instead.')
      )
    else
      note.append(
        icon('open', 13),
        h(
          'div',
          { class: 'grow' },
          h('div', null, h('b', null, 'Open link'), ` works right away: ${service} opens with this filled in, press Create there.`),
          h('div', { class: 'dim' }, h('b', null, 'Create now'), ` needs ${info.tools.cli}${info.tools.installed ? ' signed in' : ''}. Set it up once:`),
          h(
            'div',
            { class: 'mr-steps' },
            !info.tools.installed && info.tools.canInstall && h('button', { type: 'button', class: 'btn sm', onClick: () => setup(isGh ? 'gh-install' : 'glab-install') }, icon('download', 12), `1. Install ${info.tools.cli}`),
            h('button', { type: 'button', class: 'btn sm', disabled: !info.tools.installed, onClick: () => setup(isGh ? 'gh-login' : 'glab-login') }, icon('user', 12), `${info.tools.installed ? '' : '2. '}Sign in to ${service}`),
            h('button', { type: 'button', class: 'btn sm', onClick: recheck }, icon('refresh', 12), 'Check again')
          )
        )
      )
  }
  async function setup(step) {
    try {
      const r = await request('mr.setup', { repo, step }, 30000)
      toast(r.ran ? `Running in a new terminal: ${r.command}\nFollow it there, then press "Check again".` : `Run this in a terminal, then press "Check again":\n${r.command}`, 'ok', 10000)
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  async function recheck() {
    try {
      info = await request('mr.info', { repo, target, source: info.source }, 30000)
      drawButtons()
      if (info.tools.via) toast(`${info.tools.via === 'git' ? 'Your Git login' : info.tools.cli} is ready: Create now makes it in one click.`)
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  let busy = false // creating: Escape and the backdrop do nothing
  let sent = false // finished: nothing left to lose
  const original = { title: title.value, body: body.value }
  const close = () => {
    overlay.remove()
    document.removeEventListener('keydown', onKey)
  }
  // Escape / backdrop: ignored while creating; asks first when the title or description were edited.
  const softClose = async () => {
    if (busy) return
    if (!sent && (title.value !== original.title || body.value !== original.body)) {
      if (!(await confirmBox(`Discard this ${noun}?`, 'The title and description you edited are lost.', 'Discard', true))) return
    }
    close()
  }
  const onKey = (e) => e.key === 'Escape' && isTopOverlay(overlay) && (e.preventDefault(), softClose())
  const finished = (headline, url, sub, openLabel) => {
    sent = true
    clear(form).append(
      h('div', { class: 'mr-done' }, icon('check', 22), h('div', null, h('div', { class: 'mr-done-title' }, headline), sub && h('div', { class: 'dim' }, sub))),
      h(
        'div',
        { class: 'buttons' },
        h('button', { type: 'button', class: 'btn', onClick: () => copy(url) }, icon('copy', 13), 'Copy link'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn', onClick: close }, 'Close'),
        h('button', { type: 'button', class: 'btn primary', onClick: () => openLink(url) }, icon('open', 13), openLabel)
      )
    )
  }
  async function submit(web) {
    if (!web && !info.tools.via) {
      // first time: set the CLI up (or just sign in) in a terminal; "Check again" enables one click
      return setup(info.tools.installed ? (isGh ? 'gh-login' : 'glab-login') : isGh ? 'gh-install' : 'glab-install')
    }
    if (!web && !title.value.trim()) return title.focus()
    const btn = web ? linkBtn : createBtn
    busy = true
    linkBtn.disabled = createBtn.disabled = true
    clear(btn).append(h('span', { class: 'spinner' }), info.needsPush ? 'Pushing…' : web ? 'Opening…' : 'Creating…')
    try {
      const who = { assignees: assignees.value(), reviewers: reviewers.value(), ...(!isGh ? { removeSource: removeSource.checked, squash: squash.checked } : {}) }
      store.set(peopleKey, { reviewers: who.reviewers, assignMe: who.assignees.length > 0 })
      const r = await request('mr.create', { repo, target: info.target, source: info.source, title: title.value, body: body.value, draft: draft.checked, web, ...who }, 120000)
      if (r.warning) toast(r.warning, 'error', 8000)
      const pushed = r.pushed ? `${info.source} pushed to ${info.remote}. ` : ''
      if (web && r.opened) {
        close()
        toast(`${pushed}${service} is open in your browser: check the ${noun} and press Create.`, 'ok', 6000)
      } else if (web) finished(`Ready on ${service}`, r.url, `${pushed}Open the page and press Create.`, `Open ${service}`)
      else if (r.created) finished(`${noun[0].toUpperCase() + noun.slice(1)} created`, r.url, `${pushed}${info.source} → ${info.target}`, `Open ${noun}`)
      else finished(`A ${noun} for ${info.source} already exists`, r.url, pushed, `Open ${noun}`)
      state.history.stale = true
      refreshAll()
    } catch (e) {
      linkBtn.disabled = createBtn.disabled = false
      drawButtons()
      if (!web && (e?.data?.kind === 'git-login-denied' || /git login/i.test(e.message))) {
        // the saved Git login may push but not create merge requests: fall back to the web page
        toast(`${e.message} Opening ${service} in your browser instead.`, 'error', 7000)
        busy = false
        return submit(true)
      }
      toast(e.message, 'error')
    } finally {
      busy = false
    }
  }
  linkBtn.addEventListener('click', () => submit(true))
  createBtn.addEventListener('click', () => submit(false))

  const form = h(
    'div',
    { class: 'mr-form' },
    h('div', { class: 'mr-route' }, h('span', { class: 'ref' }, icon('branch', 10), h('span', { class: 'ref-t' }, info.source)), icon('right', 14), h('span', { class: 'ref' }, icon('branch', 10), h('span', { class: 'ref-t' }, info.target)), h('button', { type: 'button', class: 'icon-btn', disabled: !(info.reverse > 0), title: info.reverse > 0 ? `Swap: ${info.target} → ${info.source} (${info.reverse} commit${info.reverse > 1 ? 's' : ''})` : `Can't swap: ${info.target} has nothing that ${info.source} lacks`, onClick: () => info.reverse > 0 && (close(), mergeRequestDialog(info.source, info.target, true)) }, icon('swap', 14))),
    info.needsPush && h('div', { class: 'dim mr-note' }, icon('push', 12), `${info.source} ${info.upstream ? 'has commits not on' : 'is not on'} ${info.remote} yet; it is pushed first.`),
    h(
      'div',
      { class: 'field' },
      h(
        'label',
        { class: 'row' },
        'Title',
        h('span', { class: 'grow' }),
        h(
          'button',
          {
            type: 'button',
            class: 'btn sm',
            title: 'Write the title and description from the whole branch with AI',
            onClick: async (e) => {
              const b = e.currentTarget
              b.disabled = true
              const t0 = Date.now()
              const tick = () => append(clear(b), [h('span', { class: 'ai-dots' }, h('i'), h('i'), h('i')), `AI is writing… ${Math.floor((Date.now() - t0) / 1000)}s`])
              tick()
              const timer = setInterval(tick, 1000)
              title.classList.add('generating')
              body.classList.add('generating')
              title.readOnly = body.readOnly = true
              try {
                const r = await request('ai.mrDescription', { repo, target: info.target, source: info.source, instructions: store.get('aiPrefs', {}).instructions || '' }, 118000)
                if (r.title) title.value = r.title
                if (r.body) body.value = r.body
              } catch (err) {
                toast(err.message, 'error')
              } finally {
                clearInterval(timer)
                title.classList.remove('generating')
                body.classList.remove('generating')
                title.readOnly = body.readOnly = false
                b.disabled = false
                append(clear(b), [icon('sparkle', 12), 'Write with AI'])
              }
            }
          },
          icon('sparkle', 12),
          'Write with AI'
        )
      ),
      aiWrap(title)
    ),
    h('div', { class: 'field' }, h('label', null, 'Description'), aiWrap(body)),
    h('div', { class: 'mr-people' }, peopleNote, h('div', { class: 'field' }, h('label', { class: 'row' }, 'Assignees', h('span', { class: 'grow' }), assignees.meBtn), assignees.el), h('div', { class: 'field' }, h('label', { class: 'row' }, isGh ? 'Reviewers (Create now only)' : 'Reviewers', h('span', { class: 'grow' }), reviewers.meBtn), reviewers.el)),
    gitlabOpts,
    h('label', { class: 'check' }, draft, 'Draft (Create now only)'),
    note,
    h('div', { class: 'buttons' }, h('button', { type: 'button', class: 'btn', onClick: close }, 'Cancel'), h('span', { class: 'grow' }), linkBtn, createBtn)
  )
  drawButtons()
  const box = h('div', { class: 'dialog mr-dialog', role: 'dialog' }, h('h3', null, `New ${noun}`), form)
  const overlay = h('div', { class: 'overlay', onMousedown: (e) => e.target === overlay && softClose() }, box)
  mountOverlay(overlay, close)
  document.addEventListener('keydown', onKey)
  title.focus()
  title.select()
}


/* =========================================================================
   Reviews: every open pull/merge request you are asked to review or assigned
   ========================================================================= */
let reviewsLoading = null
/** Does a review item belong to the open repository (same host and project path as its remote)? */
const inThisRepo = (it, data) => !!data.repoPath && it.repo?.toLowerCase() === data.repoPath.toLowerCase() && (!data.repoHost || !it.host || it.host.toLowerCase() === data.repoHost.toLowerCase())
/** The tab's badge: waiting for me, in this repository unless "All repos" is chosen. */
function reviewCount() {
  const d = state.reviews
  if (!d || d.repo !== state.repo) return 0
  const all = !d.repoPath || store.get('reviewsAllRepos', false)
  return d.items.filter((it) => it.roles.some((r) => r !== 'repo') && (all || inThisRepo(it, d))).length
}
async function loadReviews(force) {
  if (!force && state.reviews && state.reviews.repo === state.repo && Date.now() - state.reviews.at < 120000) return state.reviews
  const repo = state.repo
  reviewsLoading ||= request('reviews.list', { repo }, 90000)
    .then((r) => {
      state.reviews = { ...r, repo, at: Date.now() }
      store.set('reviewsCache', state.reviews)
      renderTabs()
      return state.reviews
    })
    .finally(() => (reviewsLoading = null))
  return reviewsLoading
}

async function viewReviews() {
  const root = h('div', { class: 'view reviews' })
  // Show at once: the last list (even from an earlier session) while a fresh one loads behind it.
  if (!state.reviews) state.reviews = store.get('reviewsCache', null)
  const stale = !state.reviews || state.reviews.repo !== state.repo || Date.now() - state.reviews.at >= 120000
  if (stale) {
    const p = loadReviews(true).then(() => state.tab === 'reviews' && renderView({ force: true }))
    if (!state.reviews) {
      p.catch((e) => state.tab === 'reviews' && clear(root).append(h('div', { class: 'empty' }, icon('alert', 28), h('div', null, e.message))))
      root.append(h('div', { class: 'skeleton-list' }, h('div', { class: 'skeleton-row' }, h('span', { class: 'bar' })), h('div', { class: 'skeleton-row' }, h('span', { class: 'bar' })), h('div', { class: 'skeleton-row' }, h('span', { class: 'bar' }))))
      return root
    }
    p.catch(() => {})
  }
  const data = state.reviews
  const filter = state.reviewFilter || 'all'
  const allRepos = !data.repoPath || store.get('reviewsAllRepos', false)
  const where = data.repoPath && h(
    'div',
    { class: 'segmented' },
    data.repoPath && h('button', { class: allRepos ? '' : 'on', title: `${data.repoHost}/${data.repoPath}`, onClick: () => (store.set('reviewsAllRepos', false), renderView({ force: true })) }, icon('branch', 11), data.repoPath.split('/').pop()),
    h('button', { class: allRepos ? 'on' : '', title: 'Every repository on GitHub and GitLab you are signed in to', onClick: () => (store.set('reviewsAllRepos', true), renderView({ force: true })) }, 'All repos')
  )
  const seg = h(
    'div',
    { class: 'segmented' },
    [
      ['all', 'All'],
      ['review', 'To review'],
      ['assigned', 'Assigned to me'],
      ['mine', 'Opened by me'],
      ['repo', 'All open']
    ].map(([k, l]) => h('button', { class: filter === k ? 'on' : '', onClick: () => ((state.reviewFilter = k), renderView({ force: true })) }, l))
  )
  root.append(
    h(
      'div',
      { class: 'history-bar' },
      where,
      seg,
      h('span', { class: 'grow' }),
      h('span', { class: 'dim', style: { fontSize: '11.5px' } }, `Updated ${ago(data.at / 1000)}`),
      h('button', { class: 'btn sm', onClick: async (e) => ((e.currentTarget.disabled = true), await loadReviews(true).catch((err) => toast(err.message, 'error')), renderView({ force: true })) }, icon('refresh', 12), 'Refresh')
    )
  )

  // hosts that are not connected yet
  for (const p of data.providers.filter((x) => !x.signedIn)) {
    const step = (name) => () =>
      request('reviews.setup', { host: p.host, step: name }, 30000).then(
        (r) => toast(r.ran ? `Running in a new terminal: ${r.command}\nFollow it there, then press Refresh.` : `Run this in a terminal, then press Refresh:\n${r.command}`, 'ok', 10000),
        (e) => toast(e.message, 'error')
      )
    root.append(
      h(
        'div',
        { class: 'card setup-card' },
        h('div', { class: 'row' }, icon('globe', 14), h('strong', null, `Connect ${p.host}`)),
        h('div', { class: 'dim' }, `See and approve its ${p.provider === 'github' ? 'pull' : 'merge'} requests here. Needs ${p.cli}, set up once.`),
        h(
          'div',
          { class: 'actions-wrap' },
          !p.installed && p.canInstall && h('button', { class: 'btn sm', onClick: step(`${p.cli}-install`) }, icon('download', 12), `1. Install ${p.cli}`),
          h('button', { class: 'btn sm', disabled: !p.installed, onClick: step(`${p.cli}-login`) }, icon('user', 12), `${p.installed ? '' : '2. '}Sign in`),
          h('button', { class: 'btn sm', onClick: async () => (await loadReviews(true).catch((e) => toast(e.message, 'error')), renderView({ force: true })) }, icon('refresh', 12), 'Check again')
        )
      )
    )
  }
  for (const e of data.errors || []) root.append(h('div', { class: 'banner' }, h('div', { class: 'row' }, icon('alert'), h('span', null, e))))

  // "All" = everything that involves me; "All open" = every open one in this repository.
  // By default only this repository's (same host and project as its remote); "All repos" widens it.
  const items = data.items.filter((it) => (filter === 'all' ? it.roles.some((r) => r !== 'repo') : it.roles.includes(filter)) && (allRepos || inThisRepo(it, data)))
  root.append(h('div', { class: 'section-head' }, filter === 'assigned' ? 'Assigned to you' : filter === 'review' ? 'Waiting for your review' : 'Open for you', h('span', { class: 'count' }, items.length)))
  if (!items.length) root.append(h('div', { class: 'empty' }, icon('check', 28), h('div', null, allRepos ? 'Nothing waiting for you' : `Nothing here for ${data.repoPath.split('/').pop()}`), !allRepos && h('button', { class: 'btn sm', style: { marginTop: '10px' }, onClick: () => (store.set('reviewsAllRepos', true), renderView({ force: true })) }, 'Show all repos')))
  for (const it of items) root.append(reviewRow(it))
  return root
}

function reviewRow(it) {
  const own = it.roles.length > 0 && it.roles.every((r) => r === 'mine' || r === 'repo') && it.roles.includes('mine') // your own MR: nothing to approve
  const open = () => openLink(it.url)
  const noun = it.provider === 'github' ? 'pull request' : 'merge request'
  return h(
    'div',
    { class: 'review-row', onDblclick: open },
    h('span', { class: 'review-icon' }, icon('merge', 15)),
    h(
      'div',
      { class: 'grow', style: { minWidth: 0 } },
      h(
        'div',
        { class: 'review-title' },
        h('span', { class: 'ellipsis', title: it.title }, it.title),
        it.draft && h('span', { class: 'pill' }, 'Draft'),
        it.roles.includes('review') && h('span', { class: 'pill role-review' }, 'Review requested'),
        it.roles.includes('assigned') && h('span', { class: 'pill role-assigned' }, 'Assigned'),
        it.roles.includes('mine') && h('span', { class: 'pill role-mine' }, 'Mine'),
        it.ci && h('span', { class: `ci ci-${it.ci}`, title: `CI: ${it.ci}` }, ciIcon(it.ci), it.ci)
      ),
      h(
        'div',
        { class: 'review-meta' },
        h('span', { class: 'mono' }, `${it.repo} ${it.provider === 'github' ? '#' : '!'}${it.number}`),
        ` · ${it.author} · ${ago(it.updated)}`,
        it.source && [' · ', h('span', { class: 'mono' }, `${it.source} → ${it.target}`)]
      )
    ),
    h(
      'div',
      { class: 'review-actions' },
      h('button', { class: 'btn sm', title: `Open the ${noun} in the browser`, onClick: open }, icon('open', 12), 'Open'),
      h('button', { class: 'btn sm', title: 'See the changes and comment on lines', onClick: () => reviewDiffSheet(it) }, icon('file', 12), 'Diff'),
      h('button', { class: 'btn sm', title: 'Review it with AI, then post', onClick: () => aiReviewModal(it) }, icon('sparkle', 12), 'AI review'),
      !own && h('button', { class: 'btn sm', onClick: () => reviewDialog(it) }, icon('edit', 12), 'Review…'),
      !own && h(
        'button',
        {
          class: 'btn sm primary',
          onClick: async (e) => {
            const b = e.currentTarget // gone after the await
            if (!(await confirmBox(`Approve this ${noun}?`, `${it.repo} ${it.provider === 'github' ? '#' : '!'}${it.number}\n${it.title}`, 'Approve'))) return
            await actOnReview(it, 'approve', '', b)
          }
        },
        icon('check', 12),
        'Approve'
      )
    )
  )
}

async function actOnReview(it, action, body, btn) {
  const label = btn ? [...btn.childNodes] : null
  if (btn) {
    btn.disabled = true
    clear(btn).append(h('span', { class: 'spinner' }), 'Sending…')
  }
  try {
    await request('reviews.act', { ...it, ci: undefined, action, body }, 90000)
    toast({ approve: 'Approved', changes: 'Changes requested', comment: 'Comment posted' }[action] + `: ${it.title}`)
    if (action === 'approve' || action === 'changes') {
      await loadReviews(true).catch(() => {})
      if (state.tab === 'reviews') renderView({ force: true })
    }
    return true
  } catch (e) {
    toast(e.message, 'error')
    if (btn) {
      btn.disabled = false
      clear(btn).append(...label)
    }
    return false
  }
}


/** AI review of a pull/merge request: generate, edit, then post as comment, request changes or approve. */
async function aiReviewModal(it) {
  closeOverlays()
  const noun = it.provider === 'github' ? 'pull request' : 'merge request'
  const prefs = store.get('aiReviewPrefs', { instructions: '' })
  let agents = [
    { id: 'claude', name: 'Claude Code', available: true },
    { id: 'codex', name: 'Codex', available: true }
  ]
  let agent = 'claude'
  let gen = 0
  let busy = false
  let verdict = 'comment'

  const agentSel = h('select', { onChange: () => request('ai.settings', { agent: agentSel.value }).catch(() => {}) })
  const fillAgents = () => {
    clear(agentSel)
    for (const a of agents) agentSel.append(h('option', { value: a.id, selected: a.id === agent, disabled: !a.available }, a.available ? a.name : `${a.name} (not installed)`))
  }
  fillAgents()
  request('ai.settings', {}, 20000)
    .then((r) => ((agents = r.agents), (agent = r.agent), fillAgents()))
    .catch(() => {})
  const instructions = h('textarea', { rows: 2, placeholder: 'Optional, e.g. "Write in Thai", "Focus on security", "We use React Query"' })
  instructions.value = prefs.instructions || ''
  const result = h('textarea', { class: 'ai-result', rows: 12, placeholder: 'The review appears here. Edit it before posting.' })
  const status = h('div', { class: 'ai-status' })
  const verdictEl = h('span', { class: 'pill' })
  const genBtn = h('button', { type: 'button', class: 'btn', onClick: () => generate() })
  const postBtns = {
    comment: h('button', { type: 'button', class: 'btn', onClick: () => post('comment') }, icon('edit', 13), 'Comment'),
    changes: h('button', { type: 'button', class: 'btn danger', onClick: () => post('changes') }, icon('x', 13), 'Request changes'),
    approve: h('button', { type: 'button', class: 'btn', onClick: () => post('approve') }, icon('check', 13), 'Approve')
  }
  let stopTick = () => {}
  const sync = (on, text) => {
    busy = on
    result.classList.toggle('generating', on)
    result.readOnly = on
    stopTick()
    if (on) stopTick = aiTicker(status, agents.find((a) => a.id === agentSel.value)?.name || 'AI', `the ${noun}`)
    else append(clear(status), [text || ''])
    append(clear(genBtn), [on ? [icon('x', 13), 'Stop'] : [icon('sparkle', 13), result.value.trim() ? 'Review again' : 'Start review']])
    genBtn.className = `btn ${!on && !result.value.trim() ? 'primary' : ''}`
    const has = !on && !!result.value.trim()
    for (const [k, b] of Object.entries(postBtns)) {
      b.disabled = !has
      b.classList.toggle('primary', has && k === verdict)
    }
    verdictEl.className = `pill verdict-${verdict}`
    verdictEl.textContent = has ? `AI suggests: ${{ approve: 'Approve', changes: 'Request changes', comment: 'Comment' }[verdict]}` : ''
  }
  result.addEventListener('input', () => sync(false, status.textContent))

  async function generate() {
    if (busy) {
      gen++
      return sync(false, 'Stopped.')
    }
    const my = ++gen
    store.set('aiReviewPrefs', { instructions: instructions.value })
    const name = agents.find((a) => a.id === agentSel.value)?.name || 'AI'
    sync(true, `${name} is reading the ${noun}…`)
    const started = Date.now()
    try {
      const r = await request('ai.review', { ...it, ci: undefined, agent: agentSel.value, instructions: instructions.value }, 118000)
      if (my !== gen) return
      result.value = r.review
      verdict = r.verdict
      sync(false, `Reviewed by ${name} in ${((Date.now() - started) / 1000).toFixed(1)}s. Check it before posting: it is posted under your name.`)
    } catch (e) {
      if (my !== gen) return
      sync(false, '')
      clear(status).append(h('span', { class: 'ai-error' }, icon('alert', 12), e.message))
    }
  }
  async function post(action) {
    const text = result.value.trim()
    if (!text) return
    const label = { approve: 'Approve', changes: 'Request changes', comment: 'Comment' }[action]
    if (!(await confirmBox(`${label} with this review?`, `${it.repo} ${it.provider === 'github' ? '#' : '!'}${it.number}\nThe review is posted on ${it.host} under your name.`, label, action === 'changes'))) return
    const b = postBtns[action]
    b.disabled = true
    if (await actOnReview(it, action, text)) close()
    else b.disabled = false
  }
  const close = () => {
    gen++
    overlay.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (e) => e.key === 'Escape' && !busy && isTopOverlay(overlay) && close()

  const box = h(
    'div',
    { class: 'dialog ai-dialog ai-review-dialog', role: 'dialog' },
    h('div', { class: 'ai-title' }, h('span', { class: 'ai-badge' }, icon('sparkle', 14)), h('div', null, h('h3', null, 'AI review'), h('p', null, `${it.repo} ${it.provider === 'github' ? '#' : '!'}${it.number} · ${it.title}`))),
    h('div', { class: 'ai-row' }, h('div', { class: 'field grow' }, h('label', null, 'Agent'), agentSel)),
    h('div', { class: 'field' }, h('label', null, 'Instructions'), instructions),
    h('div', { class: 'field' }, h('label', { class: 'row' }, 'Review', h('span', { class: 'grow' }), verdictEl), aiWrap(result)),
    status,
    h('div', { class: 'buttons' }, h('button', { type: 'button', class: 'btn', onClick: close }, 'Cancel'), h('span', { class: 'grow' }), genBtn, postBtns.comment, postBtns.changes, postBtns.approve)
  )
  const overlay = h('div', { class: 'overlay', onMousedown: (e) => e.target === overlay && !busy && close() }, box)
  mountOverlay(overlay, close)
  document.addEventListener('keydown', onKey)
  sync(false, 'Choose the agent, add instructions if you like, then press Start review.')
  genBtn.focus() // choose the agent and add instructions first, then Start review
}

async function reviewDialog(it) {
  const noun = it.provider === 'github' ? 'pull request' : 'merge request'
  const r = await dialog({
    title: `Review: ${it.title}`,
    message: `${it.repo} ${it.provider === 'github' ? '#' : '!'}${it.number} by ${it.author}`,
    fields: [
      {
        key: 'action',
        label: 'Your review',
        type: 'select',
        value: 'approve',
        options: [
          ['approve', 'Approve'],
          ['changes', 'Request changes'],
          ['comment', 'Comment only']
        ]
      },
      { key: 'body', label: 'Comment (needed for Request changes and Comment)', type: 'textarea', placeholder: `Feedback on this ${noun}` }
    ],
    ok: 'Submit review'
  })
  if (!r) return
  if (r.action !== 'approve' && !r.body.trim()) return toast('Write a comment for this kind of review', 'error')
  await actOnReview(it, r.action, r.body)
}


/* =========================================================================
   CI status, undo, branch clean-up, conflict resolver, review diffs
   ========================================================================= */
const ciIcon = (st) => icon(st === 'passed' ? 'check' : st === 'failed' ? 'x' : st === 'running' || st === 'pending' ? 'refresh' : 'minus', 11)
/* =========================================================================
   Pipelines: GitHub Actions runs / GitLab pipelines, their jobs and logs
   ========================================================================= */

const PIPE_LABEL = { passed: 'Passed', failed: 'Failed', running: 'Running', pending: 'Pending', canceled: 'Canceled', manual: 'Manual' }
const dur = (s) => (s == null ? '' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`)
const pipeBadge = (st) => h('span', { class: `ci ci-${st} pipe-state` }, ciIcon(st), PIPE_LABEL[st] || st)

/** Open the pipeline sheet: the list for the branch, or straight into one pipeline. */
async function openPipelines({ branch, sha, openId } = {}) {
  const body = h('div', { class: 'pipes' }, h('div', { class: 'inline-skeleton' }, h('span'), h('span'), h('span')))
  openSheet(`Pipelines · ${branch || state.status?.branch || 'HEAD'}`, body)
  const sheet = state.sheets[state.sheets.length - 1]
  sheet.el.classList.add('wide-sheet')
  let timer = null
  const alive = () => state.sheets.includes(sheet) && document.body.contains(sheet.el)
  const later = (fn, ms) => {
    clearTimeout(timer)
    timer = setTimeout(() => alive() && fn(), ms)
  }

  async function showList() {
    let data
    try {
      data = await call('pipelines', { branch, sha })
    } catch (e) {
      return append(clear(body), [h('div', { class: 'empty' }, icon('alert', 28), h('div', null, e.message))])
    }
    if (!alive()) return
    if (openId) {
      const it = data.items.find((x) => String(x.id) === String(openId))
      openId = null
      if (it) return showPipeline(it, data)
    }
    append(clear(body), [
      h('div', { class: 'history-bar' }, h('span', { class: 'dim' }, `${data.items.length} recent on ${data.branch || 'all branches'}`), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onClick: () => openLink(data.web) }, icon('open', 12), 'Open in browser'), h('button', { class: 'btn sm', onClick: showList }, icon('refresh', 12), 'Refresh')),
      data.items.length
        ? h(
            'div',
            { class: 'pipe-list' },
            data.items.map((p) =>
              h(
                'button',
                { class: `pipe-row s-${p.state}`, onClick: () => showPipeline(p, data) },
                pipeBadge(p.state),
                h('div', { class: 'pipe-main' }, h('div', { class: 'pipe-title' }, h('b', null, p.name), p.title && h('span', { class: 'dim' }, p.title)), h('div', { class: 'dim pipe-meta' }, [p.branch, p.sha?.slice(0, 7), p.by && `@${p.by}`, p.event, ago(p.at)].filter(Boolean).join(' · '))),
                h('span', { class: 'dim mono' }, dur(p.duration)),
                icon('right', 13)
              )
            )
          )
        : h('div', { class: 'empty' }, icon('commit', 28), h('div', null, 'No pipelines for this branch yet'))
    ])
    if (data.items.some((p) => p.state === 'running' || p.state === 'pending')) later(showList, 10000)
  }

  async function showPipeline(p, data) {
    append(clear(body), [h('div', { class: 'inline-skeleton' }, h('span'), h('span'), h('span'))])
    let jobs
    try {
      jobs = await call('pipelineJobs', { id: p.id })
    } catch (e) {
      return append(clear(body), [h('div', { class: 'empty' }, icon('alert', 28), h('div', null, e.message))])
    }
    if (!alive()) return
    // every action shows it is working on its own button, then reloads the pipeline
    const act = async (action, label, extra = {}, btn) => {
      const was = btn ? [...btn.childNodes] : null
      if (btn) {
        btn.disabled = true
        append(clear(btn), [h('span', { class: 'spinner' }), 'Sending…'])
      }
      try {
        await call('pipelineAct', { id: p.id, action, ...extra })
        toast(`${label}. The pipeline updates here as it runs.`)
        p = { ...p, state: action === 'cancel' ? 'canceled' : 'pending' }
        later(() => showPipeline(p, data), 1200)
      } catch (e) {
        toast(e.message, 'error')
        if (btn) {
          btn.disabled = false
          append(clear(btn), was)
        }
      }
    }
    const running = p.state === 'running' || p.state === 'pending'
    const failed = jobs.filter((j) => j.state === 'failed')
    const stages = [...new Set(jobs.map((j) => j.stage))]
    append(clear(body), [
      h(
        'div',
        { class: 'history-bar' },
        h('button', { class: 'crumb', onClick: showList }, 'Pipelines'),
        icon('right', 12),
        pipeBadge(p.state),
        h('b', null, p.name),
        h('span', { class: 'dim' }, [p.sha?.slice(0, 7), dur(p.duration)].filter(Boolean).join(' · ')),
        h('span', { class: 'grow' }),
        failed.length > 0 && h('button', { class: 'btn sm', onClick: (e) => act('retryFailed', 'Retrying the failed jobs', {}, e.currentTarget) }, icon('refresh', 12), 'Retry failed'),
        !running && h('button', { class: 'btn sm', onClick: (e) => act('retry', 'Pipeline restarted', {}, e.currentTarget) }, icon('refresh', 12), 'Retry all'),
        running && h('button', { class: 'btn sm danger', onClick: async (e) => (await confirmBox(`Cancel pipeline ${p.name}?`, 'Running jobs are stopped.', 'Cancel pipeline', true)) && act('cancel', 'Pipeline canceled', {}, e.currentTarget) }, icon('x', 12), 'Cancel'),
        h('button', { class: 'btn sm', onClick: () => openLink(p.url) }, icon('open', 12), 'Open')
      ),
      failed.length > 0 &&
        h(
          'div',
          { class: 'pipe-failed' },
          icon('alert', 15),
          h('div', { class: 'grow' }, h('b', null, `${plural(failed.length, 'job')} failed`), h('div', { class: 'dim' }, failed.map((j) => j.name).join(', '))),
          h('button', { class: 'btn sm primary', onClick: () => showLog(p, failed[0], data) }, 'Show the error')
        ),
      h(
        'div',
        { class: 'pipe-stages' },
        stages.map((st) =>
          h(
            'div',
            { class: 'pipe-stage' },
            h('div', { class: 'section-head' }, st),
            jobs
              .filter((j) => j.stage === st)
              .map((j) =>
                h(
                  'div',
                  { class: `pipe-job s-${j.state}`, role: 'button', tabindex: 0, onClick: () => showLog(p, j, data), onKeydown: (e) => e.key === 'Enter' && showLog(p, j, data) },
                  h('span', { class: `ci ci-${j.state} pipe-dot`, title: PIPE_LABEL[j.state] || j.state }, ciIcon(j.state)),
                  h('span', { class: 'pipe-job-name' }, j.name, j.allowFailure && h('span', { class: 'dim' }, ' (allowed to fail)')),
                  h('span', { class: 'dim mono' }, dur(j.duration)),
                  j.state === 'failed' && h('button', { class: 'icon-btn', title: 'Retry this job', onClick: (e) => (e.stopPropagation(), act('retryJob', `Retrying ${j.name}`, { job: j.id }, e.currentTarget)) }, icon('refresh', 12))
                )
              )
          )
        )
      ),
      !jobs.length && h('div', { class: 'empty' }, 'No jobs')
    ])
    if (running) later(() => showPipeline(p, data), 10000)
  }

  async function showLog(p, j, data) {
    append(clear(body), [h('div', { class: 'inline-skeleton' }, h('span'), h('span'), h('span'))])
    let r
    try {
      r = await call('jobLog', { id: j.id })
    } catch (e) {
      return append(clear(body), [h('div', { class: 'history-bar' }, h('button', { class: 'btn sm', onClick: () => showPipeline(p, data) }, icon('left', 12), p.name)), h('div', { class: 'empty' }, icon('alert', 28), h('div', null, e.message))])
    }
    if (!alive()) return
    const BAD = /(##\[error\]|\berror\b|\bfailed\b|\bfailure\b|exception|✗|✖|ERR!|FATAL|exit code [1-9])/i
    const lines = r.log.split('\n')
    let firstBad = -1
    const pre = h('div', { class: 'pipe-log' })
    const frag = document.createDocumentFragment()
    lines.forEach((ln, i) => {
      const bad = BAD.test(ln)
      if (bad && firstBad < 0) firstBad = i
      frag.append(h('div', { class: `pl ${bad ? 'bad' : ''}` }, h('span', { class: 'pl-n' }, String(i + 1)), h('span', { class: 'pl-t' }, ln.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /, ''))))
    })
    pre.append(frag)
    const errors = lines.filter((l) => BAD.test(l)).length
    // step through the error lines (n / total), or show only them; find any text; wrap long lines
    const bads = () => [...pre.querySelectorAll('.pl.bad:not(.hide)')]
    let at = -1
    const counter = h('span', { class: 'dim mono pl-counter' }, errors ? `${errors}` : '')
    const goErr = (d) => {
      const list = bads()
      if (!list.length) return
      at = (at + d + list.length) % list.length
      pre.querySelector('.pl.cur')?.classList.remove('cur')
      list[at].classList.add('cur')
      list[at].scrollIntoView({ block: 'center' })
      counter.textContent = `${at + 1} / ${list.length}`
    }
    const onlyErr = h('input', { type: 'checkbox' })
    onlyErr.addEventListener('change', () => {
      pre.classList.toggle('only-bad', onlyErr.checked)
      store.set('pipeOnlyErrors', onlyErr.checked)
    })
    const wrap = h('input', { type: 'checkbox', checked: store.get('pipeWrap', true) })
    pre.classList.toggle('wrap', wrap.checked)
    wrap.addEventListener('change', () => (pre.classList.toggle('wrap', wrap.checked), store.set('pipeWrap', wrap.checked)))
    let findT = null
    const find = h('input', { type: 'text', class: 'pl-find', placeholder: 'Find in log…', spellcheck: 'false' })
    const found = h('span', { class: 'dim mono' })
    find.addEventListener('input', () => {
      clearTimeout(findT)
      findT = setTimeout(() => {
        const q = find.value.trim().toLowerCase()
        let n = 0
        let first = null
        for (const row of pre.children) {
          const hit = q && row.lastChild.textContent.toLowerCase().includes(q)
          row.classList.toggle('hit', !!hit)
          if (hit && !n++) first = row
        }
        found.textContent = q ? (n ? plural(n, 'line') : 'no match') : ''
        first?.scrollIntoView({ block: 'center' })
      }, 200)
    })
    find.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      const hits = [...pre.querySelectorAll('.pl.hit')]
      if (!hits.length) return
      const cur = hits.findIndex((x) => x.classList.contains('cur'))
      pre.querySelector('.pl.cur')?.classList.remove('cur')
      const next = hits[(cur + (e.shiftKey ? -1 : 1) + hits.length) % hits.length]
      next.classList.add('cur')
      next.scrollIntoView({ block: 'center' })
    })
    const live = j.state === 'running' || j.state === 'pending'
    append(clear(body), [
      h(
        'div',
        { class: 'history-bar pipe-crumbs' },
        h('button', { class: 'crumb', onClick: showList }, 'Pipelines'),
        icon('right', 12),
        h('button', { class: 'crumb', onClick: () => showPipeline(p, data) }, p.name),
        icon('right', 12),
        pipeBadge(j.state),
        h('b', null, j.name),
        live && h('span', { class: 'pl-live' }, h('i'), 'live'),
        h('span', { class: 'grow' }),
        j.state === 'failed' && h('button', { class: 'btn sm', onClick: async (e) => { const b = e.currentTarget; b.disabled = true; append(clear(b), [h('span', { class: 'spinner' }), 'Sending…']); try { await call('pipelineAct', { id: p.id, action: 'retryJob', job: j.id }); toast(`Retrying ${j.name}`); later(() => showPipeline({ ...p, state: 'pending' }, data), 1200) } catch (err) { toast(err.message, 'error'); b.disabled = false; append(clear(b), [icon('refresh', 12), 'Retry job']) } } }, icon('refresh', 12), 'Retry job'),
        false && h('button', { class: 'btn sm', title: 'Jump to the first error line', onClick: () => pre.querySelector('.pl.bad')?.scrollIntoView({ block: 'center' }) }, icon('alert', 12), `${errors} error line${errors > 1 ? 's' : ''}`),
        h('button', { class: 'btn sm', onClick: () => copy(r.log).then(() => toast('Log copied')) }, icon('copy', 12), 'Copy log'),
        h('button', { class: 'btn sm', onClick: () => openLink(j.url) }, icon('open', 12), 'Open')
      ),
      h(
        'div',
        { class: 'pipe-logbar' },
        errors > 0
          ? h('div', { class: 'pl-errnav' }, icon('alert', 13), h('b', null, plural(errors, 'error line')), h('button', { class: 'icon-btn', title: 'Previous error', onClick: () => goErr(-1) }, icon('left', 13)), counter, h('button', { class: 'icon-btn', title: 'Next error', onClick: () => goErr(1) }, icon('right', 13)), h('label', { class: 'check' }, onlyErr, 'Errors only'))
          : h('div', { class: 'pl-errnav ok' }, icon('check', 13), live ? 'No errors so far' : 'No error lines found'),
        h('span', { class: 'grow' }),
        find,
        found,
        h('label', { class: 'check' }, wrap, 'Wrap')
      ),
      r.truncated && h('div', { class: 'dim pipe-note' }, 'Showing the last part of a long log.'),
      pre
    ])
    if (store.get('pipeOnlyErrors', false) && errors) (onlyErr.checked = true), pre.classList.add('only-bad')
    // a running job: follow its log (stays at the bottom unless scrolled up)
    if (live) {
      const stick = () => pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 40
      later(async () => {
        const wasBottom = stick()
        const keep = pre.scrollTop
        await showLog(p, { ...j }, data)
        const np = body.querySelector('.pipe-log')
        if (np && !wasBottom) np.scrollTop = keep
      }, 5000)
    }
    // show where it went wrong: the first error line, else the end
    requestAnimationFrame(() => (firstBad >= 0 && !live ? goErr(1) : (pre.scrollTop = pre.scrollHeight)))
  }

  showList()
}

function ciBadge() {
  const ci = state.ci
  if (!ci || !ci.state || ci.sha !== state.status?.oid) return null
  const label = { passed: 'CI passed', failed: 'CI failed', running: 'CI running', canceled: 'CI canceled' }[ci.state]
  return h('button', { class: `ci ci-${ci.state}`, title: `${label} for ${ci.sha.slice(0, 7)}. Click to see the pipeline.`, onClick: () => openPipelines({ sha: ci.sha }) }, ciIcon(ci.state), label)
}
let ciLoading = false
async function loadCi() {
  if (ciLoading || !state.repo || !state.status?.oid || !isShown()) return
  if (state.ci?.sha === state.status.oid && Date.now() - state.ci.at < (state.ci.state === 'running' ? 30000 : 120000)) return
  ciLoading = true
  const repo = state.repo
  try {
    const r = await request('git', { op: 'ciStatus', repo, args: {} }, 40000)
    if (repo !== state.repo) return
    state.ci = { ...r, at: Date.now() }
    renderHeader()
  } catch {
  } finally {
    ciLoading = false
  }
}
setInterval(loadCi, 15000)
// The Review & MR count: fetched in the background (soon after opening, on a repo switch, then every
// 3 minutes) so the tab shows how many wait for you without opening it.
let reviewsPolledFor = null
function pollReviews() {
  if (!state.repo || !isShown() || reviewsLoading) return
  const fresh = state.reviews && state.reviews.repo === state.repo && Date.now() - state.reviews.at < 170000
  if (fresh && reviewsPolledFor === state.repo) return
  reviewsPolledFor = state.repo
  loadReviews(true)
    .then(() => state.tab === 'reviews' && renderView({ force: true }))
    .catch(() => {})
}
setTimeout(pollReviews, 4000)
setInterval(() => ((reviewsPolledFor = state.reviews?.repo === state.repo && Date.now() - (state.reviews?.at || 0) < 170000 ? state.repo : null), pollReviews()), 15000)

async function undoLast() {
  let u
  try {
    u = await call('undoInfo')
  } catch (e) {
    return toast(e.message, 'error')
  }
  if (u.blocked) return toast(u.blocked, 'error')
  const keep = u.mode === 'soft' ? 'Its changes stay staged, ready to commit again.' : u.mode === 'switch' ? '' : 'Uncommitted changes are kept.'
  const what = u.description || `The branch goes back to ${u.to.slice(0, 7)}. ${keep}`
  if (!(await confirmBox('Undo the last action?', `${u.what}\n${ago(u.at)}\n\n${what}\nThe Reflog tab can take you forward again.`, 'Undo'))) return
  state.history.stale = true
  run('undoLast', {}, { success: `Undone: ${u.what.split(':')[0]}` })
}

async function cleanupBranches() {
  let c
  try {
    c = await call('branchCleanup')
  } catch (e) {
    return toast(e.message, 'error')
  }
  const rows = [...c.gone.map((n) => ({ name: n, why: 'deleted on the server', force: true })), ...c.merged.filter((n) => !c.gone.includes(n)).map((n) => ({ name: n, why: `merged into ${c.base}` }))]
  if (!rows.length) return toast(`No merged or gone branches (compared with ${c.base}).`)
  closeOverlays()
  const checks = rows.map((r) => ({ ...r, box: h('input', { type: 'checkbox', checked: true }) }))
  const close = () => {
    overlay.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (e) => e.key === 'Escape' && isTopOverlay(overlay) && close()
  const box = h(
    'div',
    { class: 'dialog', role: 'dialog' },
    h('h3', null, 'Clean up branches'),
    h('p', null, `Local branches already merged into ${c.base}, or whose remote branch was deleted. Their commits stay reachable in the Reflog for a while.`),
    h('div', { class: 'cleanup-list' }, checks.map((r) => h('label', { class: 'check cleanup-row' }, r.box, h('span', { class: 'mono grow ellipsis' }, r.name), h('span', { class: `pill ${r.force ? 'role-review' : ''}` }, r.why)))),
    h(
      'div',
      { class: 'buttons' },
      h('button', { type: 'button', class: 'btn', onClick: close }, 'Cancel'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn danger solid',
          onClick: async () => {
            const pick = checks.filter((r) => r.box.checked)
            if (!pick.length) return close()
            close()
            const res = await run('branchDeleteMany', { names: pick.map((r) => r.name), force: pick.filter((r) => r.force).map((r) => r.name) }, { quiet: true })
            if (res) {
              const bad = res.filter((x) => !x.ok)
              toast(bad.length ? `Deleted ${res.length - bad.length}; kept ${bad.map((b) => b.name).join(', ')}:\n${bad[0].error}` : `Deleted ${res.length} branch${res.length > 1 ? 'es' : ''}`, bad.length ? 'error' : 'ok')
            }
          }
        },
        icon('trash', 13),
        'Delete selected'
      )
    )
  )
  const overlay = h('div', { class: 'overlay', onMousedown: (e) => e.target === overlay && close() }, box)
  mountOverlay(overlay, close)
  document.addEventListener('keydown', onKey)
}

/** Resolve a conflicted file block by block: ours, theirs or both, then save and mark resolved. */
async function resolveConflict(file) {
  let text
  try {
    text = await call('readWorkFile', { file })
  } catch (e) {
    return toast(e.message, 'error')
  }
  const eolStr = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const parts = [] // strings and conflict blocks
  let buf = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('<<<<<<<')) {
      parts.push(buf.join(eolStr))
      buf = []
      const block = { ours: [], base: [], theirs: [], oursLabel: lines[i].slice(8).trim(), theirsLabel: '', choice: null }
      let where = 'ours'
      for (i++; i < lines.length; i++) {
        const l = lines[i]
        if (l.startsWith('|||||||')) where = 'base'
        else if (l.startsWith('=======')) where = 'theirs'
        else if (l.startsWith('>>>>>>>')) {
          block.theirsLabel = l.slice(8).trim()
          break
        } else block[where].push(l)
      }
      parts.push(block)
    } else buf.push(lines[i])
  }
  parts.push(buf.join(eolStr))
  const blocks = parts.filter((x) => typeof x === 'object')
  if (!blocks.length) {
    if (await confirmBox('No conflict markers left', `${file} has no conflict markers. Mark it as resolved?`, 'Mark resolved')) run('stage', { files: [file] }, { success: 'Marked resolved' })
    return
  }
  const body = h('div', { class: 'resolver' })
  const saveBtn = h('button', { class: 'btn sm primary', disabled: true, onClick: save }, icon('check', 12), 'Save & mark resolved')
  const progress = h('span', { class: 'dim' })
  const update = () => {
    const done = blocks.filter((b) => b.choice).length
    progress.textContent = `${done} of ${blocks.length} resolved`
    saveBtn.disabled = done !== blocks.length
  }
  blocks.forEach((b, n) => {
    const code = (ls, cls) => h('pre', { class: `res-code ${cls}` }, ls.join('\n') || ' ')
    const card = h('div', { class: 'res-block' })
    const pick = (choice) => {
      b.choice = choice
      card.querySelectorAll('.res-actions .btn').forEach((x) => x.classList.toggle('primary', x.dataset.c === choice))
      card.classList.add('done')
      update()
    }
    card.append(
      h('div', { class: 'res-head' }, h('strong', null, `Conflict ${n + 1}`), h('span', { class: 'grow' }), h('div', { class: 'res-actions' }, ...[['ours', 'Use mine'], ['theirs', 'Use theirs'], ['both', 'Use both']].map(([c, l]) => h('button', { class: 'btn sm', 'data-c': c, onClick: () => pick(c) }, l)))),
      h('div', { class: 'res-sides' }, h('div', null, h('div', { class: 'res-label' }, `Mine · ${b.oursLabel || 'HEAD'}`), code(b.ours, 'ours')), h('div', null, h('div', { class: 'res-label' }, `Theirs · ${b.theirsLabel || 'incoming'}`), code(b.theirs, 'theirs')))
    )
    body.append(card)
  })
  update()
  async function save() {
    const out = parts.map((x) => (typeof x === 'string' ? x : (x.choice === 'ours' ? x.ours : x.choice === 'theirs' ? x.theirs : [...x.ours, ...x.theirs]).join(eolStr))).join(eolStr)
    try {
      await call('writeWorkFile', { file, text: out, stage: true })
      toast(`${basename(file)} resolved`)
      closeSheet()
      refreshAll()
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  openSheet(`Resolve ${basename(file)}`, body, [progress, saveBtn])
}

/** A pull/merge request's diff; click a line to comment on it. */
async function reviewDiffSheet(it) {
  openSheet(`${it.repo} ${it.provider === 'github' ? '#' : '!'}${it.number} · ${it.title}`, h('div', { class: 'inline-skeleton', style: { margin: '12px' } }, h('span'), h('span'), h('span')), [
    h('button', { class: 'btn sm', onClick: () => aiReviewModal(it) }, icon('sparkle', 12), 'AI review'),
    h('button', { class: 'btn sm primary', onClick: () => reviewDialog(it) }, icon('edit', 12), 'Review…')
  ])
  const sheet = state.sheets[state.sheets.length - 1]
  sheet.el.classList.add('wide-sheet')
  let diff
  try {
    diff = (await request('reviews.diff', { ...it, ci: undefined }, 90000)).diff
  } catch (e) {
    closeSheet()
    return toast(e.message, 'error')
  }
  const wrap = renderDiff(diff, null, {
    onLine: async ({ path: file, side, line, text }) => {
      const r = await dialog({ title: `Comment on ${basename(file)}:${line}`, message: text.slice(0, 200), fields: [{ key: 'body', label: 'Comment', type: 'textarea' }], ok: 'Comment' })
      if (!r?.body.trim()) return
      try {
        await request('reviews.lineComment', { item: it, path: file, line, side, body: r.body }, 90000)
        toast('Comment posted')
      } catch (e) {
        toast(e.message, 'error')
      }
    }
  })
  if (sheet.el.isConnected) clear(sheet.el.querySelector('.sheet-body')).append(wrap)
}

// the status bar "reviews" item opens this tab on Reviews
if (hasOrca) {
  try {
    window.orca.plugin?.on?.('ui.show', ({ tab } = {}) => tab && isShown() && setTab(tab))
  } catch {}
  setTimeout(() => request('ui.pending', {}).then((p) => p?.tab && setTab(p.tab), () => {}), 800)
}


/* =========================================================================
   Phones and tablets (Orca's web client in a mobile browser)
   ========================================================================= */
// The branch sidebar becomes a drawer behind the ☰ button on narrow screens.
const setSide = (open) => document.body.classList.toggle('side-open', open)
$('#sideToggle')?.addEventListener('click', () => setSide(!document.body.classList.contains('side-open')))
$('#sideBackdrop')?.addEventListener('click', () => setSide(false))
document.addEventListener('click', (e) => {
  // picking something in the drawer closes it (but not opening its menus)
  if (e.target.closest?.('#side .side-item, #side .item') && !e.target.closest('.hover-actions, .icon-btn')) setSide(false)
})
// Long-press = right-click, so the commit, branch and file menus work by touch.
{
  let timer = null
  let start = null
  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY, target: e.target }
      clearTimeout(timer)
      timer = setTimeout(() => {
        start.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y }))
        start.fired = true
      }, 520)
    },
    { passive: true }
  )
  document.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0]
      if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) clearTimeout(timer)
    },
    { passive: true }
  )
  document.addEventListener('touchend', (e) => {
    clearTimeout(timer)
    if (start?.fired) e.preventDefault() // the long-press opened a menu: no click as well
    start = null
  })
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
let following = false
async function followFocus() {
  // A confirm or menu is about this repository, and so is a running operation: switching now
  // would send the action to another one.
  if (state.pinned || (IN_TAB && docRepo) || !isShown() || following || state.busy || document.querySelector('.overlay, .menu')) return
  following = true
  try {
    await followFocusOnce()
  } finally {
    following = false
  }
}
async function followFocusOnce() {
  const before = state.repo
  await resolveRepo()
  if (state.repo !== before) refreshAll()
}
// The Git Control tab tells the worker when it is shown or hidden, so switching to another workspace
// while on Git Control brings that workspace's Git Control to the front. A hidden tab may only shrink
// to nothing rather than become "hidden", so its size counts too.
if (IN_TAB) {
  let shown = null
  const report = () => {
    const now = document.visibilityState === 'visible' && window.innerWidth > 0 && window.innerHeight > 0
    if (now === shown) return
    const wasHidden = shown === false
    shown = now
    request('graph.visible', { visible: now }).catch(() => {})
    // back on screen after another project: one quiet check instead of polling while hidden
    if (now && wasHidden) pollStatus(true)
  }
  document.addEventListener('visibilitychange', report)
  new ResizeObserver(report).observe(document.documentElement)
  window.addEventListener('pagehide', () => request('graph.visible', { visible: false }).catch(() => {}))
  report()
}
window.addEventListener('focus', () => (state.pinned ? pollStatus() : followFocus().then(pollStatus)))
// workspace.changed may not fire for every switch, so also re-check the focused worktree now and then.
setInterval(() => followFocus(), 5000)
setInterval(pollStatus, 4000)
// back from another panel (e.g. a push in Orca's own Git view): look for changes at once
window.addEventListener('focus', () => pollStatus())
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && pollStatus())
/**
 * Light theme: Orca passes its colors as --orca-* variables, not a class. Read the background's
 * luminance and set html.light, again whenever Orca rewrites the variables (theme switch).
 */
function syncTheme() {
  const probe = h('div', { style: { position: 'absolute', visibility: 'hidden', background: 'var(--orca-background, var(--bg))' } })
  document.body.append(probe)
  const m = getComputedStyle(probe).backgroundColor.match(/[\d.]+/g)
  probe.remove()
  if (!m || (m.length > 3 && +m[3] === 0)) return
  const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const lum = 0.2126 * lin(+m[0]) + 0.7152 * lin(+m[1]) + 0.0722 * lin(+m[2])
  document.documentElement.classList.toggle('light', lum > 0.4)
}
syncTheme()
new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] })
new MutationObserver(syncTheme).observe(document.head, { childList: true, subtree: true, characterData: true })
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', syncTheme)

/* =========================================================================
   graph: row quick actions, date chip, keyboard, command palette
   ========================================================================= */
/** Buttons that appear on the hovered (or keyboard-selected) row; the full menu stays on right-click. */
function rowActions(c) {
  const act = (name, title, fn) => iconBtn(name, title, (e) => (e.stopPropagation(), fn(e)), { class: 'icon-btn ra-btn' })
  return h(
    'div',
    { class: 'row-actions', onClick: (e) => e.stopPropagation(), onContextmenu: (e) => e.stopPropagation() },
    act('commit', 'Checkout this commit', () => checkoutCommit(c.hash)),
    act('branch', 'New branch here', () => newBranch(c.hash)),
    act('copy', 'Copy hash', () => copy(c.hash)),
    act('more', 'More…', async (e) => {
      const anchor = e.currentTarget
      const full = { ...c, ...(await call('commitShow', { hash: c.hash }).catch(() => ({ message: c.subject || '' }))), refs: c.refs, parents: c.parents }
      commitMenu(anchor, full)
    })
  )
}

/** The day of the first visible row, pinned over the list while it scrolls ("Today", "Yesterday", "Nov 5"). */
function dayLabel(t) {
  const d = new Date(t * 1000)
  const today = new Date()
  const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: days < 7 ? 'short' : undefined, month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}
let dateTick = 0
function updateDateFloat() {
  const chip = document.getElementById('dateFloat')
  if (!chip || state.tab !== 'history') return
  const main = $('#main')
  const bar = main.querySelector('.history-bar')
  const topY = Math.max(bar ? bar.getBoundingClientRect().bottom : 0, main.getBoundingClientRect().top) + 2
  let first = null
  for (const r of main.querySelectorAll('.commit-row[data-time]')) {
    if (r.getBoundingClientRect().bottom > topY) {
      first = r
      break
    }
  }
  const show = first && main.scrollTop > ROW_H * 3
  chip.classList.toggle('on', !!show)
  if (show) chip.textContent = dayLabel(+first.dataset.time)
}
$('#main')?.addEventListener(
  'scroll',
  () => {
    if (dateTick) return
    dateTick = requestAnimationFrame(() => ((dateTick = 0), updateDateFloat()))
  },
  { passive: true }
)

/** ↑/↓ (or j/k) move through the graph; Enter opens; / searches; Esc closes. Ctrl+K: commands. */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
    if (!state.repo || document.querySelector('.overlay')) return
    e.preventDefault()
    return commandPalette()
  }
  if (!IN_TAB || state.tab !== 'history' || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.target.closest?.('input, textarea, select, [contenteditable], .overlay, .menu') || document.querySelector('.overlay, .menu')) return
  const H = state.history
  if (e.key === '/') {
    e.preventDefault()
    searchBox?.focus()
    return searchBox?.select()
  }
  const down = e.key === 'ArrowDown' || e.key === 'j'
  const up = e.key === 'ArrowUp' || e.key === 'k'
  if (down || up) {
    const rows = [...document.querySelectorAll('#main .commit-row[data-hash]')]
    if (!rows.length) return
    e.preventDefault()
    let cur = rows.findIndex((r) => r.classList.contains('kbd'))
    if (cur < 0) cur = rows.findIndex((r) => r.classList.contains('selected'))
    const next = rows[cur < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, cur + (down ? 1 : -1)))]
    rows.forEach((r) => r.classList.remove('kbd'))
    next.classList.add('kbd')
    next.scrollIntoView({ block: 'nearest' })
    // docked: the details follow the selection; inline: Enter opens it
    if (dockMode() && state.sheets.some((s) => s.dock)) {
      const c = H.commits.find((x) => x.hash === next.dataset.hash)
      if (c) openDock(c)
    }
    return
  }
  if (e.key === 'Enter') {
    const row = document.querySelector('#main .commit-row.kbd') || document.querySelector('#main .commit-row.selected')
    if (!row) return
    e.preventDefault()
    row.click()
    return
  }
  if (e.key === 'Escape' && !state.sheets.length && H.open) {
    document.querySelector('#main .commit-inline')?.remove()
    document.querySelector('#main .commit-row.selected')?.classList.remove('selected')
    H.open = null
  }
})
// the mouse takes over from the keyboard selection
document.addEventListener('mousemove', () => document.querySelector('#main .commit-row.kbd')?.classList.remove('kbd'), { passive: true })

/** Ctrl+K: type what to do (push, new branch, stash, a tab…) and press Enter. */
function commandPalette() {
  closeOverlays()
  const st = state.status || {}
  const cmds = [
    ['Fetch all', 'fetch', () => run('fetch', {}, { success: 'Fetched' })],
    [st.behind ? `Pull (${st.behind} waiting)` : 'Pull', 'pull', () => run('pull', {}, { success: 'Pulled' })],
    ['Pull with rebase', 'pull', () => run('pull', { rebase: true }, { success: 'Pulled with rebase' })],
    [st.ahead ? `Push (${st.ahead} waiting)` : 'Push', 'push', () => run('push', {}, { success: 'Pushed' })],
    ['Push with tags', 'tag', () => run('push', { tags: true }, { success: 'Pushed' })],
    ['Stash changes', 'stash', () => run('stashSave', { untracked: true }, { success: 'Stashed' }), !st.files?.length],
    ['Switch branch…', 'branch', () => quickSwitch($('.branch-chip') || $('#toolbar'))],
    ['New branch…', 'plus', () => newBranch(st.oid || 'HEAD')],
    ['Merge request…', 'pr', () => mergeRequestDialog()],
    ['Go to the checked-out commit', 'current', () => goToHead()],
    ['Search commits', 'search', () => (setTab('history'), setTimeout(() => searchBox?.focus(), 50))],
    ['Undo the last action', 'undo', () => undoLast()],
    ['Refresh', 'refresh', () => manualRefresh()],
    [ROW_H > 28 ? 'Compact rows' : 'Comfortable rows', 'rows', () => setDensity(ROW_H > 28 ? 'compact' : 'comfortable')],
    ['Keyboard shortcuts', 'keyboard', () => shortcutsHelp()],
    ...TABS.map(([id, label, ic]) => [`Go to ${label}`, ic, () => setTab(id)])
  ].filter((c) => !c[3])
  const input = h('input', { type: 'text', class: 'pal-input', placeholder: 'Type a command…', spellcheck: 'false' })
  const list = h('div', { class: 'pal-list', role: 'listbox' })
  let sel = 0
  let shown = cmds
  const done = () => {
    overlay.remove()
    document.removeEventListener('keydown', onKey, true)
  }
  const runCmd = (c) => {
    done()
    c?.[2]()
  }
  const draw = () => {
    const q = input.value.trim().toLowerCase()
    shown = q ? cmds.filter((c) => q.split(/\s+/).every((w) => c[0].toLowerCase().includes(w))) : cmds
    sel = Math.min(sel, Math.max(0, shown.length - 1))
    clear(list)
    shown.forEach((c, i) =>
      list.append(h('button', { type: 'button', class: `pal-item ${i === sel ? 'on' : ''}`, role: 'option', onMousemove: () => sel !== i && ((sel = i), draw()), onClick: () => runCmd(c) }, icon(c[1], 14), h('span', null, c[0])))
    )
    if (!shown.length) list.append(h('div', { class: 'pal-none' }, 'No matching command'))
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }
  const onKey = (e) => {
    if (!overlay.isConnected) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      done()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length)
      draw()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runCmd(shown[sel])
    }
  }
  input.addEventListener('input', () => ((sel = 0), draw()))
  const overlay = h('div', { class: 'overlay pal-overlay', onMousedown: (e) => e.target === overlay && done() }, h('div', { class: 'palette' }, input, list, h('div', { class: 'pal-foot' }, '↑↓ choose · Enter run · Esc close')))
  mountOverlay(overlay, done)
  document.addEventListener('keydown', onKey, true)
  draw()
  input.focus()
}

function shortcutsHelp() {
  const rows = [
    ['Ctrl+K', 'Commands'],
    ['/', 'Search commits'],
    ['↑ ↓ or j k', 'Move through the graph'],
    ['Enter', 'Open the commit'],
    ['Esc', 'Close'],
    ['F5 / Ctrl+R', 'Refresh']
  ]
  const box = h('div', { class: 'dialog kbd-dialog' }, h('h3', null, 'Keyboard shortcuts'), h('div', { class: 'kbd-help' }, rows.map(([k, v]) => [h('kbd', null, k), h('span', null, v)])), h('div', { class: 'buttons' }, h('button', { class: 'btn primary', onClick: () => done() }, 'Close')))
  const done = () => {
    overlay.remove()
    document.removeEventListener('keydown', onKey, true)
  }
  const onKey = (e) => e.key === 'Escape' && overlay.isConnected && (e.preventDefault(), e.stopPropagation(), done())
  const overlay = h('div', { class: 'overlay', onMousedown: (e) => e.target === overlay && done() }, box)
  mountOverlay(overlay, done)
  document.addEventListener('keydown', onKey, true)
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.sheets.length && !document.querySelector('.overlay, .menu')) closeSheet()
  if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) {
    e.preventDefault()
    manualRefresh()
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
