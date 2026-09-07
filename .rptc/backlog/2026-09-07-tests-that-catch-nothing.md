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

Measured 2026-09-07 by the redundancy sweep that followed [[PL-22]] to zero: of 15,227
tests, **635 caught no deliberate change to the code they were measured against.** Not
"caught less than another test" — caught nothing at all.

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

## The two clusters look like different causes — check both first

| catch nothing / tests | module | likely cause |
|---|---|---|
| 101 / 133 | `features/dashboard/handlers/dashboardHandlers.ts` | mock-heavy handler suite |
| 88 / 93 | `core/utils/timeoutConfig.ts` | a file of constants |
| 46 / 91 | `features/dashboard/handlers/aiHandlers.ts` | mock-heavy handler suite |
| 29 / 54 | `commands/diagnostics.ts` | |
| 19 / 134 | `features/eds/services/daLive/daLiveContentOperations.ts` | |

**The handler suites are the ones to read first**, because this repository already knows the
failure they probably represent: asserting that a mock was called tests the mock, not the
code. A suite where 101 of 133 tests catch nothing, sitting behind a wall of module mocks,
is what that habit looks like when measured. If that is confirmed, the finding is a
test-writing pattern reaching far beyond these files.

**`timeoutConfig.ts` is a puzzle and should be read second, carefully.** It is a constants
file that had NO test at all this morning and was given one during the burn-down; 88 of its
93 tests now catch nothing. A test asserting `SOME_TIMEOUT === 5000` would fail when that
constant is mutated, so it would catch something. That 88 do not is either a real
insight about how the file is tested or a defect in how it was measured — and it is worth
knowing which before trusting the other 634 rows.

## Rebuilding the list — the sweep does NOT save one

The sweep prints its analysis and keeps only the raw per-module reports. The named tests are
recoverable from those with no re-measurement, which is how the example above was found:

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

## Shipped so far

- nothing yet; measured and specified 2026-09-07.
