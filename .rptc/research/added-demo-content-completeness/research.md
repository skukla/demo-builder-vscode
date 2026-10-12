# What a storefront copied from a colleague's demo is missing, and the one fix for it

**Date:** 2026-10-12 · **Status:** RESEARCH DONE, nothing built from it yet · **Item:** EDS-40

Written from a read-only research pass (a research agent, then three of its claims re-checked
by hand against the live sites, marked CHECKED below). Where a line says "inferred" it was
reasoned, not read.

## The answer

**The copy drops far more than label sheets, the label-sheet stand-ins have never worked, and
the fix built earlier today for the sheets probably does not work either.** Run one live
experiment before building anything else. Then build ONE mechanism: read the storefront's own
code for the paths it loads, ask the source site for each, copy what answers, and afterwards
ask the destination for the same paths and report the gap.

## Three findings that change what should be built

1. **A project copied from a colleague's demo can arrive without its cart and checkout pages.**
   CHECKED 2026-10-12: the source `main--jenhankib2bbodea--sayurihanki.aem.live` answers 200
   and the copy `main--bodea-storefront--skukla.aem.live` answers 404 for `/cart`, `/checkout`,
   `/search`, `/wishlist`, `/order-details`, `/customer/forgotpassword`, `/store-switcher`,
   `/metadata.json`, `/redirects.json` and `/enrichment/category-banner`. The research lists 18
   such documents (section 4).
