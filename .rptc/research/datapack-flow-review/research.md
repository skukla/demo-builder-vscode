# Datapack flows: the map, and what to improve

Review of branch `fix/release-walk-fixes` with its uncommitted changes, 2026-11-10. Read from the
code only. Nothing was run, no store was touched, and the rendered screens were not seen (section 4).

Paths are under `src/`. `DI/` stands for `src/features/data-installer/`.

Every word in quotes below is copied from the file and line cited.

## 1. The map

### 1.1 Where an SC gets in

| Entry | What it opens | Words | Where |
|---|---|---|---|
| Dashboard tile | The project's Datapacks screen | "Datapacks"; hover "This demo's datapack: import it, save its changes, or choose another"; line "No Datapack" or the pack's name | `features/dashboard/ui/components/DataInstallerTile.tsx:59,64`; `features/dashboard/handlers/datapackLineHandler.ts:23-39` |
| Sidebar | The Datapack Library (no project, no Commerce actions) | Button "Datapacks" | `features/sidebar/ui/views/UtilityBar.tsx:63-67` |
| Wizard, Commerce strip | The Datapacks step (chooses, never imports) | "Datapacks" | `features/project-creation/ui/steps/commerceSections.ts:69` |
| Project reset, Reset Selected | A question about the datapack | "Uninstall Datapack" | 1.10 |
| Project delete, Delete Selected | A box in the delete question | "Uninstall Datapack" | 1.11 |
| An agent | The datapack MCP tools | 1.18 | `features/ai/server/dataInstallerDescriptors.ts` |

### 1.2 Browse and filter

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Panel opens | Loading tab | "Loading Datapacks" or "Loading Datapack Library" | `DI/commands/showDataInstaller.ts:78-82` |
| Header | Title, subtitle | "Datapacks" over the project's name; or "Datapack Library" over "Browse and manage datapacks" | `DI/ui/DataInstallerScreen.tsx:67-81` |
| Tabs (project only) | Two views | "Catalog", "Activity" | `DI/ui/DataInstallerScreen.tsx:61-64` |
| First load | Spinner | "Loading datapacks" | `DI/ui/views/DatapackCatalogView.tsx:310` |
| Tool row | Search, count, Show list, actions | "Filter datapacks"; "Show": Recommended, My Datapacks, Team Datapacks, Data Installer Datapacks, Community Datapacks, All Datapacks | `DatapackCatalogView.tsx:329`; `DI/ui/catalogShow.ts:42-50` |
| Actions | Three quiet buttons | "Create Datapack" (or "Save Changes", or "Save As New Datapack"), "Load from File", "Clear Demo Data" | `DI/ui/components/CatalogHeaderActions.tsx:78-92` |
| Banner, when a source is missing | Blue or amber | "Showing Demo Builder's datapacks" with why; "Demo Builder's datapacks aren't available" | `DI/ui/components/DatapackSourceNotice.tsx:28-35` |
| Card | Art, name, check, version, tags | Version picker, or "Saved Nov 9, 1:56 PM"; tags "Mine", "Team", "Data Installer", "Community"; amber dot, hover "Updated on Nov 9" | `DI/ui/components/DatapackCard.tsx:186,296-300`; `projectPackNewer.ts:50` |
| Nothing in a Show choice | Empty state | "You Don't Have Any Datapacks", "No Team Datapacks" and so on; "Choose another view" or "Load a datapack .zip file, or save one from your demo's Commerce instance." | `catalogShow.ts:63-68`; `DI/ui/components/DatapackCatalogGrid.tsx:71-77` |
| Nothing matches | One line | No datapacks match "query" | `DatapackCatalogGrid.tsx:83` |
| Neither source answers | Error block | "Datapacks Aren't Available", "Retry" | `DatapackCatalogView.tsx:69`; `DI/ui/dataInstallerFailure.tsx:124-131` |
| Signed out | Info block | "Adobe Sign-In Required", "Sign in with Adobe to browse datapacks.", "Sign In with Adobe" | `dataInstallerFailure.tsx:61-70` |

### 1.3 A datapack's flyout

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Card pressed | Flyout slides in, waits | "Reading the datapack" | `core/utils/waitStages.ts:110`; `DI/ui/components/DatapackDetailPanel.tsx:235` |
| Title | Name, version, rename pencil on the SC's own | Version as a date for a save; rename field "New Datapack Name" | `DatapackDetailPanel.tsx:147-148`; `DatapackPanelTitle.tsx:27` |
| Rows | Label and value | "Description", "Owner" ("You"), "Visible To" ("Only you", "Everyone", "Everyone (community)"), "Updated", "Data", "Declared, Not Stored", "Also Sets" | `DatapackDetailPanel.tsx:260-315` |
| Admin step, if one is left | One line | "1 step left in the Admin", "Show Step" | `DI/ui/components/PackSetupStepLine.tsx:25-27` |
| Buttons, project | Up to three | "Save Changes" or "Save As New Datapack" (only on the version in use), "Import", "More" | `DI/ui/components/PackActions.tsx:243-250` |
| More | Two groups | "Save as File", "Version History", "Share" or "Stop Sharing"; then "Uninstall", "Delete Datapack", "Delete Store Settings" | `PackActions.tsx:94-112` |
| Buttons, Library | Up to three | "Save as File", "Share" or "Stop Sharing", "More" (deletes only) | `PackActions.tsx:289-317` |
| A menu action runs | Flyout shows only its wait | "Saving to a file", "Sharing the datapack", "Making it private", "Deleting the datapack", "Deleting store settings" | `waitStages.ts:112-127`; `PackActions.tsx:155-165` |
| It read badly | Error block in the flyout | "Could Not Reach the Data Installer", "Retry" | `dataInstallerFailure.tsx:127` |

### 1.4 Import, first install

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Import pressed | Window, waiting | Title "Import My Luma"; "Reading websites", "From this demo's Commerce instance" | `DI/ui/components/importModalView.ts:354,369`; `waitStages.ts:42` |
| Form | Two pickers, a checklist | "Website", "Store View", "Data", "Select All", one box per data type | `DI/ui/components/ImportForm.tsx:98-113,218-238` |
| Warning, if a needed type is missing | Orange line | "Other data may need these, and this datapack has none: …" | `ImportForm.tsx:47` |
| Footer | Three buttons | "Close", "Dry Run", "Import" | `importModalView.ts:210-216` |
| Run | Steps, from the first press | "Install My Luma" with "Starting", "Reading the new version", "Reading from Commerce", "5 of 11 data types", "Applying store settings", "Installed"; data types under it, the working one "Installing 1,200 of 2,046" or "Linking product options 2,044 of 2,046"; "Verify the Import" with "Recording what went in", then "Checked 2,048 products against the datapack: all match" | `DI/importSteps.ts:51-58,118-122,142-164,176-187,192` |
| Way out while it runs | One button | "Run in Background"; the notification says "Importing My Luma" | `importModalView.ts:251-254`; `importModalJob.ts:36-38` |
| Clean end | Small result | "My Luma Imported"; "New products can take 20 minutes to show in search."; "Close" | `DI/ui/components/importResult.ts:241-242`; `DI/services/demoBuilderEngine/installNote.ts:18` |
| End with a problem | Same steps, amber | "My Luma Imported", the problem on its step, "Took …", "Fix with AI", "Close" | `importResult.ts:243-244` |
| A stop | Same steps, red | "Import Stopped"; "Back", then "Retry" (twice), then "Fix with AI" | `importResult.ts:79,237-240` |
| Could not start | Small result | "Couldn't Start the Import", the reason, "Back" | `importResult.ts:153` |
| Project has no Commerce | Small result | "This project has no Commerce instance"; "Connect a Commerce backend on the project dashboard, then import from here."; "Close" | `importModalView.ts:325`; `ImportDatapackModalBody.tsx:40` |

