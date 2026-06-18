# Research: Generalized Adobe I/O Deployable + Workspace Provisioning

**Date:** 2026-06-15
**Type:** Hybrid (codebase + Adobe platform)
**Status:** Complete (workspace-model practical analysis appended)
**Feeds:** `/rptc:feat` — generalized deploy capability serving API Mesh + user-supplied App Builder apps

---

## Premise

Make App Builder app deployment FIRST-CLASS functionality (MCP is a thin wrapper — verified
this session). Forcing use case: a Commerce backend (PaaS or SaaS) + one App Builder app,
deployed, with NO storefront. Re-architect mesh deployment into a shared model, and adopt a
"Mesh-focused workspace" concept where dedicated workspaces delineate capabilities.

---

## Summary

The mesh deploy *orchestration shape* and its supporting infra are reusable, but every concrete
step inside `deployMeshComponent` is mesh-bound and the state model is a hard singleton — so the
answer is **improve + carry forward**, not reuse-as-is. The two net-new CLI capabilities both
exist (`aio app deploy`, `aio console workspace create`). The pivotal question is the workspace
model: provisioning a fresh workspace's credentials/API-subscriptions is the cost that decides
whether "one project per demo + workspace-per-integration" is good UX.

---

## 1. Deploy core — reuse the skeleton, inject the rest (confidence: high)

**File:** `src/features/mesh/services/meshDeployment.ts`

`deployMeshComponent` (`:141-233`): `build → validate mesh.json → aio api-mesh:create|update
--autoConfirmAction → poll (aio api-mesh get) → DataResult<{meshId,endpoint}>`, never throws.
create-vs-update is driven purely by a caller-supplied `existingMeshId`.

**Reuse as-is:**
- `CommandExecutor` plumbing: `useNodeVersion`/`enhancePath`/`streaming`/`onOutput` (`:169-192`).
- App-Builder permission gate: `projectRequiresAppBuilder` + `testDeveloperPermissions`, fires at
  `executor.ts:640` (create) and `deployMesh.ts:94` (manual). The predicate already frames mesh as
  "an App Builder operation" — the natural seam for app-builder apps.
- Workspace targeting: `selectWorkspace` → `aio console workspace select` (`adobeEntitySelector.ts:344`).

**Must generalize:** `buildMeshComponent`, the `mesh.json` artifact, `aio api-mesh:*`, the
`aio api-mesh get` status poll, and `graph.adobe.io` endpoint derivation are all mesh-only. App
Builder builds differently, deploys idempotently (no create/update split), and gets URLs from
`aio app get-url --json`.

**Drift to consolidate:** THREE `aio api-mesh` invocation sites outside the core
(`deployMesh.ts:196`, `createHandlerHelpers.ts:120`, `createHandler.ts:233`) and THREE poll/verify
implementations. Folding `deployMesh.ts` in must preserve its update-only/no-build mode, dual
progress sinks (notification + dashboard status), and `meshStatusSummary` write.

**Verdict:** extract `ensureWorkspaceContext → build → deploy(strategy) → verify(strategy) →
persist(keyed state)`; mesh and app-builder are two strategy sets.

---

## 2. Net-new CLI — both exist; credentialing is the catch (confidence: high)

- `aio app deploy --no-publish` deploys actions + web assets to the **ambient** selected workspace.
  Action URLs via `aio app get-url --json` (robust; beats stdout scraping). **One runtime namespace
  per workspace** (Adobe security docs, confirmed). `app.config.yaml` + `.env` (`AIO_RUNTIME_NAMESPACE`
  /`AIO_RUNTIME_AUTH`/`AIO_RUNTIME_APIHOST`) drive targeting.
- `aio console workspace create --projectName <p> --name <n> -j` is non-interactive, returns the
  workspace id. `aio console workspace select <id>` sets ambient context for the subsequent deploy.
- **The catch:** creating a workspace does NOT provision credentials. Per Adobe docs, you must add an
  OAuth S2S credential + API subscriptions, then `aio app use -w <id>` to materialize `AIO_RUNTIME_*`.
  Via raw CLI this is awkward. **See the appended workspace-model analysis** — the extension already
  has SDK-based credential creation, which changes this calculus.

---

## 3. Workspace model (confidence: high on constraints, low on "best practice")

- Hard limits: **1 mesh per workspace**, **1 namespace per workspace**; two apps in one namespace
  risk package-name collisions (OpenWhisk upsert overwrites).
- Adobe's *documented* model: workspaces = environments (Stage/Prod/sandboxes), NOT packaging units
  for unrelated capabilities. A dedicated "Mesh workspace" is *supported* but NOT a documented best
  practice — an architectural choice.
- Constraints only *force* a new workspace at the **2nd-mesh or 2nd-app** boundary.

---

## 4. State + persistence — singleton must become keyed (confidence: high)

`project.meshState` (singular, `base.ts:88`) + `getMeshComponentInstance` returning `[0]` (linchpin,
~9 fan-out callers) + 20+ `meshState?.endpoint` readers + `meshStatusSummary` (1/project) + manifest
read/write (`projectConfigWriter.ts:94`, `projectFileLoader.ts:89`). A `deployables` record keyed by
component+workspace touches all of these, plus a manifest schema migration.

---

## 5. Backend-only / no-storefront — concrete blockers (confidence: high)

