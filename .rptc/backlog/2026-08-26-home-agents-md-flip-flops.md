---
id: AI-1g
kind: fix
area: ai
parent: AI-1
needs: []
value: high
status: built
layer: C
---
# The home AGENTS.md has two different contents, and which one you get is luck

## Index hook

*The item in one paragraph.*

**The same file says opposite things depending on what wrote it last, and every
headless agent run reads whichever it happens to find.** Extension activation
calls `ensureHomeAiContext` with no project name, which writes the branch that
ORDERS `get_current_project` before any action. The Chat tile calls
`refreshHomeAgentsMd` WITH the name, which writes the branch that states the
project and says explicitly not to spend a call confirming it. Measured
2026-08-26 by the prompt battery: the live file had been written at 23:18 by
activation, so **9 of 10 agent runs opened `ToolSearch → get_current_project`** —
two round trips before any work, on every prompt. The agent was obeying
correctly. This is not the 2026-08-24 fix (`54cbd2c06`) being broken; it is that
fix being reachable only when the Chat tile happens to have written last. Filed
2026-08-26.

## What was measured

Ten battery prompts, one run each, against a live host. Every path:

| prompt | opening calls |
|---|---|
| 9 of 10 | `ToolSearch` → `get_current_project` → *(the actual work)* |
| `auth` | `ToolSearch` → `get_auth_status` |

The live `~/.demo-builder/projects/AGENTS.md`, written 2026-08-25 23:18, carries:

> **Before starting any project task, call the `get_current_project` MCP tool
> and state which project you are working on…**

That is `buildActiveProjectDirective(undefined)` — the no-name branch.

## Why it is not simply "the fix did not work"

`buildActiveProjectDirective` is correct in both branches, and its reasoning for
the no-name branch is sound and documented: at activation the pointer can change
freely afterwards, so a name written then would be stale when read — the "right
data, wrong project" failure that made `StateManager.getCurrentProject()` re-read
from disk every call.

The defect is that **nothing keeps the file in step with the pointer.** Two
writers, two different outputs, last-writer-wins, and no relationship to whether
the content is still true.

## The shape of a fix

Not decided. The obvious direction is to make the name available at activation
AND refresh whenever the current-project pointer changes, which removes the
staleness objection rather than trading against it. `stateManager.ts` sets
`this.state.currentProject` in three places; none of them touches the home
bundle today.

Worth checking before building: whether a resumed conversation ever re-reads the
file at all (`openInClaude.ts:65` says refresh "reaches only cold starts and
headless `claude -p` runs"), because that bounds how much any fix can buy.

## How to tell whether a fix worked

A ROUTE metric, not tokens. Token deltas are swamped by cache state — a prior
measurement swung one prompt 55,236 → 8,959 on cache alone.

    paths that call get_current_project:  9/10 today  ->  target 0/10

Binary per prompt, ten prompts, run the full battery before and after. The fix is
global — it changes a file every prompt reads — so measuring it on one prompt
measures a tenth of it.

Filed 2026-08-26.

## Shipped so far

- 2026-08-26  docs(backlog): what the battery found — two bugs, one gap, one theory killed (`770f7987b`)
- 2026-08-26  fix(ai): the home AGENTS.md tracks the current project instead of guessing (`dc0d8ab58`)
- 2026-08-26  docs(backlog): AI-1g built — awaiting the measurement that would ship it (`f6f12e6af`)
