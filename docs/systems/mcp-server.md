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
`src/features/ai/server/mcpSocketPath.ts` — a SHA-256 of the absolute path,
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
The registration (schemas, confirm gates, envelopes) lives in `mcp-server.ts`;
the handler implementations live in `src/mcp/` (projectSecurity,
projectToolHandlers, storefrontSyncHandler, blockAuthoring,
blockLibraryPublish, blockToolHandlers — split 2026-08-23).

| Tool | Purpose |
|---|---|
| `list_projects` | List all projects (paginated). Carries `pinned: true` when set — omitted otherwise, so the common row costs nothing. It exists because `set_project_pinned` was a write no read could confirm. |
| `get_project` | Read a project's manifest (summary or full). **Secret VALUES are stripped** (`stripSecretValues` over `componentConfigs`) on BOTH paths — `full: true` is the more dangerous one, not an exemption. Found live 2026-08-17 returning a real `ACCS_OAUTH_CLIENT_SECRET`; the same convention `export_project_settings` already followed. To read a secret, open the project — not an agent transcript. |
| `get_component_config` | Read a component's `.demo-builder.json` / `.env`. **Returns the file VERBATIM, secrets included** — deliberately, since the file is the answer, but it means the `get_project` strip above does not cover this door. Whether that stays deliberate is an open question, not a settled one: a `.env` read hands an agent every credential the project has. Filed rather than changed, because narrowing it changes the tool's contract. |
| `update_project_config` | Write `.demo-builder.json` / `.env` (env content validated). |
| `sync_storefront` | Git add/commit/push the storefront. Names the pushed commit in its reply, and says publishing reaches the CDN on a delay — an agent that verified against the rendered site instead of git once read that lag as discarded commits. On a `non-fast-forward` rejection it rebases onto the remote and retries **once** (`retryAfterRebase`); a conflicting rebase is aborted so the checkout is exactly as found. A `ruleset` rejection is never retried — replaying it cannot change why a rule refused it. |
| `list_blocks` | List EDS blocks in the storefront. |
| `get_block_source` | Read a block's files (manifest or one file, size-capped). |
| `get_block_authoring_shape` | Read a block's DA.live authoring shape from `component-definition.json` + the models/filters siblings (registry index when `blockName` is omitted). |
| `promote_block_to_library` | Add a local block to the DA.live authoring library. Destructive (commits, pushes, publishes); confirm-gated. |
| `remove_block_from_library` | The inverse. Destructive; confirm-gated. |

### Discovery & catalog — `discoveryTools.ts`
`list_components`, `list_demo_packages`, `list_stacks` — read-only catalog lookups
used while assembling a `create_project` call.

