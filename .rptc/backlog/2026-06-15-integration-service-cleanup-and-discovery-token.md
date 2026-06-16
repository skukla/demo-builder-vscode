# integration-service / appBuilderApps cleanup + store-discovery least-privilege token

## Provenance

Surfaced 2026-06-15 while fixing the store-discovery credential race
(`feature/store-discovery-creds-payload`). The fix shipped credentials in the
`discover-store-structure` payload and removed the dead `sync-component-configs` cache.
A follow-on question — "should discovery use a scoped token instead of admin
username/password?" — led to investigating downstream admin-credential consumers.

Two deferred efforts came out of that investigation. They are sequenced: **cleanup → token.**

## Research findings (consumer map for admin username/password)

`ADOBE_COMMERCE_ADMIN_USERNAME` / `ADOBE_COMMERCE_ADMIN_PASSWORD` are declared `required`
on the `adobe-commerce-paas` backend and written to the project `.env`. Who actually reads them:

| Consumer | Uses admin user/pass? | Notes |
|---|---|---|
| API Mesh (`headless-commerce-mesh`) | No | `.env.example` has none; mesh `Authorization` is request-header passthrough |
| Headless storefront | No | URL + store codes + `ADOBE_CATALOG_API_KEY` + `MESH_ENDPOINT` only |
| `commerce-demo-ingestion` (via ToolManager) | No (in practice) | builder configures it with `ACO_*` creds; ingestion methods have no live callers (only cleanup is wired) |
| **Store discovery** | **Yes** | mints an ephemeral admin token via `POST /rest/V1/integration/admin/token` |
| **`integration-service`** (kukla-integration-service) | **Yes** | `lib/commerce/auth.js` hard-requires `COMMERCE_ADMIN_USERNAME/PASSWORD`; `app.config.yaml` injects them into deployed actions |

**Key nuance:** `integration-service` is **dormant** — the wizard's App Builder selection
section was removed (`ComponentSelectionStep.tsx`: "sections were removed"), it's in no demo
package, and `defaults.json` has `appBuilderApps: []`. But it is **not deleted**: the
`components.json` entry, the `kukla-integration-service` repo, the deployment predicate, and
the `useComponentSelection` hook capability all still exist. So today discovery is the only
*live* consumer, but a token swap is unsafe until integration-service's fate is decided.

## Effort 1 — Remove integration-service + the appBuilderApps mechanism (no soft deprecation)

`integration-service` is the **only** member of `appBuilderApps`, so removing it makes the
whole mechanism dead (same shape as the retired b2b feature-pack).

**Remove (~25 files):**
- `components.json`: `appBuilderApps.integration-service` def; the `appBuilderApps` list;
  `optionalComponents: ["integration-service"]` in the `eds-paas` + `headless-paas` stacks;
  the `AWS_ACCESS_KEY_ID/SECRET` env-var defs (grouped only under integration-service)
- `components.schema.json`: the `appBuilderApps` schema block
- `prerequisites.json`: the `integration-service` prerequisite
- `defaults.json`: the `appBuilderApps: []` field
- Code: `ComponentRegistryManager.ts` (appBuilderApps handling), `serviceGroupTransforms.ts`
  (group def), `useComponentSelection.ts` (`selectedAppBuilder`/`handleAppBuilderToggle`),
  `ComponentSelectionStep.tsx` (stale note), `types/components.ts` (`appBuilderApps` fields),
  `componentRepositoryResolver.ts`, `discoveryTools.ts`, `skillsWriter.ts`
- Tests: ~15 files (mostly `ComponentRegistryManager-*` + registry test utils)

**Must NOT remove:**
- `ADOBE_COMMERCE_ADMIN_USERNAME/PASSWORD` env-var **definitions** — still used by store discovery
- `projectAppBuilderPredicate.ts` — also serves **mesh** (keep; its `appBuilder` category just empties)

(Decide separately whether to also archive/retire the `kukla-integration-service` repo.)

## Effort 1b — SUPERSEDED (do not execute as a standalone cleanup)

**Status: superseded 2026-06-15 by the "Attach App Builder projects" feature below.**

