---
id: EDS-25
kind: question
area: eds
needs: []
value: med
status: open
---

# Should product pages use Adobe's prerender, and how?

Filed 2026-10-05 by the owner, from the EDS-24 redesign: "I wonder if we should research how
it might and should be used for the product pages."

## Why it is a question now

Product pages today use our own version of Adobe's overlay pattern (ADR-005, memory
`project_byom_pdp_routing`): ONE shared `render-pdp` action serves every SC's storefronts and
returns the SC's authored `/products/default` template; the product data loads in the
browser; pre-warming at create/reset and a smart-404 snippet cover new SKUs. Prerender was
judged unfit in 2026-06 (memory `reference_commerce_prerender_unfit`): one deployment per
storefront, and its setup fights our Configuration Service writes.

Three things have moved since then (web research 2026-10-05, in
`.rptc/research/dynamic-commerce-pages/research.md` UPDATE 3):

- Adobe's docs now recommend prerender as the default for "most catalogs; hands-off
  category and product pages" (updated 2026-09-09 / 2026-09-30).
- Prerender gained category pages on 2026-08-26 and is under active development
  (commit `91a491c`, 2026-09-23).
- It renders server-side HTML with JSON-LD and the first products, which our shared action
  deliberately does not (Tier 2 vs Tier 3 in the memory).

## What the research should answer

1. Is prerender still one deployment per storefront, or can one deployment serve many sites
   (the multi-tenant shape SCs need)?
2. Does its setup still overwrite the Configuration Service `content` block we write, or
   can the two coexist?
3. What would an SC gain on product pages: server-rendered content, SEO data, faster first
   paint, Adobe-maintained code instead of our smart-404 workaround (prerender issue #262,
   event-driven updates — has it shipped?).
4. B2B: prerendered HTML is one public page per SKU — what does it show for prices and
   visibility per customer group, and is that acceptable in a B2B demo?
5. What would we delete if we adopted it (render-pdp, prepublish-pdp, smart-404,
   pre-warming), and what would SCs have to do per demo?

Deliverable: a research note with a recommendation (adopt, adopt for some stacks, or keep
ours), then an owner decision. Category pages are NOT in scope here: EDS-24 chose editable
pages written at setup, because generated pages override authored ones.
