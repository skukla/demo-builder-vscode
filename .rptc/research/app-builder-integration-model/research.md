# App Builder Integration Model — how it's really built, and the gaps

- **Date:** 2026-07-15
- **Type:** Codebase research (Mode A, six parallel agents across two passes) + synthesis
- **Status:** Complete — Part 1–2 (model + gaps), Part 3 (management UX direction)
- **Why:** Three suspected gaps — (1) no remote Adobe I/O project rename, (2) no way to name a
  custom integration, (3) is "single app, multiple integrations" actually built correctly. The
  investigation surfaced a deeper finding: **the model as built differs from the model as
  documented.**

---

## Summary

Each custom integration is a **separate, whole App Builder app** in its own `components/<id>/`
folder, deployed by its own `aio app deploy`. The "packages inside one app" idea in our docs is
realized only at the **cloud level**: all those separate apps deploy into **one shared Adobe I/O
workspace**, kept from clobbering each other by **per-integration OpenWhisk package renaming**.
N integrations are **independently manageable at runtime** (keyed runner + per-id MCP tools) but
**not durable** — only the singular `meshState`/`appState` persist, so a reload collapses the
project back to 1 mesh + 1 integration. There is **no integration display name** and **no remote
Adobe I/O project rename**. The keystone fix is **ADR-011 D3** (persist the keyed map, retire the
legacy singular path).

---

## Part 1 — The model as built (the correction)

### 1.1 On disk: MANY separate apps, not one app with many packages
Every integration (mesh, catalog, custom/import, blank shell) clones into its **own** top-level
directory: `componentsDir = join(projectPath, 'components')`, `componentPath = join(componentsDir,
componentDef.id)` (`componentInstallation.ts:45-46`). Each carries its own `app.config.yaml` and is
built/deployed independently. **Nothing merges integrations into one `app.config.yaml` or one
`aio app`.**

### 1.2 In the cloud: ONE shared workspace, isolated by package name
All separate apps deploy into the single Adobe I/O workspace from `project.adobe` (org-context
targeted). Coexistence is guaranteed by giving each integration a distinct, collision-free
OpenWhisk package name — `deriveOwPackage(entry.id)` (`owPackageName.ts:57-72`) applied by
`applyIsolatedPackages`/`isolatePackages` (`appConfigPackages.ts:80-123`) **before** each deploy
(`appBuilderComponentRunnerDeps.ts:88-90`). This is load-bearing: `aio app deploy` prune is keyed
to the package name, so two integrations on the default package "clobber each other on deploy AND
undeploy." `appConfigPackages.ts` is **active**, not dormant. The `isStandaloneApp` gate
("not a standalone App Builder app", `appBuilderComponentRunner.ts:265-274`) rejects
extension-shaped apps whose packages can't be renamed — it is a *renameability* gate, not a
single-vs-multi-package check.

> **The real model is "many separate apps → one shared workspace, package-isolated," NOT
> "one app, many packages."** Update the mental model and the docs accordingly.

### 1.3 State model: keyed at runtime, singular on disk
- **Runtime authority = keyed `appBuilderComponents: Record<id, AppBuilderComponentState>`**
  (`base.ts:144`, ADR-011). Accessors read through to the singulars when a keyed entry is absent.
- **Persisted authority = singular `meshState` + `appState`.** `writeManifest` serializes
  `meshState` (`projectConfigWriter.ts:97`) and `appState` (`:103`, added 2026-07-15) — the keyed
  map is **not** serialized. On load, `projectFileLoader.ts:133` **rebuilds** the keyed map from
  the two singletons (`migrateLegacyToAppBuilderComponents`, read-only, load-time).
- **Consequence:** runner/MCP/wizard deploy state for a 2nd+ integration is **lost on reload**.
  Durable state tops out at **1 mesh + 1 integration**.

### 1.4 Two competing add/remove systems (registered side by side)
- **Legacy singular (guarded, one):** dashboard `addApp`/`removeApp` → `appComponentManager`.
  `addAppComponent` rejects a second: `if (getAppBuilderInstance(project)) return {…'already has a
  custom integration'}` (`appComponentManager.ts:134-138`); writes `componentSelections.appBuilder
  = [appId]` + singular `appState`.
- **Keyed (unguarded, N):** wizard + MCP → `appBuilderComponentRunner`. `executor.ts:671-712`
  **loops every** selected integration (`selectedAppBuilderComponents: string[]`) with no one-app
  guard; per-id `deploy/redeploy/remove` handlers.
- Both are registered together in `dashboardHandlers.ts:1081-1091`. This is architecture
  duplication — one job solved twice, with contradictory cardinality.

### 1.5 Per-integration manageability
- **MCP tools are already per-id:** `deploy_integration`/`redeploy_integration`/`remove_integration`
  each declare `inputSchema: { id }` (`actionDescriptors.ts:30-64`) → keyed handlers, per-id.
- **Keyed remove is per-id:** `removeAppBuilderComponent` deletes only `appBuilderComponents[id]`
  and undeploys that one (`appBuilderComponentRunner.ts:378-402`). Legacy `removeAppComponent`
  clears the singular `appState` (`appComponentManager.ts:202-230`).
