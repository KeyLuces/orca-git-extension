// Marketplace promo images: each screenshot from screenshots.mjs set in a 1440×900 poster with a short
// headline, in the cover's palette (dark night backdrop, blue and lavender, ivory text).
//   node promo.mjs <plugin folder>   (reads assets/screenshots/*.png, writes assets/promo/*.png)
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const PLUGIN = process.argv[2]
const SRC = path.join(PLUGIN, 'assets/screenshots')
const OUT = path.join(PLUGIN, 'assets/promo')
mkdirSync(OUT, { recursive: true })
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const slides = [
  { file: 'graph', cover: true, eyebrow: 'Commit graph', title: 'See every branch at a glance', body: 'Each branch keeps its own colour. Click a commit and its details open beside the graph; ↑ ↓ step through them.', points: ['Search messages, files, authors and tags as you type', 'Right-click any commit for checkout, merge, rebase or revert'] },
  { file: 'commit', eyebrow: 'Commit', title: 'Commit with the diff in view', body: 'Changed files on the left, the selected diff on the right. Stage whole files or single hunks.', points: ['AI message drafts the commit message', 'Nothing left to commit? The button becomes Push'] },
  { file: 'merge-request', eyebrow: 'Review & MR', title: 'Review merge requests without leaving Orca', body: 'Read the description, reviewers, approvals and comments, then approve, comment or request changes.', points: ['GitHub and GitLab', 'Uses the Git login you already have'] },
  { file: 'new-merge-request', eyebrow: 'New merge request', title: 'Open a merge request in one step', body: 'Title and description filled in like GitLab, reviewers picked from the project, the branch pushed for you.', points: ['Pick the direction: source → target', 'Create now, or open it in the browser'] },
  { file: 'pipeline', eyebrow: 'Pipelines', title: 'Go straight to what broke', body: 'Open a failed job and step through its error lines. Retry a job or the whole pipeline from here.', points: ['GitHub Actions and GitLab CI', 'Live logs while a job runs'] },
  { file: 'commands', eyebrow: 'Keyboard', title: 'Every action by name', body: 'Ctrl+K finds fetch, pull, push, stash, new branch or any tab. The graph moves with ↑ ↓, Enter and Esc.', points: ['Fetch, Pull and Push say what changed', 'Remembers where you left each project'] }
]

