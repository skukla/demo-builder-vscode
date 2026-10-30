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
   delete project, create from an exported file, cloud resources, storefront,
   project reset, apply updates, view tools.

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
- saves never move the dashboard's pointer to that project
  (`workingProjectStateManager.ts`);
- `get_current_project` answers `scope: "session-directory"` (vs
  `"dashboard-pointer"`), so an agent can always tell why it got the project
  it got.

Decided by the owner after the battery's first tier-2 run measured an agent
inspecting one project while its tools acted on another.

### Every connection has its own working project (AI-15, 2026-10-19)

The same rule now covers every connection, not only scoped ones. A connection's
working project (`HandlerContext.agentWorkingProject`) starts as the session
directory's project, or unset; unset means it follows the person's current
project. It moves only by the agent's own action, and never moves the person's:

- `create_project`, `create_project_from_file` and `copy_project` build the new
  project as its own (`runProjectCreation`), so creation's saves leave the
  person's current project alone, and the agent's next tools act on what it made;
- `set_current_project` sets the connection's working project only. It used to
  run the projects list's "open project", which switched the person's project
  and opened its dashboard on their screen;
- `get_current_project` answers `scope: "agent-chosen"` once the agent has
  created or picked a project.
- while a connection follows the person's project, a read's answer gains one
  line when the person opened another project since the agent's last call,
  naming both and how to go back (`projectChangeNotice.ts`). A tool that
  changes something (it does not declare `readOnlyHint: true`) does not run at
  all then: its answer is an error naming both projects, and calling it again
  runs it on the new one (AI-76). A line on the answer came too late for a
  write, which had already landed. The project choosers (`set_current_project`
  and the three creators) are never stopped. The first call on a connection has
  nothing to compare with, so nothing stops it. An agent with its own working
  project is never told or stopped: nothing it does changed.

Screens keep their own project the same way (`openForCurrentProject` in
`bundledPanelCommand.ts`), and the lifecycle commands they and agents run take
the project's path rather than reading the current project.

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

**A failed call says so: `isError: true`.** MCP has two error mechanisms and they are
not interchangeable — a JSON-RPC error means the REQUEST was wrong (unknown tool,
malformed call) and is opaque to a model, while `isError` on a normal result means the
call RAN and failed. The specification asks clients to hand the second kind back to the
model so it can self-correct and retry with different arguments.

`asText` sets it from the answer's own top-level `success`, because handlers already
answer `{ success, … }` (Pattern B) — so the fact is present and this only restates it
in the protocol's vocabulary. `asRawText` takes a string and therefore has to be TOLD:
`asRawText(text, { isError: true })`. The descriptor registrar does both — the handler's
failure branch and the confirm refusal, which is an input-validation error an agent
corrects by calling again with `confirm: true`.

**Only the top-level `success` counts.** Cancellation is
`{ success: true, data: { success: false, error: 'cancelled' } }` — a handler that ran
correctly and is reporting that the user backed out. Marking that as a tool failure
would tell an agent to retry something a person just declined.
`tests/features/ai/server/toolFailureEnvelope.test.ts` (the builders) and
`tests/features/ai/server/toolDescriptors-failureFlag.test.ts` (descriptor rows) pin all
of this, including that case. Added 2026-09-11; before that the flag was set nowhere and every failure returned
as a success whose text happened to say otherwise.

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

**The list of which tools those are lives in [mcp-tools.md](mcp-tools.md), generated.**
It used to be written out here, and on 2026-08-30 it named 8 of the 28 that are
actually gated — in the same document that explains, two sections up, why the tool
catalog stopped being hand-maintained. The list moved for the same reason the catalog
did, and the reason is sharper here: an agent reads this to decide what is safe, so an
incomplete list of destructive tools understates the blast radius of everything it
omits.

The same pass found the generator undercounting them — its metadata window was a fixed
600 characters after a tool's name, so a long description pushed `confirm: true` out of
range and four genuinely gated tools published as ungated. `set_console_apis` was one,
which is the worst possible one to get wrong: it says "set" and it REMOVES, its own
source comment calls it "a delete wearing a setter's name", and the catalog was telling
agents it needed no confirmation. Judge against the rule, not the verb — and if you are
checking whether something is gated, read the generated table rather than any prose.

Merely *mutating* is deliberately not the bar. Deploys (`deploy_mesh`,
`add_integration` for every entry but the ERP integration, which prepares the store and
takes `confirm` (below), `deploy_integration`, `redeploy_integration`,
`update_integration`, `install_integration`), lifecycle (`start_demo`,
`stop_demo`) and config writes (`update_project_config`, `rename_project`) change
state and are ungated, because they are idempotent or trivially reversible and
gating them would make the agent surface useless for the routine work it exists
to do.

This paragraph used to claim that *anything* changing state was gated. It never
was — and the overclaim hid a real gap: `promote_block_to_library` pushed a commit
and published to a live site ungated while its exact inverse
`remove_block_from_library` was gated. If you add a tool, decide against the rule
above, not against this list.

`load_erp_demo_data` (2026-09-27) is gated because it sets any ERP value changed by hand
back to Commerce's; it removes nothing. Like `reset_erp_records`, it ends by publishing each
filled ERP's customer prices into the companies' shared catalogs (AB-26z); prices not
published are the answer's `warning`, not a failure. Both, and `add_erp`, also answer
`data.mapping` (AB-26y): the website-to-sales-organization mappings the fill filled from the
ERP's own sales organizations and the ones it kept because they were already set.

