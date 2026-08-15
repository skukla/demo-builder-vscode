# MCP: which window serves, and which project it acts on

**Filed:** 2026-08-14, from a `/rptc:research` pass on MCP scoping.
**Status:** ready — the defect is measured; the remedy needs a decision.

## The question that started it

"We want global non-project access, but we also scope to a project when one is
selected, right?" Yes to both — and the two are wired through mechanisms that
each resolve **last-writer-wins**, independently of one another.

## Two races, and they are not the same race

**1. Which window serves.** The socket name is `sha256(path)` of the PROJECTS
ROOT (`mcpSocketPath.ts:44-51,71-83`) — the same value in every window, because
every window computes the same root and re-homes to it. Each window binds a
pid-private name then `rename`s over the shared one
(`inExtensionMcpServer.ts:150,178`), so there is no `EADDRINUSE`: the last window
to bind silently owns the name and the previous listener keeps running with no
filesystem name. `dispose()` deliberately never unlinks (`:253-260`). Nothing
logs a conflict — both windows print `[MCP] in-extension server listening on …`.

**2. Which project the serving window thinks is current.** `StateManager` loads
`~/.demo-builder/state.json` exactly once, at `initialize()`
(`stateManager.ts:65-76`); `reload()` exists (`:321-322`) but nothing on this
path calls it, and there is **no watcher on the state file** (verified: the only
two references to `state.json` in `src/` are the path constant at `:50` and a
comment at `:141`; a positive control confirms `createFileSystemWatcher` is used
elsewhere in `src`, so the absence is real).

`getCurrentProject()` (`:172-180`) re-reads the project MANIFEST from disk — so
the project's *contents* stay fresh — but the *path* comes from the in-memory
state loaded at startup. Fresh data about possibly the wrong project.

## The failure

Window A and window B both open. B started later, so B owns the socket. The user
works in A and selects project X — `handleSelectProject` writes the pointer
(`dashboardHandlers.ts:199-201`). **B never re-reads it.** An MCP client reaches
B, and every pointer-based tool acts on whatever B loaded at ITS startup.

`get_current_project` will confidently report the wrong project, which is exactly
the tool the home `AGENTS.md` tells agents to call before asking the user.

## Why it matters more than it looks

Project targeting splits cleanly, and only one half is safe:

| Tool group | Resolution | Exposure |
|---|---|---|
| Shared file-based tools (`get_project`, `sync_storefront`, `list_blocks`, …) | explicit `projectName` arg (`mcp-server.ts:1013`) | **safe** — the agent names it |
| `delete_project` | explicit `name` + `confirm` + `confirmName` (`deleteProjectTool.ts:33-40`) | **safe** — misname is a refusal |
| Everything descriptor-driven + `reset_eds_project`, `apply_updates`, storefront tools | `getCurrentProject()` pointer, `inputSchema: {}` | **exposed** |

`reset_eds_project` is the sharp one: `confirm:true` and nothing else
(`edsResetTool.ts:55-70`), then the pointer. It rewrites the storefront repo AND
DA.live content to the template. An agent that says "yes, reset it" resets
whichever project the serving window happens to hold.

NOT reproduced live — the preconditions (two windows, B bound later, selection
made in A) are stated from code, not from a run. Reproducing it is step 1.

## Options (decision needed — do not just pick one)

1. **Make the pointer authoritative per read.** Watch `state.json`, or have the
   headless MCP context read it fresh rather than trusting in-memory state. Small,
   and it fixes the wrong-project half without touching the socket model.
2. **Make the serving window explicit.** Refuse the second bind instead of
   renaming over it, or include window identity in the socket name and have
   discovery report ambiguity. Bigger, and it changes multi-window behaviour.
3. **Close the exposure at the tool boundary.** Give destructive pointer-based
   tools the `delete_project` treatment — an explicit project name the caller must
   state and the server must match. Narrowest blast-radius fix; does not address
   `get_current_project` lying.
4. Some combination — (1) and (3) are complementary and neither blocks the other.

## Also established (do not re-derive)

- The per-project `.mcp.json` does NOT scope to that project: it pins
  `DEMO_BUILDER_MCP_SOCKET` to the **projects-root** socket
  (`mcpConfigWriter.ts:318-323`, deliberate — keying to `project.path` produced
  "demo-builder: timed out"). All projects' configs plus the home pair carry one
  identical path. Project scope has never come from the socket.
- The global entry omits the env on purpose (`globalMcpRegistration.ts:66-71`) so
  the proxy discovers a live window; discovery is newest-mtime-first
  (`mcpSocketDiscovery.ts:70-91,127-136`).
- cwd never selects a PROJECT — only a SERVER, once, in the proxy
  (`mcp-proxy.ts:175`).
- A window can inspect another window's server and report its inventory as its
  own (`mcpInspector.ts:171`); diagnostics reports the socket this window *would*
  bind, not whether it owns it (`diagnostics.ts:235`).

## Related, and stale

`2026-05-30-decouple-project-from-workspace.md` sub-item 2 ("per-project MCP
socket lifecycle") is adjacent, but that item's headline premise — that picking a
project triggers a workspace switch and "the extension resets" — **shipped fixed
on 2026-06-02** (`fe81cbb6` in-place render, `b96cc086` always-root home Chat).
Re-scope or archive it; do not pick it up as written.

## Kickoff prompt

> Reproduce first: open two extension windows, select different projects in each,
> then call `get_current_project` through a globally-registered MCP client and
> check which project answers. Read
> `.rptc/backlog/mcp-window-and-project-binding.md` — the mechanisms are measured
> and cited; the options are not yet decided, so bring the reproduction to the
> user before choosing one.
