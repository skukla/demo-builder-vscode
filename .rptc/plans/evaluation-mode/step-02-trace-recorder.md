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

`mcpToolResult.ts` (`asText` / `asRawText`) is the single point every tool
response is serialised through — the natural place to measure bytes without
touching 23 registrar modules.

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
  assert it is absent.
- A blocked call is recorded as blocked, and its handler never ran (composes with
  step 01's assertion).
- Both registration paths are covered: a descriptor-row tool and a
  directly-registered one. The response-envelope guard shipped covering only one
  directory and missed ten tools in `src/mcp-server.ts`; the same shape is
  available here.

## Done when

Recorded trace matches what actually happened for a driven session, both paths
covered, no secret values retained, `gate` clean.
