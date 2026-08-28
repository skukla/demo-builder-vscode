---
name: tool-verdicts
description: Per-tool verdict on the agent surface — keep, fix, investigate, or find out. Combines real usage from session transcripts with battery outcomes so "is this tool worth having?" is answered from two independent readings rather than from absence. Use at release cuts, before deleting any tool, or when asked which tools are worth keeping.
---

# Tool Verdicts

```bash
node .claude/skills/tool-verdicts/verdicts.mjs                 # the table
node .claude/skills/tool-verdicts/verdicts.mjs --json          # machine-readable
node .claude/skills/tool-verdicts/verdicts.mjs --verdict FIX   # one group
```

## Why it exists

On 2026-08-26 the claim "85 tools are unused, so nobody needs them" was made off
one producer's 50 sessions. Checked: 107 tools shipped, 28 ever called, 15
exercised by the battery, and **78 judged by neither**. Nothing had ever asked
those 78 to do their job, so nothing was known about any of them.

Absence from one person's month is not evidence a tool is dead.

## Two readings, and neither decides alone

| | source | answers |
|---|---|---|
| **Demand** | the agent activity record FIRST (`get_agent_trace` live, plus the per-session `agent-trace-*.jsonl` files under the extension's log storage — every real session since 2026-08-28 records itself); `agent-gap-scan` over transcripts for anything older | did anyone ever need it? |
| **Function** | the battery, one prompt per tool | when asked, does the agent find it and does it work? |

The trace is the cheaper and more structured demand reading — tool, outcome,
sizes, repeats, per call — but it is LOCAL to each machine and starts at its
ship date; transcripts remain the source for history before it and for
sessions on machines whose traces you cannot read.

A tool nobody called might be perfect and simply not needed yet. A tool nobody
called might be unreachable. Those want opposite actions, and only the second
reading tells them apart.

## The verdicts

| | means | do |
|---|---|---|
| `FIX` | asked for, and it failed or was insufficient | fix the tool |
| `INVESTIGATE` | asked for, and the agent went around it | find out why — name? description? |
| `UNJUDGED` | no prompt has ever asked for it | write a prompt before concluding anything |
| `DELETE?` | works when asked, nothing has ever needed it | a question, never a decision |
| `KEEP` | works, and real work called it | nothing |

**`DELETE?` carries its question mark deliberately.** The strongest thing this can
say about a tool nobody calls is "find out", and the honest reason is that our
corpus is one producer.

## An INVALID battery run is never a verdict

Runs scored `invalid` are skipped. A tool the harness blocked produces a route
identical to the agent avoiding it, and letting that become a verdict of record
is how a working tool gets deleted.

## Feeding it

The battery covers what its prompts cover. `toolPromptCoverage.test.ts` stops a
NEW tool shipping without a prompt — the same gate the repo already applies to
narration phrases and response ceilings — and grandfathers the pre-existing ones
in `unprompted-baseline.json`, a list that may only shrink.

**Shrinking that baseline is the work.** Every prompt written moves a tool from
UNJUDGED into a verdict that can be acted on.

## The deletion bar — set by the first deletion, 2026-08-27

`get_block_source` was the first tool removed on this table's evidence, and how
it went sets the bar for the 61 still unjudged. Three parts, ALL required:

1. **Zero corpus calls** — nobody has ever reached for it in real work.
2. **A failed audition** — a battery prompt whose natural route it should have
   been, and the agent went another way with a GOOD answer. Absence alone was
   never enough; an audition it lost is different evidence.
3. **No differentiator over the winning route** — verified by READING THE
   TOOL'S SOURCE, never by the score alone.

**Part 3 is the one that saved a tool the same day.** `get_component_config`
lost its audition identically (Glob+Read answered well), and the score read as
the same DELETE? evidence — but its source showed it was SUPPOSED to be the
safe door (secrets masked out of the transcript) and simply wasn't doing it.
The verdict was FIX, not delete, and the fix gave it the differentiator that
makes future auditions fair. A native-competition loss is a lead about the
tool's VALUE, and only the source says whether that value is absent or merely
unimplemented.

Two KEEPs from the same review, for the record of what a differentiator looks
like: `list_github_repos` (runs on the extension's VS Code session — the
fallback when `gh` is absent or unauthed) and `check_repo_readiness` (composite
classification shared with three production UI call sites; the agent's `gh`
route rebuilt it ad hoc, which is the parallel-implementation drift the spine
rules exist to prevent — the tool IS the chokepoint).

## Related

- `agent-gap-scan` — the demand half, and where jobs done WITHOUT us show up.
- `ai-coverage-scan` — the static half: handlers with no tool at all.
- `AI-1l` — the question this table cannot answer: whether a tool that scores
  KEEP is actually making the agent faster, or just moving where it gets stuck.