### 1.5 Import the same version again

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Import pressed | Window waits about a minute | "Checking for your changes", "Since this demo's last save", "Usually about a minute" | `waitStages.ts:38-40`; `DI/ui/hooks/useImportChanges.ts:65` |
| Form | Pickers locked; a count under each data type | "12 updated, 2 removed", "No changes" | `DI/ui/importChangeLines.ts:24-36` |
| The check failed | Orange line | "What importing again would change could not be read." | `ImportForm.tsx:244` |
| Import | Runs at once, as 1.4 | | |

### 1.6 Import another version or datapack over the demo's

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Form | A lead sentence; every type ticked | "Replaces this demo's data with the version from Nov 9, 9:15 AM." or "Replaces this demo's datapack, Luma (eds-compatible)." | `DI/replaceWords.ts:35-40` |
| Import pressed | Wait, at the run's width | Title "Import My Luma"; "Checking for your changes"; "Cancel" | `importModalView.ts:323,368,252` |
| Question, only when something changed | Amber title, two-column list | "Save Your Changes First?"; "You changed these since this demo's last save. Importing replaces them."; "Products: 24-mb01, 24-mb02, 24-ug01 and 2 more" | `importModalView.ts:314`; `DI/ui/components/RemovalConfirmBody.tsx:24,38-43` |
| The SC's own datapack | A box | "Always Save Without Asking" | `RemovalConfirmBody.tsx:76` |
| A team or colleague's datapack | A field | "Save Changes As" | `RemovalConfirmBody.tsx:80` |
| Footer | One apart, two together | "Import Without Saving"; "Cancel", "Save and Import" or "Save As New and Import" | `DI/uninstallWords.ts:14-24`; `importModalView.ts:179-184` |
| The check failed | Amber title | "Couldn't Check for Changes"; "Importing replaces anything you changed since this demo's last save."; "Cancel", "Import Anyway" | `importModalView.ts:315,189`; `RemovalConfirmBody.tsx:30` |
| Run | Four steps | "Save Your Changes" ("Starting", the save's stage, "Saved as Nov 9, 1:56 PM"); "Uninstall the Previous Version" or "…Datapack" ("Reading the new version", "Uninstalling 2,062 of 2,197", "Uninstalled Nov 9, 9:15 AM"); "Install the Version from Nov 9, 1:56 PM"; "Verify the Import" | `importSteps.ts:72-110,141-143,192` |
| Clean end | Small result | "My Luma Imported"; "Your changes are saved in Version History." | `importResult.ts:204,211-218` |
| The save failed | Steps, red on Save | "Import Stopped"; "Nothing was uninstalled or installed."; "Back" returns to the question | `importResult.ts:177-193` |

### 1.7 Dry run

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Dry Run pressed | Wait | "Checking the import", "Nothing is written" | `waitStages.ts:45` |
| Passed | Small result, green | "Dry Run Passed"; "Nothing was written."; "Back" | `importResult.ts:258` |
| Found a problem | Small result, amber | "Validation Failed", the reason; "Back" | `importResult.ts:259` |
| Could not run | Small result, red | "Dry Run Failed", the reason; "Back" | `importResult.ts:255` |

### 1.8 Version History and Restore Version

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| More, Version History | Small dialog, radio list of dates | "Version History"; "This demo's data goes back to the version you choose."; "Nov 9, 9:15 AM (in use)" | `DI/ui/components/VersionHistoryDialog.tsx:63-85` |
| Footer | Two buttons | "Cancel", "Restore Version" (off until another version is chosen) | `VersionHistoryDialog.tsx:67-74` |
| Restore Version | The import form of 1.6 opens | Then check, question, run, result | `PackActions.tsx:271-274` |
| In the Library | Not offered | | `PackActions.tsx:266` |

### 1.9 Save Changes, Save As New Datapack, Create Datapack

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Entry | Header or flyout, same dialog | "Save Changes", "Save As New Datapack", "Create Datapack" | `CatalogHeaderActions.tsx:78-80`; `PackActions.tsx:244` |
| Save Changes | One sentence | "Saves everything this demo uses as a new version of My Luma."; "Add Unused Items" apart; "Cancel", "Save As New", "Save" | `DI/ui/components/create-flow/saveWords.ts:32-34`; `DatapackFlowDialog.tsx:72-74`; `datapackFlowStages.ts:137` |
| Save As New Datapack | A name | "Datapack Name", "e.g. My Bodea"; "Saves everything this demo uses as a new datapack of yours." | `stages/PackNameStage.tsx:25-30`; `saveWords.ts:22` |
| Add Unused Items | Checklists | "Nothing in this demo uses these yet. Select any to include."; "Cancel", "Add"; back on the save, "Add Unused Items (1)" | `saveWords.ts:25`; `DatapackFlowDialog.tsx:57,68,74` |
| Create Datapack | Name, then pick screens | "Select what to include from this demo's Commerce instance."; a card per kind: "3 selected", "None available", "Couldn't be read"; "Includes related categories, attributes and stock."; "Back", "Continue", "Create" | `saveWords.ts:19`; `stages/StorePicksStage.tsx:33-35`; `DI/ui/components/StoreKindItems.tsx:23-25`; `datapackFlowStages.ts:134-137` |
| Run | Progress window, a row per data type | "Saving My Luma" or "Creating My Luma"; "Reading from Commerce", "Saving to your datapacks"; "Run in Background" | `DI/ui/hooks/useSaveStoreChanges.tsx:93`; `core/utils/datapackStages.ts:12,18` |
| End | Small result | "Datapack Saved" or "Datapack Created"; "Saved a new version of My Luma." or "Saved as Acme Test. Scratch 1028 now uses it." | `useSaveStoreChanges.tsx:95`; `DI/services/demoBuilderEngine/saveOutcome.ts:62-65` |
| Nothing changed | Title only | "No Changes to Save" | `DI/handlers/packSave.ts:139` |
| Failed | Result, red | "Couldn't Save My Luma" or "Couldn't Create My Luma"; "Retry" | `useSaveStoreChanges.tsx:94` |

### 1.10 Uninstall

From the More menu:

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| More, Uninstall | Window, waiting | Title "Uninstall My Luma"; "Checking for your changes"; "Cancel" | `PackActions.tsx:107`; `importModalView.ts:323,368` |
| Question, nothing changed | Amber title | "Uninstall My Luma from Main Store (Main Website)?"; "Permanently deletes what My Luma installed: categories and products."; "Puts back the store settings it changed."; "Cancel", "Uninstall" | `importModalView.ts:314`; `DI/ui/components/removalConfirm.ts:40-41,109-111` |
| Question, with changes | The same list as 1.6 | "You changed these since this demo's last save. Uninstalling takes them out too."; "Uninstall Without Saving"; "Cancel", "Save and Uninstall" or "Save As New and Uninstall" | `RemovalConfirmBody.tsx:25`; `uninstallWords.ts:14-24` |
| "Always save" is on | One line | "Your changes will be saved to My Luma first." | `RemovalConfirmBody.tsx:64` |
| The check failed | Amber title | "Couldn't Check for Changes"; "Uninstalling removes anything you changed since this demo's last save."; "Uninstall Anyway" | `RemovalConfirmBody.tsx:31`; `removalConfirm.ts:110` |
| Run | Small window, one spinner | "Uninstalling the datapack" over a count; "Run in Background" | `core/utils/creationStages.ts:81`; `ImportDatapackModalBody.tsx:269-293` |
| End | Small result | "My Luma Uninstalled", the engine's note, "Took …"; "Back", "Close" | `importResult.ts:110,285,265-266` |
| A category root stayed | Result with an Admin step | "Action Required to Uninstall My Luma"; Where, Set, Then | `importResult.ts:276-282`; `DatapackResultBody.tsx:23-36` |
| The save failed | Result, red | "Couldn't Save Changes"; "Nothing was uninstalled."; "Back" returns to the question | `importResult.ts:150` |

From a project reset:

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Reset | VS Code dialog | "Are you sure you want to reset "X"? This will reset all code to the template state and re-copy demo content."; "Reset Project" | `features/eds/services/reset/edsResetUI.ts:138-140` |
| Then | Second VS Code dialog | "Uninstall My Luma Too?"; "Deletes what it installed in Commerce. Your changes are saved first. Can take several minutes."; "Uninstall Datapack", "Keep Datapack" | `features/eds/services/reset/edsResetSampleData.ts:86-107` |
| Run | Progress window | "Resetting X" | `edsResetUI.ts:387` |
| Changes, and the datapack is not the SC's | A question in the window | Field "Save Changes As"; "Save As New and Uninstall", "Uninstall Without Saving"; "Datapack name is required" | `edsResetSampleData.ts:247-264` |
| Commerce holds more than the datapack | Third VS Code dialog | "This demo's store, …, also holds … Demo Builder didn't install. … Also remove those, to leave this demo's store empty? This can't be undone."; "Remove Those Too", "Keep Them" | `features/eds/services/reset/edsResetOtherData.ts:150-160` |

From Reset Selected:

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Question | A table | "Each project returns to how it was set up. Code changes are lost."; columns "Project", "Uninstall Datapack" | `features/projects-dashboard/ui/components/BatchResetQuestions.tsx:50-80` |
| A check failed | Orange line on the row | "Couldn't check for changes. Datapack kept." | `BatchResetQuestions.tsx:28` |
| Changes to settle | Second step, "Datapack Changes" | "Changed since installed. Save each as a new datapack, or discard its changes."; columns "Datapack", "New Datapack Name"; "Discard Changes", "Changes discarded" | `BatchDatapackChanges.tsx:22-64`; `ProjectsBatchModal.tsx:106` |

### 1.11 Delete a project, Delete Selected

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Question, in the window | Title, sentence, boxes | "Delete X?"; "Project files are removed from this machine. Datapacks stay installed in Commerce unless you uninstall them."; "Delete Repository", "Delete DA.live Site", "Uninstall Datapack" (unticked): "My Luma, from this demo's Commerce instance. Your changes are saved first."; "Delete" | `features/projects-dashboard/services/deletionConfirmation.ts:74,93-122`; `features/projects-dashboard/deleteWords.ts:15-16` |
| Same question, no window | VS Code pick list | Delete "X"; "Also delete these external resources? (Enter to delete)" | `deletionConfirmation.ts:217-218` |
| Nothing online to delete | VS Code dialog | "Are you sure you want to delete "X"?"; "This will remove all project files and configuration. This action cannot be undone."; "Delete" | `deletionConfirmation.ts:46-51` |
| The data did not all come out | The delete stops | "Its datapack's data was not removed, so the project was kept: …" | `features/projects-dashboard/services/datapackDataRemoval.ts:56` |

### 1.12 Delete Datapack, Delete Store Settings, Share

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| More, Delete Datapack | Confirm | "Delete My Luma?"; "Permanently deletes it and its version history." or "Permanently deletes version main."; "Cancel", "Delete" | `PackActions.tsx:143-151` |
| Run | Flyout waits, then closes; the card goes | "Deleting the datapack", "From the library" | `waitStages.ts:120-122` |
| Failed | Red line under the buttons | "It could not be removed: …" | `DI/ui/components/RemoveFromLibraryButton.tsx:53` |
| More, Delete Store Settings | Confirm | "Delete My Luma's Store Settings?"; "Permanently deletes the store settings saved with it."; "Delete" | `PackActions.tsx:134-141` |
| Share | Confirm | "Share My Luma?"; "Everyone can find and install it under Community Datapacks."; "Share" | `PackActions.tsx:123-125`; `DI/shareWording.ts:11-12` |
| Stop Sharing | Confirm | "Stop Sharing My Luma?"; "Other people can no longer see or install it."; wait "Making it private" | `PackActions.tsx:126-132`; `waitStages.ts:118` |
| Either failed | Red line | "It could not be changed: …" | `DI/ui/hooks/useLibrarySharing.tsx:42` |
| Make a team datapack | No button | Agents only: `mark_team_datapack` | `dataInstallerDescriptors.ts:711` |

### 1.13 Save as File, Load from File, copy to the Data Installer

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Save as File | The system's save dialog | "Save the Datapack File" | `DI/handlers/datapackZipHandlers.ts:142` |
| Done | Line under the buttons | "Saved to <path>, with its store settings" | `DI/ui/components/SaveDatapackFileButton.tsx:84-85` |
| Failed | Red line | "The file could not be saved: …" | `SaveDatapackFileButton.tsx:79` |
| Load from File | The system's open dialog | "Open a Datapack File" | `datapackZipHandlers.ts:160` |
| Form | Sentence, two radios, a box | "Load a Datapack File"; "My Luma (my-luma-x1, version 20261109-141504) holds: Products, Categories."; "Destination": "Your Datapacks (Private Until Shared)", "Data Installer (Shared Catalog)"; "Replace Existing Version"; "Close", "Load" | `DI/ui/components/LoadDatapackFileModal.tsx:118,198,206-217` |
| Result | Title is the whole sentence | "Loaded 3 of 3 data types into your datapacks"; "This file cannot be loaded"; "The file was not loaded" | `LoadDatapackFileModal.tsx:169,178,188-189` |
| Undo | A button in the result | "Delete Datapack" (no question), then "Removed." | `LoadDatapackFileModal.tsx:139`; `RemoveFromLibraryButton.tsx:52,65-76` |
| Copy to the Data Installer | Hidden | Built, switched off | `PackActions.tsx:54` |

### 1.14 Clear Demo Data

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Header button | Large dialog, waiting | "Clear Demo Data"; "Reading demo data" | `DI/ui/components/ClearDemoDataModal.tsx:34,104` |
| Form | Lead, store list, preview | "Choose the stores that are this demo's. Clearing permanently removes what only they use and Demo Builder didn't install, and closes their orders."; "Stores"; "Select a store to preview what will be cleared." | `ClearDemoDataModal.tsx:35-37` |
| Preview | Two-column list, then a grey note | "Products: 12 to remove", "Orders: 3 to cancel", "Not Removed: …", "Installed: …, which removing its datapack takes"; the note starts "Never touched: what Demo Builder installed…" | `DI/ui/clearDemoDataWords.ts:116-135`; `DI/services/demoDataWipe/wipePlan.ts:108-111` |
| Footer | Close and a red button | "Clear 12 Items" (off, as "Clear", until there is something) | `ClearDemoDataModal.tsx:106`; `clearDemoDataWords.ts:141` |
| Run and end | Progress window | "Clearing Demo Data"; "Stores Cleared"; "Couldn't Clear the Stores" | `DI/ui/hooks/useClearDemoData.tsx:37-40` |
| Could not read | Small, red | "Couldn't Read the Stores" | `ClearDemoDataModal.tsx:40,100` |

### 1.15 A datapack's Admin step

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Flyout line | One line and a button | "1 step left in the Admin", "Show Step" | `PackSetupStepLine.tsx:25-27` |
| Dialog | The step as the setup guide draws it | Where, Set, Then; "Close", "Open Admin", "Check" | `DI/ui/components/PackSetupStepDialog.tsx:58-60` |
| Check got no answer | In the step's banner | "Demo Builder didn't get an answer in time. The check may still have finished; press Check to try again." | `DI/ui/hooks/usePackSetupStep.tsx:29` |
| Step done | The line goes | | `usePackSetupStep.tsx:98` |

### 1.16 Activity tab

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Open | Spinner | "Loading activity" | `DI/ui/views/DatapackActivityView.tsx:182` |
| Filter | A list and a count | "All Operations", "import", "export", "delete", "validate"; "50 of 212" | `DatapackActivityView.tsx:45,66-69,205` |
| Row | Two lines | The datapack's id, its raw version, "import" or "delete", "failed", "Demo Builder" or "Data Installer"; the Commerce instance id, "11 data types", the date, a detail | `DatapackActivityView.tsx:300-314` |
| More | A button | "Load 50 more" | `DatapackActivityView.tsx:269` |
| Empty | Empty state | "No Activity Yet"; "Neither Demo Builder nor the Data Installer has a run on this Commerce instance matching this filter." | `DatapackActivityView.tsx:254-255` |
| No project | Empty state | "No Project Open"; "Open a project to see the sample-data runs on its Commerce instance." | `DatapackActivityView.tsx:169-170` |

### 1.17 The wizard's Datapacks step

| Step | What the SC sees | Words | Where |
|---|---|---|---|
| Open | Spinner | "Loading datapacks", "This should only take a moment" | `features/project-creation/ui/steps/SampleDataStep.tsx:194-195` |
| Grid | Search, Show list, a None card, cards | "Filter datapacks"; "None", "Create this project without sample data." | `SampleDataStep.tsx:205-211,281-283` |
| The demo names a datapack | A note | "This demo asks for Luma (version X is no longer published; the default version is selected)." or "…which isn't published yet. Ask the demo's owner to export it." | `SampleDataStep.tsx:216-217` |
| Empty | A note | "No Datapacks Yet. You can add one after the project is created." | `SampleDataStep.tsx:247` |
| Cannot load | Error block | "Datapacks Aren't Available"; "You can create this project without a datapack." | `SampleDataStep.tsx:173-174` |
| At creation | A progress line | "Installing the datapack"; then "Installed Luma", or "Datapack could not be installed — reason", or "Installed Luma partially — some data types did not land. Retry from the dashboard." | `creationStages.ts:76`; `features/project-creation/handlers/executorSampleDataPhase.ts:91,122-130` |

### 1.18 What an agent's request says to the SC

The consent an SC reads when an agent asks to act (`features/ai/server/agentAlertCopy.ts`):

| The button says | The agent's consent says | Where |
|---|---|---|
| "Uninstall" | "Remove sample data"; "Deletes what this data pack put in the Commerce instance… This can't be undone." | `agentAlertCopy.ts:252-254` |
| "Import" | "Import sample data" | `agentAlertCopy.ts:435` |
| "Save Changes" | "Save the store's changes to a datapack" | `agentAlertCopy.ts:458` |
| "Delete Datapack" | "Delete a library datapack"; "Removes this pack and all its data from the datapack library." | `agentAlertCopy.ts:465-467` |
| "Load from File" | "Load a datapack file into a store"; "…the Data Installer catalogue other teams share." | `agentAlertCopy.ts:491-493` |
| "Uninstall Datapack" (delete project) | "Uninstall Datapack" | `features/ai/server/consentText.ts:38` |

What only one side can do:

| Job | Button | Agent tool |
|---|---|---|
| Make a team datapack | none | `mark_team_datapack` |
| Copy to the Data Installer | hidden | `copy_library_datapack_to_installer` |
| Build a datapack from a Commerce product export | none | `build_datapack_from_export` |
| Delete one saved version | none (2.8) | `delete_library_datapack` with a version (`DI/handlers/datapackLibraryHandlers.ts:208`) |
| Version History, Restore Version | yes | no tool of that name; `start_datapack_import` with the version does it |
| Fix with AI | yes | it is the agent |

## 2. Improvements, most valuable first

Each is marked **Rule** (it breaks something written down, quoted) or **Judgement** (it is friction
or inconsistency, with no rule to quote).

### 2.1 Rule: one action still has four words (small to medium)

The rule, `docs/systems/data-installer.md:114-117`: Uninstall is "the same word everywhere this
action appears".

The buttons and titles obey it. The sentences around them do not:

| Words on screen | Where | Should be |
|---|---|---|
| "The reset could not be started.", "The Data Installer rejected this reset request." (shown under "Couldn't Start the Uninstall") | `DI/handlers/importHandlers.ts:264-265` | "The uninstall could not be started." |
| "Select at least one data type to remove." | `importHandlers.ts:359` | "…to uninstall." |
| "Nothing was removed.", "Nothing was removed or installed.", "The removal could not be started." | `DI/handlers/importReplacement.ts:95-96,159` | The screen's own form already exists: "Nothing was uninstalled." (`importResult.ts:150`) |
| "Its datapack's data was not removed, so the project was kept" | `features/projects-dashboard/services/datapackDataRemoval.ts:56` | "Its datapack was not uninstalled, so the project was kept" |
| "…which removing its datapack takes" | `DI/ui/clearDemoDataWords.ts:135` | "Uninstalling its datapack removes these" (see 2.6) |
| "Remove sample data"; "this data pack" | `features/ai/server/agentAlertCopy.ts:252-254` | "Uninstall a datapack"; "this datapack" |
| "Remove Those Too", "Keep Them" for what the Datapacks screen calls Clear Demo Data | `features/eds/services/reset/edsResetOtherData.ts:150-151` | "Clear Demo Data Too", "Keep It" |
| Button "Delete Datapack", then "Removed." and "It could not be removed" | `DI/ui/components/RemoveFromLibraryButton.tsx:52-53,65` | "Deleted.", "It could not be deleted" |

Change: put the sentences beside the button words in `DI/uninstallWords.ts`, and read them from
there in each of these files. A test like `tests/sop/cited-identifiers.test.ts` could then ban
"removal" and "reset" in strings under `DI/handlers/`.

### 2.2 Rule: the Activity tab shows ids and wire words (medium)

Where: `DI/ui/views/DatapackActivityView.tsx:300-314`, `:66-69`, `:269`.

- It shows `entry.id.version` as it is. A saved version reads "20261109-141504". The rule,
  `docs/systems/data-installer.md:340-342`: "A save's version is never shown as its id: everywhere
  it appears it reads as when it was saved".
- It shows `entry.id.name`, the library id, not the name on the card. For an SC's own datapack that
  id is a slug with a random suffix (`data-installer.md:326-328`).
- The operation is the wire word, lower case: "import", "delete", "validate", "export". The screen's
  words are Import, Uninstall, Dry Run and Save. The filter list repeats them.
- "failed" is lower case. "Load 50 more" is a button and not Title Case (root `CLAUDE.md`, "Words on
  screen").
- It shows the Commerce instance id on every row. The whole view is already for one instance.
- The empty state says "sample-data runs". Nothing else on the screen says "sample data".

This matters more than it looks, because three results send the SC here: "See the Activity tab for
the result." (`importResult.ts:295,312`).

Change: name by display name; `versionLabel` for the version; map the four modes to the four screen
words in the row and the filter; drop the instance id and the raw scenario; "Load 50 More".

### 2.3 Rule: Load from File's titles and first sentence (small)

Where: `DI/ui/components/LoadDatapackFileModal.tsx`.

- The result's title is a whole sentence, sometimes with a comma: "Loaded 3 of 3 data types into the
  Data Installer, and its store settings into your datapacks" (`:188-189`). The rule,
  `docs/development/sop/dialog-design.md:133-135`: "The title names the KIND of thing and what
  happened to it, generically… A title is a statement, never the reason, and has no comma".
- The form's first line shows the id and the raw version: "My Luma (my-luma-x1, version
  20261109-141504) holds: …" (`:198`). Same rule as 2.2.
- The button is "Load from File" (`CatalogHeaderActions.tsx:85`); the dialog is "Load a Datapack
  File" (`:118`).

Change: title "Load from File"; first line "My Luma, saved Nov 9, 9:15 AM. Products, Categories.";
results "Datapack Loaded" with the body "Loaded My Luma into My Datapacks.", "Datapack Partly
Loaded" with the refused types under it, and "Couldn't Load Datapack".

### 2.4 Rule and a dead end: Load from File offers a destination the screen hides elsewhere (small)

Where: `LoadDatapackFileModal.tsx:205-214` always offers "Data Installer (Shared Catalog)".

`PackActions.tsx:50-54` hides Copy to the Data Installer because the Data Installer "does not let our
accounts write to it yet… so it would fail every time". Loading into it is the same write, and the
refusal text for it is already written (`DI/handlers/datapackZipHandlers.ts:101-102`). So this radio
leads to a failure by the code's own account. I did not run it.

It is also a question the system can answer itself. With the Data Installer hidden, the form has
nothing to ask but "Replace Existing Version".

Change: show the Destination choice only under the same switch as the copy button, and only when
the Data Installer is on. For most SCs the dialog becomes one sentence, one box and Load.

### 2.5 Rule: the Uninstall result has two buttons that close the window (small)

Where: `importModalView.ts:193-197` gives every result that is not a finished import a "Back".
`ImportDatapackModal.tsx:232-233` makes Back close the window when it was opened by Uninstall. The
dialog's own "Close" is beside it.

The rule, `dialog-design.md:129-130`: "Never two buttons that do the same thing."

Change: in a window opened by Uninstall, show Back only when it returns to the question
(`backToConfirm`). A clean "My Luma Uninstalled" then ends on Close alone, as a clean import does.

Same place, smaller: a clean uninstall shows "Took …" (`importResult.ts:265-266`), and a clean
import does not. Drop it there too.

### 2.6 Rule: Clear Demo Data ends on a 60-word grey footnote (small)

Where: `ClearDemoDataModal.tsx:83` draws `NEVER_TOUCHED` (`wipePlan.ts:108-111`) as a muted note
under the list: "Never touched: what Demo Builder installed (its removal takes that), Commerce's own
customer groups and attributes, the public catalog and the Default attribute set, stocks and
sources, websites, stores, store views and root categories, the default settings and other
websites' settings, admin users and the integration's credential. Orders are closed, never deleted."

The rules, `dialog-design.md:15-16` and `:141-142`: "Does it change what the SC knows or does next?"
and "A warning is a word in the main sentence… never a muted footnote under it." The list above it
already says what goes, and the lead already says orders are closed.

Change: delete the note from the dialog. Keep the constant for the agent's `check_demo_data` answer.

Same list, two wording slips: the "Installed" row builds its names by swapping underscores for
spaces ("b2b companies", "source items", `clearDemoDataWords.ts:134`) where every other screen uses
`dataTypeLabel`; and its tail is "which removing its datapack takes" (2.1).

### 2.7 Judgement: Restore Version asks for the import form in the middle (medium)

Today: More, Version History, pick, Restore Version, then the import form, then Import, then the
check, then perhaps the question, then the run. Six presses and two dialogs before anything starts.

The form has nothing left to decide there. The website and store view are locked to where the
datapack is installed, and every data type is ticked because a replace goes whole
(`DI/ui/hooks/useRemovalWindow.ts:44-46`; `ImportDatapackModal.tsx:127,252`). The SC already said
what they want when they pressed Restore Version.

Change: Restore Version opens the import window straight on "Checking for your changes", the way
Uninstall opens it straight on its check (`opensOn: 'remove'`). Add an `opensOn: 'restore'`.
Version History's sentence already says what happens. Dry Run stays reachable from Import.

### 2.8 Judgement, reversibility: one saved version cannot be deleted (medium)

Every Save Changes, and every "Save and Import", adds a version. Nothing on screen removes one.
"Delete Datapack" on a datapack of saves deletes all of them (`PackActions.tsx:144,186`), and
Version History offers only Restore (`VersionHistoryDialog.tsx:68-75`).

`docs/systems/data-installer.md:507-508` still says "Deleting a version takes your layer of the same
version with it, so the save is still undone in one step." That step is no longer on screen. The
handler exists and an agent can call it (`DI/handlers/datapackLibraryHandlers.ts:198-246`).

The root `CLAUDE.md` rule: "New capabilities ship with their reversal… A thing that cannot be undone
is a finding."

Change: "Delete Version" in Version History, on any version not in use, with the house confirm
("Delete Version?", "Permanently deletes the version from Nov 9, 9:15 AM."). Fix the doc line either
way.

### 2.9 Rule: "the store" in sentences an SC reads (small)

The rule, `dialog-design.md:49-50`: the stage table's words, "Reading from Commerce", never "Reading
the store". The owner's rule is "Commerce", never "the store".

| Words | Where |
|---|---|
| "The store changes could not be saved." | `DI/handlers/packSave.ts:128` |
| "The store's products could not be listed.", "The store's items could not be counted.", "The store could not be checked against the pack." | `DI/handlers/storeChangesHandlers.ts:214,231,317` |
| "The store could not be read." | `DI/handlers/removalChanges.ts:80` |
| "This demo's store, …, also holds…", "…to leave this demo's store empty?" | `features/eds/services/reset/edsResetOtherData.ts:159-160` |

Clear Demo Data's "Stores" is not in this list. Those are real Commerce stores the SC ticks.

Change: "Your changes could not be saved.", "Commerce's products could not be listed.", "Commerce
could not be read."

### 2.10 Judgement: the SC's own datapacks have five names (small to medium)

| Name | Where |
|---|---|
| "My Datapacks" | Show list, `catalogShow.ts:44` |
| "Mine" | Card tag, `DatapackCard.tsx:296` |
| "Your Datapacks (Private Until Shared)" | Load form, `LoadDatapackFileModal.tsx:211` |
| "your datapacks" | Save's stage and Load's result, `core/utils/datapackStages.ts:18`; `LoadDatapackFileModal.tsx:189` |
| "the library" | Delete's wait, `waitStages.ts:122` |
| "Datapack Library" | The sidebar's screen, `DataInstallerScreen.tsx:80` |
| "the datapack library" | Every agent consent, `agentAlertCopy.ts:444-493` |

The approved mockup's save line is "Saving to the library"
(`.rptc/research/replace-flow-steps/mockup-v2.html:85`). The code says "Saving to your datapacks".
One of the two is out of date.

Recommendation: "My Datapacks" for the SC's own, in every sentence ("Saving to My Datapacks",
"Loaded into My Datapacks"). "Datapack Library" only for the screen that shows everyone's.

