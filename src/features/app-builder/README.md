# App Builder Feature

## Purpose

Attach, deploy, and remove **N custom Adobe App Builder integrations** on a demo project, from
public GitHub URLs (or catalog entries), dashboard-first. Built as a **sibling of the mesh deploy
path**, not a fork — and since ADR-011 D3, the mesh and the integrations share ONE state model:
the keyed `project.appBuilderComponents` map (`kind: 'mesh' | 'integration'`) is the single
persisted authority. The mesh is one component kind in that map; each integration is another
entry keyed by its component-instance id. The legacy singular `meshState`/`appState` fields are
legacy-read-only: old manifests migrate on load and forward-migrate on first save
(see `docs/architecture/state-ownership.md` and ADR-011).

## Architecture

```
features/app-builder/
└── services/
    ├── appBuilderComponentState.ts   # keyed-map accessors (single persisted authority)
    ├── appBuilderDeployOutcome.ts    # recordDeployOutcome — the keyed deploy-record writer
    ├── appBuilderComponentRunner.ts  # keyed runner: clone → install → subscribe → deploy per id
    ├── deployAppIsolated.ts          # package-isolated deploy (applyIsolatedPackages + deploy)
    ├── appDeployment.ts              # deployAppComponent — org-agnostic deploy helper
    ├── appConfigPackages.ts          # app.config.yaml package rewrite (isolation)
    ├── owPackageName.ts              # deriveOwPackage(instanceId) — per-instance ow.package
    ├── apiSubscriber.ts              # Console API subscription (full-union PUT)
    ├── apiSubscriberClientAdapter.ts # runner-facing subscriber adapter
    ├── ensureMeshApiSubscribed.ts    # bounded mesh API enablement
    ├── runtimeCredentials.ts         # workspace runtime credentials fetch
    ├── secretKey.ts / allowedDomain.ts # env-schema secret + domain helpers
    ├── types.ts                      # AppDeploymentResult
    └── index.ts                      # public API
```

## State model (ADR-011 D3)

- `project.appBuilderComponents` — keyed map, **the only persisted model**. Every deploy path
  lands its outcome through `recordDeployOutcome` (identity fields `source`/`name`/
  `providesEnvVars` are preserved; volatile fields `status`/`endpoint`/`url`/`envVars`/
  `sourceHash`/`lastDeployed` are the deploy record).
- Readers go through the accessors (`getMeshAppBuilderComponent`,
  `getIntegrationAppBuilderComponents`, `listAppBuilderComponents`,
  `getProvidedEnvVars`); the accessors synthesize from the in-memory legacy singletons only
  for pre-migration projects.
- A guard test (`tests/core/state/singularStateAccessGuard.test.ts`) pins the few files
  allowed to touch `.meshState`/`.appState`, with per-file match counts.

## Key Exports

### `deployAppComponent(path, commandManager, logger, onProgress?)`

Org-agnostic deploy helper (callers wrap it in `withOrgContext`, exactly like
`deployMeshComponent`). Sequence:

1. `buildComponent` (`@/core/shell/buildComponent`) — shared `npm install` (+ `npm run build`
   if declared). Byte-identical to the mesh build step.
2. `aio app deploy` — idempotent, issued **once** (no create/update branch). Deploy prunes
   orphaned actions by default.
3. `aio app get-url --json` — parsed **defensively** (never throws on an unexpected shape) into
   `{ url, deployedUrls }`. A failed `get-url` after a successful deploy degrades to an empty
   URL, not a deploy failure.

Node version is `'auto'` — resolves to the Node version the Adobe `aio` CLI runs under (no
hardcoded version).

### `addAppBuilderComponent(project, entry, deps)` / `removeAppBuilderComponent(project, id, deps)`

Additive add / per-id remove on a **live** project (no re-clone of the rest of the project, no
edit-wipe, no reset `rm -rf`). N custom integrations coexist — ADR-011 D3 Step 05 dropped the
one-app guard.

