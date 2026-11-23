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
| "Every data type went in." | It says nothing the green outcome did not |

Six patterns the owner rejected (2026-11-10, `.rptc/research/datapack-versions-and-wording/`).
Each has one rejected example; the words module (`features/data-installer/datapackWords.ts`) holds
the ones that replace them, and `tests/sop/datapack-words.test.ts` catches the mechanical ones.

| Pattern | Rejected example | Write instead |
|---|---|---|
| **Fragment**: half a sentence, or a clause standing in for a noun | "Since this demo's last save" | Nothing, or a whole sentence |
| **Inside view**: how the software works, not what the SC is waiting for | "Each data type in My Luma" | What the SC waits for, or nothing |
| **Unasked reassurance**: explains something nobody asked | "No version is deleted." | Nothing |
| **"The store"**: where the word is Commerce | "Checking the store" | "Reading from Commerce" |
| **Vague or wrong name** | "Remove Data" | The thing's name and its verb: "Uninstall My Luma" |
| **Code on screen**: an id, a raw version, a setting key, or "pack" for "datapack" | "20261109-141504" | "Nov 9, 2:15 PM"; "datapack"; the setting's title |

## Layouts

Every dialog is built from five. A dialog that walks through several (Install goes
form, confirm, progress, result) shows one at a time.