### 2.11 Judgement: Uninstall runs on a spinner, Import on steps (medium)

An uninstall of Luma took about three minutes (`.rptc/research/replace-flow-steps/research.md:123`).
It shows one spinner and one count line for that time (`ImportDatapackModalBody.tsx:200-203,
269-293`). The same removal inside an import is a named step with the same count
(`importSteps.ts:82-110`).

Change: draw Uninstall with the import's own rows: "Save Your Changes" when a save runs, then
"Uninstall My Luma". The steps and their words exist. The window then matches the one the SC saw
when the datapack went in, and a failed save shows red on its step as it does for an import.

### 2.12 Rule that contradicts itself: three ways to word a title (small, needs the owner's word)

`dialog-design.md:133-134` says a title is generic: "Datapack Removed". `dialog-design.md:76` gives
"My Luma Imported" as the approved clean ending (2026-11-10, newer).

The flows split along that line:

| Flow | While it runs | Done | Failed |
|---|---|---|---|
| Import | "Import My Luma" | "My Luma Imported" | "Import Stopped", "Couldn't Start the Import" |
| Uninstall | "Uninstall My Luma" | "My Luma Uninstalled" | "Couldn't Uninstall My Luma" |
| Save | "Saving My Luma" | "Datapack Saved" | "Couldn't Save My Luma" |
| Create | "Creating Acme" | "Datapack Created" | "Couldn't Create Acme" |
| Clear | "Clearing Demo Data" | "Stores Cleared" | "Couldn't Clear the Stores" |
| Load | "Load a Datapack File" | a sentence (2.3) | "The file was not loaded" |

