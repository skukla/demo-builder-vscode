# Step 03 — Bounded pre-deploy `subscribeRequiredApis` in the live mesh deploy path

**Purpose:** Wire the proven D1 subscriber into the live mesh deploy so the API Mesh API is subscribed
AUTOMATICALLY before `deployMeshComponent` runs — closing the "built ≠ wired" gap. Bounded
`subscribeRequiredApis(catalog, project)` only; NOT the full `addDeployable` (the mesh is already cloned
at this point — A-2 decision).

**Prerequisites:** Steps 01 + 02 (the adapter + `ensureOAuthCredentialId` must exist and be green).

## A-1 INVESTIGATION RESULT (shared deploy path — flag for the PM)

`deployMeshComponent` (`meshDeployment.ts:101`) has FOUR call sites (verified repo-wide):

| Call site | File:line | Mesh state at call | Needs the subscribe insert? |
|---|---|---|---|
| **Dashboard redeploy** | `mesh/commands/deployMesh.ts:167` | may be first deploy of a fresh workspace | **YES — primary insert (this step).** |
| **Create-time deploy** | `project-creation/services/meshSetupService.ts:231` (and `:341`) | FIRST mesh deploy of a brand-new project | **YES — same insert needed** (today the wizard's `handleCheckApiMesh` shows manual instructions here; Step 04 removes that, so create-time MUST auto-subscribe or creation breaks). |
| **EDS reset redeploy** | `eds/services/edsResetMeshHelper.ts:46` | redeploys an ALREADY-subscribed mesh | **NO** (API already present; redeploy is idempotent). Flag, don't wire. |
| **Project reset redeploy** | `lifecycle/services/projectResetService.ts:280` | redeploys an ALREADY-subscribed mesh | **NO** (same rationale). Flag, don't wire. |

**Decision surfaced to PM:** wire the subscribe into **`DeployMeshCommand` (this step) AND
`meshSetupService` (create-time)** — both are user-initiated FIRST deploys where the API may be absent.
The two reset flows redeploy an already-subscribed mesh, so they are intentionally left UNSUBSCRIBED
(idempotent subscribe would be harmless but adds an SDK round-trip on every reset for no benefit).
If the PM wants belt-and-suspenders, the same insert is trivially addable to the reset helpers — noted,
not done, to avoid silently leaving them unsubscribed without a decision.

## Surgical anchors (verified file:line)

- `mesh/commands/deployMesh.ts`
  - Guard order: lock (`:39`) → `ensureProjectAdobeContext` preflight (`:63-81`) → App Builder
    permission gate (`:97-110`) → `getMeshComponentInstance` (`:113`) → inside `withProgress`,
    `deployMeshComponent` (`:167-173`). **Insert point: AFTER the permission gate + mesh-component
    resolution, BEFORE `deployMeshComponent`, INSIDE the org-targeted scope.**
  - NOTE: `deployMeshComponent` is already invoked under the preflight's org context;
    `subscribeRequiredApis` must run under the SAME `withOrgContext`/`AIO_CONSOLE_*` targeting (never
    `aio console select`). Wrap the subscribe in `withOrgContext(buildOrgTargetFromProjectAdobe(project))`
    (the same primitive `checkHandler.ts:139` and `deployApp` use), or place it inside the existing
    targeted region.
- D1 wiring to REUSE (no reimplementation):
  - `apiSubscriber.ts:154` `subscribeRequiredApis(deployables, target, client, domain)`.
  - `deployableRunnerDeps.ts:73-79` `subscriberTarget(project)` → `OrgTarget` from `project.adobe.*`.
  - `allowedDomain.ts:20` `deriveAllowedDomain(project)` → frontend `localhost:<port>` (the MANDATORY
    `domain` for the API Mesh apiKey path).
  - `deployableCatalogLoader.ts:38` `getAvailableDeployables(backendId, frontendId)` → the catalog rows
    to subscribe. Resolve backend/frontend from `project.componentSelections`.
  - `apiSubscriberClientAdapter.ts` `createApiSubscriberClient(authService)` (Step 02).
- `OrgServiceInfo`/`ServiceSubscriptionInfo` types: `authentication/services/types.ts:121-140`.

## Wiring shape (KISS — a small helper, NOT the full runner deps)

Reuse `subscribeRequiredApis` directly rather than `buildDefaultRunnerDeps` (which also wires
deploy/republish tails we don't need here — the mesh is already cloned). Extract a thin helper so both
call sites (DeployMeshCommand + meshSetupService) share ONE implementation:

- CREATE `src/features/app-builder/services/ensureMeshApiSubscribed.ts` (~25 lines):
  `ensureMeshApiSubscribed({ project, authService, logger })`:
  1. Resolve the catalog for the project's backend/frontend via `getAvailableDeployables`.
  2. `client = createApiSubscriberClient(authService)`.
  3. `await subscribeRequiredApis(catalog, subscriberTarget(project), client, deriveAllowedDomain(project))`.
  4. Run inside `withOrgContext` targeting the project's org (P1: org-targeted, no `aio console select`).
  - Log start/finish; never log credential `apiKey`/tokens.
  - Export `subscriberTarget`/reuse it (it currently lives in `deployableRunnerDeps.ts` — if reused,
    export it from there; do NOT duplicate the `project.adobe.*` mapping).

## Tests to write FIRST (RED)

Create `tests/features/app-builder/services/ensureMeshApiSubscribed.test.ts`:

- [ ] **absent-API → subscriber invoked (apiKey path):** with a mocked auth service whose
      `getServicesForOrg` returns API Mesh `GraphQLServiceSDK` as `platformList:['apiKey'],
      domainMandatory:true`, calling `ensureMeshApiSubscribed` invokes `createAdobeIdCredential` with
      `platform:'apiKey'` and the DERIVED `domain` (`localhost:<port>` from `deriveAllowedDomain`), then
      `subscribeAdobeIdIntegrationToServices` with `GraphQLServiceSDK`.
- [ ] **baseline included:** `AdobeIOManagementAPISDK` (S2S path) is also subscribed via
      `ensureOAuthCredentialId` + `subscribeOAuthServerToServerIntegrationToServices` (the union baseline,
      `apiSubscriber.ts:26,160`).
- [ ] **catalog-driven `requiredApis`:** the deployables passed to `subscribeRequiredApis` come from
      `getAvailableDeployables(backend, frontend)` for the project's selections (assert the mesh catalog
      row resolves the `requiredApis`).
- [ ] **org targeting:** the subscribe runs inside `withOrgContext` (mock/spy the wrapper; assert it
      wraps the subscribe; never calls `aio console select`).
- [ ] **idempotent / already-enabled:** when `ensureOAuthCredentialId` returns an existing cred id and
      the services already include the API, the union PUT still runs without error (no destructive
      re-create) — mirrors `apiSubscriber.ts` "always subscribe the full union" semantics.

Extend `tests/features/mesh/commands/deployMesh-*.test.ts` (new
`tests/features/mesh/commands/deployMesh-subscribe.test.ts`):

- [ ] `DeployMeshCommand.execute()` calls `ensureMeshApiSubscribed` (mocked) BEFORE
      `deployMeshComponent` (assert call ORDER), AFTER the auth preflight + permission gate pass.
- [ ] if the subscribe THROWS, the command surfaces a typed error + posts `sendMeshStatusUpdate('error',
      ...)` and does NOT call `deployMeshComponent` (fail-fast; no half-deploy).
- [ ] when the subscribe is skipped/short-circuits (no mesh catalog row), `deployMeshComponent` still
      runs (don't block deploy if there's nothing to subscribe).

Extend `tests/features/project-creation/services/meshSetupService.test.ts` (or create):

- [ ] create-time mesh deploy calls `ensureMeshApiSubscribed` before `deployMeshComponent` at the
      `:231` path (mirror the deployMesh ordering assertion).

## Files to create / modify

- CREATE `src/features/app-builder/services/ensureMeshApiSubscribed.ts` (the shared helper above).
- MODIFY `src/features/mesh/commands/deployMesh.ts` — call `ensureMeshApiSubscribed` after the
  permission gate (`:110`) / mesh-component resolution (`:120`), before `deployMeshComponent` (`:167`).
  Reuse `ServiceLocator.getAuthenticationService()` (already in scope at `:59`).
- MODIFY `src/features/project-creation/services/meshSetupService.ts` — call `ensureMeshApiSubscribed`
  before the `:231` deploy (and `:341` if that is a distinct user-initiated first deploy — verify during
  TDD; the second call site may be a retry of the same deploy).
- MODIFY `src/features/app-builder/services/deployableRunnerDeps.ts` — export `subscriberTarget` (if the
  helper reuses it) so the mapping isn't duplicated.

## RED → GREEN → REFACTOR

- RED: `ensureMeshApiSubscribed` absent; deployMesh/meshSetup ordering tests fail (subscribe never
  called today).
- GREEN: implement the helper + insert it at both first-deploy call sites under `withOrgContext`.
- REFACTOR: ensure no duplication of `subscriberTarget`/`deriveAllowedDomain`/catalog resolution; helper
  <50 lines; `/rptc:helper-sop-scan`.

## Risks

- **Breaking the auth/org guard order.** The subscribe must run AFTER the preflight + permission gate
  (it needs a valid org context + Developer role). Mitigation: insert point is explicitly after
  `:110`/`:120`; the ordering RED test pins it.
- **Surprise side effect on a passive path (PR #55 P1).** This is an ACTIVE deploy path (user clicked
  Deploy / is creating a project), NOT an on-open probe — so an `aio`/SDK write is appropriate here.
  Mitigation: the on-open `mesh-verify` check is untouched (it stays a passive read); this step adds
  writes ONLY inside user-initiated deploy commands. Note in the test that no on-open code path imports
  `ensureMeshApiSubscribed`.
- **Double-work vs `addDeployable`.** Calling the full runner would re-clone/install. Mitigation: bounded
  `subscribeRequiredApis` only (A-2); `addDeployable` is reserved for Track B.
- **Reset flows left unsubscribed.** Documented above (A-1); the redeploy targets an already-subscribed
  mesh. Mitigation: flagged for PM; trivially addable if a reset-on-fresh-workspace case is ever found.
- **Create-time second call site (`:341`).** Verify whether `:231` and `:341` are two deploys or a
  primary+retry; subscribe once (idempotent so a double call is safe, but avoid a redundant SDK round
  trip). Resolve during TDD.