`add_erp` (2026-09-28, AB-16) is gated although it only adds: it creates an Adobe workspace
and deploys a new ERP into it, which takes minutes and is undone only by `remove_integration`
on the new ERP's id. Since 2026-10-09 (AB-75) the gate is in its handler: a call without
`confirm` previews what every ERP will own once it is added (`data.preview`, the same numbers
the "Add another ERP" dialog shows, and `data.next` when the new ERP would own nothing), and
only `confirm: true` deploys, with the consent dialog. Its optional `owns` (AB-64) says which products the new ERP owns —
attribute or websites — and without it the default applies, `erp_owner=<its list id>`. An ERP
on "everything" is the catch-all for what no other ERP claims by attribute (AB-72), so adding
by attribute changes no other rule; only a website rule narrows such an ERP, to the websites
left over. The answer's `owns` / `existingOwns` say the rules saved in words, and its
`warning` what the user still has to do, including products two rules both claim.
`assign_erp_products` and `add_erp_owner_to_attribute_sets` (2026-10-09, AB-74) preview
WITHOUT `confirm`, so they are not refused by the descriptor's confirm gate: a call without
it reads Commerce and answers what would change, and writes nothing. With `confirm: true`
they raise the consent dialog and write. `assign_erp_products` dispatches into the same
handler as "Assign products" on an ERP's card: it writes `erp_owner` on the chosen products
in one Commerce bulk call (`V1/async/bulk/products/bySku`), follows the bulk to its end,
records each product's previous value on the ERP, and applies ownership across every ERP.
`add_erp_owner_to_attribute_sets` is the fix the erp-attributes setup step offers. Their
undos, `undo_erp_assignment` and `remove_erp_owner_from_attribute_sets`, follow the same
pattern and dispatch into the same handlers as the card's "Undo last assignment" and the
setup guide's "Take erp_owner out again".
`prepare_commerce_store`, `undo_commerce_store_preparation` and `set_commerce_config`
(2026-10-10, AB-77) take the same shape: without `confirm` they read Commerce and answer what
would change, and write nothing; with `confirm: true` they raise the consent dialog and
write. The first applies an integration's setup steps through one engine shared with the
setup guide's Apply all and per-step Apply — settings through
`PUT /V1/system/config` (whose `errors` list under HTTP 200 is read on every write), the
`erp_owner`/`brand` attributes, a warehouse and stock per ERP, a shared catalog per company
— checking each step first and skipping one a datapack already did, and recording what each
changed on the integration so the second puts it back newest first (a source it created is
disabled, not deleted: Commerce cannot). The undo keeps what changed since and says so in one
line per step (`steps[].kept`, datapack-engine step 06): a setting no longer holding the value
written, a shared catalog holding what the run did not put there, a stock holding a source the
run did not link, a source changed since. The third writes settings outside a catalog step and
records the previous values on the project, which `undo: true` writes back. The setup
checklist tools say which steps are applicable (`fix` on the item) and which were applied
(`fixApplied`). `add_integration` for the ERP integration runs the same engine before its ERP
is filled (owner, 2026-10-22), so it takes the same shape for that one entry: without
`confirm` it answers what preparing the store will change (`data.preparation`) and adds
nothing; with `confirm: true` it adds. Every other add is ungated, as above. Details:
`docs/systems/erp-integration.md`, "Preparing the store".
The ERP tools that act on one ERP (`load_erp_demo_data`,
`open_erp_screen`, `run_erp_rest`, `write_erp_rest`, `get_erp_status`) take an optional `erp`,
the ERP's component id, and default to the integration's first, except `load_erp_demo_data`,
which fills every ERP without it. `reset_erp_records` takes no `erp`: a reset always covers
every ERP and closes off the orders they hold (AB-16n). `get_erp_status` lists every ERP the
integration serves — each row with its `listId`, the value a product's `erp_owner` takes to
route to that ERP (AB-51) — and its live health is the named ERP's.

`reset_erp_records` (2026-09-14) is gated for the same reason `reset_datapack` is: it wipes
every ERP the ERP integration serves, cancels the open orders they hold (a cancelled order
cannot be reopened) and undoes what those ERPs wrote into Commerce companies. Its read, `get_erp_status`, is not. `open_erp_screen` (2026-09-16) is gated for
`open_url`'s reason: it opens a browser window.

The demo ERP's demo controls (2026-10-02, AB-59): `set_erp_appearance` (a theme and/or a colour,
`PATCH settings`) is agent-only, since people set the ERP's look on its own screen; the
downtime pair dispatches into the same handlers as the card's "Simulate downtime":
`start_erp_downtime` (`POST settings/maintenance`, 1–1440 minutes, default
30) and `end_erp_downtime` (`DELETE settings/maintenance`). Only `start_erp_downtime` is gated,
with a consent dialog: while it lasts the ERP refuses every call, so the integration's orders
wait. The look is cosmetic and ending the downtime restores the ERP, so neither is gated. Whether
a downtime is running is `run_erp_rest` on `health` (`maintenance`).

Both block-library gaps were closed together on 2026-08-16, and they are the
worked example of the rule: `promote_block_to_library` was ungated because it
only *adds* things, and `refresh_block_library` because "rebuild" sounds local.
Both push to a live site. Reach, not intent, is what decides.

