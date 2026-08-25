# Sub-plan — Measurement: the held-out set, and proof the feature helps

**Parent:** `.rptc/plans/evaluation-mode/` (steps 01–09).
**Blocks:** step 09 — suggestions written by Claude must not be tuned on the
prompts they are judged by.
**Status:** planned, not started.

## Why this is a SUB-PLAN and not a step

It was drafted as step 08 and promoted on 2026-08-25, on the same test that
moved OpenTelemetry off the parent plan: a step changes code, and this does not
stop there.

Three things a step would hide:

1. **It is a METHODOLOGY, not a feature.** k=3, cold and warm reported
   separately, null cells kept as controls, the tool surface recorded beside
   every result. Get any of those wrong and the numbers look fine and mean
   nothing — which is exactly what happened to the original six prompts.
2. **It has a recurring, real cost.** Every battery run is N paid agent runs.
   Who runs it, how often, and against which build are operational questions
   with an owner, not implementation details.
3. **It needs NEW MATERIAL from outside the code** — held-out prompts written
   from real producer asks. Nobody can generate those from the repository, and
   inventing them defeats the entire point of holding them out.

## The operational questions to settle

Answer these before writing the runner, because each changes its shape:

- **When does it run?** Release cuts is the obvious answer (the `dream` and
  `codebase-sweep` skills already run there), but each battery run costs money,
  so "every cut" may be too often.
- **Against which build?** A comparison needs two, and the tool surface must be
  recorded with each or the delta is meaningless.
- **Where do results live** so a comparison six months later is still possible?
  Not in a session scratchpad — that is how the first six prompts were lost.
- **Who writes the held-out prompts**, and from what? Real producer asks, which
  means asking producers.

## Ships

A fixed battery that can be run on demand, and a number that says whether the
extension is getting better or worse for agents.

## Two jobs, one battery

1. **A HELD-OUT set** — prompts the suggestion loop is never tuned against. This
   is what stops step 09 overfitting, and the research this plan follows keeps
   one for exactly that purpose.
2. **A regression measure for US.** Run the battery before and after a change to
   the tool surface, and the delta says whether the change helped agents or hurt
   them. Today that is done by hand and the numbers are not comparable between
   runs.

## The material already exists — do NOT reconstruct it

`.rptc/plans/evaluation-mode/battery/` holds `run.mjs`, the 43-name allowlist,
and five prompts recorded VERBATIM. That directory exists because the original
six prompts were lost and the follow-up A/B had to reconstruct them, which made
its absolute figures incomparable to the numbers it was comparing against. Read
its README before touching anything here; every trap in it was paid for.

The load-bearing ones:

- **Persist prompts WITH results**, or the next comparison can only compare
  against itself.
- **Record the tool surface too** — build string from `serverInfo`, tool count,
  the allowlist used. A comparison across builds is meaningless without it.
- **k=1 is not enough for a token claim.** Use k=3, and report cold and warm
  separately: cache state alone swung one prompt 55,236 → 8,959.
- **Keep the null cells.** `components`, `auth` and `datapacks` are controls —
  they are what made a small-n result credible, because they moved <1% while the
  targeted ones dropped 25–57%.
- **Cost is not effect.** Two runs with near-identical billable tokens cost $0.34
  and $0.11 purely because one wrote cache and the other read it.
- **Restore what the run mutates.** `run.mjs` overwrites the developer's home
  `AGENTS.md` and does not put it back. Fix that as part of productising it.

## Split the battery

The five recorded prompts are the TUNING set. The held-out set must be prompts
step 09 never sees — write them here, from real producer asks, and mark the split
in the directory so a later change cannot quietly merge them.

## Where it runs

Behind a command, using the step-03 service so a battery run is just N
evaluations. Not on a schedule and not in CI: each prompt is a real paid agent
run, and background re-runs are already on the "deliberately not building" list
for that reason.

## Tests

- The runner reads its prompts from the recorded file rather than from anything
  inline — the exact failure the battery directory exists to prevent.
- A run records the tool surface alongside its results.
- The held-out set and the tuning set cannot overlap; assert on the two files.

## Done when

The battery runs from a command, writes results that name their prompts and their
tool surface, and the held-out split is a file rather than an intention.