- **`additionalConsoleApis` is project-GLOBAL**, not per-integration — a flat `string[]`
  (`base.ts:152`) unioned across all components at subscribe (`apiSubscriber.ts:119-126`).

### 1.6 No integration display name (identity vs name)
- Every integration has a stable **id** (import → `normalizeRepositoryName(repo)` /
  `owner-repo`; catalog/shell → catalog id). It has **no user-assignable display name** anywhere:
  not in `WizardState`, `appState` (only `appId`), the keyed `AppBuilderComponentState`
  (`base.ts:188-199` — no `name`), or the manifest.
- Display is **derived and inconsistent**: `resolveIntegrationRows` shows the catalog `name` (blank
  shell → "Custom Integration") or `source.repo` (import), while the dashboard row shows the raw
  **id** (`AppBuilderComponentRow.tsx:69,89`). Two derivations for the same object.
- The literal "two identical 'Custom Integration'" collision **can't occur today** — the blank
  shell is one fixed id, id-deduplicated, so it can't be added twice.
- Dormant scaffolding exists: `CustomAppBuilderComponent.name` ("user-provided display name,
  pre-filled from repo", `appBuilderComponents.ts:70-78`) — unused by the shipped flow.
- A name is **cosmetic**: deploy identity keys off id/repo/package, never a display name.

### 1.7 No remote Adobe I/O project rename
- Local rename (`renameProjectCore`, `projectRenameService.ts:28`) renames the folder + state +
  AI/MCP configs but **never touches `project.adobe.*`**. The remote project title is written once
  at creation (`createFireflyProject`, `adobeEntityFetcher.ts:823`) and never updated. The
  `rename_project` MCP tool and in-place rename are **local only**.
- **The SDK primitive exists and is installed:** `@adobe/aio-lib-console`
  `editProject(orgId, projectId, projectDetails)` → `PATCH /console/.../projects/{id}`
  (`node_modules/@adobe/aio-lib-console/src/index.js:355`). Reachable via the same
  `getClient()` cast used for `createFireflyProject`, simply never wired up.

---

## Part 2 — The gaps as work (sequenced)

1. **ADR-011 D3 — the keystone** (unblocks durable #3 and #2). Serialize `appBuilderComponents`
   in `writeManifest`; have the loader prefer it over the singular migration; retire the legacy
   singular/guarded `addApp`/`removeApp` path so there is **one** add/remove system. Makes N
   independently-managed integrations *durable*. Note: the 2026-07-15 `appState` persistence fix
   patched the singular layer D3 replaces — correct for today's authority, superseded by D3.
2. **Integration display name (#2) — fold into D3.** Add `name` to `AppBuilderComponentState`,
   default from repo/catalog, user-editable; unify the wizard + dashboard display to read it.
   Cheap once the keyed map persists; pointless before (a name would vanish on reload) and before
   the shell can be added under distinct ids.
3. **Remote Adobe I/O project rename (#1) — independent, small.** Add `editProject` to
   `adobeEntityFetcher` (org-guarded, cast pattern) + update `project.adobe.projectTitle`. One
   product decision: does local rename also rename the remote project, or a separate action?
4. **Doc correction.** Fix the stale "at most one custom app / one app, many packages" language
   (`base.ts:105`, `features/CLAUDE.md`) to "many apps, one workspace, package-isolated."

---

## Part 3 — Management UX direction (integrations as first-class deployables)

Evaluating the user's framing: should integrations be "a project within a project," each shown in
its own grid like the top-level projects grid?

### 3.1 The surprising current state
- **The dashboard integration UI is BUILT BUT NOT WIRED.** `AppBuilderCard`, `IntegrationsBlock`,
  `AppBuilderComponentsList`, `AppBuilderComponentRow`, and the shared 4-state machine
  (`appBuilderComponentStates.tsx`) all exist — but the dashboard screen renders **none** of them.
  `ProjectDashboardScreen.tsx:14` imports only the *type* `AppCardState`; `showDashboard.ts:187-204`
  computes and passes `appBuilderComponents` + catalog, and the screen **drops them on the floor**
  (doesn't destructure). Today's dashboard reality = **one read-only mesh badge + a "Deploy Mesh"
  action tile; zero integration cards rendered.**
- **The only live management surface is the wizard `IntegrationsStep`** — a vertical **list** of
  `IntegrationResultRow` (not a grid), plus the "Add Integration" flow modal.
- **The data model is already keyed and card-shaped.** `listAppBuilderComponents(project)` yields
  N `{ id, kind, status, source, url, endpoint, deployedUrls, lastDeployed, sourceHash,
  providesEnvVars }` entries — exactly what a per-card grid consumes.

### 3.2 Reuse assessment for an "integrations grid"
Already built, reusable as-is:
- Status + state: `StatusDot`, `StatusCard`, the `appStatusDisplay`/`meshStatusDisplay`
  status→variant maps (already cover `deployed/deploying/stale/error/not-deployed`), and the pure
  presentational 4-state machine `appBuilderComponentStates.tsx`.
- Chrome/nav: `SearchHeader` (search + view toggle + count + refresh, parameterized), the auto-fill
  reflowing grid **CSS class** `.projects-grid` (`custom-spectrum.css:1075-1083`).
- Action wiring: the id-scoped `webviewClient.postMessage('deployAppBuilderComponent', { id })`
  pattern (`AppBuilderComponentRow.tsx`) + the single-shared-dialog/modal host pattern.

Net-new / small extraction:
- **A card shell component.** Card chrome today is the `.project-card-spectrum` CSS + a hand-rolled
  clickable `<div>` inside the Project-coupled `ProjectCard`; the integration rows carry no chrome.
  A generic clickable/liftable card shell needs extracting (CSS exists; only a thin wrapper missing).
- **Grid composition** (put the existing state machine inside a card shell inside `.projects-grid`).
- **`ProjectCard`/`ProjectsGrid`/`ProjectActionsMenu` are Project-coupled** — mirror them as a
  pattern, do not import. There is **no generic `Card` primitive** today (only `StatusCard` in core).

### 3.3 Where the "project within a project" metaphor holds — and where it breaks
- **Holds for the CARD.** An integration already has its own lifecycle — deploy / redeploy / remove /
  verify / manage-APIs, its own status, URL(s), source repo — structurally close to a project card.
  A grid of integration cards is a natural, mostly-pre-built fit.
- **Breaks for the CONTAINER.** Integrations are **co-tenants of ONE shared Adobe I/O workspace**
  (Part 1), not independent projects. The wizard models this literally: the Adobe I/O
  project+workspace **destination is ONE shared commitment across all rows**
  (`integrationRows.ts:35,89`), not per-integration. A "project within a project" framing where each
  card owns its own destination would **contradict** the load-bearing shared-workspace model. So the
  right mental model is **"first-class co-tenant deployables in one workspace, each on its own
  card,"** not nested independent projects.
- **Mesh is special everywhere** — a badge (not a card), excluded from the keyed list
  (`AppBuilderComponentsList.tsx:91`), dual-flow remove. A unified grid must decide whether mesh
  becomes a card in the grid or stays a distinct badge (code comments flag "D3 owns mesh-UI
  unification").

### 3.4 Recommendation
Yes — present integrations as first-class deployables in a per-project grid; the data model, status
vocabulary, state machine, and action wiring already support it, and it aligns with the keyed model
and the naming need (#2). But:
- Frame each integration as a **co-tenant card in the shared workspace**, keeping the single shared
  destination — not a nested project with its own destination.
- **The grid is gated on ADR-011 D3.** Without durable keyed state, a grid of N cards collapses to
  1 on reload. So: D3 first (persist the keyed map, retire the singular path, **wire the dormant
  dashboard UI**, unify the mesh treatment), then the grid presentation (extract a card shell, reuse
  `.projects-grid`), with the integration display name (#2) folded in.
- Sequence: **D3 + wire dashboard → card shell + grid → mesh-as-card unification.** Much of this is
  composition of existing parts, not new logic — the biggest single lift is D3 persistence.

---

## Sources (code, this repo)
- Folder/deploy: `componentInstallation.ts:45`, `appConfigPackages.ts:80-123`,
  `owPackageName.ts:57`, `appBuilderComponentRunner.ts`, `appBuilderComponentRunnerDeps.ts:88`,
  `appDeployment.ts:123`
- State: `base.ts:107,144,152,188-199`, `projectConfigWriter.ts:97-103`,
  `projectFileLoader.ts:133`, `appBuilderComponentMigration.ts`, ADR
  `docs/architecture/adr/011-app-builder-deployables.md`
- Dual systems: `appComponentManager.ts:134-230`, `executor.ts:671-712`,
  `dashboardHandlers.ts:1081-1091`, `actionDescriptors.ts:30-64`, `appBuilderComponentHandlers.ts`
- Naming: `integrationRows.ts:84-147`, `appBuilderComponents.ts:70-78`, `AppBuilderComponentRow.tsx:69`
- Remote rename: `adobeEntityFetcher.ts:798,823`, `projectRenameService.ts:28`,
  `@adobe/aio-lib-console` `index.js:355`
- Management UX: `IntegrationsStep.tsx:179-227`, `IntegrationResultRow.tsx:89-150`,
  `AddIntegrationFlowModal.tsx`, `ProjectDashboardScreen.tsx:14,260-368`, `showDashboard.ts:187-204`,
  `AppBuilderComponentsList.tsx`, `AppBuilderComponentRow.tsx`, `appBuilderComponentStates.tsx`
- Grid reuse: `projects-dashboard/ui/ProjectsGrid.tsx`, `ProjectCard.tsx`,
  `custom-spectrum.css:1075-1083` (`.projects-grid`), `core/ui/components/ui/StatusDot.tsx`,
  `feedback/StatusCard.tsx`, `navigation/SearchHeader.tsx`, `core/ui/utils/appStatusDisplay.ts`
