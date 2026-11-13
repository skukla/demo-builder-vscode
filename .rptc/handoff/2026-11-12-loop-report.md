# Loop report, 2026-11-12 (owner away): datapack simplification

Live notes; rewritten as the final report at the loop's close.

## Rails for this run
- Branch commits on fix/release-walk-fixes only (owner-authorized for this plan); never pushed.
- No live Commerce, cloud or consent-gated writes. Every engine phase's live cycle goes to the
  walkthrough queue below.
- Each slice: test first (rptc:feat), gate with exit codes captured, then commit.

## Progress
- Phase 2 slices 1 to 4 done before the loop started: c4a7a6ca7, 0294c163e, a2b0a0076, 4e8bb0678.
- Phase 2 slice 5, engine: da0fe7f4c. Undo Last Save installs the save before the newest over it,
  drops unsaved changes, and deletes the newest only after the job succeeds; it keeps a save another
  project uses or one shared in a project file. New agent tool undo_last_save (asks first).
  Evidence: 13 handler tests and 3 watcher tests written first and seen failing; 451 suites, 11,455
  tests pass; both typecheckers and lint clean.
- Phase 2 slices 5 (screen) and 7: 2872053b8. Undo Last Save in the flyout's More menu with
  "Undo Last Save?" (blue Undo); Version History deleted; saves named by the datapack, never a date
  ("Install My Luma", "Saved to My Luma", "Permanently deletes it."). Full gate green: 2,395 suites,
  38,489 tests, lint, both typecheckers, duplication and dead-code checks.
- Phase 2 slice 8: eb13bdd2e. Agent tool text, consent copy, the generated import-datapack skill and
  the MCP server doc say saves, not versions; undo is undo_last_save. 469 suites pass.
- Phase 2 slice 6: 3aeac5650. Restore My Luma on the demo's datapack: check first; "My Luma Is Up
  to Date" when nothing changed; "Restore My Luma?" only with unsaved edits; a newer save alone runs
  without asking; a same-version restore is a real uninstall and reinstall. New agent tool
  restore_datapack. Also fixed: undo_last_save ignored its waitSeconds. Full gate green (2,397
  suites, 38,523 tests); closing scans clean.
- **Phase 2 code complete.** Live cycle owed (walkthrough queue).
- Phase 3 to 5: the install window's rebuild plan is written (step-03.md, 8 slices). Building the
  slices that need no product answer first (S1, S4's groundwork); Q1 to Q8 are parked below.
- Phase 4, S1: one rule for when a run ends small, shared by the install, Updates, the projects
  batch and the shared progress window, and one RunFoot under every run's rows. Fixed two real bugs:
  a save with a problem on one row and no warning ended small and hid it; an Updates run with a
  warning but clean rows ended small. Full gate green (2,399 suites, 38,558 tests).
- Phases 3 to 5, S2: every datapack job records its purpose, and the run window's titles come from one
  table: "Switching to Bodea", "Restoring My Luma" ending "My Luma Restored" (Restore) or "Last Save
  Undone" (Undo), "Couldn't Install Bodea" in place of "Install Stopped". Full gate green (2,400
  suites, 38,583 tests).
- Phases 3 to 5, S4: a first install now opens the new window, one window per step: the check, the
  type table with Review Records (Back only), Dry Run in its own small window, the run, the small
  result. No checkboxes or pickers. A switch, a reinstall and Uninstall stay on the old window until
  S6 and S7. Full gate green (2,404 suites, 38,647 tests). Owed: the visual check of its new style
  rules (batched at the end), a look on screen, and the live cycle.
  Notes for later slices: two functions (the job hook, the window picker) run past the 50-line
  guideline; categories in Review Records are a flat list until the tree list moves to core (Phase 6).
- Phase 4, S5: 09e4978eb. A Dry Run that finds a problem offers Fix with AI; the prompt is built from
  what the extension recorded about the Dry Run (fix the datapack, check again, report, never install
  without asking). Full gate green (2,405 suites, 38,663 tests).
