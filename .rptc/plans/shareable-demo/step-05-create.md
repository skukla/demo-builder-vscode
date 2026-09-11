# Step 05 — Creating a project from an added demo

Item: [[EDS-13a]]. Decisions: D2, D4, D5, D6, D7. Depends on steps 01 and 04.

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
- Content: `contentSource` from the probe; `skipContent` when the SC unticked copy or no
  index was found (`storefrontSetupPhases.ts:369` already self-skips on absence).

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
- Dry check: run the five load-bearing patches in check-only mode against the created repo;
  `alreadyApplied` and `applied-would-be` are silent; a precondition miss becomes a caveat
  worded for an SC ("Product deep links may 404 on this storefront"), surfaced beside the
  PDP caveats and in the completion report. Nothing is written.
- Headless: the synthesized `source` (git URL, branch = default branch, shallow) rides
  `executorComponentLoading.ts:73` unchanged.

## Tests first

Creation-wire field-set test (one list); phase-1 branch on `isTemplate` (assert the
ARGUMENT to `createFromTemplate` vs `resetToTemplate`, not the mock's outcome); manifest
round trip of the stored row; config flags re-expressed from the stored row on a second
generate; dry check produces caveats only on precondition misses; content skipped when
unticked.

## Done when

A project is created from a real colleague repo in the Dev Host in both repo modes, its
manifest carries the row, and a second "Regenerate" produces the same `config.json` flags.
