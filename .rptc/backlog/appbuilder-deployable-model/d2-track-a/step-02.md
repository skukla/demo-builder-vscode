# Step 02 — `ApiSubscriberClient` adapter over `AuthenticationService`

**Purpose:** Provide the `ctx.subscriberClient: ApiSubscriberClient` that `buildDefaultRunnerDeps`
requires (`deployableRunnerDeps.ts:39`). A ~30-line adapter (research Option 1) closes over the auth
service and forwards each of the 5 interface methods, reconciling two signature mismatches.

**Prerequisites:** Step 01 (the 5 auth-service passthroughs must exist).

## Surgical anchors (verified file:line)

- Interface to satisfy: `apiSubscriber.ts:51-66` (`ApiSubscriberClient`). Note two mismatches vs the
  fetcher/service:
  1. `ensureOAuthCredentialId(target: OrgTarget): Promise<string>` — single `OrgTarget` arg; the
     service method takes explicit `(orgId, projectId, workspaceId)`. Adapter unwraps
     `target.orgId/projectId/workspaceId`.
  2. `createAdobeIdCredential(...): Promise<string>` (NON-optional) — the fetcher/service returns
     `Promise<string | undefined>` (`adobeEntityFetcher.ts:624`). Adapter THROWS on `undefined` to
     honor the non-optional contract.
- `OrgTarget` type: `apiSubscriber.ts:40-45`.
- Service methods to forward to: the 5 added/existing on `AuthenticationService` (Step 01).
- Precedent for a thin service-backed adapter / DI factory: `deployableRunnerDeps.ts:82-106`
  (`buildDefaultRunnerDeps`) — same orchestration-seam style; the adapter slots into `ctx.subscriberClient`.

## Tests to write FIRST (RED)

Create `tests/features/app-builder/services/apiSubscriberClientAdapter.test.ts` (mock the
`AuthenticationService`; pure forwarding — no SDK, no live calls):

- [ ] `getServicesForOrg(orgId)` forwards to `service.getServicesForOrg(orgId)` and returns its value.
- [ ] `subscribeAdobeIdIntegrationToServices` / `subscribeOAuthServerToServerIntegrationToServices`
      forward args one-to-one.
- [ ] `ensureOAuthCredentialId({orgId,projectId,workspaceId})` calls
      `service.ensureOAuthCredentialId(orgId, projectId, workspaceId)` (OrgTarget UNWRAPPED) and returns
      the id.
- [ ] `createAdobeIdCredential(...)` returns the id when the service yields a string.
- [ ] `createAdobeIdCredential(...)` **throws** a clear error when the service returns `undefined`
      (non-optional contract).
- [ ] type-level: the adapter object satisfies `ApiSubscriberClient` (a `const c: ApiSubscriberClient =
      adapter` assignment compiles — caught by `tsc --noEmit`, but add a trivial runtime instantiation
      test so the file is exercised).

## Files to create / modify

- CREATE `src/features/app-builder/services/apiSubscriberClientAdapter.ts` (~30 lines):
  - `export function createApiSubscriberClient(service: AuthenticationService): ApiSubscriberClient`
    returning an object literal with the 5 methods. Forward 3 verbatim; unwrap `OrgTarget` for
    `ensureOAuthCredentialId`; throw on `undefined` for `createAdobeIdCredential`.
  - Import types only from `apiSubscriber` (`ApiSubscriberClient`, `OrgTarget`) and `authentication`
    service types — keep the runner boundary clean (this file lives in `app-builder/services/`
    alongside the other D1 runner pieces).
  - No new abstraction beyond this single adapter (Rule of Three: 1 use case → concrete object, no
    base class/factory hierarchy).

## RED → GREEN → REFACTOR

- RED: adapter file/function absent; forwarding + throw-on-undefined tests fail.
- GREEN: implement `createApiSubscriberClient`.
- REFACTOR: confirm function <50 lines; no unused imports; `/rptc:helper-sop-scan`.

## Risks

- **Signature drift between interface and service.** Mitigation: the type-satisfaction test +
  `tsc --noEmit` catch any divergence; the unwrap/throw RED tests pin the two known mismatches.
- **Over-engineering.** A class or DI container here would violate KISS/YAGNI. Mitigation: ship a plain
  closure returning an object literal — the simplest thing that satisfies the interface.
