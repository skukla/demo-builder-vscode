# Datapack flows: what would confuse an SC, and every layout

Review of branch `fix/release-walk-fixes` with its uncommitted changes, 2026-11-10. Read from the
code only. Nothing was run in a webview, no store was touched, and no rendered screen was seen
(section 4 lists what needs a screenshot).

Two other agents were editing this checkout during the review. Line numbers are as read on the day
and may have moved. Every quoted string was copied from the file cited. Names, counts and dates
inside a quote ("My Luma", "12 updated", "my-luma-x1-settings") are examples filling the code's own
sentence.

Paths are under `src/`. `DI/` stands for `src/features/data-installer/`.

This review starts from `.rptc/research/datapack-flow-review/research.md` (the map) and does not
repeat its findings. Where a finding there is still the answer, it is cited as "map 2.x". Several
of that review's findings are already fixed in the code as read: the Activity row now shows the
display name, the saved date and the screen's words; Load from File's titles are named results;
the Data Installer destination is behind the same switch as the copy button; a clean Uninstall
ends on Close alone; Clear Demo Data's grey footnote is gone.

**Size** on each finding is the size of the change, not of the problem: small (words or one
prop), medium (one component or one flow), large (several surfaces).

## 1. Confusing for an SC, ranked

Ranked by how much it would confuse or slow an SC, most first.

### 1.1 Nothing on screen says how to put the demo's data back (medium)

An SC resets a demo several times a week. Five actions sound like "put my data back", and none
says it does.

| Action | What an SC expects | What it does |
|---|---|---|
| Reset project, "Uninstall Datapack" (`features/eds/services/reset/edsResetSampleData.ts:86-107`) | The data goes back to how it was set up | The datapack is uninstalled. Commerce is left without it. Nothing reinstalls it |
| Reset project, "Keep Datapack" | The data is reset too | The data stays as it is, the SC's edits included |
| Reset Selected: "Each project returns to how it was set up." (`features/projects-dashboard/ui/components/BatchResetQuestions.tsx:50`) | Data too | Code only. The data either stays or is uninstalled |
| "Import" on the version the demo already uses (`DI/ui/components/PackActions.tsx:242-244`) | A first install, or nothing | This is the one that puts the data back: it updates and removes |
| "Clear Demo Data" (`DI/ui/components/CatalogHeaderActions.tsx:92`) | Clears the demo's data | Clears what Demo Builder did NOT install (1.2) |

So the action that does the job an SC came for is a button named "Import" on a datapack that is
already installed.

Fix, shortest first:

1. On the version the demo uses, the flyout's button reads "Import Again". The code already
   calls it that ("What importing again would change", `DI/ui/components/ImportForm.tsx:244`).
2. Reset's question says what Keep means: "Keep Datapack" leaves the data as it is now. One
   sentence in the detail: "To put its data back as installed, import it again from Datapacks."
3. Reset Selected's lead says code: "Each project's code returns to how it was set up."

### 1.2 Clear Demo Data means the opposite of its name, and asks a question an SC cannot answer (medium)

Where: `DI/ui/components/ClearDemoDataModal.tsx:34-37`.

The lead: "Choose the stores that are this demo's. Clearing permanently removes what only they
use and Demo Builder didn't install, and closes their orders."

- **The name.** "Clear Demo Data" reads as "clear this demo's data", which is the datapack. It
  clears everything else. An SC who wants the datapack gone presses this, not More, Uninstall.
- **The question.** "Choose the stores that are this demo's." The project already records its
  website and store (the import form opens on it, `DI/ui/components/ImportDatapackModal.tsx:131`).
  The dialog opens with nothing ticked (`ClearDemoDataModal.tsx:90`) and asks the SC to find
  their own store in a tree of every website on a shared instance.
- **The sentence.** "what only they use and Demo Builder didn't install" is two conditions in
  eleven words. It cannot be undone, so it is the sentence that most needs to be plain.

The preview is good once a store is ticked: counts per kind, and "Installed: … Uninstalling its
datapack takes these out." (`DI/ui/clearDemoDataWords.ts:135`) points at the right action.

Fix: open with the project's own store ticked. Lead: "Permanently removes what was added to these
stores by hand, and closes their orders. The datapack stays." Rename the button to say what goes;
"Clear Other Data" is the shortest that is true. The name is the owner's call.

### 1.3 A first import opens with nothing ticked and Import switched off, with no reason (small)

Where: `DI/ui/hooks/useTypeSelection.ts:30`: "a larger one is opt-in". A datapack with more than
one data type opens its form with every box empty. `ImportDatapackModal.tsx:241`: Import and Dry
Run are off until one is ticked. Nothing says why.

