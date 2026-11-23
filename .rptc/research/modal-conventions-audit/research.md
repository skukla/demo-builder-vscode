# Modal conventions: what the whole extension does today

Inventory of branch `fix/release-walk-fixes` with its uncommitted changes, 2026-11-10. Read from
the code and the stylesheets only. Nothing was edited, run, reloaded or sent to a live service.

**Nothing was rendered.** Every width is read from CSS. Every "fits" or "sparse" is a judgement
from character counts, not a measurement. See "What I could not check" at the end.

Paths are under `src/`. `DI/` is `src/features/data-installer/`. `SOP:n` is line n of
`docs/development/sop/dialog-design.md`. The datapack rows are reused from
`.rptc/research/datapack-modal-audit/research.md` ("the datapack audit"), not redone.

## What was counted

| Kind | Count | Where |
|---|---|---|
| Windows built on the house `Modal` directly | 24 | 18 outside datapacks, 6 datapack |
| Confirms built on `ConfirmActionDialog` (which is `Modal` at small) | 11 | 7 outside datapacks, 4 datapack |
| The shared progress window | 1 | `core/ui/components/feedback/OperationProgressModal.tsx:269` |
| Spectrum `Dialog` used directly, not through `Modal` | 2 | `core/ui/components/forms/FieldHelpButton.tsx:246,289` (a help popover and a large help dialog) |
| **Windows in total** | **38** | |
| Operations the progress window shows, by title set | 31 | every `successTitle:` in `src/` |
| Runs shown in a window of their own | 7 | Updates, Reset Selected, Delete Selected, datapack install, uninstall, dry run, Load from File |

Not counted: VS Code's own dialogs (reset's two questions, every agent consent), flyouts and the
wizard's whole-screen states. `features/eds/ui/components/GitHubAppInstallDialog.tsx` is named a
dialog but is a wizard step message, so it is out.

There is no `AlertDialog` anywhere in `src/`.

---

## Table A: size against content

### Where the numbers come from

| Size | Width | Source | Body width |
|---|---|---|---|
| S | 400px | Spectrum's dialog sheet (`node_modules/@react-spectrum/dialog/dist/dialog.*.css`: `width: 400px`); `SOP:175` | 320px |
| M (the default, `Modal.tsx:213`) | 480px | same sheet; `SOP:175` | 400px |
| L | 640px | same sheet; `SOP:175` | 560px |
| `wide` | `min(980px, 92vw)` | `core/ui/styles/modal.css:103-106` | 900px on a pane 1,066px or wider |
| `fitContent` | changes height only | `modal.css:83-94` | n.a. |

Body width is the width less Spectrum's 40px padding on each side (`--spectrum-dialog-padding`,
static-size-500, 40px in the theme's vars). `.modal-content` reaches 4px out and gives 4px back
(`modal.css:30,44`), so it nets to nothing.

"Characters per line" below assumes 7px for an average character at 14px. That is an estimate,
not a measurement: about 46 at S, 57 at M, 80 at L, 128 at wide.

### Text roles

| Role | Class or element | Size, weight | Source |
|---|---|---|---|
| Title | Spectrum `Heading` in `Modal` | 18px, bold, line-height 1.3 | Spectrum tokens: `--spectrum-dialog-title-text-size` is font-size-300, 18px on the medium scale. No house CSS overrides it (searched `src/**/*.css` for the dialog title and padding tokens: 0 lines) |
| Lead | `.lead-text` | 14px, normal, 1.5, gray-800 | `core/ui/styles/modal-text.css:17-23` |
| Body line | `.dialog-line` | 14px, normal, 1.5, gray-800 | `modal.css:248-254` |
| Body with no class | Spectrum `Text` in the dialog's content | 14px, normal, 1.5 | Spectrum's `--spectrum-dialog-content-text-size`, font-size-100 |
| Numbered steps | `.dialog-steps` | 14px, gray-700 | `modal.css:273-280` |
| Subject under a title | `.modal-progress-subject` | 14px, gray-700 | `modal.css:457-461` |
| Note | `.dialog-note` | 12px, gray-600 | `modal.css:283-289` |
| Problem note | `.dialog-problem` | 12px, coloured | `modal.css:293-298` |
| Label | `.section-label` | 12px, gray-600 | `modal-text.css:34-38` |
| Button label | `.modal-button` | 14px, **bold 700**, 32px tall | `modal.css:320-333` |
| Wait in a dialog (three rows) | `LoadingDisplay` at M | 13px medium, 12px gray-600, 11px gray-500 | `core/ui/components/feedback/LoadingDisplay.tsx:168-188`; `core/ui/styles/utilities.css:33-37` |
| Wait in the progress window | `LoadingDisplay` at L | 16px medium, 12px, 11px | same |
| Run row | `.checkbox-row-label`, `.work-row-detail` | 13px, 12px | `checkbox-row.css:23`; `work-row.css:42` |

Three things follow from the table alone:

- The largest text in any dialog is the 18px title. Everything the SC reads under it is 14px or
  smaller, and a wait's main line is 13px.
- The button label is the same size as the lead and heavier. In a one-sentence dialog the buttons
  are the boldest thing under the title.
- The type does not change with the box. A sentence is 14px in a 400px dialog and 14px in a 980px one.

### Where one sentence sits in the box

Computed from the CSS, not measured. Height is 40 padding, the title (about 23), 12 and 16 around
the rule, the body, 24, the 32px buttons, 40 padding.

| Content | Box | What the SC sees |
|---|---|---|
| A title alone ("API Mesh Deployed", 17 characters) | 480 wide, about 190 tall | The title takes about 150 of the 400px. The body is empty. One button. |
| A title and one 60-character sentence | 480 wide, about 210 tall | One 14px line, about 420px of ink, filling the body's width exactly or tipping onto a second line |
| The same sentence at L | 640 wide, about 210 tall | One line ending three quarters of the way across. A quarter of the body is empty to its right |
| The same sentence at `wide` | 980 wide | One line under half the body's width |
| The same sentence at S | 400 wide, about 230 tall | Two lines, the body full |

So a one-sentence message reads as a block only at S. At M it is a single thin line across the
box. At L and wider it is a line with empty space beside it.

### The inventory

Layout is the standard's (`SOP:33-39`). "Rest" is what the dialog holds once any wait is over.
Longest line is in characters, with names as in the examples.

