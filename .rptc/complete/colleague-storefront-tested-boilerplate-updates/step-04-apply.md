# Step 04: applying the Adobe track

## What

Apply runs `applyTemplateChangeSince` with Adobe's template as the source, `boilerplateBase.commit`
as the base and the LKG as the target, onto the SC's repository, and records only
`boilerplateBase.commit`. It never touches `lastSyncedCommit`, never sets `lkgSource`,
never offers a reset, and does not re-apply patches, the 404 handling or Quick Edit (D6).

## Where

- `TemplateSyncService` takes the source, base and target explicitly instead of reading
  them only from metadata (`templateSyncService.ts:113-131`); the existing callers pass
  what they read today, so their behaviour does not move.
- `templateCheckout.ts:77-81` fetches the named source as the `template` remote.
- `updateApplyTemplate.ts`: a sibling `applyBoilerplate`; its conflict path reports the
  files and stops (no `resetTemplateOnConflict` question).
- The colleague track and the Adobe track in one Apply run one after the other, colleague
  first, each its own commit.

## Tests

- The call: source = Adobe's template, base = recorded commit, target = LKG (assert the
  ARGUMENTS, CLAUDE.md "a mock cannot see a malformed call").
- Success records `boilerplateBase.commit` = LKG and leaves `lastSyncedCommit` as it was.
- Conflict: nothing pushed, files named, no reset offered.
- Existing template updates: unchanged (the suites pass without edits).

## Done when

On a scratch storefront made from a qualifying colleague's demo, Apply moves it to the
LKG with the SC's edits kept, in one commit. A live write: owner-confirmed, on a storefront
that can be thrown away.
