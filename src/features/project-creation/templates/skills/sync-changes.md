---
name: sync-changes
description: Chooses the correct sync operation after editing a Demo Builder project. Use when files have changed and you need to pick between `sync_content` (DA.live pages), `sync_storefront` (block code), `deploy_mesh` (mesh config), `configure_project` (config values), or `promote_block_to_library` (block source).
---

# Sync Changes

Use this skill to decide which sync operation to run after making changes.

## Decision tree

| What changed? | Use this MCP tool |
|---|---|
| Page content (`.md` file in DA.live) | `sync_content` — calls Helix preview + publish |
| Block JS or CSS in `blocks/` | `sync_storefront` — git commit + push, then Helix preview+publish when credentials are available |
| `mesh.json` or API Mesh config | `deploy_mesh` — redeploys via `aio` CLI |
| Component `.env` credential | `configure_project`, then restart demo |
| Block changes to push back to source library | `promote_block_to_library` |
| Remove a block from the library | `remove_block_from_library` |

## EDS projects

A PostToolUse hook commits and pushes for you, but its scope is narrower than it sounds —
read this before assuming a change is live.

**The hook fires when all of these hold:**

- the edit came from the Write or Edit tool (the hook's matcher), AND
- the edited file is anywhere under the storefront directory — not only `blocks/`, and not
  only `.js`/`.css`.

It then runs `git add -A && git commit -m "AI: sync files" && git push` in that directory.

**It does NOT:**

- publish. It only runs git. The live site still needs a publish — call `sync_content`, or
  `sync_storefront`, which pushes AND publishes when Helix credentials are available. A
  pushed change is not yet a visible change.
- cover files edited outside the Write/Edit tools — a shell `sed`, a script, or the user
  editing by hand. Call `sync_storefront` explicitly for those.
- cover anything outside the storefront directory.

If you are unsure whether the hook fired, call `sync_storefront` anyway: it is idempotent
(a no-op commit when there is nothing staged).

## Headless (Next.js) projects

Headless projects do not use `sync_content` or `sync_storefront`. Changes to Next.js files
take effect after restarting the dev server or redeploying.

## Notes

- `sync_content` calls Helix preview first, then publish. Both steps are required.
- `sync_storefront` runs `git add -A && git commit && git push` in the storefront directory,
  then Helix preview+publish when both Helix tokens and the GitHub repo are known. The commit
  step is skipped cleanly when there is nothing staged, so calling it again is safe.
- `deploy_mesh` spawns `aio api:mesh:update` — requires Adobe I/O CLI to be authenticated.
