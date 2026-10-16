---
id: PL-80
kind: feature
area: platform
parent: PL-81
needs: []
value: med
status: backlog
---

# Check for Updates in a modal, with the updates already ticked

Filed 2026-10-16 from the release-candidate walk. The owner's concern: the update picker
is hard to use. Two questions to answer:

1. Would a modal be easier than VS Code's picker?
2. Should the updates that need applying start ticked, so the SC only has to confirm?

## What it does today (read 2026-10-16)

- `checkUpdates.ts` `showMultiProjectUpdatePicker` opens VS Code's multi-select list
  (`showQuickPick`, `canPickMany`) over EVERY project with a pending update, one row per
  update: extension, components, EDS template, block library installs, add-ons, fork syncs.
- Only the OPEN project's rows start ticked (`picked: isCurrent` in `updateTypes.ts` and
  `checkUpdates.ts`); fork syncs always start ticked. Every other project's rows start
  unticked, so an SC updating more than one project ticks each row by hand.
- Rows name the project by its folder name (`project.name`), not its title; the same fix
  `getProjectDisplayName` made elsewhere on 2026-10-15/16 applies here.
- The results arrive as separate notifications afterwards; the progress modal pattern
  (PL-59) is not used.

## Direction to decide

- A modal on the dashboard (or projects list) that groups updates by project, every
  needed update ticked, with one Apply, told in the shared progress modal
  (`OperationProgressModal`), as Configure's Republish now is.
- Or keep the picker and change only the pre-ticking and the names. Cheaper; does not
  address "hard to use" if the list itself is the problem.

Recommendation: the modal, with everything pending ticked by default. The picker cannot
group by project or show what each update does, and its results land as notifications.
The agent's `apply_updates` keeps working against the same apply service either way.
