# Plan: Unify the two mesh-deploy code paths

**Source research:** `.rptc/research/unify-mesh-deploy-pipeline/research.md`
**Branch:** `claude/unify-mesh-deploy-pipeline` (off `claude/ims-mismatch-notification-treo89`)
**Decisions (PM, flow-confirmed):** build before deploy ✅ · create-or-update ✅

## Goal
Make `DeployMeshCommand` delegate build + deploy + verify to the shared `deployMeshComponent`
service instead of inlining its own `aio api-mesh:update`. One place issues `aio api-mesh:*`.

This is also a **bug fix** (research §user-flows): today the dashboard "Redeploy mesh to apply
changes" ships a stale `mesh.json` (no build) and can't `create` a never-deployed mesh.

## What the command KEEPS (orchestration/UX — unchanged)
- `ExecutionLock`, pre-flight (`ensureProjectAdobeContext`) + App Builder gate.
- `withProgress` notification + dashboard `sendMeshStatusUpdate` telegraphing (via an
  `onProgress` adapter passed to the service).
- Post-deploy persistence: `meshComponent.status/metadata.meshId`, `updateMeshState`,
  `meshStatusSummary='deployed'`, `saveProject`, final `sendMeshStatusUpdate('deployed', endpoint)`,
  success toast, `meshActionTaken`.
- Error UX: error status + "View Logs" toast (outer catch).

## What CHANGES
- Remove the inline `aio api-mesh:update` + the upfront `mesh.json` existence check (the service
  builds then validates — `mesh.json` may not exist until built).
- Fetch `existingMeshId` via `fetchMeshInfoFromAdobeIO` (remote truth, as the headless reset
  does) → pass to `deployMeshComponent` for create-or-update.
- Delegate to `deployMeshComponent(meshPath, executor, logger, onProgress, existingMeshId)`;
  read `meshId`/`endpoint` from its result for persistence.

## Out of scope
- Reset/creation flows already use the service — untouched.
- `withOrgContext` targeting: the command keeps relying on the restored session context (its
  current behavior); not introducing per-invocation targeting here.

## Tests (TDD)
- New `tests/features/mesh/commands/deployMesh-unify.test.ts`: command calls
  `fetchMeshInfoFromAdobeIO` then `deployMeshComponent` with the right args + `existingMeshId`
  (update when a mesh exists, '' → create when none); failure result → error status + toast.
- Update `deployMesh-auth`, `deployMesh-orgContext`, `deployMesh-storage` to mock
  `deployMeshComponent` + `fetchMeshInfoFromAdobeIO` (unit-isolate the command; the service's
  build/create-update/verify internals are covered by `meshDeployment-*` tests).

See `step-01-delegate-deploy.md`.
