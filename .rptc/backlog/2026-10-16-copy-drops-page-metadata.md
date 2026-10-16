---
id: EDS-50
kind: fix
area: eds
needs: []
value: med
status: active
---

# Copied pages lose their own page settings (template, robots, cache-control)

Found 2026-10-16 during the patch audit (EDS-48). The content copy reads each source
page as `.plain.html`, which drops the page's own metadata block (the renderer moves
it into `<head>`), and nothing rebuilt it. Measured on live pages, Adobe's B2B
boilerplate against our copy:

| Page | Adobe has | Our copy had |
|---|---|---|
| /customer/account, /customer/orders | template "My Account, Columns" / "Orders, Columns" | nothing |
| /cart, /search | robots "noindex, nofollow" | nothing |
| /checkout | robots + cache-control "no-store" | nothing |

The "Columns" template is what Adobe's own code keys the account layout on
(`applyTemplates` in `scripts/commerce.js`); the `account-page-column-layout` patch
in `skukla/eds-demo-patches` was papering over this loss.

## The fix

Every page copy (creation, Reset, account-chrome overlay, followed references,
block-library doc pages, all through `copySingleFile`) rebuilds a `metadata` block
from the source page's head, keeping only what was authored on the page: renderer-
generated tags (og:*, twitter:*, a title or description the renderer derived),
`head.html` names and site-wide `/metadata.json` values are dropped, by the
renderer's own rules (adobe/helix-html-pipeline). Fixtures are verbatim live
responses (`tests/fixtures/eds/page-metadata/README.md` names each source).

## Still open

- ~~Prove it on a real copy~~ Proven 2026-10-16 (Reset of the scratch storefront on
  build `df4d52519+`): DA.live's `/customer/account` carries the metadata block (Title,
  Template "My Account, Columns", Robots), and the served head of account, orders,
  cart, checkout and search matches Adobe's live pages exactly.
- If it does, test whether the `account-page-column-layout` patch can retire.
- The home page of the four commerce sources carries Adobe's
  `google-site-verification` value onto the SC's copy (authored on that page, so kept).
  Harmless; decide whether to drop that one name.

## Shipped so far

- 2026-10-16  fix(eds): copied pages keep their own page settings (`1b2e4f1aa`)
