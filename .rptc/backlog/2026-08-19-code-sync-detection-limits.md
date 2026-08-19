# What "AEM Code Sync installed" can and cannot be known from

**Filed:** 2026-08-19, from the `kukla-bodea` field report.
**Severity:** low as it now stands — the fabrication is contained (`fa7d2b4f`).
Filed so nobody re-derives this from scratch, and so nobody "fixes" the detector
by reaching for an API that cannot answer.

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

## Kickoff prompt

> Read `.rptc/backlog/2026-08-19-code-sync-detection-limits.md` before touching
> anything that decides whether AEM Code Sync is installed. Re-measure the two
> `admin.hlx.page/status` calls first — WITH the control, since one repo's
> answer alone proves nothing. The inner `code.status` is a real detector and
> should keep being used; the outer 404 is not, and `siteUnknownReason.ts` is
> what stops it being read as one. If you are here to add a GitHub-side check,
> read "Why no other API closes it" first — both endpoints were tried.