2. **The label-sheet stubs answer 404 on every storefront.** The storefront asks for
   `placeholders/<area>.json?sheet=data` (`scripts/commerce.js`, two call sites). CHECKED: with
   that query the stub answers 404 on bodea, bju and justrite, and 200 without it. The source's
   own authored sheet answers 200 with it. So the stubs (`placeholderStubs.ts`, "console
   hygiene") have not been quieting anything.
3. **A sheet "copied" by the published-only route is not served.** The create log said
   `Copied spreadsheet /metadata` and `/redirects`. CHECKED: both answer 404 on the copy. Today's
   fix for the label sheets (`5bc8251b1`) sends them down the same road, and its converter drops
   the `dnt` sheet, which turns a two-sheet document into one; a single sheet is inferred to
   answer 404 to `?sheet=data`. So that fix is unproven and probably ineffective.

## 1. What earlier work recommended, what was built, what was left

| Document | Recommended | Built | Left |
|---|---|---|---|
| content-copy-completeness (2026-06-18), layer 1 | Follow references in copied pages | Yes: `daLiveContentReferences.ts:68`, called from `daLiveContentCopy.ts:341` | Follows content only, never code |
| Same, layer 2 | An audit after the copy | Partly: `auditUncopiedReferences`, `daLiveContentReferences.ts:135-153` | Checks links found in copied pages; never reads code or the destination |
| Same, layer 3 | One inventory for create and reset | Yes: `runtimeSurfaceInventory.ts` | Split again: `PLACEHOLDER_STUB_PATHS` is a second list, used by the copy at `daLiveCopyPaths.ts:135` |
| Same, layer 4 | A create-then-audit run per package | None found (searched `src/features/eds/services/daLive/` only) | All of it |
| Same, its named blind spots (lines 69-71) | Verify `/cart`, `/checkout`, order, wishlist, forgot-password | Never followed up | Measured dropped today |
| ADR-008 | Derive from code, small residual, drift gate | Producer for the `b2b` ledger only (`eds-demo-patches/scripts/derive-surfaces.mjs`, `b2b/runtime-surfaces.json`, one commit `8fae07b`). Consumer `runtimeSurfaceResolver.ts` | No file for `citisignal`, `citisignal-b2b`, `custom`. The consumer ignores `customerPages` and `placeholderSheets` (`:70-74`) |
| ADR-008's prototype | Throwaway | Still at `scripts/runtime-surfaces/` (script, test, README) | Duplicates the patches-repo script; nothing references it |
| colleague-storefront (2026-09-11) | No patches on a colleague's code; content copy listed as "same, no gap" (`research.md:447`) | Built: `storefrontResolver.ts:138-153` | That "no gap" is contradicted by finding 1 |

**Two contradictions.** Commit `5bc8251b1` added 17 names to a probe list, which the June
research (lines 8-9) and ADR-010 (alternative 2) both rule out. And the 2026-08-23 reason for
dropping `placeholderSheets` from the consumer ("the full-tree walk carries them") holds only
when the SC can list the source org; on the fallback (`daLiveCopyPaths.ts:53-65`) the one sheet
asked for was `/placeholders`, which this source answers 404.

## 2. Does ADR-008's mechanism cover an added demo?

No. `storefrontFromAddedDemo` sets no `codePatchSource` (`storefrontResolver.ts:138-153`), so
reset passes `undefined` down through `edsResetContentStep.ts:88,130`, `edsPipeline.ts:627`,
`daLiveContentCopy.ts:308`, `daLiveCopyPaths.ts:108`, and `getRuntimeSurfaces(undefined)`
returns the static list (`runtimeSurfaceResolver.ts:146`). Creation passes
`edsConfig.codePatchSource` (`storefrontSetupPhases.ts:282`); that it is undefined for an added
demo is inferred. `ensureEdsContent` passes no source for any project
(`edsContentSetup.ts:197-211`). And the one seeded ledger adds no path the static list lacks, so
today the consumer adds nothing for anyone.

## 3. Where a storefront's code is in hand

| Flow | Code at copy time |
|---|---|
| Create from a GitHub template | GitHub only. The local clone comes later (`storefrontSetupHandlers.ts:156-162`, then `executor.ts` about `:345`) |
| Create from an added demo | A temporary checkout, deleted after: `templateSyncService.ts:261`, `:359`, `:300` (verified). GitHub only if the source is template-flagged |
| Create onto an existing repo | With reset: a temporary checkout, or an in-memory archive (inferred from `storefrontSetupPhase1.ts:308-310`). Without: GitHub only |
| Reset | Stubs are built at `edsResetRepoHelper.ts:262`, before the archive is downloaded at `githubRepoArchive.ts:211` (verified) |
| Edit | Re-cloned to a temp dir, then swapped (`executor.ts` about `:325-350`) |
| `ensureEdsContent` | Runs after the clone, so the local clone exists (`executor.ts` about `:420`) |
| Republish | No content copy found in `storefrontRepublishService.ts`; not traced further |

**In every flow the SC's own GitHub repository holds the final code before the content copy
starts** (inferred from the orderings above). That is the one source common to all of them.

## 4. What the published-only route drops for this demo

Why: this source has no `/full-index.json`, so the probe chose `/sitemap.json`
(`contentIndex.ts:25`). A sitemap leaves out pages marked noindex. The shipped B2B template's
`full-index.json` lists all of these, so shipped brands are not hit; a colleague's demo is.

Source 200, copy 404, in no index and no backfill list:
- `/cart`, `/checkout`, `/search`, `/wishlist`
- `/order-details`, `/return-details`, `/create-return`
- `/customer/order-details`, `/customer/return-details`, `/customer/create-return`,
  `/customer/forgotpassword`
- `/customer/requisition-list-view`, `/customer/approval-rule`,
  `/customer/approval-rule-details`, `/customer/purchase-order-details`
- `/store-switcher` (a fragment, `blocks/footer/footer.js:62`)
- `/metadata.json`, `/redirects.json`

Also 404 on the copy though the source's index lists them: `/enrichment/category-banner`,
`/enrichment/product-banner`. Cause not established.

Code that loads these, in the demo's clone: the route constants at `scripts/commerce.js:66-101`,
`getMetadata('mini-cart')` defaulting to `/mini-cart` (`blocks/header/header.js:617`), and
`fetchIndex('enrichment/enrichment')` (`blocks/enrichment/enrichment.js:35`).

Caveat: the copy was made before today's fixes, and the source may have changed since.

## 5. Is there a completeness check?

Only the link audit in section 1. Nothing compares what the code loads with what the
destination serves.

## 6. The options

| Option | Covers | Misses | Risk |
|---|---|---|---|
| (a) A regex for label sheets (parked, `27d249ffb`) | Sheet names only | All 18 documents above | Threads a list through three flows for one category, on a sheet copy that likely fails |
| (b) Run the existing derivation on the demo's own code | Sheets, `/customer/sidebar-fragment`, nav and footer (run print-only on this demo) | Its page pattern matches only quoted `/customer/x`; it catches none of the dropped pages | Needs widening to any quoted site path, with the source probe as the filter |
| (c) A check after the copy that also backfills | Whatever its candidate list holds | Needs (b) for the list | Extra requests; must never fail the copy |
| (d) The fixed list, documented | One version of one template | Every added demo | Report, then extend, forever |

**Recommended sequence:** the experiment in section 7, then a widened (b) feeding both the
probe list and (c), reading the code from the SC's own GitHub repository.

**The recommendation is wrong if** DA.live cannot turn a posted table into a served sheet
(`docs/architecture/eds-content-separation.md:31-36` says it cannot). Then sheets must travel as
JSON committed to the repository, and the question becomes what JSON shape answers
`?sheet=data`.

## 7. What is still unknown, and the experiment for each

| Unknown | Experiment |
|---|---|
| Does a table posted to DA.live become a served sheet? | Copy one sheet to a scratch site, publish, GET `.../placeholders/cart.json?sheet=data` |
| Can JSON committed to the repository answer `?sheet=data`? | Commit a multi-sheet-shaped file to a scratch repository, GET it with the query |
| Why the two enrichment pages are missing | Read the create log for those paths |
| Can routes built from template strings (`${CUSTOMER_PATH}/forgotpassword`) be derived? | Widen the pattern and compare with section 4 |
| Are there open drift PRs on the patches repo? | `gh pr list` there |

## 8. The experiment, run 2026-10-12 on a scratch storefront (created and deleted the same hour)

Site `skukla/sheet-probe-1012`, Starter package. Three results, each read back from the live
site the way a storefront asks (`<path>.json?sheet=data`).

| What was tried | Result |
|---|---|
| A table posted to DA.live as `<path>.html`, then published (what `copySpreadsheetFile` does) | **Not a sheet.** `/placeholders/probe-sheet` is served as an HTML page; `/placeholders/probe-sheet.json` answers 404, with and without the query. Same for `/placeholders/cart`: the code stub kept answering the plain request and the query still 404ed |
| A sheet the extension already writes as DA.live's native JSON (`DaLiveBlockLibrarySheet.createJsonSpreadsheet`: a multi-sheet document whose one sheet is named `data`) | **A real sheet.** `/.da/library/blocks.json` answers 200, and so does `/.da/library/blocks.json?sheet=data`. Not written by the experiment; it is what creation wrote on this very site |
| A JSON file committed to the REPOSITORY in the multi-sheet shape (`{"data": {...}, ":names": ["data"], ":version": 3, ":type": "multi-sheet"}`) | **Served as a sheet.** `/placeholders/probe-code.json` and `...?sheet=data` both answer 200, in single-sheet form |

What this settles:

- **Sheets cannot be copied as HTML tables.** `copySpreadsheetFile` has never produced a sheet,
  which is why `/metadata.json` and `/redirects.json` were missing after "Copied spreadsheet".
  Today's fix `5bc8251b1` sends the label sheets down that same road and does not work.
  `docs/architecture/eds-content-separation.md:31-36` was right.
- **The way to write a sheet already exists**: `createJsonSpreadsheet`. A copied sheet should go
  through it, keeping the source's sheet names (a label sheet's is `data`, which is exactly what
  the storefront's `?sheet=data` asks for).
- **The stubs fail because of their shape, not their place.** A stub is a single-sheet JSON
  file, and a single sheet has no sheet called `data`. Written in the multi-sheet shape with a
  `data` sheet, a file in the repository answers the storefront's request. That is a one-function
  change (`buildPlaceholderStubJson`) and it would quiet the console on every storefront.

Also proven live along the way: the agent's `delete_project`, with today's token fix, unpublished
114 pages and 49 product pages and every checked page then answered 404.
