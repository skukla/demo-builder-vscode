# Phase 6 build plan: reset, delete and Clear

Written 2026-11-13 by a read-only mapping pass (architect agent) from `decisions.md` Phase 6 and
Open, `prototype-conventions.md`, overview Phase 6, the walked J7 (`mockups/flow/j7-screen.tsx`,
`j7-batch.ts`, `j7Tour.ts`) and the code at `7639b064c`. Where they differ, `decisions.md` wins.

## Found first
- The Datapack Changes step is still built: its title (`ProjectsBatchModal.tsx:111`), Continue and
  Back (`:152-159`), its body (`:164-167`), and `BatchDatapackChanges.tsx`, with a Discard Changes
  column and an empty "New Datapack Name" field (`:57-76`).
- One-project reset and delete are still VS Code dialogs or prompts. Reset: `confirmReset`
  (`edsResetUI.ts:137-145`), "Uninstall … Too?" (`edsResetSampleData.ts:99-104`), the clear question
  (`edsResetUI.ts:251`), the headless reset (`projectResetService.ts:430`). Delete:
  `confirmPlainDelete` (`deletionConfirmation.ts:44-55`), a QuickPick (`:211-251`), or a question in
  the progress window (`:110-124`). The screens send `resetProject`/`deleteProject`
  (`projects-dashboard/ui/index.tsx:262-276`, `:355-370`; `dashboard/ui/hooks/useDashboardOperations.ts:49-68`).
- Reset still offers Clear (`edsResetUI.ts:227`, `:249-251`, `:358-361`); removed by the owner
  2026-11-12.
- Defect (loop report, S7 b): a removal during reset or delete never clears `project.datapack`.
  `removeProjectSampleData` (`edsResetSampleData.ts:203-252`) has no clear; the Datapacks screen's
  Uninstall does (`importJobWatch.ts:364-382`, `:396`). `SampleDataResult` cannot say part was left
  in Commerce (`sampleDataInstall.ts:42-51`). Trap: the reset's `finally` saves the project object it
  holds (`edsResetUI.ts:392-394`), so a clear on another copy would be written back over.
- A headless reset ignores Uninstall Datapack: offered for any project with a datapack and a
  Commerce backend (`projectsBatch.ts:123-124`), never read by the run
  (`projectsBatchHandlers.ts:61-62`).
- The added-demo check runs inside a batch: a VS Code dialog can appear mid-run
  (`edsResetUI.ts:187-206`, not gated on `withinEdit` or `answered`).
- `SaveFirstWindow`'s layout class `.clear-demo-body` lives in `data-installer.css:482`, which the
  projects-list entry does not import (`projects-dashboard/ui/index.tsx:40-60`); the dashboard entry
  imports neither `projects-batch.css` nor `updates-modal.css` (`dashboard/ui/main.tsx:26-70`).
- Stale in `decisions.md` Open: "The order rule's live test" passed live on 2026-11-11
  (`.rptc/plans/erp-order-close/overview.md`, step 6).
- Over the caps: `projects-dashboard/ui/index.tsx` 543 lines (component 350),
  `projectResetService.ts` 471 (service 400).

## Map (today -> decided)
- Reset from a project's menu: VS Code dialogs -> the batch window, one row, "Reset Kukla Luma?".
- Delete from a project's menu: dialog, QuickPick or progress-window question -> the batch delete
  window, one row, "Delete Kukla Luma?".
- Several projects: "Reset 3 Projects?", unchanged.
- Datapack changes: a second step for packs not the SC's, with Discard -> the button opens "Save
  Your Changes First?": one row per datapack with changes (the SC's own included), columns
  "Datapack" and "Save As" (headings as the batch table's); every row a name field (own: its own
  name; someone else's: "My Bodea", or "My Bodea 2" when taken; a taken name shows the problem line
  and the save button waits); buttons "Reset Without Saving", "Cancel", "Save and Reset" (Delete
  swaps the verb).
- Reset's clear question -> gone.
- Reading wait then the questions in one window growing 319px -> 446px -> no growth (rule 14).
- After a reset or delete took the datapack out, the project still names it -> it names none.

