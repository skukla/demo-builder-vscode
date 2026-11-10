# Datapack modals: audit against the dialog standard

Audit of branch `fix/release-walk-fixes` with its uncommitted changes, 2026-11-10. Read from the
code and the stylesheets only. Nothing was edited, run, reloaded or sent to Commerce.

**I could not see a rendered webview.** Every size and gap below is read from CSS, not measured.
The `webview-visual-baseline` harness was not used: its fixtures hold no datapack requests
(`.claude/skills/webview-visual-baseline/build-fixtures.mjs` has none), so the Datapacks screen
would sit on its first wait and no modal could open without inventing response shapes.

Paths are under `src/`. `DI/` is `src/features/data-installer/`. `SOP:n` is line n of
`docs/development/sop/dialog-design.md`. Quoted strings are copied from the file cited. "My Luma",
counts and dates inside a quote are examples.

This builds on three earlier reviews and does not repeat them: Flow
(`.rptc/research/datapack-flow-review/`), Clarity (`.rptc/research/datapack-clarity-and-layout/`),
Versions (`.rptc/research/datapack-versions-and-wording/`). Where one of their findings is still
open in the code it is cited, not restated.

## The reference modals

Three non-datapack modals, chosen because the standard or the house component list names each as
the model for its layout.

| Reference | Layout | Why | File |
|---|---|---|---|
| Updates | Form, then a run on rows, then the small Result | The standard names it as the model run (`SOP:73-98`) | `features/projects-dashboard/ui/components/UpdatesModal.tsx` |
| Add Another ERP | Form with a wait | Named by `core/ui/components/CLAUDE.md` for `LeadText` and `SectionLabel` | `features/dashboard/ui/components/AddErpDialog.tsx` |
| "Fill X from Commerce?" | Confirm | The plainest use of the house confirm (`ConfirmActionDialog`) | `features/dashboard/ui/components/integrations/ErpConfirmDialogs.tsx:94-107` |

What they do, for comparison:

| | Updates | Add Another ERP | Fill confirm |
|---|---|---|---|
| Width | large; clean result small | medium | small |
| Way out on the form | "Close" | "Close" | "Cancel" |
| Main button | "Apply 3 Updates", accent | "Add", accent | "Fill", accent |
| Lead | `LeadText` | none | three `dialog-line` rows, 8 apart |
| Rows | `WorkRow`, 8px padding, name not bold | Spectrum `Flex`, 16 apart | `dialog-rows` |
| Clean result | "Updates Applied", title alone, small, stays | n.a. | n.a. |
| Failed run | "Couldn't Apply the Updates", "Open Debug Logs" | n.a. | n.a. |

The references are not perfect either. Add Another ERP spaces its groups with Spectrum `Flex`
gaps and utility classes (`AddErpDialog.tsx:128-136,216`), not house classes.

## 1. Scorecard

P pass, F fail, a dash where the column does not apply. 13 of 63 states pass every column.

