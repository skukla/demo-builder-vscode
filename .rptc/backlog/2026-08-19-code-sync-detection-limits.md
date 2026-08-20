# What "AEM Code Sync installed" can and cannot be known from

**Filed:** 2026-08-19, from the `kukla-bodea` field report.
**Severity:** low as it now stands — the fabrication is contained (`fa7d2b4f`).
Filed so nobody re-derives this from scratch, and so nobody "fixes" the detector
by reaching for an API that cannot answer.

**Both proposals are now closed.** B shipped 2026-08-20; A was rejected the day
it was raised. Nothing here is outstanding work — the rest is reference. Section A says why the 401/403 idea
was rejected, so it does not get re-proposed.

## The one endpoint

`githubAppService.checkHelixStatus` is the only source. Everything —
the wizard's Code Sync sub-step, `resolveAppInstallation`, `storefrontSetupPhase3`'s
halt — reads this:

```
GET https://admin.hlx.page/status/{owner}/{repo}/main?editUrl=auto
```

It answers on **two levels**, and conflating them is where every bug in this
area has come from.

### Outer HTTP status — about the SITE

| Outer | Means | Retryable? |
|---|---|---|
| `200` | Helix knows this site; read the body | — |
| `404` + `x-error: [admin] no such site` | Helix has never heard of the repo | No |
| `401` / `403` / `5xx` / timeout | Helix declined to answer | Yes — `undetermined` |

Measured 2026-08-19, unauthenticated, with a control:

```
skukla/kukla-bodea      -> 404  x-error: [admin] no such site
skukla/team-bodea-demo  -> 401  x-error: [admin] not authenticated
```

The 404 arrives **before** authentication. A site Helix knows answers 401
instead. That difference is what makes the two distinguishable at all, and it is
why "no such site" must never be read as a credential problem.

### Inner `code.status` — about the APP

Present only on an outer 200. **This is the real detector:**

| Inner | Means |
|---|---|
| `200` | code sync working |
| `400` | initializing |
| `404` | Helix knows the repo and has **no code sync** for it — the App is absent |
| `403` | Helix declining, inside a 200 body — NOT a verdict |

So "AEM Code Sync Verified" in the wizard is a true, measured statement: Helix
successfully synced code from that repo. Stronger than "the App is installed",
and worth keeping.

## The gap

An outer 404 has **no body**, so there is no inner status to read — and
`checkHelixStatus` returns `isInstalled: false` regardless. That is the only
place the verdict is invented, and it has three possible causes:

1. the repo's default branch is not `main` (nothing targets any other ref)
2. the repo is not an Edge Delivery storefront
3. the App is not installed

`siteUnknownReason.ts` separates (1) and (2) from what we can verify, so the
inference is only reached when both pass. **Do not remove that and go back to
asserting (3) from an outer 404.**

## Why no other API closes it

Both measured 2026-08-19; do not re-try these hoping for a different answer:

- `GET /user/installations` → **403** *"You must authenticate with an access
  token authorized to a GitHub App in order to list installations"*. It needs a
  user-to-server token issued by the App. The extension holds an OAuth App token
  (`gho_`).
- `GET /repos/{owner}/{repo}/installation` needs the App's own JWT, signed with
  its private key. `aem-code-sync` is **Adobe's** App; we do not have it and
  will not get it.
- `GET /repos/{o}/{r}/commits/{ref}/check-runs` and `/statuses` — Code Sync
  posts neither. (On `kukla-bodea` this returned `422 No commit found for SHA:
  main`, which is how the missing branch was found.)

Scopes held: `repo`, `user`, `read:org`, `delete_repo`, `workflow`
(`GITHUB_SCOPES` in `eds/services/types.ts`). No scope closes this — it is a
token-TYPE limitation, not a permission one.

## What would actually close it

Only Adobe. Either an admin endpoint that reports App installation independently
of site registration, or `/status` distinguishing "unknown repo" from "known
repo, no App" in the outer status. Worth raising with the Code Sync team if this
keeps costing field time; not something this repo can build.

## Prior art: `adobe-commerce/storefront-tools` reached the same wall

Researched 2026-08-19 against that repo at `38d124b`. Adobe's own DA.live-hosted
site-creator **deleted its Code Sync verification** three weeks earlier
(`fbae1c3`, 2026-08-05) and replaced it with a fixed 7-second wait:

```js
// Code Sync install can't be verified without the user's own admin.hlx.page
// credentials, so trust the user's confirmation and give the install a
// few seconds to finish registering before we start hitting the code bus.
await new Promise((resolve) => { setTimeout(resolve, 7000); });
```

