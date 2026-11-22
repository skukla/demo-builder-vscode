# Phases 3 to 5 build plan: the datapack install window, one window per phase

Written 2026-11-12 by a read-only mapping pass (architect agent), from `decisions.md`,
`prototype-conventions.md`, overview Phases 3 to 5, the walked prototype in `mockups/flow/`, and
the code at `cb22d910a`. The prototype is the agreed picture; where this plan and older plan text
disagree, `decisions.md` wins.

## What the pass found first
- Decided changes not yet in the product: the install window still has data-type checkboxes, website
  and store pickers and a "missing dependencies" line (`ImportForm.tsx`); the save question still has
  the "Always Save Without Asking" box (`RemovalConfirmBody.tsx:74`); Switch is not in the verb table
  (`datapackWords.ts`).
- The type table and Review Records exist only in the prototype (`TypeSummary.tsx`, `proto-j1.html`
  CSS); install needs them before Phase 6 does, so this step builds them.
- Review Records has no data source: the changes preview keeps only 3 names per type
  (`saveOutcome.ts:23`).
- The run window cannot tell a restore from an undo: the job record carries only
  `operation: 'import' | 'reset'` (`types.ts:423`).

## 1. Map: today's window to the decided windows

Today `ImportDatapackModal.tsx` (349 lines, at the cap) runs every state through `resolveView`
(`importModalView.ts:69`) inside one `Modal`, and is on the `modal-layouts` ledger.

| Today | Decided (prototype, decision) | Change |
|---|---|---|
| Form: type checkboxes, pickers, dependencies line, "Replaces ..." (`ImportForm.tsx`, `ImportDatapackModalBody.tsx:147`) | Summary: type table, bare counts, Review Records, Dry Run and Install (`j2-windows.tsx:95-114`) | Form deleted; whole pack; target from the project's scope |
| Check wait only when the project holds the pack (`useImportChanges.ts:56`) | Check wait before every summary | Preview runs for every install (add and update counts) |
| No spot check | Review Records, Back only (`TypeSummary.tsx:182`, rule 19) | New; needs a full-names read |
| Dry Run result inside the window (`importModalView.ts:204-208`) | Own small window: Back and Install; Back and Fix with AI; Back and Retry (J2-4) | New window, Fix with AI and Retry |
| Replace: changes read after Import (`useReplacement.ts:126`) | "Switch to Bodea?" over the table; "Save Your Changes First?" only with edits (J2-3, J8-1) | Read moves into the check; words become Switch |
| Save question with names, Always box, Save As field (`RemovalConfirmBody.tsx:37-87`) | Counts by type, "Your changes will be lost if you don't save them.", no box; one-time tip after | Names, box, `alwaysSave` deleted; tip added |
| Uninstall: store-named title, "Permanently deletes ..." lines, a spinner (`WatchProgress`) | "Uninstall My Luma?" over the table (red), save question, run as steps (J5-1, J5-2) | Spinner deleted; steps reuse `ImportRunView` |
| Run titled "Installing ..."; row "Uninstall the Previous Datapack" (`importSteps.ts:88`) | Titled by job: Installing, Switching to, Uninstalling, Restoring; rows Save Your Changes, Uninstall My Luma, Install Bodea, Verify | Titles from a new record field; row "Uninstall <name>" |
| "Install Stopped" (`importResult.ts:243`) | "Couldn't Install Bodea" with Retry | Thing-first title (rule 21) |
| Clean end stays open with `searchDelay` or engine lines (`importResult.ts:215-222`) | "Bodea Installed", closes itself (rule 17) | See Q3 |
| Undo and Restore open this window titled "Installing My Luma" | "Restoring My Luma", ending "My Luma Restored" or "Last Save Undone" | From the record, so an agent's job shows right too |
| Restore's check waits in the flyout (`PackActions.tsx:229`) | Check window, then Up to Date, the question, or the run | Moves into the window (Q6) |
| Background end "Installing My Luma — done" (`operationBackgroundNotice.ts:91-104`) | The result's words; failure "Couldn't Uninstall My Luma" with Open Debug Logs | Shared code, every background job |

## 2. Design

- **One host, one container, one window per phase.** New `DatapackJobWindow.tsx` owns one
  `DialogContainer` and renders the current phase's window, each a layout component (`StepsWindow`,
  `ResultWindow`, `ConfirmActionDialog`, `ResultDialog`). The `ImportDatapackModal.tsx` ledger row goes.
- **A pure reducer**, `datapackJob.ts` (no React): kinds `install`, `switch`, `uninstall`, `restore`,
  `watch`; phases `check`, `summary`, `records`, `dry-wait`, `dry-result`, `question`, `save-first`,
  `run`, `ended`, `done`, `no-instance`. Keeps "result keyed on the last action" and "watch the job
  the last action started". `useDatapackJob.ts` holds the requests.
- **Windows**: `JobSummaryWindow` (check, summary, dry wait; uninstall frame red), `RecordsWindow`
  (wide, Back only), restore question (ConfirmActionDialog), `SaveFirstWindow` (verb a prop; Phase 6
  reuses it), `DryRunWindow` (ResultWindow), `DatapackRunWindow` (`ImportRunView` + `RunFoot`, reserve
  for the tallest state), the clean end (ResultDialog, closes itself).
- **Words in one table**: `jobWords(purpose, name)` in `datapackWords.ts`: install "Installing
  Bodea"/"Bodea Installed"/"Couldn't Install Bodea"; switch "Switching to Bodea"; uninstall
  "Uninstalling My Luma"/"My Luma Uninstalled"/"Couldn't Uninstall My Luma"; restore "Restoring My
  Luma"/"My Luma Restored"; undo "Restoring My Luma"/"Last Save Undone". Switch joins the verb table.
