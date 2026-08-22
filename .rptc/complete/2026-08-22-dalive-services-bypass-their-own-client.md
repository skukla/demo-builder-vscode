# DA.live services bypass their own HTTP client

**Filed:** 2026-08-22
**Origin:** The spine sweep (call-path-audit, DA.live row). Sibling of
`2026-08-22-helix-publish-has-two-engines.md` — same disease, milder form.
**SHIPPED 2026-08-22, same day filed.** Client extended first (RED tests):
`fetchWithRetry` accepts a per-attempt request FACTORY (one-shot FormData
bodies) and a `rateLimit: 'return'` mode (page-level 429 tolerance). Then
migrated: contentCopy's three DA.live writes (its compound retry loop now
retries only the CDN source read; dest retries live in the client — pinned by
the new `daLiveContentCopy-retry.test.ts`, including fresh-FormData-per-
attempt and skip-page-on-429), configService's five calls (internal client),
sourceOperations (3), configOperations (2, factory), blockLibraryOperations
(1), and orgOperations — whose PRIVATE byte-near copy of the whole retry loop
is deleted (it keeps only its own 401-throw policy). Documented exceptions
stay raw on purpose: CDN reads/probes, the VERY_LONG whole-site bulk copy,
the module-level write-access probe. Two test suites needed the §8 mock
audit (stale global-fetch setups → client mock / faithful fake). All 177
affected suites green.

## The claim (verified 2026-08-22)

`daLiveApiClient` documents itself as "the leaf layer every DA.live operations
service builds on: IMS token access, fetch-with-retry (429/5xx backoff +
timeout), and HTTP→domain error mapping." In practice the services take the
client but use it **only for tokens**: `daLiveContentCopy` alone carries 9 raw
`fetch(` calls with its own hand-rolled retry loop
(`for attempt <= MAX_RETRY_ATTEMPTS`, `daLiveContentCopy.ts:343`), and
`daLiveConfigService` (5), `daLiveSourceOperations` (3), `daLiveOrgOperations`
(2), `daLiveConfigOperations` (2) and others also fetch directly. The client's
retry/error-mapping exists precisely so this would not be re-implemented
per-service.

Fixed in the same audit: four local copies of the `admin.da.live` host constant
folded into `daLiveConstants.DA_LIVE_BASE_URL` (now pinned to one definition by
`spine-chokepoints.test.ts`).

## The fix

Migrate the services' raw `fetch` calls onto `daLiveApiClient.fetchWithRetry`
(extending the client where a call needs FormData bodies or per-call retry
semantics it doesn't yet expose), then delete the per-service retry loops and
`MAX_RETRY_ATTEMPTS` re-implementations. One service per slice —
`daLiveContentCopy` first (largest, and its retry loop is the most complete
duplicate).

**Proof caveat (measured 2026-08-22):** `daLiveContentCopy.ts` has NO
dedicated suite — it was extracted from `DaLiveContentOperations` and its
coverage rides the old names: `daLiveContentOperations-transform/-enumeration/
-referenceDiscovery/-applySiteConfig/-library-creation.test.ts`, plus
`edsPipeline-operations.test.ts` and `contentCompleteness.smoke.test.ts`.
Before migrating its retry loop, check those suites actually exercise the
retry path; if not, write the retry regression test FIRST (test-first on the
exact behaviour being preserved), then migrate. `daLiveConfigService` has
`daLiveConfigService-queries/-mutations.test.ts`.

**Constraint:** `daLiveApiClient` must stay vscode-free — the MCP server
constructs it in a separate Node process.

## Contained meanwhile

The host constant is pinned to one definition, and the client remains the only
token source — the duplication is in transport concerns (retry/timeout/error
mapping), which drift silently but are also exercised constantly, so breakage
surfaces fast. Lower urgency than the Helix item, where whole verbs fork.

## Kickoff prompt

> Migrate one DA.live service off raw fetch per
> `.rptc/backlog/2026-08-22-dalive-services-bypass-their-own-client.md`
> (start: `daLiveContentCopy`). Read the Proof caveat first — the retry
> behaviour may need a regression test written BEFORE the migration. Extend
> `daLiveApiClient.fetchWithRetry` as needed (FormData bodies); keep the
> client vscode-free. Delete that service's retry loop when its calls are
> migrated. Proof suites per the caveat section. Full `gate`; one service
> per slice, own commit.