Sources: `importModalView.ts:345-352`; `importResult.ts:241,304`; `useSaveStoreChanges.tsx:93-95`;
`useClearDemoData.tsx:37-40`.

Recommendation: make the newer form the rule and amend line 133. Verb then name while it runs
("Save My Luma"), name then outcome when done ("My Luma Saved"), "Couldn't" then verb then name when
it fails. That changes four strings in `useSaveStoreChanges.tsx` and one line of the SOP. Also
"Could Not Reach the Data Installer" (`dataInstallerFailure.tsx:127`) becomes "Couldn't Reach…".

### 2.13 Rule: the wizard's Datapacks step (small)

Where: `features/project-creation/ui/steps/SampleDataStep.tsx`.

- `:216` shows a raw version in a sentence: "(version X is no longer published; the default version
  is selected)". Same rule as 2.2.
- `:217` says "Ask the demo's owner to export it." No datapack button says Export. The action is
  Share.
- `:247` has Title Case inside a sentence: "No Datapacks Yet. You can add one…". The rule
  (`dialog-design.md:111-113`): a sentence "keeps normal capitals".
- `:283` says "without sample data"; `:174` says "without a datapack".
- `:195` "This should only take a moment" tells the SC nothing.

Change: "This demo asks for Luma. That version is gone, so the default is selected."; "…which isn't
shared yet. Ask the demo's owner to share it."; "No datapacks yet. You can add one after the
project is created."; "Create this project without a datapack."; cut the helper line.

