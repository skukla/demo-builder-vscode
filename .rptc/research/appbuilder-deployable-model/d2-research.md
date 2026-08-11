# D2 Research — Selection UX + runner/subscriber wiring (incl. step 09)

**Date:** 2026-06-21 · **Branch:** `feature/appbuilder-deployable-model-d2` (develop + merged D1)
**Plan:** [`../../plans/appbuilder-deployable-model/overview.md`](../../plans/appbuilder-deployable-model/overview.md) · **D1 findings:** [`./d1-spike-findings.md`](./d1-spike-findings.md) · **Deferred step:** [`../../plans/appbuilder-deployable-model/step-09.md`](../../plans/appbuilder-deployable-model/step-09.md)
**Mode:** A (codebase exploration). Research only — no production code modified.

D2 has two halves: **(A) wiring** the D1 runner/subscriber into live flows + retiring the manual mesh
setup (step 09), and **(B) selection UX** (wizard + dashboard). They are largely separable; see the
recommended sequence at the end.

---

## 0. The one-sentence state of D1 (what's built vs wired)

D1 shipped a complete, **DI-pure, unit-tested** add/deploy/remove engine
(`deployableRunner.ts`) plus a two-path API subscriber (`apiSubscriber.ts`) and a default-deps factory
(`deployableRunnerDeps.ts`). **Nothing calls them.** The live mesh path
(`DeployMeshCommand` → `deployMeshComponent`) and the wizard check (`handleCheckApiMesh`) were left
untouched, so the manual Console-UI remediation is still the only path for an absent API Mesh API.
D2 is the wiring + UX layer on top of that engine.

---

## A — WIRING + STEP 09

### A.1 Current-surface map (the live mesh deploy path to wire into)

| Surface | File:line | What it does today | D2 relevance |
|---|---|---|---|
| Mesh deploy command | `src/features/mesh/commands/deployMesh.ts:32-255` | `execute()`: lock → `ensureProjectAdobeContext` preflight (`:63`) → App Builder permission gate (`:97-110`) → `getMeshComponentInstance` (`:113`) → `deployMeshComponent(...)` **directly** (`:165-173`) → persist `meshState` + `meshStatusSummary` | **Primary call site to wire the subscriber.** It never calls `subscribeRequiredApis`/`addDeployable` — that's the gap. |
| Mesh deploy core | `src/features/mesh/services/meshDeployment.ts:101` (`deployMeshComponent`) | Build + `aio api-mesh:create\|update` + verify. Shared by deployMesh, project-creation, reset. | The runner's `deployMesh` dep is THIS fn unchanged (`deployableRunnerDeps.ts:91`). Don't fork it. |
| App deploy command (sibling precedent) | `src/features/app-builder/commands/deployApp.ts:22-199` | Identical guard order to deployMesh; calls `deployAppComponent` inside `withOrgContext` (`:159`). Persists `appState`. | The **template** for how a D2 command/handler assembles auth+org+permission guards then deploys. Mirror its structure. |
| Wizard mesh check handler | `src/features/mesh/handlers/checkHandler.ts:78-332` | `handleCheckApiMesh`: downloads workspace config under `withOrgContext` (`:139`), reads `workspace.details.services`, and on absent API returns `setupInstructions` (`:188-197`, `:286-294`) for `MeshErrorDialog`. | **The step-09 retirement target** — the manual remediation. |
| Setup-instructions source | `src/features/project-creation/config/api-services.json` (`services.apiMesh.setupInstructions`); resolved via `getSetupInstructions` (`checkHandler.ts:17`, `helpers/setupInstructions.ts`) | The 3 manual Console-UI steps + `{{ALLOWED_DOMAINS}}` = frontend `localhost:<port>`. | Delete in step 09 (no soft-deprecation). |
| Project-creation mesh path | `src/features/project-creation/services/meshSetupService.ts:231,341` (calls `deployMeshComponent`) | The create-time mesh deploy. | Second call site that, like deployMesh, deploys a mesh without subscribing the API. Decide whether D2 wires the subscriber here too (see PM decision A-1). |

