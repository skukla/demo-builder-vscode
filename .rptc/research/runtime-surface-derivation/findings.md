# Runtime-surface derivation — feasibility findings

**Date**: 2026-06-18
**Question**: Can the hand-maintained runtime-surface inventory
(`src/features/eds/services/runtimeSurfaceInventory.ts`) be regenerated
mechanically from Adobe's boilerplate, so it stops being a hand-curated list that
drifts (the `/customer/nav` bug class)?
**Method**: Static-analysis prototype (`scripts/runtime-surfaces/`) run against a
real checkout of the B2B boilerplate.
**Subject**: `adobe-commerce/boilerplate-b2b-template` @ `160b453e` (shallow clone,
2026-06-18). 350 `.js`/`.html` files scanned (`.d.ts`, README, node_modules, cypress excluded).

Raw run: `prototype-run-b2b.txt` (in this directory).

---

## Headline result

| Metric | Count |
|---|---|
| Surfaces declared by hand (current inventory) | 18 |
| Surfaces derived from boilerplate code | 23 |
| **Agree (re-derived automatically)** | **14 / 18** |
| Derived but the hand list MISSES | 9 |
| Hand list has, scan could not derive | 4 |

**Derivation re-derived 14 of the 18 hand-declared surfaces with zero human
input, and additionally found 9 surfaces the hand list never had.** The hand
list is therefore already incomplete *today* — this is the drift problem in the
present tense, not a hypothetical.

## The 9 surfaces the hand list misses (derived-only)

- `/customer/sidebar-fragment` — loaded by `commerce-account-sidebar.js` via
  `loadFragment(...)`. **Nothing in the published content links to it** (it's a
  code-loaded fragment), so reference-following discovery can never reach it, and
  it isn't declared. This is the exact shape of the `/customer/nav` bug, latent
  right now.
- `/customer/orders` — referenced by the storefront-order dropin.
- Seven B2B placeholder sheets — `placeholders/company`, `placeholders/pdp`,
  `placeholders/purchase-order`, `placeholders/quick-order`,
  `placeholders/quote-management`, `placeholders/requisition-list`,
  `placeholders/search`. Real sheets the B2B demo fetches; absent from the hand list.

## The 4 it cannot derive (hand-only) — and why

Two distinct gap classes:

1. **Fundamental gap — platform conventions (3):** `/metadata`, `/redirects`,
   `/sitemap`. Confirmed **not referenced anywhere** in the storefront's
   `blocks/` or `scripts/` — they are served by the Helix platform itself, not
   fetched by boilerplate code. No static scan of the storefront repo can ever
   derive these. They are an irreducible residual (derivable only from the Helix
   platform spec, or by runtime observation).
2. **Content-linked entry point (1):** `/customer/create-account` — not a clean
   code literal (the dropin builds it; `create-account` appears only as a
   substring). Reachable via nav/content links, i.e. by the existing
   content-crawl, or it stays in the residual.

## Tractable vs fundamental gaps (important nuance)

The first run derived only **5** agreements; a **one-character pattern fix**
(allow the `.json` suffix real code uses — `fetchPlaceholders('placeholders/checkout.json')`)
took agreement from **5 → 14**. So most early misses were *prototype pattern
narrowness*, not a limit of static analysis. The genuinely irreducible residual
is small and stable: the 3 platform conventions, plus metadata-overridable real
paths for `/nav` and `/footer` (the literal is the default; a page's
`<meta name="nav">` can override it — definitive only from content).

## Conclusion

A pure hand list is the wrong tool: it is incomplete today (misses 9) and
duplicates information that already lives, authoritatively, in the boilerplate
code. A pure derivation is also wrong: it cannot see ~3–4 platform/content
surfaces. **A hybrid is correct** — derive the code-fetched surfaces (the large
majority, including the ones the hand list misses), keep a tiny explicitly-declared
residual for platform conventions, and reconcile the two with a drift check.

The natural production home is the **ADR-006 last-known-good gate**
(`skukla/eds-demo-patches`), which already clones canonical daily — the same job
can regenerate the derived set and open a PR when it diverges from what's committed.

## Outcome (2026-06-18)

- **All 8 derived-only surfaces added to the inventory were confirmed live** on
  `main--boilerplate-b2b--adobe-commerce.aem.live` (HTTP `200` for
  `/customer/sidebar-fragment.plain.html` + the 7 `placeholders/*.json`). They were
  real documents being **silently dropped** before the fix — the hand list's
  missing-direction inaccuracy, made concrete.
- **Stop-gap shipped**: the 8 surfaces were added to `runtimeSurfaceInventory.ts`
  (with a `.plain.html` probe fix for `/customer/*` fragments) so demos are correct
  now, ahead of the generated-file flip.
- **Producer built**: the derivation + drift check is in `skukla/eds-demo-patches#1`
  (`derive-surfaces.mjs`, per-ledger check in `lkg-gate.sh`, `b2b/runtime-surfaces.json`,
  `lkg/surface-drift` PR step). Re-deriving from the pinned B2B template now starts
  green; a simulated new orphan produces a `SURFACE_DRIFT` PR with provenance.
