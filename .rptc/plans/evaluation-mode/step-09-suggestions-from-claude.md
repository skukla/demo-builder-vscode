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

## The cost of a suggestion is OURS, not the prompt's

**Owner decision, 2026-08-25: "their suggestions shouldn't be considered part of
the cost we track."** This is a measurement-correctness constraint, not a budget
preference, and it is stronger than the question that produced it.

The number a producer is trying to reduce is what THEIR PROMPT costs. Tokens we
spend analysing that prompt are our overhead. Fold the two together and the
headline inflates by our own analysis, run-to-run comparisons stop meaning
anything, and the feature reports failure at the moment it starts helping.

Two consequences, both binding:

1. **The reported `costUSD` covers the evaluated run and nothing else.** The
   suggestion call is accounted separately or not at all, never added in.
2. **It rules out folding the analysis into the run being evaluated.** That was
   the cheapest option on the table and it is now unavailable: a run that
   analyses itself spends the analysis inside the figure being measured, with no
   way to subtract it afterwards.

So the analysis is a SEPARATE call, and the remaining question is only when to
spend it. Default: **only when there is something to explain** — a clean run gets
no second call, which costs nothing on exactly the prompts that need no advice.
Opt-in per evaluation stays available if the second call proves expensive in
practice.

**Test this explicitly.** A reported cost that quietly includes the analysis is
invisible — it just looks like a slightly worse prompt. Assert that the figure
for a run WITH suggestions equals the figure for the same run without them.

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