### A.2 `ApiSubscriberClient` — methods, what exists, what's MISSING

The interface the runner's deps expect (`apiSubscriber.ts:51-66`):

| Method | On `AdobeEntityFetcher`? | Evidence |
|---|---|---|
| `getServicesForOrg(orgId)` | ✅ exists | `adobeEntityFetcher.ts:605-612` |
| `createAdobeIdCredential(org, proj, ws, {name,description,platform:'apiKey',domain})` → `id_integration` | ✅ exists | `adobeEntityFetcher.ts:619-633` |
| `subscribeAdobeIdIntegrationToServices(org, idIntegration, serviceInfo[])` | ✅ exists | `adobeEntityFetcher.ts:640-652` |
| `subscribeOAuthServerToServerIntegrationToServices(org, idIntegration, serviceInfo[])` | ✅ exists | `adobeEntityFetcher.ts:659-671` |
| **`ensureOAuthCredentialId(target)` → `id_integration`** | ❌ **MISSING** | not on the fetcher; only `createWorkspaceCredential`/`getWorkspaceCredential` exist (`:441,520`) |

`createOAuthServerToServerCredential` and `getCredentials` are the SDK primitives the fetcher already
wraps (`createWorkspaceCredential` at `:520-598` uses `createOAuthServerToServerCredential`;
`getWorkspaceCredential` at `:441-512` uses `getCredentials`). But **both resolve their own client_id
(for the ACCS `x-api-key`), NOT the `id_integration` the subscribe call needs.** That's the gap
`ensureOAuthCredentialId` fills.

### A.3 `ensureOAuthCredentialId` — design from existing pieces

**Contract** (from `apiSubscriber.ts:53-54`): "Ensure the shared S2S credential exists; return its
`id_integration`." Used in `subscribeOAuthServices` (`apiSubscriber.ts:120`) before
`subscribeOAuthServerToServerIntegrationToServices`.

**Why neither existing method works as-is:** the subscribe id is the credential's `id_integration`
(d1 findings, confirmed live: "credentialId must be `id_integration`"). `createWorkspaceCredential`
returns a `WorkspaceCredential` with `clientId` = the apiKey/client_id, discarding `id_integration`.
`getWorkspaceCredential` likewise returns `clientId` only. The raw SDK responses DO carry
`id_integration` (`RawWorkspaceCredential.id_integration`, `types.ts:98`;
`createOAuthServerToServerCredential` returns `{ id, apiKey }` where `id` ≈ the integration id per the
spike).

**Recommended implementation** (a new method on `AdobeEntityFetcher`, mirroring the existing
create-or-get-on-409 pattern in `createWorkspaceCredential:586-593`):

```
async ensureOAuthCredentialId(orgId, projectId, workspaceId): Promise<string> {
  // 1. List existing creds; return an existing S2S credential's id_integration if present.
  const creds = await client.getCredentials(orgId, projectId, workspaceId);   // SDKResponse<RawWorkspaceCredential[]>
  const existing = creds.body?.find(c => c.integration_type === 'oauth_server_to_server' && c.id_integration);
  if (existing?.id_integration) return existing.id_integration;
  // 2. Else create one; the create response's id IS the integration id (spike: cred <id>).
  const created = await client.createOAuthServerToServerCredential(orgId, projectId, workspaceId, NAME, DESC);
  // create returns { id, apiKey }; `id` is the id_integration for the subscribe call.
  return created.body.id;
}
```

Notes:
- This is the same create-or-get idempotency as `createWorkspaceCredential` (which handles the 409 by
  re-fetching). Prefer **list-first** (a `getCredentials` read) over catch-409 here because the subscribe
  needs the id_integration regardless of who created the credential.
- **Open verification (LOW):** confirm `createOAuthServerToServerCredential().body.id` equals the
  `id_integration` the subscribe expects (the spike used the create-response `id` and it worked —
  `<credential-id>` — but the field name path through the SDK wrapper should be asserted in a test). If
  it diverges, fall back to a `getCredentials` re-read after create.
