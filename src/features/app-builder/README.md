# App Builder Feature

## Purpose

Attach and deploy **one** custom Adobe App Builder app to an existing demo project, from a
public GitHub URL, dashboard-first. Built as a **sibling of the mesh deploy path**, not a fork.

A demo workspace holds the API Mesh (a separate artifact, untouched here) **plus at most one**
custom App Builder app. Multiple integration domains (ERP, OMS, …) live as multiple *packages*
inside that one app, not as separate apps or workspaces. Because the app is singular, its state
is a singular field on the project — `project.appState` (mirroring `meshState`) — with no keyed
array.

This is **slice 1 of 5** (the deploy spine) and gates the rest of the family.

## Architecture

```
features/app-builder/
├── commands/
│   └── deployApp.ts          # DeployAppCommand (dashboard deploy/redeploy entry)
└── services/
    ├── appDeployment.ts      # deployAppComponent — org-agnostic deploy helper
    ├── appComponentManager.ts# addAppComponent / removeAppComponent (live add/remove)
    ├── types.ts              # AppDeploymentResult
    └── index.ts              # public API
```

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

### `addAppComponent(project, gitUrl, deps)` / `removeAppComponent(project, deps)`

Additive add/remove on a **live** project (no re-clone of the rest of the project, no edit-wipe,
no reset `rm -rf`).

- **Add** — fail-fast validation of a **public GitHub URL**: `validateURL` (rejects
  SSH/`git@`/non-https/SSRF), then `parseGitHubUrl`, then an `owner`/`repo` charset gate
  (`^[A-Za-z0-9._-]+$`) that rejects shell metacharacters. The stored URL is the **canonical**
  `https://github.com/owner/repo.git` reconstructed from the validated parts — never the raw
  input — so embedded credentials and stray path segments are dropped. Enforces the singular
  guard (one app per workspace), clones+installs via `componentManager.installComponent`
  (siblings untouched), records `componentSelections.appBuilder`, and persists.
- **Remove** — `aio app undeploy` under org-context targeting (best-effort: a failed undeploy
  surfaces a warning but never strands local state), then
  `componentManager.removeComponent(deleteFiles=true)`, clears `appState`/`appStatusSummary`,
  drops the app from the selection, and persists.

### `DeployAppCommand` (`commands/deployApp.ts`)

Dashboard command. Mirrors `DeployMeshCommand`'s guard order exactly:

```
concurrency lock
  → ensureAdobeIOAuth
  → detectProjectOrgMismatch (reachability)
  → projectRequiresAppBuilder + testDeveloperPermissions
  → withOrgContext(buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg)) → deployAppComponent
  → persist appState + appStatusSummary; push dashboard status
```

The deploy helper stays org-agnostic; the **command** supplies the org targeting.

## Dashboard surface

The `AppBuilderCard` (`features/dashboard/ui/components/AppBuilderCard.tsx`) renders beside the
mesh card whenever the project has Adobe context (so the "Add an App Builder app" affordance is
reachable) or already carries an app. States: **No app** (URL input + Add) / **Deploying**
(progress via the dashboard status channel) / **Deployed** (action URLs + Redeploy + Remove) /
**Error** (inline + Retry). Dashboard handlers: `addApp`, `deployApp`, `redeployApp`, `removeApp`
(see `features/dashboard/README.md`).

## Reuse

Reused **as-is** (no fork): `withOrgContext` + `buildOrgTargetFromProjectAdobe`, `CommandExecutor`
(`useNodeVersion`/`enhancePath`/streaming), `componentManager.installComponent`/`removeComponent`,
`ensureAdobeIOAuth`, `detectProjectOrgMismatch`, the dashboard status channel, and the
`installBlockCollections` additive pattern. The **only** new shared abstraction is
`@/core/shell/buildComponent` (two callers, byte-identical) — no generalized "App Builder
component framework" until a third component kind appears (Rule of Three).

## Scope & deferrals

Slice 1 ships the deploy spine: attach one app from a public URL and deploy/redeploy/remove it.
Deferred to later slices: curated app catalog, package-binding, scaffolding/authoring,
app-only projects, and multi-workspace + programmatic API-subscription.

## Testing

`tests/features/app-builder/` mirrors this directory. Services mock `CommandExecutor.execute`
and `componentManager`; never shell out. Card/screen tests use `@testing-library/react`. The
mesh `meshDeployment` tests are the regression gate for the `buildComponent` extraction.