## Design
- **One save window, two bodies.** Same job everywhere: the title, the lead "Your changes will be
  lost if you don't save them.", three buttons, the reserved problem line. The frame moves to
  `core/ui/components/feedback/SaveFirstWindow.tsx` (props `verb`, `saveDisabled`, `onAnswer`,
  `onClose`, `children`; labels from `datapackWords` through the caller, since core may not import a
  feature); its layout class to a core stylesheet all three entries import. data-installer keeps its
  body (type counts, a name only for someone else's pack) as `SaveChangesBody`; projects-dashboard
  adds `BatchSaveTable` (Datapack and Save As rows, `batch-delete-table batch-changes-table`, a
  problem line kept free per row). Bodies differ: one datapack can show counts by type; many can
  only be listed by name.
- **Data.** `PrepareProjectsBatchResponse` gains `ownNames: string[]` (from `packSave.ts`
  `ownNames`). `BatchDatapack.changes` stays `'saves' | 'asks' | 'unchecked'`. The webview draws a
  row for every changed or unchecked pack the run will remove, except one `changesOnRemoval` already
  saves (the `mustAsk` rule, `useSwitchChanges.ts:68-72`).
- **Answers, no type change.** Own pack, name untouched: no `changes` (the run saves into it,
  `removalChanges.ts:189-190`). Any other name: `{ saveAs }`. Without Saving: `'drop'` on every row.
  Never send the own name as `saveAs` (`saveIntoFor` refuses it as taken, `packSave.ts:83-86`).
  Names a row may not take: `ownNames` less its own pack, plus the other rows' names (`takenFor`).
- **Window flow.** The red button checks whether any row asks; if yes, the save window opens in the
  same `DialogContainer`; Cancel closes everything. The `'changes'` step, `setStep`, `setDrop`, the
  discard helpers and `BatchDatapackChanges.tsx` go.
- **One project.** The screen calls `batch.start(action, [project])`; one row uses the project's
  name (P5-Q1). The read wait becomes its own small window.
- **Removal clears the record.** `SampleDataResult` gains `leftInStore`. When a removal took
  everything out, `removeProjectSampleData` sets `project.datapack = undefined`, calls
  `dropStaleFailure` on the object it was handed, and saves it. Reset, batch reset, a delete that
  stops later, and Edit all get the fix; Edit then sets the new pack (`executorEditDatapack.ts:93-98`).
- **Deleted once no screen uses them:** `confirmReset` and the non-Edit, non-batch path in
  `edsResetUI.ts` with its `progress`/`operationId` options; `resetProjectWithUI`'s dialog;
  `deleteProject` and `askBeforeDelete` in `projectDeletionService.ts`; `deletionConfirmation.ts`
  except what the batch reads; `askInDialogs` and `askInWindow` in `edsResetSampleData.ts`;
  `edsResetOtherData.ts`. Kept for Edit: `confirmSampleDataRemoval`, `askSaveAsNameWith`
  (`executorEditApply.ts:82`, `executorEditDatapack.ts:94`).

## Slices (test first, gate green, branch commit)
- R1. The S7 b fix: `leftInStore`, clear and save in `removeProjectSampleData`. Keep green:
  `edsResetSampleData*`, `datapackDataRemoval`, `executorEditDatapack`. Add: a reset ends with no
  datapack named.
- R2. The save window's frame to core with its layout class. `DatapackJobWindow-switch` and
  `-uninstall` unchanged; visual check on the Datapacks screen shows zero change.
- S1 (representative). The batch save question replaces Datapack Changes: `ownNames`,
  `BatchSaveTable`, the button flow, the old step deleted. Port the still-true cases of
  `ProjectsBatchModal-reset`, `-delete`, `batchChoices`, `projectsBatch`, `projectsBatchHandlers`
  first. Visual check on projectsList. Rethink before S2 if the names need state beyond
  `useBatchChoices`, `ProjectsBatchModal.tsx` passes 300 lines, or a row's problem-line room does
  not hold one height.
- S2. One project from the list opens the window, titled by name; the list's
  `resetProject`/`deleteProject` senders go; `ProjectsBatchModal-run` ported for the words.
- S3. The read wait as its own small window.
- S4. The dashboard's Reset and Delete (P5-Q2): `projects-batch.css`, `updates-modal.css`,
  `scroll-fade.css` join the dashboard entry, the prepare and run handlers its map. Visual check.
- S5. Dead one-project code deleted (Design), with `edsResetUI-progressSurface`,
  `edsResetOtherData*`, `deletionConfirmation*`, `projectDeletionService.test`; ledger rows
  `progress-surface.ledger.json:30`, `:34`, `progress-steps.test.ts:78`. The added-demo question
  leaves the run (P5-Q8).
- S6. Headless reset honours Uninstall Datapack (P5-Q3); `projectsBatch.test` plus a case.
- S7. Agent surface (P5-Q4); port `resetProjectTool-headless` and the reset tool suites.
- Clear: its own pass (P5-Q9). Outline: C1 `TreeList` to core; C2 Clear Demo Data with no store
  picker, over the project's websites (summary table, Review Records, Removed and Kept tabs); C3 the
  datapack uninstalled first through the engine's removal, with the save question; C4 Clear
  Commerce Instance (choose websites, warning, "I understand" box; lifts the `claimedBy` guard); C5
  the header's Clear menu and a Command Palette entry; C6 `check_demo_data` and `clear_demo_data`
  move from stores to websites (`dataInstallerDescriptors.ts:366-409`). Anchors:
  `ClearDemoDataModal.tsx`, `clearDemoDataWords.ts`, `CatalogHeaderActions.tsx:91-124`,
  `wipePlan.ts:27`.

## Product questions (P5-Q1 to P5-Q9, each with a recommendation)
- P5-Q1 One project's words besides the title: button "Reset"/"Delete"; run "Resetting Kukla Luma";
  result "Kukla Luma Reset"/"Kukla Luma Deleted" (rule 21). J7-3 still shows "Delete 1 Project".
- P5-Q2 The project dashboard's Reset and Delete (only the list was walked): Reset opens the same
  window on the dashboard; Delete opens the projects list on its one-row window, since the dashboard
  closes when its project goes.
- P5-Q3 Headless reset with the box ticked: it uninstalls the datapack, as an EDS reset does.
- P5-Q4 `reset_project` cannot uninstall the datapack; the window can: add `removeData`, `changes`,
  `saveAs` as `delete_project` has them (`deleteProjectTool.ts:78-87`), in this phase.
- P5-Q5 A pack whose changes could not be read: a row like the others (Switch asks when its read
  fails). Without Saving would then lose them, ending the 2026-11-04 rule "a batch never discards
  changes nobody could see".
- P5-Q6 The setting that saves the SC's own packs without asking: those rows are left out, as
  Switch does.
- P5-Q7 The one-datapack question (Switch, Uninstall) with an editable name on the SC's own pack,
  "every row"? No: counts, plus a name only for someone else's pack.
- P5-Q8 An added demo whose content site cannot be reached: prepare reads it, the run keeps the
  content and says so on that row, no VS Code dialog mid-run.
- P5-Q9 Clear as its own planning pass (step-06): yes; engine work, two new windows, a reversal of
  `datapack-engine/step-10-wipe.md`.

## Risks
- Cloud operations: reset and delete stay behind the red confirm; the save window adds a question
  and takes none away; only Save and Reset or Without Saving starts the run. R1 and S6 change what
  happens after a removal; they need a live cycle with the owner.
- Existing projects: no new stored field. Projects already wrongly naming a removed pack keep it
  until their next removal; no one-off migration.
- Agent surface: dropping `resetProject`/`deleteProject` from the list's map shrinks the human
  surface `ai-coverage-scan` counts; rerun it. S7 moves descriptors, counts, `mcp-server.md` and
  narration together.
- SOP pins: modal-layouts (`modal-layouts.test.ts:51`), progress-surface and progress-steps ledgers,
  god-file ratchet, ui-label-case, stable-hook-arguments, cited-identifiers.
- Mocks: hand-written prepare answers lack `ownNames`; type them in `tests/helpers/`.
- CSS reach: R2 (Datapacks screen), S1 and S3 (projectsList), S4 (dashboard) each need a visual
  check; a `projects-batch.css` class drawn on the dashboard fails silently until its entry imports it.
- Window height (rule 14) and the J7-2 review once built need the owner.

## Owner answers (2026-11-13)

P5-Q2: Reset here, Delete via the list (as recommended). P5-Q3: uninstall it. P5-Q4: yes, in this phase. P5-Q9: own planning pass now, within beta.153. Recorded in decisions.md Phase 6. Still open: P5-Q1 (built as recommended in S2), P5-Q5 to P5-Q8.

## Status

R1 a6df67dad, R2 208fb758a, S1 29a59686f, S2 851fa48e1, S3 c65799909; reset stops offering Clear b9c1946b2.
