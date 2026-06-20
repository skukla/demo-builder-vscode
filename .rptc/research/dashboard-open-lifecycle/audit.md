# Audit: what fires when a project dashboard opens (+ how results reach the user)

**Date:** 2026-06-20. Motivation: the surprise-browser and silent-MCP-failure bugs are two symptoms of
one thing — the on-open lifecycle is a set of **uncoordinated async chains with inconsistent user
communication**. This maps reality before any redesign.

## The on-open async operations

| # | Op (entry) | Side effects | Cost | How it talks to the user | Failure |
|---|---|---|---|---|---|
| 1 | `handleRequestStatus` (`dashboardHandlers.ts:40`) — initial status payload | `ensureAdobeIOAuth` (CLI auth check — **can launch browser** if token absent/expired) | 50–200ms; +2–5s if token validation | `statusUpdate` (rendered immediately) | non-fatal → mesh `needs-auth` badge |
| 2 | `runOrgContextCheck` (`:140`, fire-and-forget) → `detectProjectOrgMismatch` → `getOrganizations` | SDK try → **CLI fallback `aio console org list`**; browser can launch via the auth path; network to Adobe I/O | healthy 0.5–2.5s; **SDK-timeout+CLI ~13–14.5s** | `orgContextResult` two-phase (`{pending}` → `{orgMismatch?}`): blue→green/red badge + mismatch banner | **errors logged, NO UI** (badge just clears) |
| 3 | `verifyMeshDeployment` (`meshStatusHelpers.ts:249`, background) | Adobe I/O network call (cached auth, no browser) | 3–5s | **silent on success**; `meshStatusUpdate` only on failure | silently flips persisted mesh → `not-deployed` |
| 4 | `verify-ai-setup` (`aiHandlers.ts:37`, separate mount useEffect) → `gatherInventory` | **spawns each MCP server** (15s budget; Playwright may download a browser binary); reads `~/.claude.json` | 2–6s typical, up to 15s+ | `{checks, inventory}` → AI-Ready badge (blue/green/yellow/red) + View Skills | per-inspector failure → `*Error` field, **yellow badge, no diagnostic** (the MODULE_NOT_FOUND only shows in logs) |

Plus non-message wiring: `init` handshake (`showDashboard.ts:118` seed data, once), handler registration
(`:248`), hook listeners + 300ms org-badge min-display timer (`useDashboardStatus.ts:237+`).

## Key findings (A–E)

- **A. Message types are ad-hoc.** Status uses camelCase (`statusUpdate`, `meshStatusUpdate`,
  `orgContextResult`, `creationProgress`, `appStatusUpdate`, `authoringExperienceUpdate`); request
  handlers use hyphen-case (`verify-ai-setup`, `regenerate-ai-files`). No enum/registry; typos fail
  silently.
- **B. Silent checks (no user channel):** `verifyMeshDeployment` success + silent mesh→not-deployed
  flip; org-check hard errors (vanish to logs); session-MCP / inventory inspector errors (degrade to
  a generic yellow badge with no "which/why").
- **C. Surprise side effects:** browser launch via `ensureAdobeIOAuth`/`getOrganizations` on open;
  unbounded 13–14.5s org stall on SDK-unavailable CLI fallback; MCP spawns that can download binaries;
  background mesh state mutation without notice.
- **D. NO central orchestrator.** Each check wires itself: `handleRequestStatus` hard-calls
  `void runOrgContextCheck` + `verifyMeshDeployment().catch()`; the hook independently fires
  `verify-ai-setup` in a separate `useEffect`. Four uncoordinated chains.
- **E. AI verify runs on EVERY dashboard open** (not just the Configure AI tab) — `useDashboardStatus`
  `useEffect` → `verify-ai-setup`. This is where the stale-MCP MODULE_NOT_FOUND surfaces (logs only).

## The two axes that explain both bugs

Every on-open check sits on two axes, and the bugs are the corners that violate them:
1. **Side-effect visibility** — automatic checks must NOT surprise (browser, long stall). *Org check
   violates this* (surprise browser + 14.5s).
2. **Result communication** — a check that finds a problem must surface it consistently, not vanish.
   *MCP verify violates this* (MODULE_NOT_FOUND → logs only → generic yellow badge).

## Two principles for on-open checks (proposed)

- **P1 — No surprise side effects on open.** An automatic, non-user-initiated check uses quick,
  **non-interactive** probes and never launches a browser or does heavy mutation; it degrades to
  "unknown / click to check" rather than block or prompt.
- **P2 — No silent failures on open.** A check that finds a problem (or fails) surfaces it through a
  consistent, visible channel — not just logs.

## Where the existing fixes slot in

- **MCP self-heal** (`.rptc/plans/mcp-open-time-self-heal/`) = P2: turns a silent MODULE_NOT_FOUND into
  a visible, auto-healed state.
- **Surprise-browser** (`.rptc/backlog/2026-06-20-dashboard-org-check-surprise-browser.md`) = P1: the
  org check must use a quick non-interactive auth probe and never trigger the interactive `aio` path on
  open.
- **Newly surfaced (fold in or file):** mesh silent-flip (P2), org-check silent hard-error (P2),
  AI-verify "which MCP/why" diagnostic (P2).

## Scope note

A full "central on-open orchestrator + message-type registry" refactor is the tempting end-state, but
is a large speculative change. KISS path: enforce P1/P2, fix the concrete violators (the two bugs +
maybe the two newly-surfaced silent cases), and only build the orchestrator if a third+ on-open check
makes the ad-hoc wiring genuinely painful (Rule of Three).
