# Step 07: the owner walk's new work (2026-11-13)

Written 2026-11-13 from a read-only mapping pass (architect agent) and saved by the session.
Sources: `decisions.md` "Owner walk of the loop's questions (2026-11-13)"; the loop report
`.rptc/handoff/2026-11-12-loop-report.md`; step-03 to step-06; `prototype-conventions.md`; the code
at `abb904886`. Where they differ, `decisions.md` wins. Symbols are cited, not line numbers.
Spot-checked by the session: `forgetRemovedPack` exists and is called on reset; `datapackDataRemoval.ts`
has no `leftInStore` handling; `AGENT_PREFIX = 'Agent ·'`.

## Already built (no slice)
- **S7-b, reset clears the datapack.** `forgetRemovedPack` (`eds/services/reset/edsResetSampleData.ts`)
  clears `project.datapack`, drops the stale failure and saves; `removeProjectSampleDataOutcome` calls it
  whenever a removal took everything. Every reset door runs through it (step-05 R1).
- **P4-Q11, a partly installed creation install is failed, with the run's reason.** `creationFailureReason`
  (`data-installer/services/installFailure.ts`), recorded by `executeSampleDataPhase` through `recordOutcome`.
- **P4-Q1, "My Luma Created".** `useSaveStoreChanges` `successTitle`.
- **P5-Q7 in Reset and Delete.** One-project Reset and Delete use the batch window; `BatchSaveTable` draws a
  name field on every row, own datapack included (`namesOf`, `nameProblems`, `changesOf` in
  `data-installer/saveAsName.ts`). Switch, Uninstall and Clear are slice D4.
- **Q10, extension side.** After a switch's old datapack came out, `recordDatapackOnProject`
  (`importJobWatch.ts`) records the new one; Retry reaches `settleReplacement`, where `replacesHeld` is false
  for the same name and version, so Retry installs only the new datapack. The line on screen is slice I2.

## Found first (not built)
- **R1-a:** `removeDataBeforeDelete` (`projects-dashboard/services/datapackDataRemoval.ts`) stops only on
  `kept`; `{ leftInStore: true }` returns `undefined`, so `runProjectDelete` deletes the files. The removal's
  `note` exists on the job (`importJobRunner` `latest.note`); `runSampleDataJob` drops it, and
  `SampleDataResult` and `DatapackRemoval` have no field for it.
- **R1-b:** `applyDatapackChange` (`project-creation/handlers/executorEditDatapack.ts`) ignores what
  `removeProjectSampleData` returns, then sets `project.datapack = config.datapack` and installs.
- **S1-a:** `saveRows` (`projects-dashboard/ui/batchChoices.ts`) leaves out own rows when `alwaysSave` is on;
  nothing says so.
- **P5-Q7 for one datapack:** `useSwitchChanges` gives `saveAs` only when `packName` is undefined;
  `SaveChangesBody` draws the field only then.
- **P5-Q8:** `offerToKeepContent` (`demoSourceCheck.ts`) is a modal VS Code dialog inside `resetEds`
  (`edsResetUI.ts`), not gated for a batch; `showWarningMessage(sourceCheck.message)` pops up mid-run.
- **S3:** `forwardToBackgroundNotice` (`core/vscode/operationBackgroundNotice.ts`) ends a success with a
  status-bar "— done" or an information/warning message; none closes itself. The house self-closing popup is
  `BaseCommand.showProgressNotification` (`withProgress`, then `sleep(TIMEOUTS.UI.NOTIFICATION)`).
- **Q3:** `leftToKnow` (`ui/components/importResult.ts`) appends `record.searchDelay`, so a clean install
  always has a line.
- **Q8:** only Restore ends "Is Up to Date" (`restoreAnswer` in `useJobResult.ts`).
- **Q9 and S6:** `progressFrame` (`OperationProgressBody.tsx`) colours a success only by `warned`;
  `ProjectsBatchModal` `statusOf` the same. Kept edits arrive as `scLines`, already green.