- **Runs started elsewhere**: `ImportJobRecord` gains `purpose`, set at each start (`importStart.ts`,
  `restoreDatapack.ts`, `undoLastSave.ts`, reset). A record without it derives purpose from
  `operation` and `replaces`. Opening on a running record starts at `run` with its titles.
- **Data**: summary counts from `preview-datapack-changes` for every install; uninstall's table from
  per-kind counts on `get-datapack-removal-scope`; Review Records from a new webview-only
  `get-datapack-records` (row names by `keyOf`); the save question from
  `get-datapack-removal-changes`, counts only.
- **Deleted in the slice that obsoletes each**: `ImportForm.tsx`, `useTypeSelection.ts`, the picker half
  of `useImportScopes.ts`, `MissingDependencies`, `typesInSentence`, `recordedRemovalLines`,
  `WatchProgress`, `useReplacement.ts`, `useRemovalWindow.ts`, the Always box with `alwaysSave`,
  `rememberAlways` and `alwaysSaveChangesOnRemoval`; at the end `ImportDatapackModal.tsx`,
  `ImportDatapackModalBody.tsx`, `importModalView.ts` and the flyout's restore wait.
- **Type table** lives in `ui/components/typeSummary/` in data-installer, CSS in `data-installer.css`.
- **Hypothesis check after S4**: redesign before S6 if the host passes 200 lines, the reducer needs
  request objects, or the run's reserve cannot hold one height.

## 3. Slices (each: test first, green gate, branch commit)

- **S1. One rule for "ends small", one `RunFoot`.** `core/ui/utils/runEnding.ts` `endsSmall()` used by
  `importResult.ts` `runResult`, `UpdatesModal.tsx`, `ProjectsBatchModal.tsx`,
  `OperationProgressBody.tsx`; `core/ui/components/feedback/RunFoot.tsx` used by `ImportRunView`,
  `OperationProgressBody`, `ProjectsBatchRunView`, `DatapackResultBody`. Contract test drives all
  four; its first case is the known bug (a save with a problem row and no warning ends small). Fix
  the stale "labelled Took row" comment in `useRunClock.ts`.
- **S2. Job purpose and the decided run titles in today's window.** `purpose` on the record, `jobWords`,
  "Couldn't Install <name>", row "Uninstall <name>". Additive field for agents. Depends on Q5 for
  restore and undo failure titles.
- **S3. Background endings in the result's words.** `doneTitle`/`failedTitle` on `backgroundOperation`;
  success quiet, warning stays, failure with Open Debug Logs; all four senders. Depends on Q4.
- **S4. First install in the new window** (representative slice): reducer, hook, host, summary,
  records, Dry Run and run windows, type table, `get-datapack-records`. Deletes the form and pickers.
  Ports the still-true cases of `ImportDatapackModal.test.tsx` first. Live cycle owed.
- **S5. Dry Run Found a Problem: Fix with AI**, prompt built from the recorded dry run.
- **S6. Switch and the save question**; Always box gone; one-time tip via a webview-only message;
  agent and consent text say Switch. Depends on Q1. Live cycle owed.
- **S7. Uninstall as steps; the old modal goes**; ledger row removed; mutation rows deleted or
  re-anchored (Python `json.dumps(indent=4)`). Depends on Q7. Live cycle owed.
- **S8. Restore's check in the window.** Depends on Q6.

Not in this step: the card with no Install button, the amber hover, the failed-install state, the
dashboard line, the setting's description, `AI_CONTEXT_VERSION` (after Phase 8).

## 4. Product questions for the owner (with recommendations)

- **Q1. Save As name in a one-row save question** (someone else's pack). Recommend the J7-2 field,
  pre-filled "My Bodea", only when the pack is not the SC's, so the question looks the same in Switch,
  Uninstall, Reset and Delete.
- **Q2. Agents installing a subset.** The screen installs the whole pack; `start_datapack_import` takes
  `dataTypes`. Recommend keeping it for agents, stated as a deliberate difference; revisit in Phase 8.
- **Q3. A clean install's leftover lines** keep it from closing. Recommend dropping the search-delay
  line (rule 7); keep engine lines that report kept SC edits.
- **Q4. "Closes on its own" in VS Code**: an information notification cannot dismiss itself.
  Recommend a status-bar message for success; failure stays as a warning with Open Debug Logs.
- **Q5. Failed titles for Restore and Undo.** Recommend "Couldn't Restore My Luma" and "Couldn't Undo
  Last Save", each with Retry, then Fix with AI by the existing retry rule.
- **Q6. Restore's check moving from the flyout into a window**, as the prototype shows. Recommend yes.
- **Q7. The store name leaving the Uninstall title** (added after a 2026-10-31 near-miss; J5-1 decides
  "Uninstall My Luma?"). Recommend following J5-1.
- **Q8. Installing a pack Commerce already fully matches.** Recommend ending at the check on
  "<name> Is Up to Date", as Restore does.

## 5. Risks
- About 4,600 test lines across 15 suites pin today's window: port each still-true case before
  deleting old suites; never delete a red test to get green.
- Hand-written mocks of the job record and removal answer go stale silently when `purpose` is added and
  `alwaysSave` removed: audit them and type fixtures in `tests/helpers/`.
- Agent surface: no input changes; `purpose` is additive; Switch wording moves with S6.
- Mutation ledger anchors on rewritten files must be deleted or re-anchored honestly.
- Size caps: components 350, utils 300; the host stays a picker of windows.
- Window height (rule 14) and the live cycle (S4, S6, S7) need the owner: nothing here can see the
  webview or write to the test store.
