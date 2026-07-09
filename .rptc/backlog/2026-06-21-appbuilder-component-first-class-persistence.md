# App Builder component — edit-mode rehydration (+ ReviewStep visibility bug)

> Date prefix = original deferral snapshot (Slice 2, 2026-06-21). **Rewritten 2026-07-09**
> after the slice-3 staleness research (`.rptc/research/appbuilder-slice3-staleness/research.md`)
> found two of the original three claims already resolved on `develop`.

## Resolved since the original filing (do NOT redo)

- **`buildProjectConfig` serialization** — EXISTS: `wizardHelpers.ts` serializes both
  `selectedAppBuilderComponents` and `appBuilderComponentSources`.
- **Custom-URL creation-side provisioning** — EXISTS: creation Phase 3b
  (`executor.ts` `executeAppBuilderIntegrationsPhase`) provisions custom-URL entries via
  `buildCustomIntegrationEntry`; the custom door was REBUILT as `CustomIntegrationRow`
  (live in `integrationsStepBodies.tsx`). The old `showCustomDoor={false}` mechanism is
  obsolete — `ProjectBuilderStep` no longer exists and `AppBuilderComponentsStepContent`
  is production-dead (see the slice-3 item for its disposition).

## Remaining scope

1. **Edit-mode rehydration** (the one surviving original claim, deepened): `useWizardState`
   `buildEditModeState` rehydrates neither `selectedAppBuilderComponents`,
   `appBuilderComponentSources`, nor `selectedOptionalDependencies` — and the saved
   project record stores none of them (`ImportedSettings` has no fields; the persisted
   `Project` carries only the runner's deploy-state map `project.appBuilderComponents`),
   so there is nothing to rehydrate FROM. Fixing this means persisting the selections (or
   re-deriving them from `project.appBuilderComponents` + package binding).
   Design note from the research: package-BOUND components are derivable from the package
   id and need no persistence — only free-form selections have this gap.
2. **ReviewStep App Builder row reads the wrong field** (live user-visible bug,
   independent of the rest): `reviewStepHelpers.tsx` reads `components.appBuilder`, which
   the wizard hardcodes to `[]` — even a user-selected catalog integration is invisible on
   Review. Should read `selectedAppBuilderComponents` (and show custom sources).
   Small enough to fix standalone; also `BuildYourProjectSummary` shows only an API Mesh
   row (`buildSummary.ts` `integrationsSummaryGroup`) — non-mesh integrations never appear.
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
(`.rptc/backlog/2026-06-21-appbuilder-component-first-class-persistence.md` — rewritten
2026-07-09; serialization + custom-URL provisioning are DONE, don't redo). Scope: fix the
ReviewStep/BuildYourProjectSummary integration visibility (reads always-empty
`components.appBuilder`), then edit-mode rehydration of `selectedAppBuilderComponents` /
`appBuilderComponentSources` / `selectedOptionalDependencies` (requires persisting or
re-deriving them), landed WITH the D3 dual-flow removal. Strict TDD."
