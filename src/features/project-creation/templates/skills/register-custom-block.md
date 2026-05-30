---
name: register-custom-block
description: Registers a custom EDS block with the DA.live authoring library so authors can drag it into pages. Use after writing new block source files in `components/eds-storefront/blocks/<blockId>/` and you need the block to appear in DA.live's authoring picker.
---

# Register a custom block with the DA.live library

Use this skill after you create the source files for a new block (the `.js`, `.css`, and any supporting assets under `components/eds-storefront/blocks/<blockId>/`). The block code runs on EDS pages, but it won't show up in DA.live's drag-and-drop authoring picker until you register it with the library. This skill handles that registration.

## What it does

Calls the `promote_block_to_library` MCP tool with `{ projectName, blockId, title, unsafeHTML }`. The tool writes the block's preview HTML to the library doc page, appends a row to the library sheet, and adds an entry to `component-definition.json` — then publishes the doc page so DA.live picks it up. The tool is idempotent: safe to call repeatedly while you iterate on the variant HTML.

## Inputs you must supply

- **`projectName`** — the Demo Builder project name. Get it from `list_projects` if you don't already have it.
- **`blockId`** — the directory name under `blocks/` (e.g., `hero-cta`, `product-grid`). Use the exact slug, not the human title.
- **`title`** — the human-readable display name shown in the authoring picker (e.g., `"Hero CTA"`, `"Product Grid"`).
- **`unsafeHTML`** — a representative HTML snippet showing the block in a default state. This becomes the drag-and-drop preview that authors see, so make it look like a real instance of the block (not an empty shell).
- **`description`** *(optional)* — short author-facing description of when to use the block. Lands at `component-definition.json::components[].description` and the EDS authoring runtime renders it as a tooltip on the block tile.

### Sanitization

`unsafeHTML` is run through an allowlist sanitizer at the MCP boundary before it lands in `component-definition.json` or the published doc page. The allowlist covers the EDS authoring block vocabulary (semantic flow tags, `<picture>`/`<source>`, `class`/`id`/`data-*`/`aria-*`). Stripped: `<script>`, inline `on*` handlers, `<iframe>`/`<object>`/`<embed>`, `<style>`, and `javascript:`/`data:`/`vbscript:` URLs. Inline SVG is currently also stripped (use raster `<img>` or a CSS background for icons).

Don't depend on byte-exact round-trip — write your preview HTML in the allowed vocabulary. If you need to confirm what was kept, inspect the published doc page after `promote_block_to_library` returns.

## What you get back

A structured result with per-sub-step status:

- `docPage` — wrote the variant HTML to the library doc page
- `sheet` — appended a row to the library sheet (or skipped if already present)
- `componentDefinition` — added the block to `component-definition.json` (or skipped if already present)
- `publish` — published the doc page so DA.live picks up the change

Any sub-step can succeed or fail independently; check the result to confirm each one landed.

## Idempotency notes

- The **doc page** silently overwrites on re-call — iterate on the variant HTML freely.
- The **sheet row** is skipped if a row for this `blockId` already exists.
- The **`component-definition.json`** entry is only added the first time; later calls leave the existing entry alone.

This means you can re-run the tool as many times as you need while tuning the preview HTML — the only thing that visibly changes on repeat calls is the doc-page content.
