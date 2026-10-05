---
id: EDS-30
kind: fix
area: eds
needs: []
value: med
status: backlog
---

# The sign-in status says DA.live is signed in when the sign-in has expired

Filed 2026-10-05 from the first EDS-24 run on Justrite. `get_auth_status` answered
`"dalive":{"authenticated":true,"orgName":"skukla"}`; minutes later every DA.live call in
Republish failed with "Authentication expired. Please log in again." and a 401 on the org
config. The status reports that a stored sign-in EXISTS, not that it still works (the Adobe
entry in the same answer carries `expiresInMinutes`; the DA.live one carries nothing).

An agent that reads the status before a cloud write (as the loop rails and the tool
descriptions tell it to) proceeds on a false yes, and the person is told nothing is needed
from them. Memory `reference_github_auth_vscode_managed` records the mirror-image trap for
GitHub (false = no STORED token, not signed out).

## The fix

Make the DA.live entry mean "usable now": check the stored token's expiry (and report
`expiresInMinutes` like Adobe's), or make one cheap authenticated read. Whatever the UI's
DA.live sign-in indicator reads should agree with it — find that reader and use one
answer for both. Test: an expired stored token reads as not authenticated.
