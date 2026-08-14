# Step 02 — accs-bodea block-source repo scaffold (external)

Reference clones live in this session's scratchpad (jenhankib2bbodea + boilerplate-b2b-template
+ repo-diff.txt); re-clone if starting fresh. Repo name `skukla/accs-bodea` mirrors
`demo-system-stores/accs-citisignal`; confirm the name with the user before creating.

## 02.1 Repo scaffold

Create `skukla/accs-bodea` as a working EDS site repo (boilerplate-b2b-template-derived so its
own preview works and doc pages publish): fstab → `content.da.live/skukla/accs-bodea`,
aem-code-sync installed. Its ROLE is block source + published content site — it is NOT a
template; no package points at it as templateRepo.

## 02.2 Additive brand modules (the core-delta port, patch-free)

- `styles/bodea-theme.css`: Jen's editorial green/ink/gold palette re-expressed as an ADDITIVE
  stylesheet (token overrides + component styling that layers over HEAD's styles.css; do not
  fork styles.css). Fonts: `@font-face`/`@import` here, or via the headSnippet preconnects.
  Skip theme-purple.css and rack-finder-pages.css (dropped pages).
- `scripts/bodea-customer-group.js`: port of Jen's customer-group machinery as a standalone
  module — imports `CS_FETCH_GRAPHQL` from `../commerce.js` (exported at boilerplate HEAD
  commerce.js:45) and `events` from `@dropins/tools/event-bus.js`; on auth events runs the
  `customerGroup` GraphQL query, hashes the UID, sets the `Magento-Customer-Group` header via
  `setFetchGraphQlHeader`, session-caches. Tolerates absence of VIP config (no-op default).
  Reads the VIP allowlist from the DA sheet `/vip-config.json` when present.
- Both files are what the extension's brandAssets vendor point (step 01.2) fetches.

## 02.3 CI guards (before any block lands)

- **Import-map/generation check**: resolve the current b2b LKG SHA from
  `skukla/eds-demo-patches/b2b/last-known-good`, fetch that boilerplate tree's head.html import
  map + vendored `scripts/__dropins__` listing, and assert every `@dropins/*` specifier in this
  repo's `blocks/**` and `scripts/bodea-*.js` resolves there. This closes the gap the LKG gate
  cannot see (library blocks vs pinned template dropin generation) — red = no merge.
- **Tenant-leak grep**: fail on `sayurihanki`, tenant-id shapes, `AIza` prefixes (public repo).
- Build/lint from the boilerplate scripts.
