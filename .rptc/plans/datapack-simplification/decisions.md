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
