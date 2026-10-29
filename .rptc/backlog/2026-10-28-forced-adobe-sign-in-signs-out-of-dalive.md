---
id: PL-84
kind: fix
area: platform
needs: []
value: high
status: active
---

# Signing in to Adobe again also signs the SC out of DA.live, and nobody says so

Filed 2026-10-28, proven live that day.

## What happened

A FORCED Adobe sign-in (`aio auth login -f`, `runAdobeLogin(deps, true)` in
`src/features/authentication/services/adobeSignIn.ts`) cancels the stored DA.live sign-in
(an IMS token, client_id `darkalley`) long before its expiry. aio-lib-ims-oauth's
`authSiteUrl` sends the browser to Adobe's `/ims/logout/v1` first, which ends the browser
Adobe session the DA.live token belongs to.

Before the forced sign-in: IMS `validate_token` said valid, and the AEM org config read
answered 200. After it: IMS `valid:false reason:"invalid"`, AEM 403 `[admin] not
authorized` on every site, DA.live 403. A NORMAL (non-forced) Adobe sign-in left DA.live
working.

Forcing has to stay. An org or account switch needs it: IMS tokens are org-bound, and a
non-forced sign-in reuses the browser session and lands in the wrong org
(`.claude/skills/adobe-org-context`).

The cost, the same day: a storefront delete (scratch-1022) went 403 on every AEM call at
20:48:07, mid-run, because of this (EDS-69).

## The fix

After every forced Adobe sign-in, check the DA.live sign-in. When one was stored and IMS
accepted it before, and IMS refuses it after, tell the SC at once: "Signing in to Adobe
again also signed you out of DA.live." with the existing DA.live sign-in as the button.

- One seam covers every forced path: `runAdobeLogin` reads a watch just before
  `aio auth login -f` and again once it succeeds (`AuthenticationService.watchForcedSignIns`).
  That is the wizard's Adobe Setup, the Sign In command's "Sign in again", "Switch IMS
  Org" (dashboard, wizard, integrations, the org-mismatch guard), and the forced retry a
  normal sign-in falls back to.
- The check is the one DA.live sign-in reader (EDS-68), so nothing stored means no check
  and no prompt for an SC who never used DA.live.
- Where it is said (`daLiveSignedOutNotice.ts`): a notification with "Sign in to DA.live"
  at a button; the agent's `sign_in` gets `notices` + `next` in its result instead of a
  dialog; any other agent call says it in the chat narration, plus the notification.

## Shipped so far
