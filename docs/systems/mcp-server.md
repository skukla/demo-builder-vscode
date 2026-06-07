# The Demo Builder MCP Server

This document explains how the Adobe Demo Builder extension lets an AI coding
agent (Claude Code) drive the extension's functionality — creating projects,
deploying meshes, publishing storefront content, applying updates, and more —
through a **Model Context Protocol (MCP) server** that runs *inside* the
extension.

It assumes you're a capable engineer but have never worked with MCP. Read the
first two sections for the mental model; the rest is reference.

---

## 1. What is MCP, in one minute?

**Model Context Protocol (MCP)** is an open standard for letting an AI agent call
*tools* — ordinary functions exposed by some external program — instead of only
generating text. It is, in effect, "USB for LLM tools": a uniform way to plug a
catalog of capabilities into any MCP-aware agent.

The pieces:

- **MCP client** — the agent's side. For us that's **Claude Code** (the CLI /
  the chat panel). The client asks "what tools do you have?" and later "please
  run tool `X` with these arguments."
- **MCP server** — the program that *publishes* tools. Each tool has a **name**,
  an **input schema** (declared with [Zod](https://zod.dev), which doubles as
  runtime validation), and a **handler** that does the work and returns a
  result.
- **Transport** — the pipe between them. The protocol is JSON-RPC 2.0; it can
  run over stdio (a child process's stdin/stdout), HTTP, or — as you'll see —
  any duplex byte stream.

A tool result is a list of "content" items. We only ever return **one text
item**, and that text is **JSON we stringify ourselves** (see
[§10 Conventions](#10-conventions-every-tool-follows)). The agent reads that JSON
and decides what to do next.

That's the whole model: *the agent discovers tools, calls them with validated
arguments, and reads back JSON.* Everything below is about how Demo Builder
implements the server side well.

---

## 2. Why Demo Builder runs an MCP server

Demo Builder is a VS Code extension with a rich wizard UI. But a lot of users now
want an **AI agent** to do the same things conversationally: "spin up a CitiSignal
demo," "redeploy the mesh," "publish my content," "update everything."

Every one of those actions already exists inside the extension as a tested
service or message handler. The MCP server exposes those *same* code paths as
agent-callable tools — so the agent and the UI button do **literally the same
work**, with no second implementation to drift out of sync.

The design north star, repeated throughout the codebase: **single source of
truth.** A tool is a thin headless adapter over an existing service; it does not
re-implement the logic.

---

## 3. The big picture

```
┌─────────────┐   stdio (JSON-RPC)   ┌──────────────────┐   Unix domain socket   ┌────────────────────────────┐
│ Claude Code │ ───────────────────▶ │  dist/mcp-proxy.js │ ─────────────────────▶ │  In-extension MCP server     │
│  (client)   │ ◀─────────────────── │  (tiny forwarder)  │ ◀───────────────────── │  (VS Code extension host)    │
└─────────────┘                      └──────────────────┘                          │   • reuses extension services│
                                                                                    │   • one McpServer per client │
                                                                                    └────────────────────────────┘
```

Three processes, one logical server:

1. **Claude Code** spawns a small Node process and talks MCP to it over stdio.
   That's all the client knows or cares about.
2. **`dist/mcp-proxy.js`** is a ~one-job forwarder: copy bytes between its stdio
   and a **Unix domain socket** (UDS) whose path is fixed per workspace. It
   exists only to bridge "client speaks stdio" with "the real server lives in an
   already-running process."
3. **The in-extension server** (`InExtensionMcpServer`,
   `src/features/ai/server/inExtensionMcpServer.ts`) listens on that socket from
   *inside the VS Code extension host*. Because it runs in the extension's own
   process, its tools can `import` and call the extension's services and handlers
   directly.

### Why not just have Claude Code spawn the server directly?

Because the valuable code — `StateManager`, the auth services, the EDS/mesh/
update services — lives in the **extension host** and depends on the `vscode`
API. A separate child process *cannot* `import 'vscode'`; it has no extension
host to talk to. So the server must live where that code already runs. The proxy
is the small adapter that lets a stdio-only client reach a server embedded in a
long-lived process.

### Why a per-workspace socket?

The socket path is derived deterministically from the open workspace folder
(`resolveMcpSocketPath` in `src/features/ai/server/mcpSocketPath.ts` — a SHA-256
of the absolute path, truncated to keep under the OS's ~104-char UDS limit).
This means:

- The config Claude Code reads is **stable across restarts** — no rewriting a
  port number on every activation.
- Each VS Code window/workspace gets its own socket, so two open projects don't
  collide.
- `mcpSocketPath.ts` is deliberately **`vscode`-free** because *both* ends (the
  extension server and the bundled proxy) import it and must agree on the path.

---

## 4. A note on the retired standalone server

Historically there was a **standalone** MCP server: `src/mcp-server.ts` compiled
to `dist/mcp-server.js`, run by Claude Code as its own `node` process over stdio.
It exposed seven read/sync "project tools" and could not import `vscode`, so it
operated purely on files under `~/.demo-builder/projects`.

That process has been **retired.** Its limitation was the whole reason: with no
`vscode` access it could never create projects, deploy meshes, authenticate, or
do anything that needed the live extension. The in-extension server replaced it
and now carries the full surface.

What survived the retirement, and why it matters when reading the code:

- **`src/mcp-server.ts` still exists**, but only as a **shared, `vscode`-free
  tool-registration module.** Its `registerProjectTools(server, projectsDir)`
  registers the original seven file-based tools, and the in-extension server
  calls it (see §6). The standalone *bootstrap* (the `StdioServerTransport`
  process entry) is gone.
- Only **`dist/mcp-proxy.js`** is built as a standalone artifact now (see
  `esbuild.config.js`). There is no `dist/mcp-server.js`.

---

## 5. The transport chain, concretely

When Claude Code starts a session in a Demo Builder project:

1. It reads the project's `.mcp.json` (see [§12](#12-client-discovery--configuration))
   and finds an entry named `demo-builder` whose `command` is `node` and whose
   `args` point at `dist/mcp-proxy.js`, with `env.DEMO_BUILDER_MCP_SOCKET` set to
   this project's socket path.
2. Claude Code spawns `node dist/mcp-proxy.js` and speaks MCP to it over stdio.
3. The proxy dials the Unix socket at `DEMO_BUILDER_MCP_SOCKET` (retrying with
   backoff if the extension hasn't started listening yet) and then just forwards
   bytes both directions.
4. The in-extension server `accept`s that connection and serves the full tool
   catalog over it.

If VS Code isn't running (no server listening), the proxy simply can't connect —
the agent sees the `demo-builder` server as unavailable, which is the correct
behavior (the tools genuinely need the live extension).

---

## 6. Server lifecycle inside the extension

Wiring lives in `src/extension.ts`:

- **On activation** (and whenever the workspace folder changes) the extension
  calls `startInExtensionMcpServer(context)`. That disposes any previous server,
  resolves the current workspace's socket path, and constructs an
  `InExtensionMcpServer`.
- The server's `start()` creates the socket directory `0700`, removes any stale
  socket, opens a `net.Server` on the socket path, then `chmod`s the socket to
  `0600`. **Those file permissions are the access control** — only the OS user
  who owns the socket can connect (see [§11 Security](#11-security-model)).
- **Per connection**, the server creates a *fresh* `McpServer` instance from the
  MCP SDK, wraps it in a logging shim (`withToolLogging`, see §11), registers all
  tools onto it, and connects it to the socket via the SDK's
  `StdioServerTransport` — which, despite the name, accepts any duplex stream, so
  we hand it the socket.
- **On deactivation / workspace change**, `dispose()` closes the server and
  removes the socket file.

Tool registration on each connection happens in two layers:

1. `registerProjectTools(server, projectsDir)` — the seven shared file-based
   tools from `src/mcp-server.ts`.
2. A `registerExtraTools` callback (injected by `extension.ts` so the server
   module stays free of `vscode`/handler imports) that calls every other
   `register…` function: descriptor tools, discovery, auth, Adobe, create/open/
   delete project, cloud resources, storefront, EDS reset, apply updates, view
   tools.

---

## 7. How a single tool call flows end-to-end

Take `delete_mesh` as a representative action tool:

1. Claude Code → proxy → socket → the per-connection `McpServer` receives a
   `tools/call` for `delete_mesh` with `{ confirm: true }`.
2. The SDK validates the arguments against the tool's Zod `inputSchema`.
3. `withToolLogging` logs `[MCP] tool: delete_mesh` to the "Demo Builder: Logs"
   channel and the **argument keys** (never values) to "Demo Builder: Debug",
   then calls the handler.
4. The handler builds a **headless `HandlerContext`** via the injected
   `ctxFactory` (see §8) and dispatches to the *same* mesh-deletion service/
   handler the dashboard uses.
5. The handler returns `asText({ … })` — a single text item whose text is
   stringified JSON describing the outcome.
6. `withToolLogging` logs success + elapsed ms (or the error), and the result
   travels back out the socket → proxy → Claude Code, which reads the JSON.

No webview, no modal, no button — but the work is identical to the UI path.

---

## 8. The headless `HandlerContext`

Most of the extension's logic is written as **message handlers** that expect a
`HandlerContext` — a bundle containing the `StateManager`, the auth manager, a
logger, the `vscode.ExtensionContext`, and a `sendMessage` function for talking
back to a webview.

MCP tools have no webview. So `createHeadlessHandlerContext`
(`src/features/ai/server/headlessHandlerContext.ts`) builds a context where
`panel`/`communicationManager` are `undefined` and `sendMessage` is a no-op, but
the real `StateManager`, auth manager, logger, and extension context are present.
This lets a tool reuse a handler **as long as that handler never touches the
webview and never pops a modal dialog** (`vscode.window.show*Message`). Handlers
that *do* are not exposed this way; they get a purpose-built headless service
extracted from the UI code instead (e.g. `republishStorefrontContent`,
`deleteProjectFiles`, `applyBlockLibraryUpdateResolved`).

`extension.ts` passes a `ctxFactory: () => createHeadlessHandlerContext(...)` into
each tool group, so every tool call gets a fresh context.

---

## 9. Tool catalog

Tools are grouped by the file that registers them. Names are what the agent sees.

### File-based project tools — `src/mcp-server.ts` (`registerProjectTools`)
These are `vscode`-free and operate on files under `~/.demo-builder/projects`.

| Tool | Purpose |
|---|---|
| `list_projects` | List all projects (paginated). |
| `get_project` | Read a project's manifest (summary or full). |
| `get_component_config` | Read a component's `.demo-builder.json` / `.env`. |
| `update_project_config` | Write `.demo-builder.json` / `.env` (env content validated). |
| `sync_storefront` | Git add/commit/push the storefront. |
| `list_blocks` | List EDS blocks in the storefront. |
| `get_block_source` | Read a block's files (manifest or one file, size-capped). |

### Discovery & catalog — `discoveryTools.ts`
`list_components`, `list_demo_packages`, `list_stacks` — read-only catalog lookups
used while assembling a `create_project` call.

### Authentication & Adobe — `authTools.ts`, `adobeTools.ts`
`get_auth_status`, `sign_in`, `list_orgs`, `select_org`, `list_adobe_projects`,
`select_project`, `list_workspaces`, `select_workspace`. These back the
[auth handoff](#auth-handoff) other tools rely on.

### Descriptor-driven tools — `readDescriptors.ts` / `actionDescriptors.ts` (via `toolDescriptors.ts`)
Thin tools declared as data and dispatched to existing handler maps:
- Reads: `verify_ai_setup`, `list_ai_prompts`, `check_mesh`.
- Actions: `regenerate_ai_files`, `start_demo`, `stop_demo`, `save_ai_prompt`,
  `delete_ai_prompt`, `delete_mesh`.

### Project lifecycle
| Tool | File | Notes |
|---|---|---|
| `create_project` | `createProjectTool.ts` | Full wizard pipeline, headless. |
| `get_current_project` | `currentProjectTool.ts` | Resolve the active project (persisted current-project pointer); returns `{ name, path }` or `null`. |
| `delete_project` | `deleteProjectTool.ts` | **Irreversible** — needs `confirm:true` + `confirmName` echo. Local only. |
| `reset_eds_project` | `edsResetTool.ts` | Reset storefront to template; captured progress timeline. |
| `apply_updates` | `applyUpdatesTool.ts` | Check (no confirm) / apply (`confirm:true`) across all update categories. |

### Cloud resources & storefront content
| Tool | File | Notes |
|---|---|---|
| `delete_github_repo` | `cloudResourceTools.ts` | Destructive; confirm-gated. |
| `cleanup_dalive_site` | `cloudResourceTools.ts` | Destructive; confirm-gated. |
| `republish` | `storefrontTools.ts` | Regenerate + push storefront config. |
| `sync_content` | `storefrontTools.ts` | Full content publish (config + code + DA.live pages). |

### View — `viewTools.ts`
`open_view` — surface a specific VS Code view/screen for the user.

---

## 10. Conventions every tool follows

These conventions are what make the surface predictable for an agent. New tools
**must** follow them.

**Results are JSON-as-text.** Every tool returns
`{ content: [{ type: 'text', text: JSON.stringify(value) }] }` via a local
`asText(...)` helper. The agent parses that text. Keep the JSON small and
purposeful — it's consumed as LLM context tokens.

**Confirmation gating for mutations.** Anything that changes cloud or local
state requires an explicit `confirm: true`. Without it, the tool returns a
description of what *would* happen so the agent can relay it to the user — it
does not act. `apply_updates` reuses this elegantly: no `confirm` = a read-only
"here's what's available" report.

**Extra-strict gating for irreversible ops.** `delete_project` additionally
requires `confirmName` to exactly echo the project name, so an agent can't delete
the wrong project on a fuzzy match.

<a name="auth-handoff"></a>**Auth handoff instead of silent failure.** Tools that
need credentials pre-flight the relevant provider and, if not signed in, return a
structured handoff rather than erroring:
`{ needsAuth: 'github' | 'dalive' | 'adobe', message: '…check get_auth_status, then sign_in(...)' }`.
The agent then drives `get_auth_status` / `sign_in` and retries. This keeps the
human-in-the-loop browser sign-in flows working through an agent.

**Progress as a captured timeline.** There's no progress bar on the agent
surface, so long multi-step tools (`reset_eds_project`, `apply_updates`) collect
their per-step messages into a `phases` array and return it, so the agent can
narrate what happened.

**Single source of truth.** A tool is an adapter. It calls the same service the
UI calls. When the UI logic was entangled with modals/progress, the headless core
was *extracted* and both call it — never copied.

**Re-runnable failures.** Idempotent operations (e.g. `reset_eds_project`) report
`rerunSafe: true` on failure so the agent knows it can fix the cause and call
again.

---

## 11. Security model

The agent surface is powerful, so it's deliberately constrained:

- **Socket file permissions are the access control.** The socket directory is
  `0700` and the socket is `0600` — only the local OS user can connect. There is
  no network listener and no token.
- **Argument values are never logged.** `withToolLogging` logs the tool name and
  the *keys* of the argument object only. Some args carry secrets (e.g.
  `update_project_config.content` is `.env` contents).
- **Path-traversal guards.** File-based tools resolve project names through
  `resolveProjectPath` + `assertInsideProject` (realpath-canonicalized) so a
  crafted name can't escape the projects directory.
- **`.env` content is allowlist-validated** (`validateEnvContent`) before being
  written — defense-in-depth against injecting executable content.
- **Bounded responses.** `get_block_source` caps at 50 files / 30 KB each, since
  the output is paid for as context tokens.
- **No secret leakage to child processes.** Where the extension spawns other MCP
  servers to introspect them, it uses an env allowlist.

---

## 12. Client discovery & configuration

`src/features/project-creation/services/mcpConfigWriter.ts` writes the client
config when a project is created (and on "Regenerate AI files"):

- **`.mcp.json`** (project root) and **`.claude/mcp.json`** — the `demo-builder`
  entry:
  ```jsonc
  {
    "mcpServers": {
      "demo-builder": {
        "command": "/abs/path/to/node",
        "args": ["/abs/path/to/extension/dist/mcp-proxy.js"],
        "env": { "DEMO_BUILDER_MCP_SOCKET": "/tmp/demo-builder-mcp/<hash>.sock" }
      }
    }
  }
  ```
  The `node` path is resolved robustly (`which node` → `realpath`, handling
  fnm/nvm shims) because VS Code's `process.execPath` is the Electron binary, not
  a usable Node. Adobe-hosted MCPs (Commerce, DA.live) are appended for storefront
  projects, anchored to the storefront's `node_modules`.
- **`.claude/settings.json`** — a `PostToolUse` git-sync hook for EDS projects
  (commit/push storefront edits the agent makes). Skipped if the path contains
  shell metacharacters.
- All three are added to the project's **`.gitignore`** — they contain
  machine-specific absolute paths and must not be committed.

Cursor and Codex read `.mcp.json` natively, so no per-tool config files are
written.

---

## 13. Adding a new tool

1. Pick the right file in `src/features/ai/server/` (or add one). Simple
   handler-backed actions fit the descriptor pattern (`actionDescriptors.ts`);
   anything bespoke gets its own `registerXxxTool(server, ctxFactory)`.
2. Declare the `inputSchema` with Zod. Add `confirm` (and `confirmName` for
   irreversible ops) where it mutates state.
3. In the handler: build the headless context from `ctxFactory()`, pre-flight any
   auth (return a `needsAuth` handoff if missing), then call the **existing
   service** — extract a headless core from the UI path if the logic is currently
   modal-coupled. Return `asText({...})`.
4. Register it from the `registerExtraTools` callback in `src/extension.ts`.
5. Add a test using the `fakeServer` pattern (§14).
6. If agents should know about it, mention it in the generated `AGENTS.md`
   (`aiContextWriter.ts`).

---

## 14. Testing

Tools are tested without a real socket or SDK by using a tiny **`fakeServer`**:
an object with a `registerTool(name, schema, handler)` that just stores handlers
in a map, plus a `call(args)` that invokes the handler and JSON-parses the text
result. The underlying service is mocked; the test asserts the tool's gating
(confirm, auth handoff), argument shaping, and result. See
`tests/features/ai/server/*.test.ts` (e.g. `applyUpdatesTool.test.ts`,
`deleteProjectTool.test.ts`). The shared seven tools have their own suites under
`tests/features/ai/mcpServer-*.test.ts`, and the socket server has
`tests/features/ai/server/inExtensionMcpServer.test.ts`.

---

## 15. File map

| File | Role |
|---|---|
| `src/features/ai/server/inExtensionMcpServer.ts` | The UDS server; per-connection `McpServer`; logging shim. |
| `src/features/ai/server/mcpSocketPath.ts` | Deterministic per-workspace socket path (`vscode`-free). |
| `src/mcp-proxy.ts` → `dist/mcp-proxy.js` | stdio↔UDS forwarder Claude Code spawns. |
| `src/mcp-server.ts` | Shared `registerProjectTools` + file-tool helpers (`vscode`-free). Standalone bootstrap retired. |
| `src/features/ai/server/headlessHandlerContext.ts` | Builds a webview-less `HandlerContext`. |
| `src/features/ai/server/*Tools.ts`, `*Tool.ts`, `*Descriptors.ts` | The tool implementations and descriptor tables. |
| `src/features/project-creation/services/mcpConfigWriter.ts` | Writes `.mcp.json` / `.claude/mcp.json` / `.claude/settings.json`. |
| `src/extension.ts` (`startInExtensionMcpServer`) | Lifecycle + injects `registerExtraTools` + `ctxFactory`. |

---

## 16. See also

- `docs/architecture/adr/004-claude-code-harness.md` — the decision to use Claude
  Code (CLI) as the AI harness.
- `docs/architecture/overview.md` — where the MCP server sits in the whole system.
- `src/features/ai/README.md` — the `ai` feature (verification, inventory, server).
