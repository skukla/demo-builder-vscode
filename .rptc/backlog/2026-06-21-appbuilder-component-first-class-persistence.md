# App Builder component — remaining persistence gaps (D3 dual-flow removal only)

> Date prefix = original deferral snapshot (Slice 2, 2026-06-21). Rewritten 2026-07-09
> after the slice-3 staleness research; **narrowed again 2026-07-10** after the
> integrations-flow redesign (`.rptc/plans/integrations-flow-redesign/`) shipped most of
> the remaining scope; **narrowed a third time 2026-08-23** — the whole-backlog
> re-measure found scope item 2 already shipped, and item 1 (the ReviewStep bug)
> was fixed the same day (`9a4f7afc`). Only D3 remains.

## Resolved since (do NOT redo)

- **`buildProjectConfig` serialization** — EXISTS: `wizardHelpers.ts` serializes
  `selectedAppBuilderComponents`, `appBuilderComponentSources`, and
  `additionalConsoleApis` (via `unionConsoleApiPicks`).
- **Custom-URL creation-side provisioning** — EXISTS: creation Phase 3b
  (`executor.ts` `executeAppBuilderIntegrationsPhase`) provisions custom-URL entries via
  `buildCustomIntegrationEntry` (now charset-gated). The custom door is the
  `source-custom` stage of the `AddIntegrationFlowModal` journey
  (`ui/components/integration-flow/`).
- **Edit-mode rehydration (2026-07-10)** — SHIPPED: `useWizardState`
  `buildEditModeIntegrationState` rehydrates `selectedAppBuilderComponents` (from
  `selections.appBuilder`, persisted by `buildInitialProject`),
  `appBuilderComponentSources`, and `additionalConsoleApis` (as
  `selectedConsoleApis.__existing__`). Only `selectedOptionalDependencies` remains
  un-rehydrated (see Remaining scope).
- **Summary visibility (2026-07-10)** — SHIPPED: `buildSummary.ts`
  `integrationsSummaryGroup` lists every configured integration via
  `resolveIntegrationRows`, not only mesh.

## Remaining scope

1. ~~ReviewStep App Builder row reads the wrong field~~ — **FIXED 2026-08-23**
   (`9a4f7afc`): Review renders integrations via `resolveReviewIntegrationNames`
   (`reviewStepHelpers.tsx`), riding the same `resolveIntegrationRows` spine as the
   builder summary; the dead `components.appBuilder` read is gone and pinned so it
   cannot return, and the never-wired `summarizeSelectedAppBuilderComponents` was
   deleted with it.
2. ~~`selectedOptionalDependencies` rehydration in edit mode~~ — **SHIPPED**
   (verified 2026-08-23): `useWizardState.ts` `buildEditModeIntegrationState`
   computes `meshDeps` from `selections.dependencies` and seeds
   `selectedOptionalDependencies` on edit.
3. **D3 dual-flow removal** (the whole live item now): the mesh ↔
   `selectedOptionalDependencies` mirror-write in
   `appBuilderComponentSelectionState.ts` + `useProjectBuilder`, locked by
   `useWizardState-dualFlow.test.tsx`. Do NOT remove before creation consumes mesh ids
   from `selectedAppBuilderComponents`; the auth/IO step gating depends on
   `hasMeshInDependencies` (now in `src/core/constants.ts`, consumed by
   `wizardHelpers.ts` step filtering and `storefrontSetupHandlers.ts`).

## Constraints

- Repo is PUBLIC: route any per-component secret through user-scoped VS Code settings.
- Keep the dual-flow regression test green until D3 actually removes the mirror-write.

## Kickoff prompt

"Execute the D3 dual-flow removal
(`.rptc/backlog/2026-06-21-appbuilder-component-first-class-persistence.md` — everything
else in this item is DONE, don't redo). Scope: retire the mesh ↔
`selectedOptionalDependencies` mirror-write once creation consumes mesh ids from
`selectedAppBuilderComponents`; the `hasMeshInDependencies` step-gating consumers must
move with it, and `useWizardState-dualFlow.test.tsx` is the lock to update last.
Re-measure this item's claims against the code first. Strict TDD."
