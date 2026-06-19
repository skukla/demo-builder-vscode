# Step 04 — Consolidate the four backfill lists into one inventory (Layer 3)

**Goal:** Replace the scattered, drifting hardcoded lists with a **single declared inventory** of
known runtime-referenced surfaces, shared by **create and reset**, with a coverage test — so the
deterministic safety net beside the crawl can't rot or disagree across paths again.

## Why / evidence

Four lists today, already inconsistent:
- `daLiveContentOperations.ts:1843` `essentialSpreadsheets` (`/placeholders,/redirects,/metadata,/sitemap`)
- `:1858` `essentialFragments` (`/nav,/footer`)
- `:1875` `essentialAuthPages` (login/account/create-account)
- `edsResetRepoHelper.ts:48` `placeholderPaths` (9 sheets — richer than the copy-path list)

The create path and reset path disagree on placeholders; fragments omit `/customer/nav`.

## Test-first (RED)

New `tests/features/eds/services/runtimeSurfaceInventory.test.ts`:

1. The inventory exports stable, deduped groups: `fragments`, `authPages` (path+blockClass),
   `spreadsheets`/`placeholderSheets`, `configDocs`.
2. Both `copyContentFromSource` and `edsResetRepoHelper` consume the **same** inventory (assert the
   reset placeholder fetch and the copy backfill derive from it — no divergent literals).
3. `/customer/nav` is present in `fragments` (belt-and-suspenders alongside Step 01 discovery).

## Implement (GREEN)

- New `src/features/eds/services/runtimeSurfaceInventory.ts` exporting one typed inventory (+ a
  per-package override hook if a package needs extra surfaces, e.g. b2b account fragment).
- Point `essentialSpreadsheets`/`essentialFragments`/`essentialAuthPages` and reset's
  `placeholderPaths` at the inventory; delete the literals.
- Reconcile placeholders: the copy path should also backfill the section placeholder sheets the
  reset path already knows (verify which exist per template — Step 05 smoke will confirm).

## Files

- New `src/features/eds/services/runtimeSurfaceInventory.ts` + test.
- `daLiveContentOperations.ts`, `edsResetRepoHelper.ts` (consume inventory; remove literals).

## Acceptance

- One inventory; create and reset both use it; no duplicated literals; existing enumeration tests
  still green. `/customer/nav` present as a declared fragment.

## Notes

- Discovery (Step 01) is the primary mechanism; this inventory is the deterministic backstop for
  surfaces that are *never referenced from a copied page* (e.g. standalone spreadsheets) and thus
  can't be crawled to.