- **S7-a:** `isCommerceStepComplete('business-structure')` reads `commerceStoreViewChosen`, set by
  `hasStoreViewCode` (store view only). The install needs website AND store view for the chosen backend
  (`resolveInstallTarget`, `SCOPE_KEYS` in `sampleDataInstall.ts`); otherwise `runSampleDataJob` returns
  `skipped: true`. The Datapacks step is never gated (`sampleDataSection`).
- **P4-Q2 and S9:** `VersionChoice` (`DatapackCard.tsx`) shows a Picker with one named version; `packLine`
  always adds the version on the dashboard (`handleGetDatapackLine`).
- **P4-Q4:** `headerSave` returns `'none'` with no install record; no Save and no Create.
- **S6-b:** `restoreIsNewer` and `newerOf` (`packVersions.ts`, `DatapackCatalogGrid.tsx`) only look at saves.
  Restore already reinstalls an updated Demo Builder datapack (`checkCommerce` `differs`).
- **S8:** `useImportRetry`, `useRetryInstall`, `useClearFixes` all `void` the
  `fix-datapack-import-with-ai` request; the refusal ("This datapack has no failed install to fix.") is never
  shown. `useClearFixes`' `openAdmin` keeps a refusal as `adminProblem`: the pattern to reuse.
- **S10-a:** `catalogShow.ts` `'recommended'` = own + Demo Builder + Data Installer `shared`. `DEFAULT_SHOW`
  used by the screen and `SampleDataStep`; `ShowElsewhereNote` has "Show Recommended". The agent's
  `find_datapacks` without `includeCommunity` also returns the service's shared packs (`readDescriptors.ts`).
- **S3-a:** the save takes item ids only (`selectionsOf`, `Selections` in `pickableKinds.ts`); a whole type
  is read on Next (`useStorePicks`); agent `SELECTIONS` is ids only.
- **S3-b:** Create picker "N selected" (`noteOf`, `StorePicksStage.tsx`); projects list "N of M selected"
  (`SelectionCount`); Assign ERP Products "N selected, all from X." (`AssignErpProductsModal.tsx`).
- **P4-Q3:** `KindChanges` (`storeChanges.ts`) cannot see hand-added rows; the save already takes them
  (`saveStore.ts` header, `demoUses.ts`).
- **Install from File:** `CatalogHeaderActions` says the job window after the load "is not wired yet";
  `LoadDatapackFileModal` has a pack Delete and "Delete Store Configuration"; `load-datapack-zip`
  (`datapackZipHandlers.ts`) has `update` only.
- **C7-a:** `work-row.css` keeps `.work-row-problem` on one line only for `:not(.work-row--dense)`.
- **P4-Q8:** `delete-library-datapack` (`datapackLibraryHandlers.ts`, both paths) has no Demo Builder check.
- **"Agent · ":** `AGENT_PREFIX` (`ai/server/agentNotice.ts`) is the one source; the words also appear in
  `agentAlertCopy.ts`, `toolNarration.ts`, `docs/systems/agent-alerts.md`,
  `.claude/skills/mcp-tool-authoring/SKILL.md` and four test suites.
- **Agent-reach scan:** `handler-keys.mjs` matches only `export const X = defineHandlers({` (misses
  `createDemoDataHandlers` and `INSTANCE_CLEAR_TOOL`); `coverage.py`'s `UI` regex files every `copy…` handler
  as screen-only.
- **Six windows:** ledger rows in `tests/sop/modal-layouts.test.ts` for `SetupGuideModal`, `ShareModal`,
  `AddDemoModal`, `AddIntegrationFlowModal`, `ProjectsBatchModal`, `UpdatesModal`. `ProgressDialog` has no
  `hideClose` and is M at most. `modal-hosting.test.ts` reads only `Modal` imports, so a bare `StepsWindow`,
  `ResultWindow`, `ConfirmActionWindow` or `SaveFirstWindow` with no container passes.

## Design decisions
- **Removal answers carry what was left.** `note?: string` on `SampleDataResult` and `DatapackRemoval`;
  `removeDataBeforeDelete` stops on `leftInStore`: "Part of its datapack was left in Commerce, so the project
  was kept: <note>". One function serves the batch row and `delete_project`.
