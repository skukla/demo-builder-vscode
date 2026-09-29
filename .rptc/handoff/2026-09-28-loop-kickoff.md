# Overnight loop — kickoff brief (2026-09-28 ~22:11 EDT)

Read this FIRST on every wake, then follow the `unattended-loop` skill. Owner is away; this
runs all night and **stops + reports** when the epic's unattended work is exhausted (owner's
kickoff choice — do NOT fall back to maintenance/bug-fixes).

## Scope

The **Multi-ERP / several-ERPs epic** ([[AB-26]], [[AB-16]]). Order of work is
`.rptc/plans/several-erps/overview.md` — §7 is the state table, §3 (Phase A) and §5 (Phase B
B0–B8) the plan. Phase A is essentially done; **B0–B5 shipped; B6–B8 remain**, plus the AB-16
sub-items (AB-16c/d/e/g). Work the remaining Phase B + AB-16 items in plan order, staleness-
checking each at pickup.

## Cloud posture — the standing ERP grant is ON (owner, kickoff 2026-09-28)

Wider than the default no-cloud rails, for this epic only:
- **Push loop branches** to `skukla/demo-erp` and `skukla/commerce-erp-integration` (backup).
- **Deploy the pair to a SCRATCH workspace** for live checks (NOT Bodea).
- **Live sync baseline on the demo instance** is allowed.
- Every other unattended-loop rail stands: gate-conditional commits (exit codes in variables),
  no sign-ins (expired session DEFERS, never prompts), scans before "done".

**Hard limits (do NOT cross unattended):**
- **NO delete/rebuild of Bodea** → **skip AB-16f entirely.**
- No other destructive ops; Bodea live-proofs that need the owner watching are lane-2 handoffs.

## First item: AB-16c — screens and agent tools that still assume one ERP

`backlog`, in progress (commits today, some built-but-unpushed on loop branches). Remaining,
per the item + `c1-screen-listing.md`:
- **Admin-page one-ERP gaps** (Overview, Lookup, History, Order trace, ERP-number column, Move
  stock): several are LIKELY already closed by today's redesign (Overview/Activity/Settings/Data
  Map are now multi-ERP and are deployed to Bodea as of 22:22 UTC). **Verify per screen** against
  the current code and either close the gap or record it as deliberately one-ERP with the reason.
  Suspect still-one-ERP: TracePanel's headline uses `erpInfo.erps[0]` (`trace-view.js`).
- **Per-ERP reset, integration side** — building on `loop/ab-16c-per-erp-detach`; the Demo
  Builder side is an unpushed commit on `feature/erp-integration`. Finish + push.
- **Second ERP's look** — `demo-erp` `loop/erp-theme-per-erp` fc76084, unmerged/undeployed.
- **`preview/next` hard-coded ERP.**

## Environment

- caffeinate `-ims -t 32400` (9h) running (pid was 78788), covers to ~07:11 EDT.
- Loop runs via CronCreate job `3e83e27a` (fires :14/:34/:54, every ~20 min, only when idle).
  It is **session-only** — it dies if this Claude session exits. Delete it (CronDelete
  `3e83e27a`) when the epic's unattended work is exhausted, then write the final report.
- MCP host serving `feature/erp-integration@…` from the erp-integration worktree; deploys/live
  checks go through it (`mcp-live-probe`, then the deploy tools with the scratch workspace).
- Report accumulates in `.rptc/handoff/2026-09-28-loop-report.md`; `backlog.mjs log` each item;
  `backlog.mjs unlogged --write` before the final report.

## Order after AB-16c

AB-16g (key-map fix) → B6 (add-a-second-ERP: filling/reset/removal cover every ERP) → B7
(Admin surfaces: per-part order-grid column, re-send) → A5 journeys (sync-validation, harness,
no cloud) → B8 / AB-16d (two ERPs live — lane 2, hand off the Bodea half). Re-triage at each
pickup; skip AB-16f.
