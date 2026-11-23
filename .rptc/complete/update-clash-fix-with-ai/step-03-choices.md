# Step 03: the choices, for the SC and the agent

## What

- The clash question in the Updates modal (`updateQuestionsInModal.ts`) becomes one
  question for both rows: "Fix with AI", "Leave it as it is", and on the colleague's row
  "Reset to template". The Adobe row has no reset (EDS-56).
- The file list is no longer dropped: `CategoryResult` gains
  `clashes?: { project: string; track; files: string[]; keptIn?: string }[]`, filled at
  `updateApplyTemplate.ts:104` and `:134` instead of only the error sentence.
- A storefront with a `pendingClash` shows one row on the next check: "Finish the Adobe
  boilerplate update" (or the colleague's), with a detail line saying whether markers
  remain. Applying it is step 05.

## Where

- `updateApplyTemplate.ts` (`resetTemplateOnConflict` widens to a three-way answer for the
  template track; the boilerplate track gains a two-way one).
- `updateApplyResult.ts`, `updatesApplyReport.ts`, `applyUpdatesTool.ts` (the agent's
  `categories.template` / `.boilerplate` carry `clashes`; the input gains
  `onClash: 'keep' | 'stop' | 'reset'`, replacing `resetTemplateOnConflict:true`, which is
  removed, not deprecated).
- `pendingUpdateRows.ts` and `updateSelections.ts` for the Finish row.

## Tests

- Each answer: keep (step 02 called), leave (nothing), reset (template only; refused on the
  Adobe row).
- `apply_updates` with `onClash:'keep'` returns the files and the local path.
- A `pendingClash` produces exactly one Finish row and suppresses the normal row for that
  track.

## Done when

The modal and the agent both offer the same choices and see the same files.