- `Stack.frontend` and `Stack.backend` are required (schema `stacks.schema.json:74` + type).
- No "app-builder" component category — `projectRequiresAppBuilder` reads only
  `registry.components.mesh`, so "an App Builder app" today *is* "a mesh."
- `settings` (Connect Commerce) step is unconditional; `welcome` requires package + stack.
- Executor is partly ready (`executor.ts:1106` adds frontend conditionally) but schema/type/wizard
  hard-require it. `MESH_ENDPOINT` has no sink without a storefront `.env`.
- **Landmine:** two parallel stack definitions — `project-creation/config/stacks.json` (runtime truth)
  AND an embedded block at `components.json:272-297`. Any frontend-optional change reconciles both.

---

## 6. Citisignal headless mesh is already separable (confidence: high)

The mesh (`headless-commerce-mesh`) is a subType-identified component, not coupled to the storefront
source. Its only couplings: selection (reachable only as a stack optional-dep), deploy target (single
workspace), and output (`MESH_ENDPOINT` → storefront `.env`). Adapting to a Mesh workspace reworks
exactly those three.

---

## Recommendations

1. **Improve + carry forward.** Extract the generalized deployable capability; consolidate the three
   inline `api-mesh` sites + three poll loops as mesh migrates onto it.
2. **Workspace model — see appended analysis.** Decide between "workspace-per-integration under one
   project" vs "one shared workspace, split only at the forced boundary."
3. **Sequence the singleton→keyed state migration first** — it is the foundation.
4. **Treat backend-only as its own slice** — needs a real app-builder component category, frontend-
   optional stacks (both definitions), conditional wizard steps, a non-storefront output sink.

---

## Open decisions for `/rptc:feat` Phase 2

- Workspace model (the headline fork — see appended analysis).
- App source per app-builder entry: user git URL vs curated starters vs both.
- Placement: creation wizard vs dashboard add/redeploy vs both.
- Manifest migration strategy for existing demos (singleton meshState → keyed).

---

## Appended: Workspace-model practical analysis (one project per demo, workspace-per-integration)

**Premise tested:** one Console *project* per demo; *workspaces* delineate which integrations are
used. The project half matches Adobe's documented model exactly. The question is the workspace half.

**Two distinct credential concepts (conflating them overstates the cost):**

| Credential | Purpose | Headless today? |
|---|---|---|
| Runtime namespace (`AIO_RUNTIME_*`) | Authenticates the *deploy* (`aio app deploy`/`aio api-mesh`) | Yes — auto-created with the workspace; `aio app use -w <id>` materializes it. 1 namespace/workspace. |
| OAuth S2S credential | Lets the deployed app/mesh *call Adobe product APIs* at runtime | Yes (partial) — `createWorkspaceCredential` (`adobeEntityFetcher.ts:438`) creates a **bare** S2S credential via the Console SDK (`createOAuthServerToServerCredential`). |
| API subscriptions on that credential | Which Adobe products the credential may call (Firefly, Commerce-S2S, Assets, I/O Mgmt) | **No — zero code.** No `subscribe`/`addService`/`getServicesForOrg` anywhere. The one real gap. |

**Per-demo flow under the model:** Adobe setup → one project. Per integration: `workspace create`
(headless) → `aio app use -w` runtime creds (headless) → bare S2S credential (headless, exists) →
**subscribe APIs (gap — manual Console step unless built)** → deploy (headless) → collect endpoint.
Then: consumer `.env` must aggregate endpoints from **every** workspace it consumes (net-new plumbing).

**Findings:**
- Workspace create + runtime-cred download + bare S2S credential are ALL already headless.
- The only unautomated step is **API subscription** to a fresh workspace's credential — fine for a
  pure passthrough mesh (citisignal `headless-commerce-mesh` needs none), but required for any
  integration calling Adobe product APIs.
- The platform only FORCES a 2nd workspace at the **2nd-mesh or 2nd-app** boundary; a mesh + one app
  coexist in one workspace (different artifact types, no namespace collision). So workspace-per-
  integration is MORE granular than required.
- Multi-workspace output aggregation is net-new and unavoidable when consumers span workspaces.

**Recommendation:** Adopt one-project-per-demo (✓). Default to **one workspace per demo holding mesh +
app(s)**; provision additional workspaces only when forced (2nd mesh / 2nd app) or for deliberate
capability isolation in the demo narrative. **Build programmatic API-subscription** (SDK
`subscribeCredentialToServices`) into the deployable capability — that makes any new workspace fully
headless and removes the only real objection to the per-integration model, keeping it available
without paying for it by default.

**Validate before committing:** can a freshly created bare workspace deploy a mesh + app WITHOUT a
manual Console API-subscription? Probe: create empty workspace via CLI → download creds → deploy the
passthrough mesh. Result determines whether the API-subscription gap is universal or only bites
product-API integrations.

## Sources

- Codebase: `meshDeployment.ts`, `meshDeploymentVerifier.ts`, `executor.ts`, `deployMesh.ts`,
  `createHandler*.ts`, `typeGuards.ts`, `base.ts`, `stacks.json`/`components.json`/`demo-packages.json`,
  `adobeEntitySelector.ts`, `authenticationService.ts`, `adobeEntityFetcher.ts`.
- Adobe (developer.adobe.com): App Builder Deployment/Configuration/Security guides; API Mesh CI/CD &
  Command Reference; OAuth S2S implementation + Add-API guides; aio-cli-plugin-app/-console/-api-mesh
  READMEs (24+ sources, cross-verified).
