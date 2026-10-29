# Step 02: keep the clash in the local copy

## What

When the throwaway-clone apply reports conflicts, and the SC chose Fix with AI (step 03),
the builder refreshes the local copy (step 01) and applies the same change there:

1. Fetch the source repository's two commits into the local copy (base and target).
2. `writePatch` and `git apply --3way --index`, the same calls `applyTemplateChangeSince`
   makes (`templateMergeBase.ts:106-166`), against the local copy instead of the clone. The
   clean files are staged; the clashing ones keep git's markers in the working tree.
3. Record on the storefront metadata:

```ts
pendingClash: {
  track: 'template' | 'boilerplate';
  base: string;        // the commit the change starts from
  target: string;      // the commit it goes to
  files: string[];     // the clashing files, repo-relative
  keptAt: string;      // ISO time
}
```

## Where

- `templateMergeBase.ts`: the apply already takes a `GitStep`; pass one bound to the local
  copy. No second implementation of the apply.
- A `keepClash(project, outcome, deps)` in `src/features/updates/services/`.
- `src/types/` gains the `PendingClash` type.

## Rules

- The local copy must refresh cleanly first (step 01). If it cannot, say so in plain
  words and keep nothing.
- The conflicts in the local copy must be the same files the clone reported. If they are
  not, undo (`git reset --hard` to the refreshed head, which holds no SC work because step
  01 required it clean) and report.
- "Leave it as it is" keeps nothing and records nothing.

## Tests

- A clash: the local copy holds markers in exactly the reported files, the rest staged,
  `pendingClash` recorded with both commits.
- A copy that cannot refresh: nothing applied, nothing recorded.
- A mismatch between clone and local copy: undone, reported.

## Done when

On JustRite, the local `blocks/header/header.js` carries the markers and nothing is pushed.
