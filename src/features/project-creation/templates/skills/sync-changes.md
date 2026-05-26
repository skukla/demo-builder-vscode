---
name: sync-changes
description: Chooses the correct sync operation after editing a Demo Builder project. Use when files have changed and you need to pick between `sync_content` (DA.live pages), `sync_storefront` (block code), `deploy_mesh` (mesh config), `update_project_config` (credentials), or `promote_block_to_library` (block source).
---

# Sync Changes

Use this skill to decide which sync operation to run after making changes.

## Decision tree

| What changed? | Use this MCP tool |
|---|---|
| Page content (`.md` file in DA.live) | `sync_content` — calls Helix preview + publish |
| Block JS or CSS in `blocks/` | `sync_storefront` — git commit + push |
| `mesh.json` or API Mesh config | `deploy_mesh` — redeploys via `aio` CLI |
| Component `.env` credential | `update_project_config`, then restart demo |
| Block changes to push back to source library | `promote_block_to_library` |

## EDS projects

For `.js` and `.css` changes in `blocks/`, the PostToolUse hook handles git commit and push
automatically whenever you use the Write or Edit tool inside the storefront directory.
For explicit live publish (not just preview), call `sync_content` after pushing.

## Headless (Next.js) projects

Headless projects do not use `sync_content` or `sync_storefront`. Changes to Next.js files
take effect after restarting the dev server or redeploying.

## Notes

- `sync_content` calls Helix preview first, then publish. Both steps are required.
- `sync_storefront` runs `git add -A && git commit && git push` in the storefront directory.
- `deploy_mesh` spawns `aio api:mesh:update` — requires Adobe I/O CLI to be authenticated.