**Their constraint is NOT ours, and this is the part to get right before copying
anything.** They are a Cloudflare Worker calling `admin.hlx.page` with no user
credential, so 401 and 403 are indistinguishable from "still installing". This
extension holds the user's GitHub OAuth token and sends it as `x-auth-token`
(see `checkHelixStatus`), which is exactly why the inner `code.status` is
readable here and not there. **Do not adopt the fixed wait** — for us it trades a
real signal for a timer.

What their work DOES give us:

1. **Independent corroboration of the endpoint semantics.** `worker/aem-proxy.js`
   (from `6b8c1dd`), on a different endpoint —
   `admin.hlx.page/code/{org}/{repo}/main/scripts/aem.js`:

   > A 404 means Helix has no site config yet (Code Sync not installed/synced).
   > A 401/403 means the site config already exists but access is restricted,
   > which still confirms Code Sync has synced the repo.

   Same 404-vs-401 split measured above on `/status`, reached separately. Its
   commit message names the cause, which is our own trap: *"aem code sync
   installation now allows adding users to site config access. If defined, code
   sync check WILL return 401/403."* — the `access.admin` role that
   `catalogPrewarmService` already documents closing the admin API.

### A. Treat an outer 401/403 as site-exists — PROPOSED AND REJECTED, 2026-08-19

Proposed here after reading their `worker/aem-proxy.js`, then rejected the same
day on a second look. **Do not re-propose it without reading this section.**

The proposal was: we classify an outer 401/403 as `undetermined` and retry;
their worker treats it as proof the site exists; adopt theirs.

It was pattern-matching on a shared status code without checking that the
situations match. They do not:

| | storefront-tools | this extension |
|---|---|---|
| How the call is made | anonymous — no user credential | authenticated (`x-auth-token` + admin bearer) |
| What a 401/403 means | "the site is there, you may not see it" | "we sent a credential and it was refused" |

Their reading is sound *because* they never presented a credential. Ours would
be a different fact wearing the same status code.

And it buys nothing even if adopted. Concluding the site exists still leaves
`code.status` unreadable, so it says nothing about the App — it would add a
"site exists, App unknown" state that no caller can act on differently.
Meanwhile `undetermined` already produces a credential-specific message through
`buildUndeterminedAppCheckError`; the generic "Adobe did not answer" wording
that prompted all of this came from the 404 path, fixed in `fa7d2b4f`.

Zero gain, and it edits the one classifier with a documented field failure
behind it — `appInstallationResolver`'s docblock records a user told **eleven
times** to install an App that was already installed, caused by over-reading
precisely this refusal.

**B. Gate on the install click — SHIPPED 2026-08-20.** `templates.js:786` disables their Continue
button until the install link has been clicked:
`?disabled=${loading || !installLinkClicked}`. It turns "the user probably
installed it" into "the user at least opened the install page" — the honest bar
for something we cannot verify.

**What it actually fixes.** On the existing-repo path a user with a missing App
can walk past the wizard's install prompt, hit Create, and be halted at Phase 3
— AFTER Phase 1 reset the repo and Phase 2 wrote to it. That breaks the "learn
before your repository is written to" guarantee, which is the whole reason the
check was moved earlier on 2026-08-06.

**Why a click and not a block.** Blocking on the check was considered and
rejected: our signal is unreliable, and blocking wrongly leaves a user with no
way forward, while a click-gate costs them one click and a look at GitHub. Same
early warning, no stranding — see `computeCodeSyncValid`'s own comment on why
existing repos deliberately do not gate on a conflated answer.

Scope: only when the check says needs-install, only on the existing-repo path
(new repos already gate on real verification, which is stronger), and moot once
the check comes back verified. For their equivalent existing-repo case they show
only a note: *"Ensure that the AEM Code Sync app is installed and has completed
its initial deployment before continuing."*

### Noted, different question

Their `create-site.js` calls `deleteFstab` after install — *"fstab.yaml is
superseded by the EDS Configuration Service after code sync installs"* — while
our pipeline pushes one. That may be a real divergence in the Helix 5 model.
Out of scope here; do not fold it into A or B.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-19-code-sync-detection-limits.md` before touching
> anything that decides whether AEM Code Sync is installed. Re-measure the two
> `admin.hlx.page/status` calls first — WITH the control, since one repo's
> answer alone proves nothing. The inner `code.status` is a real detector and
> should keep being used; the outer 404 is not, and `siteUnknownReason.ts` is
> what stops it being read as one. If you are here to add a GitHub-side check,
> read "Why no other API closes it" first — both endpoints were tried.
