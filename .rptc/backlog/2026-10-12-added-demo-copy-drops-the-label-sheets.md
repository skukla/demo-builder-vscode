---
id: EDS-40
kind: fix
area: eds
parent: EDS-13
needs: []
value: med
status: active
---

# A storefront copied from a colleague's demo loses the demo's label sheets

Filed 2026-10-12, from a project built on `sayurihanki/jenhankib2bbodea`.

## What was measured

The source demo authors its UI labels as DA.live sheets under `/placeholders/`. On its live
site `cart.json` has 160 rows, `global.json` 29, and `company-switcher.json` one.

The copy (`skukla/bodea-storefront`) serves Demo Builder's one-row STUB for the same paths
(`{"Key":"_stub", ...}`), so every label the demo's author wrote is gone and the dropins'
English defaults show instead. The stubs make this silent: nothing 404s.

The create's log says why:

```
[DA.live] List API unavailable, falling back to content index
[DA.live] Copied spreadsheet /metadata
[DA.live] Copied spreadsheet /redirects
[DA.live] Copied spreadsheet /sitemap
```

The SC cannot list a colleague's DA.live org, so the copy takes the published-only route. That
route copies the four spreadsheet paths in `RUNTIME_SURFACES.spreadsheets`
(`runtimeSurfaceInventory.ts`): `/placeholders`, `/redirects`, `/metadata`, `/sitemap`.
`/placeholders` is not a sheet on this source (`/placeholders.json` answers 404); the sheets
are `/placeholders/<area>`, one per dropin area, and no path under that folder is ever asked
for.

`placeholderStubs.ts` says the opposite will happen: "a brand authors `/placeholders/*` sheets
in its source and the content copy carries them". That holds for the full-tree walk (an org
the SC can list) and not for this route.

## What to do

In the published-only route, ask the source for each known area's sheet
(`PLACEHOLDER_STUB_PATHS`, as `/placeholders/<area>.json`) and copy the ones that answer,
the way the three sheets above are copied. Content then shadows the stub, which is the design.

## Not checked

- Whether the multi-sheet shape the source serves (`{"data": {...}}` at the top, seen on
  `cart.json`) copies through the existing spreadsheet writer unchanged.
- The broken content links reported in the same session: some were confirmed absent from
  the source itself, and that part was not looked at again here.

## Fixed the same day

`/placeholders/company-switcher.json` was requested and stubbed nowhere, so it 404ed. It is
in the stub list now (`ea374381d`).

## Shipped so far

- 2026-10-12  docs(backlog): file EDS-40, the added-demo copy drops the label sheets; AI-15 gains the 2026-10-12 incident (`137798659`)
- 2026-10-12  docs(eds): say where the company-switcher sheet request comes from (`07ea0a816`)
- 2026-10-12  fix(eds): a storefront copied from a published site keeps the source's label sheets (`5bc8251b1`)
- 2026-10-12  docs(research): what a storefront copied from a colleague's demo is missing (`8c9e1cd4a`)
- 2026-10-12  Merge branch 'fix/eds-40-sheets-that-work' into loop/2026-10-05-release-candidate (`5c6e04192`)
- 2026-10-12  fix(eds): sheets are copied as sheets, published, and the label stubs answer (`98b5c88b0`)
- 2026-10-12  feat(eds): a storefront copy carries what its code loads, and says what is missing (`8cd987437`)
- 2026-10-12  docs(research): the live test on bodea; a stub blocks the copied sheet at its path (`cc306f47c`)
- 2026-10-12  fix(eds): the page check covers everything the copy carried; enrichment pages are published (`ffbd41b52`)
- 2026-10-12  docs(research): the complete copy, proven on bodea; two enrichment pages still unpublished (`65833f045`)
- 2026-10-19  fix(eds): creation's own content copy reads the storefront's code paths (`32615a1a2`)

## The stub list cannot know an added demo's code (owner, 2026-10-12)

`company-switcher` was not Jen's own addition and not missing from the list by oversight: it
is what Adobe's boilerplate asked for until template #1213 (2026-04-22), and her repository
was made on 4.0.1 in February. The list was measured on the template Demo Builder creates
from, which is 6.0.0 and asks for `quick-order` instead.

That is the general case for an added demo: it keeps whatever code it was made with, on any
boilerplate version, plus anything its author wrote. A list fixed in the extension describes
ONE version of ONE template.

Two things follow, in this order:

1. **Copy the demo's own sheets first** (the body of this item). A stub is a stand-in for a
   sheet nobody authored. Here the author did write them, and the stub hid that they were
   lost. For a copy of someone's demo, carrying their content matters more than a quiet console.
2. **Then stub what the demo's code asks for, not what a list says.** The storefront's code
   is already in hand when the stubs are committed, and every request is a literal
   `fetchPlaceholders('placeholders/<area>.json')` call. Reading those call sites gives the
   exact set for that repository, whatever its version, and for blocks its author added.
   The fixed list then stays only as the fallback when the code cannot be read.

