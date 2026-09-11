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