- Phases 3 and 5, S6: a switch opens the new window: "Switch to Bodea?", then "Save Your Changes
  First?" only with unsaved edits (counts by type, no box; Switch Without Saving, Cancel, Save and
  Switch), an editable "My Luma" name only when the datapack is not the SC's (Q1's recommendation,
  following J7-2), the run "Switching to Bodea", and the one-time tip after the first answer. The
  always-save box and its writer are gone; the setting stays, with glossary words. Full gate green
  (2,408 suites, 38,698 tests).
- Phases 3 to 5, S7: 176a9e756. Uninstall opens the new window ("Uninstall My Luma?" over the type
  table, red Uninstall, no store name; the save question only with unsaved changes; the run as steps;
  "My Luma Uninstalled"). Every screen path now uses the new window, and the old install window, its
  form, pickers, removal confirm and spinner are deleted, after their still-true tests were ported
  (each dropped case names the decision that ended it). Full gate green (2,399 suites, 38,432 tests).
- Correction (mine): the plan said to rethink the window's host past 200 lines; it passed that at S6
  and I missed it. Split done (754e6cec1): host 148 lines, hook 146, every test unchanged; the
  data-installer doc now matches the window as built.
- Phases 3 and 5, S8: ac2229149. Restore's check runs in the window ("Restore My Luma", then "My Luma
  Is Up to Date", "Restore My Luma?", or straight to the run), per the walked prototype (Q6's
  recommendation). Full gate green (2,400 suites, 38,454 tests).
- **The install window's rebuild (step-03) is done except S3** (background endings), which waits on
  Q4. Owed: live cycles for install, switch and uninstall; a look on screen at every window's height.
- Visual check, batched: today's code built with the stylesheets as they were before this run and as
  they are now (the type table's new rules, seven removed form rules, the removed add-demo note rule).
  Compared on the wizard, dashboard and Data Installer screens at two themes and three widths: no
  element moved. Control: the new build holds the new rules and none of the removed ones. The check's
  sample screens do not open the new install window, so its own look still needs a look on screen.
- Phases 5, 7 and 7b: the screen plan is written (step-04.md: three behaviour-preserving splits, then
  ten slices). It found Delete Store Configuration, Add Unused Items and the flyout's Install over
  another datapack still in the product, and a failed creation install recorded nowhere.
- Step-04 R1 to R3: c3f663f24. Behaviour-preserving splits (the catalog view under its size cap, the
  flyout's menu words in their own module, a core step list for the save run). Full gate green (2,403
  suites, 38,474 tests).
- Found by R1 (an old defect): the flyout was meant to wait for the project's first answer (walk
  F92) but never did, a null-versus-undefined check. Being fixed now, with the header's save button
  (S1), which is built to P4-Q4's recommendation where a datapack has no install record.
- F92 and step-04 S1: 6a7e13d28. The flyout waits for the project's first answer in a project's
  Datapacks (two causes fixed). The header's save button is one state that never changes its words:
  waiting, Create, Save (Save, Save As New), Save As New, or none with no install record. Full gate
  green (2,406 suites, 38,507 tests). Not wired: Install from File opening the install window; folded
  into P4-Q10, since it needs the dialog's words and an undo case decided.
- Step-04 S2: 608a811ec. "Save Changes to My Luma" (read-only type table, "4 changed", Review
  Records, no line) and "Save As New Datapack" (one name field, empty or "My Luma" from someone else's,
  error room kept). Add Unused Items removed from the screen and the agent tools; the save refuses a
  taken Save As name. Fixed on the way: a store-less datapack was treated as a library one in two
  places. Full gate green (2,407 suites, 38,521 tests). Note: until AI_CONTEXT_VERSION is bumped after
  Phase 8, existing projects' agent skill still describes the removed inputs (the tools refuse them).