The same file says why this is wrong: ticking them one at a time "is a chore for what is usually
'all of it'" (`useTypeSelection.ts:54-55`). A replace already starts with all ticked.

Then, when the SC ticks Products, other boxes tick themselves and lock
(`ImportForm.tsx:233`, "Locked while something selected needs it"). The reason is in a code
comment, not on screen. An SC sees a greyed, ticked box that will not untick.

Fix: start with every data type ticked on every import. Draw each row with the house
`CheckboxRow`, whose `reason` line says why a locked row cannot change ("Products need this").

### 1.4 The blue check means "chosen", and looks the same as "installed" (medium)

Where: `DI/ui/components/DatapackCatalogGrid.tsx:33-35`, `DI/services/datapackCatalog.ts:55-57`.
A card wears the check and the blue border when the project records the datapack. The wizard
writes that record when the SC chooses a datapack. Creation then installs it, and a failed
install does not fail the build (`features/project-creation/handlers/executorSampleDataPhase.ts:84-93`).

So after "Datapack could not be installed" the Datapacks screen shows the same check as after a
clean install. The dashboard's tile shows the datapack's name either way
(`features/dashboard/handlers/datapackLineHandler.ts:23-39`). The only difference is what is
missing: no Save Changes, no Uninstall. An SC opens the storefront, finds no products, and has
nothing on screen that says the data never went in.

The check also has no words. It is the wizard's selection mark, and here it is a status.

Read from the code, not reproduced.

Fix: the check only for a datapack with an install record (`installedAt`). A datapack chosen but
not installed gets the house amber dot beside its version, hover "Not installed yet", and its
flyout's Import is the main button as it is now. Creation's line already says "Retry from the
dashboard." (`executorSampleDataPhase.ts:130`); name the place: "Import it from Datapacks."

### 1.5 Importing the same version again overwrites edits with no sentence and no save offer (medium)

Importing another version asks first: "Save Your Changes First?" (map 1.6). Importing the same
version again does not (`DI/ui/hooks/useReplacement.ts:122-125`). It shows a count under each
data type ("12 updated, 2 removed", `DI/ui/importChangeLines.ts:24-36`) and Import runs at once.

- The form has no sentence on this path. `replaces` is only set for another version or datapack
  (`DI/replaceWords.ts:30-41`). The counts stand alone, and "12 updated" can be read as "you
  updated 12" or "12 will be updated".
- The pickers are greyed (`ImportForm.tsx:102,117`) and nothing says why.
- An SC who learned from the other path that the window asks before losing changes will expect
  it to ask here.

Fix: a lead sentence on this form: "Importing again sets this demo's data back to My Luma."
Above the list, when any count is not zero: "Save Changes first to keep what you changed." The
greyed pickers need no words once the lead says "this demo's data".

### 1.6 One action has three verbs, and "Load" does not load (medium, needs the owner's word)

| The SC presses | The window says | The result says | The opposite is |
|---|---|---|---|
| "Import" | "Install My Luma", "Installing 1,200 of 2,046", "Installed" (`DI/importSteps.ts:141-150`) | "My Luma Imported" | "Uninstall" |

Also: Share says "Everyone can find and install it" (`DI/shareWording.ts:12`), and the wizard says
"Installing the datapack", "Installed Luma". So an SC meets Import, Install and Uninstall for one
pair of actions.

"Load from File" puts a file in My Datapacks. It does not put anything in Commerce. In most
software "Import" is the word for bringing in a file, so an SC may press Import to bring in a zip,
or expect Load to fill the store. The result does say "Added to My Datapacks."
(`DI/ui/components/LoadDatapackFileModal.tsx:202`), which is the right last word.

There are also four saves: "Save Changes" (Commerce into a new version), "Save As New Datapack",
"Save As New" (the same thing, inside the save dialog), and "Save as File" (a zip).

Recommendation: Install and Uninstall as the pair, everywhere, since the steps, the wizard and the
opposite already use them. "Add from File" for the zip going in and "Download" or "Export to File"
for it going out, so Save means only "Commerce into a datapack". This touches the agent tools'
names in consent text too.

### 1.7 More holds three red-bin rows that sound alike (small)

Where: `PackActions.tsx:99-108`. One section, one icon:

- "Uninstall" takes the datapack's data out of Commerce.
- "Delete Datapack" deletes the datapack from My Datapacks. Commerce is untouched.
- "Delete Store Settings" deletes settings saved with the datapack. Commerce is untouched.

"Delete Store Settings" reads as "delete my store's settings". Its confirm does not correct
that: "Permanently deletes the store settings saved with it." (`PackActions.tsx:135`).

