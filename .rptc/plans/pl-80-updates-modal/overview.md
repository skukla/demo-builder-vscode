# PL-80: Check for Updates in a modal, with the updates already ticked

Owner approved the design 2026-10-20 ("Yes"). Branch `feature/pl-80-updates-modal`, from
`loop/2026-10-19-backlog-fixes@48615ed36`.

## What the SC sees

| When | Today | After |
|---|---|---|
| Runs Check for Updates | "Checking for updates" notification, then VS Code's picker | Your Projects opens with an Updates modal: checking, then the list |
| Startup or 4-hourly check finds updates | The picker opens by itself; a second updater shows its own "Update Now" | One notification, "N updates available", with **Review**, which opens the modal |
| Background check finds nothing | "Demo Builder is up to date" | Nothing |
| The list | Flat, by folder name, only the open project ticked | Grouped under each project's display name, everything ticked. A pair in another Adobe org is shown unticked and locked, with the reason |
| Applying | A notification per category, results as toasts | One progress run in the modal; questions asked in it; one summary per project |
| The extension's own update | A separate notification | The first row; it runs last, because it ends in a reload |

## Design

- **One check for both surfaces.** `computeProjectUpdateSelections(project)` (the agent's)
  becomes `computeUpdateSelections(projects)`; the one-project form calls it with one.
  Fork syncs dedupe by repository. The command's private copy of the check
  (`checkUpdates.ts` `checkForkSyncUpdates`, `checkAddonUpdates`, `checkAdobeMcpUpdates`,
  the template loop) is deleted.
- **One apply for both surfaces.** The modal applies through `applyUpdatesHeadless`, with
  its three questions asked in the modal (`askDuringOperation`) instead of decided by the
  headless defaults: a running demo (stop it?), a template conflict (reset to template?),
  a library under the `ask` sync setting (replace its blocks?). An agent keeps the defaults.
- **Rows are a typed, serializable shape** in `src/types/` (ADR-017: a shape crossing the
  boundary lives in a typed file). Each row has an id; the extension keeps the last
  check's selections per screen and applies the ticked ids. No `Project` object crosses.
- **Host: the projects list** (cross-project; already renders `OperationProgressModal`).
  Check for Updates reveals it and asks it to show the modal; the screen pulls the rows
  after mount (handshake-safe: a fresh panel sends nothing to itself).
- **Removed:** `src/utils/autoUpdater.ts` (its 4-hour timer moves to the one background
  check); the sidebar's dead `checkUpdates` message and its unregistered command id; the
  QuickPick builder and dispatch in `checkUpdates.ts` / `updateTypes.ts` and the suites
  that pin them, replaced by tests of the new path.

## Slices (each committed after its own tests, both typechecks and lint; the full gate runs before each push)

1. **Check across projects.** `computeUpdateSelections(projects, ...)`, fork dedup; the
   per-project form delegates. Existing `updateSelections` suites pass unchanged.
2. **Rows.** `toUpdateRows` (selections + extension update → typed rows, ticked and locked
   rules, display names) and `selectionsForIds`. Pure; unit tests.
3. **Screen handlers.** On the projects list: `check-updates` (Pattern B: returns rows) and
   `apply-updates` (ids → one modal run over `applyUpdatesHeadless`, questions in the
   modal, a per-project summary). Questions threaded as an optional `ask` on the context
   the cores already take; absent for agents.
4. **The modal.** `UpdatesModal` in the projects list: `ui/Modal`, rows grouped under
   project headings (Spectrum `Checkbox`, `ApiAccessPicker`'s locked-row pattern), one
   Apply; then `OperationProgressModal` for the run.
5. **The doors.** Check for Updates opens the screen and the modal; the background check
   (sidebar open, then every 4 hours) runs the shared check quietly and notifies with
   **Review**. Delete `AutoUpdater`, the dead sidebar wiring, the QuickPick code and its
   pins. The extension update row and its reload question.
6. **Docs and the walk.** `src/features/updates/README.md`, `custom-block-libraries.md`,
   ADR-006's line, `src/commands/CLAUDE.md`, `README.md`, CHANGELOG, a release-plan row.

## Surfaces (CLAUDE.md "Hit every surface")

- Bundles: projects list only (the modal); sidebar loses dead code.
- Human and agent: the agent's `apply_updates` is unchanged in behaviour; it now shares the
  check and apply with the screen.
- Mocks: the `updateSelections` and `applyUpdatesHeadless` fakes in the suites that use
  them, audited when their signatures change.

## Outcome (2026-10-20)

Built in eight commits on `feature/pl-80-updates-modal`. Three changes the slices found:
the template part of the headless apply moved to `updateApplyTemplate.ts` (the questions
took the service over its size limit); the API picker's row became the shared
`CheckboxRow`, with its sheet `core/ui/styles/checkbox-row.css` (its classes lived in a
project-creation sheet the projects list never loads); and a projects list just created is
asked for the modal once mounted (`takeUpdatesRequest`), since a push would arrive before its
listener. The check's eight progress stages and `UpdateContext`'s `getCurrentProject` went
with the picker. Release rows 1.14 to 1.16.
