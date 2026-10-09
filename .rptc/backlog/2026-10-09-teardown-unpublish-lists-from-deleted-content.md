---
id: EDS-33
kind: fix
area: ai
needs: []
value: high
status: built
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

**Reset, as first found.** Reset does not call `tearDownStorefront`. Its unpublish
(`edsPipeline.ts`, the content-clear step) listed from the DA.live files it had just
deleted, so a reset of a site whose content was already gone unpublished nothing old.
Taking everything Helix lists down during a reset would take the live site down until the
republish finishes, which was a product decision, not a code fix. Decided below.

**Reset, decided 2026-10-09 (owner: "Yes").** A reset no longer unpublishes at the start.
It still deletes the DA.live content (the copy needs a clean source), then copies and
republishes; the republish overwrites every page that still exists, so the storefront stays
up. After the republish (and the block library publish), the pipeline asks Helix what the
whole site has published (the same `/*` listing the teardown uses) and unpublishes, live and
preview, whatever was not republished. Product pages are never on that list: the old
catalog's were taken out before the copy (EDS-26, with its shared-repository refusal) and the
pre-warm, which runs after this step, publishes the current catalog's. Non-page files and the
folders the whole-site publish skips are left too, because "not republished" says nothing
about them. When Helix cannot be read, nothing is removed and the reset says old pages may
still be live: a warning to the SC, and `leftoverPages` (`not-listed`) in `reset_project`'s
answer, never a clean finish. Why this way: no downtime during a reset, a clean end state
(a page live from an earlier demo comes down too), and it reuses the EDS-33 listing rather
than adding a second one. `storefront/leftoverPages.ts`; the step is `leftover-pages` in
`edsPipeline.ts`. Also runs for storefront setup when it is told to replace existing content
(`clearExistingContent`), which shares the pipeline.

**Not yet seen live.** The whole-site listing asks Helix's bulk status job for `/*`; the
`/products/*` form of the same call is also unproven against a live site
(`helixPublishedPaths.ts`). If Helix rejects `/*`, the teardown falls back to the DA.live list
and says so, and the live check still stops it claiming the site is down.

## Shipped so far
- 2026-10-09  fix(eds): storefront teardown unpublishes what Helix says is live (`1fcd35818`)
- 2026-10-09  docs(backlog): EDS-33 built, logs its commit (`9ded02d82`)
