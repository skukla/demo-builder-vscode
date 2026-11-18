---
id: PL-103
kind: chore
area: platform
needs: []
value: med
status: backlog
---

# One Adobe sign-in handler for a screen's Sign In button

Filed 2026-11-18 from the beta.153 walk (findings F246 and F247). Owner asked whether sign-in was
being duplicated; it was, in a draft that was then removed, and the audit found one likely duplicate
already in the code.

## The four ways to start an Adobe sign-in

| Piece | Used by | Verdict |
|---|---|---|
| `ensureAdobeIOAuth` (`src/core/auth/adobeAuthGuard.ts`), check, VS Code dialog, sign in | about 15 flows, inside handlers | the canonical guard; keep |
| `handleAuthenticate` (`authenticationHandlers.ts:485`), message `authenticate` with `{force}` | the wizard (`WebviewClient.authenticate`), the Add Integration flow (`IntegrationsStep.tsx:194`) | likely the same job as the next row |
| `handleReAuthenticate` (`statusHandlers.ts:276`), message `reAuthenticate` | the dashboard, the integrations screen, Manage APIs, the Add Integration adapter | forced sign-in plus a status refresh; needs the open project |
| `handleForcedOrgSwitch` / `handleSwitchOrg`, message `switchOrg` | the dashboard banner, the wizard's pickers, Add Integration | the organization switch; a separate job, keep |

## The likely duplicate

`authenticate` and `reAuthenticate` are both "a screen's Sign In button". `reAuthenticate` forces
the sign-in only to get past a refused-but-unexpired token (its comment cites a colleague on beta.149,
2026-10-27). F247 now handles that inside the shared sign-in (`RejectedTokens`: a normal sign-in that
hands back a refused token runs forced), so the forcing in `reAuthenticate` may no longer be needed,
and a forced sign-in has a cost: it also signs the SC out of DA.live (PL-84).

## Verify before merging

- Read `handleAuthenticate`'s body: what it does after the sign-in, and whether it needs a project.
- Whether the dashboard's status refresh after `reAuthenticate` can be the screen's own re-read.
- Whether `reAuthenticate` still needs to force once F247 is live (try a refused token, live).

## What the merge would be

One handler, one message, registered wherever a screen offers Sign In; the screens send it; the
status refresh stays the dashboard's own. Not for beta.153: it touches the wizard and dashboard
sign-in.
