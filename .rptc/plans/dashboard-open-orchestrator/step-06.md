# Step 6 — Unify the webview side (one `checkResult` router)

**Status:** Outline — firms up after Steps 2–5 land.

**Goal:** collapse the four ad-hoc `onMessage(...)` listeners in `useDashboardStatus` into a single
`checkResult` router keyed by `checkId`, and remove the now-dead per-check message types. The backend
is already unified by Steps 1–5; this finishes the symmetry on the UI side.

## Shape

- `useDashboardStatus.ts`: replace `onMessage('orgContextResult')`, the on-open use of
  `onMessage('meshStatusUpdate')`, and the standalone `verify-ai-setup` request/`creationProgress`
  wiring with one `onMessage('checkResult', (o) => routeByCheckId(o))`:
  - `org-context` → org banner/badge state
  - `mesh-verify` → mesh badge state
  - `mcp-health` → self-heal progress surface
  - `ai-verify` → AI-Ready badge + failure detail
- Keep `statusUpdate` (initial payload) and the action-flow messages (`meshStatusUpdate` for
  deploy/redeploy, `appStatusUpdate`, `authoringExperienceUpdate`) — those are NOT on-open checks.
- Remove dead MessageTypes from `messages.ts` once no listener references them.

## Tests (write FIRST)

- the router dispatches each `checkId` to the correct UI state; unknown `checkId` is ignored safely;
  listeners unsubscribe on unmount; the four old listeners are gone.

## Constraints

- Behavior parity for every surface (org, mesh, AI, self-heal) — this is a consolidation, not a UX
  change.
- Follow the React-hooks memory rules (stable refs, fake-timer cleanup).

## Done = the refactor is complete

After Step 6: all on-open checks run through `runOnOpenChecks`, every result is a typed `checkResult`,
the webview has one router, no on-open check launches a browser (P1) or fails silently (P2). Run the
full suite + a live F5 sweep (drifted EDS project, healthy project, mismatched org, missing mesh) to
confirm parity + the two bug fixes.
