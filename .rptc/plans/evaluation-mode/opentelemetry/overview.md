# Sub-plan — OpenTelemetry: the durable home for this data

**Parent:** `.rptc/plans/evaluation-mode/` (steps 01–09).
**Status:** planned, not started. Decided 2026-08-25 by the owner, moving it off
the parent plan's "deliberately not building" list.

## Why this exists as a SUB-PLAN and not a step

Every step in the parent plan changes code inside this extension. This one needs
something outside it — a collector to receive the data and somewhere to look at
it — and that is an infrastructure decision with its own owner, its own cost and
its own security review. Folding it into a step would hide all three.

## What it replaces, and what it does NOT

The step-02 recorder is **in memory, capped at 500 entries, and dies with the
window**. That was right for the workbench, which reads it in the same process.
It is wrong for three questions the recorder cannot answer:

- What did agents do across a WEEK, not a session?
- Is the tool surface getting better or worse for everyone, not for whoever ran
  the battery today?
- Which tools does nobody ever call?

**It does not replace the recorder.** The workbench needs a live, in-process
trace with no collector in the path. This is the durable half; keep both, and be
explicit about which answers which question, or someone will delete one.

## What is already known

- Claude Code emits `claude_code.tool` spans, and they carry
  `tool_result_size_bytes` officially. So the client half exists without us
  building it.
- Our own recorder already collects name, argument keys, argument fingerprint,
  result bytes, duration, outcome and dry-run status — the span attributes are
  mostly a mapping exercise, not a new measurement.
- `total_cost_usd` and the usage block come from the CLI's own JSON (verified
  2026-08-24), so cost does not need deriving from spans.

## The questions to settle BEFORE writing code

1. **Where does the collector live**, who runs it, and who pays for it.
   **ANSWERED 2026-08-25 (owner): nobody yet — and that is task one.** So this
   sub-plan does not begin with code. It begins with finding a destination and an
   owner, and if that stalls, the honest move is to stop rather than build an
   exporter with nowhere to send.
2. **What leaves the machine.** **DEFERRED BEHIND QUESTION 1, deliberately**
   (owner, 2026-08-25: "it depends on where this data will go"). Asked before the
   destination is known, this question has no answer — an internal Adobe
   collector and a third-party service permit completely different things.

   What is already settled either way: argument KEYS are safe by construction and
   the fingerprint is one-way. What must be decided against a known destination:
   project names, project shape, and prompts. Prompts are the sensitive one —
   they can contain anything, including customer names. This repo is public and
   has a standing rule about identifiers in anything committed; the same care
   applies to anything exported.
3. **Opt-in or opt-out**, and how a producer turns it off. Given the above, opt-in.
4. **Does it duplicate the CLI's own telemetry?** Claude Code can already export
   its spans. If the collector receives those, our exporter may only need to add
   what the CLI cannot know — which project shape, which build. Check before
   building a second pipeline.

## Steps (to be written once question 1 is answered)

Deliberately not enumerated yet. Every shape below depends on where the data
goes, and writing steps against an unknown destination is how a plan acquires
work nobody needs:

- an exporter behind the existing recorder seam
- attribute mapping + the redaction decision from question 2
- the setting, and its default
- a doc entry, and whatever the security review asks for

## The trap to carry forward

The parent plan's reason for deferring this was never "not valuable" — it was
"needs a collector, and the reader works today". If the collector question
stalls, that reason still holds and the honest move is to stop rather than build
an exporter with nowhere to send.
