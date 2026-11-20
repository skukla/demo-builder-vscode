# Datapack versions, and wording that reads poorly

Research on branch `fix/release-walk-fixes` with its uncommitted changes, 2026-11-10. Read from the
code and docs only. Nothing was run against Commerce or the datapack store, and no screen was seen.

Another agent was editing datapack wording in the same checkout while this was written. Every
string in Part B is quoted as it stood when read. Find it by its text, not by a line number.

Paths are under `src/`. `DI/` stands for `src/features/data-installer/`.

## Part A: simpler version management

### A.1 How it works today

| What | How | Where |
|---|---|---|
| A save's version | A new id every save, the UTC time: `20261109-141504` | `savedVersion`, `DI/services/demoPack.ts` |
| What a save writes | A whole new copy of the datapack. Nothing is written over | `saveToPack`, `DI/handlers/packSave.ts` ("No `update`") |
| What the project names | `project.datapack`: name, version, store, and `origin` (the datapack it was first made from). Every save moves it to the new version | `recordSave`, `demoPack.ts` |
| The install record | One file per datapack and version in the project. A save moves it onto the new version | `saveStoreChanges`, `DI/services/demoBuilderEngine/saveStore.ts` |
| Nothing changed | No version is written; the result is "No Changes to Save" | `saveUnchanged.ts` |
| On screen | The card shows one save by its date. More, Version History lists the rest. Restore Version opens the import of the one chosen | `packVersions.ts`, `ui/versionHistory.ts`, `VersionHistoryDialog.tsx`, `PackActions.tsx` |
| Restore | It is an import of another version over the demo's: check for changes, perhaps a question, uninstall, install. Minutes on Luma | `DI/handlers/importReplacement.ts` |
| Delete | Delete Datapack deletes every version. Nothing on screen deletes one | `PackActions.tsx`, `deleteEveryVersion` in `datapackLibraryHandlers.ts` |
| Agents | `save_store_changes_to_pack` adds a version. `delete_library_datapack` deletes one version, or all with `everyVersion`. `start_datapack_import` with a version is the restore | `features/ai/server/dataInstallerDescriptors.ts` |
| Team datapacks | Never saved into, even by their owner. Their named versions (`main`) are changed in place, and the card's amber dot says so | `saveIntoFor`, `projectPackNewer.ts` |
| Save as File | Saves the version on show, with its store settings | `SaveDatapackFileButton.tsx` |

**Saves happen without the SC pressing Save.** Uninstall, an import over the demo's datapack, a
project reset and a project delete all save the SC's Commerce changes first. With "Always Save
Without Asking" on, they do it without a question (`DI/handlers/removalChanges.ts`, setting
`demoBuilder.dataInstaller.changesOnRemoval`). So an SC who resets a demo twice a week gets a
new version each time something changed, without choosing it. That is where the list grows.

**No released build has any of this.** The newest tag is `v1.0.0-beta.152`. It has no
`DI/services/demoPack.ts`, and the commit that introduced dated saves is not in it (checked with
`git merge-base --is-ancestor`, with beta.151 as the control). Version History itself is not
committed yet. So saved versions exist only where a development build ran.

### A.2 What an SC needs from versions

| Need | What the code and docs show | Fact or guess |
|---|---|---|
| Undo a bad save | This is the stated reason for keeping versions: `VersionHistoryDialog.tsx` ("so a bad save can be undone"), `saveStore.ts` ("a save is undone by deleting the new version"), the agent tool's text and the generated `import-datapack` skill | The intent is a fact. That SCs do it is a guess: no SC has had the feature |
| Not lose Admin changes at a reset or uninstall | Built and automatic (above) | Fact. How fast versions pile up is a guess |
| Go back to the datapack the demo started from | `origin` is carried from save to save. Importing that datapack over the demo's does it. A reset returns to the newest save, not the first | Fact. How often it is wanted is a guess |
| Keep a variant | Save As New Datapack, and Save As New beside Save. Saves are not variants (`packVersions.ts`) | Fact |
| Keep a demo on an older version on purpose | The plan says so for a team datapack's named versions (`.rptc/plans/datapack-save-as/overview.md`). For saves it only matters when two projects use one of the SC's datapacks | The plan is a fact. Two demos on one saved datapack is a guess |
| Pick the right one from a list of dates | Nothing helps: a version is a date with no note, so two saves an hour apart cannot be told apart | Fact |

