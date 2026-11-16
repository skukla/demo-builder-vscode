---
id: AI-79
kind: chore
area: ai
needs: []
value: med
status: backlog
---

# Triage untriaged agent coverage handlers

Filed 2026-11-16 by the beta.153 codebase sweep (`ai-coverage-scan`).

16 handler types a person can reach have no triage row, so nobody has judged whether an agent
should reach them: `check-datapack-setup-step`, `check-recorded-datapack`,
`count-datapack-export-items`, `datapack-save-question-answered`, `deleteFromProjectsList`,
`fix-datapack-import-with-ai`, `get-datapack-line`, `get-datapack-records`,
`get-datapack-removal-changes`, `get-datapack-removal-scope`, `get-datapack-setup-step`,
`prepareProjectsBatch`, `recheckUpdates`, `runProjectsBatch`, `takeDeleteRequest`,
`takeUpdatesRequest`.

Most arrived with the datapack simplification and the projects batch window. Several are likely UI
plumbing (`take*Request`, `datapack-save-question-answered`); some may be real gaps (`runProjectsBatch`
has `reset_project` and `delete_project` beside it). Read each, add a row to the scan's
`triage.json`, and file any real gap.

The 3 judged gaps are unchanged: `check-store-view-products`, `clear-dalive-auth`,
`github-change-account`.