### 2.14 Judgement: Dry Run has three names for its answer (small)

"Dry Run Passed", "Validation Failed" and "Dry Run Failed" (`importResult.ts:255-259`), after a wait
called "Checking the import" (`waitStages.ts:45`). "Validation" appears nowhere else on screen.

Change: "Dry Run Passed", "Dry Run Found a Problem" (amber), "Couldn't Run the Dry Run" (red). After
a pass, put "Import" beside "Back": it is the obvious next press and today it takes two.

### 2.15 Judgement: the same button deletes with a question in one place and without in another (small)

"Delete Datapack" in the flyout asks first (`PackActions.tsx:143-151`). "Delete Datapack" in the
Load result deletes at once (`LoadDatapackFileModal.tsx:139`; `RemoveFromLibraryButton.tsx:65-76`).
The second is an undo of what was just loaded, which is a fair reason not to ask, but the label
hides that.

Change: label the result's button "Undo Load". Same for its "Delete Store Settings".

### 2.16 Judgement: words in the flyout an SC would not use (small)

- "Declared, Not Stored" (`DatapackDetailPanel.tsx:277`). It means the datapack lists a data type it
  holds no rows for. "Empty Data Types" says that.
- "Also Sets" over raw paths such as "catalog/frontend/grid_per_page: 24" (`:288-293`). "Store
  Settings" as the label matches "Delete Store Settings" in the menu beside it.
