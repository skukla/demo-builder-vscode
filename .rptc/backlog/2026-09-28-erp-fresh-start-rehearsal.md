---
id: AB-16f
kind: feature
area: app-builder
parent: AB-16
needs: [AB-16a, AB-16d, AB-26z]
value: high
status: superseded
superseded-by: AB-53
---

# Fresh start: delete Bodea, rebuild from the setup guide, walk the journeys

Filed 2026-09-28. The owner's goal (2026-09-28): when the several-ERPs work is finished, delete
the Bodea project, clean up what development left in Commerce, create a new project from
scratch, set the demo up by following the setup guide exactly as an SC would, then walk the
client journeys.

The checklist is `.rptc/plans/several-erps/fresh-start.md` (what removal undoes, what it does
not, and the clean-up list). The journeys are `.rptc/plans/several-erps/journeys.md`.

Deleting the project is permanent and the owner's to do. Every step the guide gets wrong or
leaves out is a guide defect, filed as found.

## Shipped so far

- 2026-09-28  docs(erp): the clean-up list gains today's test orders and price list (`8f4bb9a7e`)
- 2026-09-30  2026-09-30: the code side is at a feature-complete point for this — the ERP branch and the loop branch are merged (loop/2026-09-30-erp-programme b7c228c41, pushed); demo-erp, demo-erp-2 (main 76634e9, contract v12) and erp-integration (main ad4501a, app 0.10.0 with the placement webhook) are deployed; the dev host worktree is fast-forwarded to the same commit. Owner's stated next step: a true end-to-end run and the SC demo story.