- Step-04 S3: 2a368ad9c. Create is two windows: a wide picker with everything ticked (Cancel, Next),
  then the name (Back, Cancel, Create), ending "My Luma Created". The save only takes item lists, so a
  type ticked whole is read when Next needs it (a spinner on Next; can take seconds on a big store).
  The spinner on Select All Data and its shared code and styles are gone (nothing else drew them).
  Full gate green (2,407 suites, 38,534 tests).
- Step-04 S4: f86881bac. A save's window shows "Export from Commerce" with its data types under it
  ("2 of 5 data types"), then "Save My Luma" as its own row. Found on the way: a failed save used to
  drop every row and show only the sentence; it now ends on the row it stopped on, a failed write on
  the save row. Agents see no change. The steps' styles (bold titles, spacing) moved to the shared
  row stylesheet, so the save's steps in the shared progress window look like the install window's.
  Style check: no element moved on any of the nine screens (the sample screens draw no run steps, so
  how the save's steps look is for the owner's screenshot pass). Full gate green (2,407 suites,
  38,548 tests). Live save owed.
- Step-04 S5: e1ec0378a. The datapack panel: Install, "Switch to Bodea" over another installed
  datapack, "Restore My Luma" on the installed one; no save buttons (saving is the header's); the
  More menu in short words (Save as File, Undo Last Save, Share or Stop Sharing; then Uninstall,
  Delete). Delete reads "Delete My Luma?" / "Permanently deletes it." and is hidden on Demo Builder
  datapacks for everyone. The library panel's bar is the More menu alone. Delete Store Configuration
  left the panel; the file load's row stays (P4-Q7). Only the Datapacks screen draws this panel; no
  styles changed. Full gate green (2,408 suites, 38,556 tests).
- Step-04 S6: 899c1e35c. Cards say "Demo Builder" (and the Show choice "Demo Builder Datapacks");
  every card and panel date uses one format ("Saved Nov 10, 9:15 AM"); the amber dot says "Newer save
  available" exactly when Restore would install a newer save (one rule shared by Restore and the
  card). Measured in the real stylesheet: on the narrowest card (240px) the date and a tag do not fit
  one line; the tag now stays on the date's line and the date wraps (before, the tag dropped below);
  at 300px all fits. Full gate green on the committed code (2,407 suites, 38,558 tests).
- Step-04 S7: 4084adc9e. A datapack install that fails during project creation (or an Edit) is now
  recorded on the project: which datapack, why, when, and how many retries. A partly installed run
  counts as failed (P4-Q11 as recommended). A later success clears it; a later failure adds a retry;
  anything that makes the project name another datapack or none clears it. Agents see the same
  failure and reason when they ask where a datapack would install. Shared project files never carry
  it (pinned by a test). Old projects show nothing. Full gate green (2,408 suites, 38,606 tests).
