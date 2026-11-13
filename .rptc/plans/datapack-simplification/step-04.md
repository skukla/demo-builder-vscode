# Phases 5, 7 and 7b, the rest: the Datapacks screen, the save buttons and the failed install

Written 2026-11-12 by a read-only mapping pass (architect agent) from `decisions.md`,
`prototype-conventions.md`, overview Phases 5, 7 and 7b, the walked prototype and the code at
`7cbfe6ef8`. Not planned again: the job window (step-03), Undo, Restore, Version History, trimming
(step-02).

## Found first
- Delete Store Configuration is still in the flyout (`PackActions.tsx:109`, `:141-149`, `:172`, `:222`;
  `waitStages.ts:81`; a result row at `LoadDatapackFileModal.tsx:225`).
- The flyout still reads Install over another held datapack (`PackActions.tsx:294-297`); the window
  behind it switches.
- Add Unused Items is still built (`DatapackFlowDialog.tsx:66-70`, `:93-101`, `saveWords.ts`), and in the
  agent surface (`list_datapack_export_items` `unused`; the save's `selections` with a pack). Overview
  7b removed it on 2026-11-10.
- A failed creation-time install is recorded nowhere (`executorSampleDataPhase.ts:91`, `:117-131`);
  `project.datapack` stays set, so the card wears the blue check.
- The setting's description is done (`package.json:350-362`).
- The header's words change on screen: "Create Datapack" becomes "Save Changes" once reads land
  (`DatapackCatalogView.tsx:253-257`, `:348-349`), against the 7b convention.
- `DatapackCatalogView.tsx` is 442 lines (cap 350); `PackActions.tsx` 335.
- The Create picker starts empty (`useStorePicks.ts:114`); 7b says everything ticked.

## Map (today → decided)
- Card: opens the flyout, check and border when installed: done.
- Amber dot "Updated on Nov 9", never on a newer save → "Newer save available" exactly when Restore
  would install something newer (one rule shared with `restoreDatapack.ts` `targetVersion`).
- Flyout main: Install / Restore → Install; "Switch to Bodea" over another recorded datapack; "Restore
  My Luma" on the held one; Retry or Fix with AI on a failed one.
- Flyout Save Changes / Save As New → gone (saving lives in the header only).
- More menu → upper: Save as File, Undo Last Save, Share / Stop Sharing; lower: Uninstall, Delete. Bare
  verbs; Delete hidden on a Demo Builder datapack; Delete Store Configuration removed; "Permanently
  deletes it."; the library bar is More alone.
- Tag "Team" → "Demo Builder", "Mine" on own, one line; Show choice renamed.
- Dates → one absolute format, "Saved Nov 10, 9:15 AM".
- Header → project: save button, Install from File, Clear; library: Add from File alone. The save button
  is one state: pending (disabled), Save ▾ (Save, Save As New) on own, Save As New on someone else's,
  Create with none.
- Save → "Save Changes to My Luma": read-only type table, "4 changed", Review Records, Cancel and Save,
  no line. Save As New → its own window, one name field, empty or "My Bodea" from someone else's.
- Create → two windows: wide picker with everything ticked (Cancel, Next), then the name (Back,
  Cancel, Create).
- Save run → "Export from Commerce" with its types ("Exporting 19 of 38"), then "Save My Luma".
- Results → "Saved to My Luma", "Saved as Luma Holiday"; Create per P4-Q1.
- Failed creation install → card error dot and "Install failed", no check or border; flyout label and
  reason; Retry, then Fix with AI; dashboard bare name, error dot, hover "Install failed".
- Dashboard line "No Datapack" → pack name, else "None"; error dot when failed.

## Design
- **The failed install lives on the project** as `datapackInstallFailure?: { name, version, reason, at,
  retries }` (not on `ProjectDatapack`, which travels in project files). `installFailure.ts` owns:
  record on a creation install that did not end in success (partly counts as failed, P4-Q11); clear on
  a later success for that datapack, bump `retries` on a failure (where `watchAndRecord` ends); clear
  when `project.datapack` is cleared or moved. Old projects lack the field: nothing shows. The
  project-file export must not carry it (verify before S7).
- **One read**: `get-datapack-import-target` adds `installFailed: { reason, retries }`; the agent's
  `get_datapack_import_target` maps the same handler (description and doc change only).
- **Status words**: `DATAPACK_DISPLAY` `'install-failed'` → "Install failed", error; card and flyout use
  `IntegrationStatusLabel`; the health line stays in data-installer (`FailedHealthLine.tsx`).
- **Retry** starts the install, then opens the window on its run (Undo's pattern); Fix with AI once
  `retries >= RETRIES_BEFORE_FIX`, prompt built from the record (`from: 'install-failed'`).
- **One "newer" rule**: `restoreTargetVersion` in `packVersions.ts`, used by the handler and the card.
- **Header**: pure `headerSave(...)` → `'pending' | 'create' | 'save-menu' | 'save-as-new'`.
- **Save windows** in `ui/components/save/`: `SaveChangesWindow` (check, summary from
  `get-datapack-removal-scope` counts and `get-datapack-removal-changes` "N changed", Review Records)
  and `SaveAsNewWindow` (`FormDialog`, error room kept). Deleted: `SaveFromStoreModal.tsx`,
  `saveWords.ts`, the save stages, Add Items, the agent's `unused`; `selections` refused with a pack.
- **Create** is the flow dialog shrunk to two windows: picks (wide, everything ticked, Next disabled
  until something is ticked), then the name.
- **Save run**: `OperationRow` gains `types?`; a core `StepRows` extracted from `ImportRunView`, drawn by
  `OperationProgressBody`; `captureRows` returns Export from Commerce (types under it, "Exporting") and
  Save My Luma.
- **Install from File** (project): load, then open the job window on the new id; the replace question
  only when it already exists.
- **Size**: `useProjectHolding.ts` out of `DatapackCatalogView`; `packMenu.ts` out of `PackActions`.

## Slices (test first, gate green, branch commit)
- R1. `useProjectHolding` out of `DatapackCatalogView.tsx` (all `DatapackCatalogView-*` suites unchanged).
- R2. `packMenu.ts` out of `PackActions.tsx` (`PackActions.test.tsx`, `DatapackDetailPanel.test.tsx`
  unchanged).
- R3. Core `StepRows` and `OperationRow.types`, used by `ImportRunView` (job window suites unchanged;
  typed fixture in `tests/helpers/`).
- S1. Header save button, one state; Install from File in a project, Add from File in the library.
- S2. Save Changes and Save As New windows; Add Unused Items removed (UI and agent). Live save owed.
- S3. Create as two windows, everything ticked.
- S4. The save run as two steps (visual check on every bundle hosting the progress modal; live save).
- S5. The flyout bar and More menu (Switch to, no flyout save, bare verbs, Delete hidden on Demo
  Builder, Delete Store Configuration removed, library bar More alone).
- S6. Cards, tags, dates, the dot ("Demo Builder", one date helper, "Newer save available").
- S7. The failed install, extension side (field, record, clear and bump, read, agent text).
- S8. The failed install on screen (card, flyout, Retry, Fix with AI).
- S9. The dashboard line (name or "None", error dot with hover).
- S10. Phase 7's unwalked items (filter hint across Show, Show names, file action text and "Replace
  Existing", the wizard's Datapacks card, unused styles) with a visual check.

Redesign check after S2: rethink before S3 if the summary needs a third read, the hook passes 150
lines, or the name field's room does not hold one height. `AI_CONTEXT_VERSION` after Phase 8.

## Product questions (P4-Q1 to P4-Q11, each with a recommendation)
- P4-Q1 Create's result title: recommend "My Luma Created" (rule 21, thing first).
- P4-Q2 Named versions (`main`, `eds-compatible`): keep the card's picker only on a datapack with two or
  more named variants, labelled by variant; elsewhere one date line, "Updated Nov 6, 9:15 AM".
- P4-Q3 What "Save Changes to My Luma" counts: what the datapack holds plus "N changed"; records added
  by hand since install show only once saved. Ship that for beta.153; add "N added" only if the
  preview already sees additions.
- P4-Q4 The header when the held datapack has no install record: no save button; Create only with no
  datapack held.
- P4-Q5 Fix with AI across flyout reopenings: count retries on the failure record.
- P4-Q6 Delete on a named version of the SC's own datapack: delete the whole datapack, so "Permanently
  deletes it." stays true.
- P4-Q7 The file load's "Delete Store Configuration" result row: keep it as that load's undo, relabelled
  "Delete" beside "Store Configuration"; remove only the flyout's.
- P4-Q8 Agents deleting Demo Builder datapacks: keep it for agents, stated as a deliberate difference.
- P4-Q9 "The wizard's Datapacks card says what is in the datapack" (Clarity 1.19): the step's cards,
  with the type list the flyout shows.
- P4-Q10 Install from File when the datapack already exists: the replace question first, then the window.
- P4-Q11 A partly installed creation install: treat it as failed, with the run's reason.

## Risks
- Suites pinning old behaviour (PackActions, DatapackCard, catalogShow, projectPackNewer, the create-flow
  suites, capturePhases and runRows, DatapackCatalogView-storeChanges and -layers,
  datapackLineHandler): port, then delete; never delete a red test to get green.
- SOP pins: god-file ratchet, modal-layouts, ui-label-case, stable-hook-arguments, cited-identifiers.
- Agent surface: S2 removes two inputs, S7 adds a field; descriptors, counts, doc and skill together.
- Existing projects: the failure field is optional; the project-file export must not carry it.
- CSS reach: `integration-cards.css` reaches the wizard (which renders `DatapackCard`); step rows in the
  shared progress modal reach every bundle hosting it. Visual check before and after S4, S6, S10.
- Window heights and live cycles need the owner.
