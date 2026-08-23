# Config Service admin grant — foolproof, verifiable

**Filed:** 2026-08-14 (from the field-b2b-demo triage; requested by the maintainer mid-fix)
**Status:** SUPERSEDED 2026-08-14 — steps 01–04 shipped; see `overview.md`.

> Everything below is the PRE-implementation record, kept as a dated snapshot of
> what was known before the work started. Statements in the present tense — "the
> extension has NO grant mechanism", "does NOTHING programmatic here" — describe
> the state *before* this plan, not today. The bootstrap deep link also changed
> during implementation: this document proposes the GitHub App install settings;
> the code ships `tools.aem.live/bot/setup`.

## Problem

A user whose repo has AEM Code Sync installed can still be refused every
`admin.hlx.page/config/*` read and write with `403 [admin] not authorized` — the
admin role is per-Adobe-identity per-namespace, minted at Code Sync *install*
time, and an old install can predate the role bootstrap or the user's current
identity association. Observed on `fieldorg/field-b2b-demo` (2026-08-13):
Helix bulk publish and DA.live accepted the same IMS token that `/config/*`
refused; the repo is hers and Code Sync was verified installed. The failure was
silent for months (registration was a warning) until the BYOM overlay made the
config entry load-bearing for PDPs. Same class as the Jen/Khalil triage that
produced `configServiceProbe.ts`.

Today the extension has NO grant mechanism — nothing writes the Helix access
config. The only remedy is "re-install Code Sync", delivered as prose.

## The bootstrap constraint (settled 2026-08-14 — read before designing)

**A grant needs an existing admin. Nobody can grant themselves.** The write is
authorized by the same `[admin]` layer that refuses the read, so a user who gets
403 on `GET config/{org}/sites/{site}.json` cannot POST that site's
`access/admin.json` either. Any design where "republish self-heals the 403" is
asking the extension to escalate its own privileges — it cannot exist.

That splits the feature into three cases, and only the first two are ours:

| Case | Who runs it | What the extension does |
|---|---|---|
| **New site** (creating user installs Code Sync → role minted) | the creator | POST the grant explicitly at registration instead of relying on the install side effect, and add teammates. Immunizes every new site. |
| **Existing site, caller IS admin** (fixing a teammate) | an admin | Read roster → "add user" → POST → re-read as the oracle. The self-serve path for a whole team. |
| **Existing site, caller is NOT admin** (the field SC) | nobody in-app | Cannot be fixed programmatically from that session. Extension's job is to say so precisely and route to the human path. |

Today the extension does NOTHING programmatic here — the role arrives purely as a
side effect of the user's own Code Sync install, which is why new projects work
and the field SC's does not. Evidence: the install URL is only surfaced for
`repoMode === 'new'` (`RepoSelectionInline.tsx`), and the 403 propagation retry
is gated on `repoMode === 'new'` (`storefrontSetupPhase3.ts`) — an existing repo
with a 403 was assumed permanently broken, which is exactly the field SC's case.

**Open, and it decides the field SC's self-serve path:** does `tools.aem.live/bot/setup`
authorize its Users step off the *caller's* admin role, or off the GitHub App
installation (which would let a repo owner with no role bootstrap themselves)?
Cannot be answered from an account that already holds admin. Cheapest test: have
the affected user open the setup tool on their own site and report whether the
Users step saves.

## Shape (three legs, each verifiable)

1. **Verify** (exists): `configServiceProbe` — GET site config with the user's
   token; 200 = role held, 403 = not. This is the oracle every other leg closes
   the loop with.
2. **Grant** (new): when the CURRENT identity holds admin (200), write the
   namespace/site access config adding another user's email to the admin role —
   "grant teammate@example.test admin on fieldorg". Verify by reading the config back
   and finding the email. This is how a teammate or the original installer
   repairs someone else's access without touching GitHub.
