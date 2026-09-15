# Site admin identity mismatch (GitHub email vs Adobe email)

Researched 2026-09-15. Web and public source only. No sign-ins, no writes.
The AEM Code Sync bot's own code is private; what it does is known only from
the public setup page and its history.

## Summary

**What most likely happened (likely, not proven).** Adobe's own setup page said,
until July 2026, that the default admin is "the primary email address set in the
GitHub account that just installed AEM Code Sync". The admin service matches
people by email. So the colleague's role most likely sits on his GitHub primary
email (personal). Demo Builder talks to the admin service as his Adobe identity,
which is a different email, so it gets 403.

Nobody can confirm this from outside. Reading the org's user list needs the admin
role he lacks. A second possibility cannot be ruled out: if he installed Code
Sync after 2026-07-20 and closed the new setup wizard without pressing Save, the
org may have no users at all (inference from the wizard code, below).

**Steps he can take**

| # | Step | Status |
|---|------|--------|
| 1 | Open github.com/settings/emails and note his primary email. If he changed it since installing Code Sync, the older one is the likely admin. | Page is standard GitHub. That the admin is this email: Adobe's page copy, not code |
| 2 | Sign in to the admin service with an account that has THAT email. `https://admin.hlx.page/login/kmanns/wire/main?idp=google&selectAccount=true` for a Gmail. Microsoft: `?idp=microsoft&tenantId=common`. | Redirects measured (302 to Google / Microsoft). Role match on a Google or Microsoft identity for a DA-backed site: **unverified** |
| 3 | Install the AEM Sidekick browser extension (the tools site cannot sign in without it). Open `https://tools.aem.live/tools/user-admin/index.html`, enter org `kmanns`, leave Site blank, Fetch Users, add his Adobe email with the `admin` role. | Tool, fields and Sidekick requirement verified in source. That it works for him: **unverified** |
| 4 | Back in Demo Builder, run Manage Site Access to confirm the 403 turned into 200, then Repair Site Configuration. | Existing extension flow |
| 5 | If 1-3 fail (no account with that email, or the org is empty): ask Adobe. The docs say "Contact an Adobe representative if you need a different admin user." | Documented |

Alternative to step 2, **unverified**: create or use a personal Adobe ID whose
email is his GitHub primary email, sign in to DA.live / Demo Builder with it,
then use Manage Site Access to add his work email.

Re-saving the Code Sync installation (the open item in EDS-16) would at best
open a SITE-level setup page for that one repository. It cannot add an org user
for an org that already exists (verified in source, Q4).

## Q1. How the initial admin is recorded

**Docs.** https://www.aem.live/docs/config-service-setup :
"the github.com user who added the AEM Code Sync App will be added as admin."
and "Contact an Adobe representative if you need a different admin user."
The docs do not say which email.

**Page copy (strongest evidence of WHICH email).** The setup page is served from
the public repo `adobe/helix-tools-website`, `widgets/bot-info/`. Its HTML at
commit `d8fa741` (2026-05-29), in force until 2026-07-20:

- "Made {{user}}* an admin."
- "We are using the primary email address set in the GitHub account"
- "that just installed AEM Code Sync as the default admin."
- Fallback: "We were not able to determine the user that installed AEM Code Sync."

Source: https://github.com/adobe/helix-tools-website/blob/d8fa741/widgets/bot-info/bot-info.html
The `{{user}}` value came from the `user` query parameter that the bot puts on the
redirect (`bot-info.js` at the same commit: `params.get('user')`). In that version
the bot wrote the admin server-side; the page only reported it.

