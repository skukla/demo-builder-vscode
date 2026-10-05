---
id: EDS-26
kind: fix
area: eds
needs: []
value: med
status: built
---

# Reset and delete leave a storefront's product pages published

Filed 2026-10-05 from the EDS-25 comparison (`.rptc/research/prerender-vs-shared-action/research.md`,
finding 6). A reversibility finding (CLAUDE.md property 1: a thing that cannot be undone is
a finding).

Product pages (`/products/{urlKey}/{sku}`) are published through the BYOM overlay — by
pre-warming at create/reset and by smart-404 on first visit. They never exist in DA.live.
Both reset and teardown unpublish only the pages they find listed in DA.live
(`storefrontTeardown.ts`, `edsPipeline.ts` — read 2026-10-05), so every product page
published for a demo stays live after a reset, and possibly after the storefront is deleted.

Effect today (inferred, not measured): after a reset, old SKUs still resolve; the
empty-data patch sends a visitor to 404 when the product is gone from Commerce. Whether a
deleted storefront's product pages keep being served is unverified.

## Rules (owner, 2026-10-05)

- **True deletion, not just unpublish:** remove the live copy, then the preview copy. A
  product page has no DA.live document, so these two copies are all there is. If Helix
  refuses the preview removal "while source exists" (the overlay still answers for every
  product path), fall back to live-only and say so — never claim a clean zero.
- **Only `/products/*` pages, only on the SC's own site** (the Helix site is keyed by the
  GitHub owner/repo). Never DA.live content: a DA.live site the SC reuses, or a colleague's
  content an added storefront reads, is untouched.
- **Refuse, don't guess, when another project publishes to the same repository** — removal
  there would take the other project's pages down too.
- Pages a shopper's first visit published (smart-404) are not recorded anywhere: list the
  site's published `/products/*` paths from Helix rather than trusting pre-warm's list.

## What to do

1. Measure: on a scratch storefront, publish a few PDPs, reset, and read their status
   (Helix admin status GET); then the same after delete.
2. Fix: unpublish `/products/*` on reset and teardown from a record of what was published
   (pre-warm knows its list; smart-404 publishes are not recorded — read the status API's
   listing, or record them in the shared action). The category pages EDS-24 writes live in
   DA.live and are already covered.

## Built 2026-10-05, not yet seen live

Built with no cloud writes, so step 1 above (measure) has NOT been done. What was built:

- `storefront/productPageRemoval.ts` is the one implementation. It asks Helix for the
  site's published `/products/*` paths (`helix/helixPublishedPaths.ts`, the Admin API's
  bulk status job), keeps only `/products/<urlKey>/<sku>` paths that DA.live has no
  document for, and removes live then preview through `HelixService.unpublishPages`.
- Reset runs it before the content pipeline (`reset/edsResetProductPages.ts`); the
  storefront teardown runs it for the delete button, `delete_project` and
  `cleanup_dalive_site` (`storefront/storefrontTeardown.ts`).
- Another local project on the same repository: nothing is removed, the sentence names it.
- The outcome is a sentence on the progress line, in the log, and `productPages` on the
  three tool results.

There was no listing API in the code or in the `eds-publish-and-config` skill. The bulk
status job is new to this codebase; its request and response shape are written from
Adobe's Admin API reference, not from a captured response.

### The live check (scratch storefront, or Justrite with the owner's say)

1. Before: `get_auth_status`, then confirm product pages exist, for example
   `read_published_page({ path: "/products/<urlKey>/<sku>" })` for one pre-warmed SKU
   and one never-warmed SKU after visiting it in a browser.
2. `reset_project({ confirm: true })`. Read `productPages` in the result and the
   `[Product Pages]` and `[Helix]` lines in the Debug Logs.
3. After: the same `read_published_page` on a SKU that is no longer in the catalog should
   404; a current SKU should load (pre-warm re-made it).
4. Delete: `delete_project({ name, confirm: true, confirmName: name, deleteDaLiveSite: true })`
   on a scratch project, read `daLiveSite.productPages`, then fetch a product URL.

What the check settles, each unverified today:

- the bulk status request is accepted and its details carry `data.resources[].path`
  (capture the body into `tests/features/eds/services/helix/helixPublishedPaths.test.ts`);
- it lists pages published by a shopper's first visit as well as pre-warmed ones;
- on teardown, the DA.live sign-in alone is enough for it (that Helix client has no
  GitHub token);
- whether Helix removes a preview copy while the overlay still answers. If it refuses,
  the result must read "those preview copies remain"; whether removing the overlay
  registration first would let them go is untested;
- whether a deleted storefront's product pages were in fact still served before this.

Found on the way and filed, not fixed: EDS-31 ("Manage DA.live Sites" unpublishes nothing).

## Shipped so far

- 2026-10-05  fix(eds): reset and delete remove a storefront's product pages (EDS-26) (`696de0118`)
