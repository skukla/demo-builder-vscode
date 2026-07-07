# Step 3 — Visible UI feedback for the self-heal

**Goal:** the user sees "Updating AI configuration…" when an open-time self-heal runs — never a silent
stall. Mostly reuses the existing progress surface.

## Files

- Edit `src/features/dashboard/ui/hooks/useDashboardStatus.ts` — subscribe to `mcpSelfHealStarted` /
  `mcpSelfHealDone` (alongside the existing `creationProgress` and `orgContextResult` listeners).
- Possibly a tiny banner/status string in the dashboard screen (reuse the existing regenerate/progress
  component — do NOT build a new modal).
- Tests: `tests/features/dashboard/ui/hooks/useDashboardStatus.test.ts` (extend).

## Behavior

- On `mcpSelfHealStarted`: set a `selfHealing` state → render the existing progress/spinner affordance
  with copy like "Updating AI configuration…". The actual per-step text rides the `creationProgress`
  messages `handleRegenerateAiFiles` already emits (reused channel — no new plumbing).
- On `mcpSelfHealDone {ok:true}`: clear `selfHealing`; optionally a brief "AI configuration updated"
  confirmation.
- On `mcpSelfHealDone {ok:false}`: clear `selfHealing`; show a quiet "Couldn't update AI configuration —
  open AI Configuration to retry" (links to the existing Regenerate action). No blocking error.
- Clean up all listeners on unmount (match the existing unsubscribe pattern, e.g. `:285`, `:303`, `:315`).

## Tests (write FIRST)

- `mcpSelfHealStarted` → hook exposes `selfHealing: true`.
- `creationProgress` during heal updates the visible message (reuses existing handling — assert it still
  works while `selfHealing`).
- `mcpSelfHealDone {ok:true}` → `selfHealing: false`.
- `mcpSelfHealDone {ok:false}` → `selfHealing: false` + the retry hint surfaced.
- listeners unsubscribed on unmount.

## Constraints

- **Reuse, don't rebuild:** the regenerate progress UI already exists (shipped via the
  `2026-06-02-regenerate-ai-files-progress` work). This step wires the self-heal messages into it, not
  a parallel surface.
- Follow the React-hooks memory rules (stable empty-array refs; fake-timer cleanup) for the test.
- Keep message-type names identical to Step 2.

## Done = transparency guardrail satisfied

After this step, an open-time self-heal is *visible and conditional* — the explicit answer to the
surprise-background-work concern (cf. the dashboard org-check finding). Run the gate (scoped Jest +
tsc + eslint) and a live F5: open a drifted EDS project, confirm the progress shows and `.mcp.json`
self-corrects; open a healthy project, confirm nothing fires.
