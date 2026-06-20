# Plan: Unified dashboard on-open orchestrator — overview

**Status:** Plan drafted 2026-06-20, TDD-ready. PM chose the full coherence play (2026-06-20).
**Research:** [`../../research/dashboard-open-lifecycle/audit.md`](../../research/dashboard-open-lifecycle/audit.md)
**Absorbs:** [`mcp-open-time-self-heal`](../mcp-open-time-self-heal/overview.md) (becomes Step 3 here) and
the surprise-browser fix ([`../../backlog/2026-06-20-dashboard-org-check-surprise-browser.md`](../../backlog/2026-06-20-dashboard-org-check-surprise-browser.md), becomes Step 2).

## Goal

Replace the four uncoordinated on-open async chains (org-context, mesh-verify, AI-verify, +
self-heal) with one **on-open check orchestrator** + a **typed message registry**, so every automatic
check obeys two principles:

- **P1 — No surprise side effects on open.** A check uses quick, **non-interactive** probes; never
  launches a browser or does heavy mutation; degrades to `unknown` ("click to check"), never prompts.
- **P2 — No silent failures on open.** Every check ALWAYS posts a typed outcome — including on failure
  — through one channel; nothing vanishes into logs.

## Why incremental (value-first)

The migration order is chosen so the **two known bugs are fixed in the first two steps**, before the
full refactor completes:
- Step 2 migrates the org check → that migration *is* the P1 surprise-browser fix.
- Step 3 adds MCP self-heal as a check → that *is* the P2 silent-failure fix.
Steps 4–6 migrate the remaining chains + unify the webview side. Each step is independently shippable
and test-gated; the orchestrator can run alongside un-migrated chains during the transition.

## The model

**One unified outcome shape** (`src/features/dashboard/services/onOpenChecks/types.ts`):
```ts
type CheckStatus = 'pending' | 'ok' | 'warning' | 'error' | 'unknown';
interface CheckOutcome<T = unknown> {
  checkId: string;        // registry key
  status: CheckStatus;
  message?: string;       // user-facing; REQUIRED on warning|error|unknown (P2)
  data?: T;               // check-specific (orgMismatch, mesh endpoint, drift list, …)
}
interface OnOpenCheck {
  id: string;
  mode: 'background';     // post-open async (the initial synchronous statusUpdate payload stays as-is)
  edsOnly?: boolean;
  run(ctx: OnOpenCheckContext): Promise<CheckOutcome>;  // contract: non-interactive (P1)
}
```

**The orchestrator** (`runOnOpenChecks(ctx, checks)`): for each registered check, gate on `edsOnly`,
optionally post `{status:'pending'}`, then run it wrapped so that **a throw becomes a posted
`{status:'error', message}` (P2)** — never an unhandled rejection. Every check's outcome is posted on a
**single `checkResult` message** keyed by `checkId`. Called once from `handleRequestStatus` after the
status payload (replacing the hard-coded `void runOrgContextCheck` + `verifyMeshDeployment().catch()`).

**The registry** (extend `src/types/messages.ts`): the `checkResult` MessageType + a `CHECK_IDS` const
(`org-context`, `mesh-verify`, `mcp-health`, `ai-verify`). One typed place; no more ad-hoc strings.

**The webview** (Step 6): one `onMessage('checkResult')` router that switches on `checkId` and feeds
the existing UI surfaces (org banner/badge, mesh badge, AI badge, self-heal progress) — replacing the
four separate `onMessage('orgContextResult'|'meshStatusUpdate'|…)` listeners.

## Steps

- **[Step 1](step-01.md)** — Orchestrator core + types + registry. `runOnOpenChecks`, `CheckOutcome`,
  the non-throwing wrapper (P2), `checkResult` message type + `CHECK_IDS`. No behavior change yet
  (no checks registered). Pure, fully unit-tested.
- **[Step 2](step-02.md)** — ✅ DONE (2026-06-20). Migrate **org-context** as the first check + make
  it **P1-compliant** (quick non-interactive auth/org probe; `unknown` instead of launching a browser
  / CLI interactive path). **= the surprise-browser fix.** Shipped in two commits: **2a** standardized
  per-status CTAs via `StatusCard.action`; **2b** added SDK-only `getOrganizationsSdkOnly()`, the
  `orgContextCheck` OnOpenCheck (+ `reRunnable` guard opt-out), wired `handleRequestStatus` →
  `runOnOpenChecks`, routed `checkResult{org-context}` in the hook, and removed the old
  `runOrgContextCheck` + `orgContextResult` channel.
- **[Step 3](step-03.md)** — ✅ DONE (2026-06-20). Added **mcp-health** check (`detectMcpDrift` +
  injectable `createMcpHealthCheck`, `edsOnly`, guarded): on stale-path drift it posts a visible
  `warning` ("Updating AI configuration…"), heals via `handleRegenerateAiFiles`, then `ok`/`error`.
  AI badge telegraphs the heal. Folded `mcp-open-time-self-heal` plan superseded. **= the silent-MCP
  fix (P2).**
- **[Step 4](step-04.md)** — ✅ DONE (2026-06-20). Migrated **mesh-verify** onto the orchestrator
  (`createMeshVerifyCheck`, injected verify/sync/markDirty, reRunnable, conditionally added when a
  deployed mesh is auth-reachable). Always posts a typed outcome: ok / warning ("API Mesh is no longer
  deployed", state still synced) / unknown (transient error — no scary flip). Removed the old
  `verifyMeshDeployment` helper + its on-open `meshStatusUpdate` post; the deploy/redeploy
  `meshStatusUpdate` flow is untouched. Hook routes `checkResult{mesh-verify}` to the mesh badge. **P2.**
- **[Step 5](step-05.md)** — Migrate **ai-verify**; surface *which* MCP/skill failed and why (P2;
  fixes the generic-yellow-badge-no-diagnostic gap).
- **[Step 6](step-06.md)** — Unify the webview: one `checkResult` router replacing the four ad-hoc
  listeners in `useDashboardStatus`. Remove the now-dead message types.

## Risks / constraints

- **Don't regress the working surfaces.** The org banner, mesh badge, AI badge, and progress UI must
  keep working at every step. Migrate one chain at a time; keep the old listener until its check is
  migrated, then remove it in the same step.
- **P1 is a hard contract.** A check's `run` must be non-interactive — no `aio` interactive path, no
  browser. Add a guard/comment; the org check is the test case (verify no browser launch on open).
- **Re-entrancy.** Orchestrator must not double-run checks when the webview re-requests status
  (mirror the existing fire-and-forget guard; per-session per-checkId).
- **Non-fatal everywhere.** A check throwing must never break dashboard open (the P2 wrapper).
- **Scope discipline.** This is a coordination/communication refactor — it does NOT change *what* each
  check fundamentally does (mesh still verifies, AI still inventories), only how it's run and reported.

## Done-when

All four chains run through `runOnOpenChecks`, every outcome is a typed `checkResult`, the webview has
one router, no on-open check can launch a browser (P1) or fail silently (P2), and the full suite is
green. The two bug fixes are observable after Steps 2 and 3 respectively.
