---
id: EDS-23
kind: fix
area: eds
needs: []
value: high
status: built
---

# An inner code status 400 can mean "the App is not on this repository", and the check calls it installed

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-09-30 from the AB-53 rebuild, where a project created through `create_project`
reported "AEM Code Sync verified" and "Code synchronized", and then served a storefront with no
code: `config.json`, `scripts/scripts.js` and `fstab.yaml` all 404 on
`main--kukla-justrite--skukla.aem.live` while the DA.live pages published fine.

## What was measured (2026-09-30, skukla/kukla-justrite, a repo generated from a template)

- `GET admin.hlx.page/status/{owner}/{repo}/main` answered 200 with
  `code: {"status":400,"permissions":["delete","delete-forced","read","write"]}` and **no
  `x-error` header** — read by the log line added in `a9ad9b7dc`, six times over twenty minutes.
- `POST admin.hlx.page/code/{owner}/{repo}/main/config.json` answered 400 with
  `x-error: [admin] github bot not installed on repository.` on every attempt, on two
  republishes (`ece349c70` made `previewCode` log and carry the header).
- `githubAppService.checkHelixStatus` classes an inner 400 as "installed, initializing"
  (`isInstalled = codeStatus === 200 || codeStatus === 400`), so `check_github_app` returned
  `isInstalled: true` and phase 3's `confirmCodeSync` logged "AEM Code Sync verified
  (code.status 400)". The comment on that branch reads "Sync is initializing"; here it was not.

So the state "site registered, App never granted this repository" is indistinguishable from
"site registered, first sync in flight" by the read-only status call. Only the code-preview
POST says which, and it is a write.

## What the repository looked like

Generated from `kmanns/justrite` by `generate-from-template` into the owner's own namespace.
The owner's AEM Code Sync installation evidently covers selected repositories, not all, so a
newly generated repository is outside it until someone adds it on GitHub. Nothing in the
creation path asks the person to do that for a NEW repository: the phase-1 gate runs only for
an existing repository, and the phase-3 gate accepts the 400.

## What to do (recommendation)

1. **Classify the 400 by asking the one endpoint that says why.** After a 400 in
   `confirmCodeSync` (phase 3), issue the code-preview POST the phase is about to make anyway
   (`previewCode('/*')`, already the next step in `executePhaseCodeSync`) and read its
   `x-error`. `github bot not installed on repository` → the same "install the App" pause EDS-20
   built for the inner 404, with the repository named. Any other 400 → the existing wait.
   This keeps `check_github_app` read-only (its `skipTrigger` pin stands) and moves the
   decision to the place that already writes.
2. **The dashboard's "Code not published to the CDN" message should say "install the App"**
   when the reason is this string, and link `getInstallUrl`. Today the republish answer carries
   the raw x-error, which is honest but not actionable.
3. **Pin the string.** `[admin] github bot not installed on repository.` is a live-captured
   fixture; keep it in `tests/helpers/` and test the classification against it, not against a
   made-up reason.

Not a hook or a scan: it is one code path, and the fix is the phase-3 classification.

## Shipped so far
- 2026-10-01  2026-09-30 21:1xZ: after the owner added the repo to the AEM Code Sync installation, republish published config.json and scripts.js served 200 — and check_github_app STILL answered code.status 400. So the inner 400 is not 'initializing' either; it says nothing about whether code is syncing. The only honest classification for 400 is 'unknown — ask the code endpoint' (recommendation 1 stands).
- 2026-10-03  Reconciled 2026-10-03 (second pass): the comment at githubAppService.ts (inner 200 and 400 'mean installed') is still wrong and will mislead until the fix lands.
- 2026-10-03  2026-10-03 (worktree night2-b, uncommitted): an inner 400 is now 'undetermined', not installed; storefront setup decides by the code POST's x-error and pauses for the App (EDS-20's pause, ended by re-publishing the code) when it says 'github bot not installed', Republish words that refusal with the install link; live check left for the owner.
