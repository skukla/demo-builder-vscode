# Token validation timeout (TIMEOUTS.QUICK = 5s) too tight for slow networks

**Filed:** 2026-06-10
**Origin:** Same field issue as the aio-cli prereq depth bug. Colleague's `Demo Builder: Debug Logs.log` shows the token-validation command (`aio config get ims.contexts.cli.access_token --json`) timing out repeatedly at the 5-second wall, retrying 3x with exponential backoff, then failing the auth flow and forcing re-login. Her successful logins took 25.7s, 42.7s, 40.6s, 59.7s — a slow-network signature that a 5-second token-read can't survive.
**Status:** Ready — one-line constant change + matching test deltas; pick up any time.

## Provenance

`src/features/authentication/services/tokenManager.ts:81-85` validates the cached Adobe IMS token by reading the CLI config:

```ts
const cmdResult = await this.commandManager.execute(
    'aio config get ims.contexts.cli.access_token --json',
    { encoding: 'utf8', timeout: TIMEOUTS.QUICK },
);
```

`TIMEOUTS.QUICK = 5000` in `src/core/utils/timeoutConfig.ts`. The retry loop above tries 3 times with 500ms / 1000ms / 2000ms backoff, then surrenders with `Token] Failed after 3 attempts: Operation took too long`.

The failure pattern in her debug log:

```
[WARN] [Command Executor] Command timed out after 5000ms
[WARN] [Token] Timeout on attempt 1/3, retrying in 500ms...
[WARN] [Command Executor] Command timed out after 5000ms
[WARN] [Token] Timeout on attempt 2/3, retrying in 1000ms...
[WARN] [Command Executor] Command timed out after 5000ms
[WARN] [Token] Failed after 3 attempts: Operation took too long. Please try again.
[WARN] [Auth] Token expired or invalid, user must re-authenticate
```

This fires five times across her session, each time forcing a 25-60 second re-login that then succeeds — only for the next token validation to time out again. Loop. The token never gets persisted to a usable state because something between aio CLI and its config-load is taking longer than 5 seconds on her connection, but the binary IS responsive eventually (her later forced logins all complete, just slowly).

Precedent for the right move: `CONFIG_WRITE` was bumped from 5000ms → 10000ms in v1.5.0 for exactly this kind of slow-network case. Per `docs/patterns/state-management.md`:

> Increased CONFIG_WRITE timeout from 5000ms to 10000ms — Adobe CLI commands now succeed reliably despite Adobe CLI slowness

`TIMEOUTS.QUICK`'s 5-second budget covers all "fast checks, config reads, shell commands" per the doc-comment in `timeoutConfig.ts:29`. The token-validation read is one of those — but the field evidence is that Adobe CLI's config reads aren't reliably "fast" on every user's network, the same lesson the v1.5.0 `CONFIG_WRITE` bump already learned.

## Goal / scope

Bump the token-validation read's timeout from `TIMEOUTS.QUICK` (5s) to `TIMEOUTS.CONFIG_WRITE` (10s) — the same constant the write path already uses post-v1.5.0. This matches an already-vetted precedent without inventing a new constant, and the 3-attempt retry loop with exponential backoff still bounds the worst-case wall-clock time at ~13.5s (10s + 0.5 + 10s + 1.0 + 10s + 2.0).

Three options of where to make the change, in increasing scope:

1. **One-line literal at the call site** (`tokenManager.ts:84`) — switch `TIMEOUTS.QUICK` to `TIMEOUTS.CONFIG_WRITE`. Smallest possible diff.
2. **Add a new `TIMEOUTS.TOKEN_VALIDATION` = 10000** in `timeoutConfig.ts` — name it semantically, use it here. Slightly more code, slightly more discoverable.
3. **Rename `TIMEOUTS.QUICK` to reflect its semantic role and pick a new value for token-validation alone** — biggest scope, probably over-engineering.

Recommend option 2: a dedicated `TIMEOUTS.TOKEN_VALIDATION` named-constant. Same semantic clarity `CONFIG_WRITE` provided in v1.5.0; future readers don't have to ask why the token-read uses the write timeout.

## Execution plan

1. Add `TOKEN_VALIDATION: 10000` to `src/core/utils/timeoutConfig.ts`, in the same block as `CONFIG_WRITE`.
2. Switch the call site at `src/features/authentication/services/tokenManager.ts:84` from `TIMEOUTS.QUICK` to `TIMEOUTS.TOKEN_VALIDATION`.
3. Update or add a test in `tests/features/authentication/services/tokenManager.test.ts` that asserts the timeout being passed to `commandManager.execute()` is 10000ms, not 5000ms. The existing tokenManager tests probably stub the command executor — just thread the new value through.
4. Verify no other site is reading `TIMEOUTS.QUICK` for token-related reads. `grep -rn "TIMEOUTS.QUICK" src/features/authentication/` — if any do, individually evaluate whether the same logic applies (probably yes; the entire IMS read surface has the same slow-network risk).

## Constraints

- Don't lift `TIMEOUTS.QUICK` itself — it's used elsewhere for legitimately fast operations (the comment in `timeoutConfig.ts:29` describes "Fast checks, config reads, shell commands"). Token validation is a config read on the slow path; other config reads in the codebase aren't. Leave the general-purpose constant at 5s, add a dedicated one for this specific path.
- The retry loop should NOT be touched. 3 attempts with exponential backoff is the right shape — only the per-attempt timeout is too tight. Resist the urge to refactor the retry strategy.
- Keep the worst-case bounded. With the new 10s timeout: 10 + 0.5 + 10 + 1.0 + 10 + 2.0 = 33.5s worst case for the full retry chain. Acceptable for an authentication flow that already has long browser-round-trips.

## Kickoff prompt

```
Bump the Adobe token-validation timeout from 5s to 10s (see
.rptc/backlog/2026-06-10-token-validation-timeout-too-tight.md).

Add `TOKEN_VALIDATION: 10000` to `src/core/utils/timeoutConfig.ts` alongside
the existing `CONFIG_WRITE: 10000` entry (matches the v1.5.0 pattern for
slow-network handling). Switch the `aio config get ims.contexts.cli.access_token
--json` call at `src/features/authentication/services/tokenManager.ts:84` from
`TIMEOUTS.QUICK` to `TIMEOUTS.TOKEN_VALIDATION`. Update the existing tokenManager
tests so the assertion on the timeout argument expects 10000ms.

Don't touch the retry loop — it's the right shape; only the per-attempt
timeout is too tight. Don't lift `TIMEOUTS.QUICK` itself — it's used
elsewhere for genuinely fast checks. Single commit, ~10 minutes.
```