const icon = () => readFileSync(path.join(PLUGIN, 'assets/icon.png')).toString('base64')
const FEATS = [["Commit graph","Every branch in its own colour; click a commit to see its details beside it.","<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"6\" cy=\"5\" r=\"2.2\"/><circle cx=\"6\" cy=\"19\" r=\"2.2\"/><circle cx=\"18\" cy=\"9\" r=\"2.2\"/><path d=\"M6 7.2v9.6M18 11.2c0 4-6 3-11 6\"/></svg>"],["Commit & stage","Stage files or single hunks with the diff in view. AI drafts the message.","<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"3.5\"/><path d=\"M3 12h5.5M15.5 12H21\"/></svg>"],["Branches & tags","Checkout, merge, rebase, cherry-pick, revert and reset from a right-click.","<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 12 12 20l-8-8V4h8z\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.4\"/></svg>"],["Review & MR","Read merge requests like on GitHub or GitLab, then approve, comment or request changes.","<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"6\" cy=\"6\" r=\"2.2\"/><circle cx=\"6\" cy=\"18\" r=\"2.2\"/><circle cx=\"18\" cy=\"18\" r=\"2.2\"/><path d=\"M6 8.2v7.6M18 15.8V9a3 3 0 0 0-3-3h-4\"/><path d=\"m13 4-2 2 2 2\"/></svg>"],["Open a merge request","Title, description and reviewers filled in; the branch is pushed for you.","<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 5v14M5 12h14\"/></svg>"],["CI pipelines","See jobs by stage, jump to error lines, retry a job or the whole pipeline.","<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 6h10M4 12h16M4 18h7\"/><circle cx=\"18\" cy=\"6\" r=\"2\"/><circle cx=\"15\" cy=\"18\" r=\"2\"/></svg>"],["Fetch, Pull, Push","Counts of what waits, animated while running, with a note of what changed.","<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M7 4v13M3.5 13.5 7 17l3.5-3.5M17 20V7M13.5 10.5 17 7l3.5 3.5\"/></svg>"],["Stash, worktrees, undo","Stash, worktrees and reflog tabs. Undo the last commit, reset, merge or rebase.","<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10a6 6 0 0 1 0 12h-3\"/></svg>"]]
const cover = () => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1440px; height: 900px; overflow: hidden; }
  body { background: #0a0a0d; color: #efe9de; font-family: "Segoe UI", system-ui, sans-serif; position: relative; }
  .glow { position: absolute; left: 50%; top: -160px; width: 1200px; height: 560px; transform: translateX(-50%); background: radial-gradient(closest-side, rgba(143,176,240,.13), transparent); }
  .head { position: relative; padding-top: 70px; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .head img { width: 76px; height: 76px; border-radius: 19px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(0,0,0,.6); }
  h1 { font-size: 58px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.05; }
  h1 span { color: #8fb0f0; }
  .sub { margin-top: 16px; font-size: 20px; color: #a9a3b8; }
  .grid { position: absolute; left: 96px; right: 96px; top: 372px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
  .card { height: 200px; padding: 24px 22px; border-radius: 14px; background: #111116; border: 1px solid rgba(239,233,222,.08); }
  .card i { display: flex; width: 40px; height: 40px; border-radius: 10px; align-items: center; justify-content: center; background: rgba(143,176,240,.1); color: #8fb0f0; margin-bottom: 16px; }
  .card:nth-child(even) i { background: rgba(180,155,232,.12); color: #b49be8; }
  .card svg { width: 22px; height: 22px; }
  .card h3 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
  .card p { font-size: 14.5px; line-height: 1.5; color: #a9a3b8; }
  .foot { position: absolute; left: 0; right: 0; bottom: 44px; text-align: center; font-size: 15px; color: #7d7890; }
  .foot b { color: #d8d2e4; font-weight: 600; }
</style></head><body>
  <div class="glow"></div>
  <div class="head"><img src="data:image/png;base64,${icon()}"><h1>Git Control <span>for Orca</span></h1>
  <p class="sub">A full Git client inside Orca, for GitHub and GitLab, <b style="color:#b49be8">with AI</b>.</p></div>
  <div class="grid">${FEATS.map(([t, d, svg]) => `<div class="card"><i>${svg}</i><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
  <div class="foot"><b>AI</b> commit messages, MR reviews and conflict resolving &nbsp;·&nbsp; Uses the Git login you already have &nbsp;·&nbsp; <b>Ctrl+K</b> for every command &nbsp;·&nbsp; Light and dark themes</div>
</body></html>`


// The marketplace cover (assets/cover.jpg, 1600×1000): logo, name and the main features beside real screens.
const shot = (f) => readFileSync(path.join(SRC, f + '.png')).toString('base64')
const COVER_FEATS = ['AI writes commits, reviews MRs, resolves conflicts', 'Commit graph with every branch in colour', 'Checkout, merge, rebase from a right-click', 'Worktrees: each branch in its own folder', 'Review and open merge requests', 'GitHub and GitLab CI pipelines', 'Stage hunks, stash, undo anything']
const marketCover = () => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1600px; height: 1000px; overflow: hidden; }
  body { background: #0a0a0d; color: #efe9de; font-family: "Segoe UI", system-ui, sans-serif; position: relative; }
  .glow { position: absolute; left: 900px; top: 120px; width: 1000px; height: 800px; background: radial-gradient(closest-side, rgba(143,176,240,.14), transparent); }
  .text { position: absolute; left: 88px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; }
  .logo { width: 112px; height: 112px; border-radius: 26px; box-shadow: 0 16px 40px rgba(0,0,0,.6); margin-bottom: 34px; }
  h1 { font-size: 76px; font-weight: 650; letter-spacing: -0.025em; line-height: 1; }
  h1 span { display: block; color: #8fb0f0; font-size: 44px; margin-top: 10px; letter-spacing: -0.01em; }
  .sub { margin-top: 22px; font-size: 22px; line-height: 1.45; color: #a9a3b8; }
  ul { list-style: none; padding: 0; margin-top: 34px; display: flex; flex-direction: column; gap: 14px; }
  li { display: flex; gap: 14px; align-items: center; font-size: 20px; color: #d8d2e4; }
  li i { flex: none; width: 10px; height: 10px; border-radius: 50%; background: #8fb0f0; }
  li:nth-child(even) i { background: #b49be8; }
  li:first-child { color: #efe9de; font-weight: 600; }
  li:first-child i { background: linear-gradient(135deg, #8fb0f0, #b49be8); }
  .ai-badge { display: inline-block; align-self: flex-start; margin-top: 18px; padding: 7px 16px; border-radius: 999px; font-size: 20px; font-weight: 650; color: #fff; background: linear-gradient(135deg, #5b7fd6, #9b7be0); box-shadow: 0 8px 24px rgba(120, 110, 220, .35); }
  .win { position: absolute; border-radius: 14px; overflow: hidden; border: 1px solid rgba(239,233,222,.14); background: #0d0d10; box-shadow: 0 30px 90px rgba(0,0,0,.7); }
  .bar { height: 30px; display: flex; align-items: center; gap: 7px; padding: 0 12px; background: #16161b; border-bottom: 1px solid rgba(239,233,222,.07); }
  .bar b { width: 10px; height: 10px; border-radius: 50%; background: #3a3946; }
  .win img { display: block; width: 100%; }
  .w1 { left: 700px; top: 110px; width: 1020px; }
  .w2 { left: 860px; top: 520px; width: 760px; }
</style></head><body>
  <div class="glow"></div>
  <div class="win w1"><div class="bar"><b></b><b></b><b></b></div><img src="data:image/png;base64,${shot('graph')}"></div>
  <div class="win w2"><div class="bar"><b></b><b></b><b></b></div><img src="data:image/png;base64,${shot('merge-request')}"></div>
  <div class="text">
    <img class="logo" src="data:image/png;base64,${icon()}">
    <h1>Git Control<span>for Orca</span></h1>
    <div class="ai-badge">✦ with AI</div>
    <p class="sub">A full Git client inside Orca, for GitHub and GitLab.</p>
    <ul>${COVER_FEATS.map((x) => `<li><i></i>${x}</li>`).join('')}</ul>
  </div>
</body></html>`

const page = (s, img) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1440px; height: 900px; overflow: hidden; }
  body { background: #0a0a0d; color: #efe9de; font-family: "Segoe UI", system-ui, sans-serif; position: relative; }
  /* one quiet tone step, no hue gradients: a deeper panel behind the screenshot */
  .stage { position: absolute; left: 520px; top: 0; right: 0; bottom: 0; background: #101014; }
  .rail { position: absolute; left: 520px; top: 0; bottom: 0; width: 1px; background: rgba(239, 233, 222, .08); }
  .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 392px; display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 56px; font-size: 15px; font-weight: 600; letter-spacing: .01em; color: #efe9de; }
  .brand img { width: 28px; height: 28px; border-radius: 7px; }
  .eyebrow { font-size: 14px; font-weight: 600; color: #8fb0f0; margin-bottom: 16px; }
  h1 { font-size: 40px; line-height: 1.12; font-weight: 600; letter-spacing: -0.015em; margin-bottom: 20px; }
  p { font-size: 17px; line-height: 1.55; color: #b9b2c9; margin-bottom: 28px; }
  ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px; }
  li { display: flex; gap: 12px; align-items: flex-start; font-size: 15px; line-height: 1.45; color: #d8d2e4; }
  li i { flex: none; width: 8px; height: 8px; margin-top: 7px; border-radius: 50%; background: #b49be8; }
  /* the app window, rising past the bottom and right edge */
  .win { position: absolute; left: 580px; top: 96px; width: 1100px; border-radius: 14px; overflow: hidden; border: 1px solid rgba(239, 233, 222, .12); box-shadow: 0 30px 80px rgba(0, 0, 0, .55); background: #0d0d10; }
  .bar { height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 14px; background: #16161b; border-bottom: 1px solid rgba(239, 233, 222, .07); }
  .bar b { width: 11px; height: 11px; border-radius: 50%; background: #3a3946; }
  .win img { display: block; width: 1100px; }
</style></head><body>
  <div class="stage"></div><div class="rail"></div>
  <div class="text">
    <div class="brand"><img src="data:image/png;base64,${readFileSync(path.join(PLUGIN, 'assets/icon.png')).toString('base64')}">Git Control for Orca</div>
    <div class="eyebrow">${s.eyebrow}</div>
    <h1>${s.title}</h1>
    <p>${s.body}</p>
    <ul>${s.points.map((x) => `<li><i></i><span>${x}</span></li>`).join('')}</ul>
  </div>
  <div class="win"><div class="bar"><b></b><b></b><b></b></div><img src="data:image/png;base64,${img}"></div>
</body></html>`

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  const tab = await browser.newPage()
  await tab.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  for (const s of slides) {
    const img = readFileSync(path.join(SRC, `${s.file}.png`)).toString('base64')
    await tab.setContent((s.cover ? cover : page)(s, img), { waitUntil: 'load' })
    await tab.screenshot({ path: path.join(OUT, `${s.file}.png`) })
    console.log('promo', s.file)
  }
  await tab.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 })
  await tab.setContent(marketCover(), { waitUntil: 'load' })
  await tab.screenshot({ path: path.join(PLUGIN, 'assets/cover.jpg'), type: 'jpeg', quality: 90 })
  console.log('cover')
} finally {
  await browser.close()
}
