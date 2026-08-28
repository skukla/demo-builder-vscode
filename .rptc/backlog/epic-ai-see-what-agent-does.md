---
id: AI-2
kind: epic
area: ai
needs: []
value: high
status: active
---
# Can you see what the agent is doing?

**Provenance:** a producer complaint, 2026-08-24 — *"while an agent works you
cannot tell what is running."* Not which MCP server, not which tool, not which
phase of a long operation.

**Partly shipped.** MCP progress notifications narrate each tool call into the
terminal, and `toolNarration.ts` gives 105 tools authored plain-English phrases.
What is missing is the summary and anything interactive — MCP only lets us speak
in response to a tool call, and we never learn that a turn ended.

## Two competing solutions. Only one gets built.

| | |
|---|---|
| `AI-2a` | **Activity view** — a companion panel beside the terminal. Cheap. Costs height, not width, so the chat stays readable |
| `AI-2b` | **Own the chat surface** — render the stream ourselves. Spiked 2026-08-26: feasible, and better than assumed, but built on an undocumented API |

The spike (`.rptc/research/own-the-chat-surface/spike.md`) exists to price the
second. Read it before arguing for either.

## Done when

A producer can see, without going looking, what the agent just did and whether it
wasted their quota doing it.

## Clarified aim (owner, 2026-08-28)

The target surface is the **Prompt Workbench** — this epic is its visibility
layer, not just terminal/channel narration. What shipped in beta.145 (the agent
activity record, `get_agent_trace`, call tags — AI-2c/AI-2d) is the FOUNDATION:
the data the workbench's trace view reads. The view itself already exists as
parked work on `feature/evaluation-mode-dry-run` (`PromptWorkbench.tsx`,
`AgentTraceView.tsx`, `Transcript.tsx` under `src/features/ai/evaluation/ui/`),
taken off develop by AI-3b. This epic closes when that visibility layer is in
producers' hands — do not close it on the activity channel alone.

## Shipped so far

- 2026-08-28  Owner clarified the aim: this epic is the Prompt Workbench's visibility layer. beta.145's activity record + call tags are its foundation; the view components are parked on feature/evaluation-mode-dry-run (AI-3b). Stays active — not closable on the channel alone.
