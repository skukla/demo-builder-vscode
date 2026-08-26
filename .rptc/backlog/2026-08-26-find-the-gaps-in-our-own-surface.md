---
id: AI-1c
kind: feature
area: ai
parent: AI-1
needs: []
value: high
status: built
layer: B
---
# The other half of suggestions: finding holes in OUR tools

## Index hook

*The item in one paragraph. Moved off the index 2026-08-26, which carried a second copy that drifted from this file.*

**Planned in step 04 of Evaluation Mode, never built, and not carried into steps 09/10/11 either.** That step said suggestions come in two kinds — *"prompt-level, applied with a click; and **surface-level, for us**"* — and only the prompt-level half shipped (`evaluationSuggestions.ts`, three deterministic rules). Raised by the owner 2026-08-26: *"I thought I could use what we're building to discover holes and gaps in my tools, skills, hooks."* **Worth more than it looks, because it was done BY HAND on 2026-08-25 and it worked**: a manual pass over 48 real sessions found agents reach 20 of 105 tools, that 77% of calls are six orientation reads, and that the one stretch of real Commerce work hand-assembled **28 `curl`s** because nothing answered "what is this project's GraphQL endpoint" — which produced `get_commerce_endpoints`, now shipped. This item is about not doing that by hand. **It is a SECOND TOOL, not a section of the producer's panel** — burying "for us" findings in a surface a producer reads is how it got lost the first time. Three shapes worth finding, only the first covered today: a tool nobody calls (76 of 105); **a job agents do WITHOUT us** (an agent reaching for Bash where a tool should exist is the strongest signal of a gap, and nothing looks for it); and a tool that succeeds while doing nothing. Build on: `ai-coverage-scan` (static supply side), the recorder (runtime), Claude Code's transcripts (durable — they answer "which tools does nobody call?" with one script, a question `opentelemetry/` claims for itself), and the `measurement/` battery. Open: command, skill, or release-cut report; and which sources it reads. Filed 2026-08-26.

## It was planned, and it fell through

`step-04-workbench.md` said suggestions come in two kinds:

> *"prompt-level, applied with a click; and **surface-level, for us** — 'Three
> prompts all begin by re-discovering the…'"*

**The prompt-level half shipped** (`evaluationSuggestions.ts`, three
deterministic rules). **The surface-level half was never built**, and it was not
carried into steps 09, 10 or 11 either. Raised by the owner on 2026-08-26:
*"I thought I could use what we're building to discover holes and gaps in my
tools, skills, hooks. That may be another tool we had set out to build, but I
don't know if you captured it."* It was set out. It was not captured.

## Why it is worth more than it looks: we did it by hand and it worked

On 2026-08-25 a manual pass over 48 real sessions established that agents reach
**20 of 104 tools**, that 77% of all calls are six orientation reads, and that
the one long stretch of real Commerce work hand-assembled **28 `curl`s** because
nothing on the surface answered "what is this project's GraphQL endpoint".

That produced `get_commerce_endpoints`, which now ships. **An afternoon of
manual analysis found and closed a real gap.** This item is about not having to
do that by hand.

## It is a SECOND TOOL, not a section of the producer's panel

The same split step 11 makes between narrating and analysing applies here: the
producer's advice and our gap-finding are different products for different
readers. Burying "for us" findings in a panel a producer is reading is how it got
lost the first time.

## What already exists to build on

| Piece | What it gives |
|---|---|
| `ai-coverage-scan` skill | STATIC: handlers with no MCP tool — the agent surface being too small |
| The recorder + `agentTraceReport` | RUNTIME: what agents actually called |
| Claude Code transcripts (`~/.claude/projects/**/*.jsonl`) | Every `tool_use` across every session, durably on disk. This is what the 48-session pass read |
| `measurement/` battery | Routes per prompt, with the tool surface recorded beside them |

The transcripts are the surprising one: they answer "which tools does nobody ever
call?" with one script and no infrastructure, which is a question the
`opentelemetry/` sub-plan claims for itself.

## The shapes worth finding

Three, and only the first is covered today:

1. **A tool nobody calls** — 76 of 104 are neither announced nor used.
2. **A job agents do WITHOUT us** — the `curl` case. An agent reaching for Bash
   where a tool should exist is the strongest possible signal of a gap, and
   nothing looks for it.
3. **A tool that is called and fails, or is called and does nothing** — the
   inapplicable-tool class the parent plan already describes (`start_demo` on an
   EDS project returning success while starting nothing).

## Open

- Is this a command, a skill, or a report at release cuts (beside `dream` and
  `codebase-sweep`, which already run there)?
- Does it read transcripts, the live recorder, battery results, or all three?
- Filed 2026-08-26.

## Shipped so far

- 2026-08-26  Research done (.rptc/research/gap-finder/research.md) — both open questions answered from evidence: transcripts-only, as a release-cut skill. Shape 2 proven detectable; two new tool gaps found (run a Commerce GraphQL query; read Adobe I/O context + deployed mesh).
- 2026-08-26  agent-gap-scan skill built — transcripts-only, three shapes + orientation share. Reproduces the AI-1b hand pass EXACTLY (20 of 105 tools, 77% orientation) on first run.
- 2026-08-26  Time axis added (--since/--until, per-finding first/last seen). Without it the scan reported June gaps as current: 24 of 35 curl calls predate get_commerce_endpoints, and 19 of 23 get_current_project calls were the BEFORE runs for the fix that shipped that same day.
- 2026-08-26  First real use of agent-gap-scan's output: the battery it informed found exactly one gap (AI-1h) and one bug (AI-1g). Also exposed the scan's own limit — it reports what agents DID, and could not have found the AGENTS.md flip-flop, which only shows when you drive a known prompt and watch the route.
