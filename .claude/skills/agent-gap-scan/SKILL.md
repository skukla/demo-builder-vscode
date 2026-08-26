---
name: agent-gap-scan
description: Find gaps in the extension's AI surface from what agents ACTUALLY did — tools nobody calls, jobs agents did with Bash because no tool existed, and tools that failed. Reads Claude Code's own session transcripts, no instrumentation. Use at release cuts, when asked "is our MCP surface any good?", or before adding tools, to see where agents went instead of using us.
---

# Agent Gap Scan

**`ai-coverage-scan` asks whether the surface is big enough on paper. This asks
whether it worked in practice.** A tool can exist, be reachable, and still never
be used because nobody knows it is there — that gap is invisible to a static
scan and obvious in a transcript.

```bash
node .claude/skills/agent-gap-scan/scan.mjs            # the report
node .claude/skills/agent-gap-scan/scan.mjs --json     # machine-readable
node .claude/skills/agent-gap-scan/scan.mjs --write    # also save to .rptc/research/gap-finder/
```

Read-only. Runs in about a second over ~50 transcripts. Proposes; never applies.

## Why transcripts

They are already on disk (`~/.claude/projects/**/*.jsonl`), already complete, and
already historical. Nothing has to be running and nothing has to be instrumented.
Two hand passes over them found real gaps — the 2026-08-25 pass produced
`get_commerce_endpoints`, and the 2026-08-26 pass found two more in minutes. This
skill is that pass, automated.

It deliberately does NOT read the live recorder or the measurement battery. Both
need the extension running and a session driven on purpose; transcripts answer
the question with none of that. Add another source only when a question comes up
that transcripts cannot answer.

## The three shapes

1. **A tool nobody calls.** Candidates to delete, consolidate, or announce — a
   triage, not a build.
2. **A job agents did WITHOUT us.** The strongest signal, and the one nothing
   looked for before: an agent reaching for `curl` or `aio` where a tool should
   exist. Reported with the real commands, because the command IS the spec for
   the tool that should have existed.
3. **A tool that was called and failed.**

Plus the **orientation share** — what fraction of calls merely re-establish where
the agent is rather than doing anything.

## Two things that make the numbers wrong if you skip them

**Scope to demo projects.** Most transcripts are this repo developing ITSELF,
where reaching for Bash is correct and means nothing. Only sessions under
`~/.demo-builder/projects/` show an agent using the product. Mixing them is how
the first hand pass over-counted. `--all-projects` exists to debug the scanner,
not to read results.

**Most `is_error` results are NOT tool failures.** Measured 2026-08-26: the bulk
are "The user doesn't want to proceed", auto-mode classifier denials, and "model
temporarily unavailable". None says anything about our surface. Shape 3 filters
them out; without the filter it reports harness noise as product defects.

## It reproduces the hand analysis exactly

Validated on first run, against `AI-1b`'s manual pass over the same corpus:

| | hand pass | this scan |
|---|---|---|
| tools ever called | 20 of 105 | **20 of 105** |
| orientation share | 77% | **77%** |

That match is the reason to trust the rest of its output. If a future run
disagrees with a hand check, the scan is wrong until proven otherwise.

## Reading the control line

Every run ends with how many tool names were read from `src/`, how many distinct
tools appeared in transcripts, and how many were ours. **A broken scanner and a
genuinely unused surface print the same zeros** — the control tells them apart.
The script also aborts outright if it finds 0 tool names in `src/`, because
"nothing is used" is a devastating finding and a trivially broken scan.

## What to do with a finding

Shape 2 is the one that converts directly into work: the shell command an agent
wrote by hand is the specification for the tool it needed. `get_commerce_endpoints`
came from exactly that — 28 hand-assembled curls in one session.

Shape 1 is a triage and usually is NOT a build. 85 unused tools does not mean 85
missing announcements; most want deleting or consolidating.

## Related

- `ai-coverage-scan` — the static half: handlers with no MCP tool at all.
- `mcp-tool-authoring` — how to add the tool a finding calls for.
- `AI-1c` in the backlog — the item this skill closes; `AI-1d` reuses this
  machinery to harvest whole JOURNEYS rather than individual gaps.

_If this skill was wrong or incomplete, fix it before closing the task._
