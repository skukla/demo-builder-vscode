---
id: PL-66
kind: feature
area: platform
needs: []
value: low
status: backlog
---

# UI tests that drive more than one VS Code surface

Filed 2026-10-03 from PL-46 (answered 2026-09-08, f192a1c17, a6fa1af43). Real-VS-Code
functional tests exist for the sidebar. The multi-surface attempt (sidebar plus an editor
webview) stopped on 2026-09-08 with its traps recorded on PL-46. Known weakness of the shipped
test: it passes only because no editor webview is open when it runs, so its result depends on
run order. Start by making that test independent of order, then add one journey that crosses
two surfaces.
