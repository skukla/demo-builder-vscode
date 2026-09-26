---
id: AB-33
kind: fix
area: app-builder
needs: []
value: med
status: backlog
---

# Removing an integration reports Runtime packages left behind in a workspace it then deletes

Filed 2026-09-26 from removing the ERP pair (then named "Acme ERP") on Bodea.

`remove_integration` undeployed the app, but three Runtime packages (webhook, product-commerce,
ingestion) failed to delete. It then deleted the integration's own Adobe workspace anyway, and
warned: "Acme ERP Integration was removed, but its Runtime cleanup did not finish — 3 item(s)
are still deployed … Check the namespace with `aio runtime package list` before reusing this
project." That advice points at a namespace whose workspace no longer exists, so the SC cannot
follow it.

Two questions to settle, in order:
1. Why the three package deletes failed (read the undeploy's Debug Logs; the three are the
   packages holding the webhook and event actions).
2. What deleting the workspace does to its namespace. Adobe's public docs do not say. Measure
   it on a scratch workspace: deploy, delete the workspace, then try to list the namespace.

Then either the delete order changes (retry the package deletes before deleting the
workspace) or the warning says what is actually true.

## Shipped so far

- 2026-09-26  2356ed280: cause from the Debug Logs: three recursive package deletes answered 'package not empty (409)'. Rebuilt the same shapes (sequences over Adobe's validator) in a throwaway package: they deleted cleanly, cause not found. Recovery shipped: on 'not empty' the package is emptied one action at a time and deleted again. Still open, the owner's call: the remove deletes the workspace even when items remain, so the warning's advice cannot be followed.