| Layout | Component | Holds | Usual width |
|---|---|---|---|
| **Form** | `FormDialog` | Fields, then the actions | medium; large or extra-wide when a list needs columns |
| **Confirm** | `ConfirmActionDialog` | A question as the title, as few short sentences as it takes, Cancel and the action | small (400); the run's width when a run follows in the same window |
| **Progress** | `ProgressDialog` | A spinner, what is happening, how far, and the time. One project's run moves these lines from step to step, as the wizard does (a datapack install, switch, update, restore or uninstall: "Installing Products", "1,200 of 2,046"); only a run over several projects shows a row per project (`WorkRow`). How it ended is drawn in the same window (`ResultBody`) | small from start to finish; a run shown as rows keeps the box its rows need, and its result too when the result has a list to read |
| **Result** | `ResultDialog` | The thing as the title; in the body the large status mark, the outcome under it, then only what is left to know or do (`ResultBody`) | small; a run's result keeps the run's window only when it has a list to read |
| **Guide** | `GuideDialog` | Steps with their state, one step open (the demo setup guide; a pack's setup step is a guide of one) | large |

## Rules

**One project's run is the centred view; rows are for several projects** (owner, 2026-11-16). While a run on one project is under way, the window shows the large spinner with what it is doing now and how far, moving from step to step, never a checklist of its steps or data types (`runStage` in `core/utils`, used by the datapack run window and the progress window, so a datapack save, Clear Demo Data and a project's reset follow it too; `OneRunning`, the projects window's one project). A run over several projects shows a row per project: the projects batch, and the Updates run, whose rows sit under each project's heading. How a run ends is the result rules'. The lines are line 1 the job ("Uninstalling from Commerce"), line 2 the part under way and how far ("Products, 12 of 25"), line 3 the time, and all three hold their room from the first frame, so nothing shifts when a count or the first second arrives (owner, 2026-11-16: "It shouldn't shift"; this replaced, for a run, the 2026-11-01 rule of no blank rows under "Starting").

**A wait shows nothing else, and says what it is waiting for.** While a dialog waits for what it
will show, only the title, the wait and the way out (Close or Cancel) appear: no fields and no action
buttons. The wait is the progress window's rows, large and centred like the run that may follow it
(`StageWait`; one size, owner 2026-11-17, walk F217; only a flyout's brief wait is medium): what it is
doing ("Reading demo data"), a second line only when it tells the SC something the first does not
("From Commerce"), and how long it usually takes with the time so far ("Usually a few seconds · 4
seconds"). A second line is never required: "Preparing to restore" says it all. Its words come from `WAIT_STAGES`
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

**A result is drawn the wizard's way: the title names the thing, the body says what happened**
(owner, 2026-11-17, walk F222: a title that carries the outcome "combines a title with a result").
The title is the thing the run or the action was about ("Release Save Test 2", "Scratch 1028 B"),
or, when there is no one thing, the job or the kind ("Projects", "Updates", "Datapacks"). No status
icon goes in a result's title. The body is the shared `ResultBody`, the wizard's success view
(`StatusDisplay`'s large `StatusIcon`) in a dialog: the large mark centred where the run's spinner
was (green done, amber a warning, red failed), the outcome under it in bold ("Up to Date",
"Installed", "Couldn't Install", "Created, 2 Steps Remaining"), then the reason. One reason line is
centred and muted under the outcome; several lines keep the mark and the outcome centred and read
left-aligned in a block below, since centred paragraphs are hard to read. A run over several things
(the projects batch, the Updates run) keeps its rows under the outcome, and only a row with something
to read carries a line. "Took …" for a run of a minute or more stays, under the rest. Lines and rows
sit in the house capped scroll with a fade (`scroll-fade--capped`), so the mark, the outcome and the
buttons stay in view; there is no "Show more". The next step is always a footer button (Retry, Fix
with AI, Sign In, Finish Setup), beside Close. This replaced, for results, the 2026-11-02 rules that
a dialog's outcome sits in its title with a small icon and that a dialog and a wizard screen draw an
outcome differently.

**Status lives in the title for a question and a confirm.** A small icon before it: amber needs the
SC (including a dangerous confirm). No status boxes in the body. The one exception is a setup step's
banner (`SetupStepHeader`): a Check needs one place to show its answer and its spinner (owner,
2026-11-02). A result's status is its large mark in the body (above).

**A sentence gets a small box.** The sizes belong to the layout components (the handbook's "one
component per layout" convention), so a window cannot pick its own. For example, Clear Demo Data's
confirm is small, and the progress window stays small from its first frame to its result; only a
run shown as rows takes the box its rows need. Before the rule the progress window was medium for
all 31 operations (`.rptc/research/modal-conventions-audit/`).

**Every result waits for Close.** The rule is the handbook's "every result waits for the SC to
close it" convention (owner, 2026-11-17, walk F195). "Projects" over "Reset" with nothing under it
stays until closed, as "My Luma" over "Installed" and "Your changes are saved in Version History."
does. No window closes itself on a timer.

**A clean result is small** (owner, 2026-11-20, replacing walk F222's "a result keeps the run's
window" of 2026-11-17). A run that ends cleanly, with no list left to read, ends in a small window
of its own: the mark, the outcome, a line or two, and Took. The jump from a large run to the small
result is accepted. A result with a list to read keeps the run's window: a failure that lists its
steps, several projects where a row has a line, Updates with a card that has a note or a button. A
run of one thing (a datapack, one project) runs small too, so it asks, runs and ends small.

**Every run ends where it ran; only problem lines show.** A run ends in its own window (owner,
2026-11-07, generalising the Updates run's rule of 2026-10-21; again 2026-11-17, walk F222). A run
of one thing that finishes cleanly leaves its rows out, because they would tell the SC nothing the
outcome does not (owner, walk F134: "Do all three"): the mark, the outcome and only what is left to
know ("My Luma" over "Installed", then "Your changes are saved in Version History." when a save
ran). A run over several things keeps its rows under the outcome, and only a row with something to
read carries a line; never a list of what went fine. A run that finishes with any problem (a row or
step with a warning or error, a stop) keeps its rows with each one's final state, and a problem sits
on the row it is about, one short line in orange or red, in the room the row's progress line held,
cut to fit. No closing sentence goes under the list to repeat a row: only what no row can say (one
sentence), then "Took …" (owner, 2026-11-11). A save that finds nothing changed ends on its outcome
alone, "No Changes to Save". A run shown as rows has no rows of its own for work
outside its items: a save says it on the row it leads to, the first while it finds what to read and
the last while it writes (review, 2026-11-10). A run made of
steps shows the steps, each named for what it does, in the order it runs, and only those that
apply (an install: Save Your Changes, Uninstall the Previous Version, Install, Verify Installation; owner,
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
change in counts under its name ("12 updated, 2 removed", "No changes"), and Install runs straight
away (owner, 2026-11-08).

**A confirm that can lose the SC's changes** puts the button that loses them at the footer's start,
apart from Cancel and the save button, as Don't Save stands in a Save dialog, and lists the changes
one row per data type in the two-column `FactList` (owner, 2026-11-09). While the confirm's check
runs, the title names the work ("Install My Luma"), not a question nothing has asked yet, at the
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
  run changes its title when the run starts. Once it ends, the title is the thing alone.
- A result's words are written once, as a sentence that names the thing and then what happened
  ("My Luma Installed", "Couldn't Save My Luma"), which a run closed into the background ends its
  notification in. The window splits it at the thing (`resultOutcome`, `core/ui/utils/resultWords.ts`):
  "My Luma" as the title, "Installed" or "Couldn't Save" under the mark (owner, 2026-11-17, walk
  F222). Done: what happened. Failed: "Couldn't" and the verb, never "… Failed", "… Stopped" or
  "… Did Not …". The title names the thing, never a generic kind ("Datapack Removed"); only when
  there is no name to give does it name the kind ("File", "Projects"). An outcome is a statement,
  never the reason (owner, 2026-11-10, settling the 2026-11-04 rule of a generic title).
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

The five layouts, `core/ui/components/ui/` `FormDialog`, `ConfirmActionDialog`, `ProgressDialog`,
`ResultDialog` and `GuideDialog`, each built on `Modal` and the only files that render it
(`tests/sop/modal-layouts.test.ts`; its ledger lists the windows still to move).
`core/ui/components/feedback/ResultBody.tsx` (every result's body: the mark, the outcome, the lines,
"Took …"; styled by `.result-body` in `modal.css`).
`core/ui/components/ui/Modal.tsx` (the title's status icon for a question or a confirm, the width steps and
their easing, the button styles), `core/ui/components/ui/useDialogViewChange.ts` (a
change of view), `core/ui/components/ui/DialogOutcome.tsx` (a state or a wait deep in a dialog's
body reporting to its title and footer), `core/ui/styles/modal.css` (pinning, text kinds, spacing,
the 60-character line, the 16px lead, and Spectrum's button weight).
