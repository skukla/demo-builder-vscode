# Can GitHub tell us whether AEM Code Sync is installed on a repo?

**Date:** 2026-07-29
**For:** 123 — restoring the selection-time Code Sync check (see "Why this matters")
**Verdict:** **No.** Not with any token the extension can hold. Use AEM, without the poll.

## Why this matters

`eb6c4523` (Jan 14) checked the App at repo selection — "integrated GitHub App check
into repository selection step with LoadingOverlay spinner for immediate feedback."

`3b178875` (Jan 28) deferred that check for *existing* repos to mid-pipeline, after the
fstab.yaml push. Stated reason: "eliminates false 'App not installed' errors for existing
repos that haven't been configured with Helix yet."

That was a workaround for a classification bug, not a timing problem. An unconfigured repo
returns `404 [admin] no such site`, and the old classifier read that as "App not installed."
The same conflation, wearing a 401 instead, produced Jen's eleven false failures in July.
Both are fixed on `hotfix/beta.122` (`githubAppService.ts` now returns
installed / not-installed / **undetermined**).

So the reason for the deferral is gone and the ordering can be restored. The open question
was *which service to ask*.

## Method

Read-only probes with `gh` (account `skukla`, scopes `delete_repo, gist, read:org, repo,
user, workflow` — a **superset** of the extension's `repo, workflow`).

Controls:
- `skukla/b2b-tester` — EDS repo, Code Sync installed and serving
- `skukla/demo-builder-test` — EDS repo created for today's test, Code Sync **not** installed

## Findings

### 1. `GET /user/installations` → 403

> "You must authenticate with an access token authorized to a GitHub App in order to
> list installations"

Requires a **user-to-server token issued by a GitHub App**. VS Code's GitHub auth provider
issues an *OAuth app* token (`gho_`), which is a different type.

**This is a token-type limit, not a scope limit** — the probing token carries four scopes
the extension lacks and is refused identically. Adding scopes cannot fix it.

### 2. `GET /repos/{owner}/{repo}/installation` → 401

> "A JSON web token could not be decoded"

Requires a JWT signed with the App's private key. That key belongs to Adobe, and the
extension has no business holding it even if it could.

### 3. No indirect signal exists

| Signal | b2b-tester (installed) | demo-builder-test (not) |
|---|---|---|
| check-runs by app | `github-actions` only | none |
| commit statuses | none | none |
| `/repos/*/hooks` | 0 | 0 |

AEM Code Sync creates no check runs and no commit statuses, and GitHub Apps do not appear
as repo webhooks. Nothing distinguishes the two repos on the GitHub side.

### 4. The `aem.page` probe separates them cleanly — unauthenticated

    GET https://main--<repo>--<owner>.aem.page/scripts/aem.js

| Repo | Status |
|---|---|
| b2b-tester (installed) | **200** |
| demo-builder-test (not installed) | **404** |

Instant, no auth, no token. But **200 is decisive and 404 is not**: a 404 also covers
"installed but not yet synced" and "wrong default branch." Usable as a fast positive,
never as proof of absence.

## Conclusion for 123

Ask **AEM**, at selection time, and skip the code-sync trigger.

The only slow part of the current check is `triggerAndWaitForCodeSync` in
`checkGitHubAppHandler.ts` — up to 3 minutes of polling (`TIMEOUTS.LONG`, 30 attempts).
The status call itself is a single ~1s request that now classifies correctly. Give the
handler a flag to report without triggering, and the selection step gets an authoritative
answer fast enough for the LoadingOverlay. Leave the trigger where latency is acceptable:
mid-pipeline.

Shape:

1. Selection step calls `check-github-app` with the trigger suppressed → installed /
   not-installed / undetermined in ~1s.
2. not-installed → the existing install card, at the step where fixing it costs one click
   and zero commits.
3. undetermined → the actionable credential message; no install prompt, because no
   install fixes a credential AEM refuses.
4. Keep the mid-pipeline gate — it catches revocation between selection and setup, and it
   is the one that just proved out in the Extension Host.

Also reorder `storefrontSetupPhase2.ts`: the gate sits at line 118, *after* the fstab.yaml
push, Helix config, and quick-edit wiring. Moving it above the writes closes the
dirty-repo window. Cheap, independent of everything above.

## Unverified

- Whether a fresh template repo **with** the App installed but not yet synced returns 404
  or 200 from the status endpoint. Determines whether step 1 needs a short retry. Test by
  creating a repo, installing the App, and polling status from t=0.
- Whether the trigger-suppressed path changes behavior for repos Helix has never indexed —
  the 404 case is precisely what `3b178875` was working around, so it needs a live run
  before the ordering change ships.
