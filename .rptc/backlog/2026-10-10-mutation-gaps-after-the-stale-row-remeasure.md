---
id: PL-70
kind: chore
area: platform
needs: []
value: med
status: active
---

# Mutation gaps after the stale row remeasure

Filed 2026-10-10, the morning after the overnight re-measure of the 405 stale mutation
baseline rows (`7fb1dcc8e`, logged on PL-69).

That re-measure found **754 open gaps across 121 modules**, where the baseline had read 34
across 3. An open gap is a decision in the code that no test would catch if it were wrong.
They are not new debt: the old rows had been recorded before their modules changed and sat
above the truth.

The owner asked "Why don't we do the gaps now?" and approved working them on
`integration/2026-10-10`, one commit per module, as the PL-69 sittings did.

## How it is worked

The repo's own procedure: `node scripts/mutationQueue.mjs` gives the order (updates, auth,
project state, reset, lifecycle, prerequisites and project creation first, most gaps first
inside a group). Per module: measure it ALONE, read the worklist, then for each surviving
or uncovered mutant write a test that pins the decision, record an equivalent in
`scripts/mutation-equivalents.ledger.json` with its reason, or delete the branch if it is
dead. `scripts/overnight/BURNDOWN.md` and the `mutation-test-pilot` skill carry the rules.

A module is done when no decision is unpinned, not when its score is high.

## Three things the re-measure could not measure

- `appBuilderComponentRunner.ts`: declarations only since the EDS-8 split, so there is
  nothing to mutate. Its row was a leftover; the code lives in ten split files.
- `storefrontSetupPhase1.ts`: its suite failed under the mutation runner only.
- `fieldValidation.ts`: the run was interrupted.

## Shipped so far
- 2026-10-10  chore(mutation): a measurement has a size limit and a time limit, and a run can be asked how far along it is (`2fa316cdd`)
- 2026-10-10  chore(mutation): restart each Stryker test runner after 50 mutant runs (`e9f7a81e8`)
- 2026-10-10  test(eds): the phase 1 App gate suite stops sleeping, so the module can be measured (`5f3229834`)
- 2026-10-10  chore(mutation): the focus tool adds the importing suites where a run left mutants uncovered (`fa2ea4869`)