Fix: "Uninstall from Commerce" in its own section, with a different icon from delete. "Delete
Saved Settings", and its confirm: "Permanently deletes the settings saved with My Luma. Commerce
keeps its own."

### 1.8 "Store settings" is a hidden second thing an SC never chose (small to medium)

An SC meets store settings in six places, each with different words:

| Where | Words |
|---|---|
| Flyout row (`DI/ui/components/DatapackDetailPanel.tsx:288-293`) | "Also Sets", then raw paths: "catalog/frontend/grid_per_page: 24" |
| More menu | "Delete Store Settings" |
| Uninstall's question (`DI/ui/components/removalConfirm.ts:41`) | "Puts back the store settings it changed." |
| Install step | "Applying store settings" |
| Save's result (`DI/services/demoBuilderEngine/saveOutcome.ts:105`) | "Its 4 store settings are saved beside it, in my-luma-x1-settings." |
| Load's form (`LoadDatapackFileModal.tsx:222-224`) | "It also carries store settings, which go into My Datapacks: " then every raw path |

The save's line shows the library's own id for a hidden datapack. That is a name with a random
suffix that appears on no card. "Saved beside it" tells the SC there is a second thing to look
after.

Fix: one name, "Store Settings", and treat them as part of the datapack in every sentence. The
save: "Saved with its 4 store settings." The flyout row: label "Store Settings", value "4
settings", the paths behind a "Show" link. Load: "It includes 4 store settings."

### 1.9 The version picker on a card looks like a switch for the demo (medium)

Where: `DI/ui/components/DatapackCard.tsx:195-214`. The card of the demo's own datapack wears the
check and has a live picker: "main", "eds-compatible", "Saved Nov 9, 1:56 PM". Choosing another
changes only which version the flyout opens on. The check stays, because it is per datapack, not
per version (`DatapackCatalogGrid.tsx:98`). An SC picks "eds-compatible" on the checked card and
reasonably thinks the demo now uses it.

"main" and "eds-compatible" are also never explained. They are the Data Installer's own names.
The picker's second line says only "Updated Nov 6".

The amber dot says "Updated on Nov 9" on hover (`DI/ui/components/projectPackNewer.ts:49-51`). It
means the version the demo installed has changed since. It does not say what to do. The answer is
1.1's "Import Again".

Fix: under the picker on the demo's card, when the version shown is not the one in use: "This
demo uses main." The dot's hover: "Updated Nov 9. Import again to get it."

### 1.10 Version History is a list of times with nothing to tell them apart (medium)

Where: `DI/ui/components/VersionHistoryDialog.tsx:77-88`. Each save is "Nov 9, 9:15 AM". Every
Save Changes and every "Save and Import" adds one. After a week an SC has a dozen times and must
pick the good one. They cannot answer that from the list.

- A save has no note, no counts and no way to say how it came about. "Saved before importing
  the version from Nov 8" would tell a safety save from a deliberate one.
- No year (`DI/packVersions.ts:38-43`). Fine today. In January, "Dec 20" will read as next month.
- The sentence is wrong on a datapack the demo does not use. Version History shows on any
  datapack with more than one save (`PackActions.tsx:246`, `DI/ui/versionHistory.ts:23`), and
  always says "This demo's data goes back to the version you choose." For another datapack
  nothing goes back: it is a replace.
- Restore Version then opens the import form (map 2.7 is still the right fix).
- One save cannot be deleted (map 2.8, still true).

Fix: each row's second line says what made it ("Saved by you", "Saved before an import") and what
changed in counts, both known when the save runs. The lead only when the demo uses this datapack;
otherwise "Importing a version replaces this demo's datapack."

### 1.11 Save Changes never says what it saved (medium)

