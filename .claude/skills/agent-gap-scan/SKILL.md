---
name: agent-gap-scan
description: Find gaps in the extension's AI surface from what agents ACTUALLY did — tools nobody calls, jobs agents did with Bash because no tool existed, and tools that failed. Reads Claude Code's own session transcripts, no instrumentation. Use at release cuts, when asked "is our MCP surface any good?", or before adding tools, to see where agents went instead of using us.
---

# Agent Gap Scan

**`ai-coverage-scan` asks whether the surface is big enough on paper. This asks
whether it worked in practice.**

**Division of labor with the agent activity record (AI-2c, since 2026-08-28):**
the trace (`get_agent_trace` + the per-session `agent-trace-*.jsonl` files)
answers "which of OUR tools ran, how often, how big, did they fail" — cheaper
and structured, so reach for it FIRST for usage counts. This scan remains the
only reading for what the trace is STRUCTURALLY BLIND to: Bash workarounds,
native file reads, other MCP servers — the "did the job without us" evidence
that IS the gap signal — plus everything older than the trace's ship date and
what the agent SAID while working. The trace measures us; the transcripts
measure the world around us. Neither replaces the other. A tool can exist, be reachable, and still never
be used because nobody knows it is there — that gap is invisible to a static
scan and obvious in a transcript.

```bash
node .claude/skills/agent-gap-scan/scan.mjs                      # the report
node .claude/skills/agent-gap-scan/scan.mjs --since 2026-08-01   # only that window
node .claude/skills/agent-gap-scan/scan.mjs --json               # machine-readable
node .claude/skills/agent-gap-scan/scan.mjs --write              # save to .rptc/research/gap-finder/
```

## ALWAYS pass `--since`, or read the dates

**A finding with no date is not a finding.** The corpus spans months, and without
a window the scan piles a gap you closed in June next to one from yesterday and
they look identical. Its own first run did exactly that:

- 24 of 35 `curl` calls were from **June**, before `get_commerce_endpoints`
  existed at all.
- 19 of 23 `get_current_project` calls were from **2026-08-24** — the same day
  `54cbd2c06` shipped the fix that stops the agent making them. They were the
  BEFORE runs that motivated the fix, being reported as the problem.

Every finding now carries `first … last` seen, and an unwindowed run prints a
warning saying so. Comparing two windows is how you answer "did our change
help?", which is the question the whole AI-surface effort turns on:

| window | `curl` | `aio` | orientation |
|---|---|---|---|
| all time | 35 | 23 | 77% |
| since 2026-08-01 | 11 | 5 | 78% |
| since 2026-08-25 | 5 | 0 | 67% |

That table is the skill earning its keep: the `curl` gap is LIVE, the `aio`
cluster has gone quiet, and neither could be told apart before.

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

## The battery's own runs are excluded

A battery run is `claude -p` inside `~/.demo-builder/projects`, so its transcript
lands in the very directory this scan reads as real work. Left in, the
measurement feeds its own evidence.

Measured 2026-08-26: **54 of 90 sessions were battery runs** — 60% of the corpus.
`run_commerce_query` showed "17 calls in real work" and all seventeen were our own
runs of a tool that had shipped that day. Excluding them put tools-ever-called
back to **20**, which is what the original hand analysis found before the battery
existed.

They are identified exactly, not heuristically: a battery session's first user
message is the prompt verbatim, matched against `prompts.json`. The control line
reports how many were excluded, so a producer who happens to type one word for
word is visible rather than silently dropped.

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

## Reading one journey

```bash
node .claude/skills/agent-gap-scan/scan.mjs --session <id-prefix>   # add --json for the rows
```

The aggregate answers **which tools go unused**. It cannot answer **whether the
used ones are any good**, because that question is about a response and its
consequence, and both are only meaningful in sequence. Journey mode pairs each
of our calls with what it answered and what the agent did next.

**Flags are LEADS, never verdicts.** `REPEAT+n` prints how many events later the
same tool was called again: near means the answer did not stick, far means the
agent legitimately re-oriented, and only reading tells you which. Same for
`→BASH` — early in an arc it is a discovery gap, late it is a capability gap.

`PROSE-ERROR` is the trap the battery met first: a tool answering "Adobe sign-in
required" as ordinary text with `is_error` unset, which every count scores as a
success.

### The corpus excludes battery runs, and you must not bypass that

`batterySessionsExcluded` is usually the MAJORITY of files — 78 of 120 on
2026-08-26. Those are our own harness calling our own tools, and counting them
measures the rig rather than the product.

Reading transcripts with an ad-hoc `glob` instead of this scan silently includes
them. That happened on 2026-08-26 and produced "32 `get_current_project` calls,
84% chained" for what is really **12 calls, 83% chained** — right direction,
nearly triple the magnitude. Use the scan, or reproduce its exclusion.

### What it has found

`get_current_project` returns a name and a path in ~100 bytes, and **83% of its
calls are followed immediately by another of our reads**. It orients without
answering anything actionable, so the next step pays a second round trip. The
aggregate's *"Reads that are a preamble to another read"* section computes this
over the corpus — reading a single session suggested `get_project` as the usual
follow-up, and across the corpus it is not that clear-cut.
