# Step 03 — Block port waves (external: skukla/bodea-source)

Never copy Jen's vendored `scripts/__dropins__/` or import map. Ported blocks must compile
against the b2b LKG's dropin generation (CI from step 02.3 enforces). Verify each wave live
via `aem up` (fstab at the curated DA content) before merging.

## Wave 1 — marketing/neutral (~25 blocks; no dropin imports; near-copy + de-brand)

hero-3, hero-5, hero-6, hero-cta, promotional-hero, product-highlights, features-grid,
how-it-works-stats, cards-list, circle-carousel, blog-post, quote, table, tabs, top-banner,
triptych, video, embed, age-gate, age-verification, search, catalog-highlights, quiz-router,
newsletter, form (base only), store-locator (Maps key from the vip-config-style DA sheet;
degrade to list view when absent — never bundled).
Include per-block `_<name>.json` model files with entries merged into this repo's
component-definition/filters/models.json (the installer merges them into user repos at
create time — do NOT copy Jen's regenerated 6738-line component-models wholesale).

## Wave 2 — native commerce blocks (one PR per block, smallest dropin surface first)

product-teaser (bake the citisignal product-teaser-* fixes in at source), search-bar,
customer-segment-personalization-block, vip-hero (de-MCCS'd), commerce-account-hub,
live-block (+live-block-premium), vip-member-block-real-v2.
Per block: rewrite `@dropins/*` 3.x imports/calls to the LKG generation APIs, verify the real
journey live (sign-in, segments, quotes, POs, req lists as applicable).
**VIP nav gating decision point — CLOSED 2026-08-17: deleted, not deferred.** header.js was
read; the insertion point exists but a patch there is not clean. More decisively, the pack's
three shared catalogs assign the SAME categories, so there is nothing for a gate to express.
See [`../../backlog/2026-08-17-bodea-shared-catalogs-are-undifferentiated.md`](../../backlog/2026-08-17-bodea-shared-catalogs-are-undifferentiated.md).

## Wave 3 — configurators + guided selling

guided-selling-luxe, uniform-configurator (+ contract-verify tool), ONE of
luxury-configurator/product-configurator-luxe (read both, keep the cleaner dropin surface,
record the choice). **Authored-page routing**: configurators mount via authored PDP pages
(e.g. an authored /products/<key>/<sku> page carrying the configurator block) instead of
patching product-details auto-routing. Verify the authored-page approach against folder-mapped
PDPs early in this wave; if it fails, the fallback is one product-details patch in a new
bodea/ ledger — decision recorded here.

## Doc pages

`.da/library/blocks/` doc page per shipped block (copy Jen's where they exist) — feeds the
bodea-blocks library contentSource at create time.
