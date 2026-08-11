# App Builder component — remaining persistence gaps (ReviewStep read + optionalDependencies rehydration + D3)

> Date prefix = original deferral snapshot (Slice 2, 2026-06-21). Rewritten 2026-07-09
> after the slice-3 staleness research; **narrowed again 2026-07-10** after the
> integrations-flow redesign (`.rptc/plans/integrations-flow-redesign/`) shipped most of
> the remaining scope.

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

1. **ReviewStep App Builder row reads the wrong field** (live user-visible bug):
   `reviewStepHelpers.tsx` reads `components.appBuilder`, which `buildProjectConfig`
   still hardcodes to `[]` — even a user-selected catalog integration is invisible on
   Review. Should read `selectedAppBuilderComponents` (and show custom sources).
   Small enough to fix standalone.
2. **`selectedOptionalDependencies` rehydration in edit mode**: the mesh mirror key is
   not seeded on edit, so a mesh-only project's edit session relies on the appBuilder-key
   half of the both-key check. Decide with D3 (below) — rehydrating a key that D3 wants
   to delete may be wasted work.
3. **D3 dual-flow removal** (unchanged): the mesh ↔ `selectedOptionalDependencies`
   mirror-write in `appBuilderComponentSelectionState.ts` + `useProjectBuilder`, locked by
   `useWizardState-dualFlow.test.tsx`. Do NOT remove before creation consumes mesh ids
   from `selectedAppBuilderComponents`; the auth/IO step gating depends on
   `hasMeshInDependencies` (now in `src/core/constants.ts`, consumed by
   `wizardHelpers.ts` step filtering and `storefrontSetupHandlers.ts`).

## Constraints

- Repo is PUBLIC: route any per-component secret through user-scoped VS Code settings.
- Keep the dual-flow regression test green until D3 actually removes the mirror-write.

## Kickoff prompt

"Resume the App Builder persistence remainder
(`.rptc/backlog/2026-06-21-appbuilder-component-first-class-persistence.md` — narrowed
2026-07-10; serialization, custom provisioning, edit rehydration, and summary visibility
are DONE, don't redo). Scope: fix the ReviewStep integration visibility (reads
always-empty `components.appBuilder`), then decide `selectedOptionalDependencies`
rehydration together WITH the D3 dual-flow removal. Strict TDD."
