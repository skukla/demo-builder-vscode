---
id: EDS-76
kind: fix
area: eds
needs: []
value: low
status: backlog
---

# Reset and creation record the storefront's state from what they published

Filed 2026-11-22. A code review found the two code comments below saying "Tracked in" a plan
that had finished (`.rptc/complete/pdp-prerender-validation/HANDOFF.md`, "Open items" 2), so
nothing tracked the defect. Checked against the code the same day.

## The defect

After an EDS reset and after project creation, the storefront's recorded state is taken from
the project's configs as they are now, not from the configs `config.json` was written from
earlier in the same run:

- `src/features/eds/services/reset/edsResetFinalize.ts:118`:
  `updateStorefrontState(project, project.componentConfigs || {})`
- `src/features/project-creation/handlers/executorEdsPhase.ts:310`: the same call

If the configs change between the `config.json` write and this call, the recorded state
describes a storefront that was never published, and the staleness check that reads it can miss
a real difference. The republish path had this exact bug, which broke on 2026-08-10; it now
passes what it published
(`src/features/eds/services/storefront/storefrontRepublishService.ts:198`, `publishedConfigs`). The window
here is narrower: the same run, between two steps.

## The fix

Keep the configs `config.json` was generated from, and hand that snapshot to
`updateStorefrontState` in both places, as the republish path does: through the reset's
parameters and through the creation pipeline. Then point both comments at this item's fix, or
remove them.
