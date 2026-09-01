---
id: PL-32
kind: chore
area: platform
needs: []
value: med
status: active
---

# Work the type-erasing casts in tests to zero

`as any` and `as never` are banned in `tests/` as of 2026-08-31. The rule is in
[the handbook](../../docs/development/handbook.md) §9 and enforced by
`tests/sop/type-erasing-casts.test.ts` as a shrink-only ceiling. **This item is
the conversion**: work both counts to zero, at which point the ceiling is deleted
and replaced by an eslint ban.

## Why these two and not every cast

`as unknown as X` still NAMES X, so every downstream use is checked against it and
the lie stays local to the construction site. `as any` and `as never` name
nothing — what comes out has no type left to check, so the erasure propagates to
every use. `as never` is the worse of the pair, because `never` is assignable to
every type: it is a skeleton key that reads like a locked door.

This is a different rule from `canonical-fakes`' `castCeilings`, which counts
casts to nine types that already have a builder. A cast to a type with no builder
can be perfectly correct there. Here it never is.

## The state, frozen 2026-08-31

Measured over `tests/` with comments stripped. Pins live in
`tests/sop/type-erasing-casts.ledger.json`.

| Form | Count | Files |
|---|---|---|
| `as any` | 1121 | 184 |
| `as never` | 795 | 166 |
| **total** | **1916** | **341** |

`tests/helpers/` contains **zero** of either — the canonical builders already fake
types no object literal can satisfy (`CommandExecutor` and `StateManager` are
CLASSES with private fields) and all of them write `as unknown as X` instead. The
right way was already in use; it had just never been written down.

Worst files, which is NOT the order to work them in:

     56  tests/core/shell/buildComponent.test.ts
     45  tests/features/eds/services/storefront/storefrontNameMigration.test.ts
     36  tests/features/app-builder/services/appBuilderComponentRunner.test.ts
     34  tests/features/lifecycle/commands/syncStorefront.test.ts
     34  tests/features/projects-dashboard/handlers/dashboardHandlers.test.ts

## What the work actually is

**Not mechanical, and no regex finishes it.** Undoing one means reading what the
callee declares — which is the work the cast was avoiding in the first place. The
CommandExecutor family, converted on 2026-08-31, is the worked example and split
three ways:

| | |
|---|---|
| The cast silences nothing and deletes outright | 11 of 42 |
| A builder in `tests/helpers/` already returns the right type | 30 of 42 |
| The target is genuinely unsatisfiable — belongs in a builder, once | 1 of 42 |

`npm run typecheck:tests` verifies the first class BY CONSTRUCTION: removing a
load-bearing cast is a compile error, so a clean typecheck proves every cast you
deleted was redundant. Use that — it is the cheapest safe slice and it is worth
sweeping for it first across the whole corpus.

## How to work it — one collaborator at a time, not one file at a time

The CommandExecutor conversion took 42 casts across 37 files to zero in one pass
because it was scoped to ONE collaborator: read its declared type once, and every
site follows. A file-at-a-time pass re-asks the same question in every file.

**Lower the pin in the same commit as the fix.** Exact equality, so this is not
optional — it is how the ratchet stays honest.

## Two failure modes already paid for, on the first conversion

- **The converter rewrote the BUILDER'S OWN BODY into a call to itself**, and 104
  suites died on a stack overflow. Second self-recursive builder written that day.
  Any codemod over `tests/helpers/` must exclude the builder it is inserting.
- **The import convention was read off the already-modified tree**, counting the
  script's own 36 new lines as evidence, and a `@/tests/*` alias that does not
  exist was invented. `git grep HEAD` said relative paths, 32 of 32. Measure
  conventions against HEAD, never against your working tree.

## Done when

Both counts are zero, `tests/sop/type-erasing-casts.test.ts` and its ledger are
deleted, and `no-restricted-syntax` bans both forms in `tests/` — the same arc the
`featureBarrels` ledger took when it emptied. `@typescript-eslint/no-explicit-any`
is currently `off` for `tests/` in `eslint.config.mjs`; that line goes too.

## Shipped so far

- 2026-08-31  Rule adopted, documented in the handbook §9, and enforced by a
  shrink-only ceiling seeded at 1121/795. Control-tested in four directions: a
  planted violation reports GREW, a planted violation in `tests/helpers/` is named,
  a comment mention does not count, and a clean tree exits 0. The older
  builder-only convention it generalises was DELETED rather than left standing
  unenforced beside it
- 2026-08-31  First conversion: the CommandExecutor fake family, 42 casts to zero
  across 37 files, `as never` 880 → 803 (`10d77eb3b`)
- 2026-08-31  test(sop): a test never erases a type — as any and as never become a rule (`0c934462e`)
- 2026-08-31  test: 88 type-erasing casts removed — 1916 to 1828 (`d0d5ab492`)
