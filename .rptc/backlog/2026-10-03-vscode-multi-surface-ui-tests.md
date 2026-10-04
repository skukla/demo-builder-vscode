---
id: PL-66
kind: feature
area: platform
needs: []
value: low
status: built
---

# UI tests that drive more than one VS Code surface

Filed 2026-10-03 from PL-46 (answered 2026-09-08, f192a1c17, a6fa1af43). Real-VS-Code
functional tests exist for the sidebar. The multi-surface attempt (sidebar plus an editor
webview) stopped on 2026-09-08 with its traps recorded on PL-46. Known weakness of the shipped
test: it passes only because no editor webview is open when it runs, so its result depends on
run order. Start by making that test independent of order, then add one journey that crosses
two surfaces.

## Shipped so far

- 2026-10-04  BUILT, NOT RUN (night3-a, uncommitted). The sidebar UI test now checks WHOSE text it read: each surface has a word only it shows (sidebar 'Utilities', wizard 'Setup Progress'); another surface's word fails at once, and the wait runs past 'Loading...' (tests/helpers/uiSurfaceText.js, 7 jest cases incl. the 2026-09-08 wizard-read). Order independence: each case sets its own state - one closes all editors, one opens the wizard as an editor webview, reads it, THEN reads the sidebar. New journey tests/ui/journey-sidebar-tools-to-wizard.test.js: sidebar Tools tile -> palette prefilled '>Demo Builder: ' (asserted) -> Create Project -> wizard shows its rail; stops before anything that creates. Traps 2/3 handled in tests/ui/surfaces.js (Close All Editors by command; leaving a frame blurs it so the keyboard returns). HARNESS: npm run test:ui is now tests/ui/run.mjs - it copies the tree to /tmp/dbv-ui/stage and packages THERE, because extest setup-and-run ran vscode:prepublish = npm run compile into the checkout's own dist/. VERIFIED --build-only: VSIX 70 files 7.57 MB, checkout dist mtimes unchanged. NOT RUN: no cached VS Code 1.136.1 or ChromeDriver on this machine, and the loop may not use the network. Owner runs: npm run test:ui (first run downloads VS Code + ChromeDriver; opens a VS Code window while it runs). Unverified until then: the blur fix for trap 3, and that hidden retained webviews do not out-rank the active editor for new WebView().
- 2026-10-04  2026-10-05 Built in 0f4d01ba2; not yet run against a real VS Code (npm run test:ui needs a download).
