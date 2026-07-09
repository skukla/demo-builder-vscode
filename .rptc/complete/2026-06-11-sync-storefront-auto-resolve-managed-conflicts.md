# Sync Storefront — auto-resolve managed-file merge conflicts

## ✅ SHIPPED (2026-07-09) — F5 repro PASSED, merged to develop

Built 2026-07-08 (TDD, full gate green); the merge was gated on a live F5 reproduction of the highest-risk
line (the rebase ours/theirs direction). **Repro run 2026-07-09 on `b2b-tester`: the auto-resolve took the
REMOTE copy (`--ours` direction correct), no conflict modal appeared, and the config-only commit's empty
rebase was skipped cleanly.** Also folded in a fix for a coupled UX bug found during the repro: the
"Committing changes…" progress spinner was held open by a confirmation dialog awaited inside `withProgress`
(`reportSyncResult` now runs after the progress closes). Merged to develop 2026-07-09. Repro steps kept below
for reference.

**What shipped on the branch**
- `managedStorefrontFiles.ts` — `isManagedStorefrontFile(rel)`; exact-match set `{config.json, fstab.yaml}`
  (root-level only; grounded in what `configSyncService`/`fstabGenerator` push), conservative `false` default.
- `syncStorefront.ts` — in `handlePushRejected`, after `attemptRebase → 'conflicts'` and BEFORE the manual
  prompt: classify via `listConflictedFilesRel`; if `.every(isManagedStorefrontFile)` → `autoResolveManagedConflicts`
  (`git checkout --ours -- <file>` + `add` per file → `git -c core.editor=true rebase --continue`, with a
  `--skip` fallback when `--ours` empties the replayed commit; on any failure `safeAbortRebase` + error, no push).
  Success toast notes "Resolved a configuration update automatically." Mixed/unknown → existing manual flow.
- Tests: direction guard (asserts `--ours`, not `--theirs`), all-managed, mixed→manual, unknown→manual,
  empty-commit→skip, failure→abort. 22 tests, gate green.

**F5 repro the merge is gated on** (do this in the Extension Dev Host):
1. Open a project with an EDS storefront. In `<storefront>` (the nested repo), make a LOCAL commit that changes
   `config.json` (e.g. edit a value + `git commit -am`).
2. On the SAME branch on GitHub, make a DIFFERENT change to `config.json` (web UI or another clone + push) so
   both sides diverge on `config.json` → a guaranteed rebase conflict.
3. Run **Sync Storefront**. Expected: NO conflict prompt appears; it finishes with the toast noting a config
   update was resolved automatically.
4. **CRITICAL ASSERTION:** open `<storefront>/config.json` — it must now hold the REMOTE (GitHub) value, NOT
   your local edit. If it holds the LOCAL value, the ours/theirs direction is inverted — STOP, flip
   `--ours`↔`--theirs` in `autoResolveManagedConflicts`, and re-repro. (A wrong direction silently ships stale
   config — the whole reason this is repro-gated.)
5. Empty-commit path: since step 1's commit changed ONLY `config.json`, confirm the sync completes cleanly and
   doesn't hang on a "no changes / did you forget to git add" rebase state (the `--skip` fallback should cover it).
6. Mixed fallback: repeat with BOTH `config.json` AND a user file (e.g. a block `.js`) diverging — confirm the
   manual Source-Control conflict prompt DOES appear (no auto-resolve).
