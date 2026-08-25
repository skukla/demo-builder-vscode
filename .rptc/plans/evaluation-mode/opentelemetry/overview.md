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

## DECIDED 2026-08-25 (owner): local only, no vendor, nobody owns a collector

That changes what this sub-plan IS, and the honest consequence is uncomfortable:
**it may not want OpenTelemetry at all.**

OpenTelemetry is a STANDARD for emitting traces, plus pipes for shipping them
somewhere. Its value is almost entirely the ecosystem on the other end — tools
that store, query and chart what you send, without you building any of it. Take
the far end away and what remains is a specification, a dependency, and a file
format nobody on this team can read without installing something to read it with.

So the question is no longer "where does the collector live". It is:

> With no vendor and no collector, does adopting a standard buy anything over
> extending the storage step 07 already needs?

**Two arguments for OTel-anyway, and they are the whole case:**

1. **Claude Code emits its own `claude_code.tool` spans.** If both landed in one
   place, a trace would show what the agent did OUTSIDE our tools too — file
   edits, shell commands, web fetches. Our recorder can never see those, and that
   joined view is a different picture rather than a nicer one.
2. **It is the format to be in if a collector ever appears**, so today's data is
   not stranded.

**The argument against:** step 07 is already building durable per-project
storage. Extending it is a smaller change, produces readable JSON, adds no
dependency, and answers "did this get better" — the question actually being
asked.

## Raised in priority 2026-08-25 — it is now a SAFETY story, not just a metrics one

Filed as durable capture for measuring the tool surface over time. Then two
things happened on the same day:

1. Comparing with `tech-case-studio` established that our consent gate covers
   **our** tools only. Anything the agent does with Bash, Write or Edit passes
   without Demo Builder seeing it.
2. The owner decided Claude Code's own permission checks stay OFF, because the
   interruption cost is real.

So nothing asks about those tools, by choice. **That makes after-the-fact
visibility the only mitigation left** — and `claude_code.tool` spans cover
exactly the set our recorder is blind to.

The measurement below was already task one. It is now worth doing sooner than
its position in the plan suggests.

## Task one is a MEASUREMENT, not code

**Settle argument 1 by looking.** Turn on Claude Code's own OTel export to a local
file and read what a `claude_code.tool` span actually contains for a session
against this extension. Rich enough to be worth joining, and OTel earns its place
and this sub-plan proceeds. Thin, and extend step 07's storage and close this
sub-plan as ANSWERED rather than built — a real outcome, not a failure.

Nothing else here starts before that.

## The remaining questions, if it proceeds

1. ~~Where does the collector live~~ — **ANSWERED: nowhere. Local only.**
2. **What leaves the machine — ANSWERED by the same decision: nothing.** The data
   stays on the producer's disk, which dissolves the privacy question that was
   blocking this. Prompts and project names become storable, because storing is
   not sending.

   Two things it does NOT dissolve:
   - **A local file still leaks if it is committed.** This repo is public and has
     a standing rule about identifiers in anything committed. Whatever path is
     chosen must be gitignored, and outside any project directory a producer
     might commit.
   - **"Local" becomes "sent"** the day someone adds an upload or a support flow
     asks for the file — without anyone revisiting this decision. Whatever is
     written must be readable enough that a producer can see what they would be
     handing over.
3. **Opt-in or opt-out.** Local-only weakens the case for opt-in — nothing leaves
   the machine — but a growing file on someone's disk is still theirs to refuse.
   Cap and rotate regardless; unbounded logs were objected to before this feature
   existed.
4. **Does it duplicate the CLI's own telemetry?** Now the FIRST question rather
   than the fourth — see the measurement above.

## Steps (to be written once the measurement is in)

Deliberately not enumerated. Every shape below depends on the measurement's
answer, and writing steps against an unknown is how a plan acquires work nobody
needs:

- an exporter behind the existing recorder seam
- attribute mapping, and the gitignore/readability decisions from question 2
- the setting, and its default
- a doc entry

## The trap to carry forward

The parent plan deferred this because it "needs a collector, and the reader works
today". Removing the collector removes the blocker AND most of the benefit at
once. The failure mode now is not stalling — it is building a standards pipeline
to a file, calling it telemetry, and finding a year later that nobody ever opened
it.

The measurement prevents that. Do it first, and be willing to close this sub-plan
as answered rather than built.