- "Visible To: Everyone (community)" for a Data Installer datapack (`:313-315`), which the Show list
  files under "Data Installer Datapacks", not Community (`catalogShow.ts:16-18`).
- "Data" here and on the import form (`ImportForm.tsx:218`), "data types" in every count. The SOP's
  own label example is "Data Types" (`dialog-design.md:112`).

### 2.17 Judgement: two different screens behind the word "Datapacks" (small)

The sidebar's "Datapacks" opens "Datapack Library" (`UtilityBar.tsx:63-67`). The dashboard's
"Datapacks" opens "Datapacks", with Import and Uninstall. An SC who learns one will look for Import
on the other and not find it.

Change: label the sidebar button "Datapack Library", as its screen and its own aria-label already
say. Also, the Library's flyout cannot show a datapack's versions at all (`PackActions.tsx:266`);
Version History could open there read-only.

### 2.18 Judgement, reversibility: "Always Save Without Asking" has no way back on screen (small)

The box (`RemovalConfirmBody.tsx:76`) sets `demoBuilder.dataInstaller.changesOnRemoval`. After that
an import over the demo's datapack never asks again (`DI/ui/hooks/useReplacement.ts:72-74,117`), and
an uninstall shows only "Your changes will be saved to My Luma first." The one way back is VS Code's
settings.

