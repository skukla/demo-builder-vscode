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

## 9. The live test on bodea, 2026-10-12 (build `f3fdb09f5`)

A reset of the project built on `sayurihanki/jenhankib2bbodea`, then every sheet read back from
`main--bodea-storefront--skukla.aem.live` and compared with the source.

| What | Before | After the reset |
|---|---|---|
| `/metadata.json`, `/redirects.json` | 404 | 200, same rows as the source |
| A stub with nothing behind it (`/placeholders/quick-order.json?sheet=data`) | 404 | 200 |
| The 16 label sheets the source has | 404 to `?sheet=data` | 200, but the STUB's one row, not the source's rows |

The log said `Copied spreadsheet` for all 19 and `Sheets published: 19 of 19`, and DA.live lists
16 `.json` files under `/placeholders`. So the sheets were written and published, and the site
still served the stub.

**A stub file in the repository stops the copied sheet at the same path from being served.**
Shown on one sheet first: with `placeholders/cart.json` deleted from the repository, the site
went on serving the stub for several minutes; one more publish of `/placeholders/cart.json`
then gave 160 rows and both of the source's sheets (`data`, `dnt`). Repeated for the other 15.
Result: all 16 label sheets on the copy have the source's row count and first key (cart 160,
order 223, purchase-order 134, account 118, requisition-list 83, checkout 72, auth 58, global
29, search 21, pdp 19, wishlist 17, payment-services 14, recommendations 3, quote-management 2,
company 1, company-switcher 1).

So `placeholderStubs.ts`'s claim that "content shadows these code files automatically" is
false for these files: the stub wins. **A stub must not be written for an area the source has a
sheet for.** The source can be asked at the moment the stubs are decided (one request per
area), on creation and on reset alike.

Bodea was left in the repaired state: 16 stub files removed from its repository by hand, the
16 sheets published again. Its next reset will put the stubs back unless the rule above is
built first.

Still missing on bodea after this: `/cart`, `/checkout` and the other pages in section 4.
Those are pages, not sheets.

## 10. The second live test on bodea, 2026-10-12 (build `b0df9f441`)

A reset of the same project through the complete-copy code. Nothing was repaired by hand.

What the log said:

```
[EdsReset]    Label-sheet stubs: 1 (the source has the rest)
[DA.live]     The storefront's code loads 75 paths: 9 already listed, 48 more found on the source
[EdsPipeline] Sheets published: 19 of 19
[EdsPipeline] The storefront serves all 57 pages the source has
```

What the live site says, read back afterwards:

| What | Result |
|---|---|
| The pages measured missing in section 4 (`/cart`, `/checkout`, `/search`, `/wishlist`, the order and return pages, the five `/customer/*` pages, `/store-switcher`), plus `/b2b/quote-checkout` | All answer 200 |
| `/metadata.json`, `/redirects.json` | 200 |
| The 16 label sheets the source has | All 16 have the source's row count and first key |
| Stub files in the repository | One, `placeholders/quick-order.json`, the one area the source has no sheet for; it answers `?sheet=data` |

**Two pages are still missing: `/enrichment/category-banner` and `/enrichment/product-banner`.**
The source serves both and its index lists them, so they are copied. They are not published:
`EXCLUDED_FOLDERS` in `helix/helixPageDiscovery.ts:40` leaves out the whole `enrichment`
folder ("PDP enrichment data"), a rule older than this work. The storefront's enrichment block
loads them (`blocks/enrichment/enrichment.js:35`, `fetchIndex('enrichment/enrichment')`), so on
the copy that block has nothing to show. Whether that exclusion is still wanted is the owner's
call.

**And the check did not report them.** "Serves all 57 pages the source has" was true of the
paths read out of the code. It does not look at what the copy took from the index, so a page
that was copied and then left unpublished is invisible to it. The check should cover every
path the copy carried, whatever told it to.

## 9. Both follow-ups, built 2026-10-12 (owner: "Do it")

- **The enrichment folder is published.** `enrichment` is out of `EXCLUDED_FOLDERS`
  (`helix/helixPageDiscovery.ts`). The exclusion came with the first publish feature
  (`a116f0237`, 2026-01-12) with no reason beyond "PDP enrichment data". The generated
  robots.txt already disallows `/enrichment/`, so publishing them does not put them in
  search. A reset now also treats a stale enrichment page like any other leftover.
- **The check covers everything the copy carried.** `findMissingPages` takes two lists: the
  code's paths the source answered for (a gap if the storefront lacks one), and everything
  else the copy carried (`carriedWebPaths`: every sheet written, every document copied,
  overlay included). A carried path the storefront does not serve is asked for on the source,
  and is a gap only when the source serves it, so a draft, a stub or an unpublished source page
  is never reported. The source is asked only about those.

**Re-run live on bodea, 2026-10-12 17:00 (`ea1712bb9`).** Both enrichment pages answer 200 (404
before), with the source's content. Cart, checkout, search and wishlist still 200; the cart,
global and order label sheets match the source's row counts (160, 29, 223) with no hand repair.
The check read 106 paths, not 57, and named one real gap:
`/experiments/index5/experiment-demo-2026/challenger-2`. The source serves it (it is in her
sitemap); the publish skips the `experiments` folder ("A/B test config"). It is a variant of
an old experiment; the home page's current experiment is `inactive`, ended 2026-05-28, and
names its variant by an absolute URL on the source site. Left as is pending the owner's call.
