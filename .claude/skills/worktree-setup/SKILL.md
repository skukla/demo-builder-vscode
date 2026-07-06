---
name: worktree-setup
description: Create or relocate a git worktree for this repo the way it expects — correct sibling location, copy the gitignored .claude config that does NOT travel via git, and start the preview loop. Use when spinning up a worktree by hand, when a worktree session has no permissions/hooks/skills, or when a worktree ended up in the wrong (hidden) place.
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
2. **Copy the gitignored `.claude` config** the checkout does NOT carry (see Gotchas for why):
   ```bash
   WT="$MAIN.worktrees/<prefix>/<name>"
   mkdir -p "$WT/.claude"
   cp -R "$MAIN/.claude/hooks" "$MAIN/.claude/settings.local.json" "$WT/.claude/"
   ```
   `skills/` is tracked — it arrives with the checkout, don't copy it.
3. **Reload Claude in the worktree session** — settings/hooks/skills are read at session start, so
   a session opened before the copy won't see them.
4. **Start the preview loop from the worktree** (the folder the Extension Dev Host was launched
   from) with Bash `run_in_background`:
   ```bash
   cd "$WT" && npm run watch:all
   ```
   `watch:all` rebuilds BOTH the extension and the webview bundle on save (plain `watch` =
   extension-only, `watch:webview` = webview-only). Confirm the initial
   `[watch] build finished, watching for changes...` line before iterating.

## Gotchas
- **`.claude/` is gitignored EXCEPT `.claude/skills/`** (`.gitignore`: `.claude/*` then
  `!.claude/skills/`). So a fresh worktree already has the project skills via git, but has **no
  `settings.local.json` and no `hooks/`** → constant permission prompts and no jest-pipe/format
  hooks until you copy them (step 2). Update dev config in the **main checkout** copy so future
  worktrees inherit it on copy.
- **Never place a worktree under `.claude/worktrees/`** — a dotfolder is invisible in Finder and
  VS Code open dialogs; the user won't find it. The sibling `.worktrees/` dir is the convention.
- **`node_modules` and `dist` travel with a worktree** on create/move — no reinstall or rebuild.
- **Relocating an existing worktree**: `git -C "$MAIN" worktree move <old> <new>`. If you're moving
  the worktree that is your OWN cwd, do it LAST and `cd` into the new path in the same command —
  the old dir vanishes mid-move.
- The preview loop is the *build* loop only. It does NOT replace correctness checks — still run the
  `gate` skill (scoped jest + tsc + eslint) before pushing.

## Verify
1. In the worktree session, run any allowlisted command (e.g. `npx tsc --noEmit`) — it should run
   without a fresh permission prompt (proves `settings.local.json` copied and was reloaded).
2. `ls "$WT/.claude/hooks"` shows the shell hooks; `ls "$WT/.claude/skills"` shows the project
   skills (the latter from git, not the copy).
3. The background `watch:all` printed `build finished, watching for changes...`; edit a webview
   file, save, and confirm a rebuild line — then Cmd+R in the Extension Dev Host picks it up (F5
   only for extension-host restarts).

_If this skill was wrong or incomplete, fix it before closing the task._
