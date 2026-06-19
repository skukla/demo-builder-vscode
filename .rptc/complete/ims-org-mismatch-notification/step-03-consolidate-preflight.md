# Step 03 — Consolidate the existing-project mesh pre-flight

## Why
Research §9 found the org gate was missing from the reset flows because pre-flight
(`auth` + `org`) was hand-wired separately at each entry point and drifted. Rather than add the
org call to two more files (sprinkling over the smell), pair the two gates into ONE reusable
unit so they can't drift.

## Constraint
The gate can't live in the deploy primitive (`deployMeshComponent`) — **creation** calls it and
its org is sign-in-derived (a mismatch prompt would be spurious). So the consolidation point is
the pre-flight layer, applied only at existing-project entry points.

## Built
`src/features/authentication/services/ensureProjectAdobeContext.ts` — runs `ensureAdobeIOAuth`
then `ensureProjectOrgContext`, returning `{ ready, cancelled?, blockedBy: 'auth' | 'org',
currentOrg? }`. Auth failure short-circuits (org check not run).

## Adopted at the three existing-project entry points
- `mesh/commands/deployMesh.ts` — replaced its two hand-wired guards with one call; error copy
  branches on `blockedBy` (preserves the distinct "sign-in failed" vs "wrong org" messages).
- `lifecycle/services/projectResetService.ts` — `ensureAdobeAuth` → `ensureAdobeContext` (now
  auth + org); caller skips mesh redeploy when not ready (same best-effort semantics).
- `eds/services/edsResetMeshHelper.ts` — `redeployApiMesh` uses the gate; on not-ready returns
  the existing "mesh redeploy skipped" result, reason branched on `blockedBy`.

## NOT changed (by design)
- Configure save — already inherits the gate via `executeCommand('demoBuilder.deployMesh')`.
- Creation flow + the `deployMeshComponent` primitive — sign-in-derived org; no gate.
- Passive dashboard status check — proactive badge/banner only, no blocking prompt.

## Tests
- New `tests/features/authentication/services/ensureProjectAdobeContext.test.ts` (composition:
  auth short-circuit, blockedBy org, cancelled passthrough, ready, option forwarding).
- Existing `deployMesh-auth` / `deployMesh-orgContext` stay green (the helper transparently
  composes the same two guards they mock); reset suites stay green (org check degrades to
  reachable when `getOrganizations` isn't exercised).

## Follow-up
Deeper duplication (command-inline `aio api-mesh:update` vs `deployMeshComponent`) tracked in
`.rptc/backlog/unify-mesh-deploy-pipeline.md`.
