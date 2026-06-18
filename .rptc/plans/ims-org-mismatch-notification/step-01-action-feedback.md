# Step 01 — In-flight feedback for `Switch IMS Org`

## Problem

`handleSwitchOrg` (`useDashboardActions.ts:171`) only does
`webviewClient.postMessage('switchOrg')`. The backend then runs a **forced browser
login + status re-verify** (`handleSwitchOrg` → `loginAndRestoreProjectContext(…, true)`
→ `handleRequestStatus`), which is multi-second and gated on the user completing the
browser flow. During all of that the banner's `Switch IMS Org` button stays enabled
and gives no feedback — a user can double-press, and it looks dead.

The resolution signal already exists: the re-verify fires `runOrgContextCheck`, which
posts `orgContextResult { pending: true }` then `{ … result }`. So we have clean
start/stop edges to bind a spinner to.

## Approach (simplest that works)

Local UI state in `ProjectDashboardScreen`, cleared by the existing org-check signal.
No new messages.

### RED — tests first

Extend `tests/features/dashboard/ui/ProjectDashboardScreen-orgMismatch.test.tsx`:

1. Pressing `Switch IMS Org` disables the button and shows the in-flight affordance
   (e.g. `aria-busy` / spinner / "Switching…" — assert on a stable testid/role).
2. When a subsequent `orgContextResult` arrives (pending then resolved), the button
   returns to its idle state (still mismatched → enabled again; resolved-ok → banner
   gone).
3. The button cannot be re-triggered while in-flight (second press is a no-op).

### GREEN — implementation

- `ProjectDashboardScreen.tsx`: add `const [isSwitchingOrg, setIsSwitchingOrg] = useState(false)`.
  - In `onSwitchOrg`: `setIsSwitchingOrg(true)` alongside the existing
    `setSwitchAttempted(true)` + `handleSwitchOrg()`.
  - Clear it when the check resolves: in the existing
    `useEffect([orgCheckState])`, when `orgCheckState !== 'checking'`, call
    `setIsSwitchingOrg(false)`. (`mismatch` → re-enable; `ok`/`none` → banner unmounts.)
  - Pass `isSwitching={isSwitchingOrg}` to `<OrgContextNotice>`.
- `OrgContextNotice.tsx`: add `isSwitching?: boolean` prop; on the `Button` set
  `isPending` (Spectrum) or `isDisabled={isSwitching}` with a `ProgressCircle`
  size="S" + "Switching…" label. Guard `onSwitchOrg` so it no-ops while switching.

Keep it to local state — no `setIsTransitioning` coupling (that flag governs
demo/mesh action buttons and we don't want to disable the whole grid for an org switch).

### REFACTOR

- Ensure the in-flight label/markup reuses existing spinner conventions
  (`ProgressCircle` is already used elsewhere in the dashboard surface).

## Acceptance

- Pressing `Switch IMS Org` immediately shows a busy/disabled button.
- Busy state clears exactly when the org re-check resolves (no manual timeout).
- No double-submit. No change to the demo/mesh action grid enablement.