| # | Modal state | Layout | Spacing | Hierarchy | Language | Success | Worst finding |
|---|---|---|---|---|---|---|---|
| 1 | Install form, first install | P | F | F | F | - | "Import", "Dry Run"; own row and label classes |
| 2 | Install wait, "Reading websites" | P | P | P | F | - | Second line adds no fact |
| 3 | Install wait, "Checking for your changes" | P | P | P | F | - | "Since this demo's last save" |
| 4 | Install form, same version again (counts) | P | F | F | F | - | "What importing again would change could not be read." |
| 5 | Install form, replacing (lead) | P | F | P | F | - | 32px under the lead, 16 everywhere else |
| 6 | "Save Your Changes First?" | P | P | P | F | - | Rejected phrase in the lead |
| 7 | "Couldn't Check for Changes" (install) | P | P | P | F | - | Rejected phrase |
| 8 | Install run on steps | P | F | F | F | - | Rows 12px, titles bold; "Verify the Import" |
| 9 | Clean result "My Luma Imported" | P | P | P | F | P | Old word; sends the SC to "Version History" |
| 10 | Ended with a problem, on steps | P | F | F | F | - | Same rows as 8 |
| 11 | "Import Stopped" | P | F | F | F | - | Title does not name the datapack |
| 12 | "Import Stopped", the save failed | P | F | F | F | - | Same |
| 13 | "Couldn't Import My Luma" | P | P | P | F | - | Old word only |
| 14 | Dry run wait | P | P | P | F | - | "Nothing is written" |
| 15 | Dry run results (three) | P | P | P | F | F | Three names for one answer; "Nothing was written." |
| 16 | No Commerce | P | P | P | F | - | A sentence as the title; "import from here" |
| 17 | Data Installer run endings (five titles) | P | P | P | F | - | "Did Not" beside "Couldn't" |
| 18 | Uninstall wait | P | P | P | F | - | Same second line as 3 |
| 19 | Uninstall question, nothing changed | F | F | P | P | - | Medium; its lines 16 apart, Delete's 8 |
| 20 | Uninstall question, with changes | F | P | P | F | - | Three long buttons at medium |
| 21 | Uninstall, changes saved without asking | F | P | P | P | - | Medium |
| 22 | "Couldn't Check for Changes" (uninstall) | F | P | P | F | - | Rejected phrase |
| 23 | Uninstall running | F | P | P | F | - | A spinner, not steps; "Minutes; varies by pack" |
| 24 | Clean result "My Luma Uninstalled" | P | P | P | P | F | "Took ..." on a clean result |
| 25 | Uninstall, one Admin step left | P | P | P | F | - | "Action Required to Uninstall My Luma" |
| 26 | "Couldn't Save Changes" (uninstall) | P | P | P | F | - | Title names no datapack |
| 27 | "Couldn't Uninstall My Luma" | P | P | P | P | - | None |
| 28 | Save Changes | F | F | F | F | - | Large for one sentence; lead in its own class |
| 29 | Save As New Datapack, name | F | F | F | F | - | Large for one field |
| 30 | Add Unused Items | P | F | F | F | - | Lead and note in their own classes |
| 31 | Create Datapack, name and picks | P | F | F | F | - | Same; "Couldn't be read" and "Couldn't load" |
| 32 | Pick wait, "Reading from Commerce" | P | P | P | F | - | "What there is to select" |
| 33 | Save running, rows | P | P | P | F | - | "Saving My Luma"; install says "Import My Luma" |
| 34 | Clean result "My Luma Saved" | F | P | P | F | F | Body repeats the title; shows an id; medium |
| 35 | "No Changes to Save" | F | P | P | P | P | Medium; closes itself after 1.5 seconds |
| 36 | "Couldn't Save My Luma" | P | P | P | F | - | "Open Debug Logs" here, "Fix with AI" on install |
| 37 | Version History | P | P | F | F | - | "(in use)"; "goes back to the version you choose" |
| 38 | Delete Datapack confirm | P | P | P | P | - | None |
| 39 | Delete Store Settings confirm | P | P | P | P | - | None |
| 40 | Share confirm | P | P | P | P | - | None |
| 41 | Stop Sharing confirm | P | P | P | P | - | None |
| 42 | Flyout waits (five) | P | P | P | P | - | None |
| 43 | Flyout lines after an action | - | F | F | F | - | Own note class; "It could not be changed" |
| 44 | Load from File, form | P | F | F | F | - | Lead in its own class; raw setting paths |
| 45 | "My Luma Loaded" | F | F | P | F | P | A Delete button inside the body |
| 46 | Load, partly or failed | P | P | P | F | - | Old word only |
| 47 | Save as File (system dialog) | - | - | - | P | - | None |
| 48 | Clear Demo Data wait | P | P | P | F | - | "Each data type, in Commerce" |
| 49 | Clear Demo Data form, nothing ticked | P | P | P | F | - | Lead hard to read; "Choose" then "Select" |
| 50 | Clear Demo Data preview | P | P | P | P | - | None |
| 51 | "Couldn't Read the Stores" | P | P | P | P | - | None |
| 52 | Clear running | P | P | P | F | - | Store codes under the title |
| 53 | "Demo Data Cleared" | F | P | P | P | F | Store codes again; medium |
| 54 | Admin setup step dialog | F | P | P | F | - | Medium; the Guide layout is large |
| 55 | Reset: "Uninstall My Luma Too?" (VS Code dialog) | - | - | - | P | - | None |
| 56 | Reset: changes question in the progress window | P | P | P | F | - | Same question as 20, no title, other buttons |
| 57 | Reset: "Clear Demo Data Too" (VS Code dialog) | - | - | - | F | - | One long paragraph |
| 58 | Reset Selected question | P | P | P | P | - | None |
| 59 | Reset or Delete Selected, "Datapack Changes" | P | P | P | F | - | "Changed since installed." |
| 60 | Delete Selected question | P | P | P | P | - | None |
| 61 | Delete one project, in the window | P | P | P | F | - | "My Luma, from this demo's Commerce instance." |
| 62 | "Projects Reset", "Projects Deleted" | P | P | P | P | P | None |
| 63 | Agent consent for datapack tools (VS Code dialog) | - | - | - | F | - | "Import sample data"; ids; a 60-word sentence |

## 2. Findings, most visible to an SC first

### F1. The old words are still on every window (large, wording only)

Decided 2026-11-10 (`.rptc/plans/datapack-simplification/overview.md:39-44`): Install and
Uninstall, Add from File and Save as File, Check First. The code still says:

| Old word | Where an SC reads it | Main files |
|---|---|---|
| Import | Button "Import"; titles "Import My Luma", "My Luma Imported", "Import Stopped", "Couldn't Import My Luma", "Some Data Types Not Imported", "Import Did Not Start", "Import Status Unknown"; buttons "Import Anyway", "Import Without Saving", "Save and Import", "Save As New and Import"; step "Verify the Import"; sentences "Importing replaces them.", "then import from here", "What importing again would change could not be read." | `DI/ui/components/importModalView.ts:177,191,216,327,347-358`; `importResult.ts:111,193,240-242,301-313`; `RemovalConfirmBody.tsx:24,30`; `PackActions.tsx:243`; `ImportForm.tsx:244`; `ImportDatapackModalBody.tsx:40`; `DI/importSteps.ts:192`; `DI/uninstallWords.ts:14-24` |
| Load | "Load from File" (button and title), "Load", "My Luma Loaded", "Partly Loaded", "Couldn't Load My Luma", "Loaded 3 of 5 data types." | `CatalogHeaderActions.tsx:85`; `LoadDatapackFileModal.tsx:125,133,187-196` |
| Dry Run | Button "Dry Run"; "Dry Run Passed", "Dry Run Failed", "Validation Failed"; Activity's "Dry Run" | `importModalView.ts:214`; `importResult.ts:256-260`; `DI/ui/views/DatapackActivityView.tsx:54` |
| In agent consents | "Import sample data", "Export sample data", "Load a datapack file" | `features/ai/server/agentAlertCopy.ts:435,442,491` |

The standard itself still says Import in six places (`SOP:30,76,89,100-102,108,133`). Fix it in the
same change.

Fix: plan Phase 1. One module of words per action, as `uninstallWords.ts` started.

### F2. The wait an SC watches longest reads poorly (small)

The check before installing again, replacing and uninstalling takes about a minute. It shows
"Checking for your changes" over "Since this demo's last save" (`core/utils/waitStages.ts:37-41`).
The owner rejected that second line. The same phrase is in all four sentences of the question that
follows (`RemovalConfirmBody.tsx:23-32`): "You changed these since this demo's last save. Importing
replaces them."

Other second lines on datapack waits that add no fact: "From this demo's Commerce instance"
(`waitStages.ts:28`), "Nothing is written" (`:45`), "What there is to select" (`:49`), "Each data
type, in Commerce" (`:65`), "From your Commerce instance" with "Minutes; varies by pack"
(`core/utils/creationStages.ts:80-84`).

