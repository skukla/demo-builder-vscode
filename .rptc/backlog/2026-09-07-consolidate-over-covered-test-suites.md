---
id: PL-48
kind: chore
area: platform
needs: []
value: high
status: active
parent: PL-11
---

# Half the suite catches nothing new — consolidate the worst, delete none of it

Measured 2026-09-07 by the redundancy sweep that ran straight after [[PL-22]] reached zero.
The sweep completed all 609 modules and its own summary
(`reports/mutation/redundancy/summary.jsonl`) partitions **21,429 tests** exactly three ways:

| | | |
|---|---|---|
| Catch something no other test catches | 8,073 | 38% |
| **Catch things, but nothing uniquely** | **12,564** | **59%** |
| Catch nothing at all | 792 | 4% — that is [[PL-49]] |

This item is the middle row — and, just as importantly, what not to do with it.

An earlier draft of this item cited 7,599 of 15,227 from a partial log parse midway through
the run. Those numbers were real but incomplete; these are the sweep's own totals.

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

## Scope: the outliers only — about 3% of that 12,564

This item does NOT propose working through the 59%. The modules it names hold 384 redundant
tests, and the redundancy is too spread out for any plan to reach much more: 111 modules hold
half of it, 277 hold 80%.

**~59% is also normal here.** Median redundancy across the 527 modules with ten or more tests
is **58%** (middle half 44–71%), so the typical module already looks like the headline
number. The targets below sit at 90–100%, the 95th percentile and above. No benchmark says
what a healthy ratio is, so the extremes are the only part that can be acted on without
inventing a threshold.

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

Ranked by ratio, minimum 25 tests, from the final summary:

| redundant / tests | | module |
|---|---|---|
| 90 / 90 | **100%** | `core/validation/fieldValidation.ts` |
| 50 / 51 | 98% | `features/authentication/services/adobeEntityService.ts` |
| 78 / 81 | 96% | `features/project-creation/services/aiBundle/aiContextWriter.ts` |
| 33 / 35 | 94% | `core/utils/promiseUtils.ts` |
| 33 / 35 | 94% | `features/eds/services/patches/patchTargetPolicy.ts` |
| 24 / 26 | 92% | `features/eds/services/pdp/pdpUrlEncoding.ts` |
| 39 / 43 | 91% | `core/state/transientStateManager.ts` |
| 37 / 41 | 90% | `features/project-creation/services/sanitization.ts` |

**`fieldValidation.ts` is 90 of 90 — every single test, no exceptions.** Not one of its
tests catches anything the others do not, which for a pure validation module is the exact
signature of one test written ninety times with different data. It is the obvious first
target and the cheapest proof of the method.

Then `adobeEntityService.ts` and `promiseUtils.ts`: small, pure, and enough to establish the
pattern before anything touches an 81-test bundle writer.

## The fast-follow slice: fieldValidation, 90 tests against 21 decisions

Stated precisely, because the raw ratio undersells it. `core/validation/fieldValidation.ts`
is 109 lines that generate **21 mutable decisions**, and it has **90 tests** spread over
three suite files (16 + 35 + 39). The minimal catching set is **6**.

Six tests catch everything the ninety catch.

That is not a metric artefact — it is 90 tests written against 21 decisions, which is what
input-variation testing looks like when nobody consolidates it. The three suites are already
split by function (dispatcher, commerce URL, project name), so the shape is there: each
becomes one table-driven test per function with the cases as data.

**The slice:** consolidate those three suites, re-measure the module, and require the open
gap count to still read zero. One module, a few hours, and it establishes both the method
and the proof step for everything after it.

Do NOT set a target of 6 tests. The minimal set is what the SCORE needs; the readable set is
larger, because cases worth naming for a human are worth keeping even when another test
already catches the same decision. The goal is removing repetition, not reaching a number.

Then `adobeEntityService.ts` (50 of 51) and `promiseUtils.ts` (33 of 35) as the second and
third, before anything touches an 81-test bundle writer.

## A caution the same normalisation raises

The redundancy count is inflated by the same thing that inflates [[PL-49]]'s: a module with
few mutable decisions and many tests will report high redundancy whatever the tests do. Judge
a candidate by decisions-per-test, not by the raw percentage — `fieldValidation` survives
that check (21 decisions, 90 tests) and is a real finding; something with 5 decisions and 20
tests probably is not.

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

## The plan

`.rptc/plans/test-suite-consolidation/overview.md` sequences this item with
[[PL-49]]: Phase 1 is this item's pilot, Phase 3 its continuation, and the gate between them
decides whether Phase 3 happens at all.

## Shipped so far

- nothing yet; measured and specified 2026-09-07.
- 2026-09-07  Phase 1 shipped: fieldValidation consolidated, 647 lines -> 322, ratchet held (95.24%, 0 survivors). Finding: the redundancy metric did NOT move (90 tests/90 redundant -> 99/99, minimal cover 6 both times) — it.each emits one test per row, so consolidation cannot reduce the 59%. Value is lines, maintenance and assertion strength; reading the cases also found one uncovered decision and three weak assertions.
- 2026-09-07  docs(plan): Phase 1 answered the gate — continue, but not for the reason the plan gave (`cbc826510`)
- 2026-09-07  test(validation): fieldValidation as data — half the lines, and the metric did not move (`177402a0f`)
- 2026-09-07  docs(plan): state the ceiling — this reaches 3% of the 59%, and that is the right amount (`fa6ea7547`)
- 2026-09-07  docs(plan): the workplan for consolidating what the suite actually constrains (`0ce1494ec`)
- 2026-09-06  docs(backlog): the sweep's FINAL totals — and two claims in the first draft were wrong (`13e18001c`)
- 2026-09-06  docs(backlog): PL-48 and PL-49 — what the redundancy sweep found, and what not to do with it (`fa2bbd6c6`)