- **Edit's datapack part returns a stop.** `applyDatapackChange` uses `removeProjectSampleDataOutcome`; on
  `kept` or `leftInStore` it keeps the old `project.datapack`, installs nothing, returns the line into
  `warnings`. Rest of the Edit: Q1.
- **One name box rule.** `useSwitchChanges` builds one `PackRow` and uses `namesOf`, `nameProblems`,
  `changesOf`. Own datapack starts with its own name: untouched sends `{changes:'keep'}`; another name sends
  `saveAs`; never the own name as `saveAs`.
- **Self-closing background popup.** Extract `showSelfClosingNotice(title, ms)` into `core/vscode/` from
  `BaseCommand.showProgressNotification` (BaseCommand calls it; no second copy). `backgroundOperation` takes
  `doneTitle` and `failedTitle`; all five senders pass the result's words.
- **One amber rule.** `runEnding.ts` `endStatus(run)`: amber on a `warning` or any row (nested included)
  with a `problem` (refused or failed); a `note` only stays green and keeps the window open. Used by
  `progressFrame`, `ProjectsBatchModal` `statusOf`, `UpdatesModal` `runFrame`, `runResult`.
- **Up to Date, one result.** `upToDateResult(name)` in `importResult.ts`; pure `isUpToDate(preview)`.
- **Install target, one rule.** `SCOPE_KEYS` and `resolveInstallTarget` move into pure
  `data-installer/installTarget.ts`, read by `sampleDataInstall.ts` and the wizard.
- **Whole types in the save.** `wholeKinds?: PickableKind[]` beside `selections` on `start-datapack-export`,
  `save-store-changes` and both agent tools; the extension lists each whole kind inside the run. The read on
  Next goes.
- **"N added" from what the save takes:** `demoUses` rows the installed datapack does not hold, per kind.
- **Fix with AI refusal:** one hook `useFixWithAi(from)` replaces the three senders.
- **Hosting check, transitive:** any `*Window` export of a layout file, plus any component rendering one
  without a host; consumers must host it or appear in `HOSTED_BY_PARENT`.

## Slices (test first, gate green, branch commit)

**Data safety**
- **D1. Delete stops when part was left (R1-a).** `sampleDataInstall.ts`, `resetDatapackStep.ts`,
  `edsResetSampleData.ts`, `datapackDataRemoval.ts`. Tests: `datapackDataRemoval`, project deletion (files
  kept), `deleteProjectTool-data`. Surface: projectsList. Live: batch delete cycle.
- **D2. Edit stops on a failed old-datapack removal (R1-b).** `executorEditDatapack.ts`,
  `executorEditApply.ts`. Surface: wizard. Live: Edit cycle. Depends on Q1.
- **D3. The always-save line (S1-a).** `batchChoices.ts` `savedBySetting`, `BatchResetQuestions.tsx`,
  `InstanceClearWindow.tsx`, `BatchSaveTable.tsx`. "My Luma is saved first (your setting)." /
  "My Luma and My Bodea are saved first (your setting)." Surfaces: projectsList, dashboard, dataInstaller.
- **D4. Name box on the one-datapack question (P5-Q7).** `useSwitchChanges.ts`, `SaveChangesBody.tsx`,
  `useJobSwitch.ts`. Surface: dataInstaller. Screenshot owed. Representative slice.
- **D5. Added demo with its site down (P5-Q8).** `edsResetUI.ts`, `demoSourceCheck.ts`, `projectsBatch.ts`:
  delete `offerToKeepContent` and the mid-run warning; keep content, row line. Surfaces: projectsList, dashboard.

**Engine (live cycle owed before done)**
- **E1. "N added" (P4-Q3).** `demoUses.ts`, `storeChangesHandlers.ts`, `removalChanges.ts`, the Save Changes
  window, `installRows.ts` ("4 changed, 2 added"), agent descriptor. Live: install, add a product by hand,
  Save Changes shows "1 added", save, reinstall sends nothing.
