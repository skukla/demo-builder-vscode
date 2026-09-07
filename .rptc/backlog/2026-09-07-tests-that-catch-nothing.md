---
id: PL-49
kind: chore
area: platform
needs: []
value: high
status: backlog
parent: PL-11
---

# 635 tests catch nothing — find out WHY before deciding what goes

Measured 2026-09-07 by the redundancy sweep that followed [[PL-22]] to zero. It completed
all 609 modules: of **21,429 tests, 792 caught no deliberate change** to the code they were
measured against. Not "caught less than another test" — caught nothing at all.

(An earlier draft said 635 of 15,227, read from a partial log midway through the run. The
figures here are the sweep's own final totals.)

Sibling of [[PL-48]], which covers the much larger droppable count. These two are different
findings and must not be merged: droppable is a property of a GROUP and names no test, while
this list names individual tests exactly.

## The deliverable is a classification, not a delete list

A test that catches no change is not automatically worthless. It may assert a behaviour
nothing can mutate, or document intent for a reader. The first real example read
(`accsDiscoveryConfig.ts`) was exactly that shape:

> `deriveCredentialServiceUrl returns undefined when the URL is empty`

A genuine behaviour, asserted correctly, that no mutation can break — so the metric cannot
see its value. Deleting it would remove a true statement about the code and gain nothing.

So the question worth answering is **why** these 635 catch nothing, because a pattern points
at a habit worth fixing, and fixing the habit is worth more than any number of deletions.

## FIRST: normalise by how much there is to catch — it removes a third of the list

**Stryker has no mutator for plain numbers.** Verified across 120 modules: zero numeric
mutations, out of 10,400. A module built from numeric constants therefore generates almost
nothing to catch, and every test of it is scored as catching nothing — correctly, and
meaninglessly.

`core/utils/timeoutConfig.ts` is the proof: **380 lines, 4 mutants, all caught.** Its 88
"catch nothing" tests are not weak tests. There is nothing there for them to catch.

Dividing mutants by tests separates the artefact from the finding:

| | tests | share of the 792 |
|---|---|---|
| In modules with < 0.5 mutants per test | 245 across 13 modules | **31% — not findings** |
| In modules with a normal amount to mutate | 547 across 153 modules | 69% — the real question |

**Do this filter first.** It is minutes of work against
`reports/mutation/redundancy/summary.jsonl`, which already carries `mutants` per row, and it
removes a third of the list before anyone reads a single test.

## The two headline examples were BOTH artefacts — the first hypothesis is dead

An earlier draft named `dashboardHandlers.ts` (101 of 133) and `timeoutConfig.ts` (88 of 93)
as the clusters to read first, and proposed they might share one cause: this repo's known
trap that asserting a mock was called tests the mock rather than the code.

**That hypothesis is unsupported and should not be carried forward.** Both files fail the
filter above — `dashboardHandlers.ts` has 133 tests against just **50 mutants** (0.38 per
test). Its tests catch little because there is little to catch, not because they assert the
wrong thing. The mock-habit theory was built on the two files least able to support it.

It may still be true elsewhere. It now has to be tested on modules where it CAN be tested —
ones with plenty to catch and many tests catching none of it:

| catch nothing / tests | mutants | module |
|---|---|---|
| 46 / 91 | 130 | `features/dashboard/handlers/aiHandlers.ts` |
| 35 / 64 | 135 | `features/eds/services/pdp/pdp404HandlerPublisher.ts` |
| 29 / 54 | 89 | `commands/diagnostics.ts` |
| 24 / 65 | 101 | `features/project-creation/handlers/executor.ts` |
| 17 / 90 | 162 | `core/shell/processCleanup.ts` |
| 12 / 70 | 222 | `features/eds/handlers/storefrontSetup/storefrontSetupHandlers.ts` |

Three of those six are handlers, which is what kept the habit theory alive — but read them
before believing it a second time.

## The fast-follow slice

1. Run the mutants-per-test filter and commit the resulting list. Minutes.
2. Read `aiHandlers.ts` and `pdp404HandlerPublisher.ts` — the two thickest — and classify
   why their tests catch nothing. Hours, not days.
3. Only then decide whether the remaining 547 have one cause or many.

Step 2 is the whole value of this item. If those two share a cause, it is a rule for test
authors and the rest follows cheaply. If they do not, this is 153 separate small judgements
and worth much less than it looks.

## Rebuilding the list — the sweep saves COUNTS, never names

`reports/mutation/redundancy/summary.jsonl` holds one row per module with `tests`,
`killedNothing`, `redundant` and `pulling` as integers. That is what the tables above are
built from, and it is enough to RANK but not to act: no test is named anywhere in it.

The names are recoverable from the raw per-module reports the sweep also keeps, with no
re-measurement — which is how the example above was found:

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

Do this first and commit the generated list, so the next person is not re-deriving it from
a log that will have rotated.

## What NOT to do

Do not bulk-delete on the count. Do not treat a catch-nothing test as a defect in the test
author. And do not act on any of it before the two clusters above are read, because if they
share one cause then most of the 635 have one fix rather than 635 decisions.

## Done means

The 635 are classified into: safe to delete, rewrite to assert the decision, and keep with a
reason. Any deletions are proven by re-measuring the module to zero open gaps, the ratchet
[[PL-22]] left in place. A named pattern, if one exists, is written up where test authors
will meet it.

## The plan

`.rptc/plans/test-suite-consolidation/overview.md` sequences this item with
[[PL-48]]: Phase 2 is this item's investigation, Phase 4 the enforcer that only exists if
Phase 2 finds a real habit.

## Shipped so far

- nothing yet; measured and specified 2026-09-07.
