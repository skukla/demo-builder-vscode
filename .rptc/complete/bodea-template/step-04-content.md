# Step 04 — DA content for `skukla/bodea-source`

**Decision (user, 2026-08-15): seed the datapack's `main` version and update Jen's content to
match it.** Not the reverse — `legacySkus-20260522` exists but `main` is current, so the catalog
is the fixed point and the authored content moves.

**Goal: preserve as much of Jen's authoring and design as possible.** Her substantial work is the
homepage, the chrome and the fragments; what needs changing is the thin catalog-bound layer.

## Source survey (measured from her published sitemap, 87 pages)

Her site indexes at **`/sitemap.json`**, not `/full-index.json`. If bodea-source ends up the same
way, the package needs `contentSource.indexPath: "/sitemap.json"` (the isle5 precedent) — the
default is `/full-index.json`.

### Keep essentially as-is (~12) — real authoring, no catalog binding
`/nav` (6.3KB) · `/footer` (6.1KB) · `/` (21KB homepage) · `/support` · `/privacy-policy` ·
`/blog/my-first-post` · `/products/default` (PDP template) · `/empty-cart` · `/mini-cart` ·
`/enrichment/category-banner` · `/enrichment/product-banner` ·
`/fragments/enterprise-platform-hero` · `/fragments/hero-5`

Homepage block order: `targeted-block, search-bar, features-grid, how-it-works-stats-2,
accordion, product-teaser, catalog-highlights, newsletter`. **All present in our set except
`how-it-works-stats-2`** — swap it for `how-it-works-stats` (we kept the original, dropped the
near-duplicate).

### Keep but re-point (~7) — thin bindings, mechanical fix
`/server-racks` · `/network-enclosures` · `/power-cooling` · `/cable-management` ·
`/accessories` — each is just `product-list-page` + `enrichment` + `product-recommendations`.
Plus the Bodea PDP (`/products/network-enclosures-ne-12u-glassfront/bd-ne-12u-glass`) and
`/vips-only-category`.

Her categories (`server-racks`, `network-enclosures`, `power-cooling`, `cable-management`,
`accessories`) and SKUs (`bd-ne-12u-glass`) do not exist in `main`, which has
`racks`/`servers`/`switching`/`wi-fi`/`cables`/`cooling-equipment`/`critical-power-equipment`/
`software`/`services` and SKUs `vrrack`, `bodea-vr-rack`, `switchenterprise24`, …
**Mapping table required — pending the `legacySkus` vs `main` diff**, which will say whether this
is a rename (mechanical) or a different catalog (author fresh for these seven only).

### Drop (~68)
33 block-library doc pages (we generate our own for the 28 shipped blocks) · 4 fragments for
removed dashboards · 8 Razer pages · ~12 `index-2`/`index-3-copy`/`-copy-copy` scratch pages ·
`/customer/*` (the `accountContentSource` overlay supplies these) · apparel pages ·
medal-rack + uniform material · `/quiz-router` (block dropped).

## Mechanism — and the framing that matters

**`bodea-source` is OUR content repo, and after the migration its content is canonical.** That is
the whole point of owning it. Patches are a copy-time adaptation for a source someone *else*
controls (citisignal patches `demo-system-stores` content because we cannot edit it). We can edit
ours, so nothing about Bodea should be patch-shaped in steady state.

Concretely:
- The Jen → `bodea-source` migration is a **one-time transform**, not a mechanism. Any tool is
  fine (a script, or `copyContentFromSource` with its patch hook used as a convenient transform);
  it runs once and is then done.
- **`contentPatches` / `contentPatchSource` stay ABSENT from the bodea package** — verified in
  `demo-packages.json` for both storefronts. Project creation copies our content verbatim, with
  no per-create rewriting and nothing to keep in sync.
- Any later catalog change is edited **directly in `bodea-source`**, where it is visible and
  reviewable — never re-derived from Jen's site or layered as a patch. Her site is an ancestor,
  not an upstream: after the migration we never read from it again.

(Contrast `codePatchSource`, which stays and *should* — that patches `boilerplate-b2b-template`,
which we genuinely do not own.)

## Sequence

1. Obtain the legacy→main mapping (SKUs + category url_keys).
2. One-time copy: Jen's keep-list → `skukla/bodea-source` DA, applying the mapping to the
   re-point set and the `how-it-works-stats-2` → `how-it-works-stats` swap.
3. Author `/data/guided-selling/bodea-rack-finder.json` (Jen's schema — Bodea-specific, travels)
   with its `categoryPath`/`skus` re-pointed to `main`.
4. Generate the 28 `.da/library/blocks/*` doc pages from the block reference data.
5. Publish everything (preview + live); confirm the index resolves.
6. Closure check: every block class referenced by a published page exists in the shipped set.
7. Re-run the smoke test end to end.

## Open

- **DA write access** — needs the user's DA token to script against `admin.da.live`, or the
  content generated for manual import.
- **`indexPath`** — set on the package if bodea-source indexes at `/sitemap.json`.
