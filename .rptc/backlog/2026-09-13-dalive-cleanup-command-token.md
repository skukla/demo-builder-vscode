---
id: EDS-15
kind: fix
area: eds
needs: []
value: low
status: backlog
---

# "Cleanup DA.live sites" builds its DA.live calls on the Adobe token DA.live refuses

Filed 2026-09-13, out of the shareable-demo program's live run (EDS-13a, step 07).

## What was measured

The agent's DA.live tools (`list_dalive_sites`, `cleanup_dalive_site`) built their
`DaLiveOrgOperations` / `DaLiveContentOperations` on the Adobe IMS token from
`aio` sign-in, "mirroring the cleanup command's wiring". Against the running
extension on 2026-09-12, with a valid IMS token (23 hours left):

- `list_dalive_sites` for the owner's org answered **zero** sites. The same call on
  the DA.live session's token answered six.
- `cleanup_dalive_site` on a site the reset tool had written to minutes earlier was
  refused: "Access denied when trying to list directory" (403).

The two agent tools were switched to the DA.live session first, IMS as the fallback
they had (`cloudResourceTools.ts`, commit `eb8c1ec15`), and worked.

## What this item is about

The human command the tools were mirroring, `cleanupDaLiveSites.ts`, wires the IMS
token the same way (`authService.getTokenManager().inspectToken()` → a token
provider handed to `DaLiveOrgOperations`, `DaLiveContentOperations` and
`DaLiveConfigService`). Nothing in the live run drove that command, so whether it
works against DA.live today is **unknown**, not known-broken: the IMS token may be
accepted for some accounts or orgs and not others. The two paths are one wiring
decision, and they now disagree.

## To settle it

Run the command in a Dev Host with both sign-ins present and read what the org
listing answers. If it lists nothing or refuses, give it the same DA.live-first
provider the tools use (a shared `daLiveTokenProvider(ctx)` would end the
duplication). If it works, write down why the IMS token is accepted there and not
from the tools, so the two do not drift again.

## Not blocking

The agent tools work. Project deletion's own cleanup (`resourceCleanupHelpers.ts`)
was not measured either and belongs in the same check.

## Shipped so far

- 2026-09-13  chore(backlog): file the DA.live cleanup command's token question (`790a6545b`)
