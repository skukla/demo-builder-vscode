# App Builder app — deploy spine (import public git URL, dashboard-first)

> **Status: READY. This is slice 1 of 5 and GATES the other four** (curated catalog,
> package-bound, scaffold-and-author). Build and merge to `develop` first.

## Provenance

Designed 2026-06-17 from the App Builder app-structure research
([`../research/app-builder-app-structure/research.md`](../research/app-builder-app-structure/research.md),
companion [`../research/adobe-io-deployable-workspace/research.md`](../research/adobe-io-deployable-workspace/research.md)).
Supersedes the original "attach App Builder apps (Model A)" feature seed in
[`2026-06-15-integration-service-cleanup-and-discovery-token.md`](2026-06-15-integration-service-cleanup-and-discovery-token.md);
that seed assumed a per-app keyed array — the research showed one-app-per-demo is the correct shape,
so the singleton `meshState` model fits and the array is unnecessary.

## Decided model (from research)

One workspace per demo holds the API Mesh (separate artifact, untouched) **+ one custom App Builder
app**. Multiple integration domains live as multiple **packages inside that one app**
(`runtimeManifest.packages`), not as separate apps. So per demo there is **one** app deployable with
**singular** state — mirror `meshState`, do NOT introduce a keyed array.

## Goal / scope

Build the App Builder app deploy spine end-to-end, sourcing the app from a **user-supplied public git
URL**, with the **dashboard** as the primary add/deploy/redeploy surface.

**In scope:**
1. **`app-builder` registry category.** Add a first-class category to `components.json` +
   `ComponentRegistryManager` transform (`src/types/components.ts:230-236`, transform `:179-188`) +
   `getComponentById`. An app component mirrors the `eds-commerce-mesh` shape: `source.{type:git,url}`,
   `configuration.{nodeVersion, buildScript, requiresDeployment:true, deploymentTarget:'adobe-io',
   requiredEnvVars, providesEnvVars}`.
2. **Deploy primitive `deployAppComponent`** — a SIBLING of `deployMeshComponent`
   (`meshDeployment.ts:140-232`), reusing its build→deploy→poll→persist shape and command plumbing
   (`CommandExecutor`, `useNodeVersion`, `enhancePath`, streaming). Swap `aio api-mesh:*` for the
   **idempotent** `aio app deploy` (no create-vs-update split) + `aio app get-url --json` for URLs.
   Run inside `withOrgContext(buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg), …)` with
   `exclusive:'adobe-cli'` — the already-clean targeting seam (`orgContextEnv.ts`,
   `commandExecutor.ts:98-107`).
3. **Singular `appState`** on `Project` (mirror `meshState`, `base.ts:88`): `{appId/url, status,
   deployedUrls, lastDeployed, sourceHash}`. Add a `getAppBuilderInstance(project)` getter — do NOT
   reuse `getMeshComponentInstance()[0]` (`typeGuards.ts:449-453`); apps are a distinct subType.
4. **Wire the dead `appBuilder` selection field.** `componentSelections.appBuilder: string[]`
   round-trips today but `wizardHelpers.ts:690` hardcodes `[]` and the install list derives
   `app-builder` items from `selectedAddons` (`executor.ts:1109-1118`). Wire the real selection into
   the install list and persist (`executor.ts:290-291`).
5. **Additive add/remove on a live project** — copy the block-library pattern
   (`installBlockCollections`, `blockCollectionHelpers.ts:127-298`; incremental at
   `updateExecutor.ts:583-607`): add the app to an existing project WITHOUT the edit-mode
   `componentInstances` wipe (`executor.ts:351-365`) or reset's `rm -rf components/`. Remove must
   `aio app undeploy`, clear `appState`, and drop from `componentSelections.appBuilder` (today
   `removeComponent` does no remote/state cleanup, `componentManager.ts:280-309`).
6. **Developer-role gate.** Extend `projectRequiresAppBuilder` (`projectAppBuilderPredicate.ts:42`,
   reads only `registry.components.mesh`) to include the new `app-builder` category, so the existing
   `testDeveloperPermissions()` gate fires for apps at both sites.
7. **Dashboard surface** — add/deploy/redeploy entry mirroring the mesh dashboard redeploy
   (`DeployMeshCommand` / `dashboardHandlers.handleDeployMesh`): paste a public git URL → clone →
   build → deploy → show action URLs + status.

**Out of scope (explicit):**
- Curated catalog, package-binding, scaffolding (slices 2–4).
- App-only / no-storefront projects (slice 5) — slice 1 attaches an app to a project that ALREADY has
  a storefront + workspace.
- **Multi-workspace + programmatic API-subscription** (`subscribeCredentialToServices`). Build only
  when forced (a 2nd mesh, a 2nd independent app, or an app that calls Adobe product APIs). The bare
  S2S credential already exists (`createWorkspaceCredential`, `adobeEntityFetcher.ts:438`); the
  subscription step is the unbuilt piece. Rationale + SDK path: the two research docs above. Do NOT
  build it in this slice.
- Private-repo auth (public URL only here).

## UX / interaction

**Surface:** the project **dashboard** — a new "App Builder app" section/card beside the mesh status
surface (`useDashboardStatus.ts`, the mesh card, and `DeployMeshCommand`'s redeploy entry are the
templates). No wizard surface in slice 1.

