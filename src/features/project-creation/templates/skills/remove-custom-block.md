---
name: remove-custom-block
description: Removes a custom EDS block from the storefront — deletes its code in `components/eds-storefront/blocks/<blockId>/` and takes it out of DA.live's authoring picker. Use when you need to delete, remove, or retire a block, or take it out of the block list.
---

# Remove a block from the storefront

DA.live's block list follows the storefront's code: every folder under `blocks/` is listed. So the only way to take a block out of the list is to remove its code, and this skill does both in one step. There is no way to hide a block whose code stays.

## What it does

Calls the `remove_block_from_library` MCP tool with `{ projectName, blockId, confirm: true }`. The tool:

- **Example page** — deletes the block's example page from the DA.live block list.
- **Row** — drops the block's row from the block list. If either DA.live step cannot run (an expired sign-in, a list it cannot read or rewrite), the tool stops with an error before anything has changed.
- **Code** — deletes the block's code folder `blocks/<blockId>/` in the storefront checkout.
- **Push and unpublish** — commits and pushes the deletion, then unpublishes the example page from the live and preview CDN.

It is idempotent: anything already gone is reported as "absent" and nothing fails.

## Before you call it

- **Check nothing uses the block.** Pages that still contain it will render an empty table once its code is gone. Search the site's pages for the block's name first and tell the user which pages use it.
- **A block from a block library or Adobe's template may come back.** Updating that library or the storefront template can bring its code back, and Refresh Blocks then lists it again. Say so when the block is not one you or the user made.

## Confirm gate

This tool is destructive — it deletes the block's code, pushes the deletion and unpublishes its live page. You must pass `confirm: true`. Calling it without `confirm` returns a `destructive` notice and takes **no action**, so the user can be asked first. Only pass `confirm: true` once the user has agreed to remove the block.

## Inputs you must supply

- **`projectName`** — the Demo Builder project name. Get it from `list_projects` if you don't already have it.
- **`blockId`** — the block's folder name under `blocks/` (e.g., `hero-cta`, `product-grid`): lowercase words joined by hyphens. Use the exact slug, not the human title; anything else is refused.
- **`confirm`** — must be `true` to actually perform the removal.

## What you get back

A structured result with per-sub-step status:

- `codeFolder` — `deleted`, `absent` (the code was already gone), or `failed` (the page and row are gone but the code stays; `note` says why. The next Refresh Blocks lists the block again from that code, so the list heals itself; delete the folder and push to finish).
- `docPage` — `deleted`, `absent` (already gone), or `failed`.
- `sheet` — `removed` or `absent`.
- `unpublish` — `success`, `partial` (the push succeeded but the unpublish hit an auth/transient error), or `failed` (committing or pushing the deletion failed, so the page was not unpublished).

Once the DA.live steps have run, nothing aborts: check each field to confirm it landed. When `unpublish` is `failed`, the deletion may not be committed (the sync can stop before its commit) or may be committed but not pushed. Check `git status` and `git log @{u}..HEAD` in the storefront checkout: an uncommitted deletion is committed and pushed by `sync_storefront`; a commit not yet pushed needs `git push`, because `sync_storefront` skips the push when there is nothing new to commit.

## Undo

Restoring the block's code undoes the removal: bring `blocks/<blockId>/` back from the storefront's git history, push it (`sync_storefront`), and run `refresh_block_library` to list it again. Its example page comes back as a placeholder; `promote_block_to_library` gives it a real example again.

## Handoff

After `remove_block_from_library` returns, report to the user in plain language — don't relay the raw sub-step JSON:

- **Status (one line):** the block's code is deleted and it is gone from the DA.live block list — or name the sub-step that failed (e.g. "deleted locally but the unpublish needs DA.live re-auth").
- **Pages that used it:** name any you found; they need the block taken out by hand.
- **How to undo:** one line — restoring the block's code brings it back.

Keep the internal field names (`codeFolder`, `docPage`, `sheet`, `unpublish`) out of the user-facing message.
