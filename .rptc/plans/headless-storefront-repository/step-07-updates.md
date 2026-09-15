# Step 07 — Updates through the template path for both kinds, on the recorded branches

Item: [[EDS-13g]]. Decisions: 3 (owner, 2026-09-15); Q8 (done on develop, same day); open
decision C (overview), built here as recommended. Depends on steps 01 and 05.

Line numbers in files step 01 changes are `origin/develop`'s (`9dbdfbaa7`); re-read them
after the merge.

## Goal

Check for Updates offers a headless project "N changes behind" its demo's source, the way it
offers an Edge Delivery project, and applying it brings the SC's repository and then, when
nothing local would be lost, their local storefront up to date, without overwriting their
edits. Updates read and write the branches the project records: the SC repository's own
branch and the source's branch (`main` for CitiSignal from develop `8bb5ff448`, `master` for
a headless project created before that, a named branch for an added demo).
The release-zip update stops applying to storefronts of either kind.

## Facts

### How template updates work after step 01 (develop)

- `syncWithTemplate` (`templateSyncService.ts:145-190`) reads the EDS instance's
  `githubRepo`, `templateOwner`, `templateRepo` and `lastSyncedCommit`; a missing or malformed
  recorded version answers "reset once" (`:94-95, 183-186`).
- The merge strategy clones the SC repository (`--branch main`, `:225`), fetches the template
  (`git fetch template main`, `:237`), and applies the template's diff from the recorded
  version to `template/main` 3-way (`templateMergeBase.ts:122-141`), with preserved files
  excluded from the patch (`:82-105`). A recorded version not on `template/main` is refused
  (`:64-74`). A conflict restores the clone and names the files
  (`templateSyncService.ts:279-286`). Success commits and pushes `origin main` (`:292-296`).
- The reset strategy reads `template/main`'s tree over the clone, restores the preserved
  files, and force-pushes `main` (`:300-321`).
- Preserved files are always `fstab.yaml` and `config.json` (`:114-117, 172`).
- Two appliers: the command (`updateExecutor.ts:127-212`) asks on conflict with a
  "Reset to template" modal (`templateConflictPrompt.ts:37-56`); `apply_updates`
  (`updateApplyService.ts:140-179`) resets only with `resetTemplateOnConflict:true`
  (`applyUpdatesTool.ts:125`). Both record `syncedCommit` through `updateLastSyncedCommit`
  (`updateExecutor.ts:170-174`, `updateApplyService.ts:165`).

### Known limit: every template-side branch is `main`

- Written into both headers as a known limit (`templateSyncService.ts:23-24`,
  `templateMergeBase.ts:15`) and hard-coded at `templateSyncService.ts:225, 237, 293, 307, 316`
  and `templateMergeBase.ts:51, 72`.
- CitiSignal's headless source `skukla/citisignal-nextjs` was on `master`. On 2026-09-15 it
  gained a `main` branch at master's commit, made the default, and develop's
  `demo-packages.json` names `main` (`8bb5ff448`); `master` was kept, because GitHub does not
  redirect `git clone --branch` for a renamed branch and released versions clone `master`.
  So new CitiSignal headless projects need no branch work, but projects created earlier record
  `master` and added demos record any branch: the apply must still use the recorded branch.
- An added demo records the branch its row names as `templateBranch` (`executorEdsPhase.ts`
  on this branch, `:74-77`; `changeDemoSourceHandler.ts:52`), and the update CHECK already
  compares on it (`templateUpdateChecker.ts:83-148, 210-213` on this branch). The APPLY does
  not, so after step 01 an added EDS demo on another branch is offered updates that the apply
  then refuses ("not in the template's history"), because its recorded version is on that
  branch, not on `main`.
- Step 01 gives the baseline resolver its branch; step 05 gives the Tree reset its target
  branch. This step does the apply.

### The update-conflict reset drops a saved demo package's description file

`read-tree --reset -u template/main` (`templateSyncService.ts:306-311`) removes every file
the template does not have, and only the preserved files are restored (`:313`). The
description file `demo.demo-builder.json` (`types/projectFile.ts:46`) is never in the
template, so a saved demo package loses it when the SC answers the conflict modal with "Reset
to template". The dashboard reset keeps it (`edsResetFileOverrides.ts:55-58`). Read, not run.

