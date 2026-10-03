---
id: PL-65
kind: fix
area: platform
needs: []
value: low
status: backlog
---

# The wizard's two config warnings should reach the log channel

Filed 2026-10-03 from PL-40's answer. Both wizard config warnings (an unknown stack id, a stack
with no demo package) are reachable from a saved project file (Edit and Import seed
selectedStack and selectedPackage unchecked: useWizardState.ts) and are pinned by tests in
useWizardState-seeding.test.tsx. They go to the webview console, where no SC looks. Rewire them
to the extension's log channel (Debug Logs) the way other webview warnings are forwarded, so a
bad saved file leaves a trace someone can read.
