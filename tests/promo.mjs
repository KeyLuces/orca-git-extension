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
  { file: 'graph', eyebrow: 'Commit graph', title: 'See every branch at a glance', body: 'Each branch keeps its own colour. Click a commit and its details open beside the graph; ↑ ↓ step through them.', points: ['Search messages, files, authors and tags as you type', 'Right-click any commit for checkout, merge, rebase or revert'] },
  { file: 'commit', eyebrow: 'Commit', title: 'Commit with the diff in view', body: 'Changed files on the left, the selected diff on the right. Stage whole files or single hunks.', points: ['AI message drafts the commit message', 'Nothing left to commit? The button becomes Push'] },
  { file: 'merge-request', eyebrow: 'Review & MR', title: 'Review merge requests without leaving Orca', body: 'Read the description, reviewers, approvals and comments, then approve, comment or request changes.', points: ['GitHub and GitLab', 'Uses the Git login you already have'] },
  { file: 'new-merge-request', eyebrow: 'New merge request', title: 'Open a merge request in one step', body: 'Title and description filled in like GitLab, reviewers picked from the project, the branch pushed for you.', points: ['Pick the direction: source → target', 'Create now, or open it in the browser'] },
  { file: 'pipeline', eyebrow: 'Pipelines', title: 'Go straight to what broke', body: 'Open a failed job and step through its error lines. Retry a job or the whole pipeline from here.', points: ['GitHub Actions and GitLab CI', 'Live logs while a job runs'] },
  { file: 'commands', eyebrow: 'Keyboard', title: 'Every action by name', body: 'Ctrl+K finds fetch, pull, push, stash, new branch or any tab. The graph moves with ↑ ↓, Enter and Esc.', points: ['Fetch, Pull and Push say what changed', 'Remembers where you left each project'] }
]

const page = (s, img) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1440px; height: 900px; overflow: hidden; }
  body { background: #15141f; color: #efe9de; font-family: "Segoe UI", system-ui, sans-serif; position: relative; }
  /* one quiet tone step, no hue gradients: a deeper panel behind the screenshot */
  .stage { position: absolute; left: 520px; top: 0; right: 0; bottom: 0; background: #1b1a28; }
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
  .win { position: absolute; left: 580px; top: 96px; width: 1100px; border-radius: 14px; overflow: hidden; border: 1px solid rgba(239, 233, 222, .12); box-shadow: 0 30px 80px rgba(0, 0, 0, .55); background: #101014; }
  .bar { height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 14px; background: #191922; border-bottom: 1px solid rgba(239, 233, 222, .07); }
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
    await tab.setContent(page(s, img), { waitUntil: 'load' })
    await tab.screenshot({ path: path.join(OUT, `${s.file}.png`) })
    console.log('promo', s.file)
  }
} finally {
  await browser.close()
}
