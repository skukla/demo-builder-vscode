# Backlog: Unify the two mesh-deploy code paths

**Status:** proposed (next up after the org-context gate work)
**Origin:** `.rptc/research/ims-org-mismatch-notification/research.md` §9

## Problem

API Mesh deployment is orchestrated by **two divergent implementations**:

1. **`DeployMeshCommand`** (`src/features/mesh/commands/deployMesh.ts`) — the dashboard
   "Deploy Mesh" button. **Inlines its own deploy** (`aio api-mesh:update`, ~line 207) with its
   own `ExecutionLock`, dashboard status updates, progress parsing, and verification.
2. **`deployMeshComponent`** (`src/features/mesh/services/meshDeployment.ts`) — the deploy
   *primitive*, used by **project creation** (`meshSetupService`, `createProject`) and **both
   project-reset flows** (`projectResetService`, `edsResetMeshHelper`).

Because pre-flight (auth / org / permissions) lived at each entry point, it drifted — the reset
flows had the auth gate but silently missed the org-context gate. The immediate gate drift was
fixed by extracting `ensureProjectAdobeContext` (see research §9), but the **two deploy code
paths remain**, which is the underlying duplication.

## Why it wasn't done with the gate work

- Risky: unifying touches the command's `ExecutionLock`, dashboard "deploying" status
  telegraphs, stdout progress parsing, and verification — all standalone-UX concerns the reset
  pipelines don't share (they thread their own progress + `withOrgContext` org targeting).
- Not required to fix the gate: the shared pre-flight already removes the correctness bug.

## Proposed direction (to be planned)

- Make `deployMeshComponent` (or a `MeshDeploymentService.deploy()`) the single deploy core,
  with the command's lock/status/verification layered around it rather than reimplementing the
  `aio api-mesh:update` call.
- Inject pre-flight (`ensureProjectAdobeContext` for existing-project callers; none for
  creation) at the call sites, keeping the primitive prompt-free.
- Keep creation’s sign-in-derived org behavior intact (no mismatch gate).

## Acceptance (rough)

- One place issues `aio api-mesh:update`.
- Command + resets + creation all call the same deploy core with their own pre-flight/targeting.
- No behavior change to dashboard status, locking, or reset best-effort semantics.

## Constraints / guardrails

- The deploy primitive must stay non-interactive (creation calls it; prompts would be spurious).
- Don't regress the reset flows' `withOrgContext` per-invocation env targeting (no mutating the
  global `aio` selection).
