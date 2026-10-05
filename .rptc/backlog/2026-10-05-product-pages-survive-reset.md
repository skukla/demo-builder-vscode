---
id: EDS-26
kind: fix
area: eds
needs: []
value: med
status: backlog
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
