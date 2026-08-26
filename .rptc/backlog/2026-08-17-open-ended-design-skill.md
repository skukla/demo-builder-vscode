---
id: AI-1f
kind: feature
area: ai
parent: AI-1
needs: []
value: low
status: backlog
layer: C
---
# An open-ended design skill — for a pass that adds design skills, not for phase 5

## Index hook

*The item in one paragraph. Moved off the index 2026-08-26, which carried a second copy that drifted from this file.*

**Deferred out of phase 5 by decision — belongs to a pass that ADDS design skills, not one that corrected existing ones.** Every generated skill today answers "how do I do this named thing", or in `diagnose-demo`'s case "how do I look"; none answers "how do I approach a demo nobody gave me a recipe for". Whether that gap is real is genuinely open, and the item exists mainly to stop the next person inheriting a claim that does not hold: the overview's "21 skills, all task-shaped" rests on a count measured as **14**, and the conclusion was never independently checked. Also unresolved by design: skill vs an `AGENTS.md` section — a skill is best at "here is the sequence and its traps", and an open-ended brief has no sequence. Either way it is the first deliberate exception to the 2026-07-11 "no new generated skills unless multi-step-with-traps" constraint, so it needs an argument rather than a gap. Filed 2026-08-17.

**Provenance.** Deferred out of phase 5 of `.rptc/complete/ai-surface/` by user decision,
2026-08-17: this belongs to a pass that ADDS new design skills, not to a pass that
corrected existing ones. Phase 5's other two findings shipped (`e4efb90f`, `0a94137b`).

## The claim, and why it must be re-checked before it is acted on

The program overview records: *"21 skills, all task- or reference-shaped; no open-ended
design skill."*

**The count is wrong** — measured 2026-08-17, the generated bundle ships **14** skills, not
21. The conclusion drawn from that count was never independently verified. So the premise
of this item is a line whose only stated evidence is a number that does not hold.

Do not inherit it. Re-read the 14 and decide fresh.

## What "open-ended" would mean here

Every generated skill today answers *how do I do this named thing* — add a component,
sync changes, import a datapack, register a block — or *how do I look* (`diagnose-demo`,
the one reference-shaped exception). None answers *how do I approach a demo nobody has
given me a recipe for.*

Whether that gap is real, and whether a skill is the right shape for it, are two separate
questions:

- A skill is loaded on demand and is best at "here is the sequence and here are its
  traps". An open-ended design brief has no sequence.
- `AGENTS.md` is always in context and is where standing orientation lives. A design
  posture may belong there instead, at the cost of paying for it on every turn.
- The 2026-07-11 constraint still holds: **no new generated skills unless
  multi-step-with-traps.** An open-ended design skill would be the first deliberate
  exception, so it needs an argument, not just a gap.

## Before writing anything

1. Re-read the 14 shipped skills. Confirm or kill the "all task-shaped" claim on the real
   set, not the imagined 21.
2. Decide skill vs `AGENTS.md` section. Say which and why.
3. If a skill: it is an exception to a standing constraint. Record the argument in the
   same commit, or the next person reads it as drift.
4. `AI_CONTEXT_VERSION` bump and the `skillsWriter` count pins move — see the
   `ai-context-authoring` skill for the four gate seams.

## What this is NOT

Not a campaign to cover the 80 tools named in no generated skill. That number is real
and is not a backlog: tools are self-describing, their name and description ARE the
agent's search surface, and phase 5 established that the unit of work is a workflow with
a trap in it, not a tool without a mention.

## Kickoff prompt

> Read `.rptc/complete/ai-surface/phase-5-guidance.md` first — it records how the last pass
> measured the skill surface and why "80 tools unmentioned" is the wrong target. Then read
> all 14 files in `src/features/project-creation/templates/skills/` before forming a view.
> The question is not "should we add a design skill" but "what does an agent get wrong
> today that no existing skill addresses" — and if the answer is nothing, say so and close
> this.
