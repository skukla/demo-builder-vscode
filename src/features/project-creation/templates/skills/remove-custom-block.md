---
name: remove-custom-block
description: Removes (unregisters) a custom EDS block from the DA.live authoring library so authors can no longer drag it into pages. Use when you need to delete, remove, or retire a block from the library. Unregisters from DA.live only — it does NOT delete the block's source files in `components/eds-storefront/blocks/<blockId>/`.
---

# Remove a custom block from the DA.live library

Use this skill to take a block out of DA.live's drag-and-drop authoring picker — the inverse of registering one. This reverses the library registration only. It does **not** delete the block's source code; see "What this does NOT do" below.

## What it does

Calls the `remove_block_from_library` MCP tool with `{ projectName, blockId, confirm: true }`. The tool reverses exactly what registration did:

- **Doc page** — deletes the block's library doc page from DA.live.
- **Sheet row** — drops the block's row from the library sheet.
- **`component-definition.json`** — removes the block's entry so it stops appearing in the authoring picker.
- **Unpublish** — commits/pushes the removal in the storefront, then unpublishes the doc page from the live and preview CDN.

The tool is idempotent: if the block is already gone from any of these places, that sub-step is reported as "absent" and nothing fails.

## Confirm gate

This tool is destructive — it unpublishes the live doc page and pushes a removal commit. You must pass `confirm: true`. Calling it without `confirm` returns a `destructive` notice and takes **no action**, so the user can be asked first. Only pass `confirm: true` once the user has agreed to remove the block.

## Inputs you must supply

- **`projectName`** — the Demo Builder project name. Get it from `list_projects` if you don't already have it.
- **`blockId`** — the directory name under `blocks/` (e.g., `hero-cta`, `product-grid`). Use the exact slug, not the human title — the tool matches the library row by `blockId`.
- **`confirm`** — must be `true` to actually perform the removal.

## What you get back

A structured result with per-sub-step status:

- `componentDefinition` — `removed` (entry deleted) or `absent` (was not registered).
- `docPage` — `deleted`, `absent` (already gone), or `failed`.
- `sheet` — `removed` or `absent`.
- `unpublish` — `success`, `partial` (push succeeded but the unpublish hit an auth/transient error), or `failed` (the push itself failed).

Any sub-step can succeed or fail independently; the push/unpublish steps never abort the local teardown, so check the result to confirm each one landed.

## What this does NOT do

**This tool does not delete the block's source files.** The directory `blocks/<blockId>/` (the `.js`, `.css`, and any assets) stays on disk and in the repo. Unregistering only stops the block from showing up in DA.live's authoring picker.

To fully delete a block:

1. Delete the source directory `components/eds-storefront/blocks/<blockId>/` and push that change (the storefront PostToolUse hook commits/pushes automatically when you use Write/Edit/Delete in the storefront, or call `sync_storefront` explicitly).
2. Then call `remove_block_from_library { projectName, blockId, confirm: true }` to unregister it from the library.

Either order works, but the block isn't truly removed until both the source files are gone AND it's unregistered.

## Handoff

After `remove_block_from_library` returns, report to the user in plain language — don't relay the raw sub-step JSON:

- **Status (one line):** the block is unregistered from the DA.live library and unpublished — or name the sub-step that failed (e.g. "removed locally but the unpublish needs DA.live re-auth").
- **Source files are separate:** remind the user that the block's source files were **not** deleted; removing the library registration is not the same as deleting the block. Note that fully deleting it also means removing `blocks/<blockId>/` and pushing.
- **The one gap + next step:** offer the single next action — typically deleting the source directory if they want the block gone entirely, or re-running with re-auth if a step failed.

Keep the internal field names (`componentDefinition`, `docPage`, `sheet`, `unpublish`) out of the user-facing message — "unregistered and unpublished" is what they need to hear.
