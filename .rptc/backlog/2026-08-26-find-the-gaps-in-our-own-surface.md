---
id: AI-1c
kind: feature
area: ai
parent: AI-1
needs: []
value: high
status: backlog
---
# The other half of suggestions: finding holes in OUR tools

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
