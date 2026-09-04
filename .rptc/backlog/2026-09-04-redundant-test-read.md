---
id: PL-42
kind: fix
area: platform
needs: []
value: high
status: open
parent: PL-22
---

# Read the redundancy lists and delete what pins nothing — about half of every suite is a candidate

**Owner directive, 2026-09-03 23:30: capture this so it is not lost tomorrow.**

## What is known

Mutation testing says whether a test would CATCH a defect. It does not say whether a
test is NEEDED. That second question is now measurable exactly: with Stryker's bail
OFF, every test that catches a planted defect is recorded, and a greedy minimal cover
finds the smallest set of tests that still catches everything. Tests outside that set
are droppable TOGETHER without losing a single catch.

Two modules measured exactly on 2026-09-03:

| Module | Tests | Smallest set keeping every catch | Droppable together |
|---|---|---|---|
| `features/updates/services/envMerge.ts` — hand-written, the 100% pilot | 15 | 8 | **7** |
| `features/eds/services/reset/edsResetUI.ts` — written by the loop that night | 76 | 40 | **36** |

Same ratio in the hand-written suite as in the loop's. The whole 16-test
`edsResetUI-sampleData` suite is droppable: everything it catches, the auth and app-check
suites already catch. Tests overlap by nature — several inputs down one path trip the
same mutations; a CONTROL pinning the negative case catches nothing the positive case
does not — so this is not a defect in how tests were written. It is invisible until
kills are counted per test.

**The overnight sweep** (`node scripts/mutationRedundancySweep.mjs`, chained behind the
2026-09-03 goal queue) runs this over every finished module. Per-module counts land in
`reports/mutation/redundancy/summary.jsonl`; each module's named droppable list is in
`reports/mutation/redundancy/<stem>.json`, readable with
`node scripts/mutationRedundantTests.mjs <report> --bail-off`. `reports/` is gitignored;
re-run the sweep to regenerate (resumable, skips modules with a report).

## What "droppable" does NOT mean, and why this is a read, not a delete

Dropping loses no CATCH of these mutations. It can lose MEANING:

- Mutations are a finite probe — flipped conditions, deleted lines, changed literals. A
  test that pins call ORDER, a message an SC reads, or a documented defect can catch
  nothing another test does not and still guard something no mutation touches.
  `envMerge`'s "a renamed variable leaves the new name EMPTY — this is what breaks the
  deploy" is on the droppable list and documents a known bug.
- Some redundancy is deliberate: a named control, a worked example, a regression pin
  whose title tells the story.
- The greedy's choice between two mutually-covering tests is arbitrary. Keep the clearer
  one, not the one the algorithm happened to meet second.

## The work

Per suite, for each test on the droppable list, one question: **does it pin something no
mutation probes?** If not, delete it. Expect a third to a half of each list to go. Do the
two measured modules first, so the reading protocol is proven on known ground before it
is applied to 130 more.

Record the outcome per module in the mutation ledger's neighbour, or here: tests before,
tests after, and the ones deliberately kept from the list with the reason. The suite
count in the handbook is pinned by a test; expect to lower it.

## An open decision for the owner

The loop is about to add tests to ~400 more modules. Should each goal session run the
redundancy measure on its own module BEFORE committing and drop what pins nothing, so
the suite does not grow by half again? That adds a bail-off run (1–3 min) per module and
a judgement the sessions have so far been trusted with on ledger rows. Not decided;
raised here so the next queue is generated with the answer.

## Related

- [[PL-22]] — the burn-down this hangs off; the measure was built during it
- `scripts/mutationRedundantTests.mjs` — the analysis and its caveats, in its header
- `scripts/mutationRedundancySweep.mjs` — why the configs must sit at the tree root
- `.claude/skills/mutation-test-pilot/SKILL.md` — the cycle this extends

## Shipped so far

- 2026-09-03  docs(backlog): PL-42 — read the redundancy lists and delete what pins nothing (`591c4c293`)
