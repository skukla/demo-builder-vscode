---
id: PL-22
kind: question
area: platform
parent: PL-11
needs: []
value: med
status: open
layer: A
---

# Does the 93% mutation score hold outside the modules we already trusted?

**This is a question, not a feature.** It closes when evidence answers it, not when
something ships. The answer decides whether a test-strengthening pass is worth
running at all — so filing it as work to do would presuppose the answer.

## What we know

The Stryker pilot (`npm run test:mutation`, shipped 2026-08-30) scores **93.37%**:
166 deliberate defects planted across four modules, 155 caught by an existing test.

That is a good number and it is real. It is also **not an average.** The four modules
were chosen deliberately as ones we believed were well tested — pure, decision-carrying,
already covered. So 93% describes our best work, not the middle of the distribution.

The pilot's own first run is the reason not to assume the rest looks the same.
`envMerge.ts` was in that hand-picked four. Its tests had been written that same day,
deliberately, against a criterion recorded in advance, and line coverage was high. It
scored **78%**: five planted defects survived, every one a real input a hand-edited
`.env` produces. Coverage said the code was tested. It was not.

If a module written that carefully scores 78%, the honest position is that we do not
know what a module nobody has thought about in a year scores.

## The question

Point the same instrument at modules we are NOT confident about, and find out whether
93% was the ceiling or the norm.

## How to answer it

Cheap now that the tool exists. Per module: add it to `mutate` in
`stryker.config.json` AND its suite to `testMatch` in `jest.stryker.config.js` —
nothing enforces that pair, and adding only the first scores 0 for the wrong reason.

**Choose the sample to answer the question, not to look good.** Candidates should be
the opposite of the pilot's four:

- modules whose suites were flagged `module-wall` by the craft census (73 of them) —
  a wall of module mocks is where a test most easily ends up asserting its own mock
- the coverage laggards that phase 6 raised by writing NEW tests
  (`projectDeletionService` 16→84%, `templateSyncService` 18→82%). Fresh high coverage
  is exactly the condition under which `envMerge` scored worst
- something old, load-bearing and untouched for months

Keep the sample small — 4–6 modules. The pilot runs 166 mutants in 33 seconds because
its scope is four files; mutation testing re-runs the related suites once PER MUTANT,
so this grows fast.

**Poor candidates:** timer-heavy modules. Mutations that break a delay hit `timeoutMS`
and report as timeouts rather than survivors, which tells you nothing.

## What the answer means

- **Comparable to 93%** → the suite is genuinely strong; no strengthening pass is
  warranted, and that is worth knowing rather than assuming.
- **Materially lower** → we have located where the tests are thin, with named surviving
  mutants rather than a coverage percentage. THAT becomes the work item, scoped by
  evidence.

Either way, record the per-module scores in `.claude/skills/mutation-test-pilot/SKILL.md`
beside the existing baseline table, so the next run has something to compare against.

## Related

- `.claude/skills/mutation-test-pilot/SKILL.md` — how to run it, how to read survivors,
  and the three things a surviving mutant can mean (real gap / equivalent mutant /
  dead defensiveness)
- ADR-016 — names mutation testing as how test effectiveness is measured
- PL-11 — the convergence programme this belongs to

## Shipped so far

- 2026-08-30  Filed. The pilot and its 93.37% baseline landed the same day
  (`c4118338e`); this asks the question that number cannot answer on its own.
- 2026-08-30  docs(plan): file PL-22 — does 93% hold outside the modules we already trusted? (`0c1b8bf7e`)
- 2026-08-30  Sample run mis-scoped: 7 of 8 modules had no test selected (jest config hard-codes the pilot's 4 paths), reported 0% in 19s. Fixed with jest.pl22.config.js + tests/sop/mutation-config-pairing.test.ts; real run in flight.
- 2026-08-30  ANSWERED: no. Pilot 93.37% (4 pure modules, mean 1 await); representative 8-module sample 59.29% (1329 mutants, 16m15s). Control envMerge reproduced 100% exactly. Score falls monotonically with await count: installHandler (41 awaits) 41.77%. Finding: async+mocked code is what tests fail to constrain.
- 2026-08-30  test(mutation): PL-22 answered — the pilot's 93% does not generalise (`48b61956e`)
- 2026-08-30  test(prerequisites): cover the plugin install path, untested until now (`385d7d6ff`)
- 2026-08-30  test(prerequisites): assert what installHandler's mocks already record (`8568d532e`)
- 2026-08-30  test(mutation): ratchet the score before improving it, and guard against gaming it (`0fd0974ce`)
- 2026-08-31  feat(tooling): widen the mutation sample to the UI layer, and split duplication into two floors (`3ab1d0328`)
