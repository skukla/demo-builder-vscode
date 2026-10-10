---
id: EDS-38
kind: question
area: eds
needs: []
value: low
status: open
---

# Should a block library report success when its site-config registration failed?

Filed 2026-10-10, found while working PL-70 batch MUT-04.

`createBlockLibrary` in `src/features/eds/services/daLive/daLiveBlockLibraryOperations.ts`
registers the "Blocks" section in the site config with `configOps.updateSiteConfig`, and
when that call answers `success: false` it writes one warning to the log and carries on.
It then writes the `.da/library/blocks.json` sheet and answers `success: true` with the
block count.

Read from the code, not run against DA.live: in that case the sheet exists and the
site config does not point at it. The file's own comment says DA.live's library UI
renders block lists only for a section titled "Blocks" registered in the site config,
so the palette would presumably show no blocks while storefront setup reports the
library created. Whether the registration can fail on its own in practice (and whether
a section left by an earlier run would cover it) has not been measured.

The mutation measurement is what surfaced it: four mutants on the guard survive
because nothing but the log line depends on it. They are recorded in
`scripts/mutation-equivalents.ledger.json` as log-only, which is true today.

## Recommendation

Return the failure (`success: false`, with the config error) rather than only logging
it, so setup's caveat list can say the block palette will be empty. That is a behaviour
change on a live write path, so it wants one live check first: make `updateSiteConfig`
fail on a throwaway site and look at the palette. If the palette is in fact fine,
close this with that evidence and leave the code alone. If the answer is to return the
failure, the four ledger mutants become killable and their row should be deleted in
the same change.
