# Does Anthropic document what we are building? — research pass

**Date:** 2026-08-24 · **Question:** we are building a way to measure the path an
agent takes through the extension, and want an interface where a prompt is run,
measured, and handed to an LLM for improvement suggestions. Has Anthropic
documented an approach, and does any of it make our work redundant?

**Sources:** anthropic.com/engineering (three posts, fetched and read — see
citations inline). The repo's `adobe-docs-lookup` skill was invoked as required
by its hook; it is **Adobe-scoped and does not cover Anthropic docs**, though its
routing lesson applies (pick the right corpus; confirm before citing).

## Short answer

**Yes — almost exactly, and it validates the design while correcting two parts
of it.** What we described is close to Anthropic's documented method for
evaluating and improving agent tools. Nothing found makes the transcript reader
redundant; the metrics it collects are the metrics they name.

## 1. The improvement loop we described is their documented method

From [Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents):

> "You can even let agents analyze your results and improve your tools for you.
> Simply concatenate the transcripts from your evaluation agents and paste them
> into Claude Code."

They add that Claude "is an expert at analyzing transcripts and refactoring lots
of tools all at once," and that **most of the advice in that post came from
doing exactly this** against their own internal tools — with held-out test sets
to avoid overfitting.

So the "submit a prompt → measure it → ask the LLM for improvements" interface is
not speculative. It is their method, and the input it needs is the transcript,
which we can already produce and parse.

## 2. Their recommended metrics are the ones we already collect

They name: top-level accuracy · **total runtime** · **total number of tool
calls** · **total token consumption** · **tool errors**. Our reader emits calls,
tokens (split fresh/cache/thinking), errors and wall-clock. The only one missing
is *accuracy*, which needs a task set with expected outcomes — the part we have
not built.

They also note tracking tool calls "can help reveal common workflows that agents
pursue and offer some opportunities for tools to consolidate," which is exactly
what our six driven runs surfaced.

## 3. CORRECTION: do not grade on the path

From [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents):

> "We've found this approach too rigid and results in overly brittle tests, as
> agents regularly find valid approaches that eval designers didn't anticipate."
> **Grade outcomes, not steps taken.**

Our sketched harness scored "did the agent reach the right tool" — path
correctness. That is the thing they explicitly warn against as a grading
criterion.

The nuance worth keeping: the tools post says you *may* optionally specify
expected tools "to measure whether or not agents are successful in grasping each
tool's purpose," while cautioning against overspecifying. So **the path is a
legitimate diagnostic and a bad grader.** Measure it, read it, do not fail a run
on it.

## 4. CORRECTION: the discovery call is a documented pattern, not a defect

Our six runs all opened with `ToolSearch`, which we listed as the top thing to
eliminate. From [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp):
they recommend adding a **`search_tools` tool** so agents "load only the tools
they need" instead of loading all definitions up front, and describe reading tool
definitions on demand as progressive disclosure. Their headline figure is
**150,000 → 2,000 tokens (98.7%)** for an agent connected to very many tools.

**But our measurement says the trade does not apply to us.** We measured the
entire 103-tool catalog at **~2,616 tokens** (cold, A/B isolation). Their case is
"hundreds or thousands of tools" where definitions cost 150k. At 2.6k, paying a
round trip to avoid loading everything is a bad deal — and a round trip is the
dominant unit of cost in our own numbers.

This is the one place where our measurement beats their general guidance, and it
only became visible *because* we measured rather than adopted the pattern.

## 5. Their tool-design guidance maps onto what we measured

**Consolidation** is their lead recommendation, and it lands precisely on our
orientation-overhead finding:

> Instead of separate `list_users`, `list_events`, and `create_event` tools,
> implement a `schedule_event` tool that handles availability-finding and
> scheduling in one call.

Ours is `list_projects` + `get_current_project` + `get_project` before the real
question — three reads answering "where am I" on a one-project machine. Same
shape, same fix.

Also relevant, and each checkable against our surface:
- "More tools don't always lead to better outcomes."
- Namespacing by prefix; they report prefix-vs-suffix choice having "non-trivial
  effects" — ours are already `mcp__demo-builder__*`.
- Response limits: Claude Code restricts tool responses to **25,000 tokens by
  default**. Our largest recorded ceiling is 40,000 bytes (~10,000 tokens), so we
  are inside that.
- Return "only high signal information"; resolve opaque UUIDs to meaningful
  names, which "significantly improves Claude's precision."
- A `ResponseFormat` enum (`detailed` / `concise`) — their Slack example makes
  concise ~⅓ the tokens.

## 6. Eval methodology, if we build the harness

- **Scale:** "20-50 simple tasks drawn from real failures is a great start."
  Not one per tool, and not hundreds. Sourced from manual checks and the bug
  tracker, prioritised by user impact.
- **Variance** — the answer to our "one run is an anecdote" problem is named:
  **pass@k** (at least one of k succeeds) versus **pass^k** (all k succeed). If
  per-trial success is 75%, pass^3 ≈ 42%. Choose by whether the product needs one
  success or consistency.
- **Isolation:** "Shared state between runs (leftover files, cached data,
  resource exhaustion) can cause correlated failures." Validates the
  disposable-project-per-run constraint we already set.
