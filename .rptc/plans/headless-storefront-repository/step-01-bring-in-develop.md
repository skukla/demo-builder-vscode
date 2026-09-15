# Step 01 — Bring `origin/feature/colleague-storefront` and `origin/develop` into this branch

Item: [[EDS-13g]]. Decisions: Q8 (owner, 2026-09-15: done on develop, brought in here).
Depends on: nothing.

## Goal

The branch carries the fixes this plan builds on, so later steps extend them instead of
re-deriving them:

- **From this branch's base**, `origin/feature/colleague-storefront` at `8d1669050` (five
  commits past this branch's `700487408`): Edit shows the repository read-only
  (`191dc85b5`), the watcher fix (`442c53509`), Remove recognises a zip import's repository
  by its latest commit (`bd0fd7c70`, `forgetAddedDemoHandler.ts`, new
  `getLatestCommitMessage`), and two backlog records.
- **From `origin/develop` at `9dbdfbaa7`**:
  - `43e70398b` — the home Chat hook pushes only the manifest's `eds-storefront` path
    (`buildOwnStorefrontGuard`, `claudeSettingsWriter.ts:359-372`); component updates keep
    folders and dotfiles (`archiveRoot.ts`).
  - `7316132dd` — reset keeps binary files and executable bits (`archiveFile.ts`;
    `githubFileOperations.ts:790-821`).
  - `6b6815acd` — reset records `lastSyncedCommit` through
    `templateCommitResolver.ts:38-70`, shared with creation; the reset download is pinned
    to that sha.
  - `f0bc8437b` — the webview watcher rebuilds again.
  - `9dbdfbaa7` (EDS-14) — template updates apply the template's diff since the recorded
    version 3-way (`templateMergeBase.ts`), stop on conflict and name the files, refuse a
    recorded version not on the template's `main`, and ask "reset once" when none is
    recorded; the command's conflict modal (`templateConflictPrompt.ts`); `apply_updates`
    `resetTemplateOnConflict` (`applyUpdatesTool.ts:125`).

## Facts (read 2026-09-15)

- `700487408` is an ancestor of `8d1669050`, and `git merge-tree --write-tree HEAD 8d1669050`
  reports no conflicts: that half is a fast-forward.
- `8d1669050` is not in `origin/develop`. `git merge-tree --write-tree --name-only 8d1669050
  origin/develop` reports 14 conflicted files:
  - records and docs: `.rptc/backlog/2026-09-11-template-update-conflict-fallback-overwrites-edits.md`
    (add/add), `.rptc/backlog/README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/CHANGELOG.md`,
    `docs/development/conventions.md`, `docs/development/handbook.md`,
    `scripts/mutation-equivalents.ledger.json`;
  - source: `githubFileOperations.ts`, `edsResetRepoHelper.ts`, `executorEdsPhase.ts`,
    `templateSyncService.ts`;
  - tests: `edsResetRepoHelper.testUtils.ts`, `edsResetService-finalize.test.ts`.
- What each source conflict is (read from the conflict hunks):
  - `templateSyncService.ts`: this side only removed trailing ellipses from log lines;
    develop rewrote the file. Take develop's, without ellipses.
  - `githubFileOperations.ts`: this side split the archive download into
    `downloadRepoArchive` (bytes, also used by `exportDemoBundleHandler.ts:106`); develop
    made `downloadRepoContents` return bytes and a mode per file. Keep both: the extraction
    reads `downloadRepoArchive`'s buffer and returns develop's `ArchivedFile` map.
  - `executorEdsPhase.ts`: this side records `templateBranch` from the added demo's row and
    reads the baseline commit on that branch (`fetchTemplateCommitSha(…, templateBranch)`);
    develop replaced that function with `resolveTemplateCommitSha`, which reads `main` only
    (`templateCommitResolver.ts:60`).
  - `edsResetRepoHelper.ts`: this side takes overrides from `buildResetFileOverrides`,
    resets an added demo to its row's branch (`project.demo?.source.branch`) and returns
    `demoCaveats`; develop pins the download to `resolveTemplateCommitSha`'s sha, falling
    back to `main`.
- **The trap in those two:** taking develop's side as written drops the added demo's branch
  from both creation and reset, and every develop test still passes because they all use
  `main`. This side's tests catch it:
  `executor-edsStandardFlow.test.ts:388` "records the demo's branch so reset and the update
  check read it" and `edsResetRepoHelper-addedDemo.test.ts:42` "resets to the demo's own
  branch when the row names one".
