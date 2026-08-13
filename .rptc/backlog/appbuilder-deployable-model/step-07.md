# Step 07 — API subscriber (two-path by `platformList`, union reconcile)

**Purpose:** Build the unbuilt `subscribeCredentialToServices` equivalent — a reconciler that ensures a
deployable's `requiredApis` are subscribed on the one shared App Builder project. Branches by each
service's `platformList` (spike Q5, the DEFINITIVE/CORRECTION sections): apiKey/AdobeID services (incl.
**API Mesh `GraphQLServiceSDK`**) via `createAdobeIdCredential{platform:'apiKey',domain}` +
`subscribeAdobeIdIntegrationToServices`; OAuth-S2S services (e.g. `AdobeIOManagementAPISDK`) via the
existing `createOAuthServerToServerCredential` + `subscribeOAuthServerToServerIntegrationToServices`.
Subscribe the UNION of all deployables' `requiredApis` + baseline `AdobeIOManagementAPISDK`; idempotent.

**Prerequisites:** Step 03 (catalog supplies `requiredApis`). Pure-logic core is testable standalone.

**Reuse / surgical anchors (verified):**
- `src/features/authentication/services/adobeEntityFetcher.ts` — `createWorkspaceCredential`
  (`createOAuthServerToServerCredential`, line 484, handles 409-exists) + `getCredentials`
  (line ~405). REUSE; do not fork. Credential id field is **`id_integration`** (NOT `.id`).
- `src/features/authentication/services/adobeSDKClient.ts` — `sdk.init(token,'aio-cli-console-auth')`,
  `getClient()`, `isInitialized()`. `@adobe/aio-lib-console@5.4.2`.
- `getServicesForOrg`, `createAdobeIdCredential`, `subscribeAdobeIdIntegrationToServices`,
  `subscribeOAuthServerToServerIntegrationToServices` — all UNBUILT (confirmed: zero matches in src).
- Domain value: derive frontend `localhost:<port>` via
  `src/features/project-creation/helpers/setupInstructions.ts` (ALLOWED_DOMAINS logic). Mandatory for
  API Mesh (`domainMandatory:true`). NOT a setting (origin control lives in mesh.json CORS — findings).

## Tests to write FIRST (RED) — all with a MOCKED SDK client (no live cloud)

New file: `tests/features/authentication/services/apiSubscriber.test.ts`

- [ ] `resolveServiceInfos(requiredApis, servicesForOrg)` maps API names → `{sdkCode, platformList,
      licenseConfigs, domainMandatory}` via `getServicesForOrg`; unknown name → error/skip (assert).
- [ ] `partitionByPlatform(services)` splits into apiKey vs oauth_server_to_server by `platformList`;
      `GraphQLServiceSDK` lands in apiKey, `AdobeIOManagementAPISDK` in s2s.
- [ ] **union:** `computeRequiredApis(deployables)` returns the UNION of every deployable's
      `requiredApis` ∪ `{AdobeIOManagementAPISDK}` (baseline always present); dedupes.
- [ ] s2s path calls `subscribeOAuthServerToServerIntegrationToServices(orgId, id_integration,
      [{sdkCode, licenseConfigs:null, roles:null}])` with the **`id_integration`** field, not `.id`.
- [ ] apiKey path calls `createAdobeIdCredential(org,proj,ws,{name,description,platform:'apiKey',domain})`
      then `subscribeAdobeIdIntegrationToServices(org, id_integration, [{sdkCode:'GraphQLServiceSDK',...}])`.
- [ ] **domain mandatory:** when a service has `domainMandatory:true` and no domain is supplied →
      derive `localhost:<port>` from the frontend; assert the derived value is passed (NOT `example.com`).
- [ ] **idempotent reconcile:** calling twice with the same set does not throw and converges (mock 409 /
      already-subscribed → treated as success, mirroring `createWorkspaceCredential`'s 409 handling).
- [ ] mesh is NOT skipped — a mesh-only deployable set still subscribes `GraphQLServiceSDK` via apiKey
      (guards against the spike's earlier wrong "skip mesh" conclusion).

## Files to create / modify

- MODIFY `src/features/authentication/services/adobeEntityFetcher.ts` — add the new SDK wrappers next to
  the existing credential methods: `getServicesForOrg(orgId)`, `createAdobeIdCredential(...)`,
  `subscribeAdobeIdIntegrationToServices(...)`, `subscribeOAuthServerToServerIntegrationToServices(...)`.
  Keep each method small; reuse `ensureSDKReady`/`getClient` patterns already in the file.
- CREATE `src/features/app-builder/services/apiSubscriber.ts` — orchestration (pure where possible):
  `computeRequiredApis`, `resolveServiceInfos`, `partitionByPlatform`, `subscribeRequiredApis(deps,
  orgTarget, domain)`. The orchestrator calls the entity-fetcher wrappers; branch with explicit if/else
  (no nested ternary). serviceInfo shape for free services: `{sdkCode, licenseConfigs:null, roles:null}`.
- CREATE `src/features/app-builder/services/allowedDomain.ts` (or reuse setupInstructions helper) —
  `deriveAllowedDomain(project): string` → frontend `localhost:<port>` (default `localhost:3000`).

## RED → GREEN → REFACTOR

- RED: partition/union/branch tests fail (modules absent).
- GREEN: implement wrappers (mock-verified) + orchestrator.
- REFACTOR: keep orchestrator <50 lines; extract per-platform subscribe helpers; never log `apiKey`.

## Acceptance criteria

- Union of `requiredApis` + baseline subscribed via the correct credential type per `platformList`;
  domain derived for mandatory services; idempotent; suite GREEN (all mocked).

## Risks

- **Wrong credential type / missing domain** (the two ways the spike's first attempt 400'd). Mitigation:
  explicit platform-branch tests + domain-mandatory test encode the proven-correct calls.
- **Replace-vs-merge PUT semantics unknown.** Mitigation: the union design is correct EITHER way; add a
  `// D1 follow-up` note and a test asserting the reconcile result equals the full union (not a delta).
- **Live SDK fidelity:** unit tests mock the SDK. A single live smoke against a throwaway workspace is a
  GREEN-phase manual confirmation (spike already proved the exact calls 200) — not a CI test.
