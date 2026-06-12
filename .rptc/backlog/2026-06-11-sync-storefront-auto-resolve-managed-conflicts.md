# Sync Storefront — auto-resolve managed-file merge conflicts

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
