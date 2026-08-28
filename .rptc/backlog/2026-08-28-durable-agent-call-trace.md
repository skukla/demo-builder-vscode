---
id: AI-2c
kind: feature
area: ai
parent: AI-2
needs: []
value: med
status: backlog
---

# Make the per-call agent trace durable and owner-visible

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-28 from the owner, watching the loop drive the extension:
"I noticed we capture MCP calls in the debug log. I think that's awesome. Do
we capture every call that's made by an agent? If not, should we?"

## What exists (verified in source at filing)

- `withToolLogging` (inExtensionMcpServer.ts) wraps BOTH registration paths:
  every call to OUR server logs name + argument KEYS + duration/outcome to
  Debug Logs. Values are excluded on purpose — args carry secrets.
- `toolTraceRecorder.ts` additionally records every call (reads AND writes)
  with a one-way fingerprint of argument VALUES (repetition computable,
  nothing readable retained), result bytes, duration, outcome — in an
  in-memory RING BUFFER, no file, consumed by the evaluation workbench. Its
  own docstring: no persistence "until something proves it is" needed. The
  owner's ask is arguably that proof.
- NOT captured, structurally: Bash / file edits / other MCP servers. Only the
  harness sees those; that whole-agent capture is AI-2b's parked product bet
  (own the permission channel). This item is NOT that.

## The idea

Give the existing per-call trace a durable, owner-facing form:

1. Persist the ring buffer (per-session JSONL under the project or a
   rotating file — bounded, fingerprints-not-values, same privacy posture).
2. Surface it: a Debug Logs channel section or a dashboard/workbench view —
   "what did the agent do in this session", call by call.
3. Optionally an MCP read (`get_agent_trace`?) so an agent can be asked
   "show me what you just did" — which also feeds tool-verdicts with live
   corpus data instead of transcript archaeology.

## Decisions that are the owner's

- Retention shape (per-session file vs rotating global) and where it lives.
- Whether the surfaced view is Debug Logs prose or a real UI.

Strengthens AI-2 (visibility) and AI-2b's case either way: if the cheap
durable trace turns out to answer most "what is it doing?" questions, the
expensive full-stream bet may not be needed; if it visibly can't (Bash-shaped
holes), that gap becomes measurable instead of anecdotal.
