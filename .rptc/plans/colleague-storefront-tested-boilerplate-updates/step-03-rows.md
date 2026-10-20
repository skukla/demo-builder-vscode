# Step 03: the two rows

## What

- New `PendingUpdateKind` `'boilerplate'`, worded "Adobe boilerplate" with detail
  "Newer tested version".
- The existing template row, for an added demo only, is worded by its source:
  "Changes from kmanns/justrite". A shipped storefront keeps "EDS template".
- Both start ticked (neither deploys; Apply asks on a conflict).

## Where

`src/types/pendingUpdates.ts`, `src/features/updates/services/pendingUpdateRows.ts`
(`PROJECT_KINDS`, `PROJECT_KIND_ORDER`: the colleague's changes before the boilerplate).

## Tests

`pendingUpdateRows.test.ts`: both rows under one project, in that order, with their words;
a shipped storefront's row unchanged.

## Done when

The Updates window shows both rows for a qualifying project (owner checks a screenshot).
