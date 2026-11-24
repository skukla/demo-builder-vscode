---
name: register-custom-block
description: Gives a custom EDS block its example and title in the DA.live block list, so authors see a real instance of it when they insert it. Use after writing new block source files in `components/eds-storefront/blocks/<blockId>/`, or when a block in DA.live's authoring picker shows a placeholder or the wrong title.
---

# Give a block its example in the DA.live block list

DA.live's block list follows the storefront's code: every folder under `components/eds-storefront/blocks/` is listed. A new block appears once its code is pushed and the list is rebuilt with `refresh_block_library` (the Refresh Blocks button), with a placeholder example shaped like the table its code reads. This skill replaces that placeholder with a real example and sets the title authors see.

## What it does

Calls the `promote_block_to_library` MCP tool with `{ projectName, blockId, title, unsafeHTML, confirm: true }`. The tool writes your HTML as the block's example page in the block list, adds the block's row (or renames it to your title when the block is already listed), commits and pushes the storefront, and publishes the example page so DA.live picks it up. It is idempotent: safe to call repeatedly while you iterate on the example HTML. A later Refresh Blocks keeps your page and your title.

## Inputs you must supply

- **`projectName`** — the Demo Builder project name. Get it from `list_projects` if you don't already have it.
- **`blockId`** — the directory name under `blocks/` (e.g., `hero-cta`, `product-grid`). Use the exact slug, not the human title.
- **`title`** — the human-readable display name shown in the authoring picker (e.g., `"Hero CTA"`, `"Product Grid"`).
- **`unsafeHTML`** — the block's table as an author would fill it in: `<div class="<blockId>">` holding one `<div>` per row and one `<div>` per cell. This becomes the example authors insert, so make it look like a real instance of the block (not an empty shell). `get_block_authoring_shape` tells you the rows, columns and style variants the block's code reads.
- **`confirm`** — must be `true`. It commits and pushes to the storefront repo and publishes the example page to the live site, so the tool refuses without it and does nothing. Tell the user what you are about to publish before you pass it.

### Sanitization

`unsafeHTML` is run through an allowlist sanitizer at the MCP boundary before it lands on the published example page. The allowlist covers the EDS authoring block vocabulary (semantic flow tags, `<picture>`/`<source>`, `class`/`id`/`data-*`/`aria-*`). Stripped: `<script>`, inline `on*` handlers, `<iframe>`/`<object>`/`<embed>`, `<style>`, and `javascript:`/`data:`/`vbscript:` URLs. Inline SVG is currently also stripped (use raster `<img>` or a CSS background for icons).

Don't depend on byte-exact round-trip — write your example HTML in the allowed vocabulary. If you need to confirm what was kept, inspect the published example page after `promote_block_to_library` returns.

## What you get back

A structured result with per-sub-step status:

- `docPage` — wrote the example page
- `sheet` — `created` or `appended` (row added), `renamed` (the block's row now has your title), or `skipped-duplicate` (no row change: either this block is already listed under that title, or another block has a row with that title and this block got none — then pick a title no other block uses and call again)
- `publish` — pushed the storefront and published the example page so DA.live picks up the change

Any sub-step can succeed or fail independently; check the result to confirm each one landed.

## Idempotency notes

- The **example page** silently overwrites on re-call — iterate on the HTML freely.
- The **row** changes only when the title does.

## Handoff

After `promote_block_to_library` returns, report to the user in plain language — don't relay the raw sub-step JSON:

- **Status (one line):** the block has its example in the DA.live block list and is published — or name the sub-step that failed. Be explicit that this is **not** the same as "placed on a page" or "verified with live data."
- **How to use it:** how an author adds it in DA.live and exactly what they type (the block's authoring rows), with **one consistent example** — don't switch SKU/value examples mid-message.
- **The one gap + next step:** if you didn't place it on a page or run it against real data, say that's what's left and offer the single next action (e.g. a quick live-data check).

Keep the internal field names (`docPage`, `sheet`, `publish`) and code symbols out of the user-facing message — "it's in the block list with a real example" is what they need to hear.

### PDP-targeted blocks: where they show

If the block is meant for the product detail page (recently-viewed products, related-products, custom PDP hero, etc.), tell the user: "Place it on `/products/default`. Real product URLs like `/products/{urlKey}/{sku}` are served from that authored page, so the block shows on them too. A product page published before the change can keep the old version until it is published again; a reset re-publishes every product page." Otherwise the SC will place the block, open a product they visited before, and think it did not work.
