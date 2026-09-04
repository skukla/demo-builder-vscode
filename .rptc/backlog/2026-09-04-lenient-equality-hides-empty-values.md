---
id: PL-43
kind: fix
area: platform
needs: []
value: high
status: backlog
parent: PL-22
---

# 651 assertions claim something is empty using a comparison that accepts an empty value instead

Found 2026-09-04 by a goal session working `installHandler.ts`: an assertion that a
list came back empty was passing against a list that held one empty entry, and a real
mutant was surviving behind it.

## Verified, with controls

Run outside the repo's own jest configuration so nothing in the tree could influence it:

```
toEqual       [undefined] vs []          PASSES
toEqual       [] vs [undefined]          PASSES
toEqual       {a:undefined} vs {}        PASSES
toStrictEqual [undefined] vs []          fails
CONTROL       [1] vs []  (must be false) fails
CONTROL       [1] vs [1] (must be true)  PASSES
```

`toEqual` treats an absent value and a present-but-empty one as the same thing, in both
lists and objects. `toStrictEqual` does not. Both controls behaved as required, so the
probe was aimed correctly.

## The exposure across the suite

| | Count |
|---|---|
| `toEqual(...)` | 3,150 |
| `toStrictEqual(...)` | 54 |
| **`toEqual([])` — asserts a list is empty** | **579** |
| **`toEqual({})` — asserts an object is empty** | **72** |

The 651 emptiness assertions are the ones that can hide a defect. Each is a place where
code returning a list of empty entries, or an object whose every key is unset, satisfies
a test asserting it returned nothing.

Densest files: `sop/doc-module-refs` (18), `templates/spine-chokepoints` (16),
`sop/tooling-registry` (15), `project-creation/services/envVarClassifier` (15),
`ai/aiSetupVerifier` (14).

## What is NOT claimed

Most of those 651 are probably sound, because most compared values cannot contain empty
entries in the first place. Only one has been shown to hide a defect. What the numbers
show is that the suite has almost no strict comparisons, so nothing stops it happening.

## The work

Switch emptiness assertions to `toStrictEqual`. It is safe and strictly stronger for a
comparison against an empty literal. Do it as its own pass, never while the burn-down
loop is committing and gating — hundreds of test files churning under a running gate is
how a green run turns red for a reason nobody can find.

**Then re-measure the modules touched.** This is the part that pays: a lenient assertion
that was hiding a kill shows up as a newly killed mutant, which both proves the change
worked and finds the defects that were sitting behind it. A module whose score does not
move had no such assertion, which is also an answer.

Worth considering afterwards: an enforcer that refuses a NEW `toEqual([])`, shrink-only
against a recorded ceiling, in the shape `no-logger-wording-assertions` already uses.
That is what stops the count climbing back.