7. Multi-commit re-conflict: make 2+ local commits that each touch `config.json`, diverge remote. The 2nd
   `rebase --continue` re-conflicts → the code must ABORT (not `--skip`) and show "Could not automatically
   resolve…" with your local changes intact (safe dead-end; the empty-commit `--skip` regex only matches
   git's genuine "no changes/did you forget" message, so a real re-conflict rethrows → abort). NOTE: a unit
   test for this path was written but removed — its mock's synchronous `execFile` callback tripped a
   jest-runner hang (production `execFile` is async, so it's a test-harness artifact, not a code defect); the
   safe-abort behaviour is still covered by the `checkout --ours` failure test, and this repro exercises it live.

Only after 4–7 pass: move this file to `.rptc/complete/` and merge the branch to develop.

## Provenance

Deferred 2026-06-11 during the Sync Storefront conflict-visibility fix
(`fix/sync-storefront-conflict-visibility`). That branch shipped two layers:

- **Layer 1** — `revealStorefrontConflicts()` registers the nested storefront
  repo with VS Code's Git extension (`git.openRepository`) and opens the
  conflicted files, so a rebase conflict actually appears in Source Control
  instead of pointing the user at an empty panel.
- **Layer 2** — `fetchAndFastForward()` runs `git pull --ff-only` before
  staging, so the common conflict (local clone behind the API-driven commits,
  *different* files) never produces a conflict at all.

Open UX question raised by the user: a non-technical user who "just wants the
storefront to work" should not have to hand-merge `<<<<<<<` markers. Could the
builder offer to "take care of it"? Decision: **back it off** for now — Layer 2
made conflicts rare, and a *generic* auto-resolve is unsafe. Capture the safe,
narrow version here.

## Goal / Scope

After Layer 2, a conflict only happens when the **same file** changed both
locally and on the remote. The realistic case is a **Demo-Builder-managed file**
(`config.json`, `fstab.yaml`, `.helix/*`, etc.) — files the user never
hand-edits and where the **remote copy is authoritative**. Genuine *content*
conflicts (the user's own DA.live/block edits) are rare and have no safe
automatic answer.

So split the rebase-conflict handling by file class:

- **All conflicting files are managed** → silently take the authoritative
  remote copy, stage, `rebase --continue`, and finish the sync. No prompt — the
  user can't meaningfully judge a `config.json` merge, so don't ask.
- **Any conflicting file is user content** → fall back to the existing manual
  flow (Layer 1's `revealStorefrontConflicts` + poll). This is exactly where a
  human must look.

Explicitly **not** in scope: a generic "Demo Builder, fix any conflict" button,
`reset --hard origin/main`, or `push --force`. Those silently destroy work.

## Execution plan

1. **Define the managed-file set.** A predicate `isManagedStorefrontFile(rel)`
   listing the extension-owned paths (`config.json`, `fstab.yaml`, `.helix/`,
   `helix-*.yaml`, `head.html`?, etc.). Source the list from what the EDS
   pipeline actually writes via the GitHub API (`configGenerator`,
   `fstabGenerator`, vendoring) — do not guess. Keep it conservative: if a file
   isn't *known* managed, treat it as content (safe default → manual flow).
2. **Classify at conflict time.** In `SyncStorefrontCommand.attemptRebase` (or a
   new branch off it), after detecting conflicts, call `listConflictedFiles()`
   (already extracted) and partition by the predicate.
3. **Auto-resolve the all-managed case.** For each managed conflict, take the
   remote side and stage it, then `git rebase --continue`.
   - ⚠️ **Rebase inverts ours/theirs.** During a rebase, `--theirs` is the
     commit being *replayed* (your local change) and `--ours` is the commit
     you're replaying *onto* (the upstream/remote). "Take the remote
     authoritative copy" therefore means `git checkout --ours <file>` during a
     rebase, NOT `--theirs`. Verify this with a real reproduction before
     trusting it — this is the single highest-risk line in the whole item.
4. **Fall back for content conflicts.** If the partition has any content file,
   run the existing manual flow unchanged.
5. **Tell the user what happened.** When auto-resolved, the success toast should
   note it briefly ("Resolved a config update automatically") so it isn't a
   silent magic — and log the file list to the Debug channel.

## Constraints

- **Never silently discard user content.** The predicate's safe default is
  "content → manual." A file of unknown class must never be auto-resolved.
- **Get the rebase ours/theirs direction right.** Cover it with a test that
  asserts the *remote* bytes win for a managed file, and a real F5 repro before
  merge. A wrong direction silently ships the stale local config.
- **Keep `storefrontSyncService` vscode-free.** Classification + resolution live
  in the command (`syncStorefront.ts`); the service stays a pure git/Helix
  orchestrator.
- **TDD.** New tests in `tests/features/lifecycle/commands/syncStorefront.test.ts`:
  all-managed → auto-resolved + re-push; mixed → manual flow; unknown file →
  treated as content. Reuse the existing execFile/PollingService mock setup.
- This is a refinement on a **rare** edge. Don't expand it into a general merge
  tool. If real users never hit content conflicts, the manual flow may be enough
  and this can stay parked.

## Kickoff prompt

> Implement the managed-file auto-resolve for Sync Storefront rebase conflicts,
> per `.rptc/backlog/2026-06-11-sync-storefront-auto-resolve-managed-conflicts.md`.
> Read `src/features/lifecycle/commands/syncStorefront.ts` (the
> `handlePushRejected` / `attemptRebase` / `revealStorefrontConflicts` /
> `listConflictedFiles` flow shipped on `fix/sync-storefront-conflict-visibility`).
> First derive the managed-file set from what the EDS pipeline writes via the
> GitHub API (`configGenerator`, `fstabGenerator`, vendoring) — don't guess.
> TDD. Critical: during a rebase, taking the remote authoritative copy of a
> managed file is `git checkout --ours <file>` (rebase inverts ours/theirs) —
> prove the direction with a test and a real F5 repro before merging. Content
> conflicts (or any unknown-class file) must fall back to the existing manual
> merge-editor flow unchanged.
