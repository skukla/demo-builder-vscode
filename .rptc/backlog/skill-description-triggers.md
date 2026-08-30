---
id: PL-25
kind: chore
area: platform
needs: []
value: med
status: dropped
---

> **Answered 2026-08-30, and the answer is: leave the nine alone.** The evidence is
> in "What the measurement said" below. Dropped rather than shipped — the work this
> item proposed turned out not to be work worth doing, and the measurement is the
> deliverable. Do not re-file it without new evidence.

# Skill descriptions should trigger, not describe

A skill's `description` is resident in context whether or not the skill ever
loads. Its job is therefore to carry the words that make the model reach for the
skill — not to explain what the skill contains. The body explains; the
description recruits.

Measured 2026-08-30 across all 37 skills:

- **28 carry an explicit trigger clause** ("use when…", "when you…", "before…").
- **9 do not.** All nine are scan or analysis skills, where the honest answer to
  "when" is fuzzy — "at a release cut" is a calendar, not a cue.
- All 37 descriptions together are **~3,600 tokens resident in every session**;
  the median is 390 characters, the longest 547.

The nine without a trigger clause:

    rptc-hygiene-scan              architecture-duplication-scan
    codebase-sweep                 agent-gap-scan
    test-strategy-scan             tool-verdicts
    debug-log-triage               mutation-test-pilot
    test-divergence-scan

## Measure before rewriting

Do NOT rewrite the nine on the strength of the argument. The claim is that a
weak description means the skill does not fire when it should — and this repo
already owns the instrument that can check it. `agent-gap-scan` reads real
session transcripts; ask it which of the 37 skills have ever actually been
invoked, and by what.

Three outcomes, three different jobs:

- A trigger-less skill that never fires → rewrite its description, then re-measure.
- A trigger-less skill that fires fine → the description was never the problem;
  leave it and record that.
- A skill nothing has ever needed → that is a `tool-verdicts` question (is it
  wanted?), not a wording one.

`tool-verdicts` is the precedent for the discipline: it refuses to conclude
anything about a tool no prompt has ever asked for, because "unused" and
"unwanted" are different findings.

## The second axis: cost

3,600 tokens of always-resident description is a real budget. If the measurement
shows several skills are never reached at all, the question stops being "reword
it" and becomes "should this be one skill instead of two". Answer that with the
usage data, not by counting characters.

## What the measurement said (2026-08-30)

Run as this item instructed, before touching any wording.

**Do the trigger-less skills actually fail to fire?** Across 54 real session
transcripts, counting `Skill` tool invocations. Two of the nine were unrouted in
CLAUDE.md until that morning and so could not have fired at all, whatever their
description said; excluding them:

| | ever invoked |
|---|---|
| descriptions WITH a trigger clause | 22 / 28 (78%) |
| descriptions WITHOUT one | 4 / 7 (57%) |

Real, but small — and the control kills any temptation to over-read it: **six
skills that DO have a trigger clause have never fired either**
(`ai-bundle-coherence`, `ai-coverage-scan`, `call-path-audit`,
`component-extraction-scan`, `eds-dropin-vendoring`, `webview-visual-baseline`).
Wording is not the variable it looked like.

**Then the reason turned up.** Eight of the nine trigger-less skills are classified
`cadence: periodic` in `tests/sop/toolingRegistry.ts` — the release-cut instruments.
They have no trigger clause because **they are not triggered by anything in a
conversation.** Their cue is a calendar and a human decision. A description reading
"use when the user asks to…" would be a lie, and inventing keywords to make one fire
mid-task is the opposite of what anybody wants from a scan that proposes changes
across the whole repo.

**And they cannot be marked user-invoked either**, which is where this was heading.
`disable-model-invocation: true` is real frontmatter (verified in
`claude-security/SKILL.md`, not merely mentioned in a reference doc). But our skills
COMPOSE: `unattended-loop` instructs invoking six of these as its done gate,
`codebase-sweep` invokes four, `cut-release` offers five. Only 2 of the 16 periodic
skills — `mutation-test-pilot` and `ai-bundle-coherence` — have nothing pointing at
them. Disabling model invocation on the rest would sever documented chains to buy
nothing.

**So the nine descriptions are correct as written.** The general claim ("a
description is a trigger, not a description") is sound and 28 of 37 already follow
it; it simply does not apply to instruments whose trigger is a release.

The one thing worth keeping from this item is the cost figure: all 37 descriptions
are ~3,600 tokens resident in every session. If that budget ever needs cutting, cut
it by merging skills, not by shortening the descriptions that make them findable.

## Provenance

From auditing our agent-facing files against three t3.gg videos on AGENTS.md,
skills and memory (2026-08-30). The claim is stated twice across two of them, in
its sharpest form as: it should not be called a description, it should be called
a trigger.

Related: [[PL-27]] asks the larger question about how many skills should exist.
