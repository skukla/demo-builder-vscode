# Step 02 — The trace recorder

**Ships:** what was called, in what order, how big the answers were, and what the
dry run blocked.
**Depends on:** step 01 (the gate tells the recorder what it stopped).

## Why in the server

The server already sees every call on **both** registration paths — descriptor
rows and directly-registered tools alike — because `withToolLogging` wraps them
all. Nothing else in the system has that view. It currently logs the tool name,
the argument keys and a duration, and throws the rest away.

## Build

Extend `withToolLogging` to record per call:

| Field | Note |
|---|---|
| tool name | |
| argument **KEYS** | never values — args carry secrets; this is why the existing log line is keys-only |
| result bytes | `Buffer.byteLength(…, 'utf8')`, not `.length` — a UTF-16 bug motivated that distinction in `mcp-live-probe` |
| duration ms | |
| ok / error | |
| blocked-by-dry-run | from step 01 |
| argument-value FINGERPRINT | a hash, never the values — see below |

**Reads are recorded exactly like writes, and that is the point.** The dry run
lets them execute; the recorder must still see them. Every measured win so far
has been a read: the orientation call this effort removed was a read, and the
A/B that killed the catalog-preload idea was counting reads. A recorder that
foregrounds blocked writes and treats reads as background would be blind to the
class of waste that actually shows up.

### Why a fingerprint, and not just keys

Argument KEYS alone cannot tell "asked about project A, then project B" from
"asked about project A twice". Only the second is waste, and it is the single
most common thing worth catching. Values cannot be retained — args carry
secrets, which is why the existing log line is keys-only.

So record a stable hash of the argument values instead. Repetition becomes
detectable (same tool, same fingerprint, twice in one session) while nothing
readable is kept. Hash the values only, so a secret never reaches the digest
input in a form worth attacking, and never log the fingerprint's preimage.

`mcpToolResult.ts` (`asText` / `asRawText`) is the single point every tool
response is serialised through — the natural place to measure bytes without
touching 23 registrar modules.

## `projectShape` is built but NOT wired — and why

The recorder accepts it and its tests cover it. It is not supplied, deliberately.

The only way to resolve the current project today is `getCurrentProject()`,
which reads from DISK on purpose: an in-memory pointer went stale and answered
confidently — right data, wrong project, and it bit the MCP surface. A disk read
on every tool call would add overhead to the very thing built to measure
overhead, which is the one cost this feature must not introduce.

The workbench (step 04) consumes this trace in the same process and can resolve
the project itself, segmenting at each `set_current_project` entry — the only
point in a trace where the answer can change. Wire it there, or add a
synchronous accessor to `StateManager` if step 04 shows it needs one per entry.
Do not paper over it with a TTL cache; a stale shape is the failure mode that
made `getCurrentProject` read from disk in the first place.

## Do NOT parse transcripts in the extension

The first draft of this plan said to read token cost from the session transcript.
That would duplicate `scripts/trace/transcript.mjs` inside `src/`, and this repo
fixes duplication rather than filing it.

Verified 2026-08-24: `claude -p --output-format json` already returns `usage`,
`modelUsage` (with `costUSD`), `total_cost_usd`, `num_turns`, `duration_ms` and
`permission_denials` in one object. Step 03 spawns those runs, so **cost comes
from the run's own output** — no parser in the extension.

Ambient mode (user chatting normally) has no stdout to read because we do not own
that process. It gets the trace from this recorder; token accounting there is
**deferred, not duplicated**. OpenTelemetry is the supported route if it ever
matters (`claude_code.tool` spans carry `tool_result_size_bytes` officially).

`scripts/trace-session.mjs` stays the offline/retroactive tool for history
already on disk. Different job.

## Storage

Keep it in memory for the current session first — the workbench (step 04) is the
consumer and it is in the same process. Only persist if step 04 proves it needs
history across restarts, and if so cap and rotate it. Do not build a growing log
file speculatively; the owner explicitly raised unbounded logs as a concern.

## Tests

- A recorded entry carries keys and **no values** — plant a secret argument and
  assert it is absent, in the entry AND in the fingerprint.
- A read tool is recorded, under dry run and with the mode off. The recorder
  must not inherit the gate's read/write split — that split decides what RUNS,
  not what is worth seeing.
- The same read called twice with identical arguments produces the same
  fingerprint; called with different arguments, a different one. Without both
  halves the repeat detector in step 04 cannot be built on it.
- A blocked call is recorded as blocked, and its handler never ran (composes with
  step 01's assertion).
- Both registration paths are covered: a descriptor-row tool and a
  directly-registered one. The response-envelope guard shipped covering only one
  directory and missed ten tools in `src/mcp-server.ts`; the same shape is
  available here.

## Success-with-no-effect is NOT built here

The overview asks for it as a distinct outcome. It is not in this step, because
no honest signal exists yet: a tool that returns `{success:true}` having changed
nothing is indistinguishable, from the wrapper's seat, from one that changed
something. Inventing a heuristic would produce a field that reads as evidence
and is not.

What this step does instead is record enough that step 04 can ASK the question —
outcome, result bytes, duration and the repeat detector. If a real signal is
wanted, it has to come from the tools themselves (a handler saying "nothing to
do"), and that is a surface change, not a recorder change.

## Done when

Recorded trace matches what actually happened for a driven session, both paths
covered, no secret values retained, `gate` clean.
