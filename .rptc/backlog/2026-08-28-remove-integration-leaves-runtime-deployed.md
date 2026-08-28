---
id: AB-7
kind: fix
area: app-builder
needs: []
value: high
status: backlog
---

# remove_integration reports success while leaving deployed code running

Found 2026-08-28 by the ERP journeys' teardown run — the round-trip
discipline's biggest catch so far, and a direct violation of the idempotency
goal's worst form: **success that lies**.

## What was measured (teardown session, bodea)

`remove_integration` answered success for both the shell ERP app and the
starter-kit integration, and the manifest went clean — but the teardown
agent then listed the Runtime namespace directly and found **most of the
deployed code still running**: the shell app entirely, and 12 packages from
the starter kit. It hand-deleted 15 packages (every action) plus the shell's
saved state-store data, then re-verified the namespace empty. It also found
and removed a leftover `crm-integration` package from the ORIGINAL August
ERP journey — this has been leaking for weeks, invisibly, because nothing
ever checked Runtime after a remove.

The old integration URLs served real responses until the hand-cleanup; after
it they 404.

## Why this happens (hypothesis — VERIFY before fixing)

`remove_integration`'s undeploy presumably runs `aio app undeploy` against
the component's local `app.config.yaml` — which removes only what the
CURRENT config declares. Anything the agent (or an earlier build) deployed
under other package names, or actions added after the config was last read,
survives. The kit's own uninstall handles its eventing but apparently not
all its Runtime packages. UNVERIFIED — read
`appBuilderComponentRunner`/`appManagementUninstaller` and reproduce before
building anything.

## The fix's shape (per the idempotency principle)

Removal must VERIFY, not assume: after undeploy, list the namespace's
packages that belong to this integration and delete stragglers (or at
minimum report them honestly instead of answering clean success). "Reported
success but quietly left code running" is the exact failure mode the owner's
reversibility principle names.

## Evidence

- Teardown session stream (scratchpad `teardown-run/`), 2026-08-28, 34
  turns, $3.77 — the hand-cleanup and re-verification are all in the route.
- The zero-state check now passes only BECAUSE the agent hand-cleaned;
  without its own Runtime listing the leak would have shipped again.

## Shipped so far

- 2026-08-28  FIX SHIPPED (2b5be4ce0), live proof pending upstream: removeAppBuilderComponent now lists the namespace after undeploy and deletes leftovers it can attribute EXACTLY (declared config packages incl. $include'd extension configs + the derived isolation package); unattributable packages never touched; unlistable namespace answers verified:false. Unit-proven with argument-asserted tests (6 cases incl. the exact leftover-delete command and the mesh exclusion); full suite 15,229 green. LIVE verification attempted twice 2026-08-28 and blocked by an Adobe Console outage (ERROR_GET_SERVICES_FOR_ORG 500, two request ids, 'retry later' template) — add_integration cannot create the fixture. The next journey run (or any add/remove once Console recovers) is the live proof; the runner's zero-check epilogue captures it automatically.
