# Phase 1: the words, before and after

For the owner's approval before Phase 1 is built. The base list is Versions Part B (about 110
finds). It was written before D1, D3 and D6, so this file does three things:

1. states the swaps that apply everywhere (section 1);
2. lists every Part B row whose replacement those decisions change (section 2);
3. adds the Flow and Clarity finds Phase 1 owns (section 3).

Every other Part B row is taken as written. On 2026-11-10, 140 of the 168 strings Part B quotes
were still in `src/`. The other 28 were changed by Phase 0 or are built from parts. The loop
searches for each one again before it edits it.

**Judgement calls are marked ⚑.** Approving this file approves them, unless you strike one.

## 1. Swaps that apply everywhere

| Now | After | Where it shows | Decision |
|---|---|---|---|
| Import (button) | **Install** | import form, flyout, card, `importModalView.ts:216` | D1 |
| Import My Luma (title, form and while running) | **Install My Luma** on the form; **Installing My Luma** while it runs | `importModalView.ts:327-358` | D1, running titles end in "-ing" |
| Importing… / Importing the sample data (3 of 14) | **Installing…** / **Installing the sample data (3 of 14)** | `importProgress.ts:4`, `importJobWatch.ts:39,69`, `importJobRunner.ts:161` | D1 |
| My Luma Imported / Import Stopped | **My Luma Installed** / **Install Stopped** | `importResult.ts:193-285` | D1 |
| Import Anyway | **Install Anyway** | `importModalView.ts:191` | D1 |
| Import Without Saving / Save and Import / Save As New and Import | **Install Without Saving** / **Save and Install** / **Save As New and Install** | `uninstallWords.ts` (the verb type becomes `'Uninstall' \| 'Install'`) | D1 |
| Import finished | **Install finished** | `types.ts:421`, `importJobWatch.ts:195` | D1 |
| Verify the Import (step) | **Verify Installation** | `importSteps.ts:192` | D1. Agreed 2026-11-10 ("Check What Went In" struck: not how software speaks) |
| Import (Activity column) | **Install** | `DatapackActivityView.tsx:19,51` | D1 |
| Selected data types apply to Import only. | **The data types you tick apply to Install only.** | `removalConfirm.ts:43` | D1 |
| Load from File | **Add from File** | `CatalogHeaderActions.tsx:85`, `LoadDatapackFileModal.tsx:125` | D2 |
| Save as File | Stays **Save as File** | `PackActions.tsx:90,299`, `SaveDatapackFileButton.tsx:66` | D2 (already right) |
| Dry Run (button) | Stays **Dry Run** (owner, 2026-11-10: SCs know the term; "Check First" was tried and reversed) | `importModalView.ts:214`, `DatapackActivityView.tsx:54` | D6 |
| Dry Run Passed, "Nothing was written." | **Dry Run Passed**, "My Luma can be installed here. Nothing was written." | `importResult.ts:259` | D6, Clarity 1.20 |
| Validation Failed | **Dry Run Found a Problem** (amber) | `importResult.ts:260` | D6, Flow 2.14 |
| Dry Run Failed | Stays **Dry Run Failed** (red) | `importResult.ts:256` | D6 |
| After Dry Run Passed: Back, Close | Back, **Install** | `importModalView.ts` result row | Flow 2.14. A button, not words, but it ships with the words |
| store settings, Also Sets, the settings layer, `my-luma-x1-settings` | **Store Configuration** as the one name, always "part of My Luma" (owner, 2026-11-10: matches Commerce Admin's Stores > Configuration and Clear Demo Data's "Restore Default Configuration"; "Store Settings" was tried and reversed) | six places, Clarity 1.8 | Phase 1's own rule |

Out of scope on purpose: "Import from File…" and "Import Project" on the Projects screen and in
the wizard. They bring in a project's settings, not a datapack, and D1 is about datapacks.
(Agreed 2026-11-10.)

## 2. Part B rows the decisions change

| File | Now | Part B said | After |
|---|---|---|---|
| `waitStages.ts` `checkingImport` | Checking the import / Nothing is written | Running the dry run | **Running the dry run** (no second line) |
| `importSteps.ts` | Recording what went in | Finishing the import | **Recording installed items** (agreed 2026-11-10) |
| `VersionHistoryDialog.tsx` | This demo's data goes back to the version you choose. | Replaces this demo's data with the version you choose | Not changed: Phase 2 deletes the dialog (D3) |
| `PackActions.tsx` | Permanently deletes version main. | Permanently deletes the main version | Not changed: Phase 2 removes the per-version delete (D3) |
| `RemovalConfirmBody.tsx:24` | You changed these since this demo's last save. Importing replaces them. | Importing replaces these changes | **Installing replaces these changes.** |
| `RemovalConfirmBody.tsx:30` | Importing replaces anything you changed since this demo's last save. | Importing replaces any changes you made | **Installing replaces any changes you made.** |
| `removalConfirm.ts:41` | Puts back the store settings it changed. | Keep, or "Restores the settings it changed" | **Puts back the store configuration it changed.** |
| `DatapackCatalogGrid.tsx:76` | Load a datapack .zip file, or save one from your demo's Commerce instance. | Load a datapack from a file… | My Datapacks: **"Add one from a file."** Project: **"Add one from a file, or save this demo's."** |
| `saveStore.ts` | Some of … could not be saved to the library (…). Delete … from the library and try again. | My Luma wasn't fully saved: …. Save again. | Same, and with no version left behind (D3: Phase 2 owns the clean-up in code) |
| `DataInstallerTile.tsx:64` | This demo's datapack: import it, save its changes, or choose another | Import, save or change this demo's datapack | **Install, save or change this demo's datapack** |
| `executorSampleDataPhase.ts` | Installed Luma partially — some data types did not land. Retry from the dashboard. | Luma was partly installed. Import it again from the dashboard. | **Luma was partly installed. Install it again from the dashboard.** |
| `datapackLineHandler.ts` | This demo's data | Datapack Installed | Same. Phase 5 replaces the line with the name and the demo's state, e.g. **My Luma · Not installed yet** (agreed 2026-11-10) |
| Every Part B row that says "version", "Version History", "Restore A Save" or "Saved a new version" | as quoted | as Part B | Left to Phase 2. Phase 1 does not polish words D3 deletes |

