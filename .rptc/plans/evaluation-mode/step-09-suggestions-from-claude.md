# Step 09 — Suggestions written by Claude

**Ships:** the advice a producer reads is written by a model that looked at their
trace, not derived from three rules.
**Depends on:** the `measurement/` sub-plan. Not negotiable — see below.

## Why this is the point of the feature

The feature exists to help a producer write a better prompt. Everything else —
the dry run, the recorder, the workbench — is scaffolding for that one sentence.
Step 04 shipped deterministic suggestions covering the case that shows up most
(the agent working out which project it is in), and those are genuinely useful,
but they are three rules. A model reading the trace can say things no rule
anticipated, which is the entire argument for the documented mechanism.

## Why the measurement sub-plan comes first

Advice tuned on the prompts it is judged by will look excellent and generalise to
nothing. The held-out set is what makes an improvement claim real, and it is
cheap to build before and impossible to reconstruct after.

## The cost problem, stated honestly

This doubles the price of an evaluation, in a feature whose purpose is reducing
cost. Three ways to hold that, and the choice should be made with a measurement
rather than a preference:

- **Ask only when there is something to explain** — a clean run gets no second
  call. Most of the win, most of the time, for none of the cost on good prompts.
- **Fold it into the run being evaluated** rather than spawning a second one, if
  the harness allows the run to report on itself.
- **Make it opt-in** per evaluation, so the producer chooses to spend it.

The first is the obvious default. Measure the second before dismissing it.

## Keep the deterministic rules

They become the FALLBACK for when the model has nothing to add, and the floor
when the second call fails or is declined. `evaluationSuggestions.ts` is not
replaced by this step. Its rule — **every suggestion carries the evidence behind
it** — applies to the model's output too: a suggestion the producer cannot check
against their own trace is an opinion.

## Grade outcomes, not paths

Unchanged and worth restating, because a model will happily grade a path: the
trace is a diagnostic shown to a person, never a pass/fail criterion. Agents
regularly find valid approaches an eval designer did not anticipate.

## Tests

- With the model's answer present, it is shown; with it absent or failed, the
  deterministic suggestions are.
- A clean run does not spend a second call.
- Every rendered suggestion — from either source — carries evidence.
- Measured against the HELD-OUT set, not the tuning set.

## Done when

A producer's suggestions come from their own trace, the cost of a clean run is
unchanged, and the improvement is measured on prompts the loop never saw.
