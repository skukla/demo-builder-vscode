# Helix publish has two engines

**Filed:** 2026-08-22
**Origin:** The spine sweep (call-path-audit, Helix row) — the campaign's
biggest find.

## The claim (verified, both files read 2026-08-22)

Two complete, independent implementations of the Helix Admin publish verbs:

| | `helixService.ts` (~1800 lines, extension class) | `helixApiClient.ts` (vscode-free module) |
|---|---|---|
| Verbs | previewPage, publishPage, unpublishPage(s), previewAndPublishPage, previewAllContent, publishAllContent, publishAllSiteContent (+bulk/page-by-page variants) | previewPage, publishPage, previewAndPublishPage, unpublishPage |
| URL building | own (`helixService.ts:692/745/1188/1294/1785`) | own (`helixApiClient.ts:111/123`) |
| Extras | token discovery, DELETE-auth trick (ADR-002: DA.live IMS Bearer), retries, bulk orchestration, progress | none — tokens passed in by callers |
| Consumers | the EDS pipeline, reset, republish, cleanup | `mcp-server.ts`, `storefrontSyncService` |

The service NEVER imports the client. The client's header comment claimed the
extension drove Helix "via helixService" through it — false the day it was
written; corrected in the same slice this was filed (a comment describing
another module is a claim, and this one suppressed the question).

**Why it matters:** a fix to one engine's request shape, headers, or error
handling does not reach the other. The DELETE-auth rule (only the DA.live
IMS Bearer passes `DELETE /live` — memory + ADR-002) was checked in BOTH
engines during the audit: no divergence today, but the client keeps parity
via a comment saying it "Matches helixService.getDeleteAuthHeaders exactly" —
a cross-module claim held true only by hand. That manual mirror is the
mechanism this duplication rots through; delegation replaces it with code.

## The fix

The client is the correct primitive owner (vscode-free, token-agnostic —
the same shape `deployMeshComponent` has). Consolidate by delegation:

1. `helixService`'s per-page verbs call the client's functions; the service
   keeps token discovery, the DELETE-auth header assembly (passed INTO the
   client), retry policy, and bulk orchestration.
2. Extend the client with whatever per-request surface the service needs
   (method, headers) rather than duplicating URL builders.
3. The seven per-file `admin.hlx.page` host constants collapse to one
   exported from the client while touching these files.
4. Proof: the existing helixService + storefrontSync + mcp-server suites run
   unchanged (behaviour-preserving refactor).

## Contained meanwhile

`tests/templates/spine-chokepoints.test.ts` ("helix PUBLISH verbs") pins the
verb-URL builders to exactly these two files — the duplication cannot grow a
third engine while it waits. When consolidation lands, UPDATE that pin's
spine list to the client alone — that is the completion signal.

## Constraints a cold session must not rediscover the hard way

- `helixApiClient` must STAY vscode-free — `mcp-server.ts` (a separate Node
  process) imports it directly.
- The service's token discovery (`getDaLiveToken`, GitHubTokenService) stays
  service-side; tokens are PASSED INTO the client (its existing contract).
- The DELETE-auth rule (ADR-002: DA.live IMS Bearer ALONE for `DELETE
  /live`; publish token withheld) is currently duplicated —
  `helixService.getDeleteAuthHeaders` and the client's `buildDeleteHeaders`.
  After delegation the client's version is the only one; delete the
  service's and its "matches exactly" mirror comment.
- Service-only machinery with no client counterpart (bulk preview/publish,
  page-by-page fallback, rate limiting, API-key management) is NOT being
  moved — only the per-page verb URL/request construction delegates.

## Proof suites (verified to exist 2026-08-22)

`tests/features/eds/services/helixApiClient.test.ts`,
`helixService-preview-publish.test.ts`, `helixService-rate-limiting.test.ts`,
`helixService-credentialRefused.test.ts`, `helixService-auth-keys.test.ts`,
`storefrontSyncService.test.ts`, plus the mcpServer suites. Audit their mocks
when the delegation lands.

## Kickoff prompt

> Consolidate the two Helix publish engines per
> `.rptc/backlog/2026-08-22-helix-publish-has-two-engines.md`. Read the
> Constraints section first. Order: extend `helixApiClient` with the
> per-request surface the service needs → delegate `helixService`'s per-page
> verbs (preview/publish/unpublish/previewAndPublish) → delete the service's
> URL builders and its duplicated delete-header helper → collapse the seven
> `admin.hlx.page` host constants to one exported from the client → update
> the spine-chokepoints "helix PUBLISH verbs" pin to the client alone.
> Proof: the suites named above run unchanged. Full `gate`; one slice per
> step is fine, own commits.
