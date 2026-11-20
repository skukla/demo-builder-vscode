---
id: AI-78
kind: question
area: ai
needs: []
value: med
status: backlog
---

# Can long jobs use MCP tasks, so the agent's client waits instead of the AI?

Filed 2026-11-06, from the bulk-installer live test (owner, 2026-11-05: "What about this concept of
having to poll? Is that something that can be improved?").

## What is built

A datapack install or removal is a background job. Since 2026-11-05 `start_datapack_import`,
`reset_datapack` and `get_datapack_import_status` take `waitSeconds` (at most 45; 60 timed out in a client on the MCP library's 60 s default, 2026-11-06). The call waits
for the job, sending progress lines into the chat, and answers when the job ends or the minute is
up (`importJobWait.ts`; `docs/systems/mcp-server.md`, "Waiting on a datapack job"). A 2,000-product
install is then about four calls instead of dozens. Each call is still an AI turn.

## The question

As far as I know, the MCP standard added an experimental "tasks" feature in late 2025. The client
starts a call as a task, gets an id back, and the CLIENT polls the task's status and fetches its
result. The model spends no turns on the wait. Not verified here:

1. Does Claude Code support tasks? Does Copilot (VS Code chat and CLI)?
2. Does our `@modelcontextprotocol/sdk` version have it on the server side? Partly answered
   2026-11-05: `npm audit` lists an advisory on our 1.29.0 titled "Experimental tasks were not tied
   to the session that created them", so tasks exist in it (fixed in 1.32.2; see [[PL-94]]).
3. How long may one tool call run in each client before it times out? If that limit is generous,
   holding the call open for the whole job, with progress lines, may be simpler still.

## Recommendation

Answer 1 and 3 first, with a probe like `.rptc/research/agent-activity-visibility/` (the one that
proved Claude Code renders progress messages). If both main clients support tasks, move the three
datapack calls to tasks and keep `waitSeconds` for clients that do not. If neither does, keep the
wait; raise the 60-second ceiling only after measuring the clients' call limits.

Other jobs that poll today would gain the same way: mesh deploys, integration deploys, project
creation.