Three things in today's model do not work as written. All three are read from the code, not run.

1. **The documented undo is not on screen, and it strands the project.** The docs and the agent
   tool say a save is undone by deleting the new version. No button does that. When an agent does
   it to the version in use, nothing updates `project.datapack` or the install record
   (`delete-library-datapack` touches neither). The next Save Changes then stops, because it
   cannot read the version the project names (`readInstalled` in `saveStore.ts`).
2. **A save of a shared datapack is private.** `createDatapack` always sends `shared: false`
   (`DI/services/datapackStoreWriter.ts`), and the save path never sets it again. A colleague
   keeps seeing the older shared version.
3. **A project file names one exact version.** A later save never reaches the colleague who
   creates from that file. If the version is deleted, creation falls back to the origin datapack,
   not to the same datapack's newer save (`fallbackFor` in `DI/services/recordedPack.ts`).

### A.3 Three simpler models

#### Model 1: two saves, the one in use and one other

| | |
|---|---|
| The SC sees | The card as now: "Saved Nov 9, 1:56 PM". In More, **Restore Version** replaces Version History. It opens the import window straight on its check, and the form's sentence names the date ("Replaces this demo's data with the version from Nov 9, 9:15 AM."). No list, no radio buttons, nothing to delete |
| How | A save works as today. After it succeeds, older saves of that datapack are deleted, with their store settings. Kept: the save the project uses, the newest other save, and any save another project on this machine names. Named versions are never touched |
| Reversible | One step back, always. Longer than that is Save As New Datapack or Save as File, which exist |
| Existing projects | None to migrate. Ids, records and the engine do not change. A datapack with more than two saves is trimmed at its next save |
| Must be built with it | New saves take the datapack's shared flag (defect 2). A project that names a save now gone uses the same datapack's newest save (defect 3). Without these two, trimming would take a shared datapack away from colleagues |
| Agents | Same tools. `save_store_changes_to_pack` says only the last two saves are kept, and that undo is `start_datapack_import` with the other version. The generated `import-datapack` skill says the same, so `AI_CONTEXT_VERSION` goes up |
| Size | Small to medium. One trim function and its tests, one menu row, `VersionHistoryDialog.tsx` deleted, about six strings, two docs, two agent texts |

Its weak point: the kept save can be one the SC did not choose. Two resets in a row, each saving
changes, push out the last save the SC made by hand.

#### Model 2: one save, replaced each time

This covers both "replace in place" and "versions only as named datapacks". They are the same
storage, and Save As New Datapack already exists as the way to keep a copy.

| | |
|---|---|
| The SC sees | No versions anywhere. Save Changes updates the datapack. To keep an older state, Save As New Datapack or Save as File first |
| Reversible | A save cannot be undone. That includes the saves a reset or uninstall makes without asking, so one unnoticed reset can overwrite a good datapack for good. Under the "whatever can be done can be undone" rule this is a finding that has to be accepted in writing |
| How | Two ways, neither simple. Writing over the same version is not safe: the store takes one data type per request, has no call to delete one data type, and a failure part-way damages the only copy. Writing a new version and deleting the old one is safe, and is Model 1 with one save kept |
| Existing projects | With a fixed version id, every project and install record that names a dated version must be rewritten, and a colleague's cannot be reached. With "new version, delete old", nothing to migrate, but defects 2 and 3 must be fixed as in Model 1 |
| Agents | `save_store_changes_to_pack` replaces. `delete_library_datapack` by version stops meaning anything for a saved datapack |
| Size | The safe form is the same build as Model 1, less one menu row. The in-place form is larger and riskier |

#### Model 3: every save is a new named datapack

| | |
|---|---|
| The SC sees | No Save Changes into a datapack. Every save asks for a name and makes a new card. Old ones go with Delete Datapack, which is on screen |
| Reversible | Fully. Nothing is ever written over |
| Existing projects | Nothing breaks. Datapacks that already hold several saves still need showing as one |
| What it costs the SC | A name at every save, including every reset and uninstall with changes. A library that fills with cards. The project hops from datapack to datapack. This is more to maintain, not less |
| Agents | `saveAs` is needed every time |
| Size | Small in code. It is how a team datapack behaves today |

