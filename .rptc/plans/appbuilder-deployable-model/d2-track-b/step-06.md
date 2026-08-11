# Step 06 — Remove confirmation dialog + Track B integration green

**Purpose:** Add a confirmation dialog before remove (a destructive cloud undeploy via D1's
`removeDeployable`), since the slice-1 `AppBuilderCard` Remove has none (research B-6). Then run the
full repo-wide gate so Track B lands green for PM review / TDD merge.

## Prerequisites

- Step 05 (the integrations list + `removeDeployable` wiring).
- Reuse (do NOT fork): the existing dashboard dialog pattern — `DashboardRenameDialog`
  (`ProjectDashboardScreen.tsx:452`) and/or `DialogContainer` usage already in the screen; mirror its
  open/confirm/close shape.

## Tests to write FIRST (RED)

**File:** `tests/unit/features/dashboard/ui/components/DeployableRemoveDialog.test.tsx`
(@testing-library/react)

- [ ] The Remove button on a deployed/error row OPENS a confirmation dialog (does NOT immediately post
      `removeDeployable`).
- [ ] The dialog names the deployable and warns the undeploy is destructive (cloud teardown).
- [ ] Confirm → posts `removeDeployable` with the row id, then closes.
- [ ] Cancel/dismiss → closes WITHOUT posting (no accidental teardown). (Boundary — the safety case.)

**File:** `tests/unit/features/dashboard/ui/components/DeployablesList.test.tsx` (extend)

- [ ] Remove flows through the dialog (no direct post on the row's Remove click).

## Implementation (GREEN)

- Create `src/features/dashboard/ui/components/DeployableRemoveDialog.tsx` modeled on
  `DashboardRenameDialog` (controlled `isOpen`/`onConfirm`/`onClose`; Spectrum `Dialog` with a
  destructive-styled confirm). < 350 lines (it's tiny).
- Wire it into `DeployablesList`/`DeployableRow`: Remove sets a `pendingRemoveId`; the dialog confirms →
  posts `removeDeployable`. Keep the dialog state in the list (one dialog instance, not per-row).

## Files

| File | Action |
|---|---|
| `src/features/dashboard/ui/components/DeployableRemoveDialog.tsx` | create |
| `src/features/dashboard/ui/components/DeployablesList.tsx` | modify (dialog wiring) |
| `tests/unit/.../DeployableRemoveDialog.test.tsx` | create |
| `tests/unit/.../DeployablesList.test.tsx` | modify |

## Final Track B gate (do this LAST, before declaring Track B done)

- [ ] `npm run lint` (WHOLE repo — CI lints everything; a scoped lint hides repo-wide errors).
- [ ] `npx tsc --noEmit` (whole repo).
- [ ] `npx jest --no-coverage` (full suite; redirect to a file — do NOT pipe through `tail`/`head`/`grep`,
      see project memory "Jest Output Piping").
- [ ] Re-run the EXISTING mesh-badge + `mesh-verify` dashboard tests explicitly — confirm Track B left
      the mesh surface untouched.
- [ ] Manual smoke (flagged, not automated): one real integration through add→deploy→verify→remove
      against a throwaway workspace (first UI-driven `addDeployable`; D1 spike proved the mechanics).

## Dependencies / ordering

- Last step. After Step 05.

## Risks

- **Accidental teardown** (HIGH): the whole point of this step. The cancel/dismiss "no post" test is the
  gate.
- **Dialog-state leak across rows** (LOW): one dialog + `pendingRemoveId` avoids per-row dialog
  instances. Locked by the list test.

## Self-critique (KISS/YAGNI)

- One small dialog reusing the existing rename-dialog shape. No generic confirm-dialog framework. No
  changes to D1's `removeDeployable` (it already does best-effort teardown + cleanup) — this is purely a
  UI guard.

## Acceptance criteria

- Remove always confirms before tearing down; cancel never posts; full repo-wide lint/tsc/jest green;
  mesh surface verified untouched.