### Authentication & Adobe — `authTools.ts`, `adobeTools.ts`
`get_auth_status`, `sign_in`, `list_orgs`, `select_org`, `list_adobe_projects`,
`select_project`, `list_workspaces`, `select_workspace`. These back the
[auth handoff](#auth-handoff) other tools rely on.

`list_adobe_projects` is **paged and searchable**, and each row carries
`deletable` — the ownership verdict, not the raw creator id.

That answers "why can I not delete this project?", which is the question the
field exists for. It replaced shipping `who_created` itself, which was wrong two
ways, both measured live 2026-08-16 against a real org:

- **Size.** The org has **725 projects**; the unpaged response was **111,748
  bytes** (~28,000 tokens), and `who_created` alone was **46%** of it — 35KB of
  other people's technical-account addresses in a model's context.
- **Usefulness.** The agent could not act on it. The comparison is against the
  token's `user_id` claim, which only the extension can read, so the field was
  inert at the receiving end.

`deletable` is that comparison already made — ~40x smaller and directly
actionable. The fail-closed rule is preserved: no recorded creator resolves to
`false` (`isProjectOwnedBy`).

`select_project` no longer enumerates on a bad id. It used to return every
project in the org as `validOptions`, so one mistyped id cost more than the
entire tool catalogue; it now reports the count and points at
`list_adobe_projects`'s `search`.

### Descriptor-driven tools — `readDescriptors.ts` / `actionDescriptors.ts` (via `toolDescriptors.ts`)
Thin tools declared as data and dispatched to existing handler maps:
- Reads: `verify_ai_setup`, `list_ai_prompts`, `check_mesh` (optional
  `workspaceId`; defaults to the current project's — a descriptor row with NO
  `inputSchema` is dispatched `{}`, which is what made this tool return "Invalid
  workspace ID" on every call until it was fixed), `list_console_apis`
  (the org's subscribable Adobe services, flagging ones the reconcile union
  already manages), `get_project_urls` (the project's useful URLs as data — local
  storefront, EDS live site + DA.live authoring, Commerce admin, Developer Console
  deep link — computed from the same getters the open-in-browser handlers use, but
  WITHOUT opening a browser or running the admin-panel "Open Configure" prompt;
  absent URLs are omitted), `get_store_structure` (the Commerce websites / store
  groups / store views the backend actually has, plus a `resolution` verdict of
  `ok` / `missing` / `not-configured` for each scope code the project is configured
  for — the read that lets an agent see a project pointing at a website or store
  view that does not exist; PaaS uses the project's saved admin credentials, ACCS
  proxies through a configured discovery service and prompts Adobe sign-in ONLY
  when the read reports it needs a token).
- Actions: `regenerate_ai_files`, `start_demo`, `stop_demo`, `restart_demo` (owns the
  settle delay between the stop and the start, which calling the two in sequence does
  not), `set_current_project` (the pointer every project-scoped tool acts on — note this
  is NOT `select_project`, which picks an Adobe Console project; `forceNewWindow` is
  FORCED off via `argDefaults`, since that gesture opens a second VS Code window and
  leaves the current one on the projects list), `set_project_pinned`, `rename_project`
  (current-project rename via the shared `renameProjectCore` — folder, saved
  state, and the project's baked MCP/AI configs move together; agents must use
  this instead of shell `mv`, which strands the extension's paths),
  `add_integration` (add one App Builder integration to the current project by catalog
  id OR custom GitHub source — clone, subscribe its Adobe APIs, build, deploy, register
  on the dashboard; returns `{added: {id, name, kind}}`, and the id is what
  `deploy_integration` / `remove_integration` take. A component whose `envSchema`
  declares user-supplied vars is refused with a `needsUser` handoff pointing at
  Configure Project — the tool's `preflight` answers before dispatch, so the panel the
  webview path opens never opens for an agent's call),
  `deploy_integration` / `redeploy_integration` (deploy one App Builder integration
  by id — idempotent, guard-chained, org-context-targeted; the API Mesh has its own
  `deploy_mesh` / `check_mesh` / `delete_mesh`), `remove_integration` (confirm-gated — remote
  undeploy + local cleanup + storefront republish),
  `rename_integration` (DISPLAY NAME only — the id, folder and Runtime package are
  immutable; local metadata write, nothing redeploys; pre-built catalog entries and the
  mesh are rejected. `name` is REQUIRED in the schema, and that is a headless-safety
  guard rather than a convenience: the handler falls through to
  `vscode.window.showInputBox` when the payload carries none),
  `set_console_apis` (confirm-gated — sets the optional extras to EXACTLY the given
  list, so anything dropped is UNSUBSCRIBED from the live workspace credential; pass
  `componentId` to edit one integration's picks instead of the union. `add_console_apis`
  is the add-only, ungated sibling),
  `set_project_destination` (repoint the project at another Adobe Console
  project + workspace and MOVE every integration there — each redeploys under the new
  target, the old deployments are left running. The org is NOT taken from the payload;
  sign-in owns org selection. Create the target first with `create_adobe_project` /
  `create_adobe_workspace`. Ungated: the move only ever deploys and is undone by setting
  the destination back), `deploy_mesh` (deploy or redeploy
  the current project's API Mesh — same guard chain and org targeting as the dashboard
  Deploy button, sharing the UI-free `deployMeshHeadless` core; persists the mesh
  endpoint), `refresh_block_library` (EDS-only — destructive rebuild of the DA.live
  authoring block library from the project's `component-definition.json`, sharing the
  UI-free `refreshBlockLibraryHeadless` core with the dashboard kebab; returns the
  rebuilt library paths), `export_project_settings` (write the project's settings
  JSON to a path-validated file inside the project dir via
  `exportProjectSettingsToFile` — the dialog-free sibling of the UI `exportProject`
  save-dialog action; **secrets go to the FILE only**, the response returns just
  `{ path, includesSecrets }`, never secret values; `includeSecrets` defaults to
  true), `save_ai_prompt`, `delete_ai_prompt`,
  `delete_mesh`, `add_console_apis` (runtime API
  subscription on the demo workspace credential — reuses `apiSubscriber` under
  the auth → org-mismatch → developer-role guard chain; added codes persist in
  `Project.additionalConsoleApis` and ride every later reconcile union, since
  the Console subscribe PUTs the full list).

### Project lifecycle
| Tool | File | Notes |
|---|---|---|
| `create_project` | `createProjectTool.ts` | Full wizard pipeline, headless. |
| `get_current_project` | `currentProjectTool.ts` | Resolve the active project (persisted current-project pointer); returns `{ name, path }` or `null`. |
| `delete_project` | `deleteProjectTool.ts` | **Irreversible** — needs `confirm:true` + `confirmName` echo. Local only. |
| `reset_eds_project` | `edsResetTool.ts` | Reset storefront to template; captured progress timeline. The confirm-gate refusal and every result name the project (`project`), so an agent can catch a wrong current-project pointer before confirming. |
| `apply_updates` | `applyUpdatesTool.ts` | Check (no confirm) / apply (`confirm:true`) across all update categories. |

### Commerce connection — `commerceEndpointsTool.ts`
| Tool | File | Notes |
|---|---|---|
| `get_commerce_endpoints` | `commerceEndpointsTool.ts` | Where to send a Commerce query and what to send with it: the backend's GraphQL endpoint, Catalog Service, the deployed mesh, the `Magento-*` request headers, and the store scope they select. |

**Why it exists.** A survey of 48 sessions run inside demo projects (2026-08-25)
found 77% of all tool calls answering four orientation questions, while the one
long session of real Commerce work issued **28 `curl`s at the GraphQL endpoint
with the headers typed by hand**. It had to: `get_project_urls` returns places a
BROWSER can open, `get_project_status` returns the mesh endpoint only, and
`accsGraphqlEndpoint` appears on the surface exclusively as an INPUT
`discover_store_structure` expects the caller to already know. The value was
reachable only by asking `get_component_config` to read a `.env` by relative
path — a file read, not an answer.

**It returns the headers, not just the URL.** A Catalog Service query against the
wrong store scope comes back empty *with no error*, which is the "why is phones
empty?" the same session spent turns on. The headers come from
`generateHeaders` — the function that writes the storefront's own `config.json` —
so an agent and the site it is debugging cannot be querying two different stores.

**Both endpoints, separately.** `extractConfigParamsFromConfigs` collapses them
(`meshEndpoint || config[endpointKey]`), which is right for generating
`config.json` and wrong for an agent: *"if a partner integrates with or without a
mesh, what endpoints do they need?"* needs both, plus `storefrontUses` saying
which one the site itself queries. The mesh value comes from `getMeshEndpoint`,
the same accessor `get_project_status` reports through.

**No secrets.** The registry marks confidential values `secret: true`; exactly two
keys carry it (`ACCS_OAUTH_CLIENT_SECRET`, `ADOBE_COMMERCE_ADMIN_PASSWORD`) and
neither is read by the resolvers behind this tool — asserted by a test, not
assumed. A PaaS project's headers do carry `x-api-key`
(`ADOBE_CATALOG_API_KEY`, `type: text`), deliberately: the same value ships in
`config.json` to every browser that loads the storefront, and withholding it
would break every PaaS Catalog Service call while protecting nothing.

### Cloud resources & storefront content
| Tool | File | Notes |
|---|---|---|
| `delete_github_repo` | `cloudResourceTools.ts` | Destructive; confirm-gated. |
| `cleanup_dalive_site` | `cloudResourceTools.ts` | Destructive; confirm-gated. |
| `republish` | `storefrontTools.ts` | Regenerate + push storefront config. |
| `sync_content` | `storefrontTools.ts` | Full content publish (config + code + DA.live pages). |

Both carry `cdnStatus` beside the `cdnVerified` boolean — one sentence, true for
that call, from `describeCdnPropagation` in `configSyncService.ts`. We already
poll the live CDN after every publish; until this the answer only reached the
debug log, so a caller looking at an unchanged site could not tell "not served
yet" from "my work is gone". The wait it quotes is derived from the polling
constants (`CDN_VERIFY_BUDGET_SECONDS`), never written by hand.

### Content authoring — `contentAuthoringTools.ts`

Page-level authoring against the CURRENT project's storefront. Before these, an
agent could list and destroy DA.live sites but could not write a page to one.

| Tool | Notes |
|---|---|
| `read_page` | Reads DA.live source HTML. Delegates to `DaLiveSourceOperations.readSource`, which sits beside the `sourceExists` GET that already hit this endpoint — what was new is reading the BODY, not reaching the URL. |
| `write_page` | Writes source; `publish:true` previews+publishes in the same call. |
| `publish_page` | Preview + publish an existing page. |
| `list_content` | Directory listing, projected to web paths with a page/file/folder type. |
| `delete_page` | Unpublish + delete. Destructive; confirm-gated. |
| `read_published_page` | Fetches `.plain.html` off the CDN — the verification primitive. |

**One page, three path spellings.** This is what the tools are for; raw transport
would move the trap to the caller rather than remove it:

| Surface | Spelling | Why |
|---|---|---|
| DA source API | `about.html` | extension REQUIRED for files (DA Admin API) |
| Helix preview/publish | `/about` | `normalizeWebPath` never strips `.html`, so the suffixed form publishes the wrong path |
| `da.live/canvas` | `about` | extensionless, or the path double-appends to `index.html.html` |

Every tool takes ONE canonical web path; the three that need a source path derive
it via `resolveDaPath`, and `read_published_page` builds its CDN URL with
`buildSourceUrl` + `aemLiveBaseUrl` — the same helpers the content-copy pipeline
and storefront probe use, so none of them can drift apart.

**No `org`/`site` arguments.** All six target the current project. An override
would let an agent write into, and unpublish from, any DA.live site the user's
token reaches, with no confirmation on the non-destructive paths;
`list_dalive_sites` already covers cross-site reads.

**That control lives or dies on the path.** Omitting `org`/`site` means nothing if
`path` can walk out of the site: the URL parser collapses `..`, so
`/source/{org}/{site}/../../victim/site/index.html` resolves to
`/source/victim/site/index.html` and is sent with the user's DA.live bearer —
reaching Helix preview/publish and the unpublish DELETE the same way, since
`normalizeWebPath` also leaves `..` intact. Paths are therefore **rejected, not
normalized**: no `.`/`..` segments, no scheme, no protocol-relative prefix, no
backslashes, no control characters, and percent-encoded traversal is decoded
before the check. The storefront coordinates are validated too (must start
alphanumeric), because `githubRepo: "../../x/y"` otherwise puts the traversal
back via the metadata. Both are covered by tests named for the escape they
block.

**Auth: the DA.live token, not the Adobe one.** Two IMS tokens can reach DA.live
— `DaLiveAuthService`'s (its own sign-in and storage, used by the production
content path) and the extension's Adobe token (used for org-level reads like
`list_dalive_sites`). Content operations need the former; picking wrong fails as
a 401 at runtime, not a type error. Preview/publish also sends
`x-auth-token: <github>`, so those paths pre-flight both credentials.

`delete_page` unpublishes **before** deleting the source, and **aborts if the
unpublish fails** — only that order fails recoverably. Deleting first and then
failing to unpublish leaves a live page whose content is gone.

This is a failure-mode argument, not an auth one. An earlier version of this
section cited ADR-002's `delete not allowed while source exists` 403; that reads
the ADR backwards. The 403 fires while the source EXISTS, and `unpublishPage`
sends the DA.live Bearer that ADR-002 measured as bypassing the restriction
entirely. Auth is indifferent to the order.

### View — `viewTools.ts`
`open_view` — surface a specific VS Code view/screen for the user.

`reload_window` — restart the VS Code window so the extension host picks up a
newly compiled bundle. Confirm-gated and `destructiveHint: true`: it discards
in-flight work in that window and drops the MCP socket.

**It answers before it reloads.** `workbench.action.reloadWindow` restarts the
host serving the call, so the response is written first and the command deferred
by `RELOAD_DEFER_MS`. Without that the caller gets a dropped socket, which is
indistinguishable from a crash. The response says the socket will drop and names
`probe.mjs info` as the readiness check — whose build stamp is also how you
confirm the new bundle is the one now serving.

Exists because the fix-measure loop otherwise stalls: extension-host code cannot
be measured until the host restarts, and nothing outside the editor could do it.
Corrects a claim in the `mcp-live-probe` skill that only F5 can — `reloadWindow`
reloads the window including the extension host, which is exactly how
`extensionUpdater.ts` applies a new extension version.

### Lifecycle — `lifecycleTools.ts`

| Tool | Notes |
|---|---|
| `open_url` | Opens one of the CURRENT project's URLs in the browser. **Takes a TARGET, never a URL** — `storefront` / `liveSite` / `daLive` / `commerceAdmin` / `devConsole` — so the reachable destinations are exactly the set `get_project_urls` reports, and an agent cannot point the user's browser somewhere nobody asked for. Resolves through the same `getProjectUrls` handler that read uses, so a target cannot mean two things. Confirm-gated, like `open_view`. A target the project has no URL for is refused with the list of ones it does. |
| `edit_project` | **Always a `needsUser` handoff; it never dispatches.** `handleEditProject` opens the creation wizard, which is a multi-step human surface — an agent calling it would make a panel appear for a request the user did not make and report success for it. The handoff points at the wizard AND at `configure_project`, which covers env vars, store scope, block libraries, addons and the datapack without it. Ungated: it opens nothing. |

Both take their vscode dependency by injection from `extension.ts` (a command
runner, a URL opener), so neither module imports vscode.

### Storefront site — `siteTools.ts`

Who administers a storefront's Configuration Service entry, and the repair for a
registration that was refused. **None of these is a descriptor row.** The
services behind them take `(project, vscode.ExtensionContext, logger)` rather
than being `MessageHandler`s in a handler map, so they are reached through a
`HandlerContext`'s own fields. Being UI-free is what makes a service usable from
a tool; it is not what makes it dispatchable, and the two were conflated when
this group was first estimated.

| Tool | Notes |
|---|---|
| `get_site_access` | Who holds the admin role on the project's site config, plus a PROBED `canManage` (the grant endpoint sits behind the same `[admin]` gate as the read, so an identity without the role cannot add anyone — including itself). Returns real addresses, deliberately: the use of the tool is naming who can grant a role, and a masked address can neither be relayed nor passed to `set_site_admin`. Not the `get_project` secret case — an address is not a credential, and the masking in the codebase exists for the diagnostics report, which is written to be pasted into tickets. |
| `set_site_admin` | Grant (`admin:true`) or revoke (`admin:false`). Confirm-gated: it changes access for another person on a shared site. Every mutation is confirmed by a RE-READ, so `verified` is separate from `status` — a 2xx write and a landed role are different claims. The last-admin refusal comes from `revokeSiteAdmin` and passes through: a site with no admin cannot be granted one back from inside the app. |
| `repair_site_configuration` | Re-runs the registration that failed. Confirm-gated: the write re-mints the site's publish key and can drop admin grants nothing in the app can restore (reported as `lostGrants`, masked). **Does NOT publish** — that separation is `repairSiteConfigHeadless`'s own, and this surface is its reason: registration writes a routing rule, and making it take effect would republish a demo out from under whoever is presenting. On `repaired` the result carries `nextStep: 'republish'` rather than reading as done. |
| `connect_dalive` | **Always a `needsUser` handoff.** The credential comes from a bookmarklet run in the user's own browser, onto their clipboard; there is no argument this tool could take that would not be a secret travelling as a tool argument. Points at `demoBuilder.openDaLiveBookmarkletSetup`, resumes with `get_auth_status`. Ungated: it opens and changes nothing. |
| `find_storefront_name_mismatches` | Projects whose DA.live site name does not match their GitHub repo name — a legacy defect in storefronts created before `164fd251`. Read-only, and explicitly `persistAfterLoad: false`, because a scan that rewrote every manifest it inspected would be a write hiding in a read. Paged at `AGENT_PAGE_SIZE` with the true `total` beside it, even though a legacy list is small today. |
| `migrate_storefront_name` | Migrates ONE project. **Irreversible** (deletes the old DA.live site root) → `confirm:true` AND `confirmName` equal to the PROJECT name, which is what the find tool reports first and what a user recognises. Reports `publishKeyRenewed` explicitly: the re-register destroys the site's publish key and a migrated storefront that cannot publish is invisible until someone tries. A project that needs no migration answers `{migrated: false, reason}` rather than an error, so an agent looping the find list can tell a no-op from a failure. |

**Why the migration is a pair rather than one bulk tool.** The `Migrate Storefront
Names` command sweeps every project behind one modal. That shape cannot carry the
name echo an irreversible action requires — there is no single name to echo — and
it would hand an agent one call that deletes N DA.live site roots. So the sweep is
a read and the migration addresses one project at a time. The per-project
sequence (migrate → persist → re-mint the publish key) lives in
`storefrontNameMigrationForProject`, shared with the command: the persist and the
re-mint are steps a second implementation would plausibly omit, and neither
announces its absence.

The dependency assembly `repair_site_configuration` needs lives in
`repairSiteConfigForProject` (`features/eds/services/`), shared with the
`Repair Site Configuration` command — which adds only the progress notification,
the one part an agent must not get. It was extracted before the tool was written
precisely so there would not be two assemblies, because the piece that drifts
fails silently: the demo package's own `byomOverlayUrl` is the fallback when the
VS Code setting is blank, and without it the site registers with NO overlay while
the read-back still reports `verified`.

### Prerequisites & settings — Group 7

| Tool | Notes |
|---|---|
| `install_prerequisite` | Descriptor row over `install-prerequisite`, addressed by the prerequisite's OWN id — never the numeric index. That index is a position in a list rebuilt per check and looked up in `sharedState`, which the headless context recreates on every call, so an index-addressed install could only ever fail. `check_prerequisites` now reports `prereqId` beside it for this call. Confirm-gated: it runs package managers (fnm, npm, brew) and can take minutes. A prerequisite that can only be installed by hand answers `{manual, url}` **and does not open a browser** when there is no panel — `vscode.env.openExternal` still fires for the wizard, which is a person who just clicked Install. |
| `get_settings` | The 21 `demoBuilder.*` keys and their values. Two are functional gates rather than preferences — the Data Installer surface does not exist without `dataInstaller.enabled` + `apiBaseUrl` — so "the feature is missing" and "the feature is off" are finally distinguishable. Unset keys come back as `null`, not omitted: `JSON.stringify` drops `undefined`, which silently shortened the answer. `dataInstaller.apiBaseUrl` reports `{configured}` rather than its value, because `package.json` withholds a default on the grounds that this repository is public. |
| `set_setting` | **Handoff.** A tool could call `.update()`; it should not. Several keys are `machine` scoped, and a value changed silently by an agent is indistinguishable from one the user chose. Refuses any key outside the Demo Builder set, so it cannot be used to instruct a user to change arbitrary VS Code settings under this extension's name. |

### Data Installer writes — Group 8, `dataInstallerDescriptors.ts`

Six data-installer READS were exposed and optimised in phase 2; zero writes were.
These are descriptor rows, not adapters: `importHandlers`/`exportHandlers` are
ordinary handlers over a `HandlerContext` and contain no `vscode.window`
reference (checked with a control).

| Tool | Notes |
|---|---|
| `validate_datapack_import` | The dry run — same guard, same credentials, same request body as a real start, without writing. **Deliberately ungated**: gating it would push an agent toward the real import to find out whether a request is well-formed. |
| `start_datapack_import` | Confirm-gated. Returns `{activationId}` as soon as the job starts. |
| `reset_datapack` | Confirm-gated **twice** — the handler has always required `confirm:true` in its payload, and the row's gate refuses before dispatch. The same flag satisfies both, so they agree rather than compete; remove either and the other still holds. |
| `get_datapack_import_status` | Polls the persisted `ImportJobRecord`. The long-running problem was already solved: `runAndWatch` validates, starts, persists, fires the watcher with `void`, and returns a handle. The watcher's `onProgress` pushes to the webview (a no-op headless) but the authoritative record goes to `TransientStateManager`, which this reads — so polling works with no webview and no handler needed changing. |
| `list_datapack_export_items` | Paged at `AGENT_PAGE_SIZE`. `listExportItems` asks the service for `page_size: 1000` and returns what comes back — phase 2's 25KB finding, and worse here because the caller is CHOOSING from the list. `totalCount`/`excludedCount` are passed through verbatim, never recomputed from the page. |
| `start_datapack_export` | Confirm **and** a `confirmName` echo, checked before dispatch. An export writes into the datapack catalog other teams depend on; a confirm alone is the bar for your own project. |
| `get_datapack_import_target` · `list_datapack_import_scopes` | Reads. An empty scope list is normal, not an error — it means the import lands on the default. `get_datapack_import_target` also reports the website/store-view scope the project recorded, which is what the import modal seeds its pickers from. |

**Scope defaults to the PROJECT's, not the service's.** `websiteCode`/`storeCode`
are optional on the three write rows, and omitting them used to mean the service
applied its own `base`/`default` — so an agent that skipped
`list_datapack_import_scopes` could import, and **reset**, against a website
nobody chose. The handler now falls back to the pair the project recorded (the
same `resolveInstallTarget` the build path uses). Send both to override, or
neither to inherit; half a pair is refused rather than completed, because filling
in the other half would silently change what the call asked for.
| ⛔ `provision_accs_credentials` | **Not exposed, by its own handler's instruction:** "Panel-only by construction (never in the MCP maps): it creates a credential in the user's Console workspace." Its bare `{success: true}` is deliberate for the same reason — the response never carries the values. |

**Not built, with reasons.** `migrate_storefront_names` (plural, the bulk sweep) is
deliberately absent — see the pair above. `github_change_account` is BLOCKED, not deferred —
`HandoffTarget` accepts a view or a command id and no Demo Builder command exists
for switching GitHub accounts (checked against `package.json`). It needs a design
decision, not an implementation. The bulk `cleanup_dalive_sites` /
`manage_github_repos` are deliberately absent: `list_github_repos` +
`delete_github_repo` and `list_dalive_sites` + `cleanup_dalive_site` already give
an agent the capability, looping is what an agent is good at, and neither bulk
command has a headless core — so building one would mean a second implementation
of a destructive path.

---

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
`add_integration`, `deploy_integration`, `redeploy_integration`), lifecycle (`start_demo`,
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
- **Bounded responses.** `get_block_source` caps at 50 files / 30 KB each, since
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
  long values elided; the keys-only rule remains for logging.
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

### The dry run (Evaluation Mode, 2026-08-25)

`demoBuilder.ai.dryRun` (default OFF, read live per call, injected as `dryRun`
from `dryRunMode.ts`) makes agent mutation **impossible** rather than
discouraged. While it is on, every tool that is not read-shaped is stopped in
`withToolLogging` before its handler and answers what it WOULD have done:
`{dryRun: true, wouldRun: <tool>, argumentKeys: [...]}` — argument KEYS only,
never values, the same rule the logger follows because args carry secrets.

Four things about it are load-bearing:

- **It is DATA, not an error.** An error teaches an agent to retry; data teaches
  it what would happen, so the rest of the path it would have taken still gets
  measured. Same rule the datapack dry run already states.
- **It runs BEFORE consent.** A call carrying `confirm: true` is stopped by the
  dry run and raises no dialog — asking someone to approve something that will
  not happen is worse than not asking.
- **Reads pass through untouched.** A dry run that also blinds the agent
  measures a path nobody would take.
- **It classifies by the tool's own DECLARATION**, not by its name. Every tool
  carries MCP's `annotations.readOnlyHint` (descriptor rows spell it
  `readOnly`, which `ToolDescriptor` makes required, so the compiler asks).
  Missing means "assume it writes". `toolAnnotations.test.ts` covers both
  registration paths — the compiler for the 46 descriptor rows, a source scan
  for the 57 direct ones.

  It was a regex over names until 2026-08-25. A name cannot express "called
  `check_` and writes anyway", which is why `check_github_app`'s guard had to be
  found by a hand audit. The regex survives only as a cross-check: a declaration
  that disagrees with the name must be listed as deliberate, and four already
  are — `select_org`/`select_project`/`select_workspace` (in-memory session
  targeting) and `set_setting` (hands back to the user). Under the old rule all
  four were blocked during an evaluation for no reason, which made the trace lie
  about the path an agent normally takes.

  Annotations also travel to the client in `tools/list`, so Claude Code learns
  which of our tools are safe instead of guessing the same way we were.

**The audit behind that trust (2026-08-25).** All 43 read-shaped tools of the 103
were read, handler by handler, following each into its service. One genuine
write-in-a-read exists: `check_github_app`, whose handler triggers a Helix code
sync (`POST /code/{owner}/{repo}/main/*`) on a 404 — so an agent enumerating
checks would fire a sync at every repo it asked about. It is neutralised by
`argDefaults: { skipTrigger: true }`, which `runHandler` applies LAST
(`{...args, ...argDefaults}`) so a caller cannot send the flag that turns the
read back into a write; a test now pins that line. Everything else reads. Three
tools have side effects that are not project or cloud changes and are therefore
allowed under the dry run, named here so nobody rediscovers them as bugs:
`check_mesh` writes and deletes a temp workspace config under the extension's own
global storage; `get_auth_status` (and anything calling `isAuthenticated`) writes
an in-memory auth cache; `check_prerequisites` spawns detection processes but
installs nothing.

### `evaluate_prompt` — REMOVED 2026-08-26

The tool spawned a headless `claude -p` run with the dry run forced and answered
a summary of what a prompt would cost. It left with the prompt-evaluation
surface (AI-3b); the code is on `feature/prompt-workbench`.

The **agent dry run stayed**, and is a different thing: a standing switch that
lets an agent read while every write is simulated, enforced in
`inExtensionMcpServer` before any non-read tool runs. It never depended on the
workbench.

While the mode is on it is pinned to the status bar in the warning colour
(**Agent dry run**), because a mode you cannot see is a trap: the user would ask
for a deploy, be told "done" by an agent reading the synthetic result, and
believe it. `demoBuilder.toggleAgentDryRun` flips it; `get_settings` exposes the
key read-only so an agent can confirm why its deploy was simulated.

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
| `src/features/ai/server/mcpSocketPath.ts` | Deterministic socket path from the projects root (`vscode`-free). |
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
