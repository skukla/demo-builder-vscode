# Datapacks: consolidate and simplify

Owner, 2026-11-10: "there's a lot of room for consolidation and simplification of what we've built."

Three reviews of the datapack flows found the same thing from three sides: the pieces work, but an
SC meets too many words for one action, too many windows for one kind of job, and too much to look
after. This plan puts those findings in one order.

Sources (each finding below cites its report and number):

- **Flow** = `.rptc/research/datapack-flow-review/research.md` (18 flows mapped, 21 improvements;
  nine already fixed, listed at its end)
- **Versions** = `.rptc/research/datapack-versions-and-wording/research.md` (Part A versions, Part B
  about 110 wording finds)
- **Clarity** = `.rptc/research/datapack-clarity-and-layout/research.md` (21 confusions, 16 layout items)

## What "done" looks like for the SC

- One word for each action, the same on every button, window, result and agent prompt.
- Nothing to maintain: no list of versions, no second thing called store configuration.
- Every long job (install, uninstall, save) runs in the same window and ends the same way.
- The screen says what state the demo is in and how to put its data back.
- No action loses the SC's Commerce changes without asking first.

## Rules for every phase

- A phase that changes a screen starts with a mockup the owner approves. Wording-only phases start
  with a before and after table.
- A phase that touches the engine ends with the live cycle on the test store (install, install
  again with nothing sent, uninstall), with the owner's go.
- Each phase ends on a green `gate`, then a commit the owner approves. One phase, one commit.
- New words follow `docs/development/sop/dialog-design.md` and the rejected examples in Versions
  Part B. A wait has no second line unless it adds a fact.

## Decided (owner, 2026-11-10)