1b was going to remove the residual `appBuilder` *selection-field* plumbing that Effort 1
deliberately left behind: `ComponentSelection.appBuilder` (webview.ts/base.ts/messages.ts/
handlers.ts ProjectConfig), `componentDataHelpers.findComponentById`, the wizard
(`wizardHelpers`, `useWizardState`), review (`reviewStepHelpers`, `ReviewStep`), configure
(`configureTypes`/`configureHelpers`/`useSelectedComponents`), `executor`, `projectResetService`,
`settingsFile.ts`, plus ~12 test files (~50 files total). It is always-empty/harmless today.

**Why superseded:** the owner expects a fast-follow feature to attach one or more App Builder
projects to any project. That plumbing is exactly the multi-select scaffolding the feature needs.
Removing it now and rebuilding it in weeks is pure churn. So **do not run 1b** — repurpose the
plumbing instead (see the feature seed below). If the feature is shelved, 1b can be reinstated.

## Feature seed — Add one or more App Builder apps to a demo project (Model A)

**Provenance:** anticipated fast-follow (raised 2026-06-15) after the `integration-service` /
`appBuilderApps` removal (Effort 1). Researched 2026-06-15 (3 codebase agents + ExL/dev-docs on
App Builder structure). Effort 1 cleared the dormant single-entry catalog; this is a fresh,
general build, not a revival.