**Current flow (since 2026-07-20).** Commits `8df7458` "feat(bot-info): add site
setup wizard (#397)" and `1e2c3f0` "multi-step setup wizard (#411)". Current source
at `main` = `66ea698`:
https://github.com/adobe/helix-tools-website/blob/main/widgets/bot-info/bot-info.js

- Auth is only the one-time key in the URL hash: `authorization: token ${token}`
  (`tokenClient`, lines 63-67). It is deleted after Save (`deleteApiKey`, 321-330).
- Query parameters: `org`, `site`, `user`, `url`, `new_org` (lines 521-528).
- Users step: the `user` value is only a pre-filled, editable row. Org users are
  seeded with it only if the org has none; site users only if the site has none
  (lines 150-162). The person can change or add emails before Save.
- The "Organization users" section shows only when `new_org=true` (line 150;
  HTML: "These users have access to the {{org}} organization, including all sites.").
- A new org cannot be saved without an org user: "Add at least one organization
  user before saving." (`wizard.js`, `usersError`).
- Save writes org users via `config/{org}/users.json` and site users via
  `config/{org}/sites/{site}/access.json` (lines 266-312).

**Inference, not verified.** Because the wizard seeds org users only when the org
has none and blocks Save until one exists, the bot most likely no longer writes an
org admin itself. If so, an install whose wizard was abandoned leaves the org with
no users. The bot code is private; this cannot be checked from here.

**Which GitHub email feeds `user`: not found in any code.** Only the page copy above
("primary email address"). Whether the bot uses the public email when the primary
is private: not found.

## Q2. Signing in to the admin service

**Measured (read-only GETs, no sign-in), 2026-09-15.**
`GET https://admin.hlx.page/login` lists: `login_google`, `login_microsoft`,
`login_adobe`, `login_adobe-stage` (each with a `_sa` select-account variant).
There is no GitHub sign-in.

`GET https://admin.hlx.page/login/kmanns/wire/main` → 302 to Adobe IMS
(`client_id=helix-admin`). With `?idp=google` → 302 to accounts.google.com.
With `?idp=microsoft&tenantId=common` → 302 to login.microsoftonline.com/common.
With `?idp=github` → falls back to Adobe IMS.

**Docs.**
- Admin API reference, authentication: https://www.aem.live/docs/admin.html#tag/authentication
  "you open /login in a browser, select the IDP you want to use"; the auth
  token comes back in the `auth_token` cookie. `/login/{org}/{site}/{ref}` is
  "Auto login ... Redirects to IDP corresponding the project setup".
- https://www.aem.live/docs/authentication-setup-authoring :
  "If using AEM or Document Authoring, they must be able to authenticate"
  "with their credentials using Adobe authentication." Google and Microsoft are
  listed for Google Drive and SharePoint sites.
- Role matching is by email or glob: "For each individual user or wildcard-domain"
  (same page). "If no mapping matches, the user will have no role; effectively
  always returning a 403 status code."

**Tools site sign-in needs AEM Sidekick** (verified in source): `utils/login.js`
"Install AEM Sidekick to sign in."; `blocks/profile/profile.js` opens
`https://admin.hlx.page/login/{org}/{site}/main`, adding `idp=microsoft&tenantId=common`
only in "ops mode" (Alt-click). No Google option in the tools UI: not found.

**Personal accounts.**
- Microsoft `common` tenant: "Users with both a personal Microsoft account and a work
  or school account" can sign in — https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc .
  Microsoft adds that the app must be configured for personal accounts; whether
  helix-admin is: not found.
- Google: the redirect carries no hosted-domain restriction in the part we read.
  That a personal Gmail completes sign-in: **unverified**.
- Whether a role keyed on a personal email is honoured when that email arrives
  through Google on a DA-backed site (whose docs say "Adobe authentication"):
  **not found / unverified**.

## Q3. Adding another admin once signed in

**UI.** User Admin tool, `https://tools.aem.live/tools/user-admin/index.html`
(HTTP 200; the old `labs.aem.live` URL 301s here).
Source: https://github.com/adobe/helix-tools-website/blob/main/tools/user-admin/index.html
Page text: "Manage users and their roles for your organization or site."
Site field help: "Leave blank to manage org-level users, or select a site"

Steps (from source, not exercised):
1. Install AEM Sidekick; open the tool.
2. Enter Organization; leave Site blank for org users (applies to all sites).
3. Fetch Users → prompts sign-in if needed (`AuthMode.PREFLIGHT_AND_RETRY`).
4. Add the email, tick `admin`, save.

What it calls (`tools/user-admin/user-admin.js`): org users →
`POST config/{org}/users.json` with `{email, roles}`; site users → read
`config/{org}/sites/{site}/access.json`, then POST it back rebuilt
(`buildAccessConfig`, which replaces the role lists wholesale).

**API.** Admin API reference (https://www.aem.live/docs/admin.html):
`POST /config/{org}/users.json` "Create new org user", body `{ "email", "roles" }`,
roles enum includes `admin`, `config`, `config_admin`, `author`, `publish`.
Site level (https://www.aem.live/docs/config-service-setup, "Update Access Control"):
`POST https://admin.hlx.page/config/{org}/sites/{site}/access/admin.json`.

Already measured in this repo (`.claude/skills/eds-publish-and-config/SKILL.md`):
the site access POST replaces the list, so read-merge-write; the caller needs the
admin role already; authorization is per org.

## Q4. Does changing the GitHub email, or re-saving Code Sync, change the admin?

- **Changing the GitHub email:** no evidence that anything re-syncs. Org users are
  stored as plain `email` strings (`orgConfigUser` schema, admin API reference).
  Anything that updates them on a GitHub email change: **not found**.
- **Re-saving the installation:** GitHub supports it in principle. "Redirect on
  update" lets an app send users to its Setup URL "after they update an
  installation" — https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url .
  Whether AEM Code Sync turns that on, and whether the bot mints a new key on
  update: **not found** (the EDS-16 test Khalil was asked to run answers this).
- **Even if it does:** for an org that already exists, the setup key is site-level
  and the page hides "Organization users" (`bot-info.js` lines 150 and 321-324:
  "The key lives at org level for new orgs, otherwise at site level."). So the best
  outcome is adding his Adobe email to that ONE site's users. It would not fix
  other sites in the org.

## Q5. Org-level vs site-level admins

- Org users: `config/{org}.json` → `users: [{id, email, name, roles}]`, also
  `GET/POST config/{org}/users.json` (admin API reference).
  The setup page describes them as having access "including all sites".
- Site users: `access.admin.role.{role}: [emails or globs]` inside the site config,
  written at `config/{org}/sites/{site}/access/admin.json`.
- Profiles can also carry `access.admin` for several sites:
  "Create Profile Configuration (applies to multiple sites)"
  (https://www.aem.live/docs/authentication-setup-authoring).
- `requireAuth: "auto"`: "enforces authentication as soon as a role mapping is defined"
  (same page).
- An org user with `admin` is the cleanest fix for the colleague: one entry covers
  wire, hardie and future sites.

## What an extension could detect or do

**Detect the mismatch (verified feasible).**
- `GET https://api.github.com/user/emails` returns `email`, `primary`, `verified`,
  `visibility` — https://docs.github.com/en/rest/users/emails .
  "OAuth app tokens and personal access tokens (classic) need the user:email scope".
- The `user` scope "includes `user:email` and `user:follow`" —
  https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps .
- The extension already requests `user`: `GITHUB_SCOPES` in
  `src/features/eds/services/types.ts:136`. So no new consent is needed.
- On a config 403, compare the Adobe IMS email with the GitHub email list. If the
  IMS email is not among them, say so plainly: the admin role was probably given
  to the GitHub primary email, and name it.

**Limits.**
- It reads the CURRENT primary email. The admin was set from the primary at
  install time, which may differ.
- It cannot read the org's user list without the role, so it cannot tell "role on
  another email" from "org has no users".
- It cannot grant anything itself: every grant needs an existing admin.

**Could do (unverified; each needs a live test before shipping).**
- Offer the two sign-in routes from the summary (Google/Microsoft via the tools
  site with Sidekick, or an Adobe ID on the GitHub email), then keep the existing
  403 → 200 poll as the proof.
- For new installs, tell the SC before they install Code Sync that the setup page
  pre-fills the GitHub email, and to change it to their Adobe email before Save.
  (Verified that the field is editable in the current wizard.)

## Open questions

- Which email the private bot puts in `user` today (primary? public?).
- Whether the admin service accepts a Google or Microsoft identity for a DA-backed
  site's roles.
- Whether AEM Code Sync redirects to setup on installation update (EDS-16).
- When kmanns first installed Code Sync (before or after 2026-07-20).