- `AI_CONTEXT_VERSION` is 32 on all three refs (`src/core/constants.ts:238`), so the merge
  does not collide with step 09's bump.
- The local `develop` ref is `f54632bc9` and behind: merge `origin/develop`.

## The exact changes

1. Fast-forward to `origin/feature/colleague-storefront` (`8d1669050`).
2. Merge `origin/develop`. Resolve with the owner:
   - Documents and records: keep both sides' entries. `CLAUDE.md` and `handbook.md` are pinned
     against each other by `tests/sop/claude-md-handbook-agreement.test.ts`; resolve both
     halves together. The EDS-14 backlog file keeps develop's status and log.
   - `resolveTemplateCommitSha` gains `branch?: string` on `TemplateCommitSource`
     (`templateCommitResolver.ts:18-23`), used for the head read at `:60` (default `main`).
     `executorEdsPhase.ts` passes `typedConfig.demo?.source.branch` and keeps recording
     `templateBranch`. `edsResetRepoHelper.ts` passes `project.demo?.source.branch`, falls
     back to that branch instead of `main` when no sha resolves, and keeps
     `buildResetFileOverrides` and `demoCaveats`. Step 02 then replaces both inputs with
     `getStorefrontSource(…).branch`.
   - `githubFileOperations.ts`: as above; `edsResetRepoHelper.testUtils.ts` and
     `edsResetService-finalize.test.ts` keep both sides' cases.

## Reuse

The fixes as merged. The only new code is the resolver's `branch` input, which the merge
needs so the two sides agree.

## Tests

New, in `tests/features/eds/services/templateCommitResolver.test.ts`: "reads the head of the
branch it is given" (argument assertion on `getLatestCommitSha`'s third argument) and
"reads main when no branch is given" (the existing "answers the template main head" case
stays as the control).

After the merge, unchanged and green: `templateMergeBase.test.ts`,
`templateSyncService-plumbing.test.ts`, `templateSyncService-recordedVersion.test.ts`,
`templateSyncService-safety.test.ts`, `updateExecutor-templateSync.test.ts`,
`updateApplyService-apply.test.ts`, `applyUpdatesTool.test.ts`,
`githubFileOperations-resetBinary.test.ts`, `githubFileOperations-resetTemplate.test.ts`,
`githubFileOperations-branchRef.test.ts`, `edsResetRepoHelper-template.test.ts`,
`edsResetRepoHelper-addedDemo.test.ts`, `executor-edsStandardFlow.test.ts`,
`homeGitSyncHook.test.ts`, `claudeSettingsWriter.test.ts`, `archiveRoot.test.ts`,
`componentUpdater-core.test.ts`, `componentUpdater-plumbing.test.ts`,
`forgetAddedDemoHandler.test.ts`, `exportDemoBundleHandler.test.ts`, and the SOP enforcers
the conflicts touch (`claude-md-handbook-agreement.test.ts`, `tooling-registry.test.ts`,
`reversibility-ledger.test.ts`, `architecture-rules.test.ts`).

## Docs that change

The eight conflicted records and documents, as resolved. `templateCommitResolver.ts`'s header
names the branch input.

## Acceptance

| Predicate | Evidence |
|---|---|
| Both histories are on the branch | `git merge-base --is-ancestor 9dbdfbaa7 HEAD` and `git merge-base --is-ancestor 8d1669050 HEAD` each exit 0 (control: `git merge-base --is-ancestor HEAD HEAD~1` exits 1, so a failure reads as a failure) |
| The develop fixes are present | `grep -c 'applyTemplateChangeSince' src/features/updates/services/templateSyncService.ts` and `grep -c 'buildOwnStorefrontGuard' src/features/project-creation/services/aiBundle/claudeSettingsWriter.ts`, each captured into a variable and asserted ≥ 1 |
| The added demo's branch survived | the two branch tests named above pass unedited |
| No conflict markers left | `grep -rnE '^(<{7}|>{7})( |$)' CLAUDE.md CONTRIBUTING.md docs .rptc/backlog src tests scripts` finds nothing, count captured; positive control on a scratch file that holds a marker |
| Gate green | the `gate` skill, then the pre-push hook |

## Reversal

Before pushing: `git reset --hard` to the pre-merge commit. After pushing: `git revert -m 1`
of the merge commit (asks the owner first, as every commit does).
