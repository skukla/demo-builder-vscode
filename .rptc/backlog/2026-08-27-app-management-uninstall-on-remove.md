---
id: AB-4
kind: feature
area: app-builder
needs: []
value: med
status: backlog
parent: AB-1
---

# Uninstall an App Management app before removing it

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-27, from the owner's kit audit (Q4/Q5: cleanup and event
providers on deletion).

Removing an app-management integration today runs `aio app undeploy` + local
cleanup — which removes the ACTIONS but none of what the app's INSTALLER
created: ~23 I/O Events registrations, the Runtime binding packages
(`bound_package`, `acp`), the Commerce-side eventing configuration, and the
app↔Commerce association. All of that was measured live this session (the
residue from five half-installs had to be cleared by hand before the install
could converge). Project-level teardown (`consoleProjectTeardown`) sweeps
registrations/providers eventually, but integration-level remove leaves them.

The app itself provides the clean path — its API serves `startUninstallation`
/ `getUninstallationState` / `clearUninstallationState` and
`clearAssociation` (operation inventory read from the generated OpenAPI,
2026-08-27). The shape mirrors the installer exactly:

1. `AppManagementClient` gains the four uninstall/association-clear methods.
2. `removeAppBuilderComponent` calls a new `uninstallAppManagementApp`
   BEFORE `teardownRemote` for `lifecycle: 'app-management'` entries
   (mirror of `installIfAppManagement`: poll to terminal, hands-back to
   Commerce Admin on failure, never blocks the remove).
3. Same retry-on-race treatment if uninstall shows the 409 signature.

Until this ships, a removed kit app leaves its event fabric behind — rely on
project teardown or manual cleanup.