- **Add** — fail-fast validation of a **public GitHub URL**: `validateURL` (rejects
  SSH/`git@`/non-https/SSRF), then `parseGitHubUrl`, then an `owner`/`repo` charset gate
  (`^[A-Za-z0-9._-]+$`) that rejects shell metacharacters. The stored URL is the **canonical**
  `https://github.com/owner/repo.git` reconstructed from the validated parts — never the raw
  input — so embedded credentials and stray path segments are dropped. Rejects a duplicate id
  fail-fast, clones+installs via `componentManager.installComponent` (siblings untouched), keys
  the entry in `appBuilderComponents[appId]` (with its `source`), **appends** to
  `componentSelections.appBuilder`, and persists.
- **Remove (per-id)** — `aio app undeploy` from that integration's folder under org-context
  targeting (best-effort: a failed undeploy surfaces a warning but never strands local state),
  then `componentManager.removeComponent(deleteFiles=true)`, clears ONLY that keyed entry
  (legacy twin resolved via `resolveKeyedComponentId`) + its selection id — siblings untouched.
  The in-memory legacy singletons (`appState`/`appStatusSummary`) clear when the LAST
  integration goes, so the accessors' legacy synthesis cannot resurrect a removed integration.

### Per-integration deploy — one path

Every per-integration deploy goes through the keyed runner
(`appBuilderComponentRunner`) behind the per-id handlers, whether it was started by
the Integrations page or by an AI agent (`deploy_integration` / `redeploy_integration`
route to the same `dashboardHandlers` entries).

There is no singular headless variant. `deployAppHeadless` existed as the mesh's
`deployMeshHeadless` sibling, but never gained the second caller that justifies a
UI-free core: the MCP tools were already on the keyed path, so its only caller was
one projects-list kebab item. When that item became a route to the Integrations page
(2026-08-04) the service was retired rather than left orphaned.

The deeper reason it was the wrong shape: an agent-triggered deploy is exactly when a
user needs telling, so "UI-free" was a liability, not a feature. The mesh's headless
core survives because it is genuinely shared — but both its callers now wrap it in
`deployMeshWithFeedback`, so the agent path reports itself too.

## Dashboard surface

The dashboard renders ONE integrations card grid: `IntegrationsBlock` →
`integrations/IntegrationsGrid`, with the mesh as its first peer card and one card per keyed
integration; every card's detail and non-face actions live in the shared detail drawer. Per-id
handlers (`addAppBuilderComponent`, `deployAppBuilderComponent`, `redeployAppBuilderComponent`,
`removeAppBuilderComponent`, `renameAppBuilderComponent` —
`features/dashboard/handlers/appBuilderComponentHandlers.ts`) drive the keyed runner and push
per-card status via `sendAppBuilderComponentStatusUpdate`, plus the whole fresh persisted map via
`sendAppBuilderComponentsSnapshot` after each terminal op (see `features/dashboard/README.md`).

## Reuse

Reused **as-is** (no fork): `withOrgContext` + `buildOrgTargetFromProjectAdobe`, `CommandExecutor`
(`useNodeVersion`/`enhancePath`/streaming), `componentManager.installComponent`/`removeComponent`,
`ensureAdobeIOAuth`, `detectProjectOrgMismatch`, the dashboard status channel, and the
`installBlockCollections` additive pattern. The **only** new shared abstraction is
`@/core/shell/buildComponent` (two callers, byte-identical) — no generalized "App Builder
component framework" until a third component kind appears (Rule of Three).

## History

Slice 1 (2026-06) shipped the deploy spine as a **singular** model: one custom app, singular
`project.appState`, a dashboard `AppBuilderCard`, and a `DeployAppCommand`. ADR-011 D1–D3
replaced that model: D1 introduced the keyed map with read-through accessors, D2 added the
keyed runner + per-id handlers, and D3 retired the singular write-side entirely (the card,
the singular command, and the singular handlers are deleted; legacy manifests migrate on load).

## Scope & deferrals

Deferred to later slices: package-binding, scaffolding/authoring, app-only projects, and
multi-workspace.

## Testing

`tests/features/app-builder/` mirrors this directory. Services mock `CommandExecutor.execute`
and `componentManager`; never shell out. Component tests use `@testing-library/react`. The
mesh `meshDeployment` tests are the regression gate for the `buildComponent` extraction.
