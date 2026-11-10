// A stand-in for the Claude Code / Codex CLI in tests (GITX_AI_SCRIPT): saves the prompt it reads on
// stdin to GITX_AI_PROMPT_FILE and answers with a fixed review.
import fs from 'node:fs'

let s = ''
process.stdin.on('data', (d) => (s += d))
process.stdin.on('end', () => {
  if (process.env.GITX_AI_PROMPT_FILE) fs.writeFileSync(process.env.GITX_AI_PROMPT_FILE, s)
  process.stdout.write(['Verdict: FIX FIRST', '', '## Summary', 'Adds a thing.', '', '## Must fix', '- `src/a.js:2` divides by zero', ''].join('\n'))
})
