# Plan: "Add an Integration" modal catalog + App Builder app as a wizard integration

> **SHIPPED, then SUPERSEDED (2026-07-10)** by `.rptc/plans/integrations-flow-redesign/`:
> the components this plan built (`AddIntegrationModal`, `AppBuilderIntegrationCard`,
> `DeployablesBody`/`integrationsStepBodies`) were replaced by the `integration-flow/`
> module (AddIntegrationFlowModal journey + result rows). Kept as history.

Worktree: `demo-builder-vscode.worktrees/feature/add-integration-appbuilder`
(branch `feature/add-integration-appbuilder` off `feature/mesh-card-creation-ux` @ b1a5211d).

## Goal
Replace the inert dashed "+ Add an integration" slot on the Integrations "Services"
screen with a real **modal catalog** (Both: `kind:'integration'` catalog entries + a
custom GitHub-URL door), and make a selected **App Builder app** a first-class wizard
integration that **deploys at project creation** — reusing the existing Model B keyed
runner rather than the superseded slice-1 singular path.

## Decisions (user-confirmed)
- **Modal source**: Both catalog entries + custom-URL door (dashboard-picker parity).
  The integration catalog is empty today, so only the URL door renders now; future
  `kind:'integration'` entries appear automatically.
- **Deploy timing**: at project creation (thread selection → creation config → a deploy
  phase after mesh, reusing `appBuilderComponentRunner.addAppBuilderComponent`).
- **Destination is shared**: `state.adobeProject` / `state.adobeWorkspace` are demo-level
  fields the mesh card already writes; the app card reads/writes the SAME fields — mesh
  and the app deploy to one shared Adobe I/O project/workspace. No destination refactor.

## Reuse map (do NOT rebuild)
- Presentational `IntegrationCard` + `SelectionCheck` + `.int-card*` CSS.
- Selection toggle `useProjectBuilder.onAppBuilderComponentToggle` (already correct for a
  non-mesh id: writes only `selectedAppBuilderComponents`).
- `anyDeployableSelected` (already counts app builder components).
- Catalog config `app-builder-components.json` + loader `appBuilderComponentCatalogLoader`
  + selection `getSelectableAppBuilderComponents`.
- Deploy runner `appBuilderComponentRunner.addAppBuilderComponent` + `buildDefaultRunnerDeps`.
- Modal `DialogContainer` + `core/ui/components/ui/Modal.tsx`.
- Catalog-render + URL-door logic from dashboard `AddAppBuilderComponentPicker`.
- Destination field components: `AdobeAuthStep`, `AdobeProjectField`, `AdobeWorkspaceField`.

## Batches (TDD, sequential)

### Batch 1 — creation wiring + gate (pure logic, no UI)
The single biggest gap: a selected app never reaches creation.
- **1a** `wizardHelpers.ts` (~:686): thread integration-kind `selectedAppBuilderComponents`
  into `components.appBuilder` (today hardcoded `[]`). Mesh continues via its dual-flow;
  only `kind:'integration'` ids flow here (exclude mesh ids).
- **1b** `executor.ts`: add an App-Builder-integration deploy phase AFTER `executeMeshPhase`
  — for each `components.appBuilder` integration entry, resolve its catalog entry and run
  `addAppBuilderComponent(project, entry, buildDefaultRunnerDeps(ctx))` (clone → subscribe
  APIs → deploy → persist keyed state). No-op when none selected. Gated by the same
  `projectRequiresAppBuilder` + permission check mesh uses.
- **1c** Completion gate: make the ACTIVE Continue gate deployable-generic. `isIntegrationsComplete`
  (tileStatus) is mesh-specific — if no mesh but an app is selected it wrongly returns
  complete without a destination. Fix: when ANY deployable is selected, require the shared
  destination (signed-in + `adobeProject.id` + `adobeWorkspace.id`), independent of mesh.
- Tests: creation config carries integration ids (mesh excluded); executor calls the runner
  per integration + skips when none; gate requires destination for an app-only selection.

### Batch 2 — AddIntegration modal + real Add button (UI)
- New `AddIntegrationModal` (`DialogContainer` + `Modal title="Add an integration"`):
  a catalog list of `kind:'integration'` entries (each an Add row) + a custom GitHub-URL
  door (reuse `parseGitHubUrl` validation). Adding a catalog entry →
  `onAppBuilderComponentToggle(id, true)`; adding a custom URL → the custom-entry flow
  (`{owner,repo}` → synthesized integration id). Close on add.
- `integrationsStepBodies.tsx` `DeployablesBody`: replace the inert `.int-add-card` div
  with a real "+ Add an integration" button that opens the modal. Thread the toggle +
  custom-add handlers down from `IntegrationsStep` / `useProjectBuilder`.
- Tests: modal opens/closes; empty catalog shows only the URL door; URL door validates
  (rejects non-GitHub) + adds; a (fixture) catalog entry renders + adds; add closes modal.

### Batch 3 — AppBuilderIntegrationCard (UI)
- New `AppBuilderIntegrationCard` (sibling of `MeshIntegrationCard`) over the SAME
  presentational `IntegrationCard`. Config body (simpler than mesh — no in-card API-enable;
  the runner subscribes at deploy):
  - signed-out → `AdobeAuthStep` gate;
  - signed-in → shared destination (reuse `AdobeProjectField`/`AdobeWorkspaceField` bound to
    `state.adobeProject`/`adobeWorkspace`; show committed summary rows when set) + a source
    row (`owner/repo`); Remove action via `onToggle(false)`.
  - `collapsible`/`summary` (`owner/repo · workspace`) once configured, mirroring mesh.
- `DeployablesBody`: render one `AppBuilderIntegrationCard` per selected integration entry
  (resolve entries via the catalog/keyed state), below the mesh card, above the Add button.
- Tests: renders per selected integration; Remove toggles selection off; source shown;
  destination summary reused from shared state; collapse when configured.

## Verification
Per batch: `gate` (scoped jest + `tsc --noEmit` + eslint). Final: full `npm run lint`
+ `tsc` + full jest; manual EDH — add an App Builder app via the modal (URL door), see its
card + shared destination, create the project, watch it deploy after mesh, confirm keyed
`project.appBuilderComponents` state + a live URL.

## Risks / notes
- Executor deploy phase is the riskiest seam (real `aio app deploy`); keep it a thin adapter
  over the existing runner + mirror the mesh phase's guard/progress exactly.
- No new `kind:'integration'` catalog entry ships (none exists for real); the URL door is the
  working path. A fixture entry is used only in tests.
- Watch god-file/complexity limits: `AppBuilderIntegrationCard` and the executor phase must
  stay within the 350/500-line + complexity-25 budgets (extract bodies like the mesh card did).
