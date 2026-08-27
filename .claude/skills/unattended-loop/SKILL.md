---
name: unattended-loop
description: Run backlog items in a self-pacing loop without the owner present — pick an item, triage its unattended lane, execute (including RPTC research/plan/TDD phases), gate, commit to a work branch, and report. Use when the owner says they are leaving / "run the loop" / "work without me", or names a time budget. The standing contract from the 2026-08-27 overnight run.
---

# The unattended loop

The owner's primary working mode when away (established 2026-08-27, after the
overnight run proved every mechanism): pick up an item, pursue it as far as the
rails allow, report in plain English. The owner reads the report and makes the
decisions the loop parked — never the work the loop could have done itself.

## Standing authorization, and its exact edges

The owner authorized this as a MODE, so the loop does not re-ask per run:

- **Commits go to a work branch** (`loop/<date>-<slug>`), pushed for backup.
  The owner chose branch-over-develop for unattended work once, explicitly;
  that choice is the standing default. Develop is touched only when the owner
  is present. The report ends with the merge decision.
- **RPTC phases are in scope** — research, architecture, TDD. A research pass
  that produces a reviewed plan IS a completed unattended unit of work.
- **The evidence bar is unchanged by absence**: verified three ways (source +
  corpus/measurement + live where possible) or FILE it, never force it.
  Overnight there is no one to catch the fifth retraction.

## The rails (identical to the proven run — do not relax any of them)

- No cloud writes: nothing that deploys, publishes, creates or deletes remote
  resources (Adobe, GitHub, DA.live). No consent-gated tools. No sign-ins —
  an expired session DEFERS work, it never prompts a browser at an empty desk.
- No UI-opening tools (settings panels, browser tabs) in the sleeping window.
- Unattended battery runs use the reads-only allowlist; never widen it.
- Every commit is CONDITIONAL on the full gate with exit codes captured into
  variables — never read through a pipe. One red commit shipped the night this
  was ad hoc; the conditional refused the next one.
- On a permission denial: adapt or file. Never stall, never subvert intent.
- Machine sleep is the loop's death: `caffeinate -ims -t <seconds>` first.

## Picking an item — the three lanes

Triage at pickup, and SAY the lane in the report:

1. **Fully executable** — code, tests, docs, local verification. Run to done.
2. **Executable to a supervised edge** — do everything up to the cloud write /
   visual check / product decision, then write the handoff so the owner's part
   is minutes, not a restart. Most items are this lane.
3. **Research/design** — invoke `rptc:research` (and architecture methodology
   where structure is uncertain); the deliverable is a plan in
   `.rptc/plans/<slug>/` the owner reviews. Never let "can't finish it
   unattended" mean "didn't start it".

Selection order: the owner's named item first; otherwise highest-value
startable from `backlog.mjs next`, preferring lane 1/2 over 3.

## Exhaust before bailing, and never stop at one item

A supervised edge is a wall for ONE PATH, not for the item (owner, 2026-08-27:
"exhaust every unsupervised thing you can do per backlog item"). On hitting
one, enumerate what ELSE the item offers unattended — another slice, its
tests, its docs, research for a later phase, the fixture a supervised step
will need — and do that before leaving. An item is exhausted only when every
remaining step genuinely needs the owner.

When exhausted: write that item's report entry, then MOVE TO THE NEXT item
from `backlog.mjs next` and repeat. The loop ends on the time budget or on the
backlog running out of unattended work — never on the first wall.

## The cycle (each iteration)

collect results → analyze → execute the next slice → gate (exit codes) →
commit to the work branch + push → live-verify where possible (compile +
`reload_window` + `mcp-live-probe`) → log to the item (`backlog.mjs log`) →
schedule the next wakeup. Background tasks are the primary wake signal;
`ScheduleWakeup` is the long fallback heartbeat, and carries the loop contract
so a wakeup resumes cold.

## Time budget

When the owner names one ("an hour"), reserve the last ~5 minutes for the
report. Without one, run until work dries up or stops being verifiable.

## The report (the loop's real product)

Plain English, for someone who was not there. Sections, always:

- **Shipped** — done, gated, verified; on the branch awaiting merge
- **Handed off** — finished to the supervised edge; exactly what remains
- **Filed** — findings that did not meet the bar, recorded not forced
- **Retracted / corrected** — anything the loop got wrong and fixed
- **Environment facts** — expired sessions, stale pointers, open prompts
- **Your decisions** — merge?, the parked choices, nothing else

Multi-item runs report PER ITEM, each with its own shipped/handed-off state,
and close with a **walkthrough queue**: the items needing the owner, ordered,
each reduced to the one decision or action required — so the return review is
item by item, minutes each, never a re-derivation.

Also written to `.rptc/handoff/<date>-loop-report.md` so it survives the
session. Log the loop's close to the items it touched.

## Lessons already paid for (do not relearn)

- The trailer hook survives every commit; the log line does not — run
  `backlog.mjs unlogged --write` before the report.
- A battery/scan finding is a LEAD; read the source before sentencing (the
  deletion bar in `tool-verdicts`).
- Self-test every new instrument (`--self-test` plants defects); a scan's
  first real run usually finds a bug in the SCAN.
- An interrupted loop resumes from the wakeup prompt — keep it current with
  the actual state, not the state at loop start.
