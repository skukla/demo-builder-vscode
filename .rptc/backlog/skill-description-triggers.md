---
id: PL-25
kind: chore
area: platform
needs: []
value: med
status: backlog
---

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

## Provenance

From auditing our agent-facing files against three t3.gg videos on AGENTS.md,
skills and memory (2026-08-30). The claim is stated twice across two of them, in
its sharpest form as: it should not be called a description, it should be called
a trigger.

Related: [[PL-27]] asks the larger question about how many skills should exist.
