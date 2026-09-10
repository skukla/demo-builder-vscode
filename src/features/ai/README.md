# AI

Two jobs: verifying a project's generated AI files, and running the in-extension MCP
server that gives an agent the same capabilities the UI has.

## The server reuses the extension's services

`server/inExtensionMcpServer.ts` listens on a per-workspace Unix socket, and its
tools call the **same handlers the webviews call**. An agent deploying a mesh runs
the code the button runs.

Clients reach it through `dist/mcp-proxy.js`, a stdio-to-socket forwarder named in
each project's `.mcp.json`. The former standalone server process is retired.

## Response size is the cost, not the tool count

Every tool call spends the agent's context window, and the payload dominates. So:

- **Compact JSON** — `JSON.stringify(x)` with no indentation. Pretty-printing is pure
  waste for machine-consumed output.
- **Summaries by default** — `get_project` collapses `aiPrompts` to a count and
  replaces a block library's `blockIds` with a count, keeping `path` on component
  instances while dropping metadata blobs. `full=true` returns the untouched manifest.
- **Pagination** — `list_projects` and `list_blocks` take `offset`/`limit`.

When adding a tool: prefer list-then-fetch over a bulk dump, and cap anything that
can return a file.

## Not everything answers JSON

Refusals answer prose, including the shared
`"<tool> requires confirm:true to proceed."`. Never write guidance telling an agent
every response parses.

## Adding a tool

Read [`mcp-tool-authoring`](../../../.claude/skills/mcp-tool-authoring/SKILL.md)
first. The two traps it exists for: a handler that needs a panel does not qualify
(tools run headless), and a read tool must not call anything that creates on miss.

Verify against the running server with
[`mcp-live-probe`](../../../.claude/skills/mcp-live-probe/SKILL.md) — green tests
prove a tool matches its fixtures, not that it matches reality. Extension-host changes
need F5; Cmd+R reloads only the webview.

## Related

- [mcp-server.md](../../../docs/systems/mcp-server.md) — the full tool reference
- [`ai-context-authoring`](../../../.claude/skills/ai-context-authoring/SKILL.md) —
  changing what gets generated into a project

## Conventions that bind this

The rules are in [the handbook](../../../docs/development/handbook.md). A tool response is built with `asText`/`asRawText` and never by hand — enforced by `tests/sop/` in both halves of the server. Destructive tools require `confirm`.
