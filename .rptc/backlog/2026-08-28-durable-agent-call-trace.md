---
id: AI-2c
kind: feature
area: ai
parent: AI-2
needs: []
value: med
status: backlog
---

# The agent activity record — a foundation, with a live view as its first use

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-28 from the owner watching the loop drive the extension ("we
capture MCP calls in the debug log. I think that's awesome"); REFRAMED the
same day on the owner's read: this is not "persist the log" — it is the
activity record other features stand on. "It feels like a foundation for
other things."

## What exists (verified in source at filing)

- Every call an agent makes to OUR server already logs a live line in Debug
  Logs (tool, argument NAMES — never values, they can carry secrets —
  duration, outcome) via `withToolLogging`, and the editor mirrors output
  channels to files (`read_debug_logs` serves that mirror).
- Behind the log line, `toolTraceRecorder.ts` keeps a RICHER per-call record
  (a one-way fingerprint of argument values, so "asked the same thing twice"
  is computable without retaining anything readable; result size; duration;
  outcome) — in-memory ring buffer only, dies with the window. Its docstring
  defers persistence "until something proves it is" needed. This item is that
  proof.
- NOT captured, structurally: shell commands, file edits, other MCP servers.
  Only the harness sees those. That whole-stream capture is AI-2b's parked
  bet — and use 4 below is how this item helps decide it.

## What to build

1. **Keep the record**: the recorder gains a sink writing each entry to a
   per-session file under the extension's log storage — bounded (last ~10
   sessions), same privacy posture (fingerprints, never values), with a
   privacy PIN in tests: no argument value ever reaches disk.
2. **The first visible use — a dedicated live channel**: "Demo Builder:
   Agent Activity" — the Debug Logs experience the owner already likes, but
   ONLY agent actions, one line per call, readable as a narrative.
3. **The agent-facing read**: a tool serving the current session's record
   and recent sessions' files — "show me what you did".

Deliberately NOT in v1: any new screen. The channel + the tool tell us
whether one is wanted.

## The foundation — who stands on this (named at reframing, 2026-08-28)

1. **Tool life-or-death decisions, continuously.** Two tool verdicts this
   week (one deletion, one narrowing) each required assembling evidence by
   hand from battery runs and transcript archaeology. A kept trace makes
   every REAL session part of the corpus automatically — "unused in a month
   of real sessions" becomes a readable fact. (Feeds `tool-verdicts`.)
2. **Waste-finding.** The biggest efficiency win so far (removing the
   orientation call every session made — 25–57% of measured prompts) was
   found by hand; the trace records exactly the repetition pattern that
   finds the next one. The owner's "I waste a ton of tokens" concern, made
   measurable in real usage. (Feeds the round-trip-optimisation work.)
3. **After-the-fact debugging.** "The demo broke after the agent worked on
   it" gets a trail: diagnose-demo can open with "what changed recently, in
   what order", and a colleague's bug report starts with "send the trace".
4. **Settling AI-2b cheaply.** If a reviewable call log answers most "what
   is it doing?" moments, the own-the-chat-surface bet may never be needed;
   if the interesting actions keep being the shell commands the trace cannot
   see, that gap becomes measurable instead of anecdotal.
5. **Eventually, the producer's receipt**: hand a demo over WITH the record
   of everything the agent did to build it. A trust feature with no
   equivalent today.

## Defaults chosen (change cheaply later)

Retention: per-session files, last ~10 sessions. Surface: channel + tool,
no new UI. Both were owner decisions the loop proposed as defaults.

## Effort

One loop (~an evening) — smaller than the install-state surface (AB-5),
which shipped in one. All local, no cloud; live-verifiable with the probe
and one battery prompt.