`write_page` and `publish_page` were the last two content tools open, and closed on
2026-10-04 (owner: "Yes, write_page should ask"). Both are `confirm:true`-gated and
raise the consent dialog: the sign-in pre-flight
runs first, then the gate, so the refusal can name the storefront (`org/site`) and the
page, and for `write_page` whether it publishes (`site`, `path`, `publish` in the
refusal). A write WITHOUT `publish` is gated too: it replaces the DA.live source the
live site is built from, and the page's next publish, by anyone, ships it. The dialog
shows the page and, for `write_page`, the `publish` flag; neither is session-grantable.

Note the shape of the refusal differs by tool. Most return an error and do
nothing. `apply_updates` is the one that reports what *would* happen: no
`confirm` = a read-only "here's what's available". Don't assume the dry-run
behavior generalizes. With `confirm:true` it raises the consent dialog (2026-10-16,
EDS-51): it rewrites storefront code, and `onClash: 'reset'` discards the
user's own edits; `onClash: 'keep'` leaves a clash in the local storefront copy for the
agent to fix (EDS-57). A storefront built on Demo Builder's tested boilerplate is brought to
that tested version with its fixes put back, and is never reset to the bare template;
its way through a conflict is `reset_project`.

`finish_storefront_update` (EDS-57) previews the same way: without `confirm` it returns the
kept clash's files, the ones still carrying conflict markers, and the diff that would go
live. With `confirm:true` it raises the consent dialog, then checks the fix (still the
current update, only the clashing files changed, no markers, the JavaScript and JSON
parse), pushes one commit with the user's token and records the version; with `leave:true`
it drops the fix instead. It takes the project by name, because the Updates window's Fix
with AI starts on Your Projects, where the open project can be any other. The agent never
pushes a fixed clash itself: the tool is the one path that checks it and records it.

**Extra-strict gating for irreversible ops.** Three tools require a `confirmName`
that exactly echoes the resource, so an agent can't destroy the wrong one on a
fuzzy match: `delete_project` (project name), `delete_github_repo` (`owner/repo`),
and `cleanup_dalive_site` (`org/site`).

**Whether a deleted storefront is really down.** `cleanup_dalive_site` and
`delete_project` (with `deleteDaLiveSite`) run the storefront teardown. It unpublishes
what Helix lists as published, not only what DA.live still holds, then checks the live
host. `stillPublished` is false only when that check found the pages gone;
`publishState` (`down`, `still-live`, `sign-in-refused`, `unknown`) and `publishSummary`
say which, in words, including "could not tell" (EDS-33). `delete_project` carries
`publishSummary` under `daLiveSite`. When the check finds pages still live (`still-live`),
or AEM answers 401/403 to the listing of what is published or to the product pages
(`sign-in-refused`), the teardown stops there: the DA.live content, the site settings
and, for `delete_project`, the repository and the project are kept, `stopped` says why,
and `delete_project` answers `deleted: false` (EDS-65). Deleting them would leave a live
site with nothing to take it down by. `unknown` (could not tell) does not stop it.

**A storefront's repository needs a working DA.live sign-in to go.** Its code on
aem.live is removed file by file after the repository is deleted, and the files can only
be listed while the repository exists (EDS-67). So `delete_github_repo` and
`delete_project` first ask IMS whether the DA.live sign-in still works; with none, or
one IMS refuses or cannot be asked about, the repository is kept (`kept: true` /
`stopped` with the sentence to sign in to DA.live and delete again), and `delete_project`
keeps the project too.

**A project's own datapack goes only when asked.** `delete_project` takes `deletePack`, the
button's "Also delete its pack" box (datapack-engine step 07): every version of the project's
own pack in the datapack library, deleted after the project's files. It is off unless the call
asks, `deleteAll` never turns it on (keeping a pack can be undone, deleting it cannot), and
`localOnly` refuses it with a `note`. `datapack` in the answer names the pack and says whether
every version went (`deleted`), and which did not (`error`); a project with no pack of its own
answers `datapack.deleted: false` and deletes nothing from the library.

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
surface, so long multi-step tools (`reset_project`, `apply_updates`) collect
their per-step messages into a `phases` array and return it, so the agent can
narrate what happened.

**Single source of truth.** A tool is an adapter. It calls the same service the
UI calls. When the UI logic was entangled with modals/progress, the headless core
was *extracted* and both call it — never copied.

**Re-runnable failures.** Idempotent operations (e.g. `reset_project`) report
`rerunSafe: true` on failure so the agent knows it can fix the cause and call
again.

### One reset, two kinds of project (2026-10-03)