- **E2. Whole-type tick skips the read (S3-a).** `pickableKinds.ts`, `storeChangesHandlers.ts`,
  `saveStore.ts`/`capture.ts`, `useStorePicks.ts`, `dataInstallerDescriptors.ts`. S3-b label here (Q3). Live:
  Create with Products ticked whole on the test store. Rethink if listing a whole kind inside the run
  times out on a 2,000-product store.

**Install endings**
- **I1. Background popup (step-03 Q4/S3).** `core/vscode/selfClosingNotice.ts`, `baseCommand.ts`,
  `operationBackgroundNotice.ts`, `operationProgress.ts`, five senders. No webview surface.
- **I2. Clean install closes itself, Up to Date, stopped-switch line (Q3, Q8, Q10).** `importResult.ts`,
  `useJobResult.ts`, `useJobReads.ts`, `useJobPhases.ts`, `datapackJob.ts`. Line words: owner to approve
  (proposed "My Luma is already uninstalled. Retry installs Bodea."). Surface: dataInstaller.
- **I3. One amber rule (Q9, S6).** `runEnding.ts`, `OperationProgressBody.tsx`, `ProjectsBatchModal.tsx`,
  `UpdatesModal.tsx`, `importResult.ts`; contract test drives all four. Surfaces: dataInstaller,
  projectsList, dashboard, configure, integrations.

**Install from File**
- **F1. Replace or Keep Both (P4-Q10).** `saveAsName.ts` `copyName` ("My Luma Copy", then "My Luma Copy 2"),
  `datapackZipHandlers.ts` (`saveAs`), `LoadDatapackFileModal.tsx` split into `LoadFileForm.tsx`; agent
  `load_datapack_zip` gains `saveAs`. Surface: dataInstaller. Library write: one check owed.
- **F2. Add, then install; one Delete (P4-Q7).** `CatalogHeaderActions.tsx` opens `DatapackJobWindow` after a
  clean load; one result row, one Delete removing the datapack and any layer this load created
  (`RemoveFromLibraryButton` takes several ids). Must never remove a pre-existing layer.

**Datapacks screen**
- **P1. "Recommended" means yours + Demo Builder's (S10-a, revised Q4).** `catalogShow.ts`, `ShowElsewhereNote.tsx`,
  `SampleDataStep.tsx`, `EMPTY_SHOW_TITLE`; `find_datapacks` lists every datapack by default with its source. Surfaces: dataInstaller, wizard.
- **P2. Amber dot for an updated Demo Builder datapack (S6-b).** `packVersions.ts` `updatedSince`,
  `DatapackCatalogGrid.tsx` `newerOf` (hover "Luma updated Nov 12"). Surfaces: dataInstaller, wizard.
- **P3. No install record: Create plus the line (P4-Q4).** `headerSave.ts` (`'create-unrecorded'`),
  `CatalogHeaderActions.tsx`, the Create window (Q2). Surface: dataInstaller.
- **P4. Version only with two or more (P4-Q2, S9).** `packVersions.ts` `versionChoices`, `DatapackCard.tsx`,
  `libraryWriter.ts`, `datapackLineHandler.ts`. Surfaces: dataInstaller, wizard, dashboard.
- **P5. Fix with AI with nothing to fix (S8).** `ui/hooks/useFixWithAi.ts` replacing three senders.
- **P6. Small nested rows on one line (C7-a).** `core/ui/styles/work-row.css`. Visual baseline, all nine.

**Wizard**
- **W1. Website and store view before Continue (S7-a).** `data-installer/installTarget.ts` (moved),
  `sampleDataInstall.ts`, `commerceSections.ts` (both codes for the chosen backend; Datapacks step locked with
  "Choose a website and store view first" when a datapack is chosen and there is no target), `CommerceStep.tsx`.
  Edit: Q7. Surface: wizard.

**Agents**
- **A1. No delete of Demo Builder datapacks (P4-Q8).** One guard before both delete paths in
  `datapackLibraryHandlers.ts`; descriptor says so.
