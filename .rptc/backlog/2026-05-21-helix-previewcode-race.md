# Helix `previewCode` Race — "Failed to preview code: 400 Bad Request"

## Provenance

Surfaced during AI Layer Pivot Cycle D end-to-end validation (2026-05-21) while running through the manual test plan at [`docs/testing/2026-05-21-ai-layer-pivot-cycles-a-d.md`](../testing/2026-05-21-ai-layer-pivot-cycles-a-d.md). Pre-existing behavior — NOT introduced by Cycles A–D — but worth fixing.

Example log lines from a clean project creation (`citisignal-b2b`, 2026-05-21):

```
13:57:54.329 [info]    [Storefront Setup] Code sync verified
13:57:54.598 [warning] [Storefront Setup] Code preview warning: Failed to preview code: 400 Bad Request
...
14:10:12.556 [info]    [ConfigSync] config.json pushed to GitHub (skukla/citisignal-b2b)
14:10:12.875 [warning] [ConfigSync] Failed to publish config.json to CDN: Failed to preview code: 400 Bad Request
```

## Goal / Scope

Eliminate the spurious 400 warnings emitted by `HelixService.previewCode` immediately after a `git push`. CDN content propagates correctly via the bulk publish that runs later, so this is cosmetic + log-noise, not a functional bug — but it confuses anyone reading the Logs channel during validation and undermines the "non-technical UX" goal.

**In scope:**

- `src/features/eds/services/helixService.ts::previewCode` — single retry-with-backoff on `400` responses
- Call sites that fire `previewCode` immediately after a GitHub push:
  - `src/features/eds/handlers/storefrontSetupPhase3.ts:44` — previews `/*` (whole tree) after `fstab.yaml` push
  - `src/features/eds/services/configSyncService.ts:155` — previews `/config.json` after the GitHub push at line ~140
  - `src/features/eds/services/edsResetService.ts:81,124` — also calls `previewCode` after a push
- Tests covering the retry path (timeout, success-on-retry, exhausted-retries)

**Out of scope:**

- Changing the Helix Admin API contract
- Restructuring the post-push pipeline
- Anything in the AI Layer Pivot surface

## Root Cause

`POST /code/<org>/<site>/<branch><path>` on Helix Admin asks the API to fetch the latest commit from GitHub and stage it for preview. When the call lands before Helix's code mirror has noticed the new commit, Admin returns **400 Bad Request** — "I don't have that commit indexed yet." The 319 ms gap at 14:10:12 in the log sample above is well under Helix's typical indexing latency.

Catch blocks at both call sites already swallow the error (`configSyncService.ts:178` — "CDN publish failure is not fatal"). Nothing breaks; the warning is the only visible symptom.

## Execution Plan

Single batch — small, focused, no architectural changes.

### Step 1: Retry-with-backoff in `previewCode`

In `helixService.ts:1514` add a small retry loop around the `fetch` call:

- Up to **3 attempts** on `status === 400` only (other status codes preserve current throwing behavior)
- **Linear-ish backoff**: 1s, 3s, 7s (Helix's mirror typically catches up in <10s)
- Existing `AbortSignal.timeout(TIMEOUTS.LONG)` stays; each attempt gets its own signal
- Log each retry at DEBUG level: `[Helix] previewCode 400 on attempt N — Helix mirror not caught up, retrying in Ms`
- Final failure after retries: log the original warning + throw the existing `Error("Failed to preview code: ...")`

Keep the helper inside `helixService.ts` — no new file, no new abstraction. Only `previewCode` retries; other helix methods are unaffected.

### Step 2: Tests

Extend `tests/features/eds/services/helixService.test.ts` (or create if absent):

- 400 then 200 → resolves on 2nd attempt
- 400 × 3 → throws after exhaustion
- 401 / 403 / 500 → no retry; current error semantics preserved
- Verifies the backoff sequence via fake timers
- Verifies abort signal is fresh per attempt

### Step 3: Verify call sites unchanged

`storefrontSetupPhase3.ts`, `configSyncService.ts`, and `edsResetService.ts` should NOT need edits — they already catch errors as warnings. The retry just reduces how often that catch fires.

## Constraints

- **No new abstractions.** Retry lives inline in `previewCode`; don't extract a generic retry helper unless 3+ Helix methods need the same pattern.
- **No timeout-budget change.** Existing `TIMEOUTS.LONG` applies per attempt — total worst-case wall-clock = 3 × LONG (still bounded).
- **Preserve error semantics on non-400.** Only 400 triggers the retry; 401/403/etc. still throw immediately so genuine auth/permission failures aren't masked.
- **No CHANGELOG entry for the retry itself** — it's an invisible bug fix. Mention in commit message only.

## Risk

Low. Worst case the retry adds ~11 seconds (1 + 3 + 7) to a push pipeline that's already taking minutes. Existing catch blocks remain as a safety net if all attempts fail.

## Kickoff prompt

```
/rptc:feat "Fix Helix previewCode 400 race in src/features/eds/services/helixService.ts.
Plan at .rptc/backlog/2026-05-21-helix-previewcode-race.md. Single batch:
add retry-with-backoff on 400 only (3 attempts, 1s/3s/7s), keep error
semantics for non-400 status codes, add tests for the retry path."
```

## When to pick this up

Any time. Self-contained, doesn't depend on the structural baseline or the soft-deprecation cleanup. Small enough to fit between larger cycles.
