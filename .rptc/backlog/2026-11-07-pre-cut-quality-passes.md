---
id: PL-95
kind: chore
area: platform
needs: []
value: high
status: gated
waiting-on: the next release cut (beta.153) — run just before `cut-release`, after the walk's last fix
---

# Before the next release cut: the two lapsed quality passes

Filed 2026-11-07 (owner). Both periodic quality passes have lapsed: `codebase-sweep` (the code:
duplication, dead code, dependency cycles) last ran 2026-08-27, and `dream` (the agent's
instructions: memory, skills, CLAUDE.md, mined from session transcripts) last ran 2026-08-24. Both
only write a proposal file; nothing changes until items are accepted.

`high` because the cut waits on it. It is a step in the beta.153 test plan's "Before the cut" list
(`.rptc/plans/beta-153-release-tests/overview.md`, 4.5a, immediately before the cut in 4.5), so it
comes up right before the cut. The cut skill's own "Periodic passes gate" (the dev-pipeline
freshness check, `.claude/skills/cut-release/SKILL.md`) also flags both as overdue at the cut.

## To do

> Before the release cut, run the `codebase-sweep` skill, then the `dream` skill. Both are overdue (last runs 27 and 24 August). Show me each proposal so I can accept or reject items. Apply only what I accept. Afterwards, update the `last:` dates for `codebase-sweep` and `reflect` in `.pipeline.yaml` to today. Don't commit until I say so.