- **A2. "Agent: " everywhere.** `agentNotice.ts`, comments, two docs, the skill, four suites.
- **A3. Renames, AI_CONTEXT_VERSION 62 to 63.** `start_datapack_import` to `install_datapack`;
  `load_datapack_zip` to `add_datapack_from_file`; `mark_team_datapack` to `mark_demo_builder_datapack`
  (input `team` to `demoBuilder`); guide `import-datapack` to `datapacks`. No aliases. Every pinned site in
  src, tests, docs and the battery (`prompts.json`). `writeSkillFiles` removes the old skill by hash
  (ADR-013); a hand-edited copy is reported and left. Rerun `tool-verdicts`. Q5.
- **A4. Agent-reach scan.** `handler-keys.mjs` (any `defineHandlers({`, self-test case), `coverage.py` (drop
  `copy` from `UI`), `triage.json`. Control: `clear-demo-data` and `check-demo-data` appear.

**The six windows**
- **Win1. Progress layout extended; batch run and Updates run move onto it.** `ProgressDialog.tsx`
  (`hideClose`, `wide`, a question under a row), `ProjectsBatchModal.tsx`, `UpdatesModal.tsx`.
- **Win2. Share** onto `StepsWindow`: Copy Link and Save File in the footer, both forms in `reserve`.
- **Win3. Add a Demo and Add Integration** onto `StepsWindow`, held at the first stage, taller stages
  scroll, Back in `startButtons`.
- **Win4. Setup Guide:** `GuideDialog.tsx` `columns="two"`, then `SetupGuideModal.tsx`.
- **Win5. Hosting check covers layouts.** Positive control with an unhosted `StepsWindow` fixture.

## Order
D1 to D5, E1, E2, I1 to I3, F1, F2, P1 to P6, W1, A1, A2, A3 (one version bump covering E2, A1, A3), A4,
Win1 to Win5 (Win5 may go first: test-only). Live cycles run once, after the build (owner, 2026-11-13).

## Owner answers (2026-11-13/14)
- Q1 Edit: the rest of the Edit stands; only the datapack part stops, with its line.
- Q2 No install record: Create plus the line, in Create's first window (an exception to J3-2). Owner asked
  whether a record could be added instead: no, a record after the fact would be a guess, and Uninstall
  removes what the record lists (could delete the SC's own records). Restore writes a true one.
- Q3 Count label: "48 of 480 selected", as the projects list; a type ticked whole and unread says
  "All selected".
- Q4 / S10-a revised: keep the name "Recommended" with a new meaning, yours + Demo Builder's (owner's
  suggestion; now honest). Agents' `find_datapacks` lists EVERY datapack by default, each marked with its
  source (yours, Demo Builder, Data Installer, Community).
- Q5 Rename all old-worded tools together, one version bump: `start_datapack_import` to `install_datapack`;
  `load_datapack_zip` to `add_datapack_from_file`; `open_datapack_zip` to `read_datapack_file`;
  `reset_datapack` to `uninstall_datapack`; `start_datapack_export` to `create_datapack`;
  `mark_team_datapack` to `mark_demo_builder_datapack`; guide `import-datapack` to `datapacks`.
- Q6 Reset rows: amber when something that should have happened did not (not published, mesh redeploy
  failed); kept on purpose stays green.
- Q7 Edit without website/store view: the Datapacks step is locked with "Set the website and store view in
  Configure first."
- Q8 Install window cancelled after Install from File: the datapack stays in My Datapacks.
- I2 line: "My Luma was uninstalled. Retry installs Bodea."

## Back on track (owner, 2026-11-14)
See decisions.md "Back on track". Plan changes:
- Win3: Add a Demo and Add Integration open a tall stage as its own window (no body scrolling); a long
  list may scroll in its own pane.