Change: on that line, a quiet "Ask Me Next Time" that clears the setting.

### 2.19 Rule: project reset and delete ask the same thing in two voices (small)

| One project | Several projects |
|---|---|
| "Are you sure you want to reset "X"? This will reset all code to the template state and re-copy demo content." (`edsResetUI.ts:140`) | "Each project returns to how it was set up. Code changes are lost." (`BatchResetQuestions.tsx:50`) |
| "Are you sure you want to delete "X"?" with "This will remove all project files and configuration. This action cannot be undone." (`deletionConfirmation.ts:46-49`) | "Delete X?" with "Project files are removed from this machine." (`deletionConfirmation.ts:111`; `deleteWords.ts:15`) |

The rule, `dialog-design.md:141-142`: a warning is a word in the sentence, not a line after it. And
`dialog-design.md:24`: do not ask the title again in the body.

Change: the single dialogs take the batch's words. "Reset X?", "It returns to how it was set up.
Code changes are lost." "Delete X?", "Permanently removes its files from this machine."

A single reset can also put three VS Code dialogs in a row (reset, "Uninstall My Luma Too?",
"Remove Those Too"). Reset Selected asks the first two in one table. The single reset could ask them
in its progress window the same way, as the single delete already does with its boxes.

### 2.20 Smaller things

| What | Where | Change |
|---|---|---|
| "pack" on screen, where every label says "datapack" | `waitStages.ts:114` "Every data type in the pack"; `DI/handlers/privatePackPrompt.ts:28` "this pack's data" | "datapack" |
| "(in use)" in Version History; the doc says "In Use" | `VersionHistoryDialog.tsx:84`; `data-installer.md:346` | Pick one. "In Use" as a grey badge matches the card's tags |
| "Choose another view" when the control is labelled "Show" | `DatapackCatalogGrid.tsx:75`; `SampleDataStep.tsx:244` | "Choose another Show option", or name one: "Try All Datapacks" |
| The empty state says "save one from your demo's Commerce instance" in the Library, which has no such button | `DatapackCatalogGrid.tsx:76` | In the Library: "Load a datapack file." |
| The wait says "Making it private"; the button said "Stop Sharing" | `waitStages.ts:118` | "Stopping sharing" is awkward; "Making it private" is fine if the confirm's body says "Only you will see it." |
| "It could not be changed: …" after Share fails | `useLibrarySharing.tsx:42` | "It could not be shared: …" and "Sharing could not be stopped: …" |
| "Couldn't be read" on a kind card, "Couldn't load products: …" in its list | `StorePicksStage.tsx:33`; `StoreKindItems.tsx:46` | One verb: read |
| "catalogue" in consents, "catalog" everywhere else | `agentAlertCopy.ts:444,493` | "catalog" |
| "Taking products off sites", "Resetting site settings": "sites" where Commerce and the dialog say "websites" | `core/utils/datapackStages.ts:60,71,108` | "Taking rules off websites" is exactly the 25-character limit; the other two run over it, so they need new words, not a swap |
| No Commerce: the result says where to go and offers only Close | `ImportDatapackModalBody.tsx:40` | A "Configure" button that opens it |
| After Load, the next step is Import, and the result offers only Close | `LoadDatapackFileModal.tsx:123-128` | Close, then open the new datapack's flyout |
| A long dash in creation's lines | `executorSampleDataPhase.ts:91,122-130` | A colon, as every other failure line here uses |
| The doc quotes sentences the code no longer says | `data-installer.md:130-132` ("This demo uses Luma. Importing replaces its data with My Luma's."), `:526-530` ("Library" tag, "Remove from library", "Stop sharing") | Update from `replaceWords.ts:35-40` and `PackActions.tsx:94-112` |

### 2.21 To confirm by a test before acting

`removalConfirm.ts:43` adds "Selected data types apply to Import only." when the install record
holds a kind that is not ticked. A window opened by Uninstall has no ticks to see, and ticks every
type the datapack holds (`useRemovalWindow.ts:44-46`). If the record holds a kind the datapack's
own list does not (store settings from a settings layer would be one), that sentence would show in a
window with nothing selected. I read this from the code and did not reproduce it.

## 3. What is good and should stay

- **The check comes before the question, and the question only comes when something changed.** No
  "are you sure" for an import that loses nothing (`useReplacement.ts:72-74`).