- **Arg shape mismatch to resolve:** the existing fetcher's `getCredentials`/`createOAuthServerToServer`
  paths (`:441-598`) read org/proj/ws from `cacheManager`, NOT from args. The NEW D1 methods
  (`createAdobeIdCredential` etc.) take explicit args. `ensureOAuthCredentialId` should take explicit
  `(orgId, projectId, workspaceId)` args (matching the `OrgTarget` the subscriber passes) for testability
  and to avoid the cache dependency — i.e. add explicit-arg `getCredentials`/`createOAuthServerToServer`
  call sites rather than reusing the cache-bound public methods.

### A.4 The adapter — wiring `ApiSubscriberClient` over `AdobeEntityFetcher`

`buildDefaultRunnerDeps(ctx)` (`deployableRunnerDeps.ts:82-106`) requires `ctx.subscriberClient:
ApiSubscriberClient`. There is **no adapter yet** — D2 builds it. Two shapes:

- **Option 1 (recommended) — a thin adapter object** in `src/features/app-builder/services/` (e.g.
  `apiSubscriberClientAdapter.ts`) that holds an `AuthenticationService` and forwards each
  `ApiSubscriberClient` method to the fetcher. Requires the AuthenticationService to expose the 5 fetcher
  methods (it currently exposes only `getWorkspaceCredential`/`createWorkspaceCredential`,
  `authenticationService.ts:415-427`). Add passthroughs: `getServicesForOrg`, `createAdobeIdCredential`,
  `subscribeAdobeIdIntegrationToServices`, `subscribeOAuthServerToServerIntegrationToServices`,
  `ensureOAuthCredentialId` (the new one). All go through `ensureEntities()` → `{ fetcher }`
  (`:405,416`).
- **Option 2 — `AdobeEntityFetcher` *is* the client.** It already implements 4 of 5; add
  `ensureOAuthCredentialId` and the fetcher satisfies the interface directly. Simpler (no adapter file),
  but couples the runner's deps to the fetcher's lifecycle (SDK-ready gating, cache). The adapter
  (Option 1) keeps the runner boundary clean and is the KISS-consistent choice given the
  AuthenticationService is the existing public seam.

**Recommendation:** Option 1 — add the 5 passthroughs to `AuthenticationService`, write a ~30-line
adapter that closes over it. Mirrors how every other feature reaches Adobe (via the service, not the
fetcher).

### A.5 Assembling `RunnerDepsContext` at the call site

`buildDefaultRunnerDeps` needs (`deployableRunnerDeps.ts:33-42`): `componentManager`, `commandManager`,
`logger`, `saveProject`, `getCachedOrganization`, `subscriberClient`, `catalog`, `secrets`. Where each
comes from in a command context (all available in `DeployMeshCommand` / a new handler):