- Step-04 S8 (the failed install on screen): next.
- Phase 1b, done while waiting: ERP Downtime (863c5c2ca) and Edit Demo Package (f8ece2e6e) moved
  onto the Form layout, whose failure line is what both waited for. Same words; Cancel beside the
  commit, as every form; a read failure is a result window with Close. An unused style rule removed.
  Stopped there: the other nine change size or layout, and nothing here can show how they look (the
  visual check's sample screens never open these dialogs). They stay last, before the owner's
  screenshot pass, as the plan orders.
- Left for the run window's rebuild (Phases 3 to 5): the Undo run titled "Restoring My Luma" and
  ending "Last Save Undone"; the same-pack replace step still reads "Uninstall the Previous Version".

## Retracted / corrected
- S6 was committed before its gate passed: the commit command did not depend on the gate's result,
  and one test had failed (a token check reading git's file list still named a file the slice had
  deleted but not yet committed). The test passed once the deletion was committed, and the full gate
  then passed on the committed code. Nothing was pushed. Every commit since depends on the gate.
- Before the loop I told the owner step-02.md recorded why slice 3 refuses rather than repoints. It
  did not: a hook blocked that command before it ran, and only the file was committed. Recorded now
  (cb22d910a).

## Walkthrough queue (for the owner)
- Eleven more questions from the screen plan (step-04.md, P4-Q1 to P4-Q11), each with a
  recommendation: Create's result title; named versions on cards; what Save Changes counts; the header
  with no install record; Fix with AI across reopenings; Delete on a named version; the file load's
  undo row; agents deleting Demo Builder datapacks; which wizard card shows the type list; Install
  from File over an existing datapack (and whether Install from File opens the install window after
  the load, with what words, and what if the load is undone first); a partly installed creation install.
- Eight product questions from the install window's plan (step-03.md section 4), each with a
  recommendation: Q1 Save As name in a one-row save question; Q2 agents installing a subset; Q3 a
  clean install's leftover lines; Q4 how a background success ends in VS Code; Q5 failed titles for
  Restore and Undo (built as "Couldn't Restore My Luma" and "Couldn't Undo Last Save", the house
  "Couldn't …" rule; change if wanted); Q6 Restore's check in a window; Q7 the store name leaving the Uninstall title;
  Q8 installing a pack Commerce already matches.
- Q11 (from S7): installing another version of the same datapack (a team datapack's "main" or
  "eds-compatible") was never walked. Built as the switch flow with Install words: "Install Bodea,
  eds-compatible?", button Install, run "Installing …". Recommend keeping it.
- Q10 (from S6): the prototype shows Retry after a stopped switch, but a switch that stopped after
  the old datapack was uninstalled is not a simple repeat. Offer Retry (re-run the install of the new
  datapack only), or Close only? Recommend Retry installing the new datapack, since the old one is
  already out, and say so in the run's problem line.
- Q9 (from S1): a run with a problem on one row and no overall warning now stays open, but its title
  is still green. Should a problem row alone turn the title amber? Recommend yes: the title says how
  it ended, and a problem is not a clean success.
- From S3: (a) should the save accept "this whole type" so Create needs no read on Next? That changes
  what the extension and agent tools accept; recommend not for beta.153. (b) A wholly ticked type shows
  "N selected", not the prototype's "48"; recommend keeping it. (c) The search still matches hidden
  details (SKU, email); recommend keeping it, since SCs search by SKU.
- From S4: words chosen where nothing decided them: the failed rows say "Stopped" and "Not run";
  the save row's spinning line keeps the engine's words ("Saving to My Datapacks", "Finishing the
  save"); a failure after the reads but before the write ("nothing to save", "the install would
  refuse it") lands on the save row. Recommend keeping all three.
- From S5: P4-Q6 matters now. On a datapack with named variants (Bodea's "main"), Delete removes only
  that variant, so "Permanently deletes it." overstates it. Recommend Delete removes the whole
  datapack, as P4-Q6 says. Also: Share stays on the SC's own Demo Builder datapack, as before.
- From S6: (a) the narrow-card look above, for the screenshot pass; (b) a Demo Builder datapack's
  "main" updated in place no longer shows a dot (the dot now means a newer save); want that signal
  back with its own words? (c) the agent tool mark_team_datapack still says "team datapack"
  (Phase 8 will align agent words).
- From S7: (a) a creation install that was SKIPPED (no website or store recorded, no Commerce
  instance) is not recorded as failed, so the card still shows the installed check. Recommend: show
  it as not installed rather than failed (Retry would only skip again). (b) Found, old: a project
  reset that uninstalls the datapack never clears which datapack the project names (only the
  Datapacks screen's Uninstall does), so after a reset the card still shows the check. Recommend the
  reset clears it, as Uninstall does; built with Phase 6 (reset and Clear) unless you say otherwise.
- Phase 2 live cycle on the test store (save twice, Undo Last Save, Restore, reinstall with nothing
  sent, uninstall), once Phase 2 is built.
