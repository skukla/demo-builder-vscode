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

## Shipped so far

- 2026-11-23  Loop 2026-11-23, research (questions 1-3). Verified here: our SDK is 1.32.2; it has server-side tasks as the EXPERIMENTAL 2025-11-25 shape (server.experimental.tasks.registerToolTask with execution.taskSupport, needs a task store; node_modules/@modelcontextprotocol/sdk/dist/esm/experimental/tasks/mcp-server.d.ts:16-70); the SDK client's default request timeout is 60 s (shared/protocol.d.ts:57), which matches the 60 s failure we saw, and resetTimeoutOnProgress is off unless a client opts in. Reported by web sources, not checked live: the 2026-07-28 spec moved tasks into an official extension with a different wire shape (no tasks/result); Claude Code supports that tasks extension in public beta from CLI 2.1.304 (interactive CLI and Agent SDK, not the VS Code extension or subagents); Claude Code's MCP_TOOL_TIMEOUT default is about 28 hours with progress resetting an idle timeout; nothing found for Copilot. Recommendation: keep waitSeconds; do not move to tasks until our SDK emits the extension's shape and Copilot's support is known. Next unattended step: a read-only probe like .rptc/research/agent-activity-visibility to confirm Claude Code's real call limit. Findings file: session scratchpad ai78-research.md (temporary).
- 2026-11-23  Findings kept in .rptc/research/mcp-tasks-for-long-jobs/research.md (the scratchpad copy named above is temporary).
