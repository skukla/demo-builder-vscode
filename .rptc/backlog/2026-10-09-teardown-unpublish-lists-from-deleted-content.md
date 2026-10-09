---
id: EDS-33
kind: fix
area: ai
needs: []
value: high
status: backlog
---

# A storefront teardown leaves its pages live when the DA.live content is already gone

**What happened (2026-10-09).** Deleting the `justrite-copy` project deleted its DA.live
content, but Helix refused to list the published pages (401: DA.live was not signed in), so
nothing was unpublished. Running `cleanup_dalive_site` afterwards, signed in, answered
`stillPublished: false` and `unpublishedPages: 0`, yet all 174 pages in the site's
sitemap still answered 200 from the live origin (x-cache MISS). They came down only when each
was unpublished by hand through the Helix admin API (204 on live and preview, then 404 on all
174 pages, both tiers).

**Cause, read in the code.** `tearDownStorefront` (`storefront/storefrontTeardown.ts`)
builds the list to unpublish from `helix.listAllPages(daLiveOrg, daLiveSite)`, which reads
the DA.live content. Once that content is gone the list is empty, the unpublish of nothing
"succeeds", and `stillPublished = !unpublished.success` reports false. The product pages
were removed because they are found another way.

**Fix.** Take the list of what is published from Helix, not from DA.live: the site's own
record of published pages (the admin status or the published sitemap), falling back to the
DA.live list only when that cannot be read. And never report `stillPublished: false`
without having checked: an empty list on a site that still answers is "could not tell", said
in words. Affects `delete_project` with the site box ticked, `cleanup_dalive_site`, the
Clean up DA.live sites command and reset. Reversibility rule: a delete that leaves the public
site up is not undone.

## Shipped so far

**Not covered by this fix: reset.** Reset does not call `tearDownStorefront`. Its unpublish
(`edsPipeline.ts`, the content-clear step) still lists from the DA.live files it just
deleted, so a reset of a site whose content was already gone unpublishes nothing old.
Taking everything Helix lists down during a reset would take the live site down until the
republish finishes, which is a product decision, not a code fix.

**Not yet seen live.** The whole-site listing asks Helix's bulk status job for `/*`; the
`/products/*` form of the same call is also unproven against a live site
(`helixPublishedPaths.ts`). If Helix rejects `/*`, the teardown falls back to the DA.live list
and says so, and the live check still stops it claiming the site is down.
