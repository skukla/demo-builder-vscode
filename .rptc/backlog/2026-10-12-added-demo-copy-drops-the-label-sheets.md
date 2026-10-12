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

