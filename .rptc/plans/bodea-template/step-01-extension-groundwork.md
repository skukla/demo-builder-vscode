# Step 01 — Extension groundwork (TDD, this worktree)

All changes land behind `hidden: true`. Run the `gate` skill after each substep.
Line numbers are from research on `develop` — re-locate before editing.

## 01.1 Bodea package + bodea-blocks library (data + pins)

`src/features/components/config/demo-packages.json` — 5th package, mirroring `custom`'s
thin-layer shape (`demo-packages.json:86-187`):

- id `bodea`, name `Bodea`, `hidden: true`, `featured: false`, `requiresMesh: false`,
  `addons: { "adobe-commerce-aco": "excluded" }`.
- `configFlags`: `commerce-b2b-enabled: true`, `commerce-companies-enabled: true` (booleans
  only — no type widening; the VIP allowlist lives in a DA content sheet, not configFlags).
- `configDefaults`: placeholder store codes until read from the real backend (step 05).
- Storefronts `eds-paas` + `eds-accs` (accs featured), each:
  `templateOwner/templateRepo: adobe-commerce/boilerplate-b2b-template`,
  `source.url: https://github.com/adobe-commerce/boilerplate-b2b-template`,
  `contentSource: { org: skukla, site: bodea-source }`,
  `accountContentSource: { org: adobe-commerce, site: boilerplate-b2b }`,
  `codePatches`: the six b2b ids (as `custom` lists them),
  `codePatchSource: { owner: skukla, repo: eds-demo-patches, path: b2b, lkgFile: b2b/last-known-good }`,
  plus the new `brandAssets` field from 01.2.

`src/features/components/config/block-libraries.json` — new entry:
id `bodea-blocks`, `type: storefront`, `source: { owner: skukla, repo: bodea-source, branch: main }`,
`nativeForPackages: ["bodea"]`, `onlyForPackages: ["bodea"]`, `stackTypes: ["eds-storefront"]`,
`contentSource: { org: skukla, site: bodea-source }`.

RED first (pin suites are the spec):
- `tests/templates/demo-packages-data.test.ts` — packages 4→5, id list, storefronts 8→10,
  new bodea structural block: thin-layer shape pinned (codePatchSource PRESENT with path b2b +
  lkgFile, templateRepo boilerplate-b2b-template, configFlags b2b pair, accountContentSource).
- `tests/features/project-creation/ui/helpers/demoPackageLoader.test.ts` — length 4→5 (×2);
  selectable set unchanged + `not.toContain('bodea')` while hidden.
- `tests/features/components/services/blockLibraryLoader.test.ts` — bodea-blocks native+locked
  for bodea, absent for all other packages (existing exact-list pins stay green via onlyForPackages).
- Schema: `demo-packages.schema.json` gains `brandAssets` (01.2). No other schema change.

## 01.2 Brand-assets vendor point (the one new mechanism; TDD)

Purpose: carry the additive theme + customer-group module into generated storefronts —
ADR-006's prescribed shape for brand CSS ("one vendored link in head.html + an additive brand
stylesheet"), generalized minimally. Follows `pdp404HandlerPublisher.ts` (marker-bounded,
idempotent, stale-SHA-retry, non-fatal) — read it first as the pattern.

Design (data-driven, no bodea knowledge in code):
- New storefront field in demo-packages: 
  `brandAssets: { source: { owner, repo, branch }, files: [{ from, to }], headSnippet?: string-template }`
  Bodea value: files `styles/bodea-theme.css → styles/bodea-theme.css`,
  `scripts/bodea-customer-group.js → scripts/bodea-customer-group.js`; headSnippet adds the
  marker-bounded `<link rel="stylesheet" href="/styles/bodea-theme.css">` + font preconnects +
  `<script type="module" src="/scripts/bodea-customer-group.js">`.
- New service `src/features/eds/services/brandAssetPublisher.ts`: fetch file contents from the
  source repo (raw, at branch HEAD), write via `GitHubFileOperations` (net-new files = simple
  create; head.html edit = marker-bounded replace, reusing `replaceMarkedBlock` from
  `pdp404Snippet.ts`). Idempotent by marker + content-hash. Non-fatal proceed-and-warn, joins
  the existing patch report toast.
- Pipeline wiring: a phase alongside the block-library step in `edsPipeline.ts` (create) and
  the reset path (`edsResetRepoHelper.ts`) so create and reset stay byte-identical — mirror how
  `pipelineApplyBlockCodePatches` is wired in both.
- Threading: `buildEdsConfigFromStorefront` (`edsConfigFromStorefront.ts`) + rehydration
  whitelist (`storefrontSetupConfigRehydration.ts`) + `extractResetParams` — same seams every
  other storefront field rides; their tests pin the field set and will drive the change.

RED first: brandAssetPublisher unit suite (create-new-file, marker-idempotence, stale-SHA retry,
non-fatal failure); edsConfigFromStorefront field-set test gains brandAssets; pipeline wiring
test asserting the phase runs for a package with brandAssets and skips without.

Descoped deliberately: no generic asset transformation, no versioning (branch HEAD is the
contract — the block library reads the same repo the same way), Rule-of-Three note that
citisignal brand CSS could migrate onto this later.
