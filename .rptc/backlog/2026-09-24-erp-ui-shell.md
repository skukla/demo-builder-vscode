---
id: AB-26n
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26l]
value: med
status: built
---

# Screen redesign 1 — shell and navigation

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

UI audit §Shell: count badges on rail items that carry work; global search in the shell bar; sticky document title line; Home label.

## Verification block (checked by the loop's done gate — §6a of the plan)

Headless checks with fingerprints on every surface; no layout regression on the eight preview screens.

## Shipped so far
- 2026-09-24  Staleness: three of this item's four pieces shipped with AB-26l (rail counts, shell search, Home label) — demo-erp 5b2a269. What remains is the sticky document title line
- 2026-09-24  BUILT — the last piece, the sticky title line: demo-erp (feat(screen): the title line stays while a page scrolls under it), headless check scrolls Products in a 560px window and asserts the title stays; the other three pieces shipped with AB-26l (5b2a269). 224 tests, 14 screen checks
