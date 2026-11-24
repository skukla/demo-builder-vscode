---
id: EDS-78
kind: fix
area: eds
needs: []
value: high
status: built
---

# Bodea's Form block fails to load on every Bodea storefront

Filed 2026-11-24, found while writing the shipped block examples (EDS-71).

`blocks/form/form.js` in `skukla/bodea-source` (commit `2fd511e`, line 2) imports
`../../scripts/submit-json.js`. A block library install copies only block folders, and a Bodea
storefront's code is the B2B template (`adobe-commerce/boilerplate-b2b-template`), which has no
`scripts/submit-json.js` (404 at `f8eb94d`). The Bodea package's `brandAssets` copies three other
files from `bodea-source` (`demo-packages.json`: the theme, `bodea-customer-group.js`, the rack
finder data), but not this one. So the import fails and the block never loads.

Two ways to fix it; the first is preferred because it keeps the block whole wherever it goes:

1. In `bodea-source`, move `submit-json.js` into `blocks/form/` and import it from there.
2. In Demo Builder, add `scripts/submit-json.js` to both Bodea storefronts' `brandAssets.files`.

Check first that `submit-json.js` imports nothing else outside the block folder.

**Fixed 2026-11-24 the second way** (owner: "Fix the form"): both Bodea storefronts' `brandAssets`
now copy `scripts/submit-json.js`, which imports nothing else. The render check now copies a
library's own package brand files and head lines too, and Bodea's Form example passes
(`npm run block-examples:render -- --only form`: 1 block loaded, no errors, 672px). Existing Bodea
storefronts get the file when their brand files are next written (create or reset). Moving the
file into `blocks/form/` in `bodea-source` would still be the cleaner fix; it is optional now.

## Shipped so far

- 2026-11-24  Fixed for new and reset Bodea storefronts (brandAssets copy scripts/submit-json.js). Left: Refresh Block Library does not pass brandAssets (refreshBlockLibraryHeadless.ts:157), so an existing storefront needs a reset; or move the file into blocks/form/ in bodea-source.