**Decided model — A (add apps to the demo's ONE project/workspace):** each attached app is a
separate git repo, cloned + built + deployed via `aio app deploy` into the demo's EXISTING Adobe
workspace namespace (the one chosen during the wizard's Adobe setup). This mirrors the Mesh deploy
lifecycle, multiplied N times. NOT separate Console projects (Model C) — that's a different,
narrower feature reserved for entitlement-boundary / attach-pre-existing cases.

Why A: App Builder = Console **project → workspaces → one app (many actions/packages) → one
runtime namespace**. Mesh is provisioned per workspace; Firefly Services are just APIs subscribed
on a workspace (OAuth S2S) and called from actions. So Commerce + API Mesh + a Firefly image
pipeline all fit ONE project/workspace — the multi-PROJECT framing was over-general. Separate
projects are only warranted by entitlement boundaries, reuse/independent lifecycle, attaching a
pre-existing deployed project, or governance/quota isolation.

**Mesh is the reusable template** (`src/features/mesh/services/meshDeployment.ts`): build
(`npm install`+build) → `selectWorkspace(project.adobe.workspace, projectId)` to set ambient
`aio console` state → deploy → poll → persist status/endpoints. Workspace targeting, command
execution (`CommandExecutor` + `fnm exec` node isolation + `enhancePath`), and the create-time +
dashboard-redeploy surfaces all transfer.

**Reuse as-is:**
- Generic git clone/install pipeline (`componentInstallation` → `componentManager` →
  `componentInstallationOrchestrator` two-phase clone/npm). An app repo is just a git component.
- Workspace targeting via `authManager.selectWorkspace(...)` (ambient console state from `project.adobe`).
- Manifest persistence: `componentSelections.appBuilder: string[]` already round-trips
  (`projectConfigWriter.ts`); settings export/import already carries `appBuilder`.
- Multi-select UI primitive `useSetToggle`; the **block-library "add-list" UX**
  (`customBlockLibraries`) is the closest rendered analog for "add 1+ user-supplied entries".
- Developer-role gate: extend the ONE predicate `projectAppBuilderPredicate` to include the
  app-builder set; both gate sites (`deployMesh`, `executor`) then fire automatically.

**Build new (the real gaps):**
1. **`aio app deploy` does not exist anywhere** — only mesh deploys today. Build: build → `aio app
   deploy` (mirror `meshDeployment.ts:169-189` cwd/useNodeVersion/streaming/TIMEOUTS.LONG) → parse
   deployed action URLs → persist.
2. **Per-app state must be an ARRAY**, not mesh's singleton `project.meshState`. Add a
   `project.appBuilderApps[]` record `{appId/url, status, deployedUrls, lastDeployed, sourceHash}`
   + a subType lookup helper (mesh's `getMeshComponentInstance` returns `[0]` — won't scale to N).
3. **Wire the dead selection feed**: `wizardHelpers.ts:~688` hardcodes `appBuilder: []`; pass the
   real selection through. Today's `executor.ts`/`projectResetService` derive `type:'app-builder'`
   install from `selectedAddons` and the label actually tags ADDONS — disambiguate before wiring.
4. **Namespace coexistence**: N apps deploy into ONE workspace namespace — guard against
   package-name collisions across attached apps.
5. **Per-app `.env`/config**: registry-driven `generateComponentConfigFiles` writes each app's env
   from its `requiredEnvVars` (ToolManager's clone+env is reusable shape but ACO-hardcoded — don't reuse the class).

**Decisions still open (settle in /rptc:feat Phase 2):**
- App source per entry: user-supplied git URL (+ optional curated starters) vs curated catalog vs
  both. Lean: user-supplied URL + optional starters (mirrors block libraries). Each app =
  git repo deployed into the workspace.
- Placement: creation wizard, dashboard (add to existing projects), or both. Lean: both, with the
  **dashboard add/redeploy as the must-have** ("add to any project" emphasizes existing projects);
  Mesh already does create-time + dashboard redeploy.
- Credential model interaction: attached apps that call Commerce admin APIs may need
  `ADOBE_COMMERCE_ADMIN_USERNAME/PASSWORD` — this is the input to whether Effort 2 (token swap)
  can later treat discovery as the sole admin-cred consumer.

**Kickoff prompt:**
`/rptc:feat "Add one or more App Builder apps to a demo project (Model A): each app is a git repo
cloned + built + deployed via aio app deploy into the demo's existing Adobe workspace (mirror the
Mesh deploy lifecycle). Multi-select add-list UX (model on customBlockLibraries), per-app state
array (not the mesh singleton), build the missing aio app deploy step, extend
projectAppBuilderPredicate for Developer-role gating. Settle app-source (user URL vs catalog) and
placement (wizard/dashboard) in planning. See
.rptc/backlog/2026-06-15-integration-service-cleanup-and-discovery-token.md (Feature seed)."`

## Effort 2 — Store-discovery least-privilege token — DECLINED (2026-06-15)

**Decision: declined.** Evaluated and dropped. Keep PaaS admin username/password for store discovery.

Rationale: there is **no attacker exposure a token would close**. The shipped fix's security review
returned 0 findings; creds are gitignored (never in the public repo), cross webview↔extension via
in-process IPC (not network), reach Commerce over HTTPS only, and are never logged. The only
residual is **plaintext-at-rest in `.env`** — which a Bearer token *shares* (also at rest) and does
NOT fix; a token only reduces blast radius on an already-compromised machine. Against that marginal
gain, a token forces every demo creator to manually create a Commerce Integration (System →
Integrations) — real, recurring friction for a fast-setup demo tool. Not worth it. ACCS is
unaffected (already IMS OAuth, no admin password). Decision recorded in the `edsHandlers.ts`
`handleDiscoverStoreStructure` PaaS branch comment.

**Cheaper future hardening if at-rest plaintext ever matters (NOT a token):** move admin
username/password to **VS Code Secret Storage** (OS keychain, encrypted, zero extra user steps).
Store discovery is the only consumer, so the creds may not need to live in `.env` at all. Capture
as a separate item only if the at-rest residual becomes a real concern.

## Constraints

- Repo is public — no secrets in git history.
- `develop`-first; merge to `master` via the release process.
- No soft deprecation — delete outright, don't leave "(deprecated)" stubs.

## Kickoff prompt

`/rptc:feat "Remove the dormant integration-service component and the now-single-member
appBuilderApps mechanism (no soft deprecation), keeping the admin-cred env-var definitions
and the mesh-serving projectAppBuilderPredicate. Then, as a follow-up, replace PaaS store
discovery's admin username/password with a scoped Commerce integration token. See
.rptc/backlog/2026-06-15-integration-service-cleanup-and-discovery-token.md"`