`reset_project` is the agent's door to the same action as the Reset button, and it
dispatches the way the button's handler does: an Edge Delivery project goes to
`executeEdsReset` (storefront repo, DA.live content and config back to the
template; the site stays up while the content is replaced, and afterwards any page
still published from before that was not republished is unpublished: `leftoverPages`
in the answer says `removed`, `some-left`, or `not-listed` when Helix could not say
what is published, in which case old pages may still be live (EDS-33); a headless
project goes to `executeProjectReset` (components deleted and installed again;
integrations and configuration kept), the core
`resetProjectWithUI` wraps. Before that date the tool was `reset_eds_project` and
refused a headless project. The headless half refuses a running demo and names
`stop_demo` rather than stopping it unasked, and asks for the Adobe sign-in only
when there is a mesh to redeploy. Nothing undoes a reset — it is the return to
zero — which is why it is consent-gated (`reversibility.ledger.json`).

### A creation's name, and a creation that fails (2026-10-16)

`runProjectCreation` — which `create_project`, `create_project_from_file` and
`copy_project` all end in — first runs the wizard's own name check
(`projectNameProblem`): an unsafe name, or one a project already has, is refused before
anything is built. Creation removes whatever folder already has the new name, so
without the check an agent reusing a name deleted that project (AI-73). When creation
then fails, `cleanupFailedCreation` removes the half-built project and any API Mesh the
creation made, as the wizard does. A mesh the workspace already had is never counted
as made, so it is never removed. A storefront provisioned before the failure stays, as
it does in the wizard. A re-run uses it by passing `adoptExisting:true`: the repository
(`githubOwner`/`repoName`) and DA.live site (`daLiveOrg`/`daLiveSite`) are taken as they
are, the wizard's "use existing" choice for both, with no reset of the code and no new
copy of the content. The same flag rebuilds a deleted project whose storefront survived.

### Creating from an exported file (2026-10-03)

`create_project_from_file` takes an absolute PATH to a file `export_project_settings`
(or the projects list's Export) wrote. The path is checked at the boundary (absolute,
exists, a file, under 1 MB) and the text is read through `readProjectFile`, which
reads the version-2 file Export writes, migrates a version-1 file from before
2026-10, and strips every credential. Creation then
runs through `runProjectCreation` — the same function `create_project` ends in — with
the file's package, stack, addons, settings, block libraries, integrations (custom
sources and API picks included), mesh, datapack and store structure as its inputs.
The integrations are derived by `integrationStateFromSettings`, the function the
wizard's edit AND import modes use, so the wizard's Import and this tool agree.

