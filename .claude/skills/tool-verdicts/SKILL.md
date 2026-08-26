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
| **Demand** | `agent-gap-scan` over real transcripts | did anyone ever need it? |
| **Function** | the battery, one prompt per tool | when asked, does the agent find it and does it work? |

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

## Related

- `agent-gap-scan` — the demand half, and where jobs done WITHOUT us show up.
- `ai-coverage-scan` — the static half: handlers with no tool at all.
- `AI-1l` — the question this table cannot answer: whether a tool that scores
  KEEP is actually making the agent faster, or just moving where it gets stuck.
