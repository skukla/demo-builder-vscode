---
id: EDS-64
kind: fix
area: eds
needs: []
value: med
status: active
---

# The Storefront Report is readable, and its fixes are offered honestly

Filed 2026-10-23 from the JustRite walk. The plan, with the evidence and the three
decisions it waits on, is `.rptc/plans/storefront-report-and-fixes/overview.md`.

In short: the report opens as a raw markdown tab and pops a modal offering fixes; the
reset never offers them to a project made before 2026-10-03; Apply would write nothing
and, if it wrote, the product-links fix would break the product-teaser block (its import
fix is not in the list); and the reset's modal drops some of its own warnings ("13
category pages couldn't be published").

## Shipped so far

- 2026-10-23  Built, not committed: the added-demo fix path removed (fix pass, offer, Apply, dry check, applyFixes on reset_project and create_project, the report's fixes section and template merge); reset warnings no longer dropped (page steps, agent caveats, mesh+config); the patch engine no longer re-applies a fix that wraps its precondition. Full suite green. Report window next.
- 2026-10-23  Report window built in the extension worktree (uncommitted): StorefrontReportModal over the dashboard, getStorefrontReport and takeStorefrontReportRequest handlers, the command opens the dashboard with it showing; the markdown document and the fix offers are removed. Full jest green except the known tokens test that clears at commit.
- 2026-10-23  Owner decided a third time: every live patch in the shipped ledgers goes into every storefront it fits, on creation and reset, with no offer and no second list. Built as the known-patches repair (knownPatches.ts, shippedPatchLedger.ts) in the extension worktree, uncommitted. Dry run on JustRite: 4 of 6 would apply.
- 2026-10-23  feat(eds): every known fix reaches every storefront; the report is a window (`c75b52793`)
