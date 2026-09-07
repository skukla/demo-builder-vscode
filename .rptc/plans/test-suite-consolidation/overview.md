# What the suite actually constrains — consolidating 21,429 tests

Follows [PL-22](../../backlog/2026-08-30-mutation-score-beyond-confident-modules.md), which reached **zero open
gaps across all 610 modules** on 2026-09-06. The sweep that ran immediately after it measured
the suite from the other side — not "does a test exist" but "does it catch anything" — and
this plan turns that measurement into work.

Delivers backlog items **PL-48** (consolidation) and **PL-49** (tests that catch nothing).
They are one programme because they come from one measurement and share one safety net, and
two items because only one of them names individual tests.

---

## What was measured

The sweep covered **609 modules and 58,550 mutable decisions**, and partitions every test
exactly once. Source: `reports/mutation/redundancy/summary.jsonl`.

| | tests | |
|---|---|---|
| Catch something no other test catches | 8,073 | 38% |
| Catch things, but nothing uniquely | 12,564 | 59% |
| Catch nothing at all | 792 | 4% |

A "mutable decision" is a deliberate change to the source — a flipped comparison, an emptied
function body, a swapped literal. A test that fails when the change is made has CAUGHT it.

---

## Read the numbers before trusting them

Two traps, both already paid for once in filing these items, both capable of turning this
plan into destructive work.

**1. The 59% is not a delete list.** It is computed against a greedy minimal set: take the
test catching the most decisions, then the next, until everything any test caught is caught.
A different starting order produces a different set of the same size. The number therefore
says HOW MUCH slack exists and never WHICH tests are the slack.

Worse, overlap in what BREAKS a test is not overlap in what it VERIFIES. In the worked
example (`accsDiscoveryConfig.ts`, 19 tests, 56 decisions) emptying one function body fails
**10 different tests** — which assert ten different things and merely run through the same
line. Mutation testing asks "did a test fail?", never "was the right thing checked?".

**2. Stryker does not mutate plain numbers.** Verified across 120 modules: **zero numeric
mutations out of 10,400.** A module of numeric constants therefore has almost nothing to
catch, and every test of it scores as catching nothing — correctly and meaninglessly.

`core/utils/timeoutConfig.ts` is the proof: **380 lines, 4 mutants, all caught.** Its 88
"catch nothing" tests are not weak. There is nothing there for them to catch.

**So both numbers must be normalised by decisions-per-test before use.** Applied to the 792:

| | |
|---|---|
| In modules with < 0.5 decisions per test — **artefacts, not findings** | 245 tests, 13 modules |
| In modules with a normal amount to catch — the real question | 547 tests, 153 modules |

This filter also killed the first hypothesis filed against PL-49. `dashboardHandlers.ts`
(101 of 133 catching nothing) was named as the headline case and proposed to share a cause
with `timeoutConfig` — the trap where asserting a mock was called tests the mock. It has
**133 tests against 50 decisions** and fails the filter. The theory was built on the two
files least able to support it. It may still be true; it has to be tested somewhere it can
be.

---

## The safety net, which is new

Zero open gaps means removing a test is now **falsifiable**. Re-measure the module afterwards
and its open-gap count must still read zero; if it moves, the removed test was load-bearing
and the change is wrong.

    node scripts/focusModule.mjs <module>
    npx stryker run stryker.focus.config.json > /tmp/focus.txt 2>&1
    node scripts/checkMutationBaseline.mjs --report reports/mutation/focus.json

Per module, never per batch — the module is the unit the ratchet measures. Delete
`reports/mutation/focus-incremental.json` after any edit, or the cache answers for the
previous state. Wait on `Done in`, never on the score line.

**Before this week there was no baseline to check against and none of this work was safe to
attempt.** That is why it is being planned now rather than six months ago.

---

## Phase 1 — Consolidate one file, and prove the method

**`core/validation/fieldValidation.ts`.** 109 lines generating **21 mutable decisions**,
tested by **90 tests** across three suites (`-dispatcher` 16, `-commerceUrl` 35,
`-projectName` 39). The minimal catching set is **6**.

Ninety tests against twenty-one decisions is what input-variation testing looks like when
nobody consolidates it. The suites are already split by function, so the shape is there:
each becomes one table-driven test with its cases as data.

**Do NOT target 6 tests.** The minimal set is what the SCORE needs; the readable set is
larger, because a case worth naming for a human is worth keeping even when another test
already catches the same decision. The goal is removing repetition, not reaching a number.

**Done:** the three suites are consolidated, the module re-measures at zero open gaps, and
the test-file line counts fall. Half a day.