- **Two-sided:** test where a behaviour should occur AND where it should not.
  "One-sided evals create one-sided optimization."
- **Read the transcripts:** "You won't know if your graders are working well
  unless you read the transcripts and grades from many trials."
- Grade with code where outcomes are checkable; LLM-as-judge where open-ended,
  calibrated against human grading. Build in partial credit.

## What this changes

1. The prompt → measure → improve interface is worth building; it is their
   documented loop and our reader already produces its input. But **move
   per-call size/duration accounting to OpenTelemetry** — it is the supported
   contract for exactly the fields we hand-derive.
2. **Grade outcomes, not paths.** Keep the path as a diagnostic.
3. **Do not remove `ToolSearch` as an efficiency win** — it is a deliberate
   pattern. Our own numbers argue it is a bad trade *at our tool count*, which
   is a measurement to act on, not a defect to fix. Worth testing directly:
   compare a run with the catalog preloaded against one that searches.
4. **Consolidation is the strongest supported lever**, and it targets exactly the
   orientation overhead we measured.
5. Start a task set at 20-50 tasks from real failures, not one per tool.

## 7. What Anthropic SHIPS (not just documents)

Answered by a parallel lookup against the Claude Code / Agent SDK docs.

### `claude plugin eval` — a real eval runner, but aimed one level away from us

Early access, **enabled per organization** (not enabled here; it exits 1 with an
early-access notice). What it does:

- Runs eval suites in **isolated sessions**, scoring each case **3 times by
  default** — i.e. the repeat-runs discipline the evals post prescribes, built in.
- Optional **baseline arm**: same case with and without the plugin, and reports
  the delta.
- Sandboxes each run: fresh workspace, isolated config dir, only the plugin under
  test loaded, credentials cleaned up after.
- Cases are `evals/<case>/prompt.md` plus `graders/<name>.md`. Grader types:
  `regex`, `file_exists`, `llm` (judge, 2-of-3 vote), `baseline`, and — notably —
  **`tool_used` and `tool_order`**.
- `--json` emits a versioned `aggregate-result.json` (schemaVersion 1); an HTML
  report is always written. CI-ready exit codes.

**The catch: it evaluates PLUGINS, not a standalone MCP server.** To use it we
would wrap our MCP surface as a plugin. Worth pursuing access; not a drop-in.

**Note the tension, and it is worth flagging rather than smoothing over:** the
evals blog post warns that grading on the path is "too rigid… overly brittle,"
yet the shipped runner offers `tool_used` and `tool_order` graders. Read together,
the sane reading is: path graders exist for cases where a specific tool genuinely
must be reached, and the warning is against making them the default. Our use —
"did the agent find the right route" — is exactly the case they are for, but it
should sit alongside an outcome grader, never replace it.

### `/skill-doctor` — usage accounting only

Early access, not enabled here. Reports per-skill token usage (7-day rolling),
invocation counts, never-invoked warnings, and unused plugins. It does **not**
test behaviour or discoverability. Useful for finding dead weight in the bundle;
not an efficiency instrument.

### OpenTelemetry tracing — the officially supported version of what we built

This is the most consequential finding. With `CLAUDE_CODE_ENABLE_TELEMETRY=1`,
`CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` and an OTLP exporter, Claude Code emits:

- `claude_code.interaction` — one turn of the agent loop
- `claude_code.llm_request` — per API call, with model, latency, token counts
- `claude_code.tool` — per tool invocation, with `tool_name`, `tool_use_id`,
  `success`, `duration_ms`, **`tool_input_size_bytes`, `tool_result_size_bytes`**

That last line is the thing our reader hand-derives by joining `tool_use.id` to
`tool_result.tool_use_id`. **It is available officially, documented, and stable —
where the `.jsonl` transcript format is neither documented nor versioned.**

The Agent SDK's `query()` also yields per-step `usage` and a per-model
`modelUsage`/`model_usage` breakdown with `costUSD`.

**Recommendation:** keep the transcript reader for what it is good at — zero
setup, retroactive, works on history already on disk — and move the *per-call
size and duration* accounting to OTel when we build anything durable. Our reader
is inference over an undocumented format; OTel is the supported contract.

### `--output-format=stream-json` is NOT the better input

It emits ordered events (`tool_use`, `tool_result`, etc.) but **carries no
per-turn token usage**. So for cost accounting the transcript is strictly better
than stream-json, and OTel is better than both.

### Also shipped, and not what we need

Console **Evaluation Tool** (prompt testing, CSV cases — not MCP tool
evaluation) · **Tool Runner** (`client.beta.messages.tool_runner`, an agentic
loop you host, not an eval framework) · **Managed Agents** (no eval harness).

### Confirmed absent

No public guidance on measuring "did the agent pick the right tool" for a
standalone MCP server; no tool-efficiency benchmark suite; no documented reason
why agents run a discovery step before acting. `strict: true` on tool definitions
is documented as reducing malformed-call round trips — worth checking whether our
write tools set it.

## Still open

- Whether to request `claude plugin eval` early access for this org.
- Whether our write-side tools set `strict: true` (documented round-trip saving,
  not yet checked).
