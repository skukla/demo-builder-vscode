---
id: PL-24
kind: feature
area: app-builder
needs: []
value: med
status: built
---

# Component updates cannot follow an environment-variable rename

**Moved out of `docs/architecture/` on 2026-08-30.** It was a design document —
"Solution Options", "Recommended Solution" — for work that was never built and that
no item tracked. A proposal in the architecture directory reads as architecture.

## The gap, which is real and still open

`envMerge` keeps the user's values and adds keys the new template introduces. It
**cannot see a rename**. When a component renames `CATALOG_SERVICE_ENDPOINT` to
`ADOBE_CATALOG_SERVICE_ENDPOINT`, the merge keeps the old key carrying the user's
real value AND adds the new one carrying the template's empty default. The component
reads the new name, finds it empty, and fails at runtime — a mesh deploy reports
"missing keys" and nothing points back to the rename.

This is documented at the point of consequence, in `envMerge.ts`'s own header, and
asserted in `envMerge.test.ts`. Those are better places for it than a doc: they
cannot drift from the code, and that suite previously described the gap in prose
while asserting nothing.

## What was proposed

Two phases: have components accept both names for a transition period, then teach the
updater a rename map so it can carry a value across.

## Before building it

The original recommendation is from before `envMerge` was extracted and tested.
Re-read that module first — the seam it now has may make a rename map cheaper than
the proposal assumed.

## Shipped so far

- 2026-10-03  Built 2026-10-03 (overnight, staged not committed): envMerge takes a declared rename list (ENV_VAR_RENAMES, OLD -> NEW, zero entries) and the updater passes it; a declared rename moves the project's value to the new name, never overwrites a value already under it, and drops the old name only when the new template no longer ships it — tested with a synthetic rename.
- 2026-10-03  chore(platform): delete eight handlers nothing calls; carry renamed env vars; every AI-bundle writer goes through the seam or says why (PL-37, PL-24, PL-58) (`f0b4705e3`)
- 2026-10-03  Reconciled 2026-10-03 (second pass): the 'uncommitted / staged' wording above is stale: the work is committed (6817f5486, f0b4705e3, b7bc129d2, 844afae69) and on feature/erp-integration.
