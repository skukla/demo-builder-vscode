# Slice 2 — Integrations area: tile surface + API Mesh tile (v6 R2)

**Status:** Plan. Scope locked with the maintainer: build the **prototype's Mesh + Experience Platform tile surface** (NOT the richer typed-Add / App-Builder-App model). Do **Mesh first** (this slice); Experience Platform is a follow-up slice.
**Design source:** `.rptc/research/project-builder-ux/prototype-v6-interactive.html` → `renderIntegrations()`.
**Research:** infra map gathered 2026-06-26 (mesh toggle, Adobe I/O provisioning, sign-in gate, area plumbing) — see findings inline below.

## Goal
Replace the R1 `IntegrationsStep` placeholder with a **tile surface**, and ship the **API Mesh** tile:
- Header: "API Mesh" + a status pill + Add/Remove button.
- **Stack availability:** only eds-paas / eds-accs / headless-paas/accs (stacks whose `optionalDependencies` include a mesh id); else an "N/A for this architecture" pill, no toggle.
- **Adobe sign-in gate:** when Mesh is On but `!isAdobeSignedIn(state)` → "Needs Adobe sign-in" pill + a Sign in button (reuse the auth flow).
- **Config fold-in (Mesh On + signed in):** Adobe I/O **project** + **workspace** selectors (Choose / + Create new) + the "on create we'll provision…" list (project, workspace, OAuth S2S credential, subscribe GraphQL Service SDK). Provides `MESH_ENDPOINT`.
- Integrations stays **optional** — never blocks Finish.

## What's reused vs. new (from research)
**Reuse as-is**
- Mesh add/remove: `onAppBuilderComponentToggle` (useProjectBuilder.ts:243) — already mirrors `selectedAppBuilderComponents` ↔ `selectedOptionalDependencies` via `MESH_APP_BUILDER_COMPONENT_TO_COMPONENT_IDS` (appBuilderComponentSelectionState.ts:30). Mesh ids per stack come from `stacks.json` `optionalDependencies`.
- Sign-in gate: `isAdobeSignedIn(state)` (tileStatus.ts:39). Auth UI/flow: `AdobeAuthStep` / `useAuthStatus`.
- Adobe I/O provisioning handlers: `projectHandlers.ts` (getProjects/selectProject/checkProjectApis), `workspaceHandlers.ts` (getWorkspaces/selectWorkspace); state keys `adobeProject` / `adobeWorkspace` (webview.ts:83-84).
- Creation already consumes `selectedOptionalDependencies` (ProjectCreationStep.tsx:355) + `adobeProject`/`adobeWorkspace` — **no changes to creation**.
- Area plumbing exists: `buildYourProjectAreas` integrations (always visible), `areaSubSteps('integrations')` = null (single view, correct), `integrationsSummaryGroup` (empty — fill rows here).
- Tile/CSS base: `.service-card` family (connect-services.css) + `StatusCard`.

**Must build new**
- Tile surface in `IntegrationsStep` + an `IntegrationTile` component (header/pill/toggle/description/fold-in) + `.tile*` CSS (base on `.service-card`).
- Mesh-tile status predicate(s) in `tileStatus.ts` (e.g. `meshAvailable(state,stacks)`, `isMeshSelected`, `isMeshConfigured`).
- **The project/workspace fold-in** (the big piece — see below).
- Fill `integrationsSummaryGroup` rows (Mesh: status / project / workspace).

## The crux: project/workspace fold-in
`adobe-project` + `adobe-workspace` are still **separate conditional wizard steps** (wizard-steps.json:25/34; rendered in WizardContainer:294-297; gated so they don't show unless a mesh component needs them). The prototype folds their selection **into the Mesh tile** and removes the standalone steps.

→ Propose splitting this slice in two so the surface ships fast and the riskier fold-in is isolated:

- **2a — surface + Mesh tile (toggle, availability, sign-in gate, summary rows).** Keep the EXISTING `adobe-project`/`adobe-workspace` steps for now; the Mesh tile's config shows the chosen project/workspace **read-only** (or "set in the next step") until 2b. Self-contained, low-risk, reuses everything. Optional Finish gate preserved (`setCanProceed(true)`).
- **2b — fold the pickers into the tile + retire the standalone steps.** Extract the project/workspace picker bodies from `AdobeProjectStep`/`AdobeWorkspaceStep` into inline components driven by the same handlers; render them in the Mesh tile's fold-in; remove `adobe-project`/`adobe-workspace` from `wizard-steps.json` + WizardContainer; re-point any flow/gating that assumed those steps. Verify mesh still provisions at create.

## Files (2a)
- `src/features/project-creation/ui/steps/IntegrationsStep.tsx` — replace placeholder with the tile surface (keep `setCanProceed(true)`).
- NEW `src/features/project-creation/ui/components/IntegrationTile.tsx` — presentational tile (header + pill + Add/Remove + description + optional fold-in slot).
- NEW `.../components/MeshIntegrationTile.tsx` (or inline in IntegrationsStep) — wires Mesh: availability (stack), toggle (`onAppBuilderComponentToggle`), gate (`isAdobeSignedIn` + Sign in), read-only project/workspace display.
- `src/features/project-creation/ui/steps/tileStatus.ts` — mesh predicates.
- `src/features/project-creation/ui/steps/buildSummary.ts` — `integrationsSummaryGroup` rows (Mesh status / project / workspace).
- `src/core/ui/styles/custom-spectrum.css` — `.integration-tiles` / `.int-tile*` (base on `.service-card`).
- Tests: IntegrationsStep (surface + toggle + gate + always-passes), tileStatus mesh predicates, buildSummary integrations rows.

## Verification
`tsc` + whole-repo `lint` + full `jest` + `compile:webview`; F5 — Integrations area shows the Mesh tile; Add/Remove toggles the mesh dependency; on a non-mesh stack the tile reads N/A; signed-out shows the gate; Finish never blocks.

## Open decisions
- 2a/2b split as above, or do the full fold-in in one slice? (Recommend the split.)
- Experience Platform is a separate later slice (net-new).