The uninstall and replace questions list the SC's changes by data type and name ("Products:
24-mb01, 24-mb02 and 2 more", `DI/ui/components/RemovalConfirmBody.tsx:38-43`). Save Changes, the
action whose whole job is those changes, shows one sentence before ("Saves everything this demo
uses as a new version of My Luma.", `DI/ui/components/create-flow/saveWords.ts:32-34`) and one
after ("Saved a new version of My Luma.", `saveOutcome.ts:62`). The SC does not learn whether
the product they just added is in it.

Two words make it harder:

- "everything this demo uses". Uses how? A product made in the Admin but not assigned to the
  demo's website is "unused" and left out, unless the SC opens "Add Unused Items".
- The result then says "Left out, because nothing selected them: 3 products."
  (`saveOutcome.ts:86`). There was nothing to select on that screen. It reads as a fault.

Fix: the result lists what changed, in the confirm's own form: "Saved a new version of My Luma.
Products: 3 added, 1 updated." And: "Left out, because this demo doesn't use them: 3 products.
Add them with Add Unused Items."

### 1.12 A run sent to the background ends on a status-bar line (medium, shared code)

Where: `core/vscode/operationBackgroundNotice.ts:99-101`. An import takes about six minutes.
"Run in Background" is the only button while it runs. A clean end then shows "Importing My Luma —
done" in the status bar for a few seconds, and nothing else. An SC who went to another window
does not know it ended, or that it ended well.

The title is also the wrong tense for an ending: "Importing My Luma — done"
(`DI/ui/components/importModalJob.ts:37`).

Fix: a datapack run that was sent to the background ends on a notification that stays, in the
result's own words: "My Luma Imported", with "Open Datapacks". This file is shared with every
progress window, so the change is a flag per run, not a new default.

### 1.13 The filter box only searches the current Show choice (small)

Where: `DI/ui/hooks/useCatalogShow.ts:85-88`. Show opens on "Recommended", which leaves out
Community and some Data Installer datapacks. Sharing tells a colleague "find … it under Community
Datapacks". That colleague types the name in the filter and reads: No datapacks match "acme"
(`DatapackCatalogGrid.tsx:83`). It is there, under another Show choice.

Fix: when the filter finds nothing here but something elsewhere, say so with the way there: "No
matches in Recommended. 2 in All Datapacks." and a "Show All Datapacks" link.

### 1.14 On a replace, the data types can still be unticked (small)

A replace ticks every data type (`useTypeSelection.ts:36-40`) but leaves the boxes live. The old
datapack is uninstalled whole whatever is ticked. Only ticked types of the new one are installed
(`DI/handlers/importReplacement.ts:117-123` passes the request's own list on). Untick Customers
and the demo ends up with neither datapack's customers. The lead says "Replaces this demo's data".

Read from the code, not reproduced.

Fix: map 2.7 (Restore Version skips the form) removes most of it. For a replace of another
datapack, lock the boxes ticked.

### 1.15 Load from File asks "Replace Existing Version" without saying whether one exists (small)

Where: `LoadDatapackFileModal.tsx:227-229`. An SC cannot know whether My Datapacks already holds
this version, or what happens if the box is left empty and it does. The system can look.

Fix: ask only when it exists, as a sentence: "My Luma from Nov 9 is already in My Datapacks." with
the box "Replace It".

### 1.16 The header's first button changes its name and its job (small)

Where: `CatalogHeaderActions.tsx:76-81`. The same spot reads "Create Datapack", then "Save
Changes", then "Save As New Datapack", by what the demo holds. Once the demo has a datapack,
"Create Datapack" is gone from the screen. The way to make a new one is Save Changes, then "Save
As New" inside it.

"Save Changes" in a page header, with no datapack named, also does not say whose changes or where
they go. In the flyout the same words sit under the datapack's name.

Fix: the header's label names the datapack: "Save Changes to My Luma". Keep "Create Datapack" in
the header always; with a datapack in use it opens the same dialog on its name screen.

### 1.17 Whose datapack is it: five words, two of them unexplained (small)

- "Recommended" is the opening view (`DI/ui/catalogShow.ts:42-50`). Recommended by whom, for
  what? It means "yours, the team's and the curated ones".
- "Team". Nothing on screen makes a datapack a team one, and nothing says a team datapack cannot
  be saved into. The only sign is that its button reads "Save As New Datapack".
- "Data Installer" is a service's name, used as a tag, a Show choice and in failure titles. An SC
  who has never opened that service reads it as a kind of datapack.
- "Visible To: Everyone (community)" on a Data Installer datapack (`DatapackDetailPanel.tsx:313-315`),
  which the Show list does not file under Community (map 2.16).
- My Datapacks, Mine, "your datapacks": map 2.10. The code now says "My Datapacks" in most
  sentences.

Fix: "Recommended" becomes "Mine, Team and Featured" or simply opens on "All Datapacks" with
Community last. The flyout of a team datapack gets one row: "Saving: As a new datapack of yours".

### 1.18 The Admin step is only in the flyout, and does not say what it is for (small)

Where: `DI/ui/components/PackSetupStepLine.tsx:25-27`: "1 step left in the Admin", "Show Step". An
SC who closed the import's result sees no sign of it on the card or the dashboard. The line does
not say what breaks until it is done.

Fix: the line names the effect, from the step's own title: "1 step left in the Admin: show the
datapack's categories." The demo's card wears the amber dot while the step is open.

### 1.19 The wizard's Datapacks step cannot show what is in a datapack (small)

Where: `features/project-creation/ui/steps/SampleDataStep.tsx:226-235`. Pressing a card chooses
it. There is no flyout, by design, so an SC chooses between "Luma" and "Bodea" on art and a name.
On the Datapacks screen the same card opens details instead. Same card, two meanings of a press.

Also: "None", "Create this project without sample data." (`:281-283`) and "without a datapack"
(`:174`); "isn't published yet. Ask the demo's owner to export it." (`:217`), when no datapack
button says Export (map 2.13, still true).

Fix: one line under the name on the wizard's card: its data types as a count and the two that
matter, "2,046 products, 38 categories". The counts are in the catalog's answer.

### 1.20 Dry Run (small)

"Dry Run" is a developer's phrase. Its answer, "Dry Run Passed", "Nothing was written."
(`DI/ui/components/importResult.ts:259`), does not say what it checked, and an SC may expect it
to say what the import would change. It checks that the datapack's rows are valid and the target
exists (`DI/services/demoBuilderEngine/engine.ts:321-340`). Map 2.14's titles still apply
("Validation Failed" is still there, `importResult.ts:260`).

Fix: button "Check First". Result: "Check Passed", "My Luma can be imported here. Nothing was
written.", with Import beside Back.

### 1.21 Smaller words

| What | Where | Change |
|---|---|---|
| "Declared, Not Stored" | `DatapackDetailPanel.tsx:277` | "Empty Data Types" (map 2.16) |
| The flyout's title shows a save as "Nov 9, 1:56 PM"; its card says "Saved Nov 9, 1:56 PM" | `DatapackDetailPanel.tsx:148`; `DatapackCard.tsx:185-187` | "Saved" in both |
| "It could not be changed: …" after Share fails | `DI/ui/hooks/useLibrarySharing.tsx:42` | "It could not be shared: …" |
| "Saved to <path>" with no way to open the folder | `DI/ui/components/SaveDatapackFileButton.tsx:84` | A "Show in Folder" link |
| "Set demoBuilder.dataInstaller.apiBaseUrl." on screen | `DI/ui/dataInstallerFailure.tsx:98` | "Set the Data Installer's address in Settings." The button beside it already opens it |
| "Fix with AI" gives no hint of what opens | `DI/ui/hooks/useImportRetry.ts:38-40` | Fine as a label. Its hover: "Opens your AI assistant on this problem" |
| Reset's third question is one sentence of up to eight clauses | `features/eds/services/reset/edsResetOtherData.ts:159-161` | Map 2.19: ask it in the progress window, as a list |

## 2. Layout improvements, ranked

Each names the house layout it should be (dialog-design.md's five: Form, Confirm, Progress,
Result, Guide) where that applies.

### 2.1 Uninstall's question with changes: three buttons at medium will wrap (small)

Layout: Confirm. Where: `DI/ui/components/importModalView.ts:325`: "An uninstall's confirm stays
medium".

The import's question was widened so its three buttons sit on one line (walk F127, same file,
`:320-324`). Uninstall's has the same three with longer words: "Uninstall Without Saving",
"Cancel", "Save and Uninstall" or "Save As New and Uninstall". By character count these need about
490px and 550px. A medium dialog has about 430px of content. `dialog-design.md:192`: "a dialog too
narrow for its buttons wraps the row."

Fix: large when the question has changes to keep. Needs a screenshot to confirm (section 4).

### 2.2 The flyout's buttons scroll away, and sit inset from everything above them (medium)

Layout: the house Drawer. Where: `DatapackDetailPanel.tsx:154-174`; `core/ui/styles/drawer.css:73-102`.

- The Drawer's own comment says "fixed head, scrolling body, fixed action bar". `PackActions` is
  rendered inside the scrolling body. A datapack with 18 data types and a settings list pushes
  Import below the fold in a short window.
- `.db-drawer-actions` has its own 18px side padding inside a body that already has 18px. The
  buttons end 18px short of the row rules above them.
- The actions row is about 320px wide. "Save As New Datapack", "Import" and "More" need about
  345px, so on a team datapack in use the row wraps and More drops to a second line, right
  aligned. "Save Changes", "Import", "More" fits.
- The notes under the buttons are right aligned (`data-installer.css:700-706`). "Saved to
  /Users/…/my-luma.zip, with its store settings" is a long, ragged-left paragraph there.

Fix: render the actions as the Drawer's third section, outside the body, so the bar is pinned and
takes the Drawer's padding once. Notes left aligned. On a team datapack, "Save As New" (the
dialog's own short form) keeps one line.

### 2.3 Uninstall runs on a spinner, in a different box from its question (medium)

Layout: Progress. Still as map 2.11 found it: `DI/ui/components/ImportDatapackModalBody.tsx:200-203,269-293`.
The question is medium, the run is small with one spinner for about three minutes, the result is
small. The import beside it shows named steps with counts in one box from start to end.

Fix: draw Uninstall on the import's rows: "Save Your Changes", then "Uninstall My Luma" with its
count line. The window then keeps one width from the question to the end, which also settles 2.1.

### 2.4 The import form (small)

Layout: Form. Where: `ImportForm.tsx`.

- **Rows.** Data types are bare Spectrum `Checkbox` (`:227-238`). The house row is `CheckboxRow`,
  which has the quieter detail line and the reason line. The change counts are a hand-made span
  doing the detail line's job (`:237`, `data-installer.css:418-422`). Use `CheckboxRow` and both
  come free (1.3).
- **Pickers.** Each sits in half the width (`data-installer.css:337-348`) but has no width of its
  own (`ImportForm.tsx:99,114`), so it draws at Spectrum's 192px. At large that leaves about 95px
  of dead space after each; at extra-wide, about 265px. Give each `width="100%"`, or let the two
  sit left at their own width with one gap.
- **Hierarchy.** A first import has no opening sentence. The eye lands on two pickers. A replace
  has one. One `LeadText` on every path (1.5) gives the form the same first line each time.
- **Width.** 13 or more data types make the form 980px (`importModalView.ts:266-270`), and the
  run then draws two columns of short lines in that 980px box (`:289-291`). Likely a lot of empty
  width. Needs a screenshot.

### 2.5 The card's tag probably drops to a second line on every Data Installer card (small)

Layout: the house card. Where: `DatapackCard.tsx:160-178`; `DI/ui/styles/datapack.css:164-177`.

The version line holds the picker and the tags, and wraps. The picker has no width, so 192px. At
three columns a card has about 266px inside. "Data Installer" needs about 100px, and "Mine" plus
"Community" about 135px. Neither fits beside 192px. Data Installer cards are the ones with named
versions, so they are the ones with pickers. The comment's aim, "the tags sit in one place on
every card in a row", then fails for the common card.

Fix: a quiet picker at its content's width (`isQuiet`, or a width token near 130px). Needs a
screenshot first.

### 2.6 Four date formats on one screen (small)

| Where | Form | Source |
|---|---|---|
| Card, flyout title, steps, Version History | "Nov 9, 1:56 PM" | `packVersions.ts:38-43` |
| Card's dot, picker's second line | "Nov 9" | `projectPackNewer.ts:61-64` |
| Flyout's "Updated" row | "11/9/2026" | `DatapackDetailPanel.tsx:341-344` |
| Activity row | "11/9/2026, 1:56:04 PM" | `DI/ui/views/DatapackActivityView.tsx:343-346` |

For a save, the flyout shows its time in the title and the same moment again in "Updated", in
another form. Fix: one formatter for a date and one for a date with time, both in `packVersions.ts`.
Drop the "Updated" row for a save.

### 2.7 The Activity tab (small)

Layout: a screen list. Where: `DatapackActivityView.tsx:310-328`; `data-installer.css:240-246`.

Much of map 2.2 is fixed. What is left:

- The tags are capitals: `text-transform: uppercase` on "Import", "Failed", "Demo Builder".
  `dialog-design.md:116` says a label is "never capitals".
- "Failed" is the same grey as "Import". A failed run does not stand out in a list whose purpose
  is "did my import work". The house mark is `StatusIcon` or a red note line.
- Each row is a bordered, rounded box (`data-installer.css:188-195`). The integration flyout and
  every run list use hairlines between rows. Boxes make a log look like cards to press.
- The header has a picker with no label and "50 of 212" with no noun
  (`DatapackActivityView.tsx:209-220`). The catalog beside it says "Show" and "12 datapacks".
- "11 data types" on every row tells an SC nothing they act on.

Fix: hairline rows; the operation and outcome as plain words in sentence position ("Import
failed", red); "Show" before the picker; "50 of 212 runs".

### 2.8 Save Changes is one sentence in a large dialog (small)

Layout: Confirm. Where: `DI/ui/components/create-flow/DatapackFlowDialog.tsx:55-60`. Every stage
that is not a result is large (640px), so Save Changes shows one line of text in it. It is large
because its footer has four buttons: "Add Unused Items" apart, then "Cancel", "Save As New",
"Save".

The dialog then goes to 980px for Add Unused Items and back to 640px.

Fix: medium. "Add Unused Items" becomes a quiet link under the sentence ("Add unused items…"), not
a footer button. Three buttons fit at medium, and the sentence gets its second line (1.11).

### 2.9 Load from File draws its text with its own classes (small)

Layout: Form. Where: `LoadDatapackFileModal.tsx:218-225`. The opening line is
`.datapack-export-intro` (grey-700) and the settings line `.datapack-export-note` (the VS Code
description colour), where every other datapack dialog uses `LeadText` and `dialog-note`. The
settings note lists every raw path in one muted paragraph (1.8).

The form is otherwise the right shape: one sentence, one box, Load. The result is the house
Result.

Fix: `LeadText` for the opening line, and a count for the settings.

### 2.10 The Admin step dialog is medium; the Guide layout is large (small)

Layout: Guide. Where: `DI/ui/components/PackSetupStepDialog.tsx:72` gives `Modal` no size, so
medium (480px). `dialog-design.md:39` lists Guide as large, and the setup guide it copies is large
and wide (`features/dashboard/ui/components/integrations/SetupGuideModal.tsx:175-176`), leaving
its step about 700px. Here the Where breadcrumbs and the copy pills get about 430px. A path like
"Stores > Settings > Configuration > Catalog > Catalog" will wrap.

Fix: `size="L"`. Needs a screenshot to confirm the wrap.

### 2.11 The flyout's rows (small)

Where: `core/ui/styles/integration-cards.css:217-239`; `DatapackDetailPanel.tsx:260-297`.

- The label column is 88px at 12px. "Declared, Not Stored" needs about 115px and wraps to two
  lines. "Empty Data Types" still wraps; "Empty Types" fits.
- Labels centre against their value's full height. Beside a "Data" value of 18 chips on four
  lines, "Data" floats at mid-height. Beside a paragraph of description, so does "Description".
  That rule was made for the integration flyout's short values. Top alignment reads better for
  the two tall rows here.
- "Also Sets" draws each setting as a chip with a raw path and value. Paths are long and have no
  spaces. Each chip will run the row's full width and break mid-word.

### 2.12 The header band (small, needs a screenshot)

Layout: the house `SearchHeader`. Where: `DI/ui/components/CatalogCountRow.tsx:23-29`.

The count row holds the count, then one Spectrum `Flex` with "Show", a 192px picker, up to three
labelled quiet buttons and a divider. That is about 700px in one `Flex`. The root CLAUDE.md and
the `spectrum-webview-ui` skill both record that Spectrum `Flex` holds its width near 450px. If
that applies here, the buttons are squeezed or overflow. `SearchHeader`'s own comment records that
this exact row once had its labels cut. I could not see it.

In a narrow editor the whole group wraps under the count as one block, which is fine. Below about
700px nothing inside the `Flex` can wrap.

Fix if it shows: a plain `div` with `display: flex; flex-wrap: wrap`, as the skill says.

### 2.13 Clear Demo Data (small)

Layout: Form, large. Right for a tree and a two-column list.

- Before any tick, the lower half is one plain `Text` line ("Select a store to preview what will
  be cleared.", `ClearDemoDataModal.tsx:68`), not a `dialog-note`. With the project's store
  ticked on open (1.2) this state goes.
- While a check runs, a small spinner sits at the left where the list will land
  (`:61-66`). The list then replaces it and the dialog grows by many rows. The dialog rules allow
  that for a re-check, and it is pinned at the top. A spinner centred in the list's last height
  would move less.
- "Not Removed" is the label of several rows in a row (`clearDemoDataWords.ts:132`). One "Not
  Removed" row with a line per kind reads as a group.
- "Website Settings" has a 30-word value (`:108-111`). It is the longest thing in the list and
  the least important.

### 2.14 Version History (small)

Layout: Form, small. Right size. "(in use)" is grey text run into the radio's label
(`VersionHistoryDialog.tsx:84`). The house mark for a fact about a row is Spectrum's grey badge,
as the card's tags are (map 2.20). The in-use row can be chosen, and then Restore Version just
stays off. Disable that radio instead.

### 2.15 The import run against the approved mockup (check, small)

Layout: Progress, as steps. The structure matches `mockup-v2.html`: bold step titles, small muted
lines, dense data types in columns, room held for the working row's second line, the clock under
the steps.

One difference to look at: the shared rule greys a finished row's name
(`core/ui/styles/work-row.css:49-51`), so each finished step's bold title turns grey. The mockup
keeps finished titles bright (frames 4 to 9). On an ending with a problem, the grey titles may
make the whole window look switched off around one orange line. That may be wanted. It needs a
screenshot and the owner's eye.

### 2.16 Unused styles (small, tidy)

`data-installer.css` still has the rules for a target block the import form no longer draws:
`.datapack-import-target`, `-name`, `-id`, `-warning` (`:446-481`), `.datapack-row-instance`
(`:233-237`), and an empty `@layer theme {}` (`:369-370`). No source file uses these classes
(checked across all 1,708 `.ts` and `.tsx` files under `src/`, with a control). The module comment
in `DatapackDetailPanel.tsx:10-12` and `data-installer.css:107-108` says the row classes live in
`utilities.css`; they live in `integration-cards.css`, which this bundle does import.

## 3. Clear and good, keep

**Flows an SC would follow without help:**

- **Share and Stop Sharing.** One question, one sentence that says who sees it and where, a wait
  that says what it is doing, and the card's tag changes.
- **Delete Datapack.** "Permanently deletes it and its version history." The flyout closes and
  the card goes at once.
- **Rename.** In place, on the name.
- **Save as File.** The system's own save dialog, then where it went.
- **The replace question.** "Save Your Changes First?", the changes listed by data type with
  names, the button that loses them set apart. An SC knows what each button does before pressing.
- **The import's run and endings.** Steps named for what they do, the working data type's own
  line, a clean end that is just "My Luma Imported" and what is left to know, a problem that stays
  on the step it is about. This is the best surface here.
- **Save As New's result.** "Saved as Acme Test. Scratch 1028 now uses it." It says the choice
  that was made for the SC.

No flow from entry to end is free of findings except those. The rest are clear in the middle and
unclear at the door (1.1, 1.3, 1.16) or at the end (1.11, 1.12).

**Layouts that are right:**

- The page shell: `PageHeader`, tabs on a rule, the sticky band, the 960px column. It matches
  Projects and Integrations.
- The card: fixed art band, name, one last line. Equal heights by construction.
- Every wait uses the house three rows, with words from one table.
- Every result is the house Result: outcome in the title with its icon, then only what is left.
- Create Datapack's two panes: kinds on the left with "3 selected" and "None available", items
  on the right, one height so nothing moves, the note under the list.
- Clear Demo Data's preview as a `FactList`, and its button that counts: "Clear 12 Items".
- The store tree: websites over stores, a locked store saying which project claims it.
- Every class these components use exists in a stylesheet the bundle loads (87 of 87, checked
  with a control).

## 4. What I could not check

I cannot see a rendered webview. Each of these needs a screenshot, populated, at the usual editor
width and at a narrow one.

| # | Question | What to capture |
|---|---|---|
| 1 | Do Uninstall's three buttons wrap at medium? (2.1) | More, Uninstall on a datapack with changes: once on the SC's own, once on a team datapack |
| 2 | Do the flyout's buttons wrap, and do they scroll out of view? (2.2) | The flyout of a team datapack in use; then a datapack with 15 or more data types and a settings layer, in a short window |
| 3 | Does the tag drop under the picker? (2.5) | The grid at three columns with Data Installer datapacks and one "Mine" plus "Community" |
| 4 | Is the header row squeezed or cut? (2.12) | The Datapacks screen with "Save As New Datapack" in the header, at 960px and at about 700px |
| 5 | How wide are the two pickers in their halves? (2.4) | The import form at medium, large and extra-wide |
| 6 | Two columns of data types in a 980px box (2.4) | The run of a datapack with 13 or more data types |
| 7 | Do finished step titles go grey, and how does a problem ending read? (2.15) | Frames 4, 7 and 9 of `mockup-v2.html` beside the real window |
| 8 | Does the Admin step's path wrap at medium? (2.10) | Show Step on a datapack with a step left |
| 9 | "Declared, Not Stored", a tall "Data" row and a long "Also Sets" (2.11) | The flyout of a datapack with a settings layer of ten or more paths |
| 10 | The saved file's path, right aligned under the buttons (2.2) | Save as File to a deep folder |
| 11 | Clear Demo Data from empty, to spinner, to list (2.13) | Three frames, ticking one store |
| 12 | The Activity row at a narrow width, with one failed run (2.7) | A project with one Save, one Import and one failure |
| 13 | Save Changes at large with one sentence (2.8) | The dialog as it opens |
| 14 | What a backgrounded import shows at its end, and for how long (1.12) | Run in Background, then wait for the end |

Read from the code and not reproduced on a store:

- A failed install at creation leaves the card's check on (1.4).
- Unticking a data type on a replace leaves the demo without it (1.14).
- Importing the same version again overwrites the SC's edits to the datapack's own rows (1.5).
  The counts are what the preview says the import would do.

Not read in full: `OperationProgressModal`'s row drawing for a save, `BatchDeleteQuestions.tsx`,
the ACO stages (held back, unreachable), `RecordedPackNotice` in the wizard, and the agent consent
text (the map's 1.18 covers it).