### The current headless update

- `UpdateManager.checkAllProjectsForUpdates` walks every component instance with a path
  (`updateManager.ts:92-180`); a frontend with no catalog source resolves to its `repoUrl`
  (`:266-276`). For a headless project with a repository that is the SC's own repository,
  which has no releases, so the check would find nothing; for a repo-less one it is the source.
- Apply is `ComponentUpdater.updateComponent` (`componentUpdater.ts:56-`, develop): delete the
  folder, unzip the release, npm install, merge env files. A release zip has no `.git`, so an
  updated headless clone stops being a git repository (research §2, inference; not tested).
  CitiSignal's releases are all prereleases, so the default `stable` channel offers nothing
  (research §2, live read).
- `changeDemoSourceHandler.ts:39-44` rewrites a headless frontend's `repoUrl` for exactly this
  zip check.

## The exact changes

- `updateManager.ts:105-129`: skip instances with `type === 'frontend'` (storefront updates are
  the template path). The frontend `repoUrl` fallback in `resolveComponentRepository`
  (`:266-276`) then serves only App Builder apps; its doc says so. A headless project without
  a repository is offered no storefront update (decision C).
- `changeDemoSourceHandler.ts:39-44`: the headless `repoUrl` loop is deleted; the doc
  (`:31-38`) names the two records the handler moves (the row, and the repository record's
  baseline through `recordStorefrontRepository`).