## Built 2026-10-12, and what is still unproven

Two faults, one behind the other:

1. **The copy never asked.** `backfillEssentialPaths` now probes `/placeholders/<area>` on
   the source for every area in `PLACEHOLDER_STUB_PATHS` and adds the ones that answer.
   Creation and reset both go through it, so they agree.
2. **Had it asked, the sheets would have arrived empty.** These sheets are served as
   multi-sheet documents (`data` plus a `dnt` sheet) and a served sheet names no columns.
   `convertSpreadsheetJsonToHtml` took columns from the rows for a single sheet and used
   `[]` for a multi-sheet, so every multi-sheet upload was a table with no cells. It now
   takes them from the rows in both. The `dnt` sheet is still left out, as before.

**Not proven live.** No copy has been run with this build, so nothing has been read back
from a destination site. Unknown until one is: that DA.live turns the posted table into a
sheet at `placeholders/<area>`, that the publish step publishes it, and that the published
sheet then shadows the stub of the same path. The destination will serve a SINGLE sheet
(no `dnt`), where the source serves a multi-sheet; a storefront's `fetchPlaceholders` has
to read both, and that was not checked against the 4.0.1 code.

Superseded the same day by the two sections below: the table posted as HTML never became
a sheet (fixed in `98b5c88b0`), and the stub turned out to block the copied sheet.

## Built 2026-10-12, second pass: the stub rule, and a copy that reads the code

Evidence: `.rptc/research/added-demo-content-completeness/research.md` (sections 4, 8, 9).

**1. A stub is not written where the source has a sheet.** Proven live (research section 9):
a stub file in the repository stops the copied sheet at the same path from being served.
`placeholderStubPathsFor` (`placeholderStubs.ts`) asks the content source for each area's
sheet, one request each, and returns the areas it does NOT serve. Creation
(`storefrontSetupPhase2.ts`, from `edsConfig.contentSource`) and reset
(`edsResetFileOverrides.ts`, from `params.contentSource`) both take their list from it. An
unreachable source, or no source, stubs every area, as before.

**2. The copy carries what the storefront's code loads, and says what is missing.** One
mechanism, in the shared pipeline, so creation and reset agree:

- `storefrontCodeReader.ts` downloads the SC's own repository once, before the copy
  (pipeline step `storefront-code`). If that fails the copy runs on the fixed lists.
- `storefrontCodePaths.ts` reads every site path out of `blocks/` and `scripts/`: quoted
  paths, templates built from plain-string constants, and the sheets `fetchPlaceholders`
  names. No list of page names anywhere.
- `backfillCodePaths` (`daLiveCopyPaths.ts`) asks the source for each path not already
  listed (`sitePathProbe.ts`: at most 400 paths, 8 at a time, 5 s each, 30 s in all) and
  copies what answers. With code paths in hand, the fixed list of label-sheet areas is
  not asked for.
- `storefront/missingPages.ts` (pipeline step `page-check`) asks the published
  storefront for every path the source had. What is absent goes on the pipeline result,
  in the log, in the reset's warning dialog, on the wizard's completion card, and in the
  `caveats` of `reset_project` and `create_project`: "2 pages the source has are missing
  from this storefront: /cart, /checkout". It cannot fail a copy.

Measured against the real demo's clone and the two live sites (read-only): 75 paths
derived from 179 files; the source serves 57 of them (answered in 3.4 s); 16 of the 18
documents in research section 4 are derived, all but `/metadata.json` and
`/redirects.json`, which no code names and the static list already copies. The existing
copy lacks 17 of the 57, the research's 16 pages plus `/b2b/quote-checkout`.

The ADR-008 prototype (`scripts/runtime-surfaces/`) was deleted: its logic is
`storefrontCodePaths.ts`. The gate's script in the patches repository is unchanged.

## What is left

- **Not proven live.** No create or reset has run with this build. To check on a reset of
  the real project: no stub files under `placeholders/` for the 16 areas the source has;
  those sheets serve the source's rows; `/cart`, `/checkout` and the rest answer 200; and
  the result carries no missing-pages sentence.
- **The stub list is still the fixed list.** Which areas get a stub is decided per source
  now, but the candidate areas are `PLACEHOLDER_STUB_PATHS`. Deriving them from the
  storefront's code needs the code in hand when the stubs are committed, which on reset
  is before the archive is downloaded.
- **Keep-my-current-content resets.** With the source unreachable every area is stubbed,
  which would block label sheets copied earlier. Not handled.
- **`ensureEdsContent`** (project creation's own copy, when the site has no content) uses
  the fixed lists, not the code.
- `/enrichment/category-banner` and `/enrichment/product-banner` are in the source's
  index and were missing on the copy; the cause is still not established.
- A page check right after a publish can see the CDN's old 404 for a path that has just
  gone live. Not measured.

