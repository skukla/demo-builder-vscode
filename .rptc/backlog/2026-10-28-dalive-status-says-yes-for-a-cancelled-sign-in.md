---
id: EDS-68
kind: fix
area: eds
needs: []
value: high
status: active
---

# The DA.live status still says signed in when IMS has cancelled the sign-in

Filed 2026-10-28. EDS-30 (`604743e70`) was meant to fix this; it did not.

## What happened

After a forced Adobe sign-in cancelled the DA.live token (PL-84), `get_auth_status` said
`dalive: { authenticated: true, expiresInMinutes: 1376 }` while IMS said the token was
invalid and every AEM and DA.live call answered 403.

Why EDS-30's check still said yes, read from the code it shipped: it made one
`HEAD admin.da.live/list/{org}/` and read only a 401 as a refusal (`serverVerdict` in
`daLiveOrgOperations.ts`: "403 → accepted, the org refused a credential it honoured").
DA.live answered the cancelled token with 403, not 401, so the status said accepted. It
also made no check at all when no DA.live namespace was pinned. The wizard's DA.live
indicator never asked anyone: it read the token's own expiry (`isAuthenticated()`).

Measured the same day: `GET https://ims-na1.adobelogin.com/ims/validate_token/v1?client_id=darkalley&type=access_token`
with `Authorization: Bearer <token>` answers 200 with `{valid, reason?, expires_at}`, and a
cancelled token answers 200 with `valid:false`. AEM's `admin.hlx.page/profile` answers 200
for a cancelled token (it only decodes it), so it is not a validity check.

## The fix

One reader, `DaLiveAuthService.checkSignIn()`, asks IMS (`daLiveSignInCheck.ts`):
`none` (nothing usable stored, no network call), `valid`, `refused`, or `unknown` (IMS did
not answer). It replaces the HEAD probe, which is deleted along with `isServerAccepted`.
Its callers: `get_auth_status`, the wizard's indicator (`handleCheckDaLiveAuth`), the
session guard (`ensureDaLiveAuth`, which no longer needs an org), the forced-sign-in watch
(PL-84), and the config service's "expired or not your org?" check after a 401 (EDS-54).

When IMS cannot be reached, each caller says what it does:
- `get_auth_status`: `authenticated: 'unknown'` with a note, neither yes nor no;
- the wizard's indicator and `ensureDaLiveAuth`: carry on as signed in, so a network blip
  never blocks work; a real refusal still stops the first DA.live call that meets it;
- the forced-sign-in watch: says nothing;
- a storefront repository delete (EDS-67): keeps the repository.

Still on the local expiry check, not this reader: the agent tool guards
(`edsToolGuards.ts`, `contentAuthoringTools.ts`, `createProjectTool.ts`). Moving them
would add an IMS call to every DA.live tool call; not done here.

## Shipped so far
- 2026-10-28  fix(eds): a storefront delete removes the site's code, and stops when DA.live is signed out (`a2072e04f`)