- `templateSyncService.ts`:
  - `SyncTarget` (`:73-78`) gains `repoBranch` (from `getStorefrontRepository`, step 02) and
    `templateBranch` (the baseline's `branch ?? 'main'`).
  - Clone `--branch ${repoBranch}` (`:225`), `git fetch template ${templateBranch}` (`:237`),
    push `origin ${repoBranch}` (`:293`, and `--force` at `:316`), reset reads
    `template/${templateBranch}` (`:307`). Branch names pass `assertGitRef`
    (`githubUrlParser.ts:71`; `appBuilderComponentCatalogLoader.ts:244` uses it) before they
    reach a shell string.
  - Preserved files by kind: `fstab.yaml` and `config.json` for EDS, none for headless; both
    kinds also preserve `SHARED_DEMO_FILE_NAME` (the finding above).
  - The "Known limit" paragraph (`:23-24`) is deleted.
- `templateMergeBase.ts`: `readTemplateHead(git, branch)`, `isTemplateCommit(git, sha, branch)`
  and `TemplateChangeRequest.branch` replace `template/main` (`:51, 72`); the header's known
  limit (`:15`) is deleted.
- New `refreshStorefrontAfterUpdate(project, ctx)` in `updateApplyService.ts`, called by both
  appliers after a successful sync and record (`updateExecutor.ts:169-180`,
  `updateApplyService.ts:163-168`). The two appliers are not merged: their conflict handling
  differs on purpose (modal vs flag). For `kind === 'headless'`: `readCloneState` (step 05);
  clean → `fetchAndFastForward` (`storefrontSyncService.ts:186-198`, exported rather than
  rewritten), then `installAllComponents` for the storefront when `package-lock.json` changed
  between the two heads; not clean → no local change, and the result says "Your repository
  is updated. Sync Storefront brings the changes to this computer." EDS clones are not
  touched (unchanged; nothing runs from them).
- `checkUpdates.ts:100-111` progress copy "Checking EDS templates" → "Checking demo sources".
- What remains of the zip path: `ComponentUpdater` serves the three mesh catalog entries
  (`components.json` `mesh`: `eds-commerce-mesh`, `eds-accs-mesh`, `headless-commerce-mesh`,
  all `tag: stable`), the `tools` entry `commerce-demo-ingestion`, and App Builder app
  instances whose `repoUrl` has releases. Nothing in it is headless-only (read on this branch
  `:236-300, 356-`; re-read the develop version), so nothing is deleted from it.

### Agent

`apply_updates` reaches the same sync and `refreshStorefrontAfterUpdate` through
`updateApplyService.ts`; no schema change (`resetTemplateOnConflict` unchanged). Its
description (`applyUpdatesTool.ts`) names "template" without a kind and needs no edit; the
result for a dirty headless clone carries the Sync sentence as `hint`.

## Reuse

`TemplateUpdateChecker`, `TemplateSyncService` and `templateMergeBase` (develop, given
branches), `templateConflictPrompt`, `ForkSyncService` (fork check reads the baseline since
step 02), `readCloneState` (step 05), `fetchAndFastForward`, `installAllComponents`,
`recordStorefrontRepository`, `assertGitRef`. New: `refreshStorefrontAfterUpdate`.

## Tests (failing first)

- `updateManager-components.test.ts`: "a frontend instance is never checked for releases"
  (assert `fetchLatestRelease` not called for it); "a mesh still is".
- `templateMergeBase.test.ts` (develop's real-git suite, every `GIT_*` variable stripped):
  "applies a template change made on master" (a bare template whose only branch is
  `master`); control: the existing `main` cases unchanged.
- `templateSyncService-recordedVersion.test.ts`: "headless on master clones the SC branch,
  fetches master and pushes the SC branch" (argument assertions on the command strings);
  "an added EDS demo on a named branch applies from that branch"; "a branch that fails
  assertGitRef stops before any git command".
- `templateSyncService-safety.test.ts`: "the conflict reset keeps demo.demo-builder.json"
  (both kinds); "headless preserves neither fstab.yaml nor config.json"; control: "EDS still
  preserves both".
- `templateUpdateChecker.test.ts`: "a headless project on master behind its source has updates".
- `updateApplyService-apply.test.ts` and `updateExecutor-templateSync.test.ts`: "a clean
  headless clone is fast-forwarded and installs when the lock file changed"; "a dirty one is
  left and the result says Sync"; "EDS clones are not touched"; "nothing local runs after a
  conflict".
- `changeDemoSourceHandler.test.ts`: the headless `repoUrl` case from `b4136c7ac` is replaced
  by "headless change source moves the baseline".
- Mocks: `templateSyncService.testUtils.ts` (develop) builds its project through the typed
  fixture with both branches; `componentUpdater.testUtils.ts` unaffected; `updateManager`
  suites that build a headless fixture with a `repoUrl` expecting an update change expectation.

## Docs that change

`docs/systems/sharing-a-demo.md` (updates for a headless added demo),
`src/features/updates/` README if present (checked when implementing), CHANGELOG ("headless
projects are updated from their demo's source, not from release zips; a headless project
without a repository is no longer offered storefront updates; the conflict reset keeps a
saved demo package's description file").

## Acceptance

| Predicate | Evidence |
|---|---|
| No storefront on the zip path | `updateManager-components` case; plus `grep -n "type === 'frontend'" src/features/updates/services/updateManager.ts` finds the skip |
| No template-side `main` left | `grep -rn 'template/main\|origin main\|--branch main\|template main' src/features/updates/services/templateSyncService.ts src/features/updates/services/templateMergeBase.ts` count captured equals 0; control: the same grep on `origin/develop`'s two files counts 7 |
| The headless `repoUrl` write is gone | `grep -n 'repoUrl' src/features/eds/handlers/changeDemoSourceHandler.ts` count captured equals 0; control on `templateOwner` counts 1 or more |
| Gate green | `gate`, pre-push |
| Live (owner confirms each push) | a headless test project one commit behind a scratch source on `master` the owner controls: Check for Updates offers it; apply; the SC repository gains the change on its own branch; the local storefront is fast-forwarded; an uncommitted local edit in a second run is untouched and the result says Sync |
| Live: conflict (owner confirms) | change the same line in the SC repository and in the scratch source, then apply: the update stops and names the file; nothing overwritten; answering "Reset to template" keeps `demo.demo-builder.json` on a project saved as a demo package |

## Reversal

Revert the commit. An applied update is an ordinary commit in the SC repository (revert it on
GitHub) and a fast-forward of the clone (`git reset --hard` to the previous head, which the
result logs).