| # | Decision |
|---|---|
| D1 | Putting a datapack into Commerce is **Install**; taking it out is **Uninstall**. "Import" goes |
| D2 | A zip into and out of My Datapacks: **Add from File / Save as File** |
| D3 | **No versions the SC picks, and no date used as a name** (owner, changed 2026-11-10 after the Phase 0 walk: picking by date confused, and a restore left the demo on the older date while the newer one sat unused). The SC's datapack is always its latest save. **Save Changes** replaces it; **Undo Last Save** goes back one save and installs it, losing any unsaved Commerce changes after asking; **Restore My Luma** puts Commerce back to the latest save (owner, 2026-11-10: a restore, not an install). Version History, Restore Version and choosing a date go. A date may show as information only ("Saved today, 8:38 AM"). Storage keeps two saves (Versions A.4, Model 1; owner confirmed 2-saves 2026-11-10). Trade-off accepted: no going back further than one save; Save As New Datapack keeps a state for good |
| D4 | A save made without asking may push out the last save made by hand, for now |
| D5 | **Clear Demo Data empties the demo's stores, datapack included.** The name stays. Today it removes only what Demo Builder did not install, which no name makes clear without knowing the mechanism. Clearing only the hand-added data while keeping the datapack is no longer one step: clear, then install again. A "Keep My Luma" box can bring it back if it is missed |
| D6 | **Dry Run** keeps its name; its results are "Dry Run Passed", "Dry Run Found a Problem" and "Dry Run Failed". The result names the datapack and says nothing was written, and a pass offers Install. (Owner, 2026-11-10: Phase 1 first renamed it "Check First", then reversed that because SCs know "Dry Run". The same day "Store Settings" became **Store Configuration**, matching Commerce Admin's Stores > Configuration.) |
| D7 | The agent tools lose the Data Installer destination, which fails for our accounts |

## Phases

### Phase 0: land what is built (no new work)

About 300 changed files are uncommitted and not live-checked: the import steps, the shared
Commerce read, the small endings, and two rounds of review fixes.

1. Restart the window (owner's go).
2. Live cycle on the test store: change a product, restore a version with Save and Install; install
   the same version again (nothing sent); uninstall (Commerce empty). Read the logs for the time the
   shared read saves.
3. Owner's screenshots: steps mid-install, the save window, a wrapped red note, the three small
   endings, the Activity tab, Load from File, Clear Demo Data.
4. Fix what the walk finds. Commit.

### Phase 1: one set of words (small to medium, wording only)

Every later phase touches strings, so the words go first.

- Apply D1 and D2 everywhere: buttons, titles, steps, results, errors, agent consent and tool text.
- Apply the wording finds (Versions Part B): most waits lose their second line; fragments,
  inside-view lines and unasked reassurance go.
- One name, "Store Configuration", treated as part of the datapack in every sentence. No hidden id on
  screen (Clarity 1.8).
- D6: Dry Run's name and its three result titles (Flow 2.14, Clarity 1.20).
- The leftovers: Flow 2.13 (wizard step), 2.16 (flyout words), 2.20 (small words), Clarity 1.21.
- Consolidate: each repeated phrase lives in one module, imported where it is used
  (`uninstallWords.ts` is the start; Flow 2.1 left sentences edited in place).
- Make it stick: see "The convention system" below (the checkable words become a convention with
  an enforcer; the owner's rejected examples go in the SOP).

### Phase 1b: every window meets the modal standard (large, the whole extension, in beta.153)

Two audits on 2026-11-10: `.rptc/research/datapack-modal-audit/research.md` (13 of 63 datapack
modal states meet the standard) and `.rptc/research/modal-conventions-audit/research.md` (38
windows and 31 progress operations, the whole extension). The owner decided three conventions from
the second, now written into `docs/development/sop/dialog-design.md`:

| Convention | Rule | What changes |
|---|---|---|
| Size | A Confirm and a Result are small everywhere; the progress window is small from start to finish unless it shows rows; no window changes size between its wait and its result | The shared progress window (all 31 operations) and about five other states. One screenshot to confirm the three wait lines fit at 400px |
| Closing itself | A clean result that is its title alone closes itself after a glance, in every window; anything to read stays | Four results: Updates Applied, Projects Reset, Projects Deleted, a clean install with nothing to say |
| Titles | Form: "Install My Luma". Running: "Installing My Luma" (the title changes when the run starts). Done: the thing, then what happened. Failed: "Couldn't …" | Five running titles and eleven failure titles ("Import Stopped", "Dry Run Failed", "Export Failed", "Project Setup Failed" and the rest), plus three done titles with odd word order |

**Scope for beta.153** (owner, 2026-11-10, changed the same day): **all of the modal work is in
the release.** Build the five layout components and the enforcer, then move every window in the
extension onto them: the 24 built on `Modal`, the shared progress window with its 31 operations, and
the two field-help dialogs that use Spectrum directly (the 11 confirms already use
`ConfirmActionDialog`). The enforcer's ledger ends the phase empty (owner, 2026-11-10): a window no layout fits gets a
new layout, and the new layout is itself a convention with the enforcer, so nothing drifts. Order: the shared progress window first (most operations), then the
datapack windows, then the rest by feature (Updates and the batch runs, Manage APIs, Add ERP and
Assign Products, Add a Demo Package, Add Integration, site access, prompts). Each feature's windows
move in their own commit. Owner, 2026-11-10: the order stands; no "before" screenshots from the owner.
The `webview-visual-baseline` fingerprint is taken before each feature and compared after it, and
only its diff is read; the owner screenshots the "after" only for a window whose diff is not the
intended change.

**First, the five layout components and their enforcer** (see "The convention system"): the
spacing, hierarchy, size and button rules stop being things a window can get wrong.

Then the datapack audit's fixes, each to the standard, by moving each window onto its layout
component:

- Spacing: the fourteen feature rules that duplicate or differ from a house class go; every lead,
  list and button row is spaced by `dialog-stack` and its siblings (the 32px and 24px gaps become 16).
- Hierarchy: the four dialogs that draw their lead and notes in their own classes use `LeadText`,
  `dialog-line` and `dialog-note`.
- Success: one shape for every clean result. No body that repeats its title ("Saved a new version
  of My Luma." goes), no id, no "Took …", no store codes under Clear Demo Data's title.
- A failed run offers the same help in every window: Retry while a retry can work, then Fix with AI.

Also decided (owner, 2026-11-10):

| Question | Decision |
|---|---|
| Close or Cancel | Cancel beside a button that commits; Close otherwise |
| The button that loses the SC's changes | Outline, in every window |
| Bold step titles | A fifth kind of text in the standard, drawn by `WorkRow`, for every window that shows steps |
| Text against the box (audit option C) | `.lead-text` and `.dialog-line` stop at about 60 characters a line, in every window. A window whose body is only sentences draws its lead at 16px; lists, forms and rows stay 14px. A sixth text size, stated in the standard |
| Button weight | Spectrum's default (bold), not a house choice. `.modal-button` follows Spectrum rather than setting its own weight; the larger lead, not a lighter button, puts the sentence ahead of the buttons |

Each rule above lands as a registered convention with its enforcer: see "The convention system" below.

**Progress-label verbs (owner, 2026-11-10: a convention, the whole extension, in this phase).**
One verb per action, the host system's own word for it:

| Verb | Means | Example |
|---|---|---|
| Delete | The record is gone (Commerce, Adobe Console, GitHub, DA.live, local files) | Deleting the workspace |
| Remove … from … | It still exists; only its link to that place goes. Always says "from" what | Removing products from websites |
| Uninstall | Out of Commerce | Uninstalling from Commerce |
| Undeploy | Off App Builder Runtime | Undeploying the app |
| Unpublish | Off the live site (AEM's word) | Unpublishing pages |
| Restore default configuration | Commerce configuration set back to its Default value | Restoring default configuration |
| Close | Orders and returns | Closing orders |
| Restore | Commerce put back to how the datapack's latest save left it | Restoring My Luma |
| Replace | One datapack uninstalled, another installed (all or nothing) | Replace My Luma with Bodea? |

**Clear** is an action name, not a step verb (owner, 2026-11-10): it names buttons and titles
only (Clear Demo Data, Clear Commerce Instance); their steps use the verbs above. "Clearing …" as
a step label still fails.

- Commerce nouns: "cart price rules", "configuration", "websites"; never "cart rules", "config",
  "site settings".
- Every stage table moves to it: `operationStages`, `waitStages`, `adobeProjectStages`,
  `creationStages`, `storefrontStages`, `resetStages`, `datapackStages` (Removing the workspace /
  project files / components / event setup → Deleting …; Taking the app down → Undeploying the app;
  Taking pages off the site → Unpublishing pages; Removing from Commerce → Uninstalling from
  Commerce; each "Clearing …" gets its real verb).
- Labels stand alone, no second line. The fixed 25-character cap becomes: title + label fit the
  background notification (about 62 characters), checked per operation; the longest label is
  screenshot-checked in the 400px window.
- Handbook convention + SOP enforcer: a destructive label's first word comes from the list; "Taking",
  "Clearing", "Unlisting" fail; "Removing" without "from" fails. Registered in `toolingRegistry.ts`.

### Phase 2: versions the SC never manages (medium, mockup first)

- The SC's datapack is its latest save. The card and flyout name it ("My Luma"); a date shows only
  as information, never as something to pick. Delete `VersionHistoryDialog.tsx`, the version picker
  on the SC's own card, and every "the version from <date>" sentence ("Install the Version from Nov
  9, 9:15 AM" becomes "Install My Luma").
- More menu: **Undo Last Save**, shown only when there is a save to go back to. It asks
  ("Undo Last Save?", "Commerce goes back to My Luma as it was before your last save. Anything you
  changed since is lost."), deletes the newest save, then installs the one before it straight away
  (owner, 2026-11-10: Commerce follows the undo, no separate Restore) through the
  same steps window (Uninstall, Install, Verify). No "Save Your Changes First?" on this path: saving
  would make a new save that the undo then removes.
- **Restore <name>** on the datapack the demo uses (Phase 5's label) puts Commerce back to the latest
  save; it asks "Save Your Changes First?" when there are changes (Phase 3).
- Storage: after each successful save, keep the newest save and the one before it; delete older saves
  with their store configuration. Never touch a named version (`main`) or a save another project on this
  machine uses.
- Fix in the same change, or trimming takes a shared datapack from colleagues:
  - a save of a shared datapack stays shared;
  - a project naming a save that is gone uses the same datapack's newest save;
  - deleting the save in use (an agent can) no longer strands the project.
- Results stop naming Version History or dates: "Your changes were saved to My Luma."
- Agents: `save_store_changes_to_pack` says saves replace and one undo is kept; a new or existing tool
  does Undo Last Save; `start_datapack_import` with a version is no longer the restore. The generated
  `import-datapack` skill says the same. `AI_CONTEXT_VERSION` goes up once, after the last phase is
  built, not here (owner, 2026-11-10; `ai-context-authoring`).
- Ends with the live cycle, including an Undo Last Save.

### Phase 3: never lose changes without asking (small to medium)

- **Nothing to do ends at the check** (owner, 2026-11-10, Phase 0 walk step 2). Installing the
  datapack the demo already uses, with Commerce matching it, took five screens: a minute's check, a
  form of "No changes", Import, a run whose steps all turned green as "Installed", and "My Luma
  Imported", while nothing was written. The run and its result claimed work that did not happen.
  Now: when the check finds nothing to add, update or remove, the window ends there on the small
  result "My Luma Is Up to Date", which closes itself; no form, no run, nothing sent. When it finds
  something, the list of changes and Install run as today. A run that writes nothing never says
  "Installed" or "Imported".

- Installing the same version again asks "Save Your Changes First?" when there are changes, as
  installing another version does (Clarity 1.5). This is the never-overwrite rule.
- A replace locks its data types ticked: unticking one today leaves the demo with neither
  datapack's rows of that type (Clarity 1.14, to confirm by a test first).
- A first install opens with every data type ticked; a locked row says why (`CheckboxRow`'s reason
  line) (Clarity 1.3).
- "Always Save Without Asking" gets a way back on screen (Flow 2.18).
  Owner, 2026-11-10: items 1, 2, 4 agreed. Fact found: it is ALREADY the VS Code setting
  `demoBuilder.dataInstaller.changesOnRemoval` (package.json:350), and once on, the
  "Save Your Changes First?" window never shows, so a way back inside that window cannot work.
  Open: the on-screen way back, the checkbox wording, and the setting's stale description
  ("pack", "version", "Always do this, and stop asking").
  Settled 2026-11-10: item 3 locked, all or nothing (owner: "data should not be mixed").
  Item 5: reuse the house pattern `showOneTimeTip` (projectDeletionService.ts:193,
  createProject.ts:387): the first time the box is ticked, a one-time VS Code notification
  "Tip: You can change this in Settings → Demo Builder" with Open Settings, filtered to
  `demoBuilder.dataInstaller.changesOnRemoval`. No modal line, no menu item. Checkbox wording
  "Always Save Changes" (owner confirmed 2026-11-10: names the behaviour like an app preference; "First" is already the window title's word, "Without Asking" is the effect; "Don't Ask Again" rejected because the setting only remembers Save, never Don't Save); setting description rewritten to the glossary.
- Confirm by a test, then fix or drop: "Selected data types apply to Import only." in an Uninstall
  window (Flow 2.21).

### Phase 4: one way to run and end a long job (small to medium, mockup first)

The duplication check ran on 2026-11-10 (`architecture-duplication-scan`, both sides of each lead
read). Verdict: the five windows are **not** one component. They already share their parts
(`WorkRow`, `WorkRowColumns`, `useRunClock`, `Modal`), and three of them do different jobs: Updates
groups rows by project and asks questions inside a row; the batch times each project; the save is
the shared progress window every operation uses. Merging the windows would invent an abstraction.

Owner, 2026-11-10: items 1 (one rule for ending small) and 3 (uninstall drawn as steps) agreed.

What is decided more than once, and gets one home:

| One fact | Decided in | Change |
|---|---|---|
| Does this run end on the small result? | `importResult.ts` `runResult`; `UpdatesModal.tsx` `endedClean`; `ProjectsBatchModal.tsx` `endedClean`; `OperationProgressBody.tsx` `endsSmall` | One rule in `core/ui`: a run ends small when it succeeded, has no warning, and no row has a problem or a note. Each window hands it its rows. A contract test fails all four if the rule changes |
| The four disagree today | The save's rule looks only at `warning`, not at a row's problem line; the others also look at rows | To confirm by a test: a save with a problem on one row and no warning would end small and hide it. Fixed by the shared rule |
| What sits under a run's rows: the clock while it runs, then the lines left to know and "Took …" | `ImportRunView.tsx` `EndFoot`/`RunningFoot`; `OperationProgressBody.tsx` `EndView`/`RunningRows`; `ProjectsBatchRunView.tsx`; `DatapackResultBody.tsx` | One `RunFoot` component in `core/ui/components/feedback`, used by all four |
| A datapack job shown as steps | Install: `ImportRunView` + `importSteps.ts`. Uninstall on its own: a spinner, `WatchProgress` in `ImportDatapackModalBody.tsx` | The same job, drawn twice. Uninstall uses `ImportRunView` with the steps that apply (Save Your Changes, Uninstall); `WatchProgress` is deleted (Flow 2.11, Clarity 2.3) |

Also in this phase:

- Uninstall's question keeps its three buttons on one line (Clarity 2.1; owner agreed 2026-11-10).
- Dry Run endings use the install's ending buttons (owner, 2026-11-10):
  - Dry Run Found a Problem (amber): Close · Back · **Fix with AI** (accent, last, the same hint
    as the install's). The extension records the dry run's answer (datapack, version, reason) and
    builds the prompt from that record, never from the window, as `importFixHandlers.ts` does. The
    prompt asks the AI to fix the datapack (save_datapack_zip, correct the rows, load_datapack_zip),
    run validate_datapack_import again and report; it never installs without asking.
  - Dry Run Failed (red, the check could not run): Close · Back · **Retry**, as Install Stopped.
  - The agent surface: validate_datapack_import's refusal names the same reason, so an agent
    reaches the same fix without the button.
- "Took …" (owner agreed 2026-11-10): `RunFoot` makes the one `tookValue` call, so the
  one-minute rule and the wording have one home. It looks as it does today in all four run windows:
  the last line of the body, the house's quiet `dialog-note` (12px, grey), "Took 3 minutes, 12
  seconds", only for runs of a minute or more. Fix the stale "labelled Took row" comment in
  `useRunClock.ts`.
  Mockup approved 2026-11-10: shown only when the window stays open (a row has a warning or
  problem, or the run failed, above Retry / Fix with AI); a clean run ends small with no Took.
  Kept because every run window in the extension already shows it.
- A run sent to the background (Clarity 1.12; owner 2026-11-10), for every job that offers Run in
  Background, since the code is shared:
  - Succeeded: closes on its own, as today, in the result's own words ("Installed My Luma", not
    "— done"). No button: there is nothing to do.
  - Failed, or ended with something to know (a warning, a skipped row): a notification that stays
    until dismissed, in the result's own words, with ONE button that leads to what happened. Which
    one depends on the job; the default is Open Debug Logs (today's). Owner, 2026-11-10: no Show
    Details; a failure keeps one button. Becomes a convention: success goes quietly, a problem
    stays and offers a way in.

### Phase 5: the screen says what state the demo is in (medium, mockup first)

Owner settled all items 2026-11-10 (mockups walked one per item).

- Installed = the blue check and blue border, nothing else; no status line, no dot for "chosen".
  The screen has no chosen state: clicking a card opens its flyout. Installing another pack asks
  "Replace My Luma with Bodea?" / "Uninstalls My Luma from Commerce, then installs Bodea." (button
  Replace; stages Uninstalling from Commerce, Installing Bodea); the check moves after (Clarity 1.4).
- On the datapack the demo uses, the button reads **Restore My Luma**: "Restore My Luma?" /
  "Commerce goes back to My Luma as you last saved it. Anything you changed since is lost.",
  Cancel / Save Changes First / Restore; label Restoring My Luma. Restore joins the verb table
  (Clarity 1.1).
- The amber dot's hover: "My Luma has changes saved after this demo installed it. Restore My Luma
  to install them." (Clarity 1.9).
- Save Changes says what it saved, by data type, in the question's own form (Clarity 1.11).
  Collapsed lists stay informational: name a few, "and N more", full list in Debug Logs; registered
  as a convention.
- The header's save button names the datapack; Create Datapack stays reachable (Clarity 1.16;
  revisited in Phase 7b).
- An open Admin step: keep today's flyout Demo Setup line + step dialog (the integrations setup
  guide pattern); the card stays clean; check the line's wording only (Clarity 1.18).
- No "Not installed yet" state. Dashboard line shows the installed pack's name, else None.
- A failed install is an error state on the pack, shown exactly as integration cards show one: the
  shared `StatusDot` (error) + label from `statusVocabulary.ts` (new entry "Install failed"), no
  border change (owner, 2026-11-10). As on integration cards (status error + Retry;
  flyout shows the reason, as `deriveInstallation` does): the creation-time install records its
  failure on the project, the card shows it, the flyout says why and offers **Retry** (the extension's label for redoing a failed
  operation: integration menu, progress window, data installer failure). Finish Install is not used:
  integrations keep it for a deployed app whose Commerce step alone failed. The dashboard Datapacks
  line shows the failure as the dashboard's linked integrations do: the error dot + "My Luma (install
  failed)" (`LinkedSection.tsx:45-55`) (owner, 2026-11-10).
  The failed state also offers **Fix with AI**, reusing the import window's rule
  (`useImportRetry.ts`, `importResult.ts` `RETRIES_BEFORE_FIX`, `importFixHandlers.ts`): Retry while a
  retry can get past the stop, Fix with AI once it cannot or retries have not helped. The SC is not
  expected to fix a failed install alone (owner, 2026-11-10).

### Phase 6: reset, delete and Clear Demo Data (medium to large, mockup first)

- Clear Demo Data empties the demo's stores (D5). It opens with the project's own store ticked.
  Lead: "Permanently removes everything in this demo's stores and closes their orders." When the
  datapack's data has changes, it asks "Save Your Changes First?" as Uninstall does. It uninstalls
  the datapack through the engine's own removal (its install record), then clears the rest
  (`demoDataWipe/wipeRun.ts` today refuses anything an install record lists). Reset's third
  question and the `clear_demo_data` / `check_demo_data` tools say the same. An engine change: it
  ends with the live cycle (Clarity 1.2, layout 2.13).
- One project and several projects ask reset and delete in the same words (Flow 2.19).
- A single reset asks its questions in one window, not three VS Code dialogs in a row (Flow 2.19).

Owner walk, 2026-11-10:
- Items 1 and 2 agreed: one window, and the same words for one project and for several
  ("Reset Kukla Luma?" / "Reset 3 Projects?", bare-verb buttons, a shared lead). Destructive
  choices start unpicked, so the SC has to choose. The window starts from the existing mockup
  (`mockups/screens.html` Phase 6): one Commerce radio, Restore My Luma / Uninstall My Luma /
  Clear Demo Data / Leave Commerce As It Is, defaulting to Leave. A radio rather than checkboxes,
  because Clear already includes Uninstall.
- Item 3 settled: two clears, split by whose data it is.
  - Scope: a datapack lands on WEBSITES (products, customers, cart rules, stock, website
    prices), plus root categories through stores, store-view text and orders, and global records.
    Data is never "installed to a store", so the SC never picks a store. This reverses the
    2026-10-30 store unit (`datapack-engine/step-10-wipe.md`).
  - Clear Demo Data, for the project: no picker. It clears every website the project uses,
    one or several (ready for multi-site datapacks): what its install records list, whatever
    was added by hand on those websites that no other demo claims, and global records only it
    used. The lead names the websites. Window title "Clear Luma Demo Data?", button
    "Clear N Items". Orders are closed, never deleted. Anything another demo uses is kept.
  - Clear Commerce Instance, a new action: the one place to choose websites. It uses
    `CheckboxRow` rows plus Select All, starting unticked, and each row names the local
    projects using that website as plain text, two names then "and N more" (the collapsed-list
    convention; nothing tappable). A warning gives the count: "N projects lose their demo
    data. This can't be undone." No mention of other computers (Demo Builder is per computer).
    The lead says "whichever project put it there". An unticked "I understand every project on
    these websites loses its data" box enables "Clear N Websites". Each demo's datapack is uninstalled first, and ERP
    orders are closed through the integration. It ignores install-record ownership and lifts
    the `claimedBy` guard (this reverses step-10 lines 53–54 and 88).
  - Where: the Datapacks header's Clear Demo Data button becomes a "Clear" menu with both
    items, like New Project's menu. Also in the Command Palette and as an MCP tool. Not on
    the Projects list, which has no notion of an instance.
  - Verb table: "Clear" means removing everything in a scope. Uninstall removes one pack.

### Phase 7: the Datapacks screen (small to medium, mockup first)

Settled with the owner, 2026-11-10:

- The header, in order of how often an SC does each: **Create Datapack**, then the file action,
  then Clear. The file action is named for what the SC wants on that screen: **Install from File**
  in a project's Datapacks (adds the zip to the library, then opens the same install confirm as a
  card's Install, preview included; Cancel leaves it in the library), **Add from File** in the
  Datapack Library (no store to install into). Today both say "Load from File".
- The flyout's buttons stay pinned (Clarity 2.2); its rows (2.11); the header band (2.12).
- The More menu: Save as File, Version History, **Share Datapack / Stop Sharing Datapack**; then,
  in its own section, Uninstall and Delete Datapack (Clarity 1.7). **Delete Store Configuration is
  removed**, with its confirm and its code (no soft deprecation): an SC changes a setting because
  the demo needs it, and Delete Datapack already takes the settings layer with it, so the undo
  remains.
- One date format, absolute (Clarity 2.6). The card's tag on one line (2.5); an SC's own datapack
  is tagged **Mine**.
- The SC never sees a version: not in the replace title ("Replace My Luma?"), not in the Delete
  confirm (`PackActions.tsx:139` today says "version …").
- The filter says when matches sit under another Show choice (Clarity 1.13); the Show names an SC
  can read (1.17).
- The file action asks about replacing only when the datapack exists (Clarity 1.15); it uses the
  house text classes (2.9).
- The sidebar tile stays **Datapacks** (it fits); the window it opens stays titled Datapack Library
  (Flow 2.17).
- The wizard's Datapacks card says what is in the datapack (Clarity 1.19).
- Delete the unused styles (Clarity 2.16).
- Datapacks the extension owns are **Demo Builder Datapacks** (owner, 2026-11-10, reversing walk
  F86): the Show filter reads "Demo Builder Datapacks" (`catalogShow.ts:46`, and its empty state),
  and the card tag reads **Demo Builder**, not "Team" (`DatapackCard.tsx:297`). No one can delete a
  Demo Builder datapack from the flyout, its owner included: Delete Datapack is hidden on it (today
  `PackActions.tsx:105` shows it to any owner).

### Phase 7b: Create Datapack (medium, walk today's flow first, then mockup)

Added by the owner, 2026-11-10, after walking today's Create Datapack: it shows only what is not
already in the pack, and says so badly, so the SC cannot tell what the pack will hold.

- Rule (convention): an SC can see what a datapack will hold before saving it.
- Audit the save buttons, in the header and in a datapack's flyout: Create Datapack, Save Changes,
  Save As New Datapack, and the dialog's Save As New, which retitles the dialog mid-flow
  (`DatapackFlowDialog.tsx` `frameOf`). Does each still have a job in the flow this plan builds?
- Widened (owner, 2026-11-10): every datapack flyout and dialog, in a project's Datapacks, the
  Library and the wizard, uses one pinned button bar, with the same buttons in the same order.
- The owner sees buttons change in the flyout unexpectedly. Lead to check first: the label and the
  button's presence depend on data that loads after the flyout opens (`useHeldPack.tsx`:
  `saveChanges` waits for `detail`, `saveChangesAsNew` for the pack's owner; the header's for
  `heldInCatalog`), so a button can appear, or change its words, while the SC looks at it.
  Convention to propose: a button's words never change while it is on screen; it waits, disabled,
  until what decides them is known.

Decided (owner, 2026-11-10, walking the save flow step by step):

- **Add Unused Items is removed**, the screen, its link and its picker mode. A save already takes
  everything the demo uses, hand-made records included; something nothing uses does not change
  the demo, and goes in once it is used. No soft deprecation: `list_datapack_export_items`'s
  `unused` and `save_store_changes_to_pack`'s `selections` on a save into an existing pack go too.
- **Save Changes** is: press it, see what the datapack will hold (read-only counts), Save, Saved.
  Nothing to tick, no second screen, a title that never changes.
- **Create Datapack** (no datapack yet) keeps its picker: name, then everything in the project's
  store by kind with Select All Data, Save. After it, the header reads Save Changes.
- The mockups' words were illustrative. The real words for each step go in the wording table, held
  to the conventions, before the build.
- The flyout's Save goes: saving lives in the header only.
- The header's save button: on your own datapack it is a menu button, **Save ▾**, with Save and
  Save As New (reusing the AI tile's menu-button pattern, `AiZone.tsx`; no split button). On
  someone else's datapack it is a plain **Save As New**. The choice is made before any dialog
  opens: Save opens the review dialog (Cancel · Save); Save As New opens its own window with a
  Name field (Cancel · Save). Neither dialog offers the other. This is how an SC branches a
  variant — no Library Duplicate.
- Convention: a button inside a dialog drops the object its title already names (Save, not Save
  Datapack). Buttons on a screen keep verb + object.
- Convention: a button's words never change while it is on screen. Until they are known it shows
  the extension's standard loading state for a button, disabled.
- Convention: one button bar order everywhere: secondary actions, Cancel, main button.
- Create Datapack's picker starts with everything ticked.
- Recovery for a regretted Save is Phase 2's Undo Last Save (already in scope).

Wording rows (owner approved all, 2026-11-10). Done titles are past tense + object, title only:

| Window | Title | Text | Buttons | Step | Done |
|---|---|---|---|---|---|
| Save (own pack) | Save Changes to My Luma | "My Luma will hold:" + read-only counts. Note: "This replaces your last save. Undo Last Save brings it back." | Cancel · Save | Saving My Luma | Saved to My Luma |
| Save As New (own pack) | Save As New Datapack | Name field. "A new datapack of yours with everything this demo has now. This demo then uses it." | Cancel · Save | Saving Luma Holiday | Saved as Luma Holiday |
| Save As New (someone else's) | Save As New Datapack | As above; lead: "Bodea isn't yours, so your changes go into a new datapack of yours." | Cancel · Save | as above | as above |
| Create | Create Datapack | Name field, then "What it holds" by kind, all ticked, Select All Data | Cancel · Create | Creating My Luma | Created My Luma |
| Undo | Undo Last Save? | "Commerce goes back to My Luma as it was before your last save. Anything you changed since is lost." | Cancel · Undo (outline) | Restoring My Luma | Last Save Undone |

Name errors: "You already have a datapack named Luma Holiday." / "Give it a name."

### Phase 8: the agent surface matches the screen (small)

- D7: remove the Data Installer destination from `load_datapack_zip` and
  `copy_library_datapack_to_installer`, or hide both tools behind the same switch as the screen.
- Run `ai-coverage-scan` over the datapack handlers after Phases 1 to 7: every new or renamed
  action has its tool, in the screen's words.
- Remove what Phase 7b removed: `unused` on `list_datapack_export_items`, `selections` on a save
  into an existing pack.
- Add what the screen gained: an Undo Last Save tool (Phase 2); separate settings deletion goes
  wherever Phase 7 removed it from the screen; tool names and descriptions use the screen's words
  (Install from File, Add from File, Save, Save As New, Clear Commerce Instance, Share Datapack).
  Settled 2026-11-10.
- Regenerate the tool docs; sync `docs/systems/mcp-server.md` and `data-installer.md`.

## The convention system

Audited 2026-11-10. How this repo holds a rule, and what that means for this plan.

| Layer | What it is | Where |
|---|---|---|
| The rule | A `> **Convention.**` callout: one thing you can break, why, and the one thing that catches you | `docs/development/handbook.md` (137 stated, 134 enforced) |
| The index | Generated from those callouts; never hand-edited | `docs/development/conventions.md`, `npm run docs:conventions` |
| The enforcer | A suite that fails the build, with a shrink-only ledger for what already breaks the rule | `tests/sop/` |
| The registry | Every enforcer listed; an unlisted suite fails the build, and so does a listed one that is gone | `tests/sop/toolingRegistry.ts` |
| The counts | The handbook's own numbers are checked | `tests/sop/handbook-links.test.ts` |
| The procedure | Worked examples and steps. It holds no rule of its own | `docs/development/sop/dialog-design.md` |
| The agent's copy | A rule that must steer every session is also in `CLAUDE.md`, pinned so the two cannot drift | `tests/sop/claude-md-handbook-agreement.test.ts` |

The handbook's own test: "if it cannot be enforced, it probably shouldn't be a convention." A rule
that needs judgement goes to its Working Discipline section or stays in the SOP as examples.

**What the audit found about this plan's rules.** The six decisions of 2026-11-10 were written
into the SOP only, which is the layer that holds no rule. Nothing checks them, which is how the
datapack windows drifted from the standard in the first place (13 of 63 states meet it). The
handbook also holds one dialog convention marked "Not enforced yet … an audit of every other
window header is under way": that audit is now done (`modal-conventions-audit`, Table C).

**Which of the modal standard's rules are enforced today** (read against every suite in
`tests/sop/` on 2026-11-10). The owner had assumed all of them were.

| Enforced today | By |
|---|---|
| Title Case for what names a thing | `ui-label-case.test.ts` |
| A waiting dialog shows only its wait, with words | `modal-waits.test.ts` |
| A dialog does not jump between sizes | `modal-steady-height.test.ts` |
| One set of status icons | `status-icons.test.ts` |
| No text ends in an ellipsis | `no-trailing-ellipsis.test.ts` |
| Progress stage words: a label of 25, a detail of 40, steps from the stage table | `progress-steps.test.ts`, `progress-wording.test.ts` |
| A failure a person reads is translated | `user-facing-errors.test.ts` |
| Every dialog is hosted; CSS over inline styles | `modal-hosting.test.ts`, `inline-styles.test.ts` |

| Not enforced today (the standard states it, nothing checks it) |
|---|
| Which of the five layouts a dialog is, and the width that goes with it |
| Spacing: 4, 8, 16, 24 |
| Four kinds of text, and which class draws each |
| One rule under the title, hairlines between rows, no boxes |
| Button order, the red dangerous action, never two buttons that do the same thing |
| Status in the title, no status boxes in the body |
| Title forms, and a title that names the thing (the handbook says "Not enforced yet") |
| The body never repeats the title; no bullets; no middle dot; digits; a warning as a word |
| How a run ends, and when a result closes itself |
| The button that loses changes sits apart |
| Text wraps and is never cut; width is a step, never measured |
| An Admin step drawn one way; a problem beside the thing it is about |

About nine rules are checked and about twenty are not. Every datapack finding in the two modal
audits is in the second table.

**How to close it: by construction first, by test second.** Today a dialog is composed by hand
from `Modal` and loose classes, 63 times in the datapack feature alone, so each one can drift.
The confirm shows the other way: `ConfirmActionDialog` owns its size, icon, lines and button order,
nine files use it, and those confirms are the ones that pass. So:

1. **One component per layout** in `core/ui`: Form, Confirm (exists), Progress, Result, Guide. Each
   owns its width, spacing, text classes, button order and how it ends. A caller passes words and
   actions and cannot pass a size or a margin.
2. **One enforcer**: a file outside those five that renders `Modal` directly fails the build, with
   a shrink-only ledger of today's direct uses, emptied within beta.153 as each feature's windows
   move over.
3. **Tests for what a component cannot own**: title forms, on-screen words, one ends-small rule.
4. **Judgement stays judgement**: whether a line reads well, whether it repeats the title. In the
   SOP as the owner's examples, and in each phase's before and after table.

**So this plan includes it.** Each rule lands in the same commit as the code that makes it true:
the handbook callout, the enforcer with its ledger at zero or shrinking, the registry row, the
regenerated index and counts.

| Rule | Phase | Enforcer (new unless named) | Can a check see it? |
|---|---|---|---|
| A window's title takes one form: running "-ing", done names the thing, failed "Couldn't …" | 1b | Extends the header convention already in the handbook, closing its "Not enforced yet": every operation's `title` and `failureTitle`, and each run window's own titles | Yes, from the operation definitions |
| A Confirm and a Result are small; the progress window is small unless it shows rows | 1b | The size each shared component asks for (`ConfirmActionDialog`, the progress window), and a ledger of every `Modal` that asks for more with its reason | Yes for the shared components; a ledger for the rest |
| Nothing left to read closes itself; something to read stays | 1b | One shared hook every run window uses, and a contract test on it | Yes, once it is one hook |
| Whether a run ends on the small result is decided in one place | 4 | A contract test that fails all four windows when the rule changes | Yes |
| Cancel beside a button that commits, Close otherwise; the losing button is outline | 1b | The buttons each `Modal` declares | Partly: Cancel/Close yes; "loses changes" needs a ledger of the few that do |
| On-screen datapack words: "Commerce" not "the store", "datapack" not "pack", a saved version by its date | 1 | A scan of on-screen strings, proved on planted defects as `ui-label-case` is | Yes |
| Each repeated phrase has one home | 1 | None new: `validate:source-duplication` already pins copy-paste | Already checked |
| A wait has no second line unless it adds a fact; words that read poorly | 1 | None. `modal-waits.test.ts` stays as it is | No: judgement. The owner's rejected examples go in the SOP |
| Spacing and text come from the house classes | 1b | Extends `tests/sop/inline-styles.test.ts` or the stylesheet enforcers: a feature rule that sets margin, padding or gap on a house dialog class | Yes, with a ledger |
| Lines stop at about 60 characters; a sentence-only body leads at 16px; buttons keep Spectrum's weight | 1b | The Form, Confirm and Result components own it (the lead size is theirs to pick from what they hold); a stylesheet check that no feature rule sets `max-width`, `font-size` or `font-weight` on `.lead-text`, `.dialog-line` or `.modal-button` | Yes, by construction plus the stylesheet check |

Screenshots owed in Phase 1b's after check (the audit read these from CSS only): which title size
Spectrum draws (18px or 16px), whether the three wait lines fit at 400px, Give Access's long checkbox
label, and three long buttons at medium.

Housekeeping the system needs, once, in Phase 1b: move the three rules written into
`dialog-design.md` on 2026-11-10 up into handbook callouts and leave the SOP the examples; correct
the SOP's own contradictions the audits listed (the wait rule that requires a second line, the
confirm width stated two ways); and if agents must follow a rule while writing UI, add its line to
`CLAUDE.md`'s "Words on screen" with its agreement pin.

## How it runs: a loop (owner, 2026-11-10)

1. **Phase 0 with the owner present**: restart, live cycle, screenshots, commit.
2. **One sitting up front**: the wording before and after table, and the mockups for the screen
   phases (4 to 7), approved together.
3. **The loop** (`unattended-loop` skill) builds phase after phase against what was approved. Each
   finished piece: green `gate`, then a commit to `fix/release-walk-fixes` (the owner authorized
   branch commits for this loop; `Backlog:` trailer, no AI lines). It never pushes, never restarts
   the window, never touches Commerce or any cloud service, and never builds a screen change that has
   no approved mockup. What it cannot settle goes on one "For the owner" list in this file, with a
   recommendation, and it moves on.
4. **When the owner is back**: one restart, one live cycle on the test store, one set of
   screenshots for everything built; then fixes, and the owner's go before any push.

### For the owner

(The loop adds items here.)

### Phase 0 walk, 2026-11-10 (live, test store)

| Step | Result |
|---|---|
| 1. Restore a version with Save and Import | Pass: 2,048 products match, 6 min 19 s. The save took 37 s (48 s before) because it reused the check's read; the post-save read-back went from 6.5 s to 0 |
| 1. The uninstall's decision (36 s) | **No gain.** The plan assumed it could reuse the check's read. It asks Commerce different questions (what each container still holds), which the check never asks for a whole uninstall. A real fix: let the check also decide the uninstall when the action is a replace or uninstall. Phase 4 |
| 2. Install the same version again | Nothing was written (7 s after the check), but **the window claimed it was**: steps green as "Installed" and "My Luma Imported". Five screens for nothing to do. Fix in Phase 3: end at the check with "My Luma Is Up to Date". The install check read 2,048 products in 1.7 s (14.8 s before) |
| 3. Uninstall | Pass: 1 min 13 s (13:57). Afterwards `check_demo_data` on `justrite_test_website` finds 0 of every kind and nothing installed. The check found no changes, so no "Save Your Changes First?" was asked |
| 3. Seen in the screenshots, all already in the plan | The check's wait opens at the wide size, then the confirm and the wait are small (a size change, Phase 1b); "Since this demo's last save" under the wait (Phase 1); the uninstall runs as one spinner, not steps (Phase 4, `WatchProgress`); the result's body is only "Took 1 minute, 13 seconds" and stays open (Phase 1b); after the uninstall the card reads "Saved Nov 10, 8:38 AM" while the flyout still names Nov 9, 9:15 AM (D3, Phase 2) |
| Seen in the screenshots, all already in the plan | Old words ("Import", "Since this demo's last save", "Install the Version from <date>"); a bare-title result that does not close itself and leaves an empty gap above Close (Phase 1b); Close on one check wait and Cancel on another (Phase 1b); the flyout's buttons change while a run is going (Phase 7); four date formats (Phase 7); the window opens on "Reading websites" then jumps to the form (Phase 2: no form on this path) |

## Release

Owner, 2026-11-10: the full datapack feature set goes in the release. **Every phase here is in
beta.153**; the cut waits for Phase 8.

## Order and why

| Phase | Depends on | Why here |
|---|---|---|
| 0 | owner's go | Nothing new should stack on 300 unverified files |
| 1 | 0 | Every later phase would otherwise write words twice |
| 1b | 1 | Brings every window to the standard once, after the words are settled and before screens are rebuilt |
| 2 | 1 | Deletes a dialog that Phases 4, 5 and 7 would otherwise polish |
| 3 | 1 | The one rule-breaking gap; small once the words are settled |
| 4 | 2, 3 | Uninstall's steps reuse the question Phase 3 settles |
| 5, 6, 7 | 1 to 4 | Screen work, each behind its own mockup |
| 8 | all | Checks the agent can do what the screen now does |

## Not in this plan

- Walk tests 1.4 to 1.8, 2.6, 2.8, EDS-71 and the cut steps: they stay in
  `.rptc/plans/beta-153-release-tests/overview.md`.
- The held-back ACO export screens.
