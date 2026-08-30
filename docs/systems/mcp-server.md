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
item**. That text is usually JSON we stringify ourselves — but not always:
refusals and errors are plain sentences the agent reads rather than parses (see
[§10 Conventions](#10-conventions-every-tool-follows)).

That's the whole model: *the agent discovers tools, calls them with validated
arguments, and reads back one text answer.* Everything below is about how Demo
Builder implements the server side well.

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
   and a **Unix domain socket** (UDS) whose path is fixed (derived from the
   projects root). It
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

### Why a deterministic socket path?

The socket path is derived deterministically from the **projects root** — not
the workspace folder (`resolveMcpSocketPath` in
`src/core/utils/mcpSocketPath.ts` — a SHA-256 of the absolute path,
truncated to keep under the OS's ~104-char UDS limit). This means:

- The config Claude Code reads is **stable across restarts** — no rewriting a
  port number on every activation.
- Every window computes the **same** root socket; the first window to bind
  serves it (first-window-wins, see `bindSocket`), and `serverInfo.version`
  names which build answered. The dual-listen shim that additionally bound a
  distinct workspace-folder socket was removed 2026-08-23 — nothing targets a
  workspace socket in the always-root model.
- `mcpSocketPath.ts` is deliberately **`vscode`-free** because *both* ends (the
  extension server and the bundled proxy) import it and must agree on the path.

The **directory** holding those sockets comes from `mcpSocketDir()`:
`$TMPDIR/demo-builder-mcp`, overridable with `DEMO_BUILDER_MCP_SOCKET_DIR`
(mirroring `DEMO_BUILDER_PROJECTS_DIR`). Server and proxy both read that one
function, so they cannot disagree.

That override is not a convenience — it is load-bearing for the test suite.
`tests/extension-context.test.ts` and `tests/extension-activation-navigation.test.ts`
call the **real** `activate()`, which starts the in-extension MCP server. Its
socket path derives from the projects dir, and the *default* projects dir hashes
to the **exact** socket a running Extension Dev Host binds — verified 2026-08-10
by computing both (`135b859e0a31db31.sock`). So a plain `npx jest` renamed its own
socket over the live window's and killed the developer's MCP session mid-run, with
the listener still alive on a path no client could resolve. `tests/setup/node.ts`
now points every worker at an isolated tree; `globalTeardown.ts` removes it.

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
  registers the file-based tools (ten today), and the in-extension server
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

When the entry carries **no** `DEMO_BUILDER_MCP_SOCKET` — the global
`~/.claude.json` entry written by the **Demo Builder: Register Global MCP**
command — the proxy resolves its own target
(`src/features/ai/server/mcpSocketDiscovery.ts`): the cwd-derived socket if its
file exists, else a newest-mtime-first liveness sweep of the socket directory
that connects to a running extension window (several open windows tiebreak to
the most recently started one). This is what makes genuinely global ops
(`create_project`, `list_projects`) reachable from an arbitrary cwd.

If VS Code isn't running (no server listening), a socket-pinned proxy simply
can't connect — the agent sees the `demo-builder` server as unavailable, which
is the correct behavior (the tools genuinely need the live extension). In
discovery mode the proxy instead fails fast with guidance ("open Demo Builder in
VS Code first") rather than spending the retry window.

---

## 6. Server lifecycle inside the extension

Wiring lives in `src/extension.ts`:

- **On activation** (and whenever the workspace folder changes) the extension
  calls `startInExtensionMcpServer(context)`. That disposes any previous server,
  resolves the current workspace's socket path, and constructs an
  `InExtensionMcpServer`.
- The server's `start()` creates the socket directory `0700`, then binds each
  socket under a **private** name (`<socket>.<pid>`), `chmod`s it to `0600`, and
  `rename`s it over the shared path. **Those file permissions are the access
  control** — only the OS user who owns the socket can connect (see
  [§11 Security](#11-security-model)). Two details are load-bearing: `chmod`
  precedes the rename so the shared name is never briefly world-readable, and
  libuv unlinks the pathname it bound, so the shared name must be one libuv never
  learns — otherwise `server.close()` deletes whichever successor holds it.
- **Per connection**, the server creates a *fresh* `McpServer` instance from the
  MCP SDK, wraps it in a logging shim (`withToolLogging`, see §11), registers all
  tools onto it, and connects it to the socket via the SDK's
  `StdioServerTransport` — which, despite the name, accepts any duplex stream, so
  we hand it the socket.
- **On deactivation / workspace change**, `dispose()` closes the server and
  **leaves the socket file in place**. Nothing unlinks the shared name: POSIX has
  no atomic unlink-if-inode, so "delete it only if it is still mine" verifies an
  inode and then deletes a *name*, and a successor's rename landing between the
  two gets deleted instead. The leftover file is harmless — the next bind renames
  over it, and every consumer probes liveness rather than trusting existence.
  `resolveProxyTarget` is split into liveness-first then existence-as-fallback for
  exactly this reason (see §3), so a leftover no longer short-circuits the proxy's
  fast "no window running" failure.

Tool registration on each connection happens in two layers:

1. `registerProjectTools(server, projectsDir)` — the ten shared file-based
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
3. `withToolLogging` logs `[MCP] tool: delete_mesh` to the "Demo Builder: User Logs"
   channel and the **argument keys** (never values) to "Demo Builder: Debug Logs",
   then calls the handler.
4. The handler builds a **headless `HandlerContext`** via the injected
   `ctxFactory` (see §8) and dispatches to the *same* mesh-deletion service/
   handler the dashboard uses.
5. The handler returns an ordinary `HandlerResponse`; `delete_mesh` is a
   descriptor row, so `registerDescriptorTools` shapes it and wraps the result
   (`asRawText(shape(res, args))` — `shape` returns a string already). On the
   failure branch that text is `Error: …` prose, not JSON.
6. `withToolLogging` logs success + elapsed ms (or the error), and the result
   travels back out the socket → proxy → Claude Code.

No webview, no modal, no button — but the work is identical to the UI path.

---

## 7b. Connection scoping — the session's directory decides the project

Two agent entries are supported: the home chat (session at the projects root;
the dashboard's current-project pointer decides which project "this project"
means) and a session started inside a project directory (each project's
generated `.mcp.json`/AGENTS.md exist for exactly this). Since 2026-08-28 the
second entry is **connection-scoped**: the proxy writes a one-line
`#cwd:<path>` preamble as the first bytes of every connection (MCP framing is
newline-delimited JSON-RPC, so every legitimate first byte is `{` and the
preamble is unambiguous; bare clients — the probe, old proxies — skip it and
are handed to the transport untouched). The server (`connectionScope.ts`)
resolves the cwd to the containing project and, for that connection only:

- current-project reads load THAT project fresh from disk per call;
- saves route through `saveProjectConfigOnly` — a scoped session can NEVER
  flip the dashboard's pointer (`scopedStateManager.ts`);
- `get_current_project` answers `scope: "session-directory"` (vs
  `"dashboard-pointer"`), so an agent can always tell why it got the project
  it got.

Decided by the owner after the battery's first tier-2 run measured an agent
inspecting one project while its tools acted on another. The home chat and
every unscoped client keep pointer semantics unchanged.

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

**[mcp-tools.md](mcp-tools.md)** — generated from the code that registers the tools,
by `npm run docs:tools`.

It used to be written here by hand. Measured 2026-08-30: 114 tools existed, 12 were
undocumented, and 6 documented tools had been deleted — `cleanup_dalive_sites`,
`evaluate_prompt`, `manage_github_repos`, `migrate_storefront_names` and
`github_change_account` among them.

That is worse than it sounds, because an agent reads the catalog to decide what it
can do: a phantom entry sends it hunting for a capability that does not exist, and a
missing one hides one it has.

## 10. Conventions every tool follows

These conventions are what make the surface predictable for an agent. New tools
**must** follow them.

**One envelope, two builders.** Every tool returns
`{ content: [{ type: 'text', text }] }`, built by `src/features/ai/server/mcpToolResult.ts`
and nothing else:

- `asText(value)` — serializes the value. The default; use it for any answer.
- `asRawText(text)` — wraps a string verbatim. For a refusal or error written as
  prose, and for the descriptor registrar's `shape()` output (already stringified).

So an agent **cannot** assume every response parses as JSON — refusals are prose,
including the shared `"<tool> requires confirm:true to proceed."`. It can assume
the envelope. Keep the JSON small and purposeful — it's consumed as LLM context
tokens.

`tests/features/ai/server/responseEnvelope.test.ts` enforces both halves of the
surface: descriptor rows at runtime (through the real registrar, including the
confirm-refusal and preflight early returns), bespoke tools at the source level
(a registrar module must import a builder and must not hand-roll the envelope).
The source scan covers `src/features/ai/server/` **and** `src/mcp-server.ts` —
the second is listed by name, because the first version of the guard scanned the
directory alone and the ten file-based project tools escaped it.

**Confirmation gating for destructive ops.** A tool requires an explicit
`confirm: true` when its effect is hard to walk back: it deletes something, or it
pushes/publishes to a live site. Without it the tool refuses and does nothing.
Currently gated: `remove_integration`, `delete_ai_prompt`, `delete_mesh`,
`delete_project`, `remove_block_from_library`, `promote_block_to_library`,
`refresh_block_library`, `set_console_apis`.

`set_console_apis` is the one whose NAME hides what it does — it says "set" and it
removes, so the `delete_*` reading of this list would miss it. Judge against the rule,
not the verb.

Merely *mutating* is deliberately not the bar. Deploys (`deploy_mesh`,
`add_integration`, `deploy_integration`, `redeploy_integration`,
`install_integration`), lifecycle (`start_demo`,
`stop_demo`) and config writes (`update_project_config`, `rename_project`) change
state and are ungated, because they are idempotent or trivially reversible and
gating them would make the agent surface useless for the routine work it exists
to do.

This paragraph used to claim that *anything* changing state was gated. It never
was — and the overclaim hid a real gap: `promote_block_to_library` pushed a commit
and published to a live site ungated while its exact inverse
`remove_block_from_library` was gated. If you add a tool, decide against the rule
above, not against this list.

Both block-library gaps were closed together on 2026-08-16, and they are the
worked example of the rule: `promote_block_to_library` was ungated because it
only *adds* things, and `refresh_block_library` because "rebuild" sounds local.
Both push to a live site. Reach, not intent, is what decides.

Note the shape of the refusal differs by tool. Most return an error and do
nothing. `apply_updates` is the one that reports what *would* happen: no
`confirm` = a read-only "here's what's available". Don't assume the dry-run
behavior generalizes.

**Extra-strict gating for irreversible ops.** Three tools require a `confirmName`
that exactly echoes the resource, so an agent can't destroy the wrong one on a
fuzzy match: `delete_project` (project name), `delete_github_repo` (`owner/repo`),
and `cleanup_dalive_site` (`org/site`).

`delete_page` deliberately uses the plain `confirm: true` gate instead — it removes
one page from the current project's own storefront, not a whole repository or site.
That proportionality holds only because the page path is confined to the current
site; see the traversal note in the content-authoring section.

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
- **Bounded responses.** `read_page` caps its reads at 30 KB, since
  the output is paid for as context tokens. `get_block_authoring_shape` splits
  index from detail for the same reason: the index carries ids, titles and which
  authoring convention each block uses, but never the markup, selectors or field
  lists. Measured on a real 78-block storefront: whole index 5,577 bytes, one
  block's detail 92–432 bytes. It exists because deriving those shapes from block
  JS instead measured ~121,000 tokens for eight blocks.

  Three authoring conventions coexist in `plugins.da` and the tool reports which
  one applies: positional (`rows`/`columns`, 36 of 78), key-value
  (`name`/`type`/`fields`, 35), and literal `unsafeHTML` (4 — what
  `promote_block_to_library` writes, and the rarest form in a real storefront).
  `component-filters.json` supplies nested children, without which `cards` reads
  as two flat columns rather than a list of `card`s; `component-models.json`
  supplies field labels. Both are best-effort — 38 of 78 components resolve no
  model fields (27 name a model id with no entry, 11 name none at all).
- **No secret leakage to child processes.** Where the extension spawns other MCP
  servers to introspect them, it uses an env allowlist.

### The three-leg agent-operation surface (consent · visibility · sign-in)

One design, three legs (`.rptc/complete/2026-08-23-mcp-destructive-ops-native-consent.md`),
all wired at tool-registration level in `inExtensionMcpServer.ts` and implemented
extension-side in `agentOperationNotifier.ts`:

- **Destructive calls need consent** (2026-08-24). Any call carrying
  `confirm: true` — the surface's own destructive marker, checked by the
  descriptor registrar and every direct destructive tool — first raises a
  MODAL VS Code dialog in the window that owns the socket
  (`createAgentConsentGate`, injected as `consentGate`). This converts the
  agent-supplied honor-system parameter into consent that survives a
  harness-side tool allowlist. A decline answers a prose refusal (the
  operation never ran); the handler and the progress notification are never
  reached. `demoBuilder.ai.requireAgentConsent` (default on, read live per
  call) is the headless escape hatch. The dialog shows scalar argument
  values — informed consent needs them — with secret-shaped keys masked and
  long values elided; the keys-only rule remains for logging. An UNANSWERED
  dialog times out (`TIMEOUTS.LONG`) into a "nobody answered" refusal rather
  than blocking the agent forever — before 2026-08-27 a headless call whose
  dialog nobody saw hung indefinitely with no log line (AI-5), and the wait
  now also announces itself in Debug Logs before the dialog opens.
- **Mutating calls are visible** (2026-08-23). Every tool whose name is not
  declared `readOnlyHint: false` (see the dry-run section below — this was an
  allowlist over tool NAMES until 2026-08-25) runs inside
  a `withProgress` notification (`createAgentOperationNotifier`, injected as
  `longRunningNotifier`), and the OUTCOME lands in the window — status bar on
  success, warning toast on failure — because the agent's own report may
  never reach the user (disconnected client, closed chat).
- **Sign-in needs a human, once, at the start.** DA.live has no headless
  grant; `sign_in(provider:"dalive")` opens the native prompts, raises a
  status-bar attention line, and returns IMMEDIATELY with instructions to
  poll `get_auth_status` — an agent client must never sit blocked on a human
  (observed live 2026-08-23 as a silent 60s timeout). Generated AGENTS.md
  (v20) tells agents to front-load `get_auth_status` so the one human touch
  happens at flow start, not as a mid-pipeline stall.

### `get_current_project` answers with the project's STATE

It returned a name and a path in ~22 tokens until 2026-08-26. `agent-gap-scan`
measured **83% of its calls followed immediately by another of our reads** — it
told an agent WHERE it was and nothing it could act on, so the next step always
paid a second round trip. That is a shape problem, and no count of how often a
tool is called can see it.

`get_project_status` already returned a strict superset of those two fields for
24 more tokens, so two tools answered the same question two ways and the thinner
one was reached for 2.4x more often. They now share one payload
(`resolveProjectStatus`).

**Both names stay.** "Which project am I in" and "did `start_demo` take effect"
are different questions; an agent should not route the second through a tool
called *current project*. What they must not keep is two different answers.

The **null envelope** is why this is not an alias: `get_project_status` answers a
prose error when there is no current project, while `get_current_project`
answers `null` — a fact an agent can branch on rather than a failure it might
retry. And the shared resolver never throws: a `ServiceLocator` that is not
initialized degrades the mesh to `needs-auth`, because the moment orientation
matters most is exactly when activation may not have finished.

### The dry run — REMOVED 2026-08-26

`demoBuilder.ai.dryRun` made agent mutation impossible rather than discouraged:
while on, every tool that was not read-shaped stopped in `withToolLogging`
before its handler and answered what it WOULD have done. It left with the
prompt-evaluation surface (AI-3b) and is on `feature/prompt-workbench`.

It was removed for being unused, not for being wrong. It defaulted OFF, so it
protected nobody unless switched on, and its status bar item showed
unconditionally — every user carried a permanent "Dry run off" indicator for a
mode nobody had turned on.

Two of its properties are worth keeping in mind if it returns, because both were
learned the hard way: it answered **data, not an error** (an error teaches an
agent to retry; data teaches it what would have happened), and it classified by
each tool's own **declaration** rather than its name — `check_github_app` is
read-shaped and fires a Helix code sync.

**Consent is a different thing and stays.** `demoBuilder.ai.requireAgentConsent`
defaults ON and asks before each destructive operation. It never depended on the
dry run.

### `evaluate_prompt` — REMOVED 2026-08-26

The tool spawned a headless `claude -p` run with the dry run forced and answered
a summary of what a prompt would cost. It left with the prompt-evaluation
surface (AI-3b); the code is on `feature/prompt-workbench`.

The agent dry run it forced went to the same branch — see the dry-run section
above. The **consent dialog** stays and is unrelated to both.

---

## 12. Client discovery & configuration

`src/features/project-creation/services/aiBundle/mcpConfigWriter.ts` writes the client
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
  a usable Node. The ai-defaults MCPs are appended per each entry's `requires`
  gate (aiToolingGate.ts): the Commerce Extensibility Developer Agent for any
  App Builder-adjacent project (EDS storefront, mesh, or attached App Builder
  component); Playwright and the Adobe dropins MCP (`@dropins/mcp` — drop-in
  component discovery/scaffolding/health tooling whose project-touching tools
  take an explicit `projectDir`) for EDS storefronts only. Anchored to the per-project
  isolated MCP tools dir
  (`<project>/.demo-builder-mcp/node_modules/`) — decoupled from the storefront's
  own `node_modules` so they install even when the storefront's `npm install` can't.
- **`.claude/settings.json`** — a `PostToolUse` git-sync hook for EDS projects
  (commit/push storefront edits the agent makes). Skipped if the path contains
  shell metacharacters. The extractor reads the tool-call JSON on **stdin** and
  takes `tool_input.file_path`; it once read a `$CLAUDE_TOOL_INPUT` env var Claude
  Code never sets, so the hook silently did nothing from beta.109 until the
  AI_CONTEXT_VERSION 6 fix. It commits and pushes only — publishing is
  `sync_content` / `sync_storefront`.
- **`.claude/settings.json`** also carries a `PreToolUse` **aio-global guard**
  (AI_CONTEXT_VERSION 21) for every project that gets the App Builder tooling
  (`projectNeedsAppBuilderTooling`) and unconditionally for the home Chat. It
  blocks the commerce-extensibility MCP's `aio-configure-global`, `aio-app-use`
  and `aio-where` — the three tools that write/read the `aio` CLI's
  process-global org selection, which the extension deliberately stopped using
  in favour of per-operation `withOrgContext` (`orgContextEnv.ts`). An unwrapped
  path once deployed a mesh into a DELETED project for two days. The command is
  static (`echo … >&2; exit 2` — no interpolated paths, nothing that can
  silently no-op) and its refusal names the Demo Builder tools that do the job.
  Both hook lists merge independently, so a user's own `PreToolUse` and
  `PostToolUse` entries survive a regenerate.
- All three are added to the project's **`.gitignore`** — they contain
  machine-specific absolute paths and must not be committed.

Additionally, the **Demo Builder: Register Global MCP** palette command
(`src/features/project-creation/services/aiBundle/globalMcpRegistration.ts`) upserts a
`demo-builder` entry into the user-scope `~/.claude.json` — same command/args
but **no** socket env, so the proxy discovers a running window at launch (see
§5). Explicit opt-in only; it merge-preserves everything else in the file and
refuses to overwrite a malformed one.

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
   modal-coupled. Return `asText({...})` — or `asRawText(prose)` for a refusal
   (§10). Never build the envelope by hand; a test fails the build if you do.
4. Register it from the `registerExtraTools` callback in `src/extension.ts`.
5. Add a test using the `fakeServer` pattern (§14).
6. If agents should know about it, mention it in the generated `AGENTS.md`
   (section text in `agentsMdSections.ts`; `aiContextWriter.ts` orchestrates).

---

## 14. Testing

Tools are tested without a real socket or SDK by using a tiny **`fakeServer`**:
an object with a `registerTool(name, schema, handler)` that just stores handlers
in a map, plus a `call(args)` that invokes the handler and JSON-parses the text
result. The underlying service is mocked; the test asserts the tool's gating
(confirm, auth handoff), argument shaping, and result. See
`tests/features/ai/server/*.test.ts` (e.g. `applyUpdatesTool.test.ts`,
`deleteProjectTool.test.ts`). The shared file-based tools have their own suites under
`tests/features/ai/mcpServer-*.test.ts`, and the socket server has
`tests/features/ai/server/inExtensionMcpServer.test.ts`.

---

## 15. File map

| File | Role |
|---|---|
| `src/features/ai/server/inExtensionMcpServer.ts` | The UDS server; per-connection `McpServer`; logging shim. |
| `src/core/utils/mcpSocketPath.ts` | Deterministic socket path from the projects root (`vscode`-free). |
| `src/mcp-proxy.ts` → `dist/mcp-proxy.js` | stdio↔UDS forwarder Claude Code spawns. |
| `src/mcp-server.ts` | Shared `registerProjectTools` (`vscode`-free registration facade). Standalone bootstrap retired. |
| `src/mcp/` | The file-tool implementations behind it: security guards, project/sync/block handlers, publish tails (`vscode`-free). |
| `src/features/ai/server/headlessHandlerContext.ts` | Builds a webview-less `HandlerContext`. |
| `src/features/ai/server/*Tools.ts`, `*Tool.ts`, `*Descriptors.ts` | The tool implementations and descriptor tables. |
| `src/features/project-creation/services/aiBundle/mcpConfigWriter.ts` | Writes `.mcp.json` / `.claude/mcp.json` / `.claude/settings.json`. |
| `src/extension.ts` (`startInExtensionMcpServer`) | Lifecycle + injects `registerExtraTools` + `ctxFactory`. |

---

## 16. See also

- `docs/architecture/adr/004-claude-code-harness.md` — the decision to use Claude
  Code (CLI) as the AI harness.
- `docs/architecture/overview.md` — where the MCP server sits in the whole system.
- `src/features/ai/README.md` — the `ai` feature (verification, inventory, server).
