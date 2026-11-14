# Decisions From the Prototype Walk (J1 to J8)

What the owner finally decided while walking the click-through prototype on 2026-11-11 and
2026-11-12. Written from `prototype-feedback.md` only: each bullet cites the step id and the
owner's words from its row. Where a step has several rows, the last one wins; the earlier ones
are listed under "Changed during the walk", not as decisions. Phases are those of `overview.md`.

## Conventions (every window, every phase)

The 21 rules in `prototype-conventions.md` hold for every window the build touches. By number:

| # | Rule |
|---|---|
| 1 | No grey detail lines |
| 2 | No dependency or relationship phrases |
| 3 | Say a fact once |
| 4 | Basic facts, standard words |
| 5 | Cut the qualifier the title or verb already implies |
| 6 | Never explain a control's state |
| 7 | Hide nothing the SC needs; list nothing they don't |
| 8 | The summary is a type table, the same one everywhere |
| 9 | One control per job |
| 10 | Same layout on every variant |
| 11 | Things that line up, line up |
| 12 | A window opens at the size of what it shows |
| 13 | Nothing scrolls for ordinary content |
| 14 | A window never grows once on screen |
| 15 | A run's rows are its steps; a problem is one line on its row, at the end |
| 16 | An ended run's one action sits in the footer beside Close |
| 17 | A clean run ends on the small result, which closes itself |
| 18 | Use the house's colours and markers, never new ones |
| 19 | The spot check only looks (Back only) |
| 20 | Red is for deleting and removing only |
| 21 | A result title puts the thing first; verb first only when it says where something went; a notification uses the title's words |

Decisions that apply across phases:

- A window must not open far larger than its content, and content must not scroll for an ordinary
  amount; a step whose content would grow becomes a new step (J1.1 to J1.3, owner 2026-11-11:
  "Both of these are the worst possible experience.").
