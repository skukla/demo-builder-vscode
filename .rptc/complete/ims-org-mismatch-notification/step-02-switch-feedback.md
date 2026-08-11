# Step 02 — In-flight feedback on `Switch IMS Org`

## Problem
`handleSwitchOrg` (`useDashboardActions.ts:171`) only posts `switchOrg`. The backend then runs
a forced browser login + re-verify (multi-second, gated on the browser flow) with **no
in-flight state** on the banner button — it stays enabled and silent, and is double-pressable.
The resolution edge already exists: the re-verify emits `orgContextResult { pending → result }`,
flipping `orgCheckState` through `checking`.

## Approach (local state, no new messages)
- `ProjectDashboardScreen`: `const [isSwitchingOrg, setIsSwitchingOrg] = useState(false)`.
  - `onSwitchOrg`: `setIsSwitchingOrg(true)` alongside `setSwitchAttempted(true)` + `handleSwitchOrg()`.
  - Clear in the existing `useEffect([orgCheckState])`: when `orgCheckState !== 'checking'`,
    `setIsSwitchingOrg(false)` (mismatch → re-enable; ok/none → banner unmounts).
  - Pass `isSwitching={isSwitchingOrg}` to `<OrgContextNotice>`.
- `OrgContextNotice`: add `isSwitching?: boolean`; button shows a `ProgressCircle` (S) +
  "Switching…", `isDisabled={isSwitching}`; `onSwitchOrg` guarded to no-op while switching.
- Do **not** couple to `setIsTransitioning` (that governs the demo/mesh grid).

## Tests (RED first)
Extend `tests/features/dashboard/ui/ProjectDashboardScreen-orgMismatch.test.tsx`:
- Press `Switch IMS Org` → button disabled + "Switching…" shown.
- A following `orgContextResult` (pending→resolved-mismatch) returns the button to idle/enabled.
- Second press while switching is a no-op.

## Acceptance
- Pressing `Switch IMS Org` immediately shows a busy/disabled button; clears exactly when the
  org re-check resolves; no double-submit; demo/mesh grid enablement unaffected.
