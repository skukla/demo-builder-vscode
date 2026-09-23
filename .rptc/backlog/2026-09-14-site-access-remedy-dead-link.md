---
id: EDS-16
kind: fix
area: eds
needs: []
value: high
status: built
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

## Answered 2026-09-23: what re-saving the Code Sync app does

The reporter removed one of his repositories from the AEM Code Sync GitHub App and
re-added it. Both halves of the question came back, and they point opposite ways:

- **It DOES land on Adobe's admin tools, already signed in** — the page reads "AEM
  Code Sync registration updated" and the Admin Tools menu is available.
- **It does NOT re-mint the admin role.** Manage Site Access refused the same
  account straight afterwards. His GitHub primary email had already been changed to
  his Adobe one, so if re-registration re-minted against today's primary this would
  have granted it. It did not.

**And the tools it lands on refuse him too.** User Admin, asked for the org's users
with the site left blank, answered:

```
403  GET https://admin.hlx.page/config/kmanns.json   [admin] not authorized
```

That is the SAME gate as the config read — `configServiceAccess.ts` says so at the
top of the file, and this is it measured. The admin tools carry the identity the
user is already signed in with, so **there is no self-serve route at all**: a user
refused the read is refused the roster and the grant.

What is left is an account that already holds the role signing in and adding them,
or Adobe.

**RESOLVED 2026-09-23.** A full uninstall and reinstall of the AEM Code Sync GitHub
App wrote the missing roster entry within the minute:

```
"users": [{ "id": "…", "email": "<his adobe address>", "roles": ["admin"] }]
"lastModified": "2026-09-23T20:18:41Z"
```

The org config had existed since 9 July at version 10, carrying EIGHT expired
`helix-bot setup-wizard (admin, 30m)` keys — one minted that same afternoon by the
repo-level re-add. So every earlier attempt had reached Adobe and done something;
none of them had touched `users`.

| | mints a 30-min admin key | writes the `users` roster |
|---|---|---|
| Re-saving a repository on an existing installation | yes | no |
| Uninstalling the app and installing it again | yes | **yes** |

Both report "AEM Code Sync registration updated", which is why the failing one was
indistinguishable from the fix.

**Two things this killed that were written down as likely.** That the role sat on
the GitHub primary email from install time — he signed in as that address and was
refused identically; the roster held nobody. And that a 403 meant the org existed:
an org admin reading a made-up org name got the same 403, so it proves nothing.

**What shipped in response:** `noAdminRoleRemedy.ts` states the fix once and the
four surfaces that report this refusal compose it — the BYOM overlay failure, the
config probe, Manage Site Access and its poll, all of which were wrong at the same
time because each kept its own copy. Manage Site Access offers the GitHub settings
page (the app's own page cannot uninstall) and drops the AEM User Admin route,
which was measured to refuse the same identity. `adminIdentityMismatch` stopped
naming an address to go and use and now warns that the primary email must be the
Adobe one BEFORE reinstalling, or the role is minted for the wrong address.

## Shipped so far

- 2026-09-14  fix(eds): stop sending no-role users to a setup page that cannot grant (`bba76c2a5`)
- 2026-09-14  Next step handed to the reporter (he installed Code Sync himself): on his second site, re-save the Code Sync installation on GitHub (no-op Save, else remove and re-add the repo) and report whether GitHub opens tools.aem.live/bot/setup with #token=. If it does, note who is already under Site users, add his Adobe email, run Manage Site Access then Repair Site Configuration, and add those steps to the Manage Site Access message. If it does not, remove the GitHub button and point to Adobe. His answer replaces the sacrificial-repo test.
- 2026-09-15  feat(eds): explain a refusal caused by the GitHub primary email (`069c05647`)
- 2026-09-15  Merge fix/site-access-remedy: a site that refuses its owner says why and what to do (`ad76d8898`)
- 2026-09-23  Re-registration measured on a reported site: opens Adobe's admin tools signed in, does not re-mint the role
- 2026-09-23  fix(eds): look at every verified GitHub email, not only today's primary (`b56fe547e`)
- 2026-09-23  docs(eds): stop naming a colleague in a public repo (`39eb6026b`)
- 2026-09-23  docs(eds): record how a site that refuses its owner is fixed (`25fe0d57b`)
- 2026-09-23  fix(eds): tell a refused user the fix that actually works (`7f764dbce`)
- 2026-09-23  feat(eds): state the no-admin-role fix in one place (`5dbcf6304`)
