# Integrations Area Redesign — Result Rows + Guided Add-Integration Flow

## Context

The wizard's Integrations area is too busy: a permanent mesh card with a full inline config
flow, two inline "Add" rows, an ADDED section, and a Services/Adobe I/O sub-step strip all
compete in the center column. The approved division of labor: **the center column is only ever
results + a launchpad** (one collapsed summary row per configured integration + an "Add
Integration" button), and **guided configuration lives in one modal journey** (kind picker →
per-kind stages → finish lands a row). This also absorbs the deferred per-integration API-access
work (`.rptc/plans/appbuilder-shell-app/step-06.md`) as a modal stage, and fixes the summary-column
gap (only mesh has a row today).

**Locked UX decisions (user-approved):**
1. Center column = result rows + Add button only. No inline Add rows, no permanent mesh card, no sub-step strip.
2. One modal carries the whole journey (Back/Continue in the sticky footer); finish lands a collapsed row.
3. Mesh is a *kind* in the Add flow (offered when the stack supports it and it isn't added).
4. The shared Adobe project/workspace destination is configured inside the FIRST add that needs it (sign-in → project → workspace stages); later adds show "Deploys to X · Y" + Change. The `adobe-io` sub-step, the strip, and the driver's `advanceWithin`/`retreatWithin` machinery are **deleted outright**.
5. API-access stage for catalog/custom integrations (locked = requiredApis + baseline; free picks are checkboxes), keyed per integration in wizard state, serialized into `Project.additionalConsoleApis` before creation Phase 3b (subscribe union already covers it — zero new subscribe code). Dashboard "Manage APIs" parity is in scope as the final separable step.
6. Added integrations (incl. mesh) get rows in the right "YOUR PROJECT" summary column.

**Architecture (user-chose Clean):** one deep module `integration-flow/` with a 4-export public
interface; pure stage machine; single-select per journey; per-integration API keying with
remove cleanup.

> **Step 0 — RPTC re-initialization (ALWAYS FIRST on re-entry):** if context was cleared,
> re-invoke `/rptc:feat "Plan is approved, continue to implementation"`. On implementation
> start, mirror this plan to `.rptc/plans/integrations-flow-redesign/overview.md`.

## Verified findings the plan relies on

- The dashboard `listConsoleApis` handler is UNUSABLE from the wizard (needs a current project). New org-session-scoped handler: `createApiSubscriberClient(auth).getServicesForOrg(orgId)` + `computeRequiredApis(entries)` (both in `src/features/app-builder/services/`).
- Null-driver path already exists: `areaSubSteps('integrations')` → null; WizardContainer's walk and BuildYourProjectStep's fallback gate (`activeArea.status === 'completed'` → `tileStatus.isIntegrationsComplete`) are the exact locked footer gate. Delete the driver, no shim.
- `pendingAdobeProject`/`pendingAdobeWorkspace` consumers are exactly the deleted machinery → become modal-local draft. `AdobeProjectField`/`AdobeWorkspaceField` are generic and reusable as-is.
- `advanceWithin`/`retreatWithin` consumers: `driverInnerMoves` (WizardContainer) + one BuildYourProjectStep clause — both deleted; the optional pair leaves the `AreaSubStepDriver` interface.
- `IntegrationCard.tsx` has zero consumers after deletions → deleted. `VerticalStepList` stays (Commerce/Storefront use it).
- Phase 3b already unions `project.additionalConsoleApis` (`appBuilderComponentRunnerDeps.ts:118`); creation only writes the field on the Project literal (executor ~L318, before Phase 3b).
- Mesh mirror-write (`useProjectBuilder.onAppBuilderComponentToggle` → `selectedOptionalDependencies`) is load-bearing — reused verbatim by finish commits, never redesigned.
- **Pre-seeded mesh (package requirement)**: `onStackSelect` seeds `selectedOptionalDependencies` via `resolveMeshOptionalDeps` when the package/storefront declares `requiresMesh` (`demoPackageLoader.getResolvedMeshRequirement`). The mesh-selected check reads BOTH keys, so a required-mesh project arrives at Integrations with mesh already selected but no destination. Seeding is untouched; the new UI must render it as a result row needing setup (below). No non-mesh requirement mechanism exists today; rows derive from state, so any future seeding surfaces automatically.

## Module layout

```
src/features/project-creation/ui/components/integration-flow/
├── index.ts                    # Public API: AddIntegrationFlowModal, IntegrationResultRow,
│                               #   resolveIntegrationRows, types (IntegrationRow, FlowMode)
├── flowStages.ts               # PURE: stage ids, order derivation, next/prev, canContinue, labels
├── useIntegrationFlow.ts       # Stage-machine hook (modal-local FlowDraft; finish commits)
├── AddIntegrationFlowModal.tsx # Shell: DialogContainer + core Modal, stage switch, sticky footer
├── integrationRows.ts          # PURE resolver: selected integrations (incl. BOTH-key mesh, incl.
│                               #   package-seeded) → rows with needsSetup flag (no destination yet)
├── IntegrationResultRow.tsx    # name · kind/source · "Deploys to"+Change OR "Not set · Set up"
│                               #   (opens modal in destination mode) · Remove; mesh embeds MeshApiEnableRow
├── MeshApiEnableRow.tsx        # MOVED from ui/components/ (sole consumer here)
└── stages/  KindStage · CatalogStage (SINGLE-select) · CustomStage (CustomUrlForm relocated)
             · DestinationStage (AdobeIoStep body relocated; pendings draft-local)
             · ApiAccessStage (wraps the shared ApiAccessPicker; see guidance below)
```
Consumers (`IntegrationsStep`, `buildSummary`, tests) import ONLY from `index.ts`.

**Shared picker**: `src/core/ui/components/selection/ApiAccessPicker.tsx` — presentational
grouped API list used by BOTH the wizard's ApiAccessStage and the dashboard's ManageApisModal
(core placement respects the no-cross-feature-import rule; two concrete consumers).

## API-access guidance (how the user finds the RIGHT APIs)

The stage is not a raw entitlement dump; it guides:
1. **Groups, in order**: "Required by this integration" (locked — checked + disabled, from
   requiredApis + baseline) → "Suggested" (from a new OPTIONAL `suggestedApis: string[]` field
   on catalog entries — unchecked but listed first with the entry's suggestion reason; empty
   for entries that declare none, group hidden) → "All available" (alphabetical by display name).
2. **Search** across name + code (SearchHeader reuse, threshold like the catalog).
3. **Display names first, codes secondary** (the org service list returns both).
4. **Helper copy** at the top: one sentence saying picks grant the app's actions access to those
   Adobe APIs — and that APIs can also be added LATER from the dashboard (Manage APIs) or by
   asking the AI (the list_console_apis → add_console_apis loop), so skipping here is safe.
5. **Catalog schema**: `suggestedApis` is additive on app-builder-components.json entries
   (follow the appbuilder-component-authoring skill: schema doc + tests; no axis-filter impact).
   The shell app entry ships without suggestions today; the mechanism is ready for curated entries.

## Stage machine

- Draft (modal-local): `{ kind?, catalogId?, customSource?, pendingProject?, pendingWorkspace?, changingDestination, selectedApis[] }`.
- Stages: `kind | source-catalog | source-custom | dest-signin | dest-project | dest-workspace | dest-summary | api-access`.
- Order derived pure over `(draft, wizardState, mode)`: **destination mode** (used by both "Set up" on a pre-seeded/unconfigured row AND "Change" on a configured one) = `[(dest-signin if signed out), dest-project, dest-workspace]`; add mode = `[kind, …source(kind), …dest, …apis]` where dest = `[dest-summary]` when destination committed (later-add) else `[(dest-signin if signed out), dest-project, dest-workspace]`; mesh skips source and api-access (its API enablement runs on the RESULT ROW via MeshApiEnableRow). The kind picker hides mesh whenever mesh is selected by EITHER key — including package-seeded mesh.
- Commit points (only wizard-state writes): Continue off dest-project commits `adobeProject` (clears workspace + `workspacesCache`); Continue off dest-workspace commits `adobeWorkspace`; `useProjectCreationPhases({skipEnabling:true})` create flow adopted as-is; **Finish** routes through unchanged `useProjectBuilder` handlers (mesh/catalog toggle, custom add) + merges `selectedConsoleApis[id] = draft.selectedApis`. Cancel discards the draft (a mid-flow-committed destination surviving cancel is accepted — matches today).
- api-access never blocks Continue (fetch failure → inline error + retry; locked APIs subscribed by union regardless).

## Removal & edit-mode semantics (user-approved)

**New project (pre-creation):** Remove = state cleanup only (selection keys + `selectedConsoleApis[id]`;
mesh also clears its mirror key). Accepted leftovers, matching today: a console project/workspace
created mid-flow stays (reusable shared state); a mesh API subscription already made by the enable
row stays (additive-by-union model). Both documented in module JSDoc.

**Editing an existing project:** rows SEED from the project; lifecycle stays on the dashboard.
- Extend `extractSettingsFromProject` (settingsSerializer.ts) to carry `appBuilderComponentSources`
  (custom integrations currently vanish in edit — pre-existing gap) and `additionalConsoleApis`.
- Wizard edit seeding maps: `selections.appBuilder` → `selectedAppBuilderComponents`; sources →
  `appBuilderComponentSources`; the project's flat `additionalConsoleApis` seeds
  `selectedConsoleApis['__existing__']` (reserved key: included in the serialization union,
  never shown per-row) so existing picks survive an edit rebuild.
- Remove in edit keeps today's rebuild semantics: not redeployed by Phase 3b, local files dropped
  by the component swap, **no remote undeploy** (pre-existing; true remove-with-undeploy is the
  dashboard's job). Stated in module JSDoc + the row's confirm copy in edit mode.

## State + serialization

- `types/webview.ts`: ADD `selectedConsoleApis?: Record<string, string[]>` (free picks per integration id; locked codes derived, never stored). REMOVE `pendingAdobeProject`, `pendingAdobeWorkspace`, `activeIntegrationsStep`, `IntegrationsSectionId`.
- `useProjectBuilder`: remove/toggle-off also drops `selectedConsoleApis[id]`.
- `wizardHelpers.buildProjectConfig` → `additionalConsoleApis: dedupUnion(values(selectedConsoleApis))` → `ProjectCreationConfig` → Project literal in `executor.ts` (~L318, before Phase 3b).
- New message `'list-org-console-apis'` `{ componentIds }` → `{ apis: [{code, name, locked}] }`; no runGuards (no project); registered in `ProjectCreationHandlerRegistry` + `handlers/index.ts`.

## Files

**CREATE**: the 12 `integration-flow/` files; `src/core/ui/components/selection/ApiAccessPicker.tsx`; `src/features/project-creation/handlers/consoleApiHandlers.ts`; (step 11) `src/features/dashboard/ui/components/ManageApisModal.tsx`.

**MODIFY**: `IntegrationsStep.tsx` (rewrite: heading/empty state + rows + Add button + modal host, no rail) · `areaSubSteps.ts` · `WizardContainer.tsx` (drop driverInnerMoves + branches) · `BuildYourProjectStep.tsx` (drop advanceWithin clause) · `buildSummary.ts` (per-integration rows) · `useProjectBuilder.ts` · `types/webview.ts` · `wizardHelpers.ts` · `handlers/executor.ts` · `ProjectCreationHandlerRegistry.ts` + `handlers/index.ts` · `projects-dashboard/services/settingsSerializer.ts` (+ the wizard edit-seeding site) · `custom-spectrum.css` · dashboard integration card (step 11).

**DELETE (src + tests, complete)**: `integrationsSections.ts` · `integrationsStepBodies.tsx` · `AdobeIoStep.tsx` · `MeshIntegrationCard.tsx` · `AppBuilderIntegrationCard.tsx` · `CustomIntegrationRow.tsx` · `AddIntegrationModal.tsx` · `appBuilderIntegrationList.ts` · `IntegrationCard.tsx` · old `MeshApiEnableRow.tsx` location · integrationsDriver + the optional inner-move methods · the 4 state keys/types · their 8 test files (`MeshApiEnableRow.test.tsx` moves).

## Build sequence (TDD; tests FIRST each step; tdd-agent-sized)

1. **`flowStages.ts` (pure)** — order per kind/mode, first-add vs later-add, destination mode with signed-out sign-in stage (the pre-seeded mesh "Set up" path), gates, labels, next/prev with vanished-stage skip. 100% transition coverage.
2. **`list-org-console-apis` handler + registration** — locked computation, custom ids inert, not-signed-in/no-org/service-failure; `projectCreationHandlers.test.ts` map pin update.
3. **Serialization spine + edit round-trip** — buildProjectConfig union+dedupe (incl. the `__existing__` reserved key); executor test: `additionalConsoleApis` on the Project BEFORE Phase 3b; `extractSettingsFromProject` gains `appBuilderComponentSources` + `additionalConsoleApis` (settingsSerializer tests); wizard edit seeding maps selections/sources/reserved-key APIs into wizard state (seeding tests).
4. **`useIntegrationFlow` hook** — dest commits, finish per kind (mirror-write pinned on BOTH keys), keyed API merge, cancel discards, change-destination save; + `useProjectBuilder` cleanup sync.
5. **KindStage + CatalogStage + CustomStage** — mesh availability/already-added matrix, single-select gallery + filter, parse-gated dup-guarded URL form.
6. **DestinationStage + ApiAccessPicker (core) + ApiAccessStage** — port AdobeIoStep test scenarios (auth gate, phases loading/retry, draft pendings, summary+Change); picker: grouping order (required/suggested/all), suggested group hidden when empty, search across name+code, locked disabled-checked, helper copy with the add-later escape hatch; stage: fetch-on-mount, toggles, non-blocking error/retry. Catalog schema: optional `suggestedApis` + schema/test updates.
7. **AddIntegrationFlowModal + index.ts** — conditional-mount when closed; full mesh walk; full catalog first-add walk; later-add summary + Change; footer gating; Cancel resets.
8. **integrationRows.ts + IntegrationResultRow (+ MeshApiEnableRow move)** — resolver incl. mesh via the BOTH-key check (package-seeded mesh yields a row with `needsSetup`), kind labels, api counts; row anatomy incl. the "Not set · Set up" state; Remove routing per kind.
9. **IntegrationsStep rewrite + summary group** — results-only, empty state, Add opens modal, Change opens change-destination; buildSummary per-integration rows.
10. **Deletions + driver/state simplification** — tests synced first (`areaSubSteps` null for integrations, no inner-move methods, Commerce/Storefront intact; BuildYourProjectStep status-gate; WizardContainer null-driver walk). Then delete everything listed. Exit: full tsc + eslint + jest green; ts-prune shows no orphan exports.
11. **Dashboard "Manage APIs" parity (separable)** — modal reusing the shared `ApiAccessPicker` (same grouping/search/guidance) over EXISTING `listConsoleApis`/`addConsoleApis` (managed locked, Apply additive, no removal) + card action. Housekeeping: mark `appbuilder-shell-app` step-06 absorbed by this plan.

Final gate before push: whole-repo lint + `tsc --noEmit` + full jest (redirect output, never pipe).

## Risks

- Mesh mirror-write regression → finish routes through unchanged `onAppBuilderComponentToggle`; hook test pins both keys.
- Footer-gate drift after driver deletion → gate is the existing `isIntegrationsComplete`; step-10 tests pin.
- Cancel leaves a mid-flow destination configured → accepted semantic (matches today), documented in module JSDoc.
- Org API fetch slow/fails → stage never blocks; inline retry; locked APIs subscribed regardless.
- Null-driver walk regression → explicit area-transition tests in step 10.
- Modal size creep → per-stage files + hook; shell is switch + footer only.
- Spectrum Flex 450px / eager-dialog mock / no-inline-styles constraints carried into every UI step.

## Verification (live, Extension Dev Host)

1. `npm run compile` (or watch:all) → Cmd+R.
2. Create Project → Build Your Project → Integrations: center column shows empty state + Add Integration only (no strip, no mesh card, no Add rows). On a `requiresMesh` package (e.g. the EDS+ACCS stack), the mesh row is ALREADY present with "Deploys to — Not set · Set up"; Set up walks sign-in → project → workspace and the row completes.
3. Add mesh (first add): kind → sign-in (if signed out) → project → workspace → Add; mesh row appears with "Deploys to X · Y" and the API-access row auto-runs.
4. Add a catalog integration (later add): kind → catalog pick → "Deploys to" summary → API stage (locked entries checked+disabled, pick a free API) → Add; row appears with "APIs: n selected".
5. Row Change opens destination-only mode; changing project resets workspace; rows update.
6. Remove each row; Continue gating: blocked with a deployable + no destination, passes otherwise; summary column shows one ✓ row per integration.
7. Create the project; verify the persisted `.demo-builder.json` carries `additionalConsoleApis` and Phase 3b subscribes the union (Developer Console shows the free-picked API).
7b. Edit the project (dashboard More → Edit): integration rows reappear (incl. a custom one and existing API picks preserved through the rebuild); remove one and finish — it's absent from the rebuilt project (remote app untouched, as documented).
8. Dashboard: Manage APIs on an integration card lists org APIs with managed ones locked; Apply adds a new API (visible in Developer Console).