A fourth variant, keep the last five in today's Version History, is Model 1 with a bigger number.
It keeps the list of dates the SC cannot tell apart.

### A.4 Recommendation

**Model 1.** Keep the save in use and one other, trim the rest after each successful save, and
replace Version History with one menu row, Restore Version.

Why:

- It removes everything the SC maintains. There is no list, no date to choose and nothing to
  delete, and the storage stops growing.
- It keeps the one undo the versions were built for. Model 2 gives that up exactly where it is
  needed most, the saves made without asking.
- It is the smallest build. Storage, ids, install records and the engine stay as they are. Model 2
  done safely is the same code.
- Nothing shipped has to be migrated, because no release has saves.

Decisions the owner still has to make:

| Question | Recommendation |
|---|---|
| May a save made without asking (reset, uninstall, import) push out the last save the SC made by hand? | Yes for now. It is the simple rule. The alternative is to mark each save as asked-for or not and never trim the newest asked-for one, which is a third kept save and more code |
| The menu row's words | "Restore Version". The other save can be newer than the one in use (the SC's changes, saved before a restore), so "Previous" would sometimes be wrong |
| What the clean import result says after a save | "Your changes were saved to My Luma." in place of "Your changes are saved in Version History." |
| Delete Datapack's sentence | "Permanently deletes it." The words "and its version history" go |

## Part B: wording that reads poorly

The owner's rejected examples give six patterns. Each find below names the one it matches.

| Pattern | Rejected example |
|---|---|
| **Fragment**: a second line that is half a sentence, or a clause standing in for a noun ("what X has") | "Since this demo's last save", "Checking what Commerce already has" |
| **Inside view**: it describes how the software works, not what the SC is waiting for | "Each data type in My Luma" |
| **Unasked**: it explains or reassures about something nobody asked | "No version is deleted." |
| **The store**: "the store" where the rule is "Commerce" | "Checking the store" |
| **Vague or wrong name** | "Current Data", "Restore A Save", "Remove Data" |
| **Code on screen**: an id, a raw version, a setting key, or "pack" for "datapack" | "20261109-141504" |

