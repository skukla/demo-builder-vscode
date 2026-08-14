# Step 04 — DA.live content (manual/scripted ops)

Site: DA.live org `skukla`, site `accs-bodea` (matches the block-source repo name).

1. Curated copy from `sayurihanki/jenhankib2bbodea`:
   - PRUNE pages for dropped blocks (medal-rack-configurator, product-technical-details,
     promo-popup, razer-*, mccs forms/quiz, rack-finder pages) and Jen's `/customer/*` pages
     (account chrome arrives via the boilerplate-b2b overlay at creation).
   - REWRITE hardcoded hosts (`*--jenhankib2bbodea--sayurihanki.aem.live`) to relative links.
2. `/vip-config.json` sheet: VIP group-hash allowlist (+ optional Maps key) — read by the
   customer-group module and store-locator with safe empty defaults.
3. Authored configurator PDP pages (per step 03 Wave 3 routing decision).
4. PUBLISH everything (preview + live): the extension copies from the published site and needs
   `https://main--accs-bodea--skukla.aem.live/full-index.json` to resolve.
5. Closure check (scripted): every block class in published page HTML exists in accs-bodea
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