- P3: Create where Save would be; no line.
- F1: Keep Both pre-fills "My Luma 2" (`copyName` follows J7-2's taken-name numbering).
- P2 becomes U1: "Update Luma" in the flyout for an updated datapack (writes only what the datapack
  changed, keeps the SC's edits), hover "Newer version available", with a type choice. Prototype first,
  owner walks it, then build; verify in the engine that an install skips rows edited since (the
  install record's fingerprints) before building. Live cycle owed.
- Agents keep chosen-type installs (step-03 Q2 stands), stated in the guide with the additive use case.
- Win1 also fixes the batch window growing when its questions replace the wait (319px to 446px).
- D3 follow-up: remove the save window's always-save line (`savedBySetting`, `savedFirst`); keep the
  run row's "Saved to My Luma.".
- I2: the stopped-switch line is "My Luma was uninstalled." only.
- U1: with an update available, "Update Luma" is the flyout's main button (owner: Update applies what
  changed; Restore goes back to a previous state).
- D-follow-up: rewrite `demoBuilder.dataInstaller.changesOnRemoval`'s description (words to the owner).

## U1 is cleared to build (J9 passed, 2026-11-14)
Build Update <pack> and the Restore design exactly as prototype J9 draws them
(`mockups/flow/j9-*.tsx`, `scenarioUpdate.ts`; decisions.md "Where 'back' goes" and "J9 ... passed").
Includes: the original kept for good beside the two newest saves; Last Saved / Original choice; the
save question only for Original; Update's type choice for screen and agents; "Updating 24 of 48".
Live cycle owed (update, restore to original, restore to last saved).

## D6 (owner 2026-11-14): removals go where the data went
- The removal target is the install record's website/store view first, today's codes only as fallback
  (E-group built it the other way round, bb2d03e27).
- The install record notes the Commerce instance (the backend's identity, from the project's commerce
  config); a removal on a different instance stops with "Luma is installed on another Commerce instance.
  Switch the project back to remove it." Older records without it keep today's behaviour.
- Configure: changing the Commerce connection while a datapack is installed warns first and offers to
  uninstall it (house confirm window; words for the owner to approve at the screenshot pass).

## D6 built (2026-11-14)
Committed after review (one blocking: a same-pack reinstall on a new instance reused the old record;
fixed in the engine). Known limit, recorded not fixed: install records written before D6 never gain an
instance, even after a reinstall, because backfilling on carry-on is unsafe for the same reason; those
projects are protected only by the Configure/Edit question. Clear Demo Data's single-project wipe still
respects other projects' records without reading their instance (only Clear Commerce Instance does).
Owed at the screenshot pass: the Configure confirm's words, Uninstall First red or blue, Edit's VS Code
dialog with the same words.

## Built (2026-11-14)
Every slice committed, each through the full gate; store-writing groups reviewed independently first:
D1-D5 2a7ab54c9; E1/E2 bb2d03e27; D6 02571298f; U1 02e089000; I1-I3 c05614c05; F1/F2 34425b608;
P1/P3-P5/A1/A2 0243361d6; W1/P6 5bc1f4b29; A4 + clickable step + screen mark 742fbd56c; A3 cc86048f1 and
18a2b80a2; Win1-Win5 4aaa357d4 and fc07b2d10; af1d6622d (empty dialogs over the projects list, found by
the visual baseline). Visual baseline vs the last push (b79801c87): 8 surfaces x 2 themes x 3 widths,
zero differences at af1d6622d. Owed: push (owner go), live cycles, screenshots.

## Risks
- Cloud operations: E1, E2, F2's install half; live cycles with the owner's go, through MCP tools.
- Reversibility: F2's Delete removes exactly what the load created.
- Existing projects: A3 removes the old skill by hash; one version bump.
- Mocks: `SampleDataResult`, `DatapackRemoval`, `RemovalAnswer`, `LoadOutcome`, `ChangePreview` typed in
  `tests/helpers/`.
- Size caps: `LoadDatapackFileModal.tsx`, `ProjectsBatchModal.tsx`, `edsResetUI.ts`, `commerceSections.ts`.
- SOP pins: `ui-label-case`, `modal-layouts`, `modal-hosting`, `modal-steady-height`, `progress-surface`,
  `stable-hook-arguments`, `cited-identifiers`, tool counts.
- CSS reach: P6 and Win1.
- Window height: D3, D4, Win1 to Win4 need screenshots.
