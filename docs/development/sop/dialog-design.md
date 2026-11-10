# Dialog design

How a dialog looks, how big it is, and what it says. Agreed with the owner on
2026-10-31, from mockups, after a day of result screens that each looked fine alone
and read as machine-made together ([[PL-85]]).

The cause was not one bad screen. There was no written rule for what goes INSIDE a
dialog, so each screen was composed on the spot from parts (a status box here, a
row list there, a muted footnote under it) and each one drifted. These rules are
the fix. They build on Spectrum's own dialog shape: a title, one rule, plain
content, buttons.

## The test every line has to pass

**Does it change what the SC knows or does next?** If a line repeats the title, a
button, or something the SC picked seconds ago, delete it. This catches most of
what reads as AI-written:

| Cut | Because |
|---|---|
| "What clearing does" over a list | The list says it |
| Store and Data rows on a result | The SC picked both seconds ago |
| "Closing this doesn't stop it." | The button says "Run in background" |
| "Remove X's data from this store?" under the title "Remove X" | It repeats the title |
| "Data (12)" | It counts a list the SC can see |
| "Every data type went in." | It says nothing the green title did not |

## Layouts

Every dialog is built from five. A dialog that walks through several (Import goes
form, confirm, progress, result) shows one at a time.

| Layout | Holds | Usual width |
|---|---|---|
| **Form** | Fields, then the actions | medium; large or extra-wide when a list needs columns |
| **Confirm** | A question as the title, as few short sentences as it takes, Cancel and the action | small |
| **Progress** | A spinner, what is happening, how far; a run through a list (updates, projects, a datapack's data types) shows a row per item instead (`WorkRow`) | small from start to finish; a run shown as rows keeps the box its rows need |
| **Result** | The outcome as the title, then only what is left to know or do | small |
| **Guide** | Steps with their state, one step open (the demo setup guide; a pack's setup step is a guide of one) | large |

## Rules

**A wait shows nothing else, and says what it is waiting for.** While a dialog waits for what it
will show, only the title, the wait and the way out (Close or Cancel) appear: no fields and no action
buttons. The wait is the progress window's three rows, medium and centred (`StageWait`): what it is
doing ("Reading demo data"), on what ("Each data type, in Commerce"), and how long it usually takes
with the time so far ("Usually a few seconds · 4 seconds"). Its words come from `WAIT_STAGES`
(`core/utils/waitStages.ts`), held to the stage table's rules: a label of 25 characters at most, a
detail of 40, an expectation of 25, and the stage table's words for the same work ("Reading from
Commerce", never "Reading the store"). Work the SC started reports its own stages in the same rows.
A wordless spinner sat for a minute over a re-import's comparison, telling the SC nothing (owner,
2026-11-08; it said nothing at all from 2026-11-01). The wait is centred both ways between the
title's rule and the buttons. `Modal`'s `waiting` prop does all of this, takes a label by type, and
eases to the content when the wait ends. A button doing its own work shows its spinner on itself
(`isPending`). A re-check inside a dialog already showing its content, such as ticking a store in
Clear demo data or pressing Check on a pack's setup step, is not a wait for the dialog: its spinner
goes where the answer lands and the rest stays (owner, 2026-11-01).
A flyout waits the same way: its title and the same rows (owner, 2026-11-08).

**A dialog and a whole wizard screen draw an outcome differently, on purpose** (owner, 2026-11-02).
A dialog has a title bar, so the outcome sits in it, with a small icon. A whole wizard screen has
none, so it uses `StatusDisplay`: the large centred icon with the message beneath. Same icons, same
colours. Neither borrows the other's layout.

**Status lives in the title.** A small icon before it: green done, amber needs the
SC (including a dangerous confirm), red failed. No status boxes in the body. The one
exception is a setup step's banner (`SetupStepHeader`): a Check needs one place to show
its answer and its spinner (owner, 2026-11-02). A
done result with nothing else to say is just its title.

**A sentence gets a small box.** A Confirm and a Result are small (400px) in every window, and the
progress window is small from its first frame to its result unless it shows rows. A window does not
change size between a wait and its result. Text is one size whatever the box, so a sentence in a
medium or large box is one thin line in an empty one (owner, 2026-11-10, from the inventory in
`.rptc/research/modal-conventions-audit/`: the progress window was medium for all 31 operations and
often ended on a title alone).

**Nothing left to read closes itself; something to read stays.** A clean result that is its title
alone closes itself after a glance (`TIMEOUTS.UI.RESULT_GLANCE`), in every window: the progress
window and a run's own window alike. A result with a sentence, a note, a list, a next step or a
problem stays until closed. Which component drew the run used to decide it: a four-minute mesh
deploy vanished while "Projects Reset" stayed on its title (owner, 2026-11-10).

**A clean run ends small; a run with a problem ends where it ran.** A window that shows a run as
rows (the Updates run, the projects batch run, a datapack import, a datapack save) and finishes cleanly hands off
to the small Result layout: the outcome as the title with its green icon, then only what is left
to know ("My Luma Imported", then "Your changes are saved in Version History." when a save ran),
or the title alone when nothing is. No rows, no "Took …". A run that finishes with any problem (a
row or step with a warning or error, a stop) does not switch: the title turns to the outcome with
its icon, the rows stay with each one's final state, and a problem sits on the row it is about,
one short line in orange or red. What is left to say about the whole run (one sentence, then
"Took …") goes under the list, and the size does not change. The rule was "a run ends where it
ran" for every run (owner, 2026-11-07, generalising the Updates run's rule of 2026-10-21); since
2026-11-10 that holds only for a run with a problem, because a clean finish's rows told the SC
nothing the title did not (owner, walk F134: "Do all three"). A save that finds nothing changed
ends on its title alone, "No Changes to Save". A run shown as rows has no rows of its own for work
outside its items: a save says it on the row it leads to, the first while it finds what to read and
the last while it writes (review, 2026-11-10). A run made of
steps shows the steps, each named for what it does, in the order it runs, and only those that
apply (an import: Save Your Changes, Uninstall the Previous Version, Install, Verify the Import; owner,
2026-11-09): work that belongs to no one item is a line of the step it serves, never a grey line
under the list or a row of its own, and a step's items (an import's data types) sit under it, one
line each, the one in progress with a second line saying what it is doing, the word first and
then the count ("Installing 1,200 of 2,046"; 2026-11-10). The rows show from the first press, with
no spinner screen in front of them (owner, 2026-11-07), and the window keeps one height to the end:
the clock's line is there from the first frame, room for the working item's second line is held
the whole time, and no line wraps or is cut short, the window choosing its width when it opens so
its columns fit their longest line (2026-11-09, 2026-11-10). A finished run ends on Close alone; Back is
for a stop. The one exception is a clean Updates run that left updates unticked, which offers Back
to Updates beside Close, since those updates are still waiting. A run that changes what is there already (importing a pack the project has) says what
it would change before it is started, not mid-run: the window opens on its wait ("Checking for
your changes", the one name for that check wherever it runs), then the form shows each data type's
change in counts under its name ("12 updated, 2 removed", "No changes"), and Import runs straight
away (owner, 2026-11-08).

**A confirm that can lose the SC's changes** puts the button that loses them at the footer's start,
apart from Cancel and the save button, as Don't Save stands in a Save dialog, and lists the changes
one row per data type in the two-column `FactList` (owner, 2026-11-09). While the confirm's check
runs, the title names the work ("Import My Luma"), not a question nothing has asked yet, at the
confirm's own width so nothing jumps when it comes.

**Capitals.** What names a thing is Title Case: the title, buttons, tabs, menu items and labels
("Run in Background", "Data Types"). What tells the SC something keeps normal capitals: a sentence,
a status note ("3 selected"), and a title that is a complete sentence. Owner, 2026-11-02, over
Spectrum's sentence case. Enforced by `tests/sop/ui-label-case.test.ts`.

**Four kinds of text.** Title; body text; label (small, muted, Title Case,
never capitals); note (small, muted). Nothing else. A note about a problem is small and
keeps its colour, and is one short line: what is wrong and what to do. Orange for a warning,
red for a failure. Colour is for what is simple: a line that runs long or explains itself gets
cut, not coloured (owner, 2026-11-02).

**Spacing:** 4 between a label and its field, 8 between rows, 16 under the title,
24 between groups.

**Lines:** one rule, under the title. In a list of rows (a run, a set of steps, the projects a
confirm names), a hairline between rows, as the integration flyout draws its rows, never above the
first or below the last (owner, 2026-11-04). No box borders, no rule over the buttons.

**Buttons:** Close or Cancel first, then the actions, the main one last. A
dangerous main action is solid red. Never two buttons that do the same thing.

**Words:**
- Titles take one form in every window (owner, 2026-11-10; the counts are the extension's own,
  from the same inventory). A form says what it will do: "Install My Luma". While it runs, the
  "-ing" form: "Installing My Luma" (32 of 38 runs already did). A window that is a form and then a
  run changes its title when the run starts. Done: the thing, then what happened. Failed:
  "Couldn't" and the verb ("Couldn't Install My Luma"), never "… Failed", "… Stopped" or "… Did
  Not …".
- A result's title NAMES the thing, then what happened to it ("My Luma Imported", "My Luma
  Uninstalled", "Couldn't Save My Luma"), never a generic kind ("Datapack Removed"). Only when
  there is no name to give does it name the kind ("Couldn't Open the File"). A title is a
  statement, never the reason, and has no comma. Owner, 2026-11-10, settling the contradiction
  between the 2026-11-04 rule (a generic title, the name in the body) and the approved clean
  ending above; the generic rule is withdrawn.
- The body never repeats the title.
- Facts, not commentary. Digits for numbers, with separators (1,284).
- A warning is a word in the main sentence ("Permanently removes…"), never a
  muted footnote under it.
- Never join two phrases with a middle dot ("A · B"): a comma, parentheses or two sentences.
  The one exception is a progress display's third line, its expectation and its clock
  ("Usually about a minute · 1 minute, 5 seconds", `expectationLine`), kept on purpose (owner,
  2026-10-16, again 2026-11-04; the handbook's progress convention).
- No bullet lists. A list of consequences is a few short sentences, each on its own line
  8 apart and every one a real consequence (owner, 2026-11-02: one long sentence read worse,
  and so did one block of ten lines), or sits on the row it belongs to.
- A sentence names up to seven kinds in full; past that, three and "and 9 more
  data types".

**A question a run stops on**: a task of its own, such as a sign-in, takes the window, its heading
the title with the amber icon, its sentence with the how as numbered steps under it, then the
fields 24 below, with Cancel as the way out. It names no task: a pause asks and the run picks up
where it stopped. A question about one row of a run is asked under that row with
the list in view. `feedback/OperationQuestion` draws both (owner, 2026-11-04; the row rule
2026-10-21).

**Problems sit next to the thing they are about**, as a note line: a store another
project claims gets its note on its own row, not a box above the list; a check that failed
sits under that step's title.

**An Admin step is drawn one way everywhere**: Where (the menu path), Set (each
value copyable), Then. In the setup guide, in a pack's setup step, and in a result
that leaves one to do. Numbered lists only for instructions that are not an Admin
step.

## Size and motion

- **Pinned near the top**, not centred, so content that grows pushes only the
  bottom edge down and nothing above it moves under the pointer.
- **Height fits the content.**
- **Width is a step**, chosen by the view, never measured from text: small 400,
  medium 480, large 640 (Spectrum's own), extra-wide 980. A longer store name wraps;
  it does not widen the dialog.
- **A dialog's size never animates** (owner, 2026-11-02, after four tries at easing it). A
  change of view takes its size at once. The title stays, and the new body fades in quickly
  to soften the swap.
- **A wait keeps the box it found.** The width stays, and the height stays as a floor, with
  the spinner level between the rule and the buttons. So a run has one change of size, when
  the real content arrives. One wait following another changes nothing but its words. A
  first open has no earlier box, so it starts at the wait's own size. A body that is a wait
  with its own buttons says so with `holdSize`.

## Long content

- Text always wraps. Nothing is cut off with an ellipsis, titles and names
  included.
- A row's note sits on the right when it fits, and drops under the name when it
  does not. It never squeezes the name.
- Button labels never wrap; a dialog too narrow for its buttons wraps the row.

## Where it is built

`core/ui/components/ui/Modal.tsx` (the title's status icon, the width steps and
their easing, the button styles), `core/ui/components/ui/useDialogViewChange.ts` (a
change of view), `core/ui/components/ui/DialogOutcome.tsx` (a state or a wait deep in a dialog's
body reporting to its title and footer), `core/ui/styles/modal.css` (pinning, text kinds, spacing).
