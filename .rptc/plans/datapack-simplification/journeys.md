# Journeys: Review Guide

<!-- Generated from mockups/flow/reviewSteps.ts by mockups/flow/gen-journeys.mjs. Do not edit by hand: change the steps there and run it. -->

The owner reviews one journey at a time, one step at a time, and answers one question per step.
Verdicts go to `prototype-feedback.md` in the owner's words (`log-verdict.mjs`). Each journey names
the plan section it comes from, so a verdict that changes the plan can be traced back.

Prototype: http://127.0.0.1:26839/proto-j1.html. Pick a step in the panel's Step menu.

Tools, all in `mockups/flow/` (run from the repo root):

| Tool | Does |
|---|---|
| Start the J<n> Guided Tour (one button per built journey, top of the screen) | **The journey review.** Points at each next action in the product; doing it moves the tour on; each stop shows what was decided there. Its stops are `j1Tour.ts`, `j2Tour.ts` and `j3Tour.ts`, whose decided lines come from `reviewSteps.ts` |
| Check All Steps (panel button) | Opens every built step and reports any window that grows or scrolls, every window of a step included (J2's run, then its small result); results also in `window.__CHECK__` |
| `log-verdict.mjs` | Records a verdict in the owner's own words (`--words` required) and any build item (`--build`) |
| Decisions panel (left of the window) | What was decided at the step on screen (its `decided` list in `reviewSteps.ts`, updated with each verdict), what it leaves for the build phase, and the verdict history in the owner's words. Shown when a step is opened from the Step menu, hidden during the tour |
| `gen-decisions.mjs` | Writes the panel's data (`reviewDecisions.ts`) from `prototype-feedback.md`; `log-verdict.mjs` runs it |
| `gen-journeys.mjs` | Writes this file from `reviewSteps.ts`; `--check` fails when it is out of date |

When feedback needs a change (owner, 2026-11-11):

| Kind of feedback | When it is settled |
|---|---|
| Small fix: words, remove something, move something | During the step; the owner moves on |
| Needs new design | Logged as open; settled with the journey's other open items after its last step, before the next journey starts |
| Exception | Settled at once when later steps in the same journey depend on it |

| Journey | What the SC is doing | Status |
|---|---|---|
| J1 | Clearing data (the window conventions are judged on these windows) | Built |
| J2 | Installing a datapack the demo does not use, or replacing the one it uses | Built |
| J3 | Saving changes, creating a datapack, undoing the last save | Built |
| J4 | Restoring the demo to the last save | Built |
| J5 | Uninstalling, and a long job run in the background | Built |
| J6 | An install that failed | Built |
| J7 | Resetting or deleting a project | Built |
| J8 | The Datapacks screen itself | Built |

## J1: Clearing Data

Plan: overview.md, Phase 6 item 3; Phase 1b.

| Step | Title | Do this | Judge this one thing |
|---|---|---|---|
| J1-1 | The Clear Menu | Click Clear under "Datapacks". | Two choices: Clear Demo Data, Clear Commerce Instance. Are the names right? |
| J1-2 | The Summary | Clear Demo Data opens on the summary: one line per data type. | Is the summary enough to decide on? |
| J1-3a | Categories as a Tree | The spot check at Categories, drawn as a tree. Try filtering, for example "gloves". | Can you see the category structure? Does a filtered match keep its place? |
| J1-3b | What Stays | The spot check at Customers. A dot after its count means some are kept; switch to Kept. Then open Orders: Closed, with Kept greyed out. | Will an SC notice what stays, and does it hold up when the kept list is long? |
| J1-3c | A Long Type List | Every type Clear knows (11). Then set "Data types" in this panel to "15 (more than fit)". | Does the left column hold all 11 without growing, and scroll inside itself past that? |
| J1-3d | The Result | What pressing Clear shows: the run, then how it ended. One setting could not be reset (a list Commerce cannot write back). | Does the result say what is left and lead the SC to the fix? |
| J1-4 | Choosing Websites | Clear Commerce Instance, step 1: tick websites. | Each website names the projects using it. Clear enough to choose? |
| J1-5 | Confirming the Instance Clear | The summary with every website ticked: the warning, the "I understand" box. Try Review Records and Back. | Enough to stop a mistake? |

## J2: Installing a Datapack

Plan: overview.md, Phase 3 (Save Your Changes First; locked types), Phase 4 (one run window, ending small), Phase 5 (flyout actions, Switch), D6 (Dry Run).

| Step | Title | Do this | Judge this one thing |
|---|---|---|---|
| J2-1 | The Changes | No datapack installed yet. Click Bodea, then Install in its flyout. | What Bodea adds, one row per type; Review Records for the records. Clear? |
| J2-2 | The Install Run | Install runs. "Install ends" in this panel picks how it ends. | One run window with steps; a clean run ends on the small result. Right? |
| J2-3 | Replacing a Pack | The demo uses My Luma. Click Bodea, then Install. "Commerce holds" in this panel adds unsaved changes. | "Switch to Bodea?" with what Bodea adds; with unsaved changes, "Save Your Changes First?" next; then the run. Right? |
| J2-4 | Dry Run | Dry Run in the J2-1 window. "Dry Run result" in this panel picks the answer. | Passed, Found a Problem (Fix with AI), Failed (Retry). Right? |

## J3: Saving, Creating, Undoing

Plan: overview.md, Phase 2 (versions the SC never manages), Phase 5 (Save Changes says what it saved), Phase 7b (Create Datapack).

| Step | Title | Do this | Judge this one thing |
|---|---|---|---|
| J3-1 | Save Changes | The demo uses My Luma. Press Save in the header, then Save. "Save (J3-1)" in this panel opens Save As New, from your datapack or from Bodea. | Save shows what My Luma will hold, then "Saved to My Luma"; Save As New asks only a name. Right? |
| J3-2 | Create Datapack | No datapack of yours yet. Press Create Datapack in the header. | What it holds first, then the name with Create. Right? |
| J3-3 | Undo Last Save | The demo uses My Luma. Click My Luma, then More, then Undo Last Save. | "Undo Last Save?", then Commerce goes back through the same run window. Right? |

## J4: Restoring

Plan: overview.md, Phase 5 (Restore label, amber dot, the Restore question), Phase 3 (nothing to do ends at the check).

| Step | Title | Do this | Judge this one thing |
|---|---|---|---|
| J4-1 | The Amber Dot | The demo uses My Luma. Hover the amber dot on its card, then click the card. | "Newer save available". Clear? |
| J4-2 | Nothing to Change | Restore My Luma when Commerce already matches the last save. "Commerce (J4)" in this panel picks what Commerce holds. | The check, then "My Luma Is Up to Date", closing itself. Right? |
| J4-3 | Restore | Restore My Luma with "Commerce (J4)" on Unsaved edits, then on Newer save. | "Restore My Luma?" / "Commerce goes back to My Luma as you last saved it. Anything you changed since is lost.", Cancel / Restore. Right? |
| J4-4 | The Restore Run | Restore runs. | Run window, then the result. Right? |

## J5: Uninstalling and Long Jobs

Plan: overview.md, Phase 4.

| Step | Title | Do this | Judge this one thing |
|---|---|---|---|
| J5-1 | Uninstall | The demo uses My Luma. Click My Luma, then More, then Uninstall. "Commerce holds" in this panel adds unsaved changes. | "Uninstall My Luma?" with what goes; with unsaved changes, "Save Your Changes First?" next, three buttons on one line. Right? |
| J5-2 | The Uninstall Run | Uninstall runs. "Uninstall ends (J5)" in this panel picks how it ends. | Drawn as steps, like Install. Right? |
| J5-3 | Background Success | Uninstall runs. Press Run in Background. | Closes on its own, in the result's own words. Right? |
| J5-4 | Background Failure | Uninstall runs with "Uninstall ends (J5)" on Fails. Press Run in Background. | A notification that stays, with one button. Right? |

## J6: A Failed Install

Plan: overview.md, Phase 5 (error state as integration cards show one).

| Step | Title | Do this | Judge this one thing |
|---|---|---|---|
| J6-1 | The Card | My Luma's install failed when the project was created. Look at its card. | Error dot and "Install failed", no border change. Right? |
| J6-2 | The Flyout | Click My Luma. Press Retry. "Retry ends (J6)" in this panel picks how it ends. | Why it failed, and Retry. Right? |
| J6-3 | Fix with AI | Two retries have not helped. Close, then click My Luma. | Fix with AI. Right? |
| J6-4 | The Dashboard | The project dashboard. Hover the dot beside Datapacks; click the card to open the project's Datapacks. | "My Luma" with the error dot, "Install failed" on hover. Right? |

## J7: Resetting or Deleting a Project

Plan: overview.md, Phase 6.

| Step | Title | Do this | Judge this one thing |
|---|---|---|---|
| J7-1 | Reset One Project | Open Kukla Luma's menu and choose Reset. It opens the batch window with one row (today the product asks a single reset in VS Code dialogs instead). | Should one project's Reset open the batch window with one row, as shown? |
| J7-2 | Reset Several | Press Reset Selected. "Commerce holds" in this panel adds unsaved changes, so the save question follows. | "Reset 3 Projects?", then "Save Your Changes First?" as for Switch and Uninstall. Right? |
| J7-3 | Delete a Project | Open Kukla Luma's menu and choose Delete. Delete Selected in the header opens it over all three. | The approved delete window, with one row. Right? |

## J8: The Datapacks Screen

Plan: overview.md, Phase 7.

| Step | Title | Do this | Judge this one thing |
|---|---|---|---|
| J8-1 | The Header | Look at the header. "Datapacks screen (J8)" in this panel switches to the Datapack Library. | The save button (Create with none), Install from File (or Add from File in the library), Clear. Right? |
| J8-2 | A Card | Look at a card. | One-line tag, "Mine", one date format. Right? |
| J8-3 | The Flyout | My Luma's flyout is open. Press More. Then try Bodea, and the Datapack Library. | Save as File, Share; Uninstall and Delete in their own section, bare verbs. Right? |
