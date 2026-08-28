---
id: AI-2d
kind: feature
area: ai
parent: AI-2
needs: []
value: med
status: backlog
---

# A call tag links the activity record to its debug-log lines

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-28, owner-approved in discussion, with one hard design rule
(below). Follow-on to the agent activity record (AI-2c).

## The gap

The debug log already records agent calls AND all the work they cause — but
nothing connects a specific call to its specific lines. Investigating "why
did that call fail?" means scrolling to the timestamp and guessing which of
the interleaved lines belong to that call versus whatever else was running.
The activity record says THAT it failed; the log knows WHY; the link between
them is manual.

## The idea

Each agent tool call gets a short tag. The tag lands on the call's
activity-record entry and on every debug-log line written while serving that
call. Investigation becomes mechanical: failed call in the record → take its
tag → filter the log by it → read exactly the lines that explain it.

Mechanism sketch: the server's per-call wrapper (the same chokepoint the
recorder uses) establishes an ambient call context; the logger reads it and
appends the tag. Lines from work the agent did NOT cause carry no tag —
which also makes agent-caused vs user-caused work visually distinct in the
log, for free.

## THE DESIGN RULE (owner, 2026-08-28): prefixes stay human-scannable

"They still need to be easy for a human to scan." Concretely:

- The existing subsystem prefix (`[Guards]`, `[AppBuilder]`, `[MCP]`) stays
  FIRST — it is the eye's scanning anchor and must not move.
- The tag is short, numeric, monotonic per window (`#47`), never a hash —
  hex kills scanning.
- One placement, everywhere, e.g. `[Guards #47] 1/3 auth check…` — never a
  second bracket group, never trailing.
- Untagged lines stay exactly as they are today.
- Accept before shipping: put ten tagged and untagged lines in front of a
  human; if the tag slows finding the subsystem prefix, the format is wrong.

## Where the tag appears (settled with the owner, 2026-08-28)

- **Agent Activity channel + the trace record**: once per line/entry — the
  tag NAMES the call (`#47 ✗ Deploying the integration`).
- **Debug Logs**: on every line written while serving the call — the tag
  marks MEMBERSHIP (`[Guards #47] auth check…`). Filter by tag = read only
  that call's lines.
- **User Logs: never.** It is the headline stream for a person watching
  their own operation; call bookkeeping is noise there. Same instinct as
  the scannability rule.

## Effort

Evening-or-less: ambient context at the one chokepoint, logger reads it,
tag into the trace entry, tests (tag present during a call, absent outside
one, correct across concurrent calls — the interleaving case is the point).
