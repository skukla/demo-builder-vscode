---
id: PL-73
kind: chore
area: platform
needs: []
value: low
status: backlog
---

# Review the tests the redundancy sweep found idle

Filed 2026-10-11. The owner agreed to do this AFTER the release, not before: it removes
tests, and that is the wrong risk to take the night before a cut.

## What was measured

The redundancy sweep (`scripts/mutationRedundancySweep.mjs`, bail off) ran over all 707
modules in the mutation baseline on 2026-10-10: no failures, about five hours.
`node scripts/mutationRedundancyCombine.mjs` then judged each test once, across every
module it ran for:

| | Tests |
|---|---|
| Distinct tests seen | 23,963 |
| Cover: a greedy smallest set that keeps every kill | 10,092 |
| Overlap: kills only what the cover also kills | 12,314 |
| Idle, own module measured | 1,131 |
| Idle, own module not measured | 426 |

The reports are in `reports/mutation/redundancy/`, which git ignores. They exist on the
machine that ran the sweep. Re-running the sweep rebuilds them.

## What to review, and what not to

**The 1,131 are leads, not findings.** Read each test file before removing anything. Two
ways an idle test is still doing its job were found while checking the first numbers:

- A module of constants gives Stryker almost nothing to mutate. `timeoutConfig.ts` got 4
  mutants, so 88 of the 93 tests in `timeoutConfig.test.ts` read as idle.
- A suite that pins structure rather than behaviour kills no mutant by design
  (`tests/templates/ai-bundle-coherence.test.ts`, 21 of 21).

Start with the files where most tests are idle: `toolNarration.test.ts` (165 of 224), the
`appBuilderComponentHandlers` family (plumbing 39 of 41, main 32 of 36, drawer 26 of 35,
edges 22 of 31, remove 15 of 15), `prerequisites/handlers/shared-helpers.test.ts` (28 of
28) and `shared-per-node-status.test.ts` (24 of 24). A whole handler suite reading idle
more likely means the suite asserts on a mock than that the handler needs no tests; if
so the fix is a better assertion, not a deletion.

**The 426 say nothing either way.** Their own module is not in the baseline, so it was
never mutated. Measuring those modules is a separate decision.

**The 12,314 overlap tests are an upper bound, not a recommendation.** Two tests catching
the same fault is often deliberate. Nothing here proposes removing them.

## Done when

Each file with idle tests has been read and each idle test is either removed, given an
assertion that kills something, or left with a one-line reason.
