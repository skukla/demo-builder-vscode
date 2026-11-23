# AI-78 research: MCP tasks, client support, timeouts (2026-11-23)

## 1. What MCP tasks are
- Spec 2025-11-25 (https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks): "Tasks were introduced in version 2025-11-25 ... and are currently considered **experimental**."
- Flow: client sends tools/call with params.task {ttl}; server answers at once with CreateTaskResult {taskId, status "working", pollInterval}; client polls tasks/get; tasks/result blocks until terminal and returns the real CallToolResult; tasks/cancel cancels. Tool opts in via tools/list execution.taskSupport = required|optional|forbidden; server declares capabilities.tasks.requests.tools.call.
- Spec progress page: progress tokens stay valid for a task's life.
- Newer: latest spec is 2026-07-28 (https://modelcontextprotocol.io/specification/latest). Tasks moved out of core into an official EXTENSION (io.modelcontextprotocol/tasks). SEP-2663 (Final, created 2026-04-27): server-directed, methods tasks/get, tasks/update, tasks/cancel, result discriminator resultType:"task". No tasks/result. Different wire shape from 2025-11-25.

## 2. Installed SDK (node_modules/@modelcontextprotocol/sdk/package.json: version 1.32.2)
- Server API: server.experimental.tasks.registerToolTask(name, config, handler) with config.execution = { taskSupport: 'required'|'optional' }; handler implements createTask, getTask, getTaskResult (dist/esm/experimental/tasks/mcp-server.d.ts:16-45, 59-70). Needs a taskStore (extra.taskStore.createTask({ttl})).
- Enforcement: dist/esm/server/mcp.js:160-171 (required without task request -> MethodNotFound; optional -> automatic polling). Plain registerTool is taskSupport 'forbidden' (mcp.js:748).
- This is the 2025-11-25 experimental shape, NOT the 2026-07-28 extension. No evidence found that 1.32.2 implements SEP-2663.
- Timeout API (client side of SDK): DEFAULT_REQUEST_TIMEOUT_MSEC = 60000 (shared/protocol.d.ts:57); options resetTimeoutOnProgress, maxTotalTimeout (protocol.d.ts:83,89); reset happens in shared/protocol.js:462-463. Default is false (protocol.js:742), so a client built on the SDK only resets if it opts in.

## 3. Clients
- Claude Code: YES, for the 2026-07-28 tasks extension. Docs https://code.claude.com/docs/en/mcp section "MCP tasks": "An MCP task is a long job ... that an MCP server runs itself using the MCP tasks extension. Claude's tool call returns once the server accepts the job, so Claude keeps working..."; sends tasks/get right after the task answer then every pollIntervalMs (250-30000, default 2000). Upstash blog (third-party, dated 2026-10-23): "MCP Tasks is a public beta in the Claude Code CLI from v2.1.304"; works in interactive terminal, Agent SDK, GitHub Actions; not in subagents, one-shot `claude -p`, VS Code extension, desktop app. Docs: "A one-shot `claude -p` run doesn't get MCP tasks."
  - Not verified: whether Claude Code also accepts the 2025-11-25 experimental task shape that SDK 1.32.2 emits. Docs only say "tasks extension". Elicitation text mentions 2026-07-28 and older revisions separately.
- VS Code Copilot / Copilot CLI: NOTHING FOUND. VS Code MCP docs page has no mention of tasks/timeouts/progress. Release notes 1.109 to 1.115 searched via snippets: no MCP tasks. Only a third-party note that Copilot IntelliJ enforces a max wait on tool-call HTTP requests (microsoft/copilot-intellij-feedback#1935), and github/copilot-cli#1620 (closed): a 1-hour timeout configured in mcp.json worked, progress lines repeated. Not checked in primary release notes line by line.

## 4. Time limits
- Claude Code (docs above): MCP_TOOL_TIMEOUT default "about 28 hours when unset"; per-server `timeout` in .mcp.json is a hard wall clock and "progress notifications from the server don't extend it". Idle timeout: a call with no response and no progress notification aborts after 5 min (http/sse/ws/connector) or 30 min (stdio); CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT changes it. So progress notifications DO reset the idle timer, not the wall clock. HTTP servers also have a per-request first-byte timer of max(60 s, tool timeout, MCP_TIMEOUT). Main-conversation calls over 2 min move to a background task automatically (CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS).
- Our 60 s failure (2026-11-06) is therefore not Claude Code's default; backlog says "a client" using the SDK 60 s default.
- VS Code Copilot: no documented limit found. Gap.
- Spec/SDK: progress does not reset timeouts by spec; SDK client resets only with resetTimeoutOnProgress: true.

## 5. Recommendation
Keep waitSeconds now, raise it. Claude Code's own limits are generous (28 h wall clock, 5 min idle with progress lines, auto-background after 2 min), so holding a call open with progress lines works there; the 45 s cap exists for SDK-default clients (60 s). Do not move to tasks yet: Claude Code supports only the 2026-07-28 extension (public beta, interactive CLI only, not the VS Code extension), our SDK 1.32.2 has the older 2025-11-25 experimental API, and nothing shows Copilot supports tasks. Next step: probe (a) whether Claude Code accepts SDK 1.32.2 tasks and (b) which client sent the 60 s timeout and what Copilot's limit is; then consider a longer waitSeconds (for example 100 s) only for clients that send a progress token and keep 45 s otherwise.
