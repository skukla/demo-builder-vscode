# Step 05 — Create a project from an added demo

Item: [[EDS-13a]]. Decisions: D2, D4, D5, D6, D7. Depends on steps 01 and 04.

**Reuse:** section F of `../portable-demos/reuse-map.md` lists every existing thing this step is built from and how (use as is / add to it / make it shared / build new). A new file, hook, shape or word not in that section names the row it replaces and why.

## Goal

The synthesized package rides the existing creation path with three differences: the repo
is created by `generate` when the template flag is set and by create-empty + git fetch
otherwise; the storefront row is persisted with the project; and the five load-bearing
code patches run as a dry check whose misses become caveats.

## What exists

- The single mapper `buildEdsConfigFromStorefront` (`edsConfigFromStorefront.ts:37`) and the
  two half-lists on the wire (`wizardHelpers.ts:526` `buildProjectEdsConfig`;
  `storefrontSetupConfigRehydration.ts:33` `PACKAGE_DERIVED_KEYS`). Research §3a: a
  synthesized storefront must reach the pipeline whole or it repeats the 2026-07-29 loss.
- Phase 1 new-repo path `storefrontSetupPhase1.ts:333` (`createFromTemplate`) and the
  existing-repo reset path `:274` (`resetToTemplate`, git fetch + read-tree).
- The template guard `storefrontSetupPhases.ts:403` (hard fail without owner/repo): the
  synthesized row sets both, so it passes.
- `populateEdsMetadata` (`executorEdsPhase.ts:72`) already persists `templateOwner`,
  `templateRepo`, `lastSyncedCommit`; no `lkgSource` for a colleague's repo (D4).
- `injectPackageConfigFlags` (`configGenerator.ts:462`): after step 01 reads the resolver,
  so the stored row's `configFlags` (from `config.json`, the dependency list, or the SC's
  switch) are written on every regenerate.
- The code-patch engine's three-state outcome (`codePatchRegistry.ts:237`) for the dry check;
  the PDP caveat plumbing in `configServiceRegistration.ts:142` for showing it.
- Pages: `contentSource` from the probe; `skipContent` only when no index was found
  (`storefrontSetupPhases.ts:369` already self-skips on absence), with the note shown in the
  Storefront area and the completion report. No tick (D5 amended).
- Blocks and their example pages (D20): the demo's content site is passed as a library
  content source (`libraryContentSources`, `edsPipeline.ts:513` `copyLibraryDocPages`) so the
  per-block example pages arrive even when pages are skipped; the palette is generated from
  the template repo's `component-definition.json` as today (`:531`).
- Block libraries offered for an added demo (D22): the shipped libraries without
  `onlyForPackages` plus the SC's custom ones, none locked, none pre-ticked unless the
  description file names them. The demo's own blocks are never registered as a library.
- Integrations (D29): when the stored row names integrations, the Integrations area starts
  with them added through `useProjectBuilder`'s existing handlers (`onAppBuilderComponentToggle`
  for catalog ids; the by-link path writing `appBuilderComponentSources` for custom apps);
  `selectedAppBuilderComponents` stays the single mesh authority. The SC can remove any.
- Sample Data (D26, D31): when the stored row names a datapack (name + version), the Sample
  Data step (`SampleDataStep.tsx`, the Commerce strip's "Datapacks" entry) starts with it
  selected, requests the catalog with `includeCommunity` when the pack is not curated, shows
  one line saying the demo asked for it, and says "not published; ask the owner to export it"
  when the pack is not in the service; a vanished version falls back to the default rule with
  a note. The SC can change it; `project.datapack` is written as today; no install runs.
- Storefront area (D21): `buildSummary.ts` `storefrontSummaryGroup` gains a first row
  "Demo — {name} · {kind}" for every EDS brand; the existing-repo tick in
  `repoSelectionInline.helpers.tsx:826` reads "Reset to {name} (replaces all content)".

## Design

- The wire carries the whole slice once (close the two half-lists as part of this step:
  one list, one place, a field-set test pinning it).
- The demo's SOURCE is the SC's fork when they kept a copy (created at add time via GitHub's
  fork call, which the extension does not use anywhere yet; the fork-status half exists in
  `forkSyncService.ts`), else the colleague's repo. We own the fork, so we can set its
  template flag ourselves: the `generate` fast path then needs nothing from the colleague.
- New-repo branch: source `isTemplate` → `generate`; else create an empty repo under the
  chosen namespace and run the existing `resetToTemplate` against the source.
- Persist: the contract's storefront slice onto the manifest beside `selectedPackage`
  (`projectConfigWriter.ts:28`), read back in `projectFileLoader.ts:186`.
- Dry check (D23): run the five load-bearing patches in check-only mode against the created
  repo; `alreadyApplied` and would-apply are silent; misses are grouped by CONSEQUENCE into at
  most three caveats in SC words (the SKU-encoding trio → "Product links on this storefront
  use a different address format from Demo Builder's product pages. Links straight to a
  product may open an empty page."; `pdp-empty-data-redirect` → "A product page with no
  matching product shows a blank page instead of sending the visitor back to the catalog.";
  `aem-assets-sku-sanitization` → "Product images from AEM Assets may not load for products
  whose SKU has special characters."), each ending "This storefront's owner controls its
  code; Demo Builder does not change it." They ride the existing `pdpCaveats` →
  `warnings` channel into the wizard's completion card (`StorefrontSetupStep.tsx:604`). Patch
  ids and targets go to the debug log. Nothing is written to the repo. The grouping table is a
  typed constant beside the patch ids, pinned by a test that fails when a sixth load-bearing
  id appears without a consequence.
- Headless: the synthesized `source` (git URL, branch = default branch, shallow) rides
  `executorComponentLoading.ts:73` unchanged.

## Tests first

Creation-wire field-set test (one list); phase-1 branch on `isTemplate` (assert the
ARGUMENT to `createFromTemplate` vs `resetToTemplate`, not the mock's outcome); manifest
round trip of the stored row; config flags re-expressed from the stored row on a second
generate; dry check produces caveats only on precondition misses; pages skipped only when no
index was found, with the note present.

## Done when

A project is created from a real colleague repo in the Dev Host in both repo modes, its
manifest carries the row, and a second "Regenerate" produces the same `config.json` flags.
