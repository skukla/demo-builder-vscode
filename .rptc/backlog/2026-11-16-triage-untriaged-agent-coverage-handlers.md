---
id: AI-79
kind: chore
area: ai
needs: []
value: med
status: built
---

# Triage untriaged agent coverage handlers

Filed 2026-11-16 by the beta.153 codebase sweep (`ai-coverage-scan`).

16 handler types a person can reach had no triage row, so nobody has judged whether an agent
should reach them. 14 remain: `check-datapack-setup-step`, `check-recorded-datapack`,
`count-datapack-export-items`, `datapack-save-question-answered`, `fix-datapack-import-with-ai`,
`get-datapack-line`, `get-datapack-records`, `get-datapack-removal-changes`,
`get-datapack-removal-scope`, `get-datapack-setup-step`, `prepareProjectsBatch`, `recheckUpdates`,
`runProjectsBatch`, `takeUpdatesRequest`. (`deleteFromProjectsList` and `takeDeleteRequest` were
removed on 2026-11-16: the dashboard now runs its Delete in the batch window itself.)

Most arrived with the datapack simplification and the projects batch window. Several are likely UI
plumbing (`take*Request`, `datapack-save-question-answered`); some may be real gaps (`runProjectsBatch`
has `reset_project` and `delete_project` beside it). Read each, add a row to the scan's
`triage.json`, and file any real gap.

The 3 judged gaps are unchanged: `check-store-view-products`, `clear-dalive-auth`,
`github-change-account`.

## Shipped so far

- 2026-11-23  Loop 2026-11-23: built (57d910a95, on loop/2026-11-23-backlog). All 20 untriaged handlers have a row: 8 aliases, 12 exclusions, 2 new gaps (check-recorded-datapack; getShareDatapackCheck for a project without Edge Delivery). Scan: UNTRIAGED 0, REAL GAP 5. Reviewed (opus, 4 findings fixed). The two new gaps are judged, not built: whether an agent should get them is the owner's call.
