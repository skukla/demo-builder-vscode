# Step 05: Apply finishes the update

## What

Applying the Finish row (step 03), from the modal or `apply_updates`:

1. **Still current?** The update's target is still the one to apply (the LKG for the Adobe
   row, the colleague's head for theirs). If it moved, undo the local copy to its head,
   drop `pendingClash`, and run the normal check again. A stale fix never goes out.
2. **Fixed?** No conflict markers in the recorded files (`CONFLICT_MARKER_RE`, reused from
   `syncStorefront.ts:57`), and the working tree differs from the staged apply only in
   those files. Otherwise the row says which files still need fixing and nothing is pushed.
3. **Commit and push** from the local copy with the update's own message, using the SC's
   GitHub token (`storefrontSyncService.ts` `push`). Pushing is the cloud write the SC
   confirmed by applying the row.
4. **Record** the version as the clean path does: `lastSyncedCommit` for the colleague's
   track (with `refreshBaseFromColleague`), `boilerplateBase.commit` for Adobe's. Drop
   `pendingClash`.

"Leave it as it is" on the Finish row undoes the local copy and drops `pendingClash`.

## Where

- A `finishClash(project, deps)` in `src/features/updates/services/`, called from
  `updateApplyService.ts` before the template and boilerplate categories.
- Recording reuses the existing writers (`writeBoilerplateBase`, the template path's
  `lastSyncedCommit` write).

## Tests

- Fixed: one commit, pushed, version recorded, `pendingClash` gone.
- Markers left: nothing pushed, the files named.
- Another file changed too: refused, named.
- Target moved: undone, re-checked, nothing pushed.
- Leave: undone, nothing pushed.

## Done when

On a throwaway storefront with a planted clash, Fix with AI then Finish pushes one commit
and the next check is clean. JustRite is the first real run (needs the owner present: it
pushes).