3. **Bootstrap** (new, the field SC's case — nobody reachable holds admin): only a Code
   Sync (re)install mints a role. Make it foolproof: deep-link to the repo's
   AEM Code Sync installation settings (uninstall → install under the user's
   GitHub account, with their Adobe session current), then POLL the config read
   until it flips 403→200 (mirror `registerSiteConfig`'s 30–90s
   backoff). The poll is the verification — the flow does not end on "done
   clicking", it ends on a 200.

Surface: a remedy action next to the BYOM 403 warning + a `diagnose`/MCP tool
step, so both humans and agents can run it.

## Spike findings so far (2026-08-14)

**Doc-confirmed** (aem.live/docs/config-service-setup, fetched 2026-08-14):

- The grant endpoint is real and site-scoped:
  `admin.hlx.page/config/{org}/sites/{site}/access/admin.json`
- Schema: `{ "role": { "config": ["bob@acme.org"] } }` — role lists keyed by role
  name, values are emails. (Doc example uses role `config`; the tools.aem.live
  setup UI shows an `admin` role chip — the live role taxonomy still needs the
  probe below.)
- Bootstrap, verbatim mechanism: "the github.com user who added the AEM Code Sync
  App will be added as admin" — at ORG creation. Old orgs/sites created before
  this flow never minted a role, which is the the field SC case.
- tools.aem.live/bot/setup exposes this as its "Site users" step (observed
  2026-08-14, `skukla/bodea-source`): + Add user → email + role chips; saving
  with 0 users is valid (org-level admins retain access), and the tool's own log
  works against `admin.hlx.page/config/{org}/sites/{site}.json`.

**Live-verified 2026-08-14** (against `skukla/bodea-source`, DA.live IMS bearer,
admin@example.test = org admin):

- **Org roster confirmed**: `GET config/{org}.json` → 200 with
  `users: [{id, email, roles: ["admin"]}]` — the install-minted admin is a
  literal roster entry. (`config/{org}/access/admin.json` and
  `config/{org}/access.json` both 404 — the org roster IS `config/{org}.json`.)
  The field SC's 403 = their email absent from `config/fieldorg.json` users.
- **Site access read confirmed**: `GET config/{org}/sites/{site}/access/admin.json`
  → `{role: {...}, requireAuth: "auto"}`; the same block is inlined in the site
  config as `access.admin` (site config `version: 6`).
- **Site grant WRITE confirmed**: `POST config/{org}/sites/{site}/access/admin.json`
  with body `{"role":{"admin":["user@adobe.com"]}}` → HTTP 200, echoes the new
  state; independent GET read-back persists. Role name `admin` accepted at site
  level. This is the extension's grant leg, verbatim.
- Auth: plain `Authorization: Bearer <DA.live IMS token>` — the same token
  `ConfigurationService` already holds. No new credential plumbing needed.

**Still open** (needs a second identity / sacrificial repo):

- POST replace-vs-merge semantics for the role object (determines the remove-user
  call; probe: POST `{"role":{}}` and read back — likely run 2026-08-14, record
  the result here).
- Whether a SITE-level `admin` role suffices for `PUT config/{org}/sites/{site}.json`
  (what the field SC's republish needs), or whether the org roster entry is required —
  and if org-level, whether `POST config/{org}.json` with an appended user works
  the same way (do NOT test mutations on a live shared org).
- Does a Code Sync re-install re-mint the org roster entry for an OLD repo (the
  load-bearing assumption in the shipped 403 message)?
- What the 403 on the access write itself looks like for an unauthorized caller,
  so the grant leg can classify its own failure.

## Pointers

- `src/features/eds/services/configServiceProbe.ts` — the verify leg + the
  triage's empirical record
- `src/features/eds/services/configurationService.ts` — registerSite/update,
  where an inline access block would land
- `src/features/eds/services/siteConfigRegistrar.ts` — `CONFIG_SERVICE_PROPAGATION_DELAYS_MS`,
  the propagation backoff the bootstrap poll mirrors (was `configServiceRetry.ts`,
  deleted 2026-08-14 when the reset path moved onto the shared registrar)
- `.claude/skills/eds-publish-and-config/SKILL.md` — the 403 gotcha entry
  (updated 2026-08-14 with the install-grants-role mechanism)
