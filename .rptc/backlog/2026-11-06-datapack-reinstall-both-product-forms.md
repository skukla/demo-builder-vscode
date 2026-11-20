---
id: DI-14
kind: feature
area: data-installer
needs: []
value: med
status: backlog
---

# A reinstall misreads a pack that holds one thing in two forms

Filed 2026-11-06 by the full-cycle test (`fullCycle.test.ts`), written after a Luma reinstall
removed what the pack still had (DI-8). Not reachable from any pack today; filed so it is decided
before one is.

## What is wrong

`packKindIn` (`src/features/data-installer/services/demoBuilderEngine/storeCopies.ts`, beside
`packKindOf`) decides which pack rows a reinstall compares recorded products and customers against.

1. **A pack holding both `products` and `product_export`.** Products made from the import form are
   recorded as `products`, so they are compared against the `products` rows, match nothing, and
   are taken out. The cycle test, with both forms in one pack, saw the second install send
   `DELETE products/cycle-cap`. The same happens with `customers` beside `customers_export`
   (`DELETE customers/101`).
2. **A pack holding `customers_export` alone.** `packKindIn` never maps customers to it, so a
   reinstall never plans those customers: never updates them, never takes one out. Nothing is
   destroyed; the reinstall just does less than it says.

## Why it is not urgent

Checked 2026-11-06 against every pack in Demo Builder's store and the Data Installer (14 packs, each store checked):
none holds both forms of one thing, and none holds `customers_export`. A save writes only the
records form (`capture.ts`), so saving store changes back cannot make a two-form pack. Only a pack
built by hand, or a future service pack, could.

## Recommendation

- Refuse, before any write, a pack holding both forms of one thing (products and `product_export`,
  customers and `customers_export`), naming the two kinds: the cheapest fix for the destructive
  half, and no pack is turned away today. Add it to `packRowProblems`.
- Map customers to `customers_export` in `packKindIn` and give its rows the store-copy shape that
  `product_export` already has (`importRowsOf`), so a reinstall plans them. Then move
  `customers_export` from its own cycle into the full cycle's checks for updates and removals.
