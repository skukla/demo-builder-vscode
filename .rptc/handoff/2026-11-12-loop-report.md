# Loop report, 2026-11-12 (owner away): datapack simplification

## Summary (loop closed 2026-11-13)

Every phase of the datapack simplification is built and committed on fix/release-walk-fixes
(Phases 2 to 8, plus Phase 1b's windows). Each commit passed the full gate; the last run was
2,425 test suites and 38,858 tests. Nothing is pushed.

What is left needs you, in this order:
1. **Push go**: this branch, and the ERP integration's local branch fix/shared-order-cases (f64bd32).
2. **Live cycles on the test store** (they write to a real store, so they wait for you): Phase 2's
   saves, Undo Last Save and Restore; install, switch and uninstall; batch and agent reset; Clear
   Demo Data; Clear Commerce Instance; the held-attribute cases. Listed per slice below.
3. **Screenshot pass**: the visual check cannot open dialogs, so every resized window needs your eyes.
4. **Six windows Phase 1b left alone** (Share, Add a Demo, Add Integration, Setup Guide, the projects
   batch run, the Updates run): one decision each, recommendations in the walkthrough queue.
5. **The open questions below**, each with a recommendation. The ones that change what happens to real
   data come first: P5-Q3, P5-Q4, P5-Q5 and R1 (a) and (b).
6. Step-03's background-ending question (Q4), then cut beta.153.

Record check at close (rptc-hygiene-scan): backlog valid (379 items), no dead links, nothing
unindexed. Eleven old line citations point at moved or deleted files; none come from this loop's
work, and most point into the ERP repositories, so they were left alone.

---

Live notes from the run follow.

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
- Step-04 S8: a246381f8. A failed install shows on its card (red dot, "Install failed", no check,
  no border) and in the panel (the label and the reason, then Retry). Retry starts the install and
  opens the install window on it; after two failed retries the button is Fix with AI. A Retry that
  works makes the card show installed again. Agents can do the same (read the failure, start the
  install again). No styles changed. Full gate green (2,409 suites, 38,627 tests).
- Step-04 S9: 16a8ecbea. The dashboard's Datapacks line says "None" with no datapack; a failed install
  keeps the bare name and adds the red dot, its hover "Install failed". No agent tool reads this line.
  Full gate green (2,409 suites, 38,632 tests).
- Step-04 S10: 92bcdbc97. A search that finds nothing under the filter choice on view but finds
  datapacks elsewhere says so ("No matches in Recommended. 1 in Community Datapacks.") with a button
  there, on the Datapacks screen and the wizard. Load from File drops its Replace checkbox: the button
  reads "Replace Existing" only when the SC's own library already holds that datapack. Six unused
  styles deleted (none referenced). The builder raised a limit on the Title Case check to allow a
  label built at run time; undone, the labels are written out and the check proved to read them.
- Step-04 closed: f82e98082. The closing scans found no import cycles and no stale doc names; one
  declared request shape nobody used turned out to be the Review Records request, whose two senders
  passed an untyped object; both now use it (a misspelt field is rejected). Full gate green
  (2,410 suites, 38,653 tests). Phases 5, 7 and 7b are built.
- Phase 6 plan: b1a767f1b (step-05.md). Found: the one-project reset and delete still use VS Code
  dialogs; reset still offers Clear (removed 11-12); a batch reset offers Uninstall Datapack and then
  ignores it; a VS Code dialog can appear mid-batch for an added demo whose content site is
  unreachable. Clear gets its own planning pass (P5-Q9). decisions.md corrected: the order rule's
  live test passed on 11-11.
- Step-05 R1: a6df67dad. A reset, batch reset, delete or Edit that uninstalls the datapack now stops
  naming it when everything came out of Commerce (the Datapacks screen Uninstall's rule); it keeps
  the name when part was left, the removal failed or was skipped. Only the project record changes.
  Full gate green (2,410 suites, 38,668 tests). Live reset owed.
- Step-05 R2: 208fb758a. The "Save Your Changes First?" window's frame moved to shared code, so
  the batch reset and delete can use the same window as Switch and Uninstall. Switch and Uninstall's
  tests pass unedited; style check: nothing moved on the nine screens, and the moved rule measured
  in the Datapacks screen matches the old one. Full gate green (2,411 suites, 38,672 tests).
- Step-05 S1: 29a59686f. Reset and Delete Selected: when a datapack being removed has changes, the
  red button opens "Save Your Changes First?" with a Datapack / Save As row per datapack (own under
  its own name, someone else's "My Bodea"), buttons "Reset Without Saving", "Cancel", "Save and
  Reset". The old Datapack Changes step is gone. Found: the run never read the answer for the SC's
  own datapack (it always saved first), so Without Saving and a typed name would have been ignored;
  fixed. An independent review found no path that loses changes, saves into the wrong datapack or
  removes one nobody was asked about; its one finding (two projects on one own datapack could not
  both save into it) is fixed and pinned by a test proven red on the old rule. Full gate green
  (2,411 suites, 38,690 tests). Live batch reset owed.
- Step-05 S2: 851fa48e1. A project's Reset or Delete on the projects list opens the batch window
  with one row instead of VS Code dialogs: "Reset Kukla Luma?", button "Reset", "Resetting Kukla
  Luma", "Kukla Luma Reset" (P5-Q1 as recommended). Several projects keep their words. The list's
  old one-project handlers are gone; the dashboard keeps its own until S4; agent tools unchanged.
  Full gate green (2,411 suites, 38,687 tests).
- Step-05 S3: c65799909. The batch window no longer grows on screen: while it reads, only a
  spinner with today's words shows where it will open; it appears once, at the questions' size
  (the install window's own mechanism). The run opens as its own window. Full gate green.
- Reset stops offering Clear: b9c1946b2. The one-project reset (list, dashboard, Edit) no longer reads
  the store or asks "Clear Demo Data Too" (owner 11-12). Clear Demo Data itself is unchanged. Full
  gate green (2,411 suites, 38,687 tests).
- Owner answered P5-Q2, Q3, Q4 and Q9 on 11-13 (all as recommended); recorded in decisions.md.
- Clear plan: 7a0dc5d3b (step-06.md). Owner answered P6-Q1 to Q4 on 11-13 (recorded in
  decisions.md): Clear warns and never refuses; Clear Commerce Instance uses the batch save question;
  failed reads split by kind (per-kind proposal with the owner); the shared order-state table is
  built in beta.153.
- Step-05 S4: bd9a5c987. The dashboard's Reset opens the one-row batch window there; its Delete
  opens the projects list on its one-row Delete window (owner's P5-Q2). Style check: nothing moved
  on the dashboard, projects list or integrations. Found by that check: the projects list threw on
  every load reading an answer with no data; fixed, with the same latent read in the Updates
  hand-off, both pinned by tests proven red first. Full gate green (2,411 suites, 38,705 tests).
- Owner answered P6-Q3 on 11-13: failed reads in Clear reuse only existing pieces (recorded).
- Step-05 S5: 3e947288b. The one-project reset and delete code nothing calls is deleted (the confirm
  dialog path, the reset notifications, resetProjectWithUI, deleteProject, deletionConfirmation.ts
  and more); tests that reached live code through it now drive the batch's functions; the batch,
  Edit and agent-tool suites unedited. Found: a batch EDS reset that succeeds with warnings (code
  not published, pages undone, mesh redeploy failed) no longer shows them; that came with S2 and S4.
  Fixing next. P5-Q8's mid-batch dialog is still reachable. Full gate green (2,405 suites, 38,551
  tests).
- Step-05 S6 and the reset warnings: 919ee94b4. A ticked Uninstall Datapack now uninstalls on every
  reset, not only storefronts (owner's P5-Q3), after the reset checks it can rebuild; a successful
  reset's warnings show as orange lines on its row, from the agent tool's own summarizer; a failed
  row still says what happened to the datapack. An independent review found nothing blocking; its
  should-fix (the removal ran before the rebuild check, so a reset that could not rebuild still
  emptied the store) was fixed and proven by tests that failed with the old order. Full gate green
  (2,406 suites, 38,580 tests). Live reset owed.
- Step-05 S7: 8d038a566. The agent's reset_project can uninstall the datapack with the same save
  answers as the window (owner's P5-Q4), through the same code as the button; a datapack with
  unsaved changes and no answer is refused and nothing is reset. Aligned on the way: changes 'drop'
  meant something narrower in delete_project than in the windows; both tools now match the windows'
  Without Saving. Full gate green (2,408 suites, 38,606 tests). Live agent reset owed.
- Reset and delete (step-05) are built, except P5-Q8 (the mid-batch dialog), which is yours.
- Step-06 C1: fc5edf517. The indented category tree is a shared component; Create Datapack's
  categories show as that tree, ticking unchanged. The filter now matches a category's own name (as
  the prototype does), not its full path. Style check: nothing moved; the tree's rules measured in
  the Datapacks screen. Full gate green (2,410 suites, 38,626 tests).
- Step-06 C2a: f28dc929a. Clear works on every website the project uses, whole (no store picker),
  with a full list per type and no kept reasons; a website another project uses warns and Clear
  continues (owner's P6-Q2); failed reads split by kind from existing pieces (P6-Q3). An independent
  review found one blocking problem (with orders unread, the ERP integration was still asked to close
  those stores' orders); fixed, with: the count matching what the clear removes (the datapack's records
  are left for C3's uninstall), records another project lists kept, categories a remaining cart rule
  uses kept, categories left alone when products or cart rules are unread, access-refused reads
  offering Open Commerce Admin, and the agent's consent naming the websites. Nothing is deleted that
  was not before. Full gate green (2,410 suites, 38,621 tests). Live Clear owed after C3.
- Step-06 C2b: 07861c7d6. The Clear window as walked: "Clear Bodea Demo Data?", the type table,
  Review Records with Removed and Kept tabs (the notice dot on kept counts, categories as a tree),
  red "Clear N Items"; failed reads with the agreed offers. The install window's shared pieces are
  unchanged (its tests unedited); style check: nothing moved. Full gate green (2,411 suites, 38,648).
- Step-06 C3: 07950f078. Clear Demo Data is complete: pressing Clear asks "Save Your Changes First?"
  when the datapack has changes, uninstalls the datapack through the engine's own removal, then clears
  the rest, in one run window ending with Open Commerce Admin for what Commerce cannot reset. A failed
  save or removal stops before anything else is cleared, with Retry. Two independent reviews found
  real data-safety problems, all fixed: the uninstall deleted attributes another demo's products still
  used (the engine now keeps them, which also changes plain Uninstall); a window that read no changes
  told the uninstall to drop changes, so later edits were lost unasked (it now sends no answer and the
  extension reads fresh, asking when needed, in Clear, Uninstall and Switch); a Data Installer datapack
  is forgotten only when nothing of it can be left; Retry works after an early error; two clears at
  once cannot both uninstall. Full gate green (2,415 suites, 38,712 tests). Live cycle owed: install,
  reinstall with nothing sent, Clear, a second Clear changes nothing; plus a store where another demo's
  product and one where your own product carries a datapack attribute.
- Step-06 C4: 55b4065f5. Clear Commerce Instance: choose websites (each shows which projects use
  it), then the summary, the warning and "I understand". Each project whose datapack sits wholly on
  the chosen websites of this instance is uninstalled first (the batch save question for unsaved
  changes; its project file written without switching), then the chosen websites are cleared. Two
  independent reviews found real problems, all fixed: a datapack also on an unchosen website was
  being uninstalled from there too (now it stays, and the window says so); a project whose Commerce
  address was spelled differently could be wiped while still naming its datapack (now matched on the
  key the uninstall uses, and unmatched projects stay protected); an older datapack's data and data
  left on purpose stay protected; the engine now keeps a customer group a remaining cart rule uses
  (this also protects Uninstall, Reset and Delete); the list is re-checked before any uninstall.
  Full gate green (2,420 suites, 38,764 tests). Live cycle owed: two projects on one website, a
  datapack also on a second website, a project with an older datapack's records.
- Step-06 C5: 335cb189e. The Datapacks header's Clear button is a Clear menu (Clear Demo Data, Clear
  Commerce Instance); two Command Palette entries open the current project's Datapacks with that
  window open, refusing without a project or a Commerce backend. Full gate green (2,422 suites,
  38,794 tests).
- Step-06 C6: 62ef1ad06. Agents can now do everything both Clear windows do: check_demo_data takes a
  website choice, and the new clear_commerce_instance clears the chosen websites (needs the instance
  check's token and "I understand"; its consent names the websites, the projects uninstalled first,
  those that keep their datapack and those that lose their demo data). The agent test set's clear
  prompt was out of date (stores, "didn't install"); rewritten, and a prompt added for the new tool.
  Found: the agent-reach scan cannot see the Clear handlers (it only reads one way of registering
  them); recommended as its own fix. Full gate green (2,423 suites, 38,812 tests).
- Step-06 C7: 4cdce1289. The shared progress window keeps one height: a row's problem takes that
  row's second line (one line, full text on hover), and the closing sentence under the rows goes
  when a row already says it; warning notes are orange; a status icon no longer grows a window's
  title row. Style check: nothing moved on the nine screens; the new rules measured in the Datapacks
  screen (orange #e87400). Full gate green (2,423 suites, 38,823 tests).
- Clear (step-06) is built: C1-C7. No import cycles. Live cycles owed (listed per slice above).
- The shared order-state table: ac4a6923a. The order reset rule's seven cases live in one data file
  here; the ERP integration keeps a byte-identical copy, and both repos pin the same fingerprint, so
  a change in one without the other fails a test. The two copies already matched (only this repo's
  header was stale). The ERP half is committed on a local branch there (commerce-erp-integration,
  fix/shared-order-cases, f64bd32, based on the shared main because local main was 72 commits behind),
  NOT pushed: pushing needs the owner's go. Full gate green (2,424 suites, 38,827 tests).
- Phase 6 (reset, delete and Clear) is built.
- Phase 8: 44b1b96ac. Agents match the screen: the Data Installer destination is gone for agents
  (D7; copy_library_datapack_to_installer removed, load_datapack_zip forces the library); agent Delete
  can remove a pack of saves whole, as the screen does; every datapack tool's description, narration
  and consent use the screen's words; the import-datapack guide gains a screen-to-tool table, Retry and
  the save question. AI_CONTEXT_VERSION 61 -> 62, so existing projects refresh their guides on the
  next start. The agent test set's copy prompt now checks the agent says it cannot. Full gate green
  (2,425 suites, 38,851 tests). All datapack phases (2 to 8) are built.
- Phase 1b, the last nine windows: d7f0fcd30. Three moved onto the Steps window, which opens at
  its content's height and keeps it: Manage APIs, Assign ERP Products (its way out now reads Cancel,
  beside Assign) and AI Capabilities (it no longer shrinks while Regenerate runs). A failed read or
  an empty state is now a small result window. The other six stay in the layout ledger with reasons
  rewritten to match the code; four need your decision (walkthrough queue). The Title Case check
  now reads one more label (AI Capabilities' Close), so its allowance dropped from 66 to 65. No
  stylesheet changed. Full gate green (2,425 suites, 38,858 tests).
- Phase 1b, done while waiting: ERP Downtime (863c5c2ca) and Edit Demo Package (f8ece2e6e) moved
  onto the Form layout, whose failure line is what both waited for. Same words; Cancel beside the
  commit, as every form; a read failure is a result window with Close. An unused style rule removed.
  Stopped there: the other nine change size or layout, and nothing here can show how they look (the
  visual check's sample screens never open these dialogs). They stay last, before the owner's
  screenshot pass, as the plan orders.
- Left for the run window's rebuild (Phases 3 to 5): the Undo run titled "Restoring My Luma" and
  ending "Last Save Undone"; the same-pack replace step still reads "Uninstall the Previous Version".

## Retracted / corrected
- A docs commit (c8d35d150) swept up a source deletion a builder had staged, because it was made
  with `git add <file> && git commit`, which commits everything staged; the branch did not build at
  that commit. It was the latest commit and unpushed, so it was redone with the docs file only
  (d44f49d22); the deletion went into S5. The other docs commits of the day were checked: none
  touched a file outside .rptc. Docs commits now name their paths (`git commit -- <paths>`).
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
- From S8: choices the prototype does not settle: the amber "Newer save available" dot is hidden on a
  failed card (Restore is not offered there); Uninstall stays in More when the failed run left part
  of the datapack in Commerce; Fix with AI's refusal (no failed install to fix) shows nothing, as the
  install window's Fix with AI already does. Recommend keeping the first two; the third is an old
  gap in both places worth a line on screen.
- From S9: a Demo Builder datapack's named version stays on the dashboard line ("Luma,
  eds-compatible"); the mockup showed only a save. Drop the version everywhere? Recommend keeping it
  (it says which variant the demo holds).
- From S10: (a) the filter choice "Recommended" is the one name the research says reads poorly;
  recommend keeping what it shows and you choosing a label. (b) P4-Q9, the wizard cards listing
  what a datapack holds: type names cost no extra read, but you called that line crowded on 11-05;
  record counts would need one read per card. Recommend leaving the cards as they are.
- Phase 6 questions P5-Q1 to P5-Q9 are in step-05.md, each with a recommendation. The ones that
  change what happens to real data: P5-Q3 (a batch reset with Uninstall Datapack ticked should
  uninstall it; today it ignores the box), P5-Q4 (give the reset agent tool the same uninstall
  choice the window has), P5-Q5 (a datapack whose changes could not be read gets a row; "Without
  Saving" would then lose them).
- From R1: (a) a delete whose datapack removal succeeds but leaves part in Commerce still deletes
  the project, leaving that data with nothing naming it (cannot be undone). Recommend the delete
  stops and says so. (b) An Edit whose old-datapack removal fails still records the new datapack, so
  the old one is in Commerce with nothing naming it (old behaviour). Recommend the Edit stops there.
- From S1: (a) when the "always save" setting leaves your own datapack out of the question, "Reset
  Without Saving" still saves it and the window does not say so; recommend one line saying it.
  (b) The batch window's look (the switch to the save window changes the window's size; a very long
  name may run sideways) is for the screenshot pass. (c) Each row shows the project under the
  datapack's name (two projects on one datapack would otherwise read the same); not in the mockup.
- From S2: the window's words follow the number of projects, so ticking one project and pressing
  Reset Selected also reads "Reset Kukla Luma?" ("Reset 1 Project" is gone). Recommend keeping it.
- From S6: when only a row carries warnings the window's title stays green (the same question as Q9;
  recommend amber).
- From C1: the category filter matches a category's own name (typing "gear" shows Gear, not every
  row under it), as the walked prototype does; the old list matched the full path. Recommend keeping it.
- From C2b: fix buttons sit in the footer beside Clear, one at a time (slow, then refused, then
  strange); refused and strange types get no problem line (the row says it); returns get a "Closed"
  tab like orders; a check that fails before it knows the project is titled "Clear Demo Data".
  Recommend keeping all four.
- From C5: the "I understand every project on these websites loses its data" checkbox keeps sentence
  capitals (it is a sentence); menu items are not checked by the Title Case scan anywhere (a gap in
  the scan). Recommend keeping the sentence.
- From C6: (a) every agent window's title starts "Agent ·" with a middle dot (the existing shared
  prefix, not new), against your no-middle-dot rule; change it everywhere? Recommend "Agent:".
  (b) Fix the agent-reach scan so it sees handlers built inside a function (it will then list other
  such actions as new rows to sort)? Recommend yes, as its own change after the release work.
- From C7: (a) the small data-type rows nested under the install and save steps keep a wrapping
  problem line (walk F135 chose that); (b) a warning that belongs to no row still shows under the rows,
  so that window can grow by one line in that case. Recommend keeping both.
- From Phase 8: (a) rename the old-named agent tools and guide (start_datapack_import,
  load_datapack_zip, mark_team_datapack, the import-datapack guide) to the screen's words as their own
  change? It breaks the test set and agents' habits; recommend next release. (b) The agent-reach scan
  also files anything starting with "copy" as screen-only (a second blind spot).
- From Phase 1b, six windows not moved, each with a recommendation: (a) Share: main buttons into
  the footer (Copy Link, Save File), both forms drawn hidden so it opens at the taller one;
  (b) Add a Demo and (c) Add Integration: their stages differ in height; recommend the Steps window
  held at the first stage, taller stages scroll (your 2026-11-11 rule allows that or a new window);
  (d) Setup Guide: give the Guide layout a two-pane option (step list left, chosen step right)
  rather than redesign the guide; (e) Projects Batch run and (f) Updates run: neither layout fits
  (a question under a row must hide Close, the Progress layout cannot); recommend leaving both as
  they are for beta.153. Screenshots owed for the three that moved. Also found: the hosting check
  does not look at windows built on the Steps window, so one with no dialog around it would pass
  (old gap; the three moved ones are hosted correctly).
- Phase 2 live cycle on the test store (save twice, Undo Last Save, Restore, reinstall with nothing
  sent, uninstall), once Phase 2 is built.