| Field | Source |
|---|---|
| `componentManager` | `ServiceLocator` / `ComponentManager` (already used across deploy paths) |
| `commandManager` | `ServiceLocator.getCommandExecutor()` (`deployMesh.ts:166`) |
| `logger` | `this.logger` (BaseCommand) |
| `saveProject` | `this.stateManager.saveProject` (`deployMesh.ts:200`) |
| `getCachedOrganization` | `ServiceLocator.getAuthenticationService().getCachedOrganization()` (`authenticationService.ts:438`; used at `checkHandler.ts:133`) |
| `subscriberClient` | the new adapter (A.4) over the auth service |
| `catalog` | `getAvailableDeployables(...)` from `deployableCatalogLoader.ts` (loader exists; D1) |
| `secrets` | `context.secrets` (the extension's `vscode.SecretStorage`) |

### A.6 Step 09 — what changes once wired

Step-09's DEFERRED banner is accurate: its true prerequisite is "a concrete `ApiSubscriberClient`
adapter incl. `ensureOAuthCredentialId` + a live call site that invokes `addDeployable` / a bounded
pre-deploy `subscribeRequiredApis`." Once A.1–A.5 land:

- **Minimal wiring (recommended for the absent-API fix):** in `DeployMeshCommand` (and, per PM decision
  A-1, `meshSetupService`), before `deployMeshComponent`, call a bounded
  `subscribeRequiredApis(catalog, project)` (the runner's dep, which the default factory wires to the
  apiKey path that adds API Mesh `GraphQLServiceSDK` with the derived `localhost:<port>` domain). This is
  narrower than routing mesh deploy through the full `addDeployable` (which also clones/installs) — the
  mesh component is already cloned at this point, so a pre-deploy subscribe is the surgical insert.
- **Then step 09 proper:** `handleCheckApiMesh` stops returning `setupInstructions`
  (`checkHandler.ts:188-197`, `:286-294`); delete `services.apiMesh.setupInstructions` from
  `api-services.json`; remove the API-Mesh branch of `MeshErrorDialog` + the `getSetupInstructions`
  API-Mesh wiring. Keep `apiEnabled` detection as the post-automation verification signal (the same
  `workspace.details.services` read).
- Step-09's RED tests (its lines 33-47) become assertable: "absent API → subscriber invoked", "after
  automation apiEnabled:true", "no `setupInstructions` for missing-API", "already-enabled = no-op".

---

## B — SELECTION UX

### B.1 Current-surface map (what to generalize)

**Wizard:**

| Surface | File:line | Today (singular mesh) | Generalize to |
|---|---|---|---|
| Architecture modal mesh toggle | `src/features/project-creation/ui/components/ArchitectureModal.tsx:123-154,298-302` | A single mesh on/off toggle, shown when the stack has optional mesh deps AND the package's mesh requirement is `optional` (`:136`); auto-included when required (`:137`). Toggles `selectedOptionalDependencies` against the hardcoded mesh component ids (`isMeshComponentId`, `:127`). | A "pick your deployables" affordance: the **catalog filtered by backend/frontend** (`getAvailableDeployables` already filters via `fitsAxis`), replacing the `optionalDependencies`+`isMeshComponentId` mesh-only logic. The mesh becomes one catalog row. |
| Mesh deployment step (UI) | `src/features/mesh/ui/steps/MeshDeploymentStep.tsx:53-` | Progress/verify/retry UI for the single mesh deploy during creation. NOT a `wizard-steps.json` step — it's a sub-flow component. | A per-deployable (or multi-deployable) deploy-progress surface; reuse `ProgressTracker`. |
| Wizard step flow | `src/features/project-creation/config/wizard-steps.json` (12 steps) | No "deployables" step. Mesh selection is folded into `welcome`/ArchitectureModal; mesh deploy happens inside `create-project`. | Decide: a new dedicated step vs. extend ArchitectureModal (PM decision B-1). |

**Dashboard:**

| Surface | File:line | Today (singular) | Generalize to |
|---|---|---|---|
| App Builder card (slice 1) | `src/features/dashboard/ui/components/AppBuilderCard.tsx:1-143` | One card, 4 states (no-app / deploying / deployed / error); posts `addApp`/`deployApp`/`redeployApp`/`removeApp`; URL input front door (`:41-66`). Uses `StatusCard` + quiet Links per dashboard conventions. | A **deployables list** surface: N rows (one per `project.deployables[id]`), each with the same 4-state machine + add-a-deployable picker (catalog) + custom-URL door. The AppBuilderCard's state machine + message pattern is the per-row template. |
| Mesh status badge | rendered via `StatusDisplay`/`ActionGrid` (`ProjectDashboardScreen.tsx:413-433`); `handleDeployMesh` (`useDashboardActions.ts:98-100` posts `deployMesh`) | A dedicated mesh badge + Deploy Mesh action, separate from the App card (`ProjectDashboardScreen.tsx:436-445`). | Fold the mesh into the deployables list as a `kind:'mesh'` row OR keep the mesh badge and add a separate integrations list (PM decision B-2). |
| Dashboard status hook | `src/features/dashboard/ui/hooks/useDashboardStatus.ts:303-358` | Routes `checkResult` by `checkId` (org-context, mcp-health, mesh-verify, ai-verify); maps mesh-verify `warning` → flip mesh badge to not-deployed (`:335-339`). | A deployables-list status integrates here: either a new per-deployable check or extending `mesh-verify` (PM decision A-2 below). |
| Card render site | `src/features/dashboard/ui/ProjectDashboardScreen.tsx:441-445` | `<AppBuilderCard app={appState} />`, gated by `shouldShowAppCard(hasAdobeContext, appState)`. | The deployables list replaces this block. |

### B.2 The "what the user provides" rule → generic collection surface

D1 findings (lines 406-432) define the UX classification: per deployable, **(1) auto-provisioned —
never ask** (project/workspace/creds/APIs/`ow.package`/domain), **(2) auto-wired from a provider —
show as "connected"** (`providesEnvVars` → consumer; mesh `MESH_ENDPOINT` → storefront), **(3)
user-provided — ASK** (catalog `envSchema` minus buckets 1+2 minus already-known config).

The enabler already exists in D1: each catalog entry carries `envSchema:[{name,type,label,
derivedFrom?,providedBy?}]` (`deployables.json:19-26`; loader `getDeployableEnvSchema` in
`deployableCatalogLoader.ts`). The runner already enforces provider-before-consumer via `providedBy`
(`deployableRunner.ts:118-127 findMissingProvider`). So B's collection surface computes bucket 3 from
`envSchema` and:
- non-secret (`type:'text'`, `derivedFrom`) → Configure UI → `componentConfigs` → `.env`.
- secret (`type:'secret'`) → masked input → VS Code **SecretStorage** (per
  [[feedback_secrets_in_public_repo]] — repo is PUBLIC). Note: today's seed entries are all
  `type:'text'` with `derivedFrom:'connect-commerce'`, so mesh deployables need **zero** new user input;
  the secret path is exercised only by future integrations.

**Generalize the Configure screen** (currently Commerce/mesh-shaped) to render bucket 3 from any
deployable's `envSchema`. This is the HIGH gap from the plan (overview.md:286-298).

---

## C — PR #55 constraints to honor (VERIFIED in code)

| Constraint | Status | Evidence |
|---|---|---|
| On-open orchestrator exists | ✅ | `runOnOpenChecks` (`onOpenChecks/orchestrator.ts:35`); registry assembled in `dashboardHandlers.ts:136-160`; fire-and-forget at `:162-170`. |
| Single `checkResult` channel + `CHECK_IDS` | ✅ | `CHECK_RESULT_MESSAGE='checkResult'` + `CHECK_IDS={ORG_CONTEXT,MESH_VERIFY,MCP_HEALTH,AI_VERIFY}` (`types/messages.ts:203-216`). Webview routes by `checkId` (`useDashboardStatus.ts:306-357`). **A deployables check must add a new `CHECK_IDS` entry, not a new message type.** |
| `createMeshVerifyCheck` factory pattern | ✅ | `meshVerifyCheck.ts:54-86` — DI'd `verify`/`syncMeshStatus`/`markDirty`; returns `OnOpenCheck`; `reRunnable:true`; orchestrator stamps `checkId`. The model for any new deployables check. |
| `getOrganizationsSdkOnly()` for non-interactive org reads | ✅ | `authenticationService.ts:379-383` → `adobeEntityFetcher.ts:287`. `orgContextCheck` uses it (`orgContextCheck.ts:120`). **On-open deployable checks must use SDK-only/cached reads, never a CLI/browser path.** |
| `StatusCard` `action` prop | ✅ | `StatusCardProps.action?: StatusCardAction{label,onPress,testId}` (`StatusCard.tsx:13-34`). "The ONE place dashboard statuses surface a per-status action" — a quiet remediation Link. Use it for per-deployable CTAs (e.g. "Deploy", "Sign in"). |
| P1 — no surprise side effects on open | ✅ doc'd | `onOpenChecks/types.ts:9-16` — `run` MUST be non-interactive; return `unknown` ("click to check") rather than prompting/launching a browser. **A deployables on-open check must be a quick probe, NOT a deploy or an `aio` write.** |
| P2 — no silent failures on open | ✅ doc'd | `types.ts:14-17` + orchestrator converts a throw into a posted `error` outcome (`orchestrator.ts:62-68`). Every deployables check must always yield a typed outcome. |

**Net:** any dashboard deployables-status integration must (a) add a `CHECK_IDS` entry, (b) follow the
`createXCheck` DI factory shape, (c) use cached/SDK-only reads (P1), (d) always post a typed outcome
(P2), (e) surface per-row remediation via `StatusCard.action`, not bespoke placement.

---

## D — Open design decisions for the PM (surface, don't decide)

**Wiring (A):**

- **A-1. Where to wire the pre-deploy subscribe.** `DeployMeshCommand` only? Or also
  `meshSetupService` (create-time) and the reset flows (`edsResetMeshHelper`, `projectResetService`)
  which all call `deployMeshComponent` directly? *Recommendation: wire `DeployMeshCommand` +
  `meshSetupService` in D2 (the two user-initiated mesh deploys); the reset flows redeploy an
  already-subscribed mesh, so they're lower priority — confirm.*
- **A-2. Subscribe granularity: bounded `subscribeRequiredApis` vs full `addDeployable`.** The mesh
  component is already cloned by the time `DeployMeshCommand` runs, so calling the full `addDeployable`
  (which clones+installs) would double-work. *Recommendation: insert a bounded `subscribeRequiredApis`
  before `deployMeshComponent`; reserve `addDeployable` for the NEW "add a deployable" UX (B).*
- **A-3. Adapter location/shape.** Option 1 (auth-service passthroughs + thin adapter) vs Option 2
  (fetcher *is* the client). *Recommendation: Option 1.*
- **A-4. Do step 09 (delete manual path) in D2, or only wire the automation and defer the deletion?**
  Step 09's risk is "removing remediation before automation is proven." *Recommendation: wire +
  prove the subscriber first (RED test on absent-API), THEN delete the manual path in the same slice
  once green — but it could split to D3 if D2 gets large.*

**Selection UX (B):**

- **B-1. Wizard: new dedicated "Deployables" step vs. extend ArchitectureModal?** ArchitectureModal
  already hosts architecture + block-library selection; adding a deployables picker there keeps one
  modal. A dedicated `wizard-steps.json` step is more discoverable but adds a step. *No recommendation —
  PM UX call.*
- **B-2. Dashboard: one unified deployables list (mesh as a `kind:'mesh'` row) vs. keep the mesh
  badge + a separate integrations list?** Unifying matches the Model B "pieces on a shelf" vision but
  touches the load-bearing mesh badge + `mesh-verify` check. Keeping them separate is lower-risk but
  perpetuates the singular special-case. *No recommendation — PM call; flag the migration risk to the
  mesh badge either way.*
- **B-3. Per-deployable status model for integrations.** Mesh has a rich enum
  (`deployed/not-deployed/pending/error/deploying`); the slice-1 AppBuilderCard uses
  `not-deployed/deploying/deployed/error`. Adopt the AppBuilderCard set for integrations? *Recommendation:
  reuse AppBuilderCard's 4-state set as the per-row baseline; mesh keeps its richer enum.*
- **B-4. On-open status for the deployables list:** new `CHECK_IDS.DEPLOYABLES` check (one check that
  probes all deployables) vs. per-deployable checks vs. no on-open check (status from persisted state +
  on-demand). Per P1, an on-open check must be a cheap probe. *Recommendation: persisted-state badges +
  a single on-demand verify action per row; only add an on-open check if a cheap SDK probe exists.*
- **B-5. Add-a-deployable front doors in D2.** Catalog picker + custom-URL are in scope per the plan;
  AI-shell is D4. Confirm custom-URL is in D2 (the AppBuilderCard already has a URL input —
  `AppBuilderCard.tsx:41-66`).
- **B-6. Removal confirmation UX.** `removeDeployable` (`deployableRunner.ts:322`) is a destructive
  cloud undeploy. The slice-1 card's Remove (`AppBuilderCard.tsx:106`) has no confirm. *Recommendation:
  add a confirm dialog for remove in D2.*

---

## E — Recommended D2 step sequence

**Split A (wiring) from B (UX) into two sub-tracks; ship A first** — A is the load-bearing prerequisite
the plan's overview and step-09 banner both call out (built ≠ wired), and it removes real manual
friction from today's mesh experience independent of any UX. B can then build the "add a deployable"
flow on a proven engine.

**Track A — wiring + step 09 (do first):**
1. **A-step 1 — `ensureOAuthCredentialId` on `AdobeEntityFetcher`** (RED: list-first then create; assert
   it returns `id_integration`). + 5 AuthenticationService passthroughs.
2. **A-step 2 — `ApiSubscriberClient` adapter** over the auth service (the missing
   `ctx.subscriberClient`). Unit test: each method forwards.
3. **A-step 3 — wire bounded `subscribeRequiredApis` into `DeployMeshCommand`** (+ `meshSetupService`
   per A-1) before `deployMeshComponent`, assembling `RunnerDepsContext` (A.5). RED: absent-API → mesh
   deploy invokes the subscriber (apiKey path adds `GraphQLServiceSDK` with derived `localhost:<port>`).
4. **A-step 4 — step 09 proper:** delete the manual `setupInstructions` path (`checkHandler.ts`,
   `api-services.json`, `MeshErrorDialog` API-Mesh branch); keep `apiEnabled` as verification. RED:
   step-09's four tests.

**Track B — selection UX (after A green):**
5. **B-step 1 — generalize the Configure collection surface** from `envSchema` (buckets 1/2/3), secrets
   → SecretStorage. (Functional HIGH gap; underpins both wizard and dashboard.)
6. **B-step 2 — wizard catalog picker** (ArchitectureModal or a new step per B-1): replace the
   mesh-only toggle with the filtered catalog (`getAvailableDeployables`); Review lists selections.
7. **B-step 3 — dashboard deployables list:** generalize `AppBuilderCard` into N rows over
   `project.deployables`; add-a-deployable picker + custom-URL; per-row add/deploy/remove via the runner
   (`addDeployable`/`deployDeployable`/`removeDeployable`); remove-confirm (B-6); status via persisted
   state + `StatusCard.action`, integrating with the onOpenChecks orchestrator per Section C (B-2/B-4).

**Rationale for the split:** A is small, low-UX-risk, test-first, and unblocks step 09 + every future
integration; B is the larger UX surface with the open PM decisions (B-1, B-2). Shipping A as its own
PR keeps the manual-mesh retirement reviewable in isolation; B then has no functional unknowns left.

---

## Uncertainties / flags

- **`createOAuthServerToServerCredential().body.id` == `id_integration`?** (A.3) — spike used the create
  `id` successfully, but assert the field path in a test; fallback = `getCredentials` re-read.
- **Reset flows (`edsResetMeshHelper`, `projectResetService`) calling `deployMeshComponent`** — confirm
  whether they need the subscriber too (A-1); they redeploy an already-subscribed mesh, so likely no.
- **`MeshErrorDialog` other error states** — step 09 must remove only the API-Mesh branch; verify
  auth/org-mismatch states are independent before deleting (step-09 risk note).
- **Mesh badge ↔ deployables-list migration (B-2)** is the highest-risk UX decision: the mesh badge +
  `mesh-verify` check are load-bearing; unifying them into the list must not break the
  `MESH_ENDPOINT`→storefront edge or the on-open verify.

---
RPTC Compliance: YES
Patterns Found: 8 (DeployAppCommand guard-order template; createMeshVerifyCheck DI factory; StatusCard.action CTA; createWorkspaceCredential create-or-get-on-409; deployableRunnerDeps DI factory; AppBuilderCard 4-state machine; getAvailableDeployables catalog filter; onOpenChecks single-channel orchestrator)
SOPs Consulted: feedback_secrets_in_public_repo, feedback_no_soft_deprecation, reference_dashboard_ui_conventions, reference_canonical_org_context
---