The file never decides the receiver's sign-ins, Adobe workspace, storefront
repository or DA.live site, or any credential. The answer says what came from the
file (`fromFile.applied`), what did not and why (`fromFile.notApplied`), and which
credentials the new project still needs (`stillNeeded.credentials`, read from the
components' declared env vars against `SECRET_ENV_KEYS`). Like `create_project` it is
gated by `confirm:true` and is not on the consent-dialog list.

`copy_project` (2026-10-04, PL-56f) is the projects list's Copy from Existing without
its picker: it takes the source project's NAME, loads it without saving it back, and
reads it the way the human Copy does — `copySeedFromProject`, the file Export writes
read back through `readProjectFile` — then goes down `create_project_from_file`'s own
second half (`createFromProjectFile` in `createProjectFromFileTool.ts`). So a copy
carries what an import carries and nothing more: never a credential, and the source's
storefront only as provenance. An Edge Delivery copy gets its own repository and
DA.live site (owner, 2026-10-04): it needs `repoName`, `daLiveOrg` and `daLiveSite`
like an import, and naming the source's own repository or site is refused before
anything is created. The answer reports `fromProject` where an import reports
`fromFile`. Gated by `confirm:true`, not on the consent-dialog list, undone by
`delete_project`.

### Store scope at creation (AI-11, 2026-10-03)

`create_project`, `create_project_from_file` and `copy_project` take an optional `storeScope
{ website, store, storeView }` — the input `configure_project` takes, from the one
schema in `storeScope.ts`, so all three agree on what a valid scope is (all three
codes, as text) and where it is stored (the backend's `ACCS_WEBSITE_CODE`,
`ACCS_STORE_CODE`, `ACCS_STORE_VIEW_CODE`). It is checked before anything is created,
and refused when the stack has no backend to hold it. It reaches the creation that
generates `config.json`, so a storefront built on a store other than the demo's is not
published with the wrong codes first and corrected after. On the file path the call's
codes win over the file's; omitted, the file's codes stand.

On ACCS, a given `storeScope` is also checked the way the wizard's and Configure's store
pickers check it (EDS-46): one anonymous Catalog Service search for that store view
(`storeViewProducts.ts`). When it finds no products, or the scope has no search index, the
answer carries `warnings: ["Guests won't see any products in this store view."]` — the
same sentence the pickers show. It never blocks or fails creation, and a check that cannot
answer (timeout, network, HTTP error) adds nothing.

### The storefront report (EDS-13f, 2026-10-03)

`get_storefront_report` (read-only, GitHub sign-in) answers the same report as the
Diagnostics section: the storefront's boilerplate
against Demo Builder's current one, its lineage, what Demo Builder wrote, the content's links
to pages that do not exist, and `summary`, the words the SC reads. `needsReset: true` (and
`storefrontNeedsReset: true` in `get_project_status`) says the storefront is behind how Demo
Builder builds storefronts now (`storefrontChanges.ts`); `reset_project` is the way up to date.
The dashboard's report window and the `Demo Builder: Storefront Report` command were removed
on 2026-10-23 (EDS-64); `reset_project` answers the fresh copy's broken links as `brokenLinks`.

It no longer lists Demo Builder's fixes, and `reset_project` and `create_project` no longer
take `applyFixes`: there is nothing to ask. Creation and reset apply every live patch in the
shipped ledgers that fits the storefront's code, an added demo's included (owner, 2026-10-23,
EDS-64; `knownPatches.ts`).

### Category pages and the catalog menu (EDS-24, EDS-61)

There is no catalog menu tool and no category page tool. The category pages and the nav
switch are part of storefront setup: project creation, `reset_project` and `republish`
(and the dashboard's Reset and Republish) each run the same step, `catalogMenuStep.ts`,
when the storefront's own repository has `blocks/catalog-menu/` (the Demo Builder Blocks
library) and the product page overlay is on. Each category's page is its own url path
(`/signs`): an authored DA.live page there, or else the one the shared `render-pdp` overlay
makes from the site's `/categories/default` template. The step first publishes
`/authored-category-pages.json`, the sheet listing the authored addresses, which the
overlay steps aside for (and without which it renders no category page); then it
publishes every category page (generated ones on ACCS), writes a starter template when the
site has none, takes down pages of categories the store no longer has, adds the menu line
and the block to `/nav`, and keeps a record on the storefront instance
(`metadata.catalogMenu`). The step's sentence comes back on `reset_project` and
`republish` as `categoryPages`: how many pages were published, how many authored pages
the sheet keeps, any removed, and any edited page it kept.

So an agent that wants the menu gone deselects the library and resets (confirm-gated).
A category added in Commerce later needs nothing: its page is published on its first
visit, and `republish` publishes every page again (the way to make a template edit, a
renamed category, or a page an author just wrote at a category's address show). `check_category_pages` and `add_category_pages` were removed on
2026-10-22 with the per-category DA.live pages they wrote. See
`docs/systems/category-pages.md`.

After a store change (EDS-44) the pages belong to the old store. `configure_project`'s
note then says the republish also replaces the product and category pages. `republish`
does it when the project's `edsStorefrontState.catalogPagesPending` is
set and its own config publish reached the CDN: the old store's product and category
pages come off, the new store's are published (an edited page Demo Builder wrote is
kept). Both answer `storePages`, the one sentence the SC reads in Configure ("Now on
CitiSignal: 11 category pages and 39 product pages published. 30 old product pages
removed."). One service does it for every door (`storeScopePages.ts`).

### Installing a datapack again, and saving the store back (datapack-engine step 05, 2026-10-29)

With Demo Builder's engine, `start_datapack_import` on a pack it already installed in the project
brings what it made up to the pack, takes out what the pack no longer has, and keeps anything
changed in the Admin. It never overwrites that: the outcome `get_datapack_import_status` reads
carries one line, `note` ("Kept 2 things you had changed in the Admin."). The start itself still
answers only the job's id, so that line arrives with the outcome, not with the start.
`preview_datapack_changes` (a read) says beforehand what an install would do: counts per data kind
and at most three names per count, never rows. `save_store_changes_to_pack` (confirm-gated) saves
the store's copy of the pack as a new version of this demo's OWN pack in the datapack library (step
07: made at the first save, named for the project; what the install record lists and the installed
version's own products, attributes and sets, read from the store), leaves the pack installed as it
was, moves the project onto the new version (recording the store and the pack it was made from),
and changes nothing in Commerce; it is undone by `delete_library_datapack` on the new version.
A project's datapack records the store that holds it (`installer` or `library`): creation, a copy
and a project file install from that store, `configure_project` takes it as `datapack.store`, and
`create_project_from_file` answers `datapackNote` when the pack named can't be read (the pack it
was made from, or none, is installed instead) or a colleague's own pack is copied into your library first. Every removal path, `reset_datapack`
included, keeps a category or set the pack made that holds something it did not, and the
outcome's `note` says so ("Kept the set Racks: it holds 2 products you added."). A `reset_datapack`
clears the project's datapack only when the removal finishes having taken everything out: one that
stops, or keeps a container holding the SC's things, leaves the project naming the pack, so the
next removal can finish the job (live, 2026-10-30). Both read the store with the project's own
credential, behind the same org guard as the import. Plan:
`.rptc/plans/datapack-engine/step-05-capture-and-repeat-installs.md`.

### Customers and B2B through Demo Builder's engine (datapack-engine step 08, 2026-10-29)

No new tool. `start_datapack_import` now installs customer groups, customers, shared catalogs,
companies and the three shared-catalog assignment kinds (all fourteen of Bodea's kinds); its
answer stays a job id, and the outcome still reports kinds, never rows. `customers_export` (the
bulk import) is still refused, before anything is written. A company is made over REST with its
admin (the website's customer by that email, else one made and recorded) and sits in the public
catalog's group until an assignment moves it. Removal, reinstall and the preview keep a company,
shared catalog or customer group the pack made while it holds something the pack did not, and the
`note` says so ("Kept the company Altura: it holds 1 customer you added."). A kept company keeps
its admin, its shared catalog and that catalog's group with it, in the same line, and nothing
assigned to a kept catalog is unassigned: decided read-only before any write (live, 2026-10-30,
when unassigning first moved the SC's customer to group 1 and deleting the admin was refused). A customer row's
`password` is sent when the customer is made and nowhere else: never logged, never in the install
record, and never written into a saved pack, a copy between stores or a zip. Plan:
`.rptc/plans/datapack-engine/step-08-customers-b2b.md`.

### Cart rules, coupons and gift cards through Demo Builder's engine (datapack-engine step 11, 2026-10-30)

No new tool. `start_datapack_import` now installs `cart_rules`, `coupons` and `giftcards`; its
answer stays a job id. A rule is made on the install target's website whatever websites the pack
names, its customer groups and its conditions' categories, sets and option labels turned into this
store's ids; a coupon is made on the rule its pack row names by NAME, its code kept exactly; a
gift card is a product (`POST products`), its amounts sent once on every website. A rule or code
the store already has by that exact name is left alone and not recorded. Removal, reinstall and
the preview keep a rule the pack made while it holds a code the pack did not ("Kept the cart rule
… : it holds 1 coupon you added."). `product_export`, `customers_export` and the ACO kinds are
still refused before anything is written. Plan: `.rptc/plans/datapack-engine/step-11-later.md`.

### Store settings in a pack (datapack-engine step 09, 2026-10-30)

No new tool. `start_datapack_import` installs a pack's `store_config` rows (`{path, value, scope,
scope_code}`) last, through the setup guide's settings fix: store-wide (`default`) or for the
install target's website, whatever website the row names; a store-view row, a base URL, cookie,
Admin or credential path, or a path that holds no value anywhere is refused before anything is
written. The outcome's `note` names each setting set ("Set catalog/frontend/grid_per_page: 12 →
24."). `reset_datapack` puts each back first, keeping one the SC changed since ("Kept
catalog/frontend/grid_per_page as it is: it was changed after Demo Builder set it."), and the
`note` says which. `preview_datapack_changes` counts settings like any kind. Plan:
`.rptc/plans/datapack-engine/step-09-store-settings.md`.

The install record now keeps the website and store view the pack went to (`target`), and the
preview and "save store changes" read the store there, not at the project's website: a pack
installed to `justrite_test_website` on a project whose website is JustRite's was being read at
JustRite's and called "changed in the Admin" (live, 2026-10-30). A record from before this has no
`target`; its settings are still read at the website each one names (`scopeCode`). Installing a
pack again into another website than its record names is refused ("… is installed on the website
justrite_test_website. Remove it first, or install it there."), by `validate_datapack_import` too.

### A pack's own root category (datapack-engine step 12, 2026-10-30)

No new tool. A store shows only the categories under its root, and no API can change a store's
root (`POST/PUT /V1/store/storeGroups` answer 404 on ACCS). So `start_datapack_import`, for a pack
with a `root_category` of its own: when no other store shows the install target's store root, it
leaves the pack's root out and puts its categories under the store's root, and the outcome's `note`
says so. When another store shares that root (`justrite_test_website` shows JustRite's root 119), it
makes the pack's root and asks the user, mid-install, through `askDuringOperation` (a VS Code modal
under an agent): Open the Admin, I've done it, Skip for now. "I've done it" re-reads
`GET store/storeGroups`; "Skip for now" finishes with the step left open on the install record and
named in the `note` (Stores > All Stores > the store, Root Category: the pack's root). Running
`start_datapack_import` again re-checks it (a repeat install rewrites nothing unchanged) and marks it
done once set; the Data Installer's pack flyout shows the step with its own Check.
`preview_datapack_changes` answers `root`, the same sentence beforehand. Removal keeps the pack's
root while a store shows it as its root, saying to point that store back first. "Save store changes"
writes the pack's root back either way, so the saved version still installs as its own root
elsewhere. Plan: `.rptc/plans/datapack-engine/step-12-pack-categories-on-storefront.md`.

### Clearing a demo's part of the store (datapack-engine step 10, 2026-10-30)

The unit chosen is the **store** (store group), by website and store code (owner, 2026-10-30):
`stores: [{ websiteCode, storeCode? }]`, where a website without a store means all of its stores.
Store views are listed under their store and never chosen on their own.

`check_demo_data` (a read) always answers `data.choices`: every website and its stores, each
store's views, and `claimedBy` on a store another local project records as its own. With stores
chosen (the project's own store when none is named; `stores: []` for the choices alone) it also
answers `data.preview`: what the install records list, by kind; what clearing would delete
(products tied to the chosen stores, categories under a root only chosen stores use, customers of
a wholly chosen website or made in a chosen store, cart rules on wholly chosen websites only, their
coupons with them) and take off the chosen websites (products other websites also sell, cart rules
other websites also use); the orders it would cancel or refund and the returns it would close;
what it would leave and why (a root a store not chosen shares, a product whose demo can't be told,
a customer in a B2B company, an order Commerce can neither cancel nor refund, a cart rule on a
website a store not chosen also sells on or holding a coupon Demo Builder installed); and a `token`. What
a chosen store owns is judged against the whole chosen set.

`clear_demo_data` (confirm-gated; the consent names the stores) needs the stores named, never
defaulted, and that token. It makes the list again and writes nothing if the store would now clear
anything the list did not hold, answering the new list instead; otherwise it closes the returns,
closes off the orders by the one reset rule shared with the ERP integration's reset (nothing
invoiced or shipped: cancelled; any other: refunded with an offline credit memo; each noted), then
deletes customers, products, takes shared products off the chosen websites, deletes cart rules and
takes shared ones off the chosen websites (read whole, sent back with the other websites only), and
deletes categories deepest first. Its `note` says what it did and exactly what Commerce refused. Orders are never
deleted. It never touches what an install record lists (`reset_datapack` removes that),
attributes, sets, customer groups, companies, shared catalogs, stocks and sources, websites,
stores, store views, root categories or settings. Cannot be undone. Project reset asks the same
question for the project's own store after the datapack one; the Data Installer's "Clear demo
data" is the human surface with the store picker. Plan: `.rptc/plans/datapack-engine/step-10-wipe.md`.

Every door (both tools, the Data Installer and reset's question) reads every other project on this
machine (`readWipeClaims`, over `loadOtherProjects`). A chosen store another project records as
its own (the store its recorded store view belongs to) is refused before any product, customer or
order is read, naming that project ("The store justrite_store (website justrite) is also
JustRite's own store (project JustRite). Clear it from that project, if at all."):
`check_demo_data` answers it as `data.refused`, a normal answer; `clear_demo_data` refuses; reset
does not ask its second question and logs the sentence. What another project's install records
list on the chosen websites is left, as this project's is.

**One action, ERP included** (owner, 2026-10-30). Every door also finds the ERP integration
serving the instance, from any local project (`findWipeErp`: the deployed ERP integration of a
project on the same Commerce instance, as the one-per-instance add refusal matches it). Orders of
chosen stores whose website it sends to an ERP (`GET erp/settings?websites=`, `orders_send`) are
not the wipe's own: `data.preview.erp` counts and names them, with one line ("2 orders are handled
by the ERP integration (JustRite): they will be closed there, removed from its ERP, and the ERP
refreshed."), and `clear_demo_data` has the integration close EVERY order of those stores first
(`POST erp/close-orders` with their store codes, followed by its run id; each ERP that held one
removes its documents for them), runs no order rule of its own there, does its other writes, then
fills the integration's ERPs from Commerce again (`fillEveryErp`). The note merges the
integration's counts with its own and names the ERPs the orders were removed from. A deployment whose `erp/status` lacks `closesOrdersByStore`, or one that cannot be
asked, is never called: `data.preview.erp.held` says why (with the update to run) and those orders
are left open. The store list never offers Commerce's own Admin website (`admin`, id 0).

### Sharing a library pack (owner, 2026-10-30)

`share_datapack` (confirm-gated; the consent names the pack and whether it is shared) shares every
version of one of the SC's own library packs with everyone the library admits, or stops sharing it
(`shared: false`), through the library's owner-only `update-datapack-metadata` (`shared`). It answers
`{datapackName, shared, versions}`. The flyout of the SC's own pack offers the same action, reading
Share or Stop sharing, and the pack's card says Shared when it is. A project file names its pack by
reference, so `export_project_settings` and `export_demo_bundle` (with its setup part) answer
`packNote` when the project's pack is the SC's own private library pack: "Your teammates can't use
this pack's data. Share it? …"; a person exporting from the projects list or the dashboard is asked
the same question once, with Share, and declining exports anyway.

### Renaming a library pack, and a pack shared in a file (datapack-engine step 07, 2026-10-29)

`rename_datapack` (confirm-gated) gives every version of one of the SC's own library packs a new
display name through the library's `update-datapack-metadata`; the pack's `datapackName` never
changes. On this demo's own pack the project records that the SC named it, so its name stops
following the project's. It answers `{datapackName, displayName, versions}`. The Data Installer
screen's pack flyout offers the same Rename. Exporting a project whose pack is in the library
(the save dialog, `export_project_settings`, or a demo bundle with its setup part) remembers that
it went out in a file, on this machine; `delete_library_datapack` then carries one sentence, as
`sharedInFile` without confirm and as `warning` with it: "You shared this pack in a project file
on 27 October. Anyone who hasn't created that project yet will get Bodea instead." The pack it was
made from is named as the store lists it, never by its id. Deleting the last version of this demo's
own pack stops the project naming it (`ownPackCleared: true`), so the dashboard's Datapacks tile
loses its "This demo's pack" line; the next save makes the pack again. Plan:
`.rptc/plans/datapack-engine/step-07-demo-packs.md`.

### Integrations live in Adobe workspaces of their own (AB-23)

Since 2026-09-21 every integration an SC adds gets an Adobe workspace of its own,
inside the project's Adobe project. One add is one workspace: the ERP and its
integration share one. The mesh is the exception: it stays in the project's own
workspace (Production), where the storefront calls it. An integration added before
this has no workspace of its own and lives in the project's.

What an agent needs to know to act on the right one:

| Question | Where the answer is |
|---|---|
| Which workspace is this integration in? | `get_project` → `appBuilderComponents[id].workspace` (`id`, `name`, `title`); absent means the project's. The project's AGENTS.md lists them too |
| What is deployed there? | `list_runtime_packages` with `componentId` |
| Code it left behind (an action moved or renamed, a timer and its rule dropped) | Every deploy deletes it. For older leftovers, or when a deploy warned it could not: `delete_undeclared_runtime_code` with `componentId` (confirm-gated) |
| Give one integration an Adobe API | `add_console_apis` / `set_console_apis` with `componentId`. Without it the API goes on the project's workspace, which that integration never uses |
| What APIs does it have? | `list_console_apis` with `componentId` |

`deploy_integration`, `redeploy_integration` and `remove_integration` find the
workspace themselves. Removing an integration also deletes its workspace, once
nothing else in the project uses it. What Runtime refuses to delete is tried again after
10, 30 and 60 seconds. In a workspace of the integration's own, anything still there goes
with the workspace: Adobe deletes a deleted workspace's Runtime namespace about 11 minutes
later (measured 2026-09-27), and the extension checks with the namespace's old key until
Runtime refuses it, warning if that has not happened after 20 minutes. `data.workspaces`
says which workspaces went. In a workspace something that stays still uses, leftovers or a
namespace that cannot be checked stop the removal and keep the record, the folder and the
workspace: `remove_integration` answers `COMPONENT_REMOVAL_STOPPED` with what is left;
calling it again resumes at the undeploy, and `force: true` finishes regardless.

`set_project_destination` moves integrations by what it changes:

- **Another workspace of the same Adobe project** — an integration with its own
  workspace stays where it is; only what lives in the project's workspace moves.
- **A different Adobe project** — each integration with its own workspace is removed
  from the old Adobe project (Commerce changes undone, uninstalled, its workspace
  deleted) and added again in the new one, with its files on disk kept. This deletes
  live resources, so the SC confirms it in a modal first; a decline answers
  `cancelled: true` and changes nothing.

A workspace's name is what Console shows on its box: the letters and digits of its
title (`NorthwindERP`), numbered `NorthwindERP1`, `NorthwindERP2` when the name is taken.
Adobe refuses a space in a workspace name; it accepts a dash, but the workspace's Runtime
namespace then refuses every deploy ("Non-standard namespace formats are not supported
after aio-cli v10", measured 2026-09-22). Adobe never renames a workspace, so a name is
fixed when the workspace is made.

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
  descriptor registrar and every direct destructive tool — is first asked about
  IN THE CHAT by MCP elicitation (`consentViaChat.ts`); anything but an explicit
  accept is a refusal. Only when the client cannot be asked (no elicitation
  capability, a failed or timed-out ask) does it fall back to a MODAL VS Code
  dialog in the window that owns the socket (`createAgentConsentGate`, injected
  as `consentGate`). Per agent: interactive Claude Code renders the ask (measured
  2026-08-25); headless `claude -p` (2026-08-28) and `copilot -p` (2026-10-06)
  both declare elicitation and decline at once, so a headless destructive call
  refuses instead of hanging; VS Code's chat renders it in the panel (read in
  the 1.140 source). Interactive Copilot CLI and the VS Code panel are not yet
  watched live with a destructive call (ADR-025). This converts the
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
- **DA.live status means "works now".** `get_auth_status`'s `dalive` entry asks IMS
  (`validate_token`) about the stored token, the same reader the wizard's indicator and
  the session guard use (`DaLiveAuthService.checkSignIn`). `authenticated` is `'unknown'`
  when IMS cannot be reached: neither signed in nor out.
- **A forced Adobe sign-in signs out of DA.live** (measured 2026-10-28). When an agent's
  `sign_in(provider:"adobe")` falls back to the forced sign-in and that ends a working
  DA.live sign-in, the result carries `notices` and `next` instead of a dialog; any other
  agent call that forces one says it in the narration (`daLiveSignedOutNotice`).

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
prompt-evaluation surface (AI-3b) and is on `feature/evaluation-mode-dry-run`.

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
surface (AI-3b); the code is on `feature/evaluation-mode-dry-run`.

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
  component); Playwright and the Adobe dropins MCP (`@dropins/ai-tools`, formerly
  `@dropins/mcp` — drop-in component discovery/scaffolding/health tooling whose
  project-touching tools take an explicit `projectDir`) for EDS storefronts only.
  Anchored to the per-project isolated MCP tools dir
  (`<project>/.demo-builder-mcp/node_modules/`) — decoupled from the storefront's
  own `node_modules` so they install even when the storefront's `npm install` can't.
  They install into, and run from, Demo Builder's Node folder (`~/.demo-builder/node`)
  on Demo Builder's Node (`demoBuilderNode()`, generated from every component's own
  `engines.node` range, PR-1a): launched as `fnm exec --using=<major> node <script>` with
  the entry's `env.FNM_DIR` pointing at that folder, not on the PATH's Node (AI-13).
- **`.claude/settings.json`** — a `PostToolUse` git-sync hook for EDS projects
  (commit/push storefront edits the agent makes). Skipped if the path contains
  shell metacharacters. The extractor reads the tool-call JSON on **stdin** and
  takes `tool_input.file_path`; it once read a `$CLAUDE_TOOL_INPUT` env var Claude
  Code never sets, so the hook silently did nothing from beta.109 until the
  AI_CONTEXT_VERSION 6 fix. It commits and pushes only — publishing is
  `republish` / `sync_storefront`. It does nothing while a storefront update's clash
  is kept in the copy for fixing (`.git/demo-builder-kept-clash`, AI_CONTEXT_VERSION 42):
  the copy then holds the whole half-applied update, which `finish_storefront_update`
  pushes once the fix checks out.
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
`demo-builder` entry into the user-scope config of every agent that keeps one
(`GLOBAL_MCP_CONFIGS`: `~/.claude.json` and `~/.copilot/mcp-config.json`) — same
command/args but **no** socket env, so the proxy discovers a running window at
launch (see §5). Explicit opt-in only; it merge-preserves everything else in the
file and refuses to overwrite a malformed one.

**Which agent reads what** (ADR-025). The window is homed at the projects root,
so its `.mcp.json` is the one every agent meets: VS Code's chat discovers it as a
workspace server (Copilot in VS Code, the default — no user-level file exists to
write), Copilot CLI reads it in a trusted folder, Claude Code reads it directly.
Cursor and Codex read `.mcp.json` natively too, so no per-tool config files are
written. Copilot hands our tools to the model deferred, behind `tool_search`, so
the 128-tools-per-request cap does not bind; see
[ai-agents.md](ai-agents.md).

---

## 13. Adding a new tool

**Invoke the `mcp-tool-authoring` skill.** It is the procedure, it is kept current,
and it carries things this section cannot: the three declarations every tool must
make (read-only annotation, narration phrase, consent copy and target), which tests
pin counts and will fail when you add one, and the trap that a stub server cannot
test registration at all — a raw JSON Schema passed as `inputSchema` once killed
registration for *every* tool while every suite stayed green.

This section used to restate the steps in shorter form. That is how a reader ends up
following an older procedure than the one being maintained: the skill gained the
three-declaration rule on 2026-08-25 and this list never did.

What belongs *here* rather than in the skill is why the surface is shaped this way —
§10 for the conventions a tool must satisfy, §8 for the headless context it runs in,
and §7 for the path a call actually takes.

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
