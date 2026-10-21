# Step 01: the local copy follows GitHub

## What

After any update that pushed to the storefront repository (template, Adobe boilerplate,
block library), the local copy fast-forwards to GitHub. The same refresh runs before a
clash is kept there (step 02).

## Where

- A `refreshLocalStorefront(project, deps)` beside `storefrontSyncService.ts`'s
  `fetchAndFastForward`, reusing it: `git fetch` then `git merge --ff-only`.
- Called from the update apply after a successful push (`updateApplyService.ts`), once per
  project.

## Rules

- A clean copy behind GitHub: fast-forward.
- Uncommitted changes to managed files only (`config.json`, `fstab.yaml`,
  `isManagedStorefrontFile`): answer the open question first (is the local write ahead of
  GitHub's?). If GitHub's copy is authoritative, take it, as Sync Storefront does
  (`autoResolveManagedConflicts`, `--ours` on a rebase).
- Anything else (other uncommitted edits, local commits GitHub lacks, no clone): change
  nothing and log it. Never discard work.

## Tests

- Behind and clean: fast-forwarded. Dirty with an unmanaged file: untouched, logged.
  Local commits ahead: untouched. No clone: skipped.
- A failed refresh never fails the update that already pushed.

## Done when

JustRite's copy, after the next update, matches its GitHub main.