## 3. From the Flow and Clarity reviews

| Find | Now | After |
|---|---|---|
| Flow 2.13 | (version X is no longer published; the default version is selected) | **This demo asks for Luma. That version is gone, so the default is selected.** |
| Flow 2.13 | Ask the demo's owner to export it. | **…which isn't shared yet. Ask the demo's owner to share it.** |
| Flow 2.13 | No Datapacks Yet. You can add one… | **No datapacks yet. You can add one after the project is created.** |
| Flow 2.13 | without sample data (`:283`) / without a datapack (`:174`) | **without a datapack** in both |
| Flow 2.13 | This should only take a moment | cut |
| Flow 2.16, Clarity 1.21 | Declared, Not Stored | **Empty Data Types** |
| Flow 2.16, Clarity 1.8 | Also Sets: `catalog/frontend/grid_per_page: 24` … | **Store Configuration: 4 Settings**, the paths behind a **Show** link |
| Flow 2.16 | Visible To: Everyone (community), on a Data Installer datapack | **Visible To: Everyone** (agreed 2026-11-10: "community" is the shared-library section's name, not an audience) |
| Flow 2.16 | Data (import form label) | **Data Types** |
| Clarity 1.8 | Its 4 store settings are saved beside it, in my-luma-x1-settings. | **Its store configuration (4 settings) is saved beside it, in my-luma-x1-settings.** |
| Clarity 1.8 | It also carries store settings, which go into My Datapacks: + every path | **Its store configuration (4 settings) goes into My Datapacks.** |
| Flow 2.20 | Every data type in the pack / this pack's data | **datapack** |
| Flow 2.20 | Choose another view | **Try All Datapacks** |
| Flow 2.20 | It could not be changed: … (Share) | **It couldn't be shared: …** / **Sharing couldn't be stopped: …** |
| Flow 2.20 | Couldn't be read / Couldn't load products: … | **read** in both |
| Flow 2.20 | catalogue (agent consents) | **catalog** |
| Flow 2.20 | Clear Demo Data's stages | Commerce's own verbs, one verb per action (agreed 2026-11-10): **Delete** = gone from Commerce; **Remove … from Websites** = still exists, no longer on that website; **Restore Default Configuration** = website scope set to the Default Config value. So: Deleting customers / products / cart price rules / companies / shared catalogs / customer groups / categories / attribute sets / attributes; **Removing products from websites**; **Removing cart price rules from websites**; **Restoring default configuration**. Labels stand alone: no second line to disambiguate. The cap and the verb convention for the whole extension land in Phase 1b (owner, 2026-11-10); Phase 1 changes only these labels |
| Flow 2.20 | the long dash in creation's lines | a colon |
| Flow 2.20 | `data-installer.md` quotes sentences the code no longer says | rewritten from the code after this phase |
| Clarity 1.21 | Nov 9, 1:56 PM (flyout title) / Saved Nov 9, 1:56 PM (card) | **Saved Nov 9, 1:56 PM** in both. Phase 7 settles date formats |
| Clarity 1.21 | Set demoBuilder.dataInstaller.apiBaseUrl. | **Set the Data Installer's address in Settings.** |
| Clarity 1.21 | Fix with AI (no hover) | the hover: **Opens your AI assistant on this problem** |

Not in Phase 1: Flow 2.15 ("Undo Load" for the Load result's Delete) is a button behaviour, and
"Add from File" changes its context. It goes with Phase 7's Datapacks screen. (Agreed 2026-11-10.)

## 4. What Phase 1 adds so the words stay put

- `docs/development/sop/dialog-design.md`: replace the model second line "Each data type, in
  Commerce", and add the rejected patterns (fragment, inside view, unasked reassurance, "the
  store", vague name, code on screen) with one example each.
- A convention row in the handbook with an enforcer: no on-screen "Import" for a datapack, no
  "Check First" or "Store Settings" (Dry Run and Store Configuration kept, owner 2026-11-10), no
  "pack" alone, no raw setting key, no long dash in a sentence. The enforcer reads
  the strings in `features/data-installer/**` and the wait files.
- One home for each repeated phrase: `uninstallWords.ts` grows into the datapack words module
  (Install, Uninstall, Dry Run, Store Configuration), and every screen imports from it.
- The agent text (tool descriptions, `import-datapack.md` skill, alert copy) moves to the same
  words. `AI_CONTEXT_VERSION` is NOT bumped here: one bump, after every phase is built (owner,
  2026-11-10).
