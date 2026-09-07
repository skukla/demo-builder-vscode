---
id: PL-48
kind: chore
area: platform
needs: []
value: high
status: backlog
parent: PL-11
---

# Half the suite catches nothing new — consolidate the worst, delete none of it

Measured 2026-09-07 by the redundancy sweep that ran straight after [[PL-22]] reached zero:
**15,227 tests across 456 modules, of which 7,599 (50%) sit outside the minimal catching
set.** This item is what to do about that number — and, just as importantly, what not to.

## What the number actually means

Mutation testing breaks the source on purpose — flips a comparison, empties a function body,
swaps a literal — then runs the tests. A test that fails has CAUGHT that change.

The "minimal set" is the smallest group of tests that still catches every change any test
caught. Everything else is reported droppable: removing it would not alter the module's
mutation result.

`accsDiscoveryConfig.ts` is the worked example, small enough to read in full — 19 tests
against 56 possible changes:

- emptying the function body at line 94 makes **10 different tests fail**
- but **24 of the 56 changes are caught by exactly one test each**

So 9 of the 19 are droppable, and that is a true statement about the score and a misleading
one about the tests.

## Why deleting on this metric would be wrong

**Those 10 tests are not checking the same thing.** They assert different outcomes — a
return value, an error message, which service was selected — and merely happen to run
through the same line. Mutation testing only ever asks "did some test fail?"; it cannot ask
"was the right thing checked?". Overlap in what BREAKS a test is not overlap in what it
VERIFIES.

**And the set is not unique.** It is built greedily: take the test catching the most, then
the next. A different starting order yields a different set of the same size. The metric
therefore reports HOW MUCH slack exists and never WHICH tests are the slack. Any plan that
needs a specific list of tests to remove cannot be built on this number.

## What to do instead: consolidate the outliers

The actionable signal is the RATIO per file, not the total. Ten tests failing on one change
means ten tests driving the same path with different inputs. That is repetition, and its
cost is maintenance — when that code changes, all ten need editing. The fix is to merge them
into one table-driven test, which removes the future work and loses no assertion.

Ranked by ratio, minimum 25 tests:

| droppable / tests | | module |
|---|---|---|
| 49 / 51 | 96% | `features/authentication/services/adobeEntityService.ts` |
| 84 / 90 | 93% | `core/validation/fieldValidation.ts` |
| 29 / 35 | 83% | `core/utils/promiseUtils.ts` |
| 21 / 26 | 81% | `features/eds/services/pdp/pdpUrlEncoding.ts` |
| 33 / 41 | 80% | `features/project-creation/services/sanitization.ts` |
| 34 / 43 | 79% | `core/state/transientStateManager.ts` |
| 70 / 89 | 79% | `features/dashboard/ui/ProjectDashboardScreen.tsx` |
| 119 / 153 | 78% | `features/authentication/services/adobeEntityFetcher.ts` |

A ratio above ~90% is not ordinary overlap. `fieldValidation.ts` at 84 of 90 is almost
certainly one test written ninety times with different data — exactly the shape a
parameterised test replaces.

Start with the top two. They are small, they are pure functions, and they prove the method
before it is pointed at a 153-test authentication suite.

## The safety net, which is new as of today

[[PL-22]] left every module at zero open gaps, so a consolidation is now FALSIFIABLE:
re-measure the module afterwards and the gap count must still read zero. If it moves, the
tests removed were load-bearing and the change is wrong. Before this week there was no
baseline to check against and this work would have been guesswork.

Do that per module, not per batch — the module is the unit the ratchet measures.

## Done means

Each module in the table is either consolidated with its gap count still zero, or has one
line recorded saying why its repetition is worth keeping. Not "the 50% is gone" — that
number will barely move, and it is not the goal.

## Shipped so far

- nothing yet; measured and specified 2026-09-07.