No middle dot was found in any datapack string (searched for the character and its escapes; the
search found the wait's own expectation-and-clock line in `core/utils/stageLine.ts` as its control).

### B.1 Waits in `core/utils/waitStages.ts`

A wait may have no second line. Most of these second lines should go.

| Key | Now | Why | Replacement |
|---|---|---|---|
| `checkingForChanges` | "Checking for your changes" over "Since this demo's last save" | Fragment (the owner's own example) | Delete the second line |
| `FROM_COMMERCE` (`readingWebsites`, `readingProducts`, `readingKind`) | "From this demo's Commerce instance" | Long for what it says | "From Commerce" |
| `checkingImport` | "Checking the import" over "Nothing is written" | Unasked. Also a third name for Dry Run | "Running the dry run", no second line |
| `readingWhatToSelect` | "Reading from Commerce" over "What there is to select" | Fragment | Delete the second line |
| `readingErpCatalog` | "Reading from Commerce" over "The catalog the ERP will hold" | Fragment | "Reading the catalog" over "From Commerce" |
| `readingDemoData` | "Reading demo data" over "Each data type, in Commerce" | Inside view (the owner's own example, nearly word for word) | "From Commerce" |
| `readingProjectsDemoData` | "Reading demo data" over "Each selected project's Commerce" | Inside view | "From each selected project" |
| `readingProjects` | "Reading projects" over "What each selected project holds" | Fragment | Delete the second line |
| `readingErpStatus` | "Reading the ERP status" over "From the ERP" | Repeats the first line | Delete the second line |
| `checkingDemoSetup` | "Checking the demo setup" over "What this integration needs" | Fragment | Delete the second line |
| `readingAdobeServices` | Third line "First load: a few minutes" | Two phrases joined by a colon | "Usually a few minutes" |
| `readingDemo` | "Reading the demo" over "Its package and storefront" | Fragment | Delete the second line |
| `checkingSharedDemo` | "Checking the shared demo" over "Its package and datapack" | Fragment | Delete the second line |
| `readingPack` | "Reading the datapack" over "Its versions and data types" | Fragment, inside view | Delete the second line |
| `savingPackFile` | "Saving to a file" over "Every data type in the pack" | Inside view, "pack" | Delete the second line |
| `deletingPack` | "Deleting the datapack" over "From the library" | "the library" is not what the SC's own list is called | Delete the second line |
| `deletingPackSettings` | "Deleting store settings" over "Saved with this datapack" | Fragment | Delete the second line |

Fine as they are: `readingCatalogViews`, `checkingAiSetup`, `sharingPack`, `makingPackPrivate`.

`docs/development/sop/dialog-design.md` gives "Each data type, in Commerce" as the model second
line, and says a wait states "on what". Both need changing with the table above.

### B.2 Stages in `core/utils/datapackStages.ts` and `creationStages.ts`

| Key | Now | Why | Replacement |
|---|---|---|---|
| `readingStoreChanges` | "Reading from Commerce" over "From this demo's Commerce instance" | Repeats the first line | Delete the second line |
| `savingToLibrary` | "Saving to your datapacks" over "Your data" | Says nothing. Other screens now say "My Datapacks" | "Saving to My Datapacks", no second line |
| `verifyingDemoData` | "Verifying demo data" over "Each data type, in Commerce" | Inside view | "In Commerce" |
| `closingErpOrders` | "Closing orders in the ERP" over "Through the ERP integration" | Inside view | Delete the second line |
| `closingReturns` | Second line "Returns placed in the chosen stores" | Repeats the first line | "In the selected stores" |
| `closingOrders` | Second line "Canceled, or refunded, then noted" | Inside view | Delete it |
| `removingCustomers` | Second line "Accounts the chosen stores own" | Fragment | "From the selected stores" |
| `removingProducts` | Second line "Products the chosen stores own" | Repeats the first line | "From the selected stores" |
| `takingProductsOff` | "Taking products off sites" over "Products other websites also sell" | "sites" for websites; fragment | "Unassigning products" over "From the selected websites" |
| `takingRulesOff` | "Taking rules off sites" over "Rules other websites also use" | Same | "Unassigning cart rules" over "From the selected websites" |
| `removingCompanies` | Second line "The customers in them go next" | Unasked | "With their customers" |
| `removingCatalogs` | Second line "Each with its customer group" | Fragment | "With their customer groups" |
| `removingCustomerGroups` | Second line "Groups no catalog uses" | Fragment | Delete it |
| `removingCategories` | Second line "Deepest first, roots kept" | Inside view | Delete it |
| `removingAttributeSets` | Second line "Sets nothing else uses" | Fragment | Delete it |
| `removingAttributes` | Second line "Attributes nothing else uses" | Fragment | Delete it |
| `resettingSettings` | "Resetting site settings" over "The website's, back to the default" | "site"; fragment | "Resetting settings" over "For the selected websites" |
| `refreshingErp` | Second line "Filled again from Commerce" | Fragment | "From Commerce" |
| `installingDatapack`, `removingDatapack` (`creationStages.ts`) | Third line "Minutes; varies by pack" | Two phrases joined by a semicolon; "pack" | "Usually a few minutes" |
| Same two | Second lines "Into your Commerce instance", "From your Commerce instance" | Long | "Into Commerce", "From Commerce" |

### B.3 An import's and a save's step lines

| File | Now | Why | Replacement |
|---|---|---|---|
| `DI/importSteps.ts` | "Recording what went in" | Fragment | "Finishing the import" |
| `DI/importSteps.ts` | "Checked 2,048 products against the datapack: all match" | Long; a colon join | "2,048 products match the datapack" |
| `DI/importSteps.ts` | "Checked 2,048 products against the datapack: 12 differ" | Same | "12 of 2,048 products differ from the datapack" |
| `DI/types.ts` (`ENGINE_PHASES.checking`, shown as Verify's line) | "Checking the products against the datapack" | Long | "Checking products" |
| `DI/services/demoBuilderEngine/saveStore.ts` | "Finding what this demo uses" | Fragment, inside view | "Reading this demo's data" |
| `saveStore.ts` | "Updating this demo's record" | Inside view | "Finishing the save" |
| `saveStore.ts` | "Reading what was selected" | Fragment | "Reading your selection" |
| `saveStore.ts` | "Saving to your datapacks" | Name | "Saving to My Datapacks" |
| `DI/services/demoBuilderEngine/installNote.ts` | "This datapack doesn't include product images. Products show the images that are in AEM Assets." | Not shown to the SC today (the record and agents only). No change | |
| `installNote.ts` | "Commerce refused 12." | Reads as cut short | "Commerce refused 12 rows." |

### B.4 Titles, bodies and buttons in `DI/ui/`

| File | Now | Why | Replacement |
|---|---|---|---|
| `components/VersionHistoryDialog.tsx` | "This demo's data goes back to the version you choose." | Awkward; the dialog goes under A.4 | Delete with the dialog. If it stays: "Replaces this demo's data with the version you choose." |
| `components/VersionHistoryDialog.tsx` | "(in use)" | Lower case for what names a state; the doc says "In Use" | "In Use" |
| `components/importResult.ts` | "Your changes are saved in Version History." | Names a place the SC then has to go and find | "Your changes were saved to My Luma." |
| `components/importResult.ts` | "Nothing was written." under "Dry Run Passed" | Unasked | Delete it. The title is the result |
| `components/importResult.ts` | "Validation Failed" | A second name for Dry Run | "Dry Run Found a Problem" |
| `components/importResult.ts` | "Running it again skips existing items." | Unasked | Delete it |
| `components/importResult.ts` | "It is still running. See the Activity tab for the result." and "The import continues in the background. See the Activity tab for the result." | Two wordings of one thing | "Still running. The result will be on the Activity tab." for both |
| `components/importResult.ts` | "Action Required to Uninstall My Luma" | Stiff | "One Step Left to Uninstall My Luma" |
| `components/RemovalConfirmBody.tsx` | "You changed these since this demo's last save. Importing replaces them." | The rejected phrase, in a sentence. The title already asks about the changes | "Importing replaces these changes." |
| `components/RemovalConfirmBody.tsx` | "You changed these since this demo's last save. Uninstalling takes them out too." | Same | "Uninstalling removes these changes." |
| `components/RemovalConfirmBody.tsx` | "Importing replaces anything you changed since this demo's last save." | Same | "Importing replaces any changes you made." |
| `components/RemovalConfirmBody.tsx` | "Uninstalling removes anything you changed since this demo's last save." | Same | "Uninstalling removes any changes you made." |
| `components/removalConfirm.ts` | "Selected data types apply to Import only." | Unasked; it can show in a window with nothing selected | Delete it |
| `components/removalConfirm.ts` | "Puts back the store settings it changed." | "store settings" is the menu's own name for them, so it stays. Flagged only for the owner's "never the store" rule | Keep, or "Restores the settings it changed." |
| `components/removalConfirm.ts` | "The check took too long to answer." | Stiff | "The check timed out." |
| `components/ImportForm.tsx` | "Other data may need these, and this datapack has none: Categories." | Hard to follow | "This datapack has no Categories. Other data may need them." |
| `components/ImportForm.tsx` | "What importing again would change could not be read." | Fragment as the subject | "Couldn't check for changes." |
| `components/ImportForm.tsx` | "Data" as the checklist's label; "Instance default" | Vague name; sentence case | "Data Types"; "Instance Default" |
| `components/importModalView.ts` | "This project has no Commerce instance" as a title | A title names a thing and what happened | "No Commerce Instance" |
| `components/ImportDatapackModalBody.tsx` | "Connect a Commerce backend on the project dashboard, then import from here." | "from here" | "Connect Commerce on the project dashboard first." |
| `components/create-flow/saveWords.ts` | "Saves everything this demo uses as a new version of My Luma." | Inside view ("everything this demo uses"); "new version" goes under A.4 | "Saves this demo's data to My Luma." |
| `components/create-flow/saveWords.ts` | "Saves everything this demo uses as a new datapack of yours." | Same | "Saves this demo's data as a new datapack." |
| `components/create-flow/saveWords.ts` | "Nothing in this demo uses these yet. Select any to include." | Hard first sentence | "This demo doesn't use these yet. Select any to include." |
| `DI/services/demoBuilderEngine/saveOutcome.ts` | "Saved a new version of My Luma." | "new version" goes under A.4 | "Saved to My Luma." |
| `components/DatapackDetailPanel.tsx` | "Declared, Not Stored" | Inside view; a comma in a label | "Empty Data Types" |
| `components/DatapackDetailPanel.tsx` | "Also Sets" | Vague name | "Store Settings" |
| `components/DatapackDetailPanel.tsx` | "Data" | Vague name | "Data Types" |
| `components/DatapackDetailPanel.tsx` | "Everyone (community)" for a Data Installer datapack | Wrong name: the Show list files it under Data Installer | "Everyone" |
| `components/PackActions.tsx` | "Permanently deletes it and its version history." | Goes under A.4 | "Permanently deletes it." |
| `components/PackActions.tsx` | "Permanently deletes version main." | Code on screen | "Permanently deletes the main version." |
| `components/PackSetupStepDialog.tsx` | "One step in the Admin" as a title | Sentence case | "One Step in the Admin" |
| `hooks/usePackSetupStep.tsx` | "Demo Builder didn't get an answer in time. The check may still have finished; press Check to try again." | Unasked; a semicolon join | "The check timed out. Press Check again." |
| `hooks/useLibrarySharing.tsx` | "It could not be changed: …" | Vague | "Couldn't share it: …" and "Couldn't stop sharing it: …" |
| `components/DatapackCatalogGrid.tsx` | "Choose another view" | The control is called Show | "Choose another option under Show." |
| `components/DatapackCatalogGrid.tsx` | "Load a datapack .zip file, or save one from your demo's Commerce instance." | Shown in the Library too, which cannot save | Library: "Load a datapack from a file." Project: "Load a datapack from a file, or create one from this demo." |
| `components/DatapackSourceNotice.tsx` | "The Data Installer didn't answer, so its datapacks aren't listed. Refresh to try again." | "didn't answer" | "The Data Installer isn't responding, so its datapacks aren't listed." |
| `dataInstallerFailure.tsx` | "Could Not Reach the Data Installer"; "The Data Installer didn't accept your sign-in"; "The Data Installer is not configured" | Three title forms; two in sentence case | "Couldn't Reach the Data Installer"; "Data Installer Sign-In Failed"; "Data Installer Not Set Up" |
| `dataInstallerFailure.tsx` | "Set demoBuilder.dataInstaller.apiBaseUrl." | Code on screen | "Set the Data Installer address in Settings." |
| `components/StoreKindItems.tsx` | "Includes related categories, attributes and stock." | Fine. No change | |
| `components/create-flow/stages/StorePicksStage.tsx` | "This Commerce instance has no data to select." | Long | "Commerce has nothing to select." |
| `components/LoadDatapackFileModal.tsx` | "Loaded 3 of 5 data types. " | Fine. No change | |
| `ui/clearDemoDataWords.ts` | "12 set to the default's value. Commerce can't clear a website's own value, so a later change to the default won't reach them." | Unasked | "12 set to the default's value." |
| `components/ClearDemoDataModal.tsx` | "Choose the stores that are this demo's. Clearing permanently removes what only they use and Demo Builder didn't install, and closes their orders." | Fragments as nouns; hard to read once | "Select this demo's stores. Clearing permanently removes their data that Demo Builder didn't install, and closes their orders." |
| `components/ClearDemoDataModal.tsx` | "These stores hold nothing Demo Builder did not install." | Double negative | "Nothing to clear in these stores." |
| `hooks/useClearDemoData.tsx` | "Stores Cleared"; "Couldn't Clear the Stores" | The action is Clear Demo Data | "Demo Data Cleared"; "Couldn't Clear Demo Data" |
| `views/DatapackActivityView.tsx` | "Neither Demo Builder nor the Data Installer has a run on this Commerce instance matching this filter." | Inside view; long | "No activity matches this filter." |
| `views/DatapackActivityView.tsx` | "Open a project to see the datapack activity on its Commerce instance." | Long | "Open a project to see its datapack activity." |
| `views/DatapackActivityView.tsx` | "The Data Installer's own log could not be read: …" | "own log" | "Couldn't read the Data Installer's activity: …" |
| `DataInstallerScreen.tsx` | "Browse and install Adobe Commerce sample-data datapacks" | "sample-data" is used nowhere else | "Browse and install datapacks" |

### B.5 Errors that reach the screen from the handlers and the engine

These are shown as a result's reason. Several carry the raw id `name@version` through `labelPack`.

| File | Now | Why | Replacement |
|---|---|---|---|
| `saveStore.ts` | "The store no longer holds anything my-luma-3f9a1c@20261109-141504 made, so there is nothing to save." | The store; code on screen | "Commerce has none of My Luma's data left, so there is nothing to save." |
| `saveStore.ts` | "The store holds none of what was picked, so there is nothing to save." | The store; fragment | "Commerce has none of the items you selected." |
| `saveStore.ts` | "Select at least one item from the store to save. Nothing was saved." | The store; unasked second sentence | "Select at least one item to save." |
| `saveStore.ts` | "… cannot be read from the library or the Data Installer, so the products it holds that the store already had cannot be saved with it. Nothing was saved." | Inside view; the store; code on screen | "My Luma couldn't be read, so nothing was saved." |
| `saveStore.ts` | "Demo Builder did not install … in this project, so there are no store changes of it to save." | Code on screen; "store changes of it" | "Demo Builder didn't install My Luma in this project, so there is nothing to save." |
| `saveStore.ts` | "Some of … could not be saved to the library (…). Delete … from the library and try again." | Code on screen; it tells the SC to do what no button does | "My Luma wasn't fully saved: …. Save again." (and delete the partial version in code) |
| `saveStore.ts` | "The saved version could not be installed, so nothing was saved. …" | Reads as a contradiction | "Nothing was saved, because the datapack could not be installed again: …" |
| `DI/handlers/removalChanges.ts` | "What this pack put in Commerce was saved to my-luma-3f9a1c@20261109-141504, the datapack this demo now uses, so uninstall that one instead. Nothing was uninstalled." | Fragment; "pack"; code on screen | "This demo now uses My Luma. Uninstall that instead." |
| `DI/handlers/packSave.ts` | "This datapack is a team pack or not yours, so the changes cannot be saved into it. Save them as a new datapack of your own: send saveAs with its name." | Written for an agent; "pack" | Check it never reaches the screen. For the SC: "This datapack isn't yours. Save your changes as a new datapack." |
| `DI/handlers/privatePackPrompt.ts` | "Your teammates can't use this pack's data. Share it?" | "pack" | "Only you can use this datapack. Share it?" |
| `DI/handlers/datapackZipHandlers.ts` | "Your Adobe account can't add packs to the Data Installer: its owners grant that access. Packs stay in Demo Builder's datapack store, where Demo Builder installs them." | "packs"; unasked second sentence | "Your Adobe account can't add datapacks to the Data Installer." |
| `DI/handlers/importHandlers.ts` | "A Commerce instance is required — it is where the data will be written." | A long dash; unasked | "This project has no Commerce instance." |
| `DI/handlers/importHandlers.ts` | "Choose both a target website and a store view, or neither — the Data Installer needs the pair." | A long dash; inside view | "Select a website and a store view." |
| `DI/handlers/importReplacement.ts` | "… Your changes are safe: …" | Unasked reassurance | "Your changes were saved to My Luma." |
| `DI/services/demoBuilderEngine/repeatInstall.ts` (shown to the SC) | "Took out 3 items the pack no longer has: products (3)." | "pack"; fragment | "Removed 3 items no longer in the datapack: 3 products." |
| `repeatInstall.ts` (shown to the SC) | "Kept 2 items changed in the Admin." | Fine. No change | |
| `DI/services/demoBuilderEngine/removalRuns.ts` (shown to the SC) | "Commerce would not take out 2 items: … Installing the datapack again tries again." | "take out"; "again tries again" | "Commerce couldn't remove 2 items: …" |
| `DI/services/demoBuilderEngine/layerStep.ts` (shown to the SC) | "The store settings in bodea-settings@2 were not all applied. … The datapack's data is installed. Uninstalling the datapack takes it out, and puts back any setting that was applied." | Code on screen; two unasked sentences | "Some store settings weren't applied: …" |
| `DI/services/demoBuilderEngine/packRootStep.ts` (shown to the SC) | "One step is left in the Admin: …, Root Category: …, then Save Store. Until then the storefront does not show …'s categories." | Fine as an Admin step. No change | |

### B.6 Reset, delete, dashboard and wizard

| File | Now | Why | Replacement |
|---|---|---|---|
| `features/projects-dashboard/services/deletionConfirmation.ts` | "Are you sure you want to delete "X"?" with "This will remove all project files and configuration. This action cannot be undone." | The warning is a footnote; "Are you sure"; the windowed form already says it better | "Delete X?" with "Permanently removes its files from this machine." |
| `deletionConfirmation.ts` | "Also delete these external resources? (Enter to delete)" | "external resources" | "Also delete these?" |
| `deletionConfirmation.ts` | "My Luma, from this demo's Commerce instance. Your changes are saved first." | Fragment as the first sentence | "Removes My Luma from Commerce. Your changes are saved first." |
| `features/eds/services/reset/edsResetUI.ts` | "Are you sure you want to reset "X"? This will reset all code to the template state and re-copy demo content." | "Are you sure"; the batch form is better | "Reset X?" with "It returns to how it was set up. Code changes are lost." |
| `features/eds/services/reset/edsResetOtherData.ts` | "In Commerce, … also holds … Demo Builder didn't install. … Clear demo data too, to leave it empty? This can't be undone." | One long paragraph; the warning is a last line | Title "Clear Demo Data Too?" Body: "Permanently removes 12 products and 3 customers that Demo Builder didn't install." Counts of what is left belong in the Clear Demo Data window |
| `features/projects-dashboard/ui/components/BatchDatapackChanges.tsx` | "Changed since installed. Save each as a new datapack, or discard its changes." | Fragment as the first sentence | "These datapacks have changes. Save each as a new datapack, or discard its changes." |
| `features/projects-dashboard/ui/components/BatchResetQuestions.tsx` | "Couldn't check for changes. Datapack kept." | Fine. No change | |
| `features/dashboard/handlers/datapackLineHandler.ts` | "This demo's data" (the Datapacks card's line when the datapack's name cannot be read) | Vague, close to the rejected "Current Data" | "Datapack Installed" |
| `features/dashboard/ui/components/DataInstallerTile.tsx` | "This demo's datapack: import it, save its changes, or choose another" | A colon join | "Import, save or change this demo's datapack" |
| `features/project-creation/ui/steps/SampleDataStep.tsx` | "This should only take a moment" | Unasked | Delete it |
| `SampleDataStep.tsx` | "…, which isn't published yet. Ask the demo's owner to export it." | No button says Export | "…, which isn't shared yet. Ask the demo's owner to share it." |
| `SampleDataStep.tsx` | "No Datapacks Yet. You can add one after the project is created." | Title Case inside a sentence | "No datapacks yet. You can add one after the project is created." |
| `features/project-creation/handlers/executorSampleDataPhase.ts` | "Datapack could not be installed — reason" | A long dash | "Datapack could not be installed: reason" |
| `executorSampleDataPhase.ts` | "Installed Luma partially — some data types did not land. Retry from the dashboard." | A long dash; "did not land" | "Luma was partly installed. Import it again from the dashboard." |
| `executorSampleDataPhase.ts` | "Skipped datapack — reason" | A long dash | "Datapack skipped: reason" |

## What I could not check

| What | Why it matters |
|---|---|
| Any screen, as drawn | Every string was read from source. Wrapping, and which strings show together, were not seen |
| Whether each string in B.5 reaches an SC | They are handler and engine answers. I traced `StoreChangesError` to the save window and the `scLines` to the import window. The rest I did not trace end to end |
| The datapack store's own behaviour | I did not call it. Defect 2 (a save of a shared datapack is private) is from `createDatapack` sending `shared: false`. The store may copy the flag by name on its side |
| Defect 1 (deleting the version in use) | Read from the delete handler and `readInstalled`. Not reproduced |
| How many saved versions exist today | That needs a read of the live datapack store, which this task ruled out |
| Whether a development build with saves reached anyone but its testers | Tags show no release has it. Hand-shared builds leave no trace in the repository |
| How long a restore takes | It is an uninstall and an install. The replace-flow research timed an uninstall of Luma at about three minutes; I did not time the pair |
| `core/utils/operationStages.ts` and the rest of `creationStages.ts` | Outside the files named. `creationStages.ts` has more of the same pattern ("Swapping what the edit changed", "Off Adobe I/O Runtime and Commerce") |
| Strings changed by the other agent after I read them | `importResult.ts` changed on disk while this was written. Search for each quoted string before acting on it |
| The 25 and 40 character limits | Replacements were counted by hand. `waitStages.test.ts` is the check |
