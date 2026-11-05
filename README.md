# Git Extension for Orca

A lightweight Git client in a full Orca editor tab (Git Graph), modeled on Git Extensions. Open it from the **Git** item in the status bar or the command **Git: Open Git Graph**. No dependencies, no build step: a plain HTML/CSS/JS panel plus a small Node worker that runs your installed `git`.

## Features

- **Changes:** stage, unstage, or discard per file or all at once; diff viewer; commit, amend, commit & push, sign-off; resolve conflicts (use ours/theirs, mark resolved)
- **History:** commit graph (current branch or all), message search, commit details with per-file diffs; checkout, branch, merge, cherry-pick, revert, reset (soft/mixed/hard), tag
- **Branches:** local, remote, and tags; checkout (tracks remote branches automatically), create, rename, delete, merge, rebase, push, set upstream, delete remote branch
- **Worktrees:** list, create (new branch, existing branch, or detached), lock/unlock, remove, prune, open in Orca
- **Stash:** save (untracked / keep staged), apply, pop, drop, view diff
- **Settings:** git config at **Global** or **This repository** scope (user.name/email, pull.rebase, autocrlf, and more), edit any entry, manage remotes
- Merge/rebase/cherry-pick in progress → Continue / Skip / Abort banner
- Fetch / Pull (merge, rebase, ff-only) / Push (force-with-lease) in the header
- **Git Graph tab:** the whole client lives in one editor tab (VS Code Git Graph style); commit details slide in from the right
- **Right-click menus:** right-click a commit, branch, remote, tag, changed file, stash or worktree for its actions, as in Git Extensions. On a commit: checkout (its branches or detached), create branch/tag/worktree here, merge, rebase, interactive rebase, cherry-pick and revert (with or without committing; merges against the first parent), reset (soft, mixed, keep, merge, hard), fixup!/squash! commits, the branches and tags at the commit, compare, browse files, patch, bisect and copy. Sub-menus open on hover
- **Git Graph in every project:** switching projects opens that project's Git Graph tab in the background, or brings it to the front when you were on Git Graph (setting: Keep Git Graph open in every project)
- **AI:** "AI message" writes the commit message from your changes; "Resolve with AI" (and the merge/rebase option) opens a terminal where the agent resolves conflicts and stages them for you to review. Choose Claude Code or Codex in Settings → Plugins → Git Extension
- Follows the focused Orca workspace automatically; switch to another repository from the repository name in the header
- Uses Orca theme colors (light and dark)

## Development

```sh
orca plugin validate .
orca plugin dev watch .      # loads into Orca; asks you to approve on first load
```

Or: Settings → Plugins → Turn on plugins → Development folders… → add this folder.

Requires Orca ≥ 1.4.246 and `git` on PATH.

## End-to-end test

`tests/e2e.mjs` opens the real Git Graph tab in headless Chrome, wires it to the real worker, and
clicks through commit, branch, checkout (dirty and diverged remote), stash, discard, worktrees,
settings, tags and the AI dialog on a throwaway repository, checking every result with plain git.
It uses its own global git config, never yours.

```sh
cd tests && npm install && npm run e2e   # needs Google Chrome installed
```

## Layout

```
orca-plugin.json   manifest (trusted-worker: the worker runs git)
worker/main.mjs    git operations, exposed to the panel via orca.panels.handle
panel/             tab.html (the Git Graph editor), style.css, app.js
```