**States (mirror the mesh card lifecycle):**
- *No app* — quiet "Add an App Builder app" affordance with a public-git-URL input.
- *Cloning / building / deploying* — progress streamed through the dashboard status channel the mesh
  redeploy already uses.
- *Deployed* — status badge + the action URLs from `aio app get-url`, plus Redeploy and Remove actions.
- *Error* — inline with Retry; reuse the auth/org guards `DeployMeshCommand` already runs
  (`ensureAdobeIOAuth`, `detectProjectOrgMismatch`).

**Conventions:** follow `frontend-guidelines.md` + the `reference_dashboard_ui_conventions` memory
(subtle Spectrum primitives, quiet Links, align to `--dashboard-content-width`, no saturated fills).
Add an `appStatusSummary` field for the card grid — the mesh's `meshStatusSummary` is singular and
mesh-specific. **Polish loop:** iterate live via the preview loop (`npm run watch:all` → reload the
EDH window) with Playwright screenshots at 1440px; F5 only to restart the extension host.

## Reuse / refactor-for-reuse

**Reuse as-is (no change):**
- Org targeting — `withOrgContext` + `buildOrgTargetFromProjectAdobe` + `orgContextEnv`
  (`exclusive:'adobe-cli'`).
- Command plumbing — `CommandExecutor` (`useNodeVersion` / `enhancePath` / streaming).
- Clone/install — `componentInstallationOrchestrator` two-phase + `componentManager.installComponent`
  git path + `.env` via `generateComponentEnvFile`.
- Additive add/remove — the `installBlockCollections` discover→add-only-new→track pattern.
- Auth/org guards + the dashboard redeploy surface from `DeployMeshCommand` /
  `dashboardHandlers.handleDeployMesh`.
- Role gate — extend `projectRequiresAppBuilder` (do not duplicate the permission check).

**Refactor for reuse (mesh + app = the 2nd implementation):**
- Extract the shared deploy scaffold out of `deployMeshComponent` — `build → run deploy command →
  poll/verify → persist` — so mesh and app share it, with the deploy verb (`api-mesh:*` vs
  `app deploy`) and the verify/poll step as the variable parts. The `buildComponent` step (npm install
  + build script) is byte-identical and should be the first thing shared.

**Guardrail (Rule of Three / YAGNI):** with only mesh + app, share the obvious mechanical duplication
but do **not** build a generalized "deployable strategy framework" yet. The deployable-workspace
research sketched a `deploy(strategy)` / `persist(keyed state)` abstraction — defer it until a THIRD
deployable type appears (and keyed state stays unnecessary while it is one app per demo).
Sibling-with-shared-helpers now; generalize later.

## Execution plan (high level — full TDD plan via /rptc:feat when active)

1. Registry category + component contract + role-gate extension (config + transform + predicate).
2. `appState` type + `getAppBuilderInstance` getter (no `[0]` reuse).
3. `deployAppComponent` sibling primitive (build → `aio app deploy` → `get-url` → persist), under
   `withOrgContext` + `exclusive:'adobe-cli'`.
4. Wire `componentSelections.appBuilder` through install + persist; stop deriving from `selectedAddons`.
5. Additive add + remove (block-library-pattern add; undeploy+state-clear remove); bypass edit/reset wipe.
6. Dashboard add/deploy/redeploy UI.
7. Live-verify the three probes (below) before relying on deploy/undeploy edge behavior.

## Constraints / risk

- **Do not reuse the mesh singleton getter for apps** — sibling getter, distinct subType.
- **Edit mode + reset destroy and re-clone all components** — the app-add/remove path must bypass both
  or apps vanish on any edit/reset.
- **`aio app undeploy` has no per-action granularity**, and triggers/rules orphan on rename — document
  the manual `aio runtime` cleanup; demo apps rarely use scheduled triggers, so low risk for v1.
- Preserve the org-context discipline exactly (the just-shipped `withOrgContext` model).
- **Live-verification probes (do during TDD):** (a) is `aio app deploy` prune (`deleteEntities`) on by
  default in our `aio` version? (b) does `aio app delete action` also undeploy from the namespace? (c)
  trigger/rule orphan-on-rename in our version. All flagged MEDIUM-confidence in research.

## Kickoff prompt

`/rptc:feat "Build the App Builder app deploy spine (slice 1, gates the family). Add a first-class
app-builder registry category (mirror eds-commerce-mesh component shape). Build deployAppComponent as
a sibling of deployMeshComponent: build → idempotent aio app deploy → aio app get-url --json → persist
a SINGULAR appState (mirror meshState; add getAppBuilderInstance, do NOT reuse the mesh [0] getter),
all inside withOrgContext(buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg)) with
exclusive:'adobe-cli'. Wire the dead componentSelections.appBuilder field through install+persist
(stop deriving from selectedAddons). Add additive add/remove on a live project using the
installBlockCollections pattern (bypass the edit-mode/reset component wipe); remove must aio app
undeploy + clear appState + drop from the selection. Extend projectRequiresAppBuilder to the new
category. Dashboard-first add/deploy/redeploy surface, public git URL only. Defer curated catalog,
package-binding, scaffolding, app-only projects, and multi-workspace/API-subscription. See
.rptc/backlog/2026-06-17-appbuilder-app-deploy-spine.md and
.rptc/research/app-builder-app-structure/research.md."`
