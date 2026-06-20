# Step 1 — Orchestrator core + types + registry (no behavior change)

**Goal:** the coordination skeleton, fully tested, with NO checks registered yet — so it's a pure,
risk-free foundation that doesn't touch on-open behavior.

## Files

- New `src/features/dashboard/services/onOpenChecks/types.ts` — `CheckStatus`, `CheckOutcome`,
  `OnOpenCheck`, `OnOpenCheckContext`.
- New `src/features/dashboard/services/onOpenChecks/orchestrator.ts` — `runOnOpenChecks`.
- New `src/features/dashboard/services/onOpenChecks/index.ts` — barrel.
- Edit `src/types/messages.ts` — add `checkResult` MessageType + `CHECK_IDS` const
  (`org-context`, `mesh-verify`, `mcp-health`, `ai-verify`).
- Tests: `tests/features/dashboard/services/onOpenChecks/orchestrator.test.ts`.

## API

```ts
type CheckStatus = 'pending' | 'ok' | 'warning' | 'error' | 'unknown';
interface CheckOutcome<T = unknown> { checkId: string; status: CheckStatus; message?: string; data?: T; }
interface OnOpenCheckContext { project: Project; logger: Logger; post(outcome: CheckOutcome): void; }
interface OnOpenCheck { id: string; mode: 'background'; edsOnly?: boolean; run(ctx): Promise<CheckOutcome>; }

export async function runOnOpenChecks(
  ctx: { project: Project; logger: Logger; postMessage(type: string, payload: unknown): void; isEds: boolean },
  checks: OnOpenCheck[],
): Promise<void>;
```

## Behavior

- For each check: if `edsOnly && !ctx.isEds` → skip. Else run it via a **non-throwing wrapper**:
  - optionally post `{checkId, status:'pending'}` first (checks opt in);
  - `await check.run(...)` → post the returned outcome on `checkResult`;
  - **on throw → post `{checkId, status:'error', message: err.message}`** and log a warning (P2 — never
    rethrow, never an unhandled rejection).
- All checks run concurrently (`Promise.allSettled` over the wrappers); `runOnOpenChecks` resolves when
  all settle but callers invoke it fire-and-forget (`void`).
- Re-entrancy: a per-(project.path, checkId) guard so a re-`requestStatus` doesn't double-run a check
  within the session. (Module-level Set; reset semantics = per extension session.)
- Every posted message goes through `postMessage('checkResult', outcome)` — one channel.

## Tests (write FIRST)

- runs a registered check and posts its outcome on `checkResult`.
- `edsOnly` check skipped when `isEds` false (no post, no run).
- a check that throws → posts `{status:'error', message}` (no rejection escapes); other checks still run.
- pending-opt-in check posts `{status:'pending'}` then the resolved outcome.
- re-entrancy: two `runOnOpenChecks` for the same project → each check runs at most once.
- concurrency: multiple checks all post (order-independent assertions).

## Constraints

- No vscode import in the orchestrator core (inject `postMessage`/`logger`) → unit-testable + reusable.
- Register ZERO checks in this step — behavior is unchanged until Step 2 wires the first one.
- Align `CHECK_IDS` + `checkResult` with the existing `MessageType` style in `messages.ts`.
