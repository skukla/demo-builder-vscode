# Step 4 — Migrate mesh-verify (P2: no more silent flip)

**Status:** ✅ DONE (2026-06-20). `createMeshVerifyCheck` (injectable verify/syncMeshStatus/markDirty,
reRunnable) in `onOpenChecks/meshVerifyCheck.ts`; wired into `handleRequestStatus` (conditionally, when
a deployed mesh is auth-reachable); old `verifyMeshDeployment` helper removed; hook routes
`checkResult{mesh-verify}` (warning → not-deployed, unknown → unchanged). 4 check tests + 2 hook tests.

**Goal:** move `verifyMeshDeployment` (`meshStatusHelpers.ts:249`) onto the orchestrator as a
`mesh-verify` check that ALWAYS posts a typed outcome — fixing the silent flip where a background check
quietly changes persisted mesh status to `not-deployed` with no user signal.

## Shape

- New `onOpenChecks/meshVerifyCheck.ts` wrapping the existing verify logic.
- `run`: verify the deployed mesh still exists (cached auth, no browser — already P1-safe).
  - exists + matches → `{status:'ok', data:{endpoint}}`.
  - **gone / changed → `{status:'warning', message:'API Mesh is no longer deployed', data:{...}}`** —
    now a *visible* outcome instead of a silent state mutation. Still update persisted state, but tell
    the user.
  - verify error → `{status:'unknown'}` (transient; don't scare).
- Webview routes `checkResult{mesh-verify}` to the existing mesh badge; replace `meshStatusUpdate`'s
  on-open use (keep `meshStatusUpdate` for the deploy/redeploy action flow — that's not on-open).

## Tests (write FIRST)

- mesh present → `ok`; mesh gone → `warning` (and the user-facing message is posted, not just state
  written); verify error → `unknown`; old silent path no longer the only signal.

## Constraints

- Don't disturb the deploy/redeploy `meshStatusUpdate` flow (separate from on-open verify).
- Keep persisted-state update; ADD the user-facing outcome.
