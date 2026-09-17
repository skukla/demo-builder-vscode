---
id: AB-12
kind: feature
area: app-builder
parent: AB-9
needs: []
value: low
status: backlog
---

# Removing an integration leaves it "Associated" in App Management

Demo Builder's remove already runs the app's own uninstaller before `aio app undeploy`
(`appManagementUninstaller.ts`, called ahead of the undeploy in
`appBuilderComponentRunner.ts`), which removes the event registrations, webhooks and the app's
association record. It cannot clear App Management's own record: an app the SC associated in
App Management stays listed as Associated after the remove. Unassociating it afterwards is
reported to fail, because the app's uninstall endpoint that App Management calls is gone once
the app is undeployed; Adobe's guidance is to uninstall in App Management before undeploying.

## The likely shape

- Before the undeploy, the remove flow tells the SC to Unassociate in App Management (or to
  Uninstall there), waits for confirmation, then undeploys.
- Or, if a way to read App Management's state exists, it checks and only prompts when the app
  is still associated.

Depends on how AB-11 settles the association hand-off.

Filed 2026-09-17.
