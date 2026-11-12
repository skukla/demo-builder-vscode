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
- Phases 3 and 5, S6 (Switch and the save question): with a test-first builder now. Built to Q1's
  recommendation (an editable "My Bodea" name only when the datapack is not the SC's own), which
  follows the owner's J7-2 decision; the always-save setting is kept, only the box and its writer go.
- Phase 1b, done while waiting: ERP Downtime (863c5c2ca) and Edit Demo Package (f8ece2e6e) moved
  onto the Form layout, whose failure line is what both waited for. Same words; Cancel beside the
  commit, as every form; a read failure is a result window with Close. An unused style rule removed.
  Stopped there: the other nine change size or layout, and nothing here can show how they look (the
  visual check's sample screens never open these dialogs). They stay last, before the owner's
  screenshot pass, as the plan orders.
- Left for the run window's rebuild (Phases 3 to 5): the Undo run titled "Restoring My Luma" and
  ending "Last Save Undone"; the same-pack replace step still reads "Uninstall the Previous Version".

## Retracted / corrected
- Before the loop I told the owner step-02.md recorded why slice 3 refuses rather than repoints. It
  did not: a hook blocked that command before it ran, and only the file was committed. Recorded now
  (cb22d910a).

## Walkthrough queue (for the owner)
- Eight product questions from the install window's plan (step-03.md section 4), each with a
  recommendation: Q1 Save As name in a one-row save question; Q2 agents installing a subset; Q3 a
  clean install's leftover lines; Q4 how a background success ends in VS Code; Q5 failed titles for
  Restore and Undo (built as "Couldn't Restore My Luma" and "Couldn't Undo Last Save", the house
  "Couldn't …" rule; change if wanted); Q6 Restore's check in a window; Q7 the store name leaving the Uninstall title;
  Q8 installing a pack Commerce already matches.
- Q9 (from S1): a run with a problem on one row and no overall warning now stays open, but its title
  is still green. Should a problem row alone turn the title amber? Recommend yes: the title says how
  it ended, and a problem is not a clean success.
- Phase 2 live cycle on the test store (save twice, Undo Last Save, Restore, reinstall with nothing
  sent, uninstall), once Phase 2 is built.