Rule: a wait has no second line unless it adds a fact (plan, "Rules for every phase"). Versions
B.1 and B.2 give a replacement for each. Still open.

Fix: delete the second line of `checkingForChanges`. Leads become "Installing replaces these
changes." and "Uninstalling removes these changes."

### F3. The save's result repeats its title and shows an id (small)

Title "My Luma Saved" (`DI/ui/hooks/useSaveStoreChanges.tsx:96`). Body "Saved a new version of My
Luma." (`DI/services/demoBuilderEngine/saveOutcome.ts:62`). Under it, when the datapack has
settings: "Its 4 store settings are saved beside it, in my-luma-x1-settings." (`saveOutcome.ts:105`)
and "Left out, because nothing selected them: 3 products." (`:86`).

Rules: "The body never repeats the title." (`SOP:139`). A save's version or id is never shown
(Flow 2.2's rule). Save As New has the same first sentence: "Acme Saved", then "Saved as Acme."

Fix: no body for a plain save. Save As New keeps only "Scratch 1028 now uses it." Settings: "Saved
with its 4 store settings."

### F4. Five clean results, four shapes (medium)

| Flow | Width | Closes itself | Extra under the title |
|---|---|---|---|
| Install | small (400) | no | nothing, or one sentence |
| Uninstall | small | no | the engine's note and "Took ..." |
| Save | medium (480) | no (it has a note) | F3 |
| "No Changes to Save" | medium | yes, after 1.5 seconds | nothing |
| Clear Demo Data | medium | no | the store codes, then a sentence |
| Load from File | small | no | one sentence and a Delete button |

- The shared progress window is always medium (`core/ui/components/feedback/OperationProgressModal.tsx:273`),
  so Save and Clear end at 480 where Install ends at 400. `SOP:38`: Result is small.
- A clean uninstall still shows "Took ..." (`importResult.ts:266-267`, drawn by
  `DatapackResultBody.tsx:51`). `SOP:77`: "No rows, no 'Took ...'". Flow 2.5 asked for this. Open.
- "No Changes to Save" is gone 1.5 seconds after it appears (`OperationProgressModal.tsx:234-239`;
  `core/utils/timeoutConfig.ts:101`). The SC pressed Save and may not see why nothing happened.
- Clear's result prints the store codes the SC ticked, under the title
  (`OperationProgressModal.tsx:284`; `DI/ui/hooks/useClearDemoData.tsx:38`). `SOP:22`: "Store and
  Data rows on a result: The SC picked both seconds ago". They are codes ("main_website_store"),
  not names.

Fix: the progress window takes small for a clean end, as `UpdatesModal.tsx:142-145` does. Drop
"Took" from the clean uninstall. Drop the subject line once a run has ended. "No Changes to Save"
stays until closed. See gap G2.

### F5. The lead on a replace sits 32px above the fields (small)

`ImportForm.tsx:197` draws `LeadText` straight into `.datapack-import-body`, a flex column with a
16px gap (`DI/ui/styles/data-installer.css:290-294`). `.lead-text` has its own 16px bottom margin
unless it is the last child or inside `.dialog-stack` (`core/ui/styles/modal-text.css:16-30`).
Neither holds, so the space is 16 + 16. The house sheet records this exact fault: "its own margin
doubled them, measured 32 for 16".

Every other datapack lead sits 16 above what follows. Read from CSS, not measured.

Fix: `.datapack-import-body` becomes `dialog-stack`.

### F6. One question, three sets of buttons (medium)

"Do you want to keep your changes?" is asked in three places:

| Where | Title | Losing button | Its place and colour | Main button |
|---|---|---|---|---|
| Install over another version | "Save Your Changes First?" amber | "Import Without Saving" | footer start, outline | "Save and Import" accent |
| Uninstall | "Uninstall My Luma from Main Store (Main Website)?" amber | "Uninstall Without Saving" | footer start, solid red | "Save and Uninstall" accent |
| Project reset | "Resetting Scratch 1028", no icon | "Uninstall Without Saving" | beside the main button, outline | "Save As New and Uninstall" accent |

Sources: `importModalView.ts:178-186,318-319`; `features/eds/services/reset/edsResetSampleData.ts:247-262`;
`OperationProgressModal.tsx:121-129`; `OperationProgressBody.tsx:153-157`.

Both "Without Saving" buttons lose the same changes. One is red and one is not. In reset the
question has no title of its own, so the window still says "Resetting".

Rule: `SOP:105-107` puts the losing button at the footer's start. It says nothing on its colour
(gap G4).

Fix: reset's prompt passes `title: 'Save Your Changes First?'`. The progress window's prompt gets a
way to put one answer at the footer's start. One colour for the losing button in both windows.

### F7. Two confirms for one datapack look different (small)

| | Uninstall My Luma | Delete My Luma |
|---|---|---|
| Width | medium (`importModalView.ts:325`) | small (`ConfirmActionDialog.tsx:61`) |
| Lines | `LeadText` in `dialog-stack`, 16 apart (`RemovalConfirmBody.tsx:61-62`) | `dialog-line` in `dialog-rows`, 8 apart (`ConfirmActionDialog.tsx:69-72`) |

Rules: Confirm is small (`SOP:36`). Consequences are "each on its own line 8 apart" (`SOP:147-149`).
"Permanently deletes what My Luma installed: ..." and "Puts back the store settings it changed."
are two consequences, drawn 16 apart.

With changes, the medium confirm holds three long buttons. Clarity 2.1 found they likely wrap. Open.

Fix: draw the consequence lines in `dialog-rows`. Uninstall on steps (F12) settles the width.

### F8. A failed run offers different help in each window (small to medium)

| Window | Buttons on failure |
|---|---|
| Install | "Close", "Back", "Retry" (twice), then "Fix with AI" (`importModalView.ts:195-229`) |
| Uninstall | "Close" alone (`importResult.ts:154`) |
| Save, Create, Clear | "Close", "Open Debug Logs", "Retry" (`OperationProgressModal.tsx:153-163`) |
| Load from File | "Close" alone |

"Fix with AI" exists only on install. "Open Debug Logs" exists only in the progress window. The
standard has no rule (gap G6).

Fix: one set for every failed datapack run. Recommend "Retry" then "Fix with AI", since an SC
cannot act on a log.

### F9. Close and Cancel swap between forms (small)

| Form | Way out | Commit button |
|---|---|---|
| Install | "Close" | "Import" |
| Load from File | "Close" | "Load" |
| Clear Demo Data | "Close" | "Clear 12 Items" |
| Save Changes, Save As New, Create Datapack | "Cancel" | "Save", "Create" |
| Version History | "Cancel" | "Restore Version" |

Sources: `importModalView.ts:255-258`; `LoadDatapackFileModal.tsx:130`; `ClearDemoDataModal.tsx:99-106`;
`DatapackFlowDialog.tsx:105`; `VersionHistoryDialog.tsx:67`. The references use "Close" on a form
(Updates, Add Another ERP) and "Cancel" on a confirm.

`SOP:129`: "Close or Cancel first". It does not say which (gap G3).

Fix, if the owner agrees: "Cancel" wherever a button beside it commits something, "Close" where
the dialog only shows.

### F10. Four datapack dialogs draw their lead and notes with their own classes (small)

| Role | House | Datapack's own | Used by |
|---|---|---|---|
| Lead | `.lead-text`: 14px, 1.5, gray-800 | `.datapack-export-intro`: inherited size, 1.5, gray-700 (`data-installer.css:496-500`) | Save Changes (`DatapackFlowDialog.tsx:88`), Save As New (`PackNameStage.tsx:22`), Create and Add Unused Items (`StorePicksStage.tsx:67`), Load (`LoadDatapackFileModal.tsx:218`) |
| Note | `.dialog-note`: 12px, 1.5, gray-600 | `.datapack-export-note`: 12px, the VS Code theme's description colour (`data-installer.css:504-508`) | Load's settings line, "Includes related categories...", "Nothing to add.", "Deleted.", "Saved to ..." |
| Label | `SectionLabel` | `.datapack-import-label` (same look, `data-installer.css:433-437`) | Install form's "Website", "Store View", "Data" |

So the lead is a shade greyer in the save and load dialogs than in install, uninstall, Version
History and Clear. The note takes its colour from the SC's own VS Code theme, not the house grey.
`core/ui/components/CLAUDE.md:43` lists "a `<p>` with per-feature classes" as what not to do.

Fix: `LeadText`, `dialog-note`, `SectionLabel`. Then delete the three rules.

### F11. Titles that do not name the datapack, and two words for "could not" (small)

Rule (`SOP:133-138`): a result's title names the thing. Only without a name does it name the kind.

| Title | Where | Should be |
|---|---|---|
| "Import Stopped" | `importResult.ts:193,240` | "Couldn't Install My Luma" |
| "Couldn't Save Changes" | `importResult.ts:150` | "Couldn't Save My Luma" |
| "Some Data Types Not Imported" | `importResult.ts:301` | "My Luma Partly Installed" (Load says "Partly Loaded") |
| "Import Did Not Start" | `importResult.ts:307` | "Couldn't Start Installing My Luma" |
| "Import Status Unknown" | `importResult.ts:313` | "Couldn't Read My Luma's Status" |
| "Validation Failed" | `importResult.ts:260` | "Check Found a Problem" |
| "Action Required to Uninstall My Luma" | `importResult.ts:280` | "One Step Left to Uninstall My Luma" (Versions B.4) |
| "This project has no Commerce instance" | `importModalView.ts:329` | "No Commerce Instance" |

Every other failure here starts "Couldn't". These say "Did Not", "Failed", "Stopped", "Not".

### F12. Still open from the earlier reviews, each seen on every run

Not restated. Checked against the code as it is now.

| Finding | Source | Still in the code at |
|---|---|---|
| Uninstall runs on one spinner in a small box; install runs on steps | Flow 2.11, Clarity 2.3, plan Phase 4 | `ImportDatapackModalBody.tsx:201-203,269-293` |
| Save Changes is one sentence in a 640px dialog | Clarity 2.8 | `DatapackFlowDialog.tsx:55-60` |
| The Admin step dialog is medium; Guide is large | Clarity 2.10 | `PackSetupStepDialog.tsx:72` |
| Load from File lists every raw setting path | Clarity 1.8, 2.9 | `LoadDatapackFileModal.tsx:221-225` |
| "Delete Datapack" in Load's result deletes with no question | Flow 2.15 | `LoadDatapackFileModal.tsx:146-151` |

One addition on the last row. That button is a Spectrum `Button` inside the body
(`RemoveFromLibraryButton.tsx:71`). Every other action in every modal is a house footer button.
It is the only body button in a datapack result, and it is destructive. Fix: a footer button,
"Undo".

### F13. The install steps are spaced and weighted unlike any other run (small)

| | Install steps | House `WorkRow` (Updates, Save) |
|---|---|---|
| Row padding | 12px (`data-installer.css:307-309`) | 8px (`core/ui/styles/work-row.css:23-27`) |
| Text to text across the hairline | 25px | 17px |
| Rule to first row's text | 16 + 12 = 28px | 16 + 8 = 24px |
| Name | bold 700 (`data-installer.css:316-318`) | normal |
| Rows to the clock | 12 + 16 = 28px (`:302-304`) | 8 + 16 = 24px |

The owner approved the bold titles and the spacing (walk F132). So this is not a defect to undo. It
is a second look for the same component, held in a feature sheet. See gap G5.

Fix: move both into `WorkRow` as a named variant (`step`), so the next run on steps gets it.

### F14. Words on the forms (small)

- Install form: the label "Data" (`ImportForm.tsx:218`). The standard's own example is "Data
  Types" (`SOP:112`). The placeholder "Instance default" (`:155`) is sentence case.
- Install form rows are bare Spectrum `Checkbox` in a grid 8 apart (`ImportForm.tsx:227-238`;
  `data-installer.css:394-397`). The house `CheckboxRow` is 4 apart with a detail line at 11px
  gray-600 (`checkbox-row.css:17-31`). The count under a type is 12px gray-700
  (`data-installer.css:418-422`). Clarity 1.3 and 2.4 cover the rest.
- Clear Demo Data says "Choose the stores..." then "Select a store..." (`ClearDemoDataModal.tsx:35-37`).
  Every other datapack dialog says Select.
- Create Datapack: "Couldn't be read" on a kind, "Couldn't load products: ..." in its list
  (`StorePicksStage.tsx:33`; `StoreKindItems.tsx:46`).
- Version History: "(in use)" drawn with utility classes in the radio's label
  (`VersionHistoryDialog.tsx:84`). The dialog goes in plan Phase 2.
- Running titles: "Saving My Luma", "Creating Acme", "Clearing Demo Data"
  (`useSaveStoreChanges.tsx:93`; `useClearDemoData.tsx:37`) against "Import My Luma", "Uninstall My
  Luma" (`importModalView.ts:349-356`). See gap G7.

### F15. What an agent's request shows the SC (medium)

A VS Code dialog, built by `features/ai/server/consentText.ts:124-138`.

- Titles: "Import sample data?", "Export sample data?" (`agentAlertCopy.ts:435,442`). Nothing else
  on screen says "sample data".
- The body of `start_datapack_import` is one sentence of about 60 words (`agentAlertCopy.ts:437`).
  `clear_demo_data` is three sentences of about 75 words (`:261`).
- Under it: "Datapack name: my-luma-x1" and "Version: 20261109-141504" (`consentText.ts:82-107`,
  from `target: ['datapackName', 'version']`). An id and a raw version, with a sentence-case label.
- "pack" three times (`agentAlertCopy.ts:437,486`).
- Five end on "This can't be undone." as a last sentence. `SOP:141-142`: a warning is a word in the
  main sentence.

Fix: titles in the screen's words ("Install a datapack"). Two short sentences each. Show the
display name and the saved date, as the Activity tab now does.

### Bespoke spacing in `data-installer.css`, with the house value

Asked for in full. Rules for the page, the card grid and the flyout's own layout are left out.

| Line | Rule | Sets | House class and value | Verdict |
|---|---|---|---|---|
| 290-294 | `.datapack-import-body` | gap 16 | `.dialog-stack` gap 16, and it zeroes child margins | Duplicate. Causes F5 |
| 302-304 | `.import-run-foot` | margin-top 16 | `.dialog-stack` gap 16 (the progress window's rows and clock) | Duplicate |
| 307-309 | `.import-steps > .work-row` | padding 12px 0 | `.work-row` padding 8px 0 | Differs (F13) |
| 316-318 | step title | font-weight 700 | `.checkbox-row-label` normal | Differs (F13) |
| 321-324 | step detail | 12px gray-600 | `.work-row-detail` 12px gray-600 | Says the same thing twice |
| 327-329 | `.import-step-types` | margin-top 8 | none | Own |
| 337-340 | `.datapack-import-scope` | gap 16 | none for side-by-side fields | Own |
| 359-364 | `.datapack-scope-field` | gap 4 | `.section-label` margin-bottom 4 | Duplicate |
| 373-377 | `.datapack-import-types` | gap 4 | `.section-label` margin-bottom 4 | Duplicate |
| 394-397 | `.datapack-type-grid` | gap 8px 24px | `.checkbox-row` padding 2px 0 (4 between rows) | Differs |
| 418-422 | `.datapack-type-changes` | 12px gray-700 | `.checkbox-row-detail` 11px gray-600 | Differs |
| 433-437 | `.datapack-import-label` | 12px gray-600 | `.section-label` 12px gray-600 | Duplicate |
| 488-492 | `.datapack-export-body` | gap 16 | `.dialog-stack` gap 16 | Duplicate |
| 496-500 | `.datapack-export-intro` | margin 0, gray-700 | `.lead-text` gray-800 | Differs (F10) |
| 504-508 | `.datapack-export-note` | margin 0, 12px, theme colour | `.dialog-note` 12px gray-600 | Differs (F10) |
| 540-613 | `.datapack-picks-*` | gaps 2 and 8, padding 14 and 18 | none for two panes | Own. 14 and 18 are off the 4, 8, 16, 24 scale |
| 648-653 | `.datapack-save-file` | gap 6 | `.dialog-rows` gap 8 | Differs. 6 is off the scale |
| 660-668 | `.clear-demo-body` | gap 24, and zeroes the lead's margin | `.operation-question` gap 24, for questions only | No shared class (gap G8) |
| 446-481 | `.datapack-import-target*` | gap 4 | unused | Delete (Clarity 2.16) |

Other sheets these modals load: `datapack.css` is the card only. Nothing in it spaces a modal.

### Gaps computed from the CSS

All read, none measured. "Rule" is the line under the title. 16 under the rule is Spectrum's own,
taken from the comment at `core/ui/styles/modal.css:117-119`.

| Pair | Install | Uninstall | Save, Create | Load | Clear | Version History | Delete, Share | Updates (ref) |
|---|---|---|---|---|---|---|---|---|
| Rule to first line | 16; run 28; wait 24 | 16; wait 24 | 16; rows 24 | 16 | 16 | 16 | 16 | 16; rows 24 |
| Lead to what follows | **32** | 16 | 16 | 16 | 24 | 16 | n.a. | 16 |
| Consequence line to line | n.a. | **16** | n.a. | n.a. | n.a. | n.a. | 8 | 8 (Fill) |
| List to buttons | 24 | 24 | 24 | 24 | 24 | 24 | 24 | 24 |
| Row to row, facts | 8 | 8 | n.a. | n.a. | 8 | n.a. | n.a. | n.a. |
| Row to row, run | **25** | n.a. | 17 | n.a. | n.a. | n.a. | n.a. | 17 |
| Row to row, checkboxes | **8** | n.a. | 4 | n.a. | 4 | Spectrum's | n.a. | 4 |

Bold marks where a datapack modal differs from another datapack modal or from a reference.

### Text hierarchy, by what draws it

| Role | Element or class | Size, weight, colour | Who differs |
|---|---|---|---|
| Title | Spectrum `Heading` in `Modal` | Spectrum's; not readable from our CSS | None |
| Lead | `LeadText` | 14px, gray-800 | F10: four dialogs use `.datapack-export-intro`, gray-700 |
| Body line | `.dialog-line` | 14px, gray-800 | Clear's two plain lines are a bare Spectrum `Text` (`ClearDemoDataModal.tsx:68,73`) |
| Label | `SectionLabel`, `.fact-list dt` | 12px, gray-600 | Install form: own class, same look. Name fields and "Save Changes As": Spectrum's own label (`PackNameStage.tsx:23`; `RemovalConfirmBody.tsx:79`) |
| Value | `.fact-list dd` | inherited body | None |
| Note | `.dialog-note` | 12px, gray-600 | F10: `.datapack-export-note`, theme colour |
| Problem note | `.dialog-problem` with `text-notice` or `text-negative` | 12px, coloured | None. Used the same everywhere |
| Run row name | `.checkbox-row-label` | 13px, gray-900 | F13: install steps are bold |
| Run row line | `.work-row-detail` | 12px, gray-600 | None |
| Wait | `StageWait` | 13px medium, 12px gray-600, 11px gray-500 | None |

The order of emphasis is the same in every modal. What differs is which class draws the lead and
the note, and one bold row name.

## 3. The two tables

### 3.1 Language: every title, lead, button and wait

Buttons are in footer order. "|" separates the footer's start from its end. (a) accent, (r) solid
red, (o) outline.

| State | Title | Lead or body | Buttons | Wait |
|---|---|---|---|---|
| Install form | "Import My Luma" | none; or "Replaces this demo's data with the version from Nov 9, 9:15 AM." | Close, Dry Run (o), Import (a) | "Reading websites" / "From this demo's Commerce instance" |
| Check | "Import My Luma" | | Cancel | "Checking for your changes" / "Since this demo's last save" |
| Keep changes? | "Save Your Changes First?" | "You changed these since this demo's last save. Importing replaces them." | Import Without Saving (o) \| Cancel, Save and Import (a) | |
| Check failed | "Couldn't Check for Changes" | "Importing replaces anything you changed since this demo's last save." | Cancel, Import Anyway (a) | |
| Run | "Import My Luma" | Steps: "Save Your Changes", "Uninstall the Previous Version", "Install My Luma", "Verify the Import" | Run in Background | |
| Clean | "My Luma Imported" | none; "Your changes are saved in Version History."; "New products can take 20 minutes to show in search." | Close | |
| Problem | "My Luma Imported" amber | steps, then "Took ..." | Close, Fix with AI (a) | |
| Stopped | "Import Stopped" | steps | Close, Back, Retry (a) or Fix with AI (a) | |
| Dry run | "Dry Run Passed" / "Validation Failed" / "Dry Run Failed" | "Nothing was written." | Close, Back | "Checking the import" / "Nothing is written" |
| No Commerce | "This project has no Commerce instance" | "Connect a Commerce backend on the project dashboard, then import from here." | Close | |
| Uninstall check | "Uninstall My Luma" | | Cancel | as Check |
| Uninstall? | "Uninstall My Luma from Main Store (Main Website)?" | "Permanently deletes what My Luma installed: categories and products." "Puts back the store settings it changed." | Cancel, Uninstall (r) | |
| Uninstall, changes | same | "You changed these since this demo's last save. Uninstalling takes them out too." | Uninstall Without Saving (r) \| Cancel, Save and Uninstall (a) | |
| Uninstall, check failed | "Couldn't Check for Changes" | "Uninstalling removes anything you changed since this demo's last save." | Cancel, Uninstall Anyway (r) | |
| Uninstall run | "Uninstall My Luma" | | Run in Background | "Uninstalling the datapack" / "From your Commerce instance" / "Minutes; varies by pack" |
| Uninstalled | "My Luma Uninstalled" | the engine's note; "Took ..." | Close | |
| Admin step left | "Action Required to Uninstall My Luma" | "Main Store still uses the datapack's root category, ..., so it stayed." | Close | |
| Save Changes | "Save Changes" | "Saves everything this demo uses as a new version of My Luma." | Add Unused Items (o) \| Cancel, Save As New (o), Save (a) | |
| Save As New | "Save As New Datapack" | "Saves everything this demo uses as a new datapack of yours." | Add Unused Items (o) \| Cancel, Save (a) | |
| Add Unused Items | "Add Unused Items" | "Nothing in this demo uses these yet. Select any to include." | Cancel, Add (a) | "Reading from Commerce" / "What there is to select" |
| Create Datapack | "Create Datapack" | "Select what to include from this demo's Commerce instance." | Cancel, Back, Continue or Create (a) | same |
| Save run | "Saving My Luma" / "Creating Acme" | a row per data type | Run in Background | |
| Saved | "My Luma Saved" / "Acme Created" | "Saved a new version of My Luma." | Close | |
| Nothing to save | "No Changes to Save" | none | Close | |
| Save failed | "Couldn't Save My Luma" | the reason | Close, Open Debug Logs (o), Retry (a) | |
| Version History | "Version History" | "This demo's data goes back to the version you choose." | Cancel, Restore Version (a) | |
| Delete Datapack | "Delete My Luma?" | "Permanently deletes it and its version history." | Cancel, Delete (r) | "Deleting the datapack" |
| Delete Store Settings | "Delete My Luma's Store Settings?" | "Permanently deletes the store settings saved with it." | Cancel, Delete (r) | "Deleting store settings" |
| Share | "Share My Luma?" | "Everyone can find and install it under Community Datapacks." | Cancel, Share (a) | "Sharing the datapack" |
| Stop Sharing | "Stop Sharing My Luma?" | "Other people can no longer see or install it." | Cancel, Stop Sharing (a) | "Making it private" |
| Load form | "Load from File" | "My Luma, saved Nov 9, 9:15 AM. It holds Products, Categories." | Close, Load (a) | |
| Loaded | "My Luma Loaded" | "Added to My Datapacks, with its store settings." | Close; in the body: Delete Datapack | |
| Clear form | "Clear Demo Data" | "Choose the stores that are this demo's. Clearing permanently removes what only they use and Demo Builder didn't install, and closes their orders." | Close, Clear 12 Items (r) | "Reading demo data" / "Each data type, in Commerce" |
| Clear run | "Clearing Demo Data", the store codes under it | stages | Run in Background | |
| Cleared | "Demo Data Cleared", the store codes under it | the engine's sentence | Close | |
| Admin step | the step's own title | Where, Set, Then | Close, Open Admin (o), Check (a) | |
| Reset, datapack | "Uninstall My Luma Too?" | "Deletes what it installed in Commerce. Your changes are saved first. Can take several minutes." | Uninstall Datapack, Keep Datapack | |
| Reset, changes | "Resetting Scratch 1028" | the changes sentence; field "Save Changes As" | Cancel, Uninstall Without Saving (o), Save As New and Uninstall (a) | |
| Reset Selected | "Reset 3 Projects?" | "Each project returns to how it was set up. Code changes are lost." | Cancel, Reset 3 Projects (r) | "Reading demo data" / "Each selected project's Commerce" |
| Datapack Changes | "Datapack Changes" | "Changed since installed. Save each as a new datapack, or discard its changes." | Back, Reset 3 Projects (r) | |
| Delete one | "Delete Scratch 1028?" | "Project files are removed from this machine. Datapacks stay installed in Commerce unless you uninstall them." | Cancel, Delete (r) | |

The same thing said two ways:

| Thing | Ways | Where |
|---|---|---|
| Put a datapack into Commerce | Import (button, titles), Install (steps, Share's sentence, the wizard) | F1 |
| The way out of a form | Close, Cancel | F9 |
| Could not | "Couldn't ...", "... Did Not Start", "... Failed", "... Stopped", "It could not be changed", "could not be read" | F11; `useLibrarySharing.tsx:42`; `ImportForm.tsx:244` |
| A run's title | "Import My Luma" (verb), "Saving My Luma" (gerund) | F14 |
| Lose the SC's changes | "Import Without Saving", "Uninstall Without Saving", "Discard Changes" (batch) | `uninstallWords.ts:14`; `BatchDatapackChanges.tsx:22` |
| What uninstall does to changes | "replaces them", "takes them out too", "removes anything you changed" | `RemovalConfirmBody.tsx:24-31` |
| Make the SC pick | "Select", "Choose" | F14 |
| The accent or red button after a failed check | "Import Anyway" accent, "Uninstall Anyway" red | `importModalView.ts:191-192` (right: one destroys) |
| Help after a failure | "Fix with AI", "Open Debug Logs", nothing | F8 |
| The first save option | "Save As New" (in Save Changes), "Save As New Datapack" (header, title) | `DatapackFlowDialog.tsx:72`; `SaveFromStoreModal.tsx:48` |

Consistent and right: Cancel is always first. The main button is always last. A destructive main
button is always solid red. No middle dot in any datapack string (searched the datapack UI for the
character and its escape: 0 lines; the same search found the wait's clock line in
`core/utils/stageLine.ts:57` as its control).

### 3.2 Success: every flow's clean result

| Flow | Title | Body | Buttons | Width | Closes itself | Verdict |
|---|---|---|---|---|---|---|
| Install | "My Luma Imported" | none, or one or two sentences | Close | 400 | no | Right shape. Old word. "saved in Version History" names a place to go and look (Versions B.4) |
| Uninstall | "My Luma Uninstalled" | the engine's note, "Took ..." | Close | 400 | no | "Took" breaks `SOP:77` |
| Save Changes | "My Luma Saved" | "Saved a new version of My Luma." and up to three more lines | Close | 480 | no | Repeats the title; id; too wide (F3, F4) |
| Save As New | "Acme Saved" | "Saved as Acme. Scratch 1028 now uses it." | Close | 480 | no | First sentence repeats the title |
| Create Datapack | "Acme Created" | "Scratch 1028 now uses Acme." | Close | 480 | no | Right. Too wide |
| Nothing to save | "No Changes to Save" | none | Close | 480 | after 1.5 s | Right words. Too brief to read (G2) |
| Load from File | "My Luma Loaded" | "Added to My Datapacks." | Close; Delete Datapack in the body | 400 | no | Right words. Button in the body (F12) |
| Clear Demo Data | "Demo Data Cleared" | store codes, then a sentence | Close | 480 | no | Store codes repeat what was ticked (F4) |
| Dry run | "Dry Run Passed" | "Nothing was written." | Close, Back | 400 | no | The body says what nobody asked (Versions B.4) |
| Share, Stop Sharing | no dialog; the card's tag changes | | | | | Right |
| Delete Datapack | no dialog; the flyout closes, the card goes | | | | | Right |
| Save as File | no dialog; "Saved to <path>, with its store settings" under the flyout's buttons | | | | | Right. Right-aligned (Clarity 2.2) |
| Reset or Delete Selected | "Projects Reset", "Projects Deleted" | none | Close | 400 | no | Right |
| Updates (reference) | "Updates Applied" | none, or one line | Close | 400 | no | The model |

Only Install, Create, Load and the batch results are as simple as the standard asks. They are not
consistent with each other in width or in whether they close.

## 4. Gaps in the standard

Each needs the owner's word. Recommendation first.

| # | Gap | Recommend |
|---|---|---|
| G1 | **Width of the progress window.** `SOP:37-38` says Progress and Result are small. The shared progress window is medium for every operation in the extension (`OperationProgressModal.tsx:273`), so a save ends at 480 and an install at 400 | Write "the progress window runs at medium and ends small", and make it so, as Updates does |
| G2 | **When a result closes itself.** `SOP:69-71`: it closes where nothing follows, and Import "stays until closed" because it "offers Back to its form". A clean install no longer offers Back, so by that sentence it should close itself. "No Changes to Save" does, in 1.5 seconds | A result the SC caused from a dialog stays until closed. Only a progress window opened from a tile closes itself |
| G3 | **Close or Cancel.** `SOP:129` allows both and does not say when | Cancel beside a button that commits. Close where the dialog only shows, and on every result |
| G4 | **Colour of the button that loses changes.** `SOP:105-107` gives its place, not its colour. Uninstall draws it solid red, install draws it outline | Outline in both. Red is for the main action (`SOP:129-130`), and two solid buttons in one footer compete |
| G5 | **Bold step titles.** `SOP:116`: "Four kinds of text. ... Nothing else." The approved install steps have a fifth: a bold row name | Add "a step's title" as a named kind, and move it into `WorkRow` (F13) |
| G6 | **What a failed run offers.** No rule. Three answers in the code (F8) | Retry while a retry can work, then Fix with AI. Debug logs behind Fix with AI |
| G7 | **A run's title.** `SOP:108` says the title names the work ("Import My Luma"). The progress window says "Saving My Luma", "Resetting X" for every operation | One form. The gerund is already in about every other window, so it is the smaller change |
| G8 | **Spacing has holes.** `SOP:122-123` gives 4, 8, "16 under the title", 24 between groups. No number for lead to list (the code uses 16). No shared class for 24: `.clear-demo-body` and `.operation-question` each write their own | Add "16 between a lead and what it leads" and a `dialog-groups` class at 24 |
| G9 | **The wait's second line.** `SOP:43-50` still requires "on what" and gives "Each data type, in Commerce" as the model, which the owner has since rejected | "A second line only when it adds a fact", with the rejected examples (plan Phase 1 has this) |
| G10 | **Confirm width.** `SOP:36` says small. `SOP:108-109` says "the confirm's own width". The code's comment says every confirm is "wide enough for its buttons on one line" (`importModalView.ts:315-317`) | Small for two buttons. The run's width when a run follows in the same window |
| G11 | **VS Code's own dialogs.** Reset's two questions and every agent consent are native dialogs. The standard is silent on whether its word rules apply | They do: a question as the title, the warning in the sentence, no ids |
| G12 | **An undo on a result.** Nothing says where it goes (F12) | The footer, as "Undo" |
| G13 | **Ellipsis.** `SOP:188`: nothing is cut off with an ellipsis. A wait's three rows are one line each, cut with an ellipsis (`core/ui/styles/shared-ui.css:95-101`). Only the character limits keep that from showing | Say so in the standard: the wait is the exception, held by the limits |

One contradiction inside the standard: it says Import throughout (F1) against decision D1.

## 5. What is right and should stay

- **Every datapack modal is the house `Modal`.** No hand-built dialog. Status is always the title's
  icon. No status box in any body.
- **Every wait is the house wait**, with words from one table. No wordless spinner is left in a
  dialog.
- **Button order never varies.** Way out first, main action last, destructive main action red.
- **The four small confirms** (Delete Datapack, Delete Store Settings, Share, Stop Sharing) pass
  every column. They are the model for the rest: a question, one sentence, two buttons.
- **The changes list** is the house `FactList` inside `dialog-stack`, with the losing button apart.
- **The clean install ending.** "My Luma Imported" and nothing else is exactly `SOP:73-77`.
- **Problem notes** use `.dialog-problem` with the two house colours in every datapack modal.
- **Clear Demo Data's preview** and its counting button, "Clear 12 Items".
- **The Admin step** reuses `SetupStepHeader` and `SetupStepFacts`, in the result and in its dialog.
- **Reset Selected and Delete Selected** ask in one table and end on a title alone.
- **Words in one module per job** (`uninstallWords.ts`, `replaceWords.ts`, `saveWords.ts`,
  `shareWording.ts`, `WAIT_STAGES`). F1 is easier because of it.

## 6. What needs a screenshot to settle

| # | Question | Capture |
|---|---|---|
| 1 | Is the lead 32px above the pickers? (F5) | Install form on a replace, beside Version History |
| 2 | Does the lead look greyer in Save Changes than in install? (F10) | Save Changes beside "Save Your Changes First?" |
| 3 | Do the notes in `.datapack-export-note` change colour with the VS Code theme? | Load from File's settings line in a light and a dark theme |
| 4 | Install steps at 12px against the save's rows at 8px (F13) | Both runs mid-way, side by side |
| 5 | Save's result at 480 against install's at 400 (F4) | Both clean results |
| 6 | Can "No Changes to Save" be read in 1.5 seconds? | A screen recording of Save Changes with nothing changed |
| 7 | Uninstall's confirm at medium with a long store name in the title | A store named like "Justrite Test Store US (Justrite Test)" |
| 8 | Uninstall's two consequence lines 16 apart against Delete's 8 (F7) | Both confirms |
| 9 | Red "Uninstall Without Saving" at the start with blue "Save and Uninstall" at the end (F6) | Uninstall with changes, the SC's own datapack and a team one |
| 10 | Reset's changes question in the progress window (F6) | Reset a project whose team datapack has changes |
| 11 | The Delete Datapack button inside "My Luma Loaded" (F12) | Load a file, then the result |
| 12 | The store codes under "Demo Data Cleared" (F4) | Clear two stores |
| 13 | The title's own size and weight at each width | Any small, medium and large dialog. Spectrum sets it and our CSS does not say |
| 14 | 16 between the title's rule and the first line | Any dialog. Taken from a CSS comment, not measured |
| 15 | An agent's consent for `start_datapack_import` (F15) | Ask an agent to install a datapack |

Not read in full: `StorePickList`, `StoreItemChecklist`, `CheckRows`, the ACO stages (held back and
unreachable), `ProjectsBatchRunView`, the batch stylesheet (`.batch-confirm`, `.batch-delete*`), and
`OperationPromptForm`. The engine's notes shown in results were read where they are built
(`saveOutcome.ts`), not traced for every run.