- Every spot check (Review Records, in Clear, Install, Switch and Save) has one button, Back, on
  the right; no Cancel, no action (J2-3, owner 2026-11-12: "should only go back to the summary
  and let the summary be the chief action door").
- Red only for deleting and removing (Clear, Uninstall, Delete). Every other main action is the
  standard blue, Undo included (J3-3, owner 2026-11-12: "I think red seems like an error. Too
  strong.").
- An ended run's one fix action sits in the footer beside Close; row buttons only when one window
  has several fixes in different places (J1-3d, owner 2026-11-11: "Agreed. All right, I think we
  can move on.").
- A problem's fix opens the Admin home, "Open Commerce Admin"; the Admin cannot deep link to an
  order (J1-3d Admin deep link, owner 2026-11-11: "I don't think that it deep links to the
  order.").

## Phase 1b: every window meets the modal standard

- The shared progress window keeps one height from first frame to last: its problem line waits
  for the end, takes the room the working row's progress line held, and fits one line; no closing
  sentence under the rows (J1-3d growth, owner 2026-11-11: "Yes").
- `.modal-title` gets `vertical-align: top`, so a status icon does not grow the title row, with a
  visual baseline (J1-3d growth build item).
- `WorkRow`'s warning note is orange, as the dialog rules say, not grey (J1-3d build item).
- "Switch" joins the verb table in place of "Replace": "Switching to Bodea" (J8-1, owner
  2026-11-12: "Replace has the feeling of overcomplication.").
- The undo action is the standard blue "Undo"; the button-colour convention reads "red only for
  deleting and removing" (J3-3, owner 2026-11-12: "Too strong.").

## Phase 2: versions the SC never manages

- "Undo Last Save?", then Commerce goes back through the same run window (J3-3, owner 2026-11-12:
  "Yes"). The button is blue "Undo" (see Conventions).
- A save ends on "Saved to My Luma" (J3-1, owner 2026-11-12: "3-1 is good").

## Phase 3: never lose changes without asking

- Nothing to change ends at the check on "My Luma Is Up to Date", which closes itself (J4-2,
  owner 2026-11-12: "Yes.").
- Install installs the whole datapack: no data-type checkboxes on install or switch, and no line
  says why anything is ticked or locked (J2-1, owner 2026-11-11: "We don't need to tell people
  why things are ticked.").
- The save question comes after the Switch question, not before (J2-3, owner 2026-11-12: "What
  does software actually do? ... Yes").
- "Save Your Changes First?" lists the changes as counts by type, no example names (J2-1 build
  item; replaces Phase 5's "name a few, and N more" for this window).
- Its line reads "Your changes will be lost if you don't save them." (J2-3, owner 2026-11-12:
  "I don't like this language. ... Yes.").
- No "Always Save Changes" box in any save question (Switch, Uninstall, Reset, Delete). Always
  saving is the setting `demoBuilder.dataInstaller.changesOnRemoval` only, its description
  rewritten (J2-3, owner 2026-11-12: "It feels like clutter to me.").
- After the first save question answered, a one-time tip: "Tip: You can customize saving changes
  in Settings → Demo Builder", with "Open Settings", as delete's tip does (J2-3, owner
  2026-11-12: "Yes").

## Phase 4: one way to run and end a long job

- One run window with steps; a clean run ends on the small result (J2-2, owner 2026-11-12:
  "J 2–2 looks good").
- Dry Run results: "Dry Run Passed", "Dry Run Found a Problem" with Fix with AI, "Dry Run Failed"
  with Retry (J2-4, owner 2026-11-12: "J2-4 passes.").
- "Uninstall My Luma?" with what goes; with unsaved changes, "Save Your Changes First?" next,
  three buttons on one line (J5-1, owner 2026-11-12: "J5 is good.").
- Uninstall is drawn as steps, like Install (J5-2, owner 2026-11-12: "J5 is good.").
- A background run that succeeds closes on its own, in the result's own words (J5-3, owner
  2026-11-12: "J5 is good.").
- A background run that fails leaves a notification that stays, with one button (J5-4, owner
  2026-11-12: "J5 is good.").

## Phase 5: the screen says what state the demo is in

- Install's window is the type table: bare counts ("Products 56"), and "53 added, 3 updated" only
  when some records already exist; Review Records for the records (J2-1, owner 2026-11-11: "I
  think the summary is good").
- The card has no Install button; actions live in the flyout (J4-2 row in J2, owner 2026-11-11:
  "Go").
- On the datapack the demo uses, the flyout button reads "Restore My Luma" (J4-2 row in J2, owner
  2026-11-11: "Go").
- One datapack per project in beta.153. Installing another is a switch: flyout "Switch to Bodea",
  question "Switch to Bodea?", button "Switch", with changes "Switch Without Saving" and "Save and
  Switch", run "Switching to Bodea" (J8-1, owner 2026-11-12: "Install makes it sound like more
  than one data packet can be installed at once. ... Yes").
- The Switch question goes straight from the title to the table; no opening line (J2-3, owner
  2026-11-12: "It's kind of obvious.").
- The amber dot's hover: "Newer save available" (J4-1, owner 2026-11-12: "Why not update
  available? ... Yes").
- "Restore My Luma?" / "Commerce goes back to My Luma as you last saved it. Anything you changed
  since is lost.", with "Cancel" and "Restore" only; no Save Changes First (J4-3, owner
  2026-11-12: "Does the user expect the entire experience to cancel ... Yes.").
- Restore asks only when the SC has unsaved edits; a newer save alone runs after the check
  without asking (J4-3, owner 2026-11-12: "What if I want to get back to the beginning state of a
  demo with a data pack installed? ... Yes").
- The restore run, then the result "My Luma Restored" (J4-4, owner 2026-11-12: "Right").
- A failed install: the error dot and "Install failed" on the card, no border change (J6-1, owner
  2026-11-12: "6-1: Right").
- The flyout of a failed install says why it failed and offers Retry (J6-2, owner 2026-11-12:
  "We can keep it for now"; provisional, see Open).
- Once retries have not helped, Fix with AI (J6-3, owner 2026-11-12: "I still think it's right to
  offer it, just in case.").
- The dashboard Datapacks line is the bare name "My Luma" with the error dot; the dot's hover says
  "Install failed"; no reason in brackets (J6-4, owner 2026-11-12: "I don't think we should offer
  a reason in parenthesis next to the Datapack name. The tool tip is a nice touch.").

## Phase 6: reset, delete and Clear Demo Data

Clear:

- The Clear menu has two items, "Clear Demo Data" and "Clear Commerce Instance" (J1-1, owner
  2026-11-11: "Yes, the names are right. Pass.").
- The summary is the window: one line per data type, no grey detail, no names (J1-2, owner
  2026-11-11: "All of the extra information in the gray should be removed at the least.").
- The records are an optional spot check from the summary, types on the left and records on the
  right, behind Review Records (J1-2 spot check, owner 2026-11-11: "combining the summary view
  with an optional spot check view").
- Type names on the summary are plain text; Review Records is the one way in (J1-4 linked type
  names, owner 2026-11-11: "Yes").
- Categories show as an indented tree; a filtered match keeps its parents (J1-3a, owner
  2026-11-11: "Pass"). `TreeList` moves to `src/core/ui/components/` and Save From Store's
  categories use it (J1-3a build item).
- Every type has Removed and Kept tabs, Kept greyed out when nothing stays (J1-3b third pass,
  owner 2026-11-11: "If it is, then we can make this add.").
- The count shows once, in the left column; a type with kept records shows the house notice
  `StatusDot` after its count, in a fixed slot, and the same dot on its Kept tab (J1-3b second
  pass, headers and tab dot, and J1-3b, owner 2026-11-11: "Yes.").
- Both tabs have column headers; Kept rows are the same height as Removed (J1-3b headers and tab
  dot, owner 2026-11-11: "yes").
- Kept records carry no reason and no Reason column: the one reason left is that another demo
  uses them (J1-3b, owner 2026-11-11: "What is the owner unknown reason for a customer? ...
  Yes").
- Already-closed orders and protected settings are not listed (J1-3b problems and their fixes,
  owner 2026-11-11: "1. Agree 2. Agree 3. Confirm and add."; J1-3b protected settings, owner
  2026-11-11: "Take protected setting off").
- A failed read is a problem with Retry, never a kept reason (J1-3b keep reasons build item).
- Every demo order ends Canceled or Closed, in Commerce: cancel, else invoice what is not
  invoiced and refund it all offline. Clear never hands orders to the ERP integration; the ERP is
  brought in line afterwards as its own step (J1-3b Commerce is the source, owner 2026-11-11:
  "commerce should be the source system, not the ERP").
- The order rule is one rule in both repos, checked by a shared table of order states (J1-3b
  build items); the ERP integration skips orders carrying Clear's reset note (J1-3b build item).
- Payment review and a list setting Commerce cannot reset are reported by the run's result with
  "Open Commerce Admin", not on the summary (J1-3d, J1-3b Commerce is the source; build item).
- Each record counts under its own type: no "with their customers" phrases; a catalog's customer
  group counts under Customer Groups (J1-5 with-phrases, owner 2026-11-11: "Yes").
- Orders read "23 closed" (J1-5 orders line, owner 2026-11-11: "\"never deleted\" is noise.").
- The spot check returns full record lists per type (J1-3b build item).
- The left column holds 11 types without growing and scrolls inside itself past that;
  `.datapack-picks-rail` gets `overflow-y: auto` (J1-3c, owner 2026-11-11: "Looks good.").
- `ViewSwitcher`'s marker style moves into `data-installer.css`, with a visual baseline (J1-3b
  build item).
- Clear Commerce Instance, step 1: websites, each naming the projects using it (J1-4, owner
  2026-11-11: "J1-4 looks good.").
- Clear Commerce Instance, step 2: the summary, the warning and the "I understand" box (J1-5,
  owner 2026-11-11: "Yes, this is good."; J1 approved as a whole: "All approved.").

Reset and delete:

- Reset and delete use the approved `ProjectsBatchModal`, unchanged; no Commerce radio (J7-2,
  owner 2026-11-12: "We already have a modal experience we've approved for mass action, deletes,
  and resets.").
- One project opens the same batch window with one row, titled by name: "Reset Kukla Luma?",
  "Delete Kukla Luma?", replacing today's VS Code dialogs (J7-1, owner 2026-11-12: "Yes").
- No Datapack Changes step: when datapacks have changes, the button runs into the "Save Your
  Changes First?" question used by Switch and Uninstall, as one window with one row per datapack,
  buttons "Reset Without Saving", "Cancel", "Save and Reset" (J7-2, owner 2026-11-12: "Yes, but
  let's review it again once you've built it in.").
- Its columns are "Datapack" and "Save As". Every row has a filled-in, editable name field: the
  SC's own datapack starts with its own name and saves into it; another name saves a new
  datapack; someone else's starts "My Bodea", or "My Bodea 2" when taken; a taken name shows J3's
  problem line and Save and Reset waits (J7-2, owner 2026-11-12: "What if the person wants to
  control the name of the new data packs?"; "I don't like the save changes to heading name.").
- The column headings are drawn as the batch table's (12px grey, one rule under) (J7-2, owner
  2026-11-12: "As long as the design is consistent with the way we handle other column
  headers").
- Delete is the approved delete window, with one row for one project (J7-3, owner 2026-11-12:
  "right"). With changes it uses the same save question, its buttons "Delete Without Saving",
  "Cancel", "Save and Delete" (built with J7-2's save question, the verb swapped as Switch and
  Uninstall swap it).

- The project dashboard's Reset opens the same one-row batch window on the dashboard; its Delete
  opens the projects list on its one-row Delete window, since the dashboard closes when its project
  is deleted (P5-Q2, owner 2026-11-13: "Reset here, Delete via list").
- A batch reset with Uninstall Datapack ticked uninstalls it, for every project with a Commerce
  backend, not only EDS storefronts (P5-Q3, owner 2026-11-13: "Uninstall it").
- The agent's `reset_project` gets the same uninstall choice as the window, with the save answers
  (`removeData`, `changes`, `saveAs`, as `delete_project` has them), in this phase (P5-Q4, owner
  2026-11-13: "Yes, in this phase").
- Clear is planned in its own pass (step-06) and built within beta.153 (P5-Q9, owner 2026-11-13:
  "Own planning pass now").

- Clear never refuses: on a website another local project uses, Clear Demo Data warns (an
  informational line naming the project) and the SC can stop or continue (P6-Q2, owner 2026-11-13:
  "The SE should be able to clear the entire instance, regardless of the ramifications. The warning
  is an informational warning that should allow them to stop if they want and continue").
- Clear Commerce Instance asks about other projects' unsaved datapack changes with the batch save
  question (the Datapack / Save As table with editable names) (P6-Q4, owner 2026-11-13: "We have a
  saved data pack flow already ... Why not use this?").
- A failed read is split by kind, built only from pieces that exist (P6-Q3, owner 2026-11-13: "We
  should split by kind"; then "Is this a one off approach ... I'm just trying to prevent one off
  designs."; then "Yes, reuse only"): the kind from `classifyTransience` (core/errors); the whole
  check failing (offline, signed out) uses the Datapacks failure screen (`dataInstallerFailure.tsx`,
  its title naming Commerce; signed out is Sign In, never Retry); a slow type waits for Retry, then
  Fix with AI (`RETRIES_BEFORE_FIX`), and Clear waits with it, no override; a type Commerce refuses
  or answers strangely is marked "Couldn't be read" (as Create's picker does), left alone, with Open
  Commerce Admin (refused) or Fix with AI (strange answer), and Clear runs for the rest.
- The order rule gets the shared table of order states, in beta.153: one table here, tested here;
  the ERP integration's copy checked by a fingerprint that fails its build when they differ (P6-Q1,
  owner 2026-11-13: "We've learned that nothing will stay identical by hand."; "Yes, in beta.153").

## Phase 7: the Datapacks screen

- The header: the save button (Create with no datapack), "Install from File" in a project's
  Datapacks, "Add from File" in the Datapack Library, then Clear (J8-1, owner 2026-11-12: "Yes").
- With no datapack the header button reads "Create"; its window keeps the title "Create
  Datapack" (J8-3, owner 2026-11-12: "the title says create data pack means that we can make the
  button just say create"; then "Keep it").
- A card: one-line tag, "Mine" on the SC's own, one date format (J8-2, owner 2026-11-12:
  "Right").
- The More menu items are bare verbs: "Share", "Stop Sharing", "Delete"; window titles keep the
  name ("Share My Luma?", "Delete My Luma?") (J8-3, owner 2026-11-12: "Should we go with share
  and delete instead of share data pack and delete data pack so that it's consistent everywhere?
  ... Yes.").

## Phase 7b: Create Datapack and the save buttons

- Save shows what My Luma will hold, then "Saved to My Luma"; Save As New asks only a name (J3-1,
  owner 2026-11-12: "3-1 is good").
- The save run is two steps: "Export from Commerce" with the types under it ("Exporting 19 of
  38", not "Reading"), then "Save My Luma" as its own row, so a failed write shows on its own row
  (J3-1, owner 2026-11-12: "Go").
- Save As New's name starts empty; from someone else's datapack it starts "My Bodea" (J3-1, owner
  2026-11-12: "Keep it empty. The one caveat might be ... \"My <Pack>\"").
- Create is two windows, both titled "Create Datapack": first what it holds (wide picker, "Cancel"
  and "Next"), then the name (small, "Back", "Cancel" and "Create"); no "What It Holds" heading
  (J3-2, owner 2026-11-12: "Yes"; then "3-2 looks good").

## Phase 8: the agent surface matches the screen

- Replace becomes Switch everywhere (J8-1 build item), so agent tool text and consent words say
  Switch too.
- No other walk decision is specific to the agent surface.

## Owner walk of the loop's questions (2026-11-13)

Every question the 2026-11-12 loop parked, answered by the owner one at a time. "New work" marks an
answer that needs building; the rest confirm what is built.

### Real data
- A delete whose datapack removal leaves data in Commerce stops: the project stays and the window
  says what was left (R1-a). New work.
- An Edit whose old-datapack removal fails stops: the old datapack stays recorded (R1-b). New work.
- A batch reset whose changes could not be read gives that project no row and leaves its datapack
  alone; the 11-04 rule stands (P5-Q5).
- A reset with Uninstall Datapack ticked clears the project's datapack, so the card reads not
  installed (S7-b). New work unless Phase 6 already does it.
- With the always-save setting on, the save question says one line: "My Luma is saved first (your
  setting)." (S1-a). New work.
- The one-datapack save question always has a name box, the SC's own datapack too: pre-filled with
  its own name saves into it, a new name makes a new datapack (P5-Q7, reverses the recommendation).
  New work, in Switch, Uninstall, Reset and Delete.

### Install, restore and switch
- A background install that succeeds shows a progress-style popup, "Bodea Installed", that closes
  itself after a few seconds; a failure stays as a warning with Open Debug Logs (step-03 Q4).
  Unblocks S3. New work.
- A clean install closes itself: the search-delay line is dropped; lines saying the SC's edits were
  kept still keep it open (Q3). New work.
- Installing a datapack the store already matches ends at "Bodea Is Up to Date" (Q8). New work.
- The title turns amber only when Commerce refused or failed to write something; kept edits and
  already-there rows stay green (Q9, S6). New work.
- Retry after a stopped switch installs the new datapack only, and says the old one is already out
  (Q10). New work.
- Kept as built: "Install Bodea, eds-compatible?" (Q11); "Couldn't Restore My Luma" / "Couldn't Undo Last Save" (Q5); Restore's check in a window
  (Q6); "Uninstall My Luma?" with no store name (Q7); agents may install part of a datapack (Q2).
- A partly installed creation install is failed, with the run's reason (P4-Q11).
- A skipped creation install must not happen: when a datapack needs a website or store view, the
  wizard requires the selection before Continue (S7-a, owner's reframing). New work.

### The Datapacks screen
- "My Luma Created" (P4-Q1). The version picker only with two or more versions, else "Updated Nov 6,
  9:15 AM" (P4-Q2). The dashboard line shows a version only with two or more (S9).
- The save count adds "N added" in beta.153: records added by hand since the install (P4-Q3). Engine
  work, live check owed. New work.
- No install record: no Save; Create shows with "No install record for Luma, so changes can't be
  counted. Create a datapack to keep them, or Restore Luma to start counting." (P4-Q4). New work.
- Fix with AI's failure count carries across reopenings (P4-Q5). Delete removes the whole datapack
  (P4-Q6).
- Install from File adds the file, then opens the install window (never wired until now); a file
  whose save already exists asks Replace or Keep Both, Keep Both with a name box "My Luma Copy"; one
  Delete in the result window undoes everything the load added, and "Delete Store Configuration" goes
  (P4-Q7, P4-Q10). New work.
- The amber dot also shows when the installed Demo Builder datapack was updated since, hover "Luma
  updated Nov 12", Restore installs it (S6-b). New work.
- A failed card hides the dot and keeps Uninstall; Fix with AI with nothing to fix says so on screen
  (S8). New work for the line.
- "Recommended" is dropped. The screen and the wizard step open on "My and Demo Builder Datapacks",
  only datapacks a person chose; the service's leftovers and Community are one choice away (S10-a).
  Found while answering: "curated" was the service's unreviewed shared flag. New work.
- The save window: a whole-type tick skips the read, in beta.153, for the extension and agent tools
  (S3-a, reverses the recommendation, new work); the count label matches the other screens (S3-b,
  check them); search keeps matching SKU and email (S3-c); "Stopped" and "Not run" stay (S4).
- Share on own datapacks only; the wizard cards stay as they are (P4-Q9).

### Reset, delete and Clear
- An added demo whose site is down: the reset carries on, keeps its content and says so on its row
  (P5-Q8). Batch rows and one-project words kept (P5-Q1, S1-c, S2). All six Clear choices kept
  (P6-Q5 to Q7, C1, C2b, C5).
- Small nested type rows take one line with the full text on hover, like main rows (C7-a, reverses
  walk F135). A run-wide warning stays under the rows (C7-b).

### Agents
- Agents cannot delete Demo Builder datapacks, as the screen (P4-Q8, reverses the recommendation).
  New work.
- "Agent · " becomes "Agent: " everywhere. New work.
- The old tool names (start_datapack_import, load_datapack_zip, mark_team_datapack, the
  import-datapack guide) are renamed to the screen's words in beta.153. New work, with the test set,
  docs and an AI_CONTEXT_VERSION bump.
- The agent-reach scan is fixed now: factory-built handler maps and the "copy" assumption. New work.

### The six windows Phase 1b left
- Share: main buttons in the footer, opens at the taller form. Add a Demo and Add Integration: the
  Steps window held at the first stage, taller stages scroll, Back at the footer's left. Setup Guide:
  a two-column option on the Guide layout. New work.
- The projects batch run and the Updates run: extend the Progress layout now (Close hidden while a
  row's question waits; a question under its row) and move both onto it. New work.
- The hosting check covers windows built on the layouts. New work.

### Back on track (owner, 2026-11-14): walk answers checked against the earlier decisions
An audit found five walk answers that contradicted earlier decisions. The owner's rulings:
- Add a Demo and Add Integration do NOT scroll: a stage much taller than the first opens as its own
  window at its own size (rule 14; J1.1-J1.3 failed "sized to the first step, later content scrolls" as
  "the worst possible experience"). A long list may scroll inside its own pane (J1-3c). Replaces the
  walk's "taller stages scroll", which the session had wrongly said the rules allowed (it cited an
  older overview line the J1 walk superseded).
- No install record: the header offers Create where Save would be, with NO explaining line (rule 6,
  J3-2, rule 4). Replaces the walk's line.
- Keep Both names the copy by the house pattern: "My Luma 2" (J7-2), not "My Luma Copy".
- Restore is always the whole datapack. New flyout action "Update Luma" for an updated datapack: it
  writes only what the datapack changed and keeps the SC's own edits (the install record's "edited
  since" fingerprints); the amber dot's hover for this case is "Newer version available" (J4-1's
  pattern). Replaces "Restore installs it" and the hover "Luma updated Nov 12".
- A datapack is built out additively, so applying chosen parts is allowed: agents keep installing chosen
  types (stated in their guide), and the screen's Update Luma gets a type choice, in beta.153. New
  design: prototype it and walk it before building (the 2026-11-11 rule: conventions are decided in
  prototypes, not code).
- Put back in the plan: the batch window growing when its questions replace the wait (319px to 446px,
  rule 14) goes into the batch-run slice; the always-save setting's description is rewritten.
- The save window's "My Luma is saved first (your setting)." line goes (J2-3: the setting was
  removed from the save question as clutter; rule 3: say a fact once). The run row's "Saved to My Luma."
  stays as the one place it is said, after the fact. Undoes part of D3 (built in 2a7ab54c9).
- The stopped-switch line is "My Luma was uninstalled." only (rules 5 and 6: the title names the goal,
  and a line does not explain the button beside it).
- With an update available, the flyout's main button is "Update Luma"; Restore is not the main action
  then. Owner: "Update means apply what changed. Restore means go back to a previous state."
- Where "back" goes (owner, 2026-11-14, confirmed after two rounds; "following the way software works
  today"; the words are the pair Word, Photoshop and Apple Photos use):
  - One action, **Restore <pack>**. On the SC's own datapack its window offers "Last Saved, <date>"
    (only when there are unsaved edits; it throws them away) and "Original, <date>" (the datapack's
    first state). On a Demo Builder datapack there is one point: "Commerce goes back to Luma as it
    ships."
  - "Save Your Changes First?" comes only when Original is picked and there are unsaved edits (saving
    before Last Saved would leave nothing to restore).
  - No separate Discard Changes: Restore's Last Saved is that job.
  - Flyout: Update <pack> is the main button when the library copy is newer, otherwise Restore <pack>;
    Undo Last Save and Uninstall in More. To reach the pack My Luma came from, Switch to Luma.
  - The SC's own datapack keeps its original for good, beside the two newest saves.
  - Replaces J4-3 (Restore as last save, no save question). Prototype J9 first; build after the walk.
- Already on track: the reset's "Content kept" row is built amber; Q6 makes kept-on-purpose green
  (slice I3).

## Open

- **J6-2, the failure reason in the flyout**: kept for now, provisional. Owner 2026-11-12: "We can
  keep it for now, but if I don't like it, we'll have to change it."
- **J7-2, the batch save question**: to review again once built. Owner 2026-11-12: "let's review
  it again once you've built it in."
- **DI-15, several datapacks per project**: next release, not beta.153
  (`.rptc/backlog/2026-11-12-several-datapacks-per-project.md`). The model the owner agreed for it
  (J8-1): Switch only when a new datapack writes the same records at the same level; uninstall
  removes only what that datapack wrote; a datapack built on another needs it installed first.
- **The order rule's live test**: done. Passed live on 2026-11-11 on the test store
  (`.rptc/plans/erp-order-close/overview.md`, step 6): shipped-not-invoiced and partly invoiced
  orders end Closed, nothing reaches an ERP, a second Clear changes nothing (J1-3b build item).
- **One-project reset and delete still use VS Code dialogs today**. Decided to become the batch
  window titled by name (J7-1); the prototype still shows the product's "Reset 1 Project?" title.
- **The batch window grows when its questions replace the read wait.** Measured in the J7
  prototype, which renders the product's own `ProjectsBatchModal`: Reset 3 Projects opened at 319px
  and grew to 446px (the panel's size readout, 2026-11-12). A rule 14 failure in the product, to fix
  in the build.
- **The setting's new description**: `changesOnRemoval`'s description is to be rewritten to the
  glossary (J2-3 build item; overview Phase 3); the words are not written yet.
- **Phase 1b screenshots owed** (overview, "The convention system"): Spectrum's title size, the
  three wait lines at 400px, Give Access's long checkbox label, three long buttons at medium.
- **Scenario rows J1.6 and J1.7** still read Pending in the scenario table; the step walk (J1-2 to
  J1-5) covered the same windows and J1 was approved as a whole.

## Changed during the walk

- Clear summary with grey detail and example names, became bare lines with an optional spot check
  (J1-2).
- Kept records at the bottom of the list, became Removed and Kept tabs (J1-3b).
- Kept reasons (Used by Another Demo, Owner Unknown, Protected Setting, Already Closed, Left Open),
  became no reasons and no Reason column (J1-3b).
- Clear handing ERP orders to the integration, became Commerce closing every order, the ERP
  brought in line afterwards (J1-3b).
- Linked type names on the summary, became plain text (J1-4).
- "with their customers" phrases and "23 closed, never deleted", became own-type counts and "23
  closed" (J1-5).
- Per-type checkboxes on install with "a locked row says why", became no checkboxes (J2-1).
- An Install button on the card, became flyout actions only, "Restore My Luma" on the datapack in
  use (J4-2 row in J2).
- An opening line above the Switch table, became none (J2-3).
- "Replacing My Luma takes these changes out of Commerce.", became "Your changes will be lost if
  you don't save them." (J2-3).
- The "Always Save Changes" box and its tip on ticking, became the setting only, with a one-time
  tip after the first save question (J2-3).
- The save run as reading rows, became Export from Commerce then Save My Luma (J3-1).
- Create as one two-part window, became two windows (J3-2).
- Save As New's name, became empty, or "My <Pack>" from someone else's (J3-1).
- Undo outline, then solid red, became the standard blue (J3-3).
- The amber dot's long hover sentence, became "Newer save available" (J4-1).
- Restore always asking, with Save Changes First, became asking only with unsaved edits, Cancel
  and Restore only (J4-3).
- "My Luma (install failed)" on the dashboard, became the bare name with the hover (J6-4).
- Reset over a prototype batch window with a Commerce radio, became the product's
  `ProjectsBatchModal` unchanged (J7-2).
- "Reset 1 Project?" for one project, became "Reset Kukla Luma?" (J7-1).
- The batch "Datapack Changes" step, became the Switch and Uninstall save question (J7-2).
- "Saved as My Bodea" as plain text, became an editable name field on every row (J7-2).
- The column heading "Save Changes To", became "Save As" (J7-2).
- "Replace My Luma with Bodea?", then several datapacks per project, became one per project with
  "Switch to Bodea?" (J8-1).
- "Share Datapack" and "Delete Datapack", became "Share", "Stop Sharing" and "Delete" (J8-3).
- The header's "Create Datapack", became "Create" (J8-3).
