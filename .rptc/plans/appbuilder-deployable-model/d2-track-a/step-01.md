# Step 01 — `ensureOAuthCredentialId` on `AdobeEntityFetcher` + 5 auth-service passthroughs

**Purpose:** Fill the one MISSING `ApiSubscriberClient` method (`apiSubscriber.ts:54`) and expose all five
subscriber methods through the existing public seam (`AuthenticationService`) so the Step 02 adapter has
something to forward to. This is the load-bearing prerequisite for every later step.

**Prerequisites:** Step 00.

## Surgical anchors (verified file:line)

- `src/features/authentication/services/adobeEntityFetcher.ts`
  - `getWorkspaceCredential()` (`:441-512`) — wraps `getCredentials`; **reads org/proj/ws from
    `cacheManager`** (NOT args). Pattern to mirror for the read, but with EXPLICIT args.
  - `createWorkspaceCredential()` (`:520-598`) — wraps `createOAuthServerToServerCredential`; create
    response typed `{ id: string; apiKey: string; orgId: string }` (`:559`); 409→re-fetch idempotency
    (`:586-593`). Pattern to mirror for the create, with EXPLICIT args.
  - `getServicesForOrg` / `createAdobeIdCredential` / `subscribeAdobeIdIntegrationToServices` /
    `subscribeOAuthServerToServerIntegrationToServices` (`:605-671`) — the 4 EXISTING subscriber methods
    (already explicit-arg; D1 step 07). **Do not touch.**
- `src/features/authentication/services/types.ts`
  - `RawWorkspaceCredential` (`:90-101`) — has `id_integration?` (`:98`) + `integration_type?` (`:96`).
  - `OrgServiceInfo` (`:121-125`), `AdobeIdCredentialInput` (`:128-133`), `ServiceSubscriptionInfo`
    (`:136-140`).
- `src/features/authentication/services/authenticationService.ts`
  - `ensureEntities()` → `{ fetcher }` seam (`:381,395,405,416`); `getWorkspaceCredential` /
    `createWorkspaceCredential` passthroughs (`:415-427`) — the EXACT passthrough shape to copy.
- Interface contract: `apiSubscriber.ts:51-66` — note `ensureOAuthCredentialId(target: OrgTarget):
  Promise<string>` (single `OrgTarget` arg, non-optional return). The fetcher method takes **explicit
  3 args** per the task; the OrgTarget→args bridge is the Step 02 adapter's job, NOT this method's.

## Tests to write FIRST (RED)

Extend `tests/features/authentication/services/adobeEntityFetcher-apiServices.test.ts` (mirror its
existing SDK-mock harness: `sdk = { ... }`, `getClient` returns `sdk`, no live Adobe calls):

- [ ] **list-first hit:** when `getCredentials(orgId,projId,wsId)` returns a credential with
      `integration_type:'oauth_server_to_server'` and `id_integration:'cred-123'`,
      `ensureOAuthCredentialId('o','p','w')` returns `'cred-123'` and **does NOT** call
      `createOAuthServerToServerCredential`.
- [ ] **create fallback:** when `getCredentials` returns `[]` (or no S2S cred with an `id_integration`),
      it calls `createOAuthServerToServerCredential('o','p','w', NAME, DESC)` and returns the create
      response `body.id` (assert the field path is `.body.id`, per research A.3 open-verification).
- [ ] **explicit args, not cache:** the SDK `getCredentials`/`createOAuthServerToServerCredential` are
      called with the args PASSED IN, never with `cacheManager` values (pass a fetcher whose cacheManager
      would return different ids; assert the passed args win). This guards the research's "arg-shape
      mismatch" risk.
- [ ] **ignores non-S2S creds:** a credential with `integration_type:'apikey'` (even with an
      `id_integration`) is skipped; falls through to create.
- [ ] **edge — SDK not ready / missing args:** rejects (or throws a typed error) rather than returning a
      bogus id (decide: throw, since the interface return is non-optional `Promise<string>`).

Extend the auth-service passthrough tests (new file
`tests/features/authentication/services/authenticationService-subscriber.test.ts`, or extend
`authenticationService-entities.test.ts`):

- [ ] each of the 5 methods (`getServicesForOrg`, `createAdobeIdCredential`,
      `subscribeAdobeIdIntegrationToServices`, `subscribeOAuthServerToServerIntegrationToServices`,
      `ensureOAuthCredentialId`) calls `ensureEntities()` then forwards to the same-named `fetcher` method
      with identical args and returns its value (mock the fetcher; assert one-to-one forwarding).

## Files to create / modify

- MODIFY `src/features/authentication/services/adobeEntityFetcher.ts` — add
  `async ensureOAuthCredentialId(orgId, projectId, workspaceId): Promise<string>`:
  1. `ensureSDKReady()`; guard `isInitialized()` + non-empty args (throw on missing).
  2. `getCredentials(orgId, projectId, workspaceId)` → find `c.integration_type ===
     'oauth_server_to_server' && c.id_integration`; return it if found.
  3. else `createOAuthServerToServerCredential(orgId, projectId, workspaceId, NAME, DESC)` → return
     `body.id`; throw if absent.
  - Use module-level `const` for NAME/DESC (no magic strings inline). Reuse the existing
    `getClient() as { ... }` typing style (`:469-472`, `:555-560`). Function <50 lines; no nested
    ternaries; early-return guards (SOP §4) like `getWorkspaceServices`.
- MODIFY `src/features/authentication/services/authenticationService.ts` — add 5 thin passthroughs
  (copy the `getWorkspaceCredential`/`createWorkspaceCredential` shape at `:415-427`); each
  `const { fetcher } = await this.ensureEntities(); return fetcher.<method>(...)`.

## RED → GREEN → REFACTOR

- RED: `ensureOAuthCredentialId` doesn't exist; passthrough tests fail (methods absent on the service).
- GREEN: implement the method + 5 passthroughs.
- REFACTOR: dedupe the cred-finding predicate if it mirrors `getWorkspaceCredential`'s S2S filter
  (`:491-493`) — extract a small `findOAuthS2SCredential` helper only if it removes real duplication
  (Rule of Three; otherwise leave inline). Run `/rptc:helper-sop-scan`.

## Risks

- **`createOAuthServerToServerCredential().body.id` ≠ `id_integration`** (research A.3, flagged LOW).
  Mitigation: the RED "create fallback" test asserts the exact field path; if it diverges live, the
  contingency is a `getCredentials` re-read after create (the same list-first logic, run post-create) —
  add only if a live spike disproves `.body.id`.
- **Arg-vs-cache regression.** The existing `getWorkspaceCredential`/`createWorkspaceCredential` stay
  cache-bound; this new method must NOT reuse them (they'd reintroduce the cache dependency). Mitigation:
  call the SDK client directly with explicit args (the "explicit args, not cache" RED test enforces it).
- **Non-optional return.** Interface is `Promise<string>`; never return `undefined`. Mitigation: throw a
  typed error on missing SDK/args/id (the edge RED test enforces it).
