---
id: PL-48
kind: chore
area: platform
needs: []
value: high
status: active
parent: PL-11
---

# Read the most repetitive suites. Consolidation is the excuse, not the point.

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

## RESCOPED 2026-09-07, after three files — the ranking is a reading order, not a worklist

This item was filed to consolidate the suites with the highest redundancy. Three of them have
now been examined and the premise has failed twice while the exercise paid twice, so the item
is restated to match what it actually delivers.

**What consolidation does NOT do — measured, not argued.** Phase 1 turned `fieldValidation`'s
three suites into tables: 647 lines became 322 and every assertion got stronger. The
redundancy metric did not move by one point. 90 tests became 99, still 100% redundant, the
minimal covering set still 6. `it.each` emits one test per row and the rows still overlap in
what they catch, so this kind of consolidation cannot move the number and never could.

**And two of the three top candidates were not repetition at all.** They were arithmetic:

| candidate | ranked | what it actually was |
|---|---|---|
| `adobeEntityService` | 50 / 51 | a 76-LINE FACTORY with two decisions. Its 51 tests assert "fetch organizations via SDK" and "fall back to CLI" — the behaviour of `AdobeEntityFetcher`, which already has fourteen suites at 100%. 51 tests crossing two decisions reads as 98% redundant and means nothing |
| `promiseUtils` | 33 / 35 | genuine repetition — five tests re-testing three behaviours under domain names |
| `fieldValidation` | 84 / 90 | genuine repetition — one test written ninety times with different data |

A high ratio means "many tests, few decisions". That happens when a suite repeats itself AND
when a module simply has little to decide, and the number cannot tell them apart. Only reading
can.

**What reading them actually found**, none of it visible in any metric:

- **A production defect.** `withTimeout` never checked `signal.aborted`, so an
  already-aborted AbortSignal was ignored and the caller waited out the whole timeout —
  reaching a THIRTY-MINUTE timeout on project creation, reporting a timeout for a build the
  user had cancelled.
- **Three vacuous assertions.** `expect(result.timedOut || result.cancelled || result.result).toBeTruthy()`
  is true for every outcome. One carried a comment describing the defect above instead of
  failing on it. Two more accepted either outcome of a zero timeout.
- **An uncovered decision** in `fieldValidation` — composition order — and two dispatcher
  tests that would have passed with a broken switch label, because a VALID value cannot
  distinguish routing from fall-through.
- **A dead module.** Following what `adobeEntityService` constructs found `adobeEntitySelector`,
  which had a suite and had never been measured, and eight more like it.

**So the item is now: read the most repetitive suites, highest ratio first, and fix what
reading finds.** Consolidation still happens where the repetition is real — it is how you are
forced to read every case — but it is the method, not the goal, and the metric it was
supposed to move will not move.

**Done is no longer a list of files.** It is: each candidate below either read and acted on,
or read and recorded as arithmetic. Stop when two consecutive candidates yield nothing.

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
- 2026-09-08  Rescoped 2026-09-07 after three candidates. Consolidation does not move the redundancy metric - measured in Phase 1, where 647 lines became 322 and the number did not shift a point. Two of three top candidates were arithmetic (many tests crossing few decisions), not repetition. But reading them found a production defect in withTimeout (an already-aborted AbortSignal ignored, on a 30-minute project-creation timeout), three vacuous assertions, an uncovered decision, and a dead module. The item is now: read the most repetitive suites highest-ratio-first and fix what reading finds; consolidation is the method, not the goal.
- 2026-09-08  Candidate 5, aiContextWriter.ts (78/81) — ARITHMETIC, recorded, nothing consolidated. The module is a 40-line composer plus a 3-line writer: 12 mutants, already 100% with zero open gaps before this. Its 81 tests are not repetition — they assert the CONTENT of agentsMdSections.ts (644 lines, 16 section builders), which has no suite of its own, so focusModule finds no mirror for it and it has NEVER been mutation-measured. That misfiling is what produces the ratio. Reading the 81 found six assertions that could not fail or could not fail usefully, and one uncovered decision: nothing asserted the built-in arm of the block-library type ternary, and the custom arm was asserted by toContain('custom'), which is satisfied 3x by unrelated Storefront and PDP prose. Collapsing the ternary to always-custom passed 33/33 before and fails now (control run both ways). Also fixed: toContain('do not') (satisfied 5x in a headless doc with no PDP section at all), two not.toContain injection assertions true of any mangling, a bare toBeDefined on the mkdir call, and a test whose name claimed an ordering nothing asserted. aiContextWriter held at 100.00%, 0 open gaps.
- 2026-09-08  Candidate 6, transientStateManager.ts (39/43) — the ratio was DEAD CODE, not repetition. Eight of eleven public methods had zero callers in src/: setWithTTL, getWithTTL, has, remove, isNotificationDismissed, dismissNotification, getPreferredLogChannel, setPreferredLogChannel. The class shipped whole from a plan in .rptc/complete/ in Nov 2025 with 43 tests; production adopted get and set only, nine months later, in the data installer. Deleted the dead API, the TTLValue interface and the constructor's setKeysForSync call — all three sync keys are written only by the deleted helpers, and whatsNew.dismissed was written by nothing, ever. 150 lines -> 46. The three-suite family and its .testUtils collapsed to one table-driven suite: 43 tests -> 20, and get's '!== undefined' guard is now pinned against all four falsy-but-stored values (0, empty string, false, null) where before only null was covered. Also fixed a test whose name said the opposite of its assertion ('should return default value when stored value is null' asserted toBeNull) and dropped 'should not throw when removing non-existent key', an assertion that could not fail. Held at 100.00%, 0 open gaps; 39 mutants -> 6 because the module shrank.
