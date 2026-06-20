# Step 3 — Add mcp-health check (= the silent-MCP self-heal fix, P2)

**Goal:** an on-open check that detects stale `.mcp.json` paths and **visibly auto-heals**, replacing
the silent MODULE_NOT_FOUND. Folds in the standalone `mcp-open-time-self-heal` plan.

## Files

- New `src/features/ai/mcpDriftDetector.ts` — `detectMcpDrift(projectPath)` (verbatim from
  [`mcp-open-time-self-heal` Step 1](../mcp-open-time-self-heal/step-01.md): read `.claude/mcp.json`,
  resolve each non-`demo-builder` server arg vs `resolveMcpToolsDir`, `fs.access`, return
  `{drifted, missing[]}`; cheap, no network — **P1-safe probe**).
- New `src/features/dashboard/services/onOpenChecks/mcpHealthCheck.ts` — an `OnOpenCheck` (`edsOnly:true`)
  whose `run` calls `detectMcpDrift`; on drift → posts `{status:'warning', message:'Updating AI configuration…', data:{missing}}`, runs the existing `handleRegenerateAiFiles(ctx)` (visible
  `creationProgress`, non-fatal), then resolves `{status:'ok'}` (or `{status:'error'}` if heal failed).
- Edit `dashboardHandlers.ts` — add `mcpHealthCheck` to the orchestrator's check array.
- Edit `useDashboardStatus.ts` — route `checkResult{mcp-health}` to the self-heal progress surface
  (reuses the regenerate progress UI).
- Tests: `mcpDriftDetector.test.ts` (the 8 cases from the folded plan) + `mcpHealthCheck.test.ts`.

## Behavior (per the folded plan, now as a check)

- healthy → `{status:'ok'}`, nothing posted to the user beyond the silent ok.
- drift on an EDS project → post `warning` (visible "Updating AI configuration…"), heal via
  `handleRegenerateAiFiles`, then `ok`; on heal failure → `error` with a quiet retry hint.
- headless → `edsOnly` skip (orchestrator handles the gate).
- P1: detection is `fs.access` only; the heal (`npm install` + regen) is real work but it's **visibly
  telegraphed** and only on confirmed drift — the explicit non-surprise contract.

## Tests (write FIRST)

- `detectMcpDrift`: the 8 cases (healthy / drifted / skip-demo-builder / relative+absolute resolution /
  missing+malformed file / env-only) — from the folded plan.
- `mcpHealthCheck`: drift+EDS → heals (handleRegenerateAiFiles called once; warning then ok posted);
  healthy → ok, no heal; heal throws → error outcome (no rejection); headless gate handled by
  orchestrator (covered in Step 1/2 wiring test).

## Constraints

- Reuse `handleRegenerateAiFiles` (don't reimplement the heal) and `resolveMcpToolsDir`.
- On completion, mark the standalone `mcp-open-time-self-heal` plan **superseded/folded** (move to
  `.rptc/complete/` or annotate) so there's one source of truth.
- Re-entrancy via the orchestrator guard (don't heal twice per session).
