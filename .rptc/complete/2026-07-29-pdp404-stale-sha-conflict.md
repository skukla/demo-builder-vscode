# Smart-404 install loses a SHA race with Inspector Tagging

> ## ✅ SHIPPED — archived 2026-08-13
>
> Fixed by **`3843b6be`**, the same commit that closed its sibling
> [`2026-07-29-code-patches-not-rehydrated-in-edit-mode.md`](2026-07-29-code-patches-not-rehydrated-in-edit-mode.md).
> Found still-open on 2026-08-13 during a validation pass.
>
> `writeDelayedJsWithStaleShaRetry()` in `pdp404HandlerPublisher.ts` implements the scope
> exactly as specified:
>
> - **Retryable only on SHA mismatch** — the predicate is `/does not match/i` against the
>   error message; the code comments that permission and missing-file failures "are certain,
>   and retrying them just doubles the latency of a known outcome."
> - **Exactly once** — re-reads, then re-derives content from the fresh read and commits with
>   the fresh SHA. Logs `'[PDP404] delayed.js changed under us (stale SHA) — re-reading and
>   retrying once'`.
> - **Still non-fatal**, per the constraint.
> - **Pinned by tests** — `tests/unit/features/eds/services/pdp404HandlerPublisher.install.test.ts`.
>
> Note for anyone tracing tests from this file: the EDS suites live under
> `tests/unit/features/eds/`, not `tests/features/eds/`. Both roots exist.

**Filed:** 2026-07-29
**Origin:** Live Extension Host run against `skukla/demo-builder-test`:

    13:10:13.051 [PDP404] GitHub commit failed: scripts/delayed.js does not match
                 15be5fb9e97773471ea4124c259d6d1e2eeb2626 - ... — skipping smart 404 install

**Severity:** High — silently disables smart-404 PDP handling. Non-fatal by design,
so setup still reports `Complete`.
**Present in:** `v1.0.0-beta.121` verbatim (`pdp404HandlerPublisher.ts:372`). Not a
regression from the beta.122 hotfix — that branch does not touch this file.

## Provenance

Same run, earlier:

    13:09:46.429 [Inspector Tagging] Appending loader snippet to delayed.js
    13:09:46.429 [Inspector Tagging] Generated 8 tree entries (5 SDK files)
    13:09:54.778 [Block Collection] Installed 9 blocks from 1 library
    13:10:13.051 [PDP404] GitHub commit failed: ... does not match 15be5fb9...

Two subsystems write `scripts/delayed.js` through **different GitHub APIs**:

- **Inspector Tagging** contributes tree entries, committed as part of the bulk
  **Git Tree** commit during block installation.
- **PDP404** reads via `getFileContent` (**Contents** API) and writes with the
  update-with-SHA contract (`pdp404HandlerPublisher.ts`, read ~line 343, write ~line 365).

`getFileContent` does no caching — verified, `githubFileOperations.ts` caches only the
Octokit instance. So the stale SHA came from GitHub: reads through the Contents API
can lag briefly behind commits made through the Git Data/Tree API, which is a
different serving path. Eighteen seconds was not enough here.

## Why it matters

Without the smart-404 snippet, `/products/{urlKey}/{sku}` has no client-side
recovery. Combined with
[2026-07-29-code-patches-not-rehydrated-in-edit-mode.md](2026-07-29-code-patches-not-rehydrated-in-edit-mode.md),
a storefront can finish setup with neither the SKU-encoding patches nor smart-404 —
no PDP support by either mechanism — and be reported as `Complete`.

## Goal / scope

On a SHA-mismatch commit failure, re-read the file and retry the write **once**.
That covers both Contents-API staleness and genuine interleaving, and is the same
shape as the existing retry-once-on-transient pattern in `resolveAppInstallation`.

Do not simply move the step: any ordering still races the Contents API, and other
callers write `delayed.js` too. Retry at the write is the fix that holds.

Second, smaller: the snippet is idempotent (`SMART_404_MARKER_START` check), so a
retry is safe — assert that in the test so a future edit can't break the assumption.

## Constraints

- Keep the step non-fatal. A storefront that fails smart-404 install should still
  complete; the goal is to stop it failing for a recoverable reason.
- Retry **once**, not a poll loop — this runs inside storefront setup and must not
  add minutes.
- Distinguish the SHA-mismatch failure (retryable) from other commit failures
  (permissions, missing file) which must still skip immediately.

## Verification

- Unit: a first write rejected for SHA mismatch triggers exactly one re-read +
  retry, and reports installed on the retry; a non-SHA failure does not retry.
- Live: run a storefront setup where block installation and PDP404 both touch
  `delayed.js`, and confirm the vendored-snippet success line rather than the skip.

## Kickoff prompt

> Read `.rptc/complete/2026-07-29-pdp404-stale-sha-conflict.md`. Make the smart-404
> install re-read and retry once on a SHA-mismatch commit failure, leaving other
> failures skipping as they do now. TDD.
