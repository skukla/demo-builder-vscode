# Evaluation Mode

Try a prompt out, see what it *would* do and what it would cost, refine it, and
only then run it for real.

## Why it exists

A producer asks an agent for something, watches tool calls scroll past, and four
minutes later something has happened. If it did the wrong thing they find out
afterwards. If it was slow they have no idea why. And the extension team has no
way to tell whether a change to the tool surface helped agents or hurt them.

Evaluation Mode answers both: what would this prompt do, and is that getting
better.

## Using it

**Demo Builder: Try a Prompt Out** opens the workbench. Type what you would
normally ask, and you get back:

> **Nothing was changed.** 8 steps, $0.24, 41s, 3 wasted.

Below it: what it would have changed, which steps were wasted, and suggestions
carrying the trace fact behind each — *"It looked up which project you meant 3
times."* Mechanical fixes apply with a click, and a second run reports the delta.
When the prompt is right, one deliberately different button hands it to the chat
to run for real, and another saves it to the Prompt Library.

An agent can do the same on your behalf: *"evaluate this prompt"* reaches the
`evaluate_prompt` tool, which answers a summary rather than the whole trace.

There is also **Demo Builder: Toggle Agent Dry Run**, which puts your ORDINARY
chat into dry run — every change simulated — until you turn it off. While it is
on, "Agent dry run" sits in the status bar, because a mode you cannot see is a
trap.

## How it works

Five pieces, each with one job.

### 1. The gate — mutation becomes impossible

`inExtensionMcpServer.ts` checks, before every tool call, whether this server is
in a dry run. If it is, any tool that is not read-only is stopped **before its
handler** and answers what it WOULD have done: the tool name and its argument
KEYS, never values.

Four properties are load-bearing:

- **It answers DATA, not an error.** An error teaches an agent to retry; data
  lets it keep going, so the rest of the path still gets measured.
- **It runs BEFORE consent.** A `confirm: true` call is stopped by the dry run
  and raises no dialog — approving something that will not happen is worse than
  not asking.
- **Reads pass through.** A dry run that also blinds the agent measures a path
  nobody would take.
- **It fails closed.** A tool that does not declare itself is treated as a write.

### 2. Tools declare what they are

The gate reads each tool's own `annotations.readOnlyHint` (descriptor rows spell
it `readOnly`, which the compiler requires). It used to be a regex over the tool
NAME, which cannot express "called `check_` and writes anyway" — `check_github_app`
is exactly that, and the guard holding it closed had to be found by a hand audit.

Annotations also reach the client in `tools/list`, so Claude Code learns which of
our tools are safe.

Full rules for adding a tool: `mcp-tool-authoring`.

### 3. The recorder — what actually happened

`toolTraceRecorder.ts` records every call on both registration paths: name,
argument keys, response size, duration, outcome, and whether the dry run blocked
it. **Reads are recorded exactly like writes** — every measured win so far has
been a read.

Each entry also carries a one-way hash of the argument VALUES. Argument names
alone cannot tell "asked about project A, then B" from "asked about A twice", and
only the second is waste. Values cannot be kept because arguments carry secrets,
so the hash gives repetition-detection without retaining anything readable.

It is a ring buffer of 500 in memory. No file, and it dies with the window.

### 4. The runner — one implementation, three doors

`promptEvaluationService.ts` spawns a headless `claude -p --output-format json`
and joins the CLI's own cost figures with the trace recorded while it ran. Two
halves answering different questions: the JSON says what it COST, the trace says
what it DID.

Reached by the agent (`evaluate_prompt`), by a command, and by the workbench —
all through this one service, so the paths cannot drift.

Cost is reported in **dollars**. "$0.21" means something to a demo builder;
"47,550 tokens" does not.

### 5. The workbench — the loop

A webview (`features/ai/evaluation/ui/`) showing the verdict, the waste, what was
blocked, and the trace in plain language. Running for real and saving to the
library reuse the Prompt Library's own handlers rather than reimplementing them.

## The two guarantees, and how they hold

### An evaluation cannot change anything

**It gets its own server.** When a run starts, the extension opens a SECOND
`InExtensionMcpServer` on its own socket with the dry run hard-wired on, and
launches the agent with `--mcp-config` pointing at it plus `--strict-mcp-config`.
The listener is disposed in a `finally`.

This replaced a module flag that forced the dry run window-wide, which had two
problems. It paused everything else the producer was doing for up to two minutes.
And it could be missed entirely: the agent finds a server via the proxy — pinned
socket if live, otherwise the newest one — so a reloaded window plus another open
window meant the run landed on a server whose flag was false, and **its writes
executed for real while the workbench said nothing was changed**.

Making it a fact about which socket you are connected to, rather than about which
window is running something, fixes both.

Two things to know if you touch this:

- **The config passed in keeps the project's OTHER MCP servers.**
  `--strict-mcp-config` ignores every other configuration, so a config naming only
  demo-builder would run the evaluation without Playwright and anything else the
  project declares — measuring a path the producer would never take.
- **It REFUSES when there is no `.mcp.json` to base the config on.** Running
  without the flag would reach the ordinary server. A refusal is the only safe
  answer.

### An evaluation cannot evaluate itself

That would bill in a loop. TWO independent guards: the service refuses while one
is in flight, and `runAsEvaluation` refuses to nest. The spawned run is also
launched with the tool disallowed, but a CLI flag is a string, and this repo has
shipped a string-asserted guard that never ran.

**Note for anyone testing this**: removing either guard alone leaves the test
green, because the other still refuses. It fails only when both are removed.

## What is deliberately NOT built

Recorded with reasons in `.rptc/plans/evaluation-mode/`:

| | Why |
|---|---|
| Suggestions written by Claude | Scheduled (step 09), blocked on a held-out set so the advice is not tuned on the prompts it is judged by |
| History across window reloads | Scheduled (step 07). The delta currently survives one session only |
| "Succeeded but changed nothing" as an outcome | Dropped — needs a change across the whole tool surface for a rare finding |
| Durable capture / OpenTelemetry | Sub-plan, and it starts by measuring whether the standard buys anything with no collector to send to |

A constraint worth carrying: **the cost of generating a suggestion is ours, not
the prompt's.** Folding them together would inflate the number a producer is
trying to reduce and break run-to-run comparison.

## Consent, and asking twice

Destructive calls raise a modal in the VS Code window. Since 2026-08-25 the
dialog also offers **"Allow for the rest of this session"** — but only for
`republish` and `sync_content`, the two tools that fire repeatedly in one flow
and are undone by running them again. Everything else asks every time. See
`agent-alerts.md` for the two tests that decide it.

**Consent is asked in the CHAT first**, since that is where the producer is
looking, with the VS Code modal as the floor when the client cannot be asked.
Anything that is not an explicit accept is a refusal — a server cannot tell
"nobody was there" from "the user said no", so the blunt rule is the honest one.
Record: `.rptc/research/consent-in-the-chat/`; details in `agent-alerts.md`.

## The limit worth knowing

The dry run makes **Demo Builder's** tools unable to change anything. It does not
stop an agent writing a file or running a command with Claude Code's own tools —
those never reach this extension, so neither the dry run nor the recorder sees
them.

An evaluation therefore measures the path through OUR surface accurately, and is
blind to the rest of what the agent did. For prompt efficiency that is mostly
fine, since the waste being hunted is in our round trips. For "was that safe", it
is not: read `agent-alerts.md`.

## Related

- `mcp-server.md` — the tool surface these run against
- `agent-alerts.md` — the five surfaces that speak to a producer, and their copy
- `.rptc/plans/evaluation-mode/` — the plan, the steps, and what each deferred
