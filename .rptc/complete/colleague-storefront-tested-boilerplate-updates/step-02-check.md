# Step 02: the second check

## What

`computeUpdateSelections` gains a `boilerplate` category: `{ project, from, to }` for each
project with a `boilerplateBase` whose commit differs from the current LKG.

## Where

- `src/features/updates/services/updateSelections.ts`: a `checkBoilerplate` beside
  `checkTemplates`, reusing `readLkgSha` and the comparison in `templateUpdateChecker.ts`
  `checkThinLayerUpdates` without its "has `lkgSource`" switch.
- `countSelections`, `selectionsForIds` and the `UpdateSelections` type gain the category.
- The existing template check is untouched: a colleague's demo keeps following the
  colleague's repository.
- LKG unreachable: no entry and a warning, never "up to date" (ADR-006 D1).

## Tests

- Base equals the LKG: no entry. LKG moved: one entry carrying both commits.
- A project with both an update from the colleague and a newer LKG: two entries, one per
  category.
- LKG unreachable: no entry, warned.

## Done when

The check returns both kinds independently for one project.
