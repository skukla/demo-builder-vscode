---
id: AB-58
kind: fix
area: app-builder
parent: AB-26
needs: []
value: low
status: backlog
---

# A removed alarm survives the deploy, and Demo Builder cannot see or delete it

Found 2026-10-02 after deploying AB-38 (the schedules heartbeat) to Justrite. The deploy that
replaced the fixed hourly alarm logged, in the `alarms/alarm` action, a failed DELETE against
Adobe's alarm service: "Error invoking whisk action: 400 … Response is not valid
'message/http'". At 08:05Z the old trigger `erp-prices-hourly-timer` fired (activation status
0) and started nothing: the action it pointed at (`erp/prices-scheduled`) was deleted by the
same deploy, so prices are not published twice. The new heartbeat (`erp-schedule-heartbeat`)
runs every five minutes as designed (07:35 to 08:05, every run status 0).

## Why it matters

Harmless today: one trigger activation an hour, into nothing. But the same failure would leave
a LIVE duplicate if a removed alarm's action still existed, and nothing in Demo Builder would
show it: `list_runtime_packages` lists packages only, and `delete_undeclared_runtime_code`
deletes left-behind actions, not triggers or rules.

## To do

- Owner, now (one command, the integration's workspace): `aio rt trigger delete
  erp-prices-hourly-timer` (and its rule, if `aio rt rule list` still shows one), with the
  JustriteERP workspace selected.
- Demo Builder: extend the Runtime leftovers tool to triggers and rules an app no longer
  declares (the same "declared by no app sharing the workspace" test it applies to actions),
  and list them in `list_runtime_packages`. Then the deploy's own clean-up can retry a
  refused alarm delete.

## Shipped so far
- 2026-10-02  docs(handoff): order the queue (`a9c9a9df0`)
- 2026-10-02  docs(backlog): AB-58 — the removed hourly alarm survived the deploy and fires into nothing (`57c517e67`)
- 2026-10-02  Owner asked 2026-10-02: deleted in namespace 285361-kuklajustritexjap-justriteerp (JustriteERP workspace) with aio rt rule delete erp-prices-hourly-on-timer and aio rt trigger delete erp-prices-hourly-timer; re-listed: only erp-schedule-heartbeat and events-retry-timer (and their rules) remain. Open: Demo Builder tools to list and delete undeclared triggers and rules
- 2026-10-02  docs(backlog): AB-58 — the leftover hourly alarm and its rule deleted on Justrite (`417b1b715`)
