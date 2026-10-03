---
id: AB-12
kind: feature
area: app-builder
parent: AB-9
needs: [AB-11]
value: low
status: built
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

## Shipped so far

- 2026-10-03  Warning half built, not committed (loop/2026-10-03-overnight): the Remove confirm of any card installed in Commerce says to unassociate in App Management first; remove_integration's description and consent dialog say the same. HANDOFF for the other half (check or clear App Management's record before the undeploy): AB-11 found no public API or CLI for App Management's own record, so (1) find out whether Commerce exposes a read of 'is this app associated' (the Admin screen's own request is the place to look, on a sandbox, signed in as the owner); (2) if it does, call it in the remove flow before cleanUpBeforeUndeploy and stop with the unassociate instruction only when it answers yes; (3) if it does not, the copy shipped here is the whole fix and this item closes. Either step is a live Commerce call, and an unassociate is a write that deletes the app's settings, so it needs the owner present
- 2026-10-03  Reconciled 2026-10-03 (second pass): the warning half is committed in 844afae69 (removalConsequence.ts, the remove_integration description), not 'built, not committed'. The other half has no public API (AB-11).
