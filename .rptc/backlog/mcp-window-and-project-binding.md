# MCP: which window serves, and which project it acts on

**Filed:** 2026-08-14, from a `/rptc:research` pass on MCP scoping.
**Status:** race 2 FIXED on the agent surface (2026-08-16). Race 1 is reproduced
and still open — the remedy needs a decision.

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

## Reproduction status (updated 2026-08-16)

**Race 1 — which window serves: REPRODUCED.** Two probes of the SAME socket
path, two minutes apart, returned different tool sets:

```
15:42  tools/list → 52 tools, 0 datapack tools   (develop baseline host)
15:44  socket file rebound (mtime 15:44)
15:44  tools/list → 58 tools, 6 datapack tools   (a host with feature/data-installer)
```

The six that appeared were the Data Installer reads, so the second host was
identifiably a different build. Method was a minimal newline-delimited JSON-RPC
client over the UDS (`initialize` → `notifications/initialized` → `tools/list`),
the same shape `mcpToolProbe` uses — no SDK. Measured by the Bodea/AI-surface
session, not in this repo's test suite.

This confirms the mechanism above exactly as written: one socket name, last
writer wins, no conflict logged.

**Race 2 — which project the serving window thinks is current: FIXED on the
agent surface, 2026-08-16.** Never reproduced live, and deliberately fixed
without reproducing: the chain is true by construction (verified — the path
comes from in-memory state at `stateManager.ts:172-180`, `saveProject` updates
memory and disk at `:208-209`, the MCP context shares the window's instance at
`headlessHandlerContext.ts`, and `reload()` had zero callers, confirmed with a
control), and the user confirmed running multiple hosts with different
selections **often**, which was the only unknown.

`StateManager.readCurrentProjectFromDisk()` reads the pointer from
`state.json` and loads that project, touching neither `this.state` nor
`_onProjectChanged`. `createHeadlessHandlerContext` wraps the window's state
manager so `getCurrentProject()` routes there; everything else delegates
unchanged.

**Extended to the whole extension later the same day**, at the user's request —
the agent-surface-only wrapper was removed rather than kept alongside, so there
is ONE mechanism. `getCurrentProject()` now takes the project PATH from
`state.json` and the DATA from that project's manifest, falling back to the
in-memory path when disk has no pointer (a project can be held in memory and
never persisted). `saveState()` was switched to `writeFileAtomic` in the same
change: the file is now read on every call from every window, and a plain
`writeFile` leaves a window where a concurrent reader sees a truncated file —
which the reader would treat as "no pointer" and answer with the wrong project.

It turned out not to be a cross-window-only bug. `loadProjectFromPath` with
`persistAfterLoad: false` assigns `state.currentProject`, and the home-screen
kebab calls it with whatever project the row belongs to
(`projects-dashboard/handlers/dashboardHandlers.ts`, ~10 sites) — so pinning or
renaming an unrelated project reassigned the window's in-memory pointer. Reading
the pointer from disk fixes that too, and makes the read self-healing: in-memory
converges on the next call.

Still open:

- `reload()` STILL has no callers. It fires `_onProjectChanged`, which has **zero
  real subscribers** — the only match in `src/` is a doc-comment example in
  `disposableStore.ts`. So the UI is entirely pull-based: nothing pushes a
  repaint, and a window updates on its next read. If you want a live repaint
  rather than read-triggered convergence, that needs a subscriber first, and
  `reload()` is the natural trigger. Otherwise delete it — `dead-code-scan` will
  keep flagging it.

### What the reproduction added

The switch is **silent and leaves no trace in the response**. The host was
identifiable only because one build happened to have datapack tools and the
other did not; on two hosts of the same branch it would have been undetectable.

Partly mitigated 2026-08-16: `serverInfo.version` now carries the build stamp
(branch@commit, build time, checkout path) instead of a hardcoded `'1.0.0'`
(`inExtensionMcpServer.ts`, `InExtensionMcpServerOptions.buildLabel`; supplied
from `extension.ts` via the existing `dist/build-info.json`). Every MCP client
already displays that field, so ambiguity is now visible rather than invisible.
**This is not a fix** — the binding race is unchanged and the options below all
still stand. It only means the next person chasing this can tell which host
answered.

## Options (decision needed — do not just pick one)

1. ~~**Make the pointer authoritative per read.**~~ **DONE, extension-wide**
   (2026-08-16) — `getCurrentProject()` reads the pointer from `state.json`; see
   Reproduction status. The watcher variant was not needed: `_onProjectChanged`
   has no subscribers, so the UI is pull-based and converges on its next read.
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
- **`verify_ai_setup` is NOT giving a false all-clear** — checked and cleared
  2026-08-16, do not re-investigate. It reports `demo-builder status=ok` on a
  project whose `.mcp.json` points at a nonexistent proxy path, which looks
  wrong. It is deliberate: `mcpInspector.ts:163-175` short-circuits the spawn and
  probes the socket directly when `DEMO_BUILDER_MCP_SOCKET` is set, because
  spawning the proxy loops back into the same process and starved the 15s budget.
  Proxy presence is covered separately by the `mcp-binary` check, and tier 1 of
  the activation sweep repairs machine paths.

## Related, and stale

`2026-05-30-decouple-project-from-workspace.md` sub-item 2 ("per-project MCP
socket lifecycle") is adjacent, but that item's headline premise — that picking a
project triggers a workspace switch and "the extension resets" — **shipped fixed
on 2026-06-02** (`fe81cbb6` in-place render, `b96cc086` always-root home Chat).
Re-scope or archive it; do not pick it up as written.

## Kickoff prompt

> Race 2 is FIXED on the agent surface and race 1 is reproduced — do not redo
> either; both are recorded in the Reproduction status section. What remains is
> race 1's remedy: two windows still bind one socket name, last writer wins, and
> a client still cannot choose which host it reaches. `serverInfo.version` now
> names the host that answered, so start by confirming which window serves.
> Options 2 and 3 below are the live ones; option 1 is done for the MCP path and
> open for the UI. Read
> `.rptc/backlog/mcp-window-and-project-binding.md` — the mechanisms are measured
> and cited; bring a recommendation to the user rather than picking one.
