# App Builder component — remaining persistence gaps (CLOSED — D3 shipped)

> **CLOSED 2026-08-23**: D3 (the last live scope item) was implemented on
> `feature/d3-dual-flow-removal` — the mesh ↔ `selectedOptionalDependencies`
> mirror-write is gone, `WizardState.selectedOptionalDependencies` is deleted,
> and `selectedAppBuilderComponents` is the single wizard-side mesh authority
> (serialization derives the wire's `components.dependencies` from its
> mesh-kind ids; the persisted ADR-011 model is unchanged). Execution record:
> `.rptc/complete/d3-dual-flow-removal/overview.md`. The lock test flipped to
> removed-behavior pins in `useProjectBuilder.test.ts`.
>
> Date prefix = original deferral snapshot (Slice 2, 2026-06-21). Rewritten 2026-07-09
> after the slice-3 staleness research; **narrowed again 2026-07-10** after the
> integrations-flow redesign (`.rptc/plans/integrations-flow-redesign/`) shipped most of
> the remaining scope; **narrowed a third time 2026-08-23** — the whole-backlog
> re-measure found scope item 2 already shipped, and item 1 (the ReviewStep bug)
> was fixed the same day (`9a4f7afc`). Only D3 remained.

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
3. ~~**D3 dual-flow removal**~~ — **SHIPPED 2026-08-23**
   (`feature/d3-dual-flow-removal`). The cut that landed kept the WIRE and
   PERSISTED contracts stable: `buildProjectConfig` and the storefront-setup
   payload derive `dependencies` from
   `selectedAppBuilderComponents.filter(isMeshComponentId)`, so creation
   (`loadComponentDefinitions`, mesh phase, `buildInitialProject`) and reset
   needed NO change — they transitively consume the mesh from the single
   authority. `onStackSelect` reconciles mesh ids inside
   `selectedAppBuilderComponents` (required-mesh seeding + cross-package leak
   guard); edit mode unions the persisted mesh dep back in; all readers
   (`isMeshSelected`, `anyDeployableSelected`, review predicates,
   prerequisites payload, reserved-id domain, dashboard adapter) read the one
   field. The 2026-08-23 pickup analysis cited a lock test
   `useWizardState-dualFlow.test.tsx` that no longer existed — the actual
   lock was `useProjectBuilder.test.ts`'s mirror-write suite, now flipped to
   removed-behavior pins. Dead code deleted with it:
   `meshAppBuilderComponentToComponentIds` (identity bridge),
   `hasMeshComponentSelected` (zero production callers),
   `onOptionalDependenciesChange` (zero consumers).

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
