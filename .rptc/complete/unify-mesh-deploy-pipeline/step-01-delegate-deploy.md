# Step 01 — Delegate the command's deploy to `deployMeshComponent`

## Done
`DeployMeshCommand.execute()` now delegates build + deploy + verify to the shared
`deployMeshComponent` service instead of inlining `aio api-mesh:update`.

- Removed the inline `aio api-mesh:update` + the upfront `mesh.json` existence check (the
  service builds then validates — `mesh.json` may not exist until built).
- Inside the existing `withProgress`, fetch `existingMeshId` via `fetchMeshInfoFromAdobeIO`
  (remote truth, as the headless reset does) → pass to `deployMeshComponent` for
  **create-or-update**.
- An `onProgress(message, subMessage)` adapter bridges the service's progress to both the
  progress notification and `sendMeshStatusUpdate('deploying', …)`.
- Kept unchanged: `ExecutionLock`, pre-flight (`ensureProjectAdobeContext`) + App Builder gate,
  post-deploy persistence (`meshComponent.status/metadata.meshId`, `updateMeshState`,
  `meshStatusSummary='deployed'`, `saveProject`, deployed status, success toast,
  `meshActionTaken`), and the error UX (error status + "View Logs" toast).
- Pruned now-unused imports (`fs`, `path`, `TIMEOUTS`, `getMeshNodeVersion`, the error
  formatters, `parseJSON`).

## Behavior outcomes (the bug fixes)
- Dashboard "Redeploy mesh to apply changes" now **rebuilds** `mesh.json` from the current
  `.env`, so a Configure change actually takes effect.
- Dashboard deploy now **creates** a never-deployed mesh instead of failing on a hardcoded
  `update`.

## Tests
- New `deployMesh-unify.test.ts`: delegation args, create-vs-update id passing, success
  persistence, failure → error status + toast (no persistence).
- `deployMesh-storage` mocks `deployMeshComponent` + `fetchMeshInfoFromAdobeIO` so the
  persistence assertions run on a successful result; `deployMesh-auth` / `deployMesh-orgContext`
  unaffected (pre-flight only).
- Service internals (build / create-update / verify) remain covered by `meshDeployment-*` tests.

## Verification
- `tests/features/mesh` + `lifecycle` + `eds`: 158 suites / 1721 tests green.
- `tsc --noEmit` clean; eslint clean.
