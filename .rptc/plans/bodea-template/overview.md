# Bodea Demo Package — Plan Overview (v2: thin-layer, ADR-006-conformant)

## Step 0: RPTC Re-initialization (ALWAYS FIRST)

If starting fresh (context was cleared), re-invoke the workflow before executing any step:

```
/rptc:feat "Plan is approved, continue to implementation. Plan: .rptc/plans/bodea-template/ (worktree feature/bodea-template)"
```

## Context

Synthesize a new **Bodea** demo package from Jen's `sayurihanki/jenhankib2bbodea` storefront
(native-commerce blocks + VIP/customer-group machinery + theme; forked ~Feb 2026, one dropin
generation behind) and the existing Custom (B2B+B2C) template (boilerplate-b2b-template +
6 `eds-demo-patches/b2b` patches). Focus: **native commerce functionality** — simulated blocks
and client-branded cruft are dropped.

**v2 note:** a fork architecture (`skukla/bodea-template` as a maintained fork) was approved
and then WITHDRAWN after research into the isle5/CitiSignal history: every fork-style template
in this system rotted (isle5: hand-sync stopped 2026-03, now 140 commits + 1 dropin major
behind; buildright: 2–3 majors behind, never shipped; Jen's own fork: 1 generation in 5 months),
while the thin-layer LKG machinery advanced daily-green for 40+ days. ADR-006 (2026-06-10,
owner-decided) rejected fork maintenance "by the numbers". Bodea therefore ships **thin-layer**,
like custom/citisignal.

## Locked decisions

1. **Thin-layer architecture.** `templateOwner/templateRepo = adobe-commerce/boilerplate-b2b-template`,
   pinned via the existing LKG machinery (`codePatchSource` path `b2b`, `lkgFile b2b/last-known-good` —
   the same 6 patches as `custom`; a separate `bodea/` ledger family is created only when the
   first Bodea-specific patch actually exists). Updates flow via the proven thin-layer path.
   **eds-demo-patches initially unchanged.**
2. **Blocks (~35) are additive**, shipped from a new block-source repo `skukla/accs-bodea`
   (name mirrors `accs-citisignal`; final name = user's call) via a `bodea-blocks` library
   entry (`nativeForPackages`/`onlyForPackages: ["bodea"]`). That repo runs a CI import-map
   check validating every `@dropins/*` import in its blocks against the **b2b LKG's** vendored
   dropin generation, plus a tenant-leak grep.
3. **Theme is additive + vendored**: net-new `styles/bodea-theme.css` (+fonts) fetched from the
   block-source repo and vendored into the generated storefront, with a marker-bounded
   `<link>`/font snippet in `head.html` — the ADR-005 `pdp404HandlerPublisher` shape, which
   ADR-006 explicitly prescribes for brand CSS. This is the one NEW extension mechanism
   ("brand assets vendor point"), small and data-driven.
4. **Customer-group/VIP machinery is additive**: net-new `scripts/bodea-customer-group.js`
   module importing `CS_FETCH_GRAPHQL` (exported at boilerplate HEAD `scripts/commerce.js:45`)
   + `@dropins/tools/event-bus`, subscribing to auth events and setting the hashed
   `Magento-Customer-Group` header. Vendored + loaded via the same vendor point.
   Zero patches on `commerce.js`.
5. **Descope-by-default for the two remaining core deltas** (patch policy: default answer is no):
   - Configurator PDP auto-routing → replaced by **authored PDP pages** carrying configurator
     blocks (content-native, zero patches). Verify during Wave 3.
   - Header VIP nav gating → deferred unless a clean single-patch insertion point exists at
     port time (VIP story still delivered by segment-gated blocks). VIP group-hash allowlist
     lives in a DA content sheet (`/vip-config.json`) read by the blocks with safe empty default.
6. **Block scope** (unchanged from v1): native (commerce-account-hub,
   customer-segment-personalization-block, search-bar, live-block(+premium),
   vip-member-block-real-v2, de-MCCS'd vip-hero) + native-backed (uniform-configurator, ONE of
   luxury-configurator/product-configurator-luxe, guided-selling-luxe, product-teaser) +
   ~25 neutral/marketing. DROPPED: simulated trio (medal-rack-configurator,
   product-technical-details, promo-popup) + cruft (razer-*, form-2/3/4, mccs variants,
   superseded vip prototypes, how-it-works-stats-2, AI dirs, runbooks, portability package).
7. **Content** (unchanged): DA.live site under `skukla` matching the block-source repo name —
   curated one-time copy of Jen's site (prune dropped-block + account pages, rewrite hosts),
   published; account chrome via `accountContentSource: adobe-commerce/boilerplate-b2b` overlay.
   No contentPatches (we own the site).
8. **Rollout**: package lands `hidden: true`; unhide is the release step.

## Steps

| Step | What | Repo | Kind |
|---|---|---|---|
| 01 | Extension: bodea package + bodea-blocks entries, test pins, brand-assets vendor point (TDD) | demo-builder-vscode (this worktree) | Code (TDD) |
| 02 | accs-bodea repo scaffold: theme CSS + customer-group module + CI guards | skukla/accs-bodea (new) | External repo |
| 03 | Block port waves (marketing → commerce → configurators), doc pages | skukla/accs-bodea | External repo |
| 04 | DA.live curated content copy + publish + closure check | DA.live | Manual/scripted ops |
| 05 | End-to-end verification, descope decisions confirmed, unhide, release | demo-builder-vscode + live | Code (small) + manual |

Step 01 can land first, hidden. 02→03→04 sequential; 05 needs all.

## Open items resolved during execution (never assumed)

- `configDefaults` store/website/view codes: READ from the actual Bodea backend before unhide.
- VIP group-hash determinism across instances: named falsifier — create demo data fresh,
  compare Catalog Service group hashes; result decides the vip-config sheet values' portability.
- Configurator keeper: read both luxe configurators during Wave 3, keep the cleaner one.
- VIP nav gating: patch-or-defer decision at Wave 2 with the real insertion point in front of us.
- Whether `bodea` needs its own ledger family (trigger: first Bodea-specific patch).

## Verification (end-to-end)

1. Extension: `gate` skill green per step-01/05 commit; pin suites are the spec (TDD).
2. accs-bodea CI: import-map check vs b2b LKG generation + tenant-leak grep red = no merge.
3. Live: `aem up` against the curated DA site during port; dogfood full creation in the
   Dev Host (hidden flipped locally): create → LKG pin + patches → content copy + overlay →
   bodea-blocks install + doc pages → theme/module vendor → publish → VIP login flow →
   account journeys → configurator page → reset round-trip (thin-layer reset re-pins to LKG).