## Phase 2 — Find out why 547 tests catch nothing

Independent of Phase 1 and answers a different question, so it can run alongside.

**Read two modules, the thickest available**, and classify each catch-nothing test:

| catch nothing / tests | decisions | module |
|---|---|---|
| 46 / 91 | 130 | `features/dashboard/handlers/aiHandlers.ts` |
| 35 / 64 | 135 | `features/eds/services/pdp/pdp404HandlerPublisher.ts` |

Three buckets, and the proportions are the deliverable:

- **asserts a real behaviour nothing can mutate** — keep. The first one read was exactly
  this: *"deriveCredentialServiceUrl returns undefined when the URL is empty"*, a correct
  assertion no mutation can break.
- **asserts a mock rather than the code** — rewrite to assert the argument the collaborator
  receives. This is the habit under test.
- **asserts nothing meaningful** — delete, proven by re-measure.

**The named list does not exist yet and must be built first.** The sweep saves counts per
module, never names. Rebuild from the raw reports, offline, no re-measurement:

```python
import json
d = json.load(open('reports/mutation/redundancy/<module>.json'))
f = list(d['files'].values())[0]
kills, covers = {}, {}
for m in f['mutants']:
    for t in (m.get('coveredBy') or []): covers[t] = covers.get(t, 0) + 1
    for t in (m.get('killedBy')  or []): kills[t]  = kills.get(t, 0) + 1
names = {t['id']: t['name'] for tf in d['testFiles'].values() for t in tf['tests']}
dead = [names[t] for t in covers if kills.get(t, 0) == 0]
```

Commit the generated list so the next person is not re-deriving it from a rotating log.

**Done:** both modules classified, proportions recorded on PL-49, and a stated verdict on
whether the mock-assertion habit is real. Two to three hours.

## Gate — decide here, not before

Phases 1 and 2 answer the only questions that matter, and they are cheap. Everything after
depends on what they say:

| If Phase 1 shows | then |
|---|---|
| consolidation is quick and the re-measure holds | continue to Phase 3 |
| it is slow, or the re-measure moves | stop. The redundancy is load-bearing and the 59% is not an opportunity |

| If Phase 2 shows | then |
|---|---|
| the mock habit dominates | Phase 4 — the finding is a RULE, worth more than any cleanup |
| the tests are mostly legitimate-but-unmutable | stop at 153 small judgements nobody needs to make |

## Phase 3 — conditional: the next consolidation candidates

Ranked by redundancy, minimum 25 tests, **after** applying the decisions-per-test filter:

| redundant / tests | | module |
|---|---|---|
| 50 / 51 | 98% | `features/authentication/services/adobeEntityService.ts` |
| 78 / 81 | 96% | `features/project-creation/services/aiBundle/aiContextWriter.ts` |
| 33 / 35 | 94% | `core/utils/promiseUtils.ts` |
| 33 / 35 | 94% | `features/eds/services/patches/patchTargetPolicy.ts` |
| 24 / 26 | 92% | `features/eds/services/pdp/pdpUrlEncoding.ts` |
| 39 / 43 | 91% | `core/state/transientStateManager.ts` |
| 37 / 41 | 90% | `features/project-creation/services/sanitization.ts` |

Take the two smallest pure-function modules next (`promiseUtils`, `pdpUrlEncoding`) before
anything touches an 81-test bundle writer.

## Phase 4 — conditional: turn a habit into an enforcer

Only if Phase 2 finds the mock-assertion pattern is real and widespread. This repository's
pattern for a confirmed habit is an enforcer with a shrink-only ledger, not a document —
`tests/sop/` holds 43 of them. A rule that fires when a test asserts only that a mock was
called, ledgered at today's count and allowed to fall, is the shape.

Do not build it speculatively. An enforcer for a habit that turns out to be rare is worse
than nothing, because it fails builds for a defect that is not there.

---

## Out of scope, deliberately

- **Bulk deletion on either number.** Both traps above exist to prevent exactly this.
- **Raising the mutation score.** It is not the target and never was; the open-gap count is,
  and it is already zero.
- **Re-running the sweep.** Everything this plan needs is in
  `reports/mutation/redundancy/`. A re-run costs five hours and answers nothing new.
- **The 245 artefact tests.** They are correctly written tests of code with nothing to
  mutate. Leave them alone.

## Done when

Phase 1 and Phase 2 are complete and the gate has been answered — in writing, on PL-48 and
PL-49 — with either a decision to continue or a recorded reason to stop. Phases 3 and 4
happen only if the gate says so.

**Not** "the 59% is gone". That number will barely move, and moving it was never the point.
