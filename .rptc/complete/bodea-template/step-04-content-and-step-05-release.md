# Step 04 — DA.live content (manual/scripted ops)

Site: DA.live org `skukla`, site `bodea-source` (matches the block-source repo name).

Bodea = B2B network enclosures / data-center racks. Jen's repo also holds a separate Marine
Corps (MCCS) demo — none of that content travels.

1. Curated copy from `sayurihanki/jenhankib2bbodea`:
   - PRUNE pages for every dropped block (2026-08-14 curation, commit 079522f):
     medal-rack-configurator, product-technical-details, promo-popup, razer-*, ALL mccs
     content (forms/quiz/uniform), uniform-configurator, age-gate, age-verification,
     store-locator, quiz-router, live-block, live-block-premium, vip-member-block-real-v2,
     vip-hero, product-configurator-luxe — plus Jen's `/customer/*` pages (account chrome
     arrives via the boilerplate-b2b overlay at creation).
   - The 28 shipping blocks are the allowlist: any page referencing anything else is pruned
     or rewritten. Closure check in step 5 enforces this.
   - REWRITE hardcoded hosts (`*--jenhankib2bbodea--sayurihanki.aem.live`) to relative links.
2. `/vip-config.json` sheet: VIP group-hash allowlist (+ optional Maps key) — read by the
   customer-group module and store-locator with safe empty defaults.
3. Authored configurator PDP pages (per step 03 Wave 3 routing decision).
4. PUBLISH everything (preview + live): the extension copies from the published site and needs
   `https://main--bodea-source--skukla.aem.live/full-index.json` to resolve.
5. Closure check (scripted): every block class in published page HTML exists in bodea-source
   blocks/ or the boilerplate; every doc page's block exists. Run before every re-publish.

# Step 05 — End-to-end verification, unhide, release

1. Dogfood in the Extension Dev Host (worktree, `npm run watch:all`), hidden flipped locally:
   full eds-accs creation — LKG pin + 6 patches → content copy + account overlay →
   bodea-blocks install + doc pages → brand-assets vendor (theme visible, customer-group
   header set after sign-in) → publish. Then journeys: VIP login (segment nav/blocks),
   account hub (quotes, req lists, POs), search-bar, authored configurator page add-to-cart.
2. Reset round-trip: thin-layer reset re-pins to LKG and re-applies patches + vendor + blocks —
   result must match a fresh create.
3. Read real store/website/view codes off the Bodea backend → `configDefaults`; run the VIP
   group-hash determinism falsifier → final `/vip-config.json` values.
4. Flip `hidden: false` + selectable-set pin update in demoPackageLoader.test.ts.
5. `gate` green; commit on the worktree branch; merge to develop per repo convention.


---

## Step 05 progress (2026-08-15)

**Item 3 — DONE, no code change needed.**

- **Store codes verified against the seeded backend.** The live wizard picker chose
  `base` / `main_website_store` / `default` for a real Bodea project — exactly what
  `configDefaults` already ships. The 2026-08-14 decision to ship `base` was right.
- **`/vip-config.json` was never implemented** — zero references in the extension or in
  `bodea-source`. The VIP sheet is moot; the VIP story lives in
  `customer-segment-personalization-block`, which reads real segments from the
  personalization dropin.
- **The group-hash determinism falsifier is satisfied.** The 0-20 pricing sweep returned
  DIFFERENT prices for groups 6 and 7, which only happens if `sha1(base64decode(uid))`
  produced headers the backend matched to real groups; a wrong hash returns guest pricing
  for every id. No separate falsifier run is needed.

**Items 1, 2 and 4 — blocked on a Dev Host run, by design.** The dogfood create and the
reset round-trip need a human at the wizard. `hidden: true` is the gate marker for that
run, so item 4 (unhide) is deliberately NOT done ahead of it — flipping it early would make
the flag meaningless. `smoke-test.md` section 7 lists the delta that has never been through
a create (schema vendoring, 28 doc pages, nav/categories, and the repricing fix), and
section 8 lists the three edits the unhide needs.

**No cleanup owed.** The earlier throwaway repo, DA site and Config Service entry are
reusable: a create or reset overwrites them and `brandAssets` re-vendors from
`bodea-source@main`, so the fixed customer-group script and the schema land on the way
through. (An earlier note here said the stale script made that project unusable for the
repricing check — that was too strong. It only holds for inspecting an old project
without re-running create.)

## Step 05 outcome (2026-08-16) — SUPERSEDED the next day, see the correction below

**Items 1-3 done. Item 4 (unhide) DEFERRED by the owner; item 5 (merge) follows it.**

The package works — the owner ran the dogfood and reports Step 05 fine. What changed is the
gate: `hidden: true` no longer means "unverified", it means **"not yet redesigned"**. The
storefront's look and feel is being reworked, and that work is deliberately coupled to building
the AI tooling that supports it rather than done by hand.

Consequences for anyone picking this up:

- **Do not unhide on the strength of the smoke test.** Sections 1-7 pass; that was the old
  criterion and it is satisfied. The current criterion is the redesign.
- The three unhide edits are listed in `smoke-test.md` section 8 and are still correct.
- The tooling half is `.rptc/backlog/2026-08-16-mcp-surface-for-sc-design-work.md`, on branch
  `docs/mcp-surface-for-sc-design`. Bodea is its driving use case: the operation sort in that
  item is literally the record of building this storefront by hand.
- The theme trap matters more now than it did: `styles/bodea-theme.css` is vendored by
  `brandAssets` from `skukla/bodea-source`, so redesign work done in a generated project is
  **destroyed on the next reset**. Durable theme changes land in `bodea-source` and re-vendor.

---

## Correction (2026-08-24): the unhide SHIPPED 2026-08-17

The deferral above held for one day. `6fd76a222` ("feat(bodea): unhide the Bodea
package", on develop and master) closed items 4 and 5 with all four pre-unhide
conditions met — store scope read from the live instance (`bodea` /
`bodea_store` / `bodea_us`, superseding the earlier `base`/`default` reading),
group-hash portability answered, the configurator keeper settled by the port,
and VIP nav gating deleted rather than deferred. Both pin tests named in
`smoke-test.md` section 8 were updated in the same commit and assert the
unhidden state today.

**But the gate was overridden, not met.** The redesign this deferral was waiting
on did not happen before the unhide and has still not happened — the owner
confirmed 2026-08-24 that the storefront design is broken. So the package is
live and selectable with an unfinished design, which is a deliberate state, not
an oversight: the redesign is sequenced behind building better AI coverage for
the extension, because it is meant to be done with tooling rather than by hand
(`2026-08-16-mcp-surface-for-sc-design-work.md`). This file is left as the
record of how the gate was reasoned about — and of the fact that shipping
overtook it.
