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