- **One confirm for uninstall and replace.** `useReplacement` reuses `useRemovalConfirm`, so the two
  cannot ask differently. The button that loses changes stands apart at the footer's start.
- **Words in one module per job**: `uninstallWords.ts`, `replaceWords.ts`, `saveWords.ts`,
  `shareWording.ts`, `WAIT_STAGES`. 2.1 is the places that have not moved into them yet.
- **Steps named for what they do, in order, only those that apply**, with the working data type's
  second line. A clean finish becomes the small result; a problem stays on its step.
- **A save is shown by its date** (`versionLabel`) in the card, the flyout, the steps and Version
  History. 2.2, 2.3 and 2.13 are the three places left.
- **Uninstall sits on the version in use only, and Save Changes too.** Nothing is offered where it
  could not work.
- **A project delete never deletes a datapack, leaves the data unless ticked, and stops if the data
  does not all come out.** Esc on the reset's question means Keep Datapack.
- **The catalog loads once and Show filters it.** No wait on a filter.
- **Retry twice, then Fix with AI.** A stop always has a next press.
- **The reads are reused** between the check, the save and the uninstall, so the SC waits once.
- **A menu action's wait takes over the flyout** and says what it is doing, since the menu that
  started it has closed.

## 4. What I could not check

I read the code. I did not see a rendered webview, run a test, or touch Commerce. These need a
screenshot or a live walk:

| Question | What to look at |
|---|---|
| Does the import window keep one height and width from the check to the end? | The six frames of `mockup-v2.html` against the real window, with a datapack of more than six data types and one of fewer |
| Do "Import Without Saving", "Cancel" and "Save As New and Import" fit on one line at medium width? | The question on a team datapack with six or fewer data types (`importModalView.ts:320-321`) |
| Does the flyout hold still when a menu action's wait starts and ends? | Share, then Stop Sharing, on the SC's own datapack |
| How do "Declared, Not Stored" and a long "Also Sets" list look in the flyout's narrow column? | A datapack with a settings layer of ten or more paths |
| How long is Clear Demo Data's grey note on screen? | The dialog with one store ticked |
| Does the Activity row wrap, and how does a saved version read there? | A project with one Save and one Import |
| Does loading a file into the Data Installer fail for an ordinary account? | 2.4 rests on the code's own comment, not on a run |
| Does "Selected data types apply to Import only." show in an Uninstall window? | 2.21 |
| The three VS Code dialogs of a single reset, in order | Reset a project whose Commerce holds more than its datapack |
| Reset Selected and Delete Selected's second step with a long project list | I read its words, not its layout |
| Whether `tests/sop/ui-label-case.test.ts` sees a label built from a constant ("Load 50 more") | Run the suite after changing it |

Not read in full: the batch delete's table (`BatchDeleteQuestions.tsx`), the ACO export screens
(held back, unreachable), `OperationProgressModal`'s row drawing for a save, and the Admin step
dialog's banner states.

## Flow review fixes 2026-11-10

The owner approved 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.9, 2.10 and 2.12. All nine are fixed.

| Item | What changed | Main files |
|---|---|---|
| 2.1 | Taking a datapack's data out says uninstall in errors, waits, results, engine notes, the agent's consent ("Uninstall a datapack") and the `reset_datapack` description. Delete Datapack's undo says "Deleted." and "It could not be deleted". Reset's third question says "Clear Demo Data Too" and "Keep It". The sentences were edited in place, not moved into `uninstallWords.ts` | `DI/handlers/importHandlers.ts`, `importReplacement.ts`, `removalChanges.ts`; `features/projects-dashboard/services/datapackDataRemoval.ts`; `features/eds/services/reset/edsResetSampleData.ts`, `edsResetOtherData.ts`; `DI/ui/clearDemoDataWords.ts`; `DI/ui/components/RemoveFromLibraryButton.tsx`; `features/ai/server/agentAlertCopy.ts`, `dataInstallerDescriptors.ts` |
| 2.2 | The Activity tab shows the display name (a new `displayName` on each row, from the names Demo Builder remembers), a save by its date, the operation as Import, Uninstall, Save or Dry Run, and "Failed" and "Load 50 More". The instance id and the raw scenario are gone | `DI/ui/views/DatapackActivityView.tsx`, `DI/handlers/engineHistoryReads.ts`, `DI/types.ts` |
| 2.3 | Load from File: dialog title "Load from File"; first line "My Luma, saved Nov 9, 9:15 AM. It holds Products, Categories."; results "My Luma Loaded", "My Luma Partly Loaded", "Couldn't Load My Luma", "Couldn't Open the File" | `DI/ui/components/LoadDatapackFileModal.tsx` |
| 2.4 | The Data Installer is offered as a destination only under `INSTALLER_WRITES_SHOWN`, the same switch that hides Copy to the Data Installer (now one constant). The agent tool `load_datapack_zip` still takes `target: installer`, as `copy_library_datapack_to_installer` still does. Same reason applies there; left for the owner | `DI/installerWrites.ts`, `PackActions.tsx`, `LoadDatapackFileModal.tsx` |
| 2.5 | A window opened by Uninstall ends on Close alone. Back stays only where it returns to the question | `DI/ui/components/importModalView.ts`, `ImportDatapackModal.tsx` |
| 2.6 | Clear Demo Data draws no "Never touched" note. The text stays in `check_demo_data`'s answer | `DI/ui/components/ClearDemoDataModal.tsx` |
| 2.9 | "The store" became "Commerce" in handler errors, engine skip reasons and the reset's Clear question. A named Commerce store ("the store justrite_store") is unchanged | `DI/handlers/*`, `DI/services/demoBuilderEngine/*`, `DI/services/demoDataWipe/*`, `edsResetOtherData.ts` |
| 2.10 | "My Datapacks" in the save's stage, the delete's wait, Load from File, notes and errors, and the agent consents. The card tag stays "Mine": it is a tag beside "Team" and "Community", not a sentence. `mockup-v2.html` now says "Saving to My Datapacks" | `core/utils/datapackStages.ts`, `core/utils/waitStages.ts`, `DI/handlers/datapackLibraryHandlers.ts`, `agentAlertCopy.ts` |
| 2.12 | `dialog-design.md`, and the handbook's window-header convention, now say a result names the thing. Results are "My Luma Saved", "Acme Created", "Couldn't Uninstall My Luma" and "Couldn't Import My Luma". Clear Demo Data says "Demo Data Cleared" and "Couldn't Clear Demo Data", since a list of store codes would put a comma in the title. Delete Datapack has no result dialog to rename | `docs/development/sop/dialog-design.md`, `docs/development/handbook.md`, `DI/ui/hooks/useSaveStoreChanges.tsx`, `useClearDemoData.tsx`, `DI/ui/components/importResult.ts` |
