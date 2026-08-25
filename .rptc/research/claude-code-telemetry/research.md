# What Claude Code's own telemetry actually contains

Measured 2026-08-25 against Claude Code v2.1.245. This was task one of the
`opentelemetry/` sub-plan: decide whether the standard earns its place now that
there is no collector and no vendor.

**It does — but not as the plan framed it, and the difference matters.**

## Method

A local OTLP/HTTP sink on :4318 (twenty lines of node), and `claude -p` pointed
at it through `--settings`, because `CLAUDE_CODE_ENABLE_TELEMETRY` and the
`OTEL_*` variables are read from settings and re-applied over the inherited
environment — the same trap the battery README records for `ENABLE_TOOL_SEARCH`.

Two runs: one using built-in tools (Read, Bash), one calling a Demo Builder MCP
tool against a live extension host.

**A truncated capture nearly produced a wrong answer.** The first sink stored
only the first 4,000 bytes per request, and a search for "tool" returned ZERO —
which reads exactly like "Claude Code does not report tool use". Re-running with
full bodies found `tool_decision` and `tool_result` immediately. A zero from a
truncated sample proves nothing.

## Finding 1 — there are NO TRACES. Events and metrics only.

Nothing arrives at `/v1/traces`. Everything comes to `/v1/logs` and
`/v1/metrics`.

So the sub-plan's premise — "`claude_code.tool` spans carry
`tool_result_size_bytes`" — is wrong in form and right in substance. The data
exists; it is a LOG EVENT, not a span. Anything designed around spans, trace
context or parent/child relationships would be designed against something that
is not there.

Everything emitted:

| Kind | Names |
|---|---|
| Metrics | `claude_code.cost.usage`, `claude_code.token.usage`, `claude_code.session.count`, `claude_code.active_time.total` |
| Events | `tool_decision`, `tool_result`, `api_request`, `assistant_response`, `user_prompt`, `mcp_server_connection`, `hook_registered`, `hook_execution_start`, `hook_execution_complete`, `plugin_loaded` |

## Finding 2 — for Claude's OWN tools, the events are exactly what we lack

```
claude_code.tool_decision   tool_name: Read   tool_source: builtin
                            decision: accept  source: user_permanent
claude_code.tool_result     tool_name: Read   duration_ms: 1
                            success: true     tool_input_size_bytes: 167
                                              tool_result_size_bytes: 1694
```

Real names, real sizes, real durations, and success — for `Bash`, `Read`,
`Write`, the set Demo Builder's own recorder is completely blind to.

**And `decision` + `source` record WHY it ran.** The Bash call above shows
`decision: accept, source: config` — that is auto-approval, in the record. The
owner decided on 2026-08-25 that Claude's own permission checks stay off; this is
the after-the-fact evidence of what that let through, which is precisely the
mitigation that decision left open.

## Finding 3 — our OWN tools arrive ANONYMISED

```
claude_code.tool_decision   tool_name: mcp_tool   tool_source: mcp
claude_code.tool_result     tool_name: mcp_tool   mcp_server_scope: project
                            tool_input_size_bytes: 2   tool_result_size_bytes: 127
```

`tool_name` is the literal string **`mcp_tool`**. Not `list_projects`, not
`mcp__demo-builder__list_projects`. Claude Code deliberately does not report
which MCP tool was called.

**So the two sources are complementary, not overlapping**, and neither replaces
the other:

| | Claude Code telemetry | Our trace recorder |
|---|---|---|
| Its own tools (Bash/Read/Write) | full detail | invisible |
| Our tools | `mcp_tool`, no name | full detail, plus argument keys and a repeat fingerprint |

This kills the "maybe the CLI's telemetry replaces our recorder" question that
the sub-plan listed. It cannot. It also means a joined view is genuinely worth
more than either half — the sub-plan's original argument survives, for a reason
it did not know.

**Joining is not solved.** The events carry `tool_use_id` and `prompt.id`; our
recorder carries neither. Correlating would mean timestamps and ordering, or
adding an id our side cannot currently see. Do not assume a join is cheap.

## Finding 4 — the payload carries real identity, on every record

Every log record includes:

    user.email          the producer's actual email address
    user.id             a hash
    user.account_uuid   account identifier
    user.account_id     account identifier
    organization.id     organisation identifier
    session.id          session identifier
    terminal.type       which client

The privacy question was deferred as "it depends where this data goes", and the
answer became "nowhere, it stays local". **That decision now has a concrete
consequence:** a local telemetry file contains the producer's email address and
account identifiers. Storing is not sending — but the file must be gitignored,
must live outside any project directory, and anyone who later adds an upload or
attaches it to a support ticket is sending exactly that.

## What this means for the sub-plan

**1. We do not need to build an exporter.** Claude Code already emits everything
above. What is needed is a SINK — a local receiver that stores what arrives.
That is dramatically smaller than instrumenting our own spans, and it was not the
shape the sub-plan assumed.

**2. Drop "spans" from the design.** Events and metrics, over OTLP/HTTP JSON.

**3. Keep our recorder.** It is the only source with our tool NAMES, and the only
one with argument keys and the repeat fingerprint the workbench needs.

**4. The value is the safety story, not the metrics story.** Cost and tokens
already come from `claude -p --output-format json`, which the runner reads today.
What is genuinely new is a record of what the agent did with tools nobody asked
about.

**5. Turning it on is configuration, not code.** `CLAUDE_CODE_ENABLE_TELEMETRY`
and the `OTEL_*` variables — which the extension already controls, since it
launches the chat.

## Reproducing

Sink and runs are in the session scratchpad, not committed (they contain the
captured PII). The sink is twenty lines; the settings block is in the Method
section above.