| # | Dialog | File:line | Layout | Size | Rest | Longest line | Fit |
|---|---|---|---|---|---|---|---|
| 1 | Give Access | `features/eds/ui/siteAccess/GiveAccessModal.tsx:38` | Form | S 400 | 1 field, 2 checkboxes, 2 buttons | 54 (a checkbox label) | tight |
| 2 | "Remove …?" (site access) | `features/eds/ui/siteAccess/SiteAccessScreen.tsx:181` | Confirm | S 400, no `fitContent` | 2 sentences, 2 buttons | about 90 | fits |
| 3 | New Prompt, Edit Prompt | `features/dashboard/ui/aiSurface/components/PromptEditDialog.tsx:72` | Form | M 480, no `fitContent` | 2 fields, 2 buttons | n.a. | fits |
| 4 | "X Settings" (integration) | `features/dashboard/ui/components/IntegrationSettingsModal.tsx:173` | Form | M 480, no `fitContent` | the integration's fields, 2 buttons | n.a. | fits |
| 5 | Manage APIs for X | `features/dashboard/ui/components/ManageApisModal.tsx:297` | Form | L 640 | search, about 90 rows, 2 buttons | n.a. | fits |
| 5a | the same, "Sign In to Adobe" | `ManageApisModal.tsx:225-228` | Result | L 640 | 3 sentences, 2 buttons | 113 | **sparse** |
| 5b | the same, "Couldn't Load Adobe APIs" | `ManageApisModal.tsx:229-232` | Result | L 640 | 1 line, 2 buttons | varies | **sparse** |
| 6 | Assign Products to X | `features/dashboard/ui/components/AssignErpProductsModal.tsx:150` | Form | wide 980 | product list, 2 buttons | n.a. | fits |
| 6a | the same, nothing to list | `AssignErpProductsModal.tsx:144` | Result | S 400 | 1 line, 1 button | varies | fits |
| 7 | "X: Simulate Downtime" | `features/dashboard/ui/components/ErpDowntimeDialog.tsx:90` | Form | S 400 | 1 sentence, 1 field, 2 buttons | 118 | fits |
| 8 | Add Another ERP | `features/dashboard/ui/components/AddErpDialog.tsx:204` | Form | M 480 | 1 field, a picker, a preview, 2 buttons | n.a. | fits |
| 9 | AI Capabilities | `features/dashboard/ui/components/AiCapabilitiesModal.tsx:155` | Form (a list to read) | L 640 | columns of rows, 2 buttons | n.a. | fits |
| 10 | "Add X and Prepare the Store?" | `features/dashboard/ui/components/integrations/PrepareOnAddConfirm.tsx:143` | Confirm | **L 640** | 2 sentences, step rows, 2 buttons | about 190 | fits |
| 10a | the same, "Couldn't Add X" | `PrepareOnAddConfirm.tsx:137` | Result | **L 640** | 1 line, 1 button | varies | **sparse** |
| 11 | "Demo Setup: X" | `features/dashboard/ui/components/integrations/SetupGuideModal.tsx:173` | Guide | wide 980, no `fitContent` | step list, one step open, up to 5 buttons | n.a. | fits |
| 12 | Share | `features/dashboard/ui/components/share/ShareModal.tsx:123` | Form | L 640 | 2 radios, a link form, 1 button | not read | not judged |
| 13 | Add a Demo Package, Change the Demo Source | `features/project-creation/ui/components/add-demo/AddDemoModal.tsx:132` | Form, in stages | L 640 | first stage: a lead and 1 field | not read | likely sparse on its first stage |
| 14 | Edit Demo Package | `features/project-creation/ui/components/add-demo/EditDemoPackageModal.tsx:77` | Form | M 480 | 3 fields, 2 buttons | n.a. | fits |
| 15 | "X Settings" (the ERP's name) | `features/project-creation/ui/components/integration-flow/PairedSystemNameDialog.tsx:83` | Form | S 400 | 1 field, 2 buttons | n.a. | fits |
| 16 | Add Integration, Deployment Destination, Edit API Access | `features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal.tsx:232` | Form, in stages | L 640 | short stages (kind, name) and long ones (API list) | n.a. | fits on long stages, likely sparse on short ones |
| 17 | Updates Available, then its run | `features/projects-dashboard/ui/components/UpdatesModal.tsx:253` | Form, Progress | L 640 | a table of projects; then rows | n.a. | fits |
| 17a | the same, "Updates Applied" | `UpdatesModal.tsx:142-144` | Result | S 400 | title alone, or 1 line | short | fits |
| 18 | "Reset N Projects?", then its run | `features/projects-dashboard/ui/components/ProjectsBatchModal.tsx:206` | Confirm, Progress | L 640 | a table of projects | n.a. | fits |
| 18a | "Delete N Projects?", then its run | same | Confirm, Progress | wide 980 | a table, up to 3 columns | n.a. | fits |
| 18b | "Projects Reset", "Projects Deleted" | `ProjectsBatchModal.tsx:210` | Result | S 400 | title alone | n.a. | fits |
| 19 | "Reset X?" (ERP) | `features/dashboard/ui/components/ErpResetDialog.tsx:41` | Confirm | S 400 | 4 sentences, 2 buttons | 97 | fits (long: about 9 lines) |
| 20 | "Remove X?" | `features/dashboard/ui/components/AppBuilderComponentRemoveDialog.tsx:51` | Confirm | S 400 | 1 sentence and more, 2 buttons | about 70 | fits |
| 21 | "Undo X's Last Assignment?" | `features/dashboard/ui/components/integrations/ErpAssignDialogs.tsx:200` | Confirm | S 400 | 2 sentences | 117 | fits |
| 22 | "Add erp_owner to Attribute Sets?", "Remove …?" | `ErpAssignDialogs.tsx:212` | Confirm | S 400 | 2 sentences | 78 | fits |
| 23 | "Fill X from Commerce?" | `features/dashboard/ui/components/integrations/ErpConfirmDialogs.tsx:94` | Confirm | S 400 | 3 sentences | 87 | fits |
| 24 | "Reinstall X in Commerce?" | `features/dashboard/ui/components/integrations/FlaggedCardDialogs.tsx:54` | Confirm | S 400 | 2 or 3 sentences | about 120 | fits |
| 25 | "Remove X Anyway?" | `FlaggedCardDialogs.tsx:88` | Confirm | S 400 | 2 sentences | about 80 | fits |
| 26-29 | Delete Datapack, Delete Store Settings, Share, Stop Sharing | `DI/ui/components/PackActions.tsx:273` | Confirm | S 400 | 1 sentence, 2 buttons | 62 | fits |
| 30 | Version History | `DI/ui/components/VersionHistoryDialog.tsx:62` | Form | S 400 | a lead, a radio list, 2 buttons | 53 | fits |
| 31 | A datapack's Admin step | `DI/ui/components/PackSetupStepDialog.tsx:72` | Guide | **M 480** | Where, Set, Then; 3 buttons | n.a. | fits (the standard says Guide is large) |
| 32 | Clear Demo Data | `DI/ui/components/ClearDemoDataModal.tsx:99` | Form | L 640 | a lead, store rows, a preview, 2 buttons | 150 | fits |
| 32a | the same, "Couldn't Read the Stores" | `ClearDemoDataModal.tsx:102` | Result | S 400 | 1 line | varies | fits |
| 33 | Install form ("Import My Luma") | `DI/ui/components/ImportDatapackModal.tsx:331`; widths `importModalView.ts:266-270` | Form | M, L or wide by the count of data types (6, 12, more) | 2 pickers, a checkbox grid, 3 buttons | n.a. | fits |
| 33a | Install: check, "Save Your Changes First?" | `importModalView.ts:325-334` | Confirm | M 480, or the run's width on a replace | a sentence, a fact list, 3 buttons | about 70 | fits; 3 long buttons at M likely wrap (datapack audit F7) |
| 33b | Install run | `importModalView.ts:289-290,349` | Progress | M, or the form's width in two columns | steps | n.a. | fits |
| 33c | Install result, clean | `importModalView.ts:338-347` | Result | S 400 | title alone, or 1 or 2 sentences | about 60 | fits |
| 33d | Uninstall: wait and run | `importModalView.ts:353-356` | Progress | S 400 | a spinner, 3 lines | 25 | fits |
| 33e | Uninstall confirm | `importModalView.ts:325` | Confirm | **M 480** | 2 sentences, 2 or 3 buttons | about 75 | fits (the standard says Confirm is small) |
| 33f | Uninstall result | `importModalView.ts:343` | Result | S 400; M when a root category stayed | 1 sentence, "Took …" | n.a. | fits |
| 34 | Load from File | `DI/ui/components/LoadDatapackFileModal.tsx:124` | Form | M 480 | a lead, a settings list, 2 buttons | about 60 | fits |
| 34a | the same, "My Luma Loaded" | `LoadDatapackFileModal.tsx:127` | Result | S 400 | 1 sentence, a button in the body | 45 | fits |
| 35 | Save Changes | `DI/ui/components/create-flow/DatapackFlowDialog.tsx:55-60,100` | Form | **L 640** | **1 sentence**, 4 buttons | 62 | **sparse** |
| 35a | Save As New Datapack | same | Form | **L 640** | 1 sentence, 1 field, 3 buttons | 60 | **sparse** |
| 35b | Create Datapack (name), then picks; Add Unused Items | same | Form | L 640, then wide 980 | a field; then two panes of lists | n.a. | name step sparse, picks fit |
| 35c | the flow's own result | `DatapackFlowDialog.tsx:56` | Result | S 400 | a line | n.a. | fits |
| 36 | Progress window, running | `core/ui/components/feedback/OperationProgressModal.tsx:269-273` | Progress | **M 480**, always | a large spinner and 3 lines in at least 176px, or rows in 2 columns; 1 button | 25 (the label's cap) | fits |
| 36a | Progress window, clean result | `OperationProgressBody.tsx:105-109,133` | Result | **M 480** | **title alone**, 1 button, for 1.5 seconds | n.a. | **sparse** |
| 36b | Progress window, result with a note | `OperationProgressBody.tsx:137` | Result | **M 480** | 1 or 2 sentences, 1 or 2 buttons | varies | sparse for one sentence (one thin line) |
| 36c | Progress window, failure | `OperationProgressModal.tsx:153-163` | Result | M 480 | the reason, 3 buttons | varies | fits (at S the three buttons would be tight: about 306 of 320px) |
| 36d | Progress window, a question | `OperationProgressBody.tsx:52-61` | Confirm, or Form | M 480 | a sentence, steps, fields | varies | fits |
| 37 | Field help, popover | `core/ui/components/forms/FieldHelpButton.tsx:246` | other | Spectrum's popover, text capped at 288px | text | n.a. | fits |
| 38 | Field help, with steps | `FieldHelpButton.tsx:289` | Guide | L 640, Spectrum's own shell | steps with screenshots | n.a. | not judged |

### Sizes used per layout

Counted by state, so a window with a form and a result counts in both rows.

| Layout | S 400 | M 480 | L 640 | wide 980 |
|---|---|---|---|---|
| Form | 4 (Give Access, Simulate Downtime, the ERP's name, Version History) | 5 (Prompt, Integration Settings, Add Another ERP, Edit Demo Package, Load from File), plus the install form for 6 data types or fewer | 9 (Manage APIs, AI Capabilities, Share, Add a Demo Package, Add Integration, Updates, Clear Demo Data, Save Changes, Save As New and Create's name), plus the install form for 7 to 12 | 2 (Assign Products, Create's picks and Add Unused Items), plus the install form past 12 |
| Confirm | 12 (the 11 house confirms and Remove access) | 3 (uninstall, "Save Your Changes First?", every question the progress window asks) | 2 ("Add X and Prepare the Store?", "Reset N Projects?") | 1 ("Delete N Projects?") |
| Progress | 1 (uninstall) | 2 (the progress window for all 31 operations; a short install run) | 3 (Updates run, Reset Selected run, a long install run) | 1 (Delete Selected run) |
| Result | 9 (Updates, both batch results, install, uninstall, Load, the datapack flow's own, Assign's nothing-to-list, Clear's read failure) | 1 window, 31 operations (the progress window) | 3 (Manage APIs' two, "Couldn't Add X") and every run that ends with a problem where it ran | 0 |
| Guide | 0 | 1 (a datapack's Admin step) | 1 (field help) | 1 (Demo Setup) |

Reading: Confirm is the consistent layout. 12 of 18 are small and drawn by one component. Form
has no rule that its sizes follow: a one-field form is small in three places (Give Access, the
ERP's name, Simulate Downtime) and large in three (Save As New, Create's name, Add a Demo
Package). Result is split in two by who hosts it. A run in a window of its own ends small (9). A
run in the progress window ends medium (31 operations). The standard says Result is small
(`SOP:38`), so the progress window is the outlier, and it is the one most runs use.

### The sparse ones

| Dialog | Size | Holds |
|---|---|---|
| Progress window's clean result (all 31 operations) | M | a title and Close |
| Progress window's one-sentence results (Clear, Save, Create, and any run with a note) | M | one line |
| Save Changes | L | one sentence |
| Save As New Datapack | L | one sentence, one field |
| Create Datapack, name step | L | one field |
| Manage APIs, "Sign In to Adobe" and "Couldn't Load Adobe APIs" | L | 1 to 3 sentences |
| "Couldn't Add X" (prepare on add) | L | one line |
| Add a Demo Package, first stage; Add Integration, short stages | L | a lead and a field (not read stage by stage) |

Eight dialogs or states, plus one shared window that covers 31 operations. Every one is a
dialog that keeps a size chosen for a different state of itself: the list it will show later, or
the run it just showed.

### Which change size between their own states

| Dialog | Sizes it goes through | Animated? |
|---|---|---|
| Updates | L list, L run, **S** when clean (L when a row has a problem) | no |
| Reset Selected, Delete Selected | L or wide, then **S** when clean | no |
| Datapack install | M, L or wide form; M check and confirm; run at M or the form's width; **S** result | no |
| Datapack uninstall | S wait, **M** confirm, S run, S result (M with a root category left) | no |
| Load from File | M form, **S** result | no |
| Clear Demo Data | L form, S on a read failure; its run and result are a second window at M | no |
| Save Changes, Create Datapack | L (then wide for picks), then a second window at M for the run and the result | no |
| Assign Products | wide; S when there is nothing to list | no |
| Manage APIs, Add a Demo Package, Add Integration, "Add X and Prepare the Store?" | none: every state at L | n.a. |
| Progress window | none: every state at M. Its height changes with each state | no |

No size change animates anywhere. `useDialogViewChange.ts` takes the new size at once and fades
the body in (`FRONTEND_TIMEOUTS.DIALOG_BODY_FADE`). A wait holds the box it found: the width, and
the height as a floor (`holdBox`, `useDialogViewChange.ts:44-47`; `Modal`'s `waiting` and
`holdSize`). `SteadyHeight` no longer eases; it only sets a floor (`layout/SteadyHeight.tsx:1-5`).
`modal.css` declares no transition on the dialog. This matches `SOP:177-184`.

Four comments still describe easing that no longer exists: `SOP:196` ("the width steps and their
easing"), `SOP:54` ("eases to the content"), `OperationProgressModal.tsx:15-18` ("eases between
them") and `importModalView.ts:296` ("the dialog eases between widths"). The reduced-motion rule at
`modal.css:464-470` turns off a transition nothing sets.

The save's path is the widest swing in the extension: Save Changes at 640, its run at 480, its
result at 480. Create Datapack goes 640, 980, 480, 480.

### Options for the ratio, extension-wide

Not a recommendation. Each says what it changes and how many dialogs it touches.

| Option | What changes | Dialogs it changes | Cost |
|---|---|---|---|
| **A. Result and Confirm are always small.** The standard already says so (`SOP:36,38`) | The progress window ends at S for a clean result and for a result of one or two sentences, as Updates does. The three L results and the M uninstall confirm go to S | 1 shared window (all 31 operations), plus 5 states: Manage APIs' two, "Couldn't Add X", uninstall's confirm, and the prepare-on-add confirm if its rows allow | One more size change at the end of every progress-window run (480 to 400). The failure view's three buttons are tight at S, so it would stay M |
| **B. A dialog's size follows what it holds now, not what it will hold.** No list on screen means no L | Save Changes, Save As New, Create's name step, and the short first stages of Add a Demo Package and Add Integration open at S or M and widen when the list arrives | 5 dialogs, on top of A's | More size changes between stages. `SOP:180-184` allows one change per run, when the content arrives |
| **C. The text follows the box.** A line-length cap (about 60 characters) on `.lead-text` and `.dialog-line`, and a larger lead (16px) in a dialog whose body is only sentences | Two shared classes. Reaches every dialog that uses them: `LeadText` in 14 files, `.dialog-line` in 13 | Every dialog, by two CSS rules. Four bodies use a bare Spectrum `Text` and would not get it until they move to the house classes (Remove access, Manage APIs' sign-in and failure, Integration Settings' failure, Clear Demo Data's two lines) | Does not remove empty width at L; it only stops a line running across it. A fifth text size against `SOP:116` ("Four kinds of text") |

**Least change:** A. It is one shared component and five states, and it is what the standard
already says. **Most consistent:** A and B together: every dialog is then as wide as what it
shows, which is the rule the nine small results already follow. C is the only one that changes
the text itself, which is the half of the ratio A and B do not touch.

---

## Table B: which dialogs close themselves

### The one timer

`OperationProgressModal.tsx:235-239` closes the window `TIMEOUTS.UI.RESULT_GLANCE` after a
success: 1,500 ms (`core/utils/timeoutConfig.ts:101`). It stays instead when the success carries
any of: a warning, a note, detail lines, a list of changes (`holdsResult`, `:46-48`), or a next
step (`:230`, from the screen or offered by the run). A failure always stays.

It is the only self-closing dialog in the extension. Searched `src/` for `RESULT_GLANCE` (3
lines: the constant, this timer, and a wizard step's hold) and for a `setTimeout` that calls a
close (1 line: this timer).

### Operations in the progress window

"Usual run" is from the stage tables' expectations (`core/utils/operationStages.ts`), where one
is stated. They are first estimates by that file's own header.

| Operation | The SC pressed | Usual run | Ends | Because | File:line |
|---|---|---|---|---|---|
| Deploy API Mesh | Deploy on the mesh card | 1 to 2 minutes, then up to 2 more to verify | **closes itself** | returns nothing to read | `features/mesh/services/deployMeshWithFeedback.ts:103` |
| Change Destination | a destination in the picker | a few seconds; 1 to 2 minutes per integration moved | **closes itself** | nothing to read | `features/dashboard/handlers/destinationHandlers.ts:93` |
| Delete a project | Delete, then VS Code's confirm | not stated | **closes itself** | nothing to read | `features/projects-dashboard/services/projectDeletionService.ts:163-176` |
| Sync the Storefront | Sync Storefront | not stated | **closes itself** | nothing to read | `features/dashboard/handlers/edsContentHandlers.ts:45` |
| Refresh the Block Library | Refresh Block Library | not stated | **closes itself** | nothing to read | `edsContentHandlers.ts:99` |
| Republish Storefront (Configure) | Save on Configure, then Republish | not stated | **closes itself** | nothing to read found | `features/dashboard/commands/configureRepublishRun.ts:111` |
| Save X to GitHub | Save to GitHub | not stated | **closes itself** | returns the repository but no note | `features/dashboard/handlers/appBuilderComponentPromote.ts:289-298` |
| Copy Settings from a Project | Copy from a project | the SC's own pace (it asks which project) | **closes itself** | the wizard opens | `features/projects-dashboard/handlers/projectsListTransfer.ts:47-60` |
| An action with no verb entry (fallback) | n.a. | n.a. | **closes itself** | nothing to read | `features/dashboard/ui/hooks/useComponentOperation.ts:91` |
| Clear Demo Data | Clear N Items | not stated | **stays** | always a sentence (`note`) | `DI/handlers/demoDataHandlers.ts:175` |
| Save a datapack | Save | about a minute | **stays** | always a note | `DI/handlers/storeChangesHandlers.ts:338` |
| the same, nothing changed | Save | about a minute | **closes itself** | "No Changes to Save" has no note | `OperationProgressModal.tsx:166-168` |
| Create a datapack | Create | about a minute | **stays** | always a note | same |
| Apply the Demo Setup, Apply one step, Undo one step | Apply All, Apply, Undo in the guide (when the run stops on a question) | under a minute | **stays**, usually | rows of what changed, or a line saying nothing did | `features/dashboard/handlers/storePreparationHandlers.ts:187-196` |
| Deploy, Redeploy, Update, Install, Reinstall, Remove an integration | the card's button or menu row | 1 to 3 minutes | **depends** | stays on a warning, or when the card has setup steps left ("Open Demo Setup") | `features/dashboard/handlers/appBuilderComponentOperation.ts:160,240`; `features/dashboard/ui/components/integrations/useSetupGuide.ts:93-108` |
| Add an integration | Add in the flow | 2 to 3 minutes | **depends** | the same two | `useComponentOperation.ts:183-196` |
| Add an ERP | Add in Add Another ERP | about a minute | **depends** | a warning, a note, or an offer to assign products | `features/dashboard/handlers/erpAddHandler.ts:413-423` |
| Fill X from Commerce | Fill, after its confirm | about a minute | **depends** | a warning or a note | `features/dashboard/handlers/erpFillHandler.ts:118-150` |
| Reset the ERPs | Reset, after its confirm | a minute or two | **depends** | a warning or a note | `features/dashboard/handlers/erpResetHandlers.ts:195-226` |
| Assign Products | Assign N Products | under a minute | **depends** | a warning, or "Nothing to write: …" | `features/dashboard/handlers/erpAssignHandlers.ts:194-221` |
| Undo the last assignment | Undo, after its confirm | under a minute | **depends** | a warning | `erpAssignHandlers.ts:281-283` |
| Add or remove erp_owner | Add or Remove, after its confirm | a few seconds per set | **depends** | a warning when it stopped part way | `features/dashboard/handlers/erpOwnerSetsHandlers.ts:120,160` |
| Reset a project | Reset, then VS Code's questions | not stated | **depends** | an EDS reset can carry a warning; otherwise nothing | `features/eds/services/reset/edsResetUI.ts:379`; `features/lifecycle/services/projectResetService.ts:451` |
| Republish a project's content | Republish Content | not stated | **depends** | a note about store pages | `edsContentHandlers.ts:235` |

By title set (31): **9 always close themselves, 6 always or nearly always stay, 16 depend** on
whether that run had something to say.

### Runs in a window of their own

| Run | The SC pressed | Ends | File:line |
|---|---|---|---|
| Updates | Apply N Updates | **stays**: "Updates Applied", title alone, small | `features/projects-dashboard/ui/components/UpdatesModal.tsx:142-145` |
| Reset Selected, Delete Selected | Reset N Projects, Delete N Projects | **stays**: title alone, small | `features/projects-dashboard/ui/components/ProjectsBatchModal.tsx:210` |
| Datapack install | Import | **stays**: title alone or a sentence | `DI/ui/components/importModalView.ts:338-347` |
| Datapack uninstall | Uninstall | **stays** | same |
| Dry run | Dry Run | **stays**, with Back | `DI/ui/components/importResult.ts:256-260` |
| Load from File | Load | **stays** | `DI/ui/components/LoadDatapackFileModal.tsx:124-136` |

All seven stay until closed. Four of them end on a title with nothing under it.

### Forms that do their own work

| Form | Ends | File:line |
|---|---|---|
| Manage APIs, Apply | closes at once on success, no result shown | `ManageApisModal.tsx:270` |
| Integration Settings, Save and Redeploy | closes at once | `IntegrationSettingsModal.tsx:158-159` |
| Edit Demo Package, Save | closes at once | `EditDemoPackageModal.tsx:68-69` |
| The ERP's name, Save | closes at once | `PairedSystemNameDialog.tsx:76-77` |
| Simulate Downtime, Start | stays, now offering End Downtime | `ErpDowntimeDialog.tsx:71-87` |
| AI Capabilities, Regenerate AI Files | stays; a success has no title of its own | `AiCapabilitiesModal.tsx:156` |
| Give Access, New Prompt, Add a Demo Package, Share | not traced past their own files | |

### The pattern

The rule the code states is "a success with nothing to read closes itself"
(`OperationProgressModal.tsx:219-229`). The standard says nearly the same: "Where nothing
follows from it, it closes itself (the progress window); a dialog whose result offers Back to
its form (Import) stays until closed" (`SOP:69-71`).

That rule explains the progress window completely: all 31 follow it. It does not explain the
extension. What decides is **which component hosts the run**:

- A run in the progress window closes itself unless it has something to say.
- A run in a window of its own always stays, even when it has nothing to say.

So the exceptions to "nothing to read closes itself" are the four title-only results that stay:
**"Updates Applied", "Projects Reset", "Projects Deleted", and a clean "My Luma Imported"**. The
standard's reason for Import staying (it "offers Back to its form") no longer holds: a clean
install ends on Close alone (`SOP:97`).

Length does not explain it either. A mesh deploy the SC watched for two to four minutes vanishes
1.5 seconds after it finishes. A batch reset stays.

One operation behaves two ways: a datapack save stays when it saved and closes itself when
nothing had changed. The second is the case where the SC most needs to read why.

One comment contradicts the code: `core/ui/hooks/useOperationRunner.ts:47-53` says the window
"ends on this now, and they close it".

### Candidate rules

| Rule | What it changes | Count |
|---|---|---|
| **1. Every result stays until closed.** | The timer goes. Every progress-window run ends on its title and Close | 9 operations that always close, the clean path of 16 more, and "No Changes to Save": 26 of 31 title sets, by deleting one effect |
| **2. Nothing to read closes itself, everywhere.** | The four title-only results in their own windows close after the glance | 4 results in 3 windows (Updates, the batch window, install) |
| **3. It depends on where the SC started.** Started from a dialog: stays. Started from a card or tile: closes itself (the datapack audit's G2) | "No Changes to Save" stays. Whether a run started from a confirm counts as "from a dialog" has to be decided: if it does, Fill, Reset ERPs, Undo, the erp_owner pair, Remove, Reinstall, Assign and Add ERP also stay | 1 for certain; up to about 10 by that reading |
| **4. It depends on length.** A run usually over some threshold stays | Mesh deploy, Change Destination with integrations to move, and the integration verbs' clean paths stay; quick ones still close | about 10; needs a threshold and a stated expectation per operation, and 6 operations have none |

Rule 1 is the least code and the most uniform: one behaviour, no conditions. Rule 2 keeps today's
majority behaviour by operation count (25 of 31 can close themselves) and moves the fewest
dialogs. Rules 3 and 4 each add a condition the SC cannot see.

---

## Table C: titles while running, done, failed

### Operations in the progress window

X is a name the SC gave (a project, an integration, an ERP, a datapack).

| Operation | Running | Done | Failed | File:line |
|---|---|---|---|---|
| Deploy mesh | "Deploying API Mesh" | "API Mesh Deployed" | "Couldn't Deploy API Mesh" | `features/dashboard/ui/integrationsSurface/useIntegrationsScreenActions.ts:32-34` |
| Change destination | "Changing Destination" (the target on a line under it) | "Destination Changed" | "Couldn't Change the Destination" | `useIntegrationsScreenActions.ts:116-119` |
| Assign products | "Assigning Products to X" | "Products Assigned to X" | "Couldn't Assign Products to X" | `features/dashboard/ui/components/integrations/ErpAssignDialogs.tsx:84-86` |
| Undo assignment | "Undoing X's Last Assignment" | "X's Last Assignment Undone" | "Couldn't Undo X's Last Assignment" | `ErpAssignDialogs.tsx:98-100` |
| Add erp_owner | "Adding erp_owner to Attribute Sets" | "erp_owner Added to Attribute Sets" | "Couldn't Add erp_owner to Attribute Sets" | `ErpAssignDialogs.tsx:113-121` |
| Remove erp_owner | "Removing erp_owner from Attribute Sets" | "erp_owner Removed from Attribute Sets" | "Couldn't Remove erp_owner from Attribute Sets" | same |
| Undo a setup step | "Undoing {step}" | "{step} Undone" | "Couldn't Undo {step}" | `features/dashboard/ui/components/integrations/useGuideRun.ts:56` |
| Apply every setup step | "Applying the Demo Setup for X" | "Demo Setup Applied for X" | "Couldn't Apply the Demo Setup for X" | `useGuideRun.ts:58` |
| Apply one setup step | "Applying {step}" | "{step} Applied" | "Couldn't Apply {step}" | `useGuideRun.ts:60` |
| Reset a project | "Resetting X" | "X Reset" | "Couldn't Reset X" | `features/dashboard/ui/hooks/useDashboardOperations.ts:54-56`; `features/projects-dashboard/ui/index.tsx:365-367` |
| Delete a project | "Deleting X" | "X Deleted" | "Couldn't Delete X" | `useDashboardOperations.ts:65-67`; `index.tsx:271-273` |
| Sync storefront | "Syncing the Storefront" | "Storefront Synced" | "Couldn't Sync the Storefront" | `useDashboardOperations.ts:76-78` |
| Refresh block library | "Refreshing the Block Library" | "Block Library Refreshed" | "Couldn't Refresh the Block Library" | `useDashboardOperations.ts:87-89` |
| Republish content | "Republishing X" | "X Republished" | "Couldn't Republish X" | `useDashboardOperations.ts:98-100` |
| Republish (Configure) | "Republishing Storefront" | "Storefront Republished" | "Couldn't Republish the Storefront" | `features/dashboard/ui/configure/hooks/useRepublishProgress.ts:20-22` |
| Deploy, and Retry | "Deploying X" | "X Deployed" | "Couldn't Deploy X" | `features/dashboard/ui/hooks/useComponentOperation.ts:70-98` |
| Redeploy | "Redeploying X" | "X Redeployed" | "Couldn't Redeploy X" | same |
| Update | "Updating X" | "X Updated" | "Couldn't Update X" | same |
| Install | "Installing X into Commerce" | "**X into Commerce Installed**" | "Couldn't Install X into Commerce" | same |
| Reinstall | "Reinstalling X in Commerce" | "**X in Commerce Reinstalled**" | "Couldn't Reinstall X in Commerce" | same |
| Remove, and Remove Anyway | "Removing X" | "X Removed" | "Couldn't Remove X" | same |
| Save to GitHub | "Saving X to GitHub" | "**X to GitHub Saved**" | "Couldn't Save X to GitHub" | same |
| An action with no verb entry | "X" | "X Finished" | "**X Did Not Finish**" | `useComponentOperation.ts:91` |
| Reset ERPs | "Resetting the ERPs" | "ERPs Reset" | "Couldn't Reset the ERPs" | `useComponentOperation.ts:144-146` |
| Fill an ERP | "Filling X from Commerce" | "X Filled from Commerce" | "Couldn't Fill X from Commerce" | `useComponentOperation.ts:162-164` |
| Add an integration | "Adding X" | "X Added" | "Couldn't Add X" | `useComponentOperation.ts:191-193` |
| Add an ERP | "Adding X" | "X Added" | "Couldn't Add X" | `useComponentOperation.ts:211-213` |
| Copy settings | "**Copy Settings from a Project**" | "Settings Copied" | "Couldn't Copy the Settings" | `features/projects-dashboard/ui/index.tsx:255-257` |
| Clear demo data | "Clearing Demo Data" (store codes under it) | "Demo Data Cleared" | "Couldn't Clear Demo Data" | `DI/ui/hooks/useClearDemoData.tsx:37-41` |
| Save a datapack | "Saving X" | "X Saved"; "No Changes to Save" | "Couldn't Save X" | `DI/ui/hooks/useSaveStoreChanges.tsx:93-96` |
| Create a datapack | "Creating X" | "X Created" | "Couldn't Create X" | same |

### Runs in a window of their own, and forms that run

| Run | Form's title | Running | Done | Failed | Title changes when the run starts? | File:line |
|---|---|---|---|---|---|---|
| Updates | "Updates Available" | "Applying Updates" | "Updates Applied" | "Couldn't Apply the Updates"; with a warning, "Some updates didn't apply" | **yes** | `UpdatesModal.tsx:45,122-129`; `features/projects-dashboard/ui/hooks/useUpdatesModal.ts:42` |
| Reset Selected | "Reset N Projects?" | "Resetting Projects" | "Projects Reset" | "Couldn't Reset Projects" | **yes** | `ProjectsBatchModal.tsx:72-76,100-112`; `features/projects-dashboard/ui/hooks/useProjectsBatch.ts:112-114` |
| Delete Selected | "Delete N Projects?" | "Deleting Projects" | "Projects Deleted" | "Couldn't Delete Projects" | **yes** | same |
| Datapack install | "Import X" | "**Import X**" | "X Imported" | "Couldn't Import X"; "Import Stopped"; "Some Data Types Not Imported"; "Import Did Not Start"; "Import Status Unknown" | **no** | `DI/ui/components/importModalView.ts:347-358`; `importResult.ts:193-313` |
| Datapack uninstall | "Uninstall X from {store}?" | "**Uninstall X**" | "X Uninstalled" | "Couldn't Uninstall X"; "Action Required to Uninstall X"; "Couldn't Save Changes" | yes (the question mark and the store go) | same |
| Dry run | "Import X" | "Import X" | "Dry Run Passed" | "Dry Run Failed"; "Validation Failed" | no | `importResult.ts:256-260` |
| Load from File | "Load from File" | "Load from File" (the button spins) | "X Loaded" | "Couldn't Load X"; "X Partly Loaded" | no | `LoadDatapackFileModal.tsx:125,187-196` |
| Save Changes, Create Datapack | "Save Changes", "Create Datapack" | a second window: "Saving X", "Creating X" | "X Saved", "X Created" | "Couldn't Save X" | **yes**, with the window | `DatapackFlowDialog.tsx:100`; `useSaveStoreChanges.tsx:93` |
| Clear Demo Data | "Clear Demo Data" | a second window: "Clearing Demo Data" | "Demo Data Cleared" | "Couldn't Clear Demo Data" | **yes**, with the window | `ClearDemoDataModal.tsx:34`; `useClearDemoData.tsx:37` |
| Manage APIs, Apply | "Manage APIs for X" | the same | none (closes) | "Couldn't Update API Access" | no | `ManageApisModal.tsx:88-97,219-235` |
| Integration Settings | "X Settings" | the same (the button spins) | none (closes) | "Couldn't Save X Settings"; "Couldn't Redeploy X" | no | `IntegrationSettingsModal.tsx:42-45` |
| Edit Demo Package | "Edit Demo Package" | the same | none (closes) | "Couldn't Save the Changes" | no | `EditDemoPackageModal.tsx:34-36` |
| AI Capabilities, Regenerate | "AI Capabilities" | the same; "Regenerating AI Files" once sent to the background | none | "Couldn't Regenerate AI Files" | no | `AiCapabilitiesModal.tsx:148,156` |
| Simulate Downtime | "X: Simulate Downtime" | the same | the same | "Couldn't Start Downtime on X"; "Couldn't End Downtime on X"; "Couldn't Read X" | no | `ErpDowntimeDialog.tsx:56-60` |
| Add a Demo Package | "Add a Demo Package" | the same | none traced | its outcomes' own titles | no | `AddDemoModal.tsx:132`; `add-demo/addDemoFlow.ts:55` |

### Counts

**Running title** (31 progress-window operations and the 7 runs in their own windows, 38):

| Form | Count | Which |
|---|---|---|
| "-ing" + the thing ("Resetting X", "Deploying API Mesh") | 32 | 29 operations, Updates, both batch runs |
| Imperative verb + the thing ("Import X") | 5 | "Copy Settings from a Project"; datapack install, uninstall, dry run; "Load from File" |
| The bare name | 1 | the fallback |
| Noun ("Project Reset") | 0 | |

A form that runs in its own window without a second window never changes its title (6 of 6:
Manage APIs, Integration Settings, Edit Demo Package, AI Capabilities, Simulate Downtime, Add a
Demo Package). The three windows that go from a question or list to a run do change it (Updates
and the two batch runs). The datapack install is the one window that shows a form, then a run,
under one unchanged title.

**Done title** (38):

| Form | Count | Which |
|---|---|---|
| The SC's name + what happened ("X Reset", "X Saved", "Products Assigned to X") | 24 | 20 operations; "X Imported", "X Uninstalled", "X Loaded"; and "X Finished" |
| The kind of thing + what happened ("API Mesh Deployed", "Storefront Synced") | 13 | 10 operations ("API Mesh Deployed", "Destination Changed", the erp_owner pair, "Storefront Synced", "Block Library Refreshed", "Storefront Republished", "ERPs Reset", "Settings Copied", "Demo Data Cleared"); "Updates Applied"; "Projects Reset"; "Projects Deleted" |
| Other | 1 | "Dry Run Passed" |

Every one of the 37 is "the thing, then a past participle". The 13 generic ones name things
that have no name of the SC's, which the standard allows (`SOP:135`). The two batch titles are
generic on purpose (`ProjectsBatchModal.tsx:68-70`).

Three done titles put the participle after a place: "X into Commerce Installed", "X in Commerce
Reinstalled", "X to GitHub Saved". They come from one template (`useComponentOperation.ts:97`:
the name, the suffix, then the verb). Four others put the participle first and the place after:
"Products Assigned to X", "X Filled from Commerce", "erp_owner Added to Attribute Sets", "Demo
Setup Applied for X".

**Failed title** (every failure title found in a dialog: 31 operations, the 7 own-window runs,
and the forms; about 62 titles):

| Form | Count | Which |
|---|---|---|
| "Couldn't …" | about 51 | 30 of 31 operations; Updates; both batch runs; six datapack ("Couldn't Import X", "Couldn't Uninstall X", "Couldn't Load X", "Couldn't Save Changes", "Couldn't Check for Changes", "Couldn't Read the Stores"); twelve form titles |
| "… Failed" | 4 | "Dry Run Failed", "Validation Failed" (`importResult.ts:256,260`); "Export Failed" (`DI/ui/components/ExportDatapackResult.tsx:51`); "Project Setup Failed" (`features/project-creation/ui/components/integration-flow/stages/DestinationStage.tsx:107`) |
| "… Did Not …" | 2 | "X Did Not Finish" (the fallback); "Import Did Not Start" |
| "… Stopped" | 1 | "Import Stopped" (two sites) |
| Other | 4 | "Some Data Types Not Imported"; "Import Status Unknown"; "Action Required to Uninstall X"; "Some updates didn't apply" (also the only sentence-case title here) |
| "Could Not …" | 0 | as a title. It appears only inside sentences |

### Smaller differences inside the majority

- **"the" comes and goes.** "Republishing Storefront" runs, "Couldn't Republish the Storefront"
  fails. "Changing Destination", "Couldn't Change the Destination". "Syncing the Storefront" has
  it in both. "Deploying API Mesh" has it in neither.
- **Four operations carry a second running title** the SC sees only outside the window (a
  notification, an agent's run), written in the handler and not equal to the window's: "Loading
  Demo Data into X" against "Filling X from Commerce" (`features/dashboard/handlers/erpFillHandler.ts:84`);
  "Resetting X Records" against "Resetting the ERPs" (`erpResetHandlers.ts:180`); "Changing
  Destination to X" against "Changing Destination" (`destinationHandlers.ts:100`); "Applying the
  Demo Setup" against "Applying the Demo Setup for X" (`storePreparationHandlers.ts:118`).
- **A warning's title** is the done title with an amber icon in the progress window
  (`OperationProgressBody.tsx:182`), the failed title in the batch window
  (`ProjectsBatchModal.tsx:74`), and a title of its own in Updates ("Some updates didn't apply").

---

## What the numbers say

### 1. Size against content

**Majority today.** Confirm is small (12 of 18). A result in a window of its own is small (9).
Forms are sized for the longest list they will ever show (9 at L), whatever they show first.

**Outliers.** The progress window ends every one of its 31 operations at medium, where the
standard and the nine other results say small. Three results sit at large (Manage APIs' two,
"Couldn't Add X"). Three confirms are not small without a list to justify it (uninstall at M;
"Add X and Prepare the Store?" at L has rows, so it may be right). Five forms show one sentence
or one field at L (Save Changes, Save As New, Create's name, and the first stages of Add a Demo
Package and Add Integration).

**What adopting the majority changes.** "Result and Confirm are small" changes one shared window
and five states. It leaves the text itself as it is: 14px under an 18px title, with a bold 14px
button beside it. If the complaint is about the text and not only the box, that is option C, and
it is two CSS rules.

### 2. Closing itself

**Majority today.** By operation count: 25 of 31 progress-window operations can close themselves,
and 9 always do. By window: one window closes itself and every other one stays.

**Outliers.** Read as "nothing to read closes itself": the four title-only results that stay
(Updates Applied, Projects Reset, Projects Deleted, a clean install). Read as "results stay":
the progress window. Either way, "No Changes to Save" is the odd one: the same button's other
outcome stays.

**What adopting the majority changes.** "Nothing to read closes itself" moves 4 results in 3
windows. "Every result stays" moves 26 title sets by deleting one effect. The owner's earlier
decisions point both ways: the timer is dated 2026-09-20 in the code, and the clean small
results that stay are dated 2026-11-10.

### 3. Titles

**Majority today.** Running: "-ing" + the thing, 32 of 38. Done: the thing + past participle,
37 of 38, with the SC's name wherever there is one. Failed: "Couldn't …", about 51 of 62.

**Outliers.** Running: the datapack install, uninstall and dry run, Load from File, and "Copy
Settings from a Project" are imperative. The standard's own example is one of them (`SOP:108`,
"Import My Luma"). Done: three word orders from one template ("X into Commerce Installed"), and
"Dry Run Passed". Failed: eleven titles, eight of them in the datapack install window, plus
"Export Failed", "Project Setup Failed" and the fallback's "Did Not Finish".

**What adopting the majority changes.** Running: 5 titles, of which 4 are datapack (and the
standard's sentence at `SOP:108`). Done: one template line fixes three titles. Failed: 11
titles in 5 files. None of the three changes touches the 29 operations that already agree.

---

## What I could not check

- **Nothing was rendered.** No webview was opened. Widths are from Spectrum's built stylesheet
  and `modal.css`; heights and "where the sentence sits" are sums of CSS values.
- **The title's 18px** is Spectrum's token on the medium scale. Spectrum also ships a 16px value
  for the same token in another context, and which applies was read from the sheet, not seen.
  The datapack audit lists it as needing a screenshot too.
- **Characters per line** assume 7px per character at 14px. The real font's widths were not measured.
- **Fit** is a judgement from counts. "Tight" and "sparse" need a screenshot to confirm, most of
  all row 1 (Give Access's long checkbox label) and row 33a (three long buttons at medium).
- **Stage by stage:** Add a Demo Package, Add Integration, Share and the field-help dialog were
  read at the `Modal` call, not through every stage they show.
- **What each run returns** was read at the handler that builds the outcome. The integration
  verbs, the Configure republish and Save to GitHub were not traced through every service they
  call, so a note or warning added deeper down would move a row from "closes itself" to "depends".
- **Usual run times** are the stage tables' own first estimates. Six operations state none.
- **Give Access, New Prompt, Add a Demo Package and Share** were not traced to see whether they
  close on success.
- **VS Code's own dialogs** (reset's questions, agent consents) are outside this inventory.
- **Whether a dialog with no `fitContent`** (rows 2, 3, 4, 11) stands taller than its content
  depends on Spectrum's wrapper and was not seen.
