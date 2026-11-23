# Step 01 — Look up a project's storefront in one place

Item: [[EDS-13a]]. Decisions: D2 (the project stores the row). Depends on the contract step (portable-demos/step-01-contract) for the stored-row type. **The representative vertical slice**: if the sites fight this, revise before step 03.

**Reuse:** section B of `../portable-demos/reuse-map.md` lists every existing thing this step is built from and how (use as is / add to it / make it shared / build new). A new file, hook, shape or word not in that section names the row it replaces and why.

## Goal

Every post-creation lookup of "what storefront is this project on" goes through one
function that reads the project first and the catalog second. For shipped packages the
behaviour is unchanged (the catalog still wins), so the existing suites do not move.

## What exists

Two resolvers already: `resolveStorefrontConfig` (`edsResetParams.ts:195`, catalog by id) and
the EDS instance metadata written at `executorEdsPhase.ts:88` and read by
`templateUpdateChecker.ts:113` / `templateSyncService.ts:93`. The catalog lookups to move
(research §3b): `edsResetParams.ts:202`; `storefrontSetupConfigRehydration.ts:80`;
`configGenerator.ts:472` (`injectPackageConfigFlags`); `showDashboard.ts:223`;
`componentSummaryUtils.ts:95` (a bare `require` of the JSON); `agentsMdSections.ts:636`;
`storefrontNameMigrationForProject.ts:121`; `repairSiteConfigForProject.ts:92`;
`WizardContainer.tsx:170` (webview: gets the project's own package appended);
`executorComponentLoading.ts:146`; `edsResetRepoHelper.ts:54` (block-library audience).

## Design

- `resolveStorefrontForProject(project, packages = bundled)` in
  `src/features/components/services/` beside `demoPackageLoader.ts` (the boundary rule:
  services fetched only at the boundary; this is a pure function over a `Project`). Returns
  `{ package, storefront, source: 'project' | 'catalog' }` so callers that care (rehydration's
  log line, the dashboard subtitle) can say where the answer came from.
- The updater's `getTemplateSource` (`updateTypes.ts:90`) reads `templateOwner`/`templateRepo`
  from the EDS instance metadata, not from any row. Either it moves onto this resolver, or
  the resolver treats the instance metadata as the project-level source of template identity
  and step 05 writes the row's template fields THERE (one write, two readers is the split
  being closed). Decide in this step; do not leave a third reader.
- The project-stored row is the contract's storefront slice, on the manifest beside `selectedPackage`,
  written by step 05, read by `projectFileLoader`.
- Each of the eleven sites is moved in its own commit with its existing tests unchanged;
  `componentSummaryUtils.ts`'s `require` becomes an import through the loader.
- `storefrontSetupConfigRehydration.ts:76`: a lookup MISS logs at warn (today it is silent
  when ids are present and the lookup fails; research §3b).
- Pin: a row in `tests/templates/spine-chokepoints.test.ts` per `call-path-audit` — the
  ground-truth primitive is "read `demoPackagesConfig.packages` by `selectedPackage`", and
  after this step it occurs in the resolver only.

## Tests first

- Resolver unit tests: project row wins; catalog fallback; unknown id → `undefined` with
  `source` absent; injected `packages` (the seam-injection standard; `no-config-leaf-mocks`
  forbids mocking the JSON).
- The existing suites for every moved site run UNCHANGED (behaviour-preserving proof).
- The chokepoint pin: `grep` for the primitive outside the resolver is zero, with a positive
  control on the resolver itself.

## Done when

All eleven sites import the resolver, the pin is green, and `architecture-duplication-scan`
would no longer report the reset/update split.

## Built (2026-09-12)

`resolveStorefrontForProject(project, packages?)` in
`src/features/components/services/storefrontResolver.ts`: the project's `demo` row first,
the catalog second; returns `{ package, storefront, source }` or `undefined`. A row is
handed back as a `DemoPackage` (id `added:<owner>/<repo>`, `ADDED_DEMO_ID_PREFIX`) with one
storefront derived from its repository: template = the repository itself, no patches,
pinning, overlay or brand assets (D4). `Project.demo?: AddedDemo` is on the manifest
(`projectFileLoader` passes it through; schema regenerated). Its input is a `Pick` of three
fields, so a wizard state or a payload can call it, not only a `Project`.

**Sites.** Through the resolver now: `resolveStorefrontConfig` (reset, name migration,
config repair), config-flag injection, the dashboard subtitle, the projects list card,
the AI bundle header, and edit-mode rehydration (which now warns on a miss with both ids
present). Three of the eleven were not moved, each for a reason:

- `WizardContainer.tsx`: a webview; the wizard state has no row until step 06 puts one
  there for editing an added demo. It stays on `getPackageById`, which is the loader, so
  the pin holds. Moves in step 06.
- `executorComponentLoading.ts:146`: an error message that names the catalog file, not a
  lookup.
- `edsResetRepoHelper.ts:54`: a block-library audience check by package id, not a
  storefront lookup. An added demo's id never matches `onlyForPackages`, which is D22.

**Decision — template identity for updates.** The update checker compares
`lastSyncedCommit` against the repository that commit belongs to; the SHA and the
repository are one record, written into the EDS instance metadata at creation and on
every reset. The resolver does not read it, and `getTemplateSource` stays its one reader.
Two facts, not a split: the resolver says where a reset goes; the record says what an
update compares against. Step 05 writes both through the paths shipped brands already use
(the row on the manifest; the record through `executorEdsPhase`); Change source (step 06)
must rewrite both.

**Pin.** `spine-chokepoints.test.ts`: the catalog JSON is imported by the loader and the
resolver only; six other importers are gone (`StorefrontConfigSource` deleted with them).

**Tests that moved, and why** (the plan promised "unchanged"; these are the exceptions):

- `storefrontSetupConfigRehydration.test.ts`: the module mock of the loader became an
  injected catalog (the seam standard); its `accountContentSource` fixture was shape-wrong
  (`owner/repo` for an `org/site` field) and the typed builder caught it; the "lookup
  throws" test has no counterpart (the resolver is pure over data); the unknown-package test
  now also asserts the warn.
- `edsResetParams.test.ts` and the three `edsResetUI-*` suites: fixtures typed with
  `tests/helpers/demoPackageFixtures.ts`; the `resolveStorefrontConfig` test asserts the
  whole storefront, since that is what it returns now.
- `showDashboard-initialData.test.ts`: one fake package gained `storefronts: {}`, the field
  the type requires.

Housekeeping the gate demanded: `docs/README.md` lacked the format doc from PL-56a; the
mutation ledger's anchors for three files moved with the edits; the cast baseline fell 28 → 25.
