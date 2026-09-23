---
id: EDS-16
kind: fix
area: eds
needs: []
value: high
status: gated
waiting-on: the reporter re-saving his Code Sync installation to show whether GitHub reopens the AEM setup page with a key
---

# The "no admin role" remedy sent people to a page that cannot grant anything

Filed 2026-09-14 from a colleague's report on two of his own EDS sites. Republish
ended with the BYOM 403 message. Following it, he ran Manage Site Access and Repair
Site Configuration; the AEM setup page they opened said "We couldn't load your
configuration for editing", with console
`GET https://admin.hlx.page/config/.json Failed to fetch`.

## What was measured

- Opening the bare `https://tools.aem.live/bot/setup` printed in the 403 message
  reproduces his console exactly: empty org and site, so the page requests
  `config/.json`.
- Opening the full deep link for his site shows the same alert. The page cannot
  load or grant without more than the query string.
- The page's source (`/widgets/bot-info/bot-info.js`) authenticates only with a
  one-time setup key from the URL hash (`#token=…&token_id=…`), which the AEM Code
  Sync bot mints during the GitHub App install callback. Its admin client sends no
  other credential.
- aem.live's Code Sync docs: the GitHub user who added the app becomes admin;
  "Contact an Adobe representative if you need a different admin user."

## The fix (`fix/site-access-remedy`)

Removed the link builder, the repair result's `setupUrl`, the log redaction that
existed only for that link, and every mention of the page in user copy. Manage Site
Access names readable org admins, otherwise opens the Code Sync app on GitHub
and polls for the 403 → 200 flip; if it never flips it names the GitHub user who
installed Code Sync, or Adobe.

## Still open

Whether saving an EXISTING Code Sync installation's repository access sends GitHub
back to the setup page with a key. Testing it is a cloud write on a sacrificial
repo and needs the owner's go-ahead. If it does not, the GitHub button in Manage
Site Access is also a dead end and should be removed.

## A cause Demo Builder can detect (2026-09-15)

Code Sync most likely gave the admin role to the primary email of the GitHub
account that installed it, while Demo Builder signs in to Adobe as the SC's Adobe
email, so the site refuses it. Evidence and the untested parts are in
`.rptc/research/site-admin-identity-mismatch/research.md`.

On a refusal, `listSiteAccess` reads the GitHub account's emails
(`GET /user/emails`, covered by the `user` scope Demo Builder already asks for)
and compares them with the Adobe email. When the role may sit elsewhere, Manage
Site Access says so, names the addresses, and offers AEM's User Admin tool, where
their owner can add the Adobe email as an org admin. It then polls for the grant.
`get_site_access` returns the same `identityMismatch`, so an agent sees it too.

## Today's primary email was the wrong question (2026-09-23)

The first version compared only the GitHub account's CURRENT primary email. The
role is minted from whatever was primary AT INSTALL TIME, and that cannot be read
back — so an account whose primary was changed to the Adobe address afterwards
gets no explanation at all. That is exactly the reporter's account: his screenshot
shows the Adobe address primary and a personal one verified beside it, so the
check written for him would have stayed silent.

`findAdminIdentityMismatch` now answers whenever ANY verified GitHub address is not
the Adobe identity, ordered primary-first, and says which case it is: the primary
differs, or the primary matches and an earlier address probably holds the role.
Unverified addresses are ignored — GitHub never makes one primary.

Unverified still: that the role really sits on a GitHub-side email, and that
signing in to AEM with a Google or Microsoft account on that address is accepted.
Changing the GitHub primary email now will not move a role already given out.

## Shipped so far

- 2026-09-14  fix(eds): stop sending no-role users to a setup page that cannot grant (`bba76c2a5`)
- 2026-09-14  Next step handed to the reporter (he installed Code Sync himself): on his second site, re-save the Code Sync installation on GitHub (no-op Save, else remove and re-add the repo) and report whether GitHub opens tools.aem.live/bot/setup with #token=. If it does, note who is already under Site users, add his Adobe email, run Manage Site Access then Repair Site Configuration, and add those steps to the Manage Site Access message. If it does not, remove the GitHub button and point to Adobe. His answer replaces the sacrificial-repo test.
- 2026-09-15  feat(eds): explain a refusal caused by the GitHub primary email (`069c05647`)
- 2026-09-15  Merge fix/site-access-remedy: a site that refuses its owner says why and what to do (`ad76d8898`)
