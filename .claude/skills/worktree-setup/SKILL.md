---
name: worktree-setup
description: Create or relocate a git worktree for this repo the way it expects — correct sibling location, copy the one .claude file that still does NOT travel via git (settings.local.json — permissions), and start the preview loop. Use when spinning up a worktree by hand, when a worktree session has no permissions/hooks/skills, or when a worktree ended up in the wrong (hidden) place.
---
# Set Up a Git Worktree (location + config + preview loop)

## When NOT to use
- `/rptc:feat` and `/rptc:fix` already create the worktree and compute its path — let them.
  Use this skill for the parts they DON'T do: copying gitignored `.claude` config into the new
  worktree and starting the preview loop. And for ad-hoc worktrees you make by hand.

## Procedure
1. **Put it in the visible sibling dir**, organized by branch prefix — NOT `.claude/worktrees/`:
   ```bash
   MAIN="$(git rev-parse --show-toplevel)"          # main checkout
   git -C "$MAIN" worktree add "$MAIN.worktrees/<prefix>/<name>" <branch>
   ```
   Prefix is the branch prefix (`claude/`, `feature/`, `fix/`); the prefix subdirs already exist.
   e.g. branch `feature/foo` → `demo-builder-vscode.worktrees/feature/foo`.
2. **Copy the one `.claude` file the checkout does NOT carry** (see Gotchas for why):
   ```bash
   WT="$MAIN.worktrees/<prefix>/<name>"
   mkdir -p "$WT/.claude"
   # hooks/, settings.json and skills/ are TRACKED — git brings them. Only the
   # personal permission allowlist is still ignored and needs copying.
   cp "$MAIN/.claude/settings.local.json" "$WT/.claude/"
   ```
   `skills/`, `hooks/` and `settings.json` are tracked — they arrive with the checkout.
3. **Give the worktree its OWN `dist/` — never a symlink** (share `node_modules`, not build
   output):
   ```bash
   [ -L "$WT/dist" ] && rm "$WT/dist"     # kill an inherited symlink
   mkdir -p "$WT/dist"
   [ -e "$WT/node_modules" ] || ln -s "$MAIN/node_modules" "$WT/node_modules"
   ```
   `node_modules` is read-only at runtime, so sharing it is free. `dist/` is WRITTEN by every
   build — sharing it means two branches compile into one directory and the last writer silently
   wins (see Gotchas). The cost of a private `dist/` is one `npm run compile` in the worktree.
4. **Reload Claude in the worktree session** — settings/hooks/skills are read at session start, so
   a session opened before the copy won't see them.
5. **Start the preview loop from the worktree** (the folder the Extension Dev Host was launched
   from) with Bash `run_in_background`:
   ```bash
   cd "$WT" && npm run watch:all
   ```
   `watch:all` rebuilds BOTH the extension and the webview bundle on save (plain `watch` =
   extension-only, `watch:webview` = webview-only). Confirm the initial
   `[watch] build finished, watching for changes...` line before iterating.

## Gotchas
- **`.claude/` is gitignored EXCEPT `skills/`, `hooks/` and `settings.json`** (`.gitignore`:
  `.claude/*` then three `!` re-includes). A fresh worktree therefore has the project skills,
  the hooks, AND the hook wiring already — a hook that enforces a skill has to travel with the
  skill, or the enforcement exists in one checkout only. What it does NOT have is
  **`settings.local.json`** → constant permission prompts until you copy it (step 2). Edit
  permissions in the **main checkout** copy so future worktrees inherit it.
- **Never place a worktree under `.claude/worktrees/`** — a dotfolder is invisible in Finder and
  VS Code open dialogs; the user won't find it. The sibling `.worktrees/` dir is the convention.
- **NEVER symlink `dist/` between checkouts** (step 3). Older worktrees here were created with
  `dist -> <main>/dist`, and it burned a whole debugging session on 2026-07-30: the Dev Host showed
  the wrong branch's UI, a build "disappeared", and a bundle that existed at 13:24 was gone by
  13:27 because a build in the other tree emitted six bundles over the seven-bundle set. Two ways
  it bites:
  1. Whichever build ran LAST owns what the Extension Dev Host loads — across BRANCHES, invisibly.
  2. `.vscode/launch.json` has `"preLaunchTask": "npm: compile"` scoped to `${workspaceFolder}`, so
     **F5 rebuilds `dist` from the workspace you launched from** — F5 in either tree overwrites the
     other's build.
  If you inherit a worktree with the symlink, replace it (step 3) — `dist/` is gitignored, so
  nothing is lost. Sharing `node_modules` stays fine: it is read, never written.
- **Confirm WHICH build you are looking at before trusting the UI.** After any rebuild, grep the
  bundle for a string only your branch produces:
  `grep -c '<a-class-only-on-your-branch>' dist/webview/<name>-bundle.js`. A `0` means another
  tree, or an older build, won.
- **Cmd+R reloads the webview; it does NOT compile.** After an edit with no watch running you are
  looking at a stale bundle. Extension-side changes (commands, handlers, push senders) need a full
  **F5** host restart — Cmd+R alone refreshes the webview against the old extension host.
- **Relocating an existing worktree**: `git -C "$MAIN" worktree move <old> <new>`. If you're moving
  the worktree that is your OWN cwd, do it LAST and `cd` into the new path in the same command —
  the old dir vanishes mid-move.
- The preview loop is the *build* loop only. It does NOT replace correctness checks — still run the
  `gate` skill (scoped jest + tsc + eslint) before pushing.

## Verify
1. In the worktree session, run any allowlisted command (e.g. `npx tsc --noEmit`) — it should run
   without a fresh permission prompt (proves `settings.local.json` copied and was reloaded).
2. `ls "$WT/.claude/hooks"` shows the shell hooks (via git, not the copy); `ls "$WT/.claude/skills"` shows the project
   skills (the latter from git, not the copy).
3. The background `watch:all` printed `build finished, watching for changes...`; edit a webview
   file, save, and confirm a rebuild line — then Cmd+R in the Extension Dev Host picks it up (F5
   only for extension-host restarts).

_If this skill was wrong or incomplete, fix it before closing the task._
