# Workspace-independent entry point for global MCP operations

**Status:** Deferred (filed during the in-extension MCP migration / develop merge)
**Context:** PR — "In-extension MCP server: full agent tool surface + retire standalone"

## Background

The MCP migration moved the server into the extension host (per-workspace Unix
socket, reached via `dist/mcp-proxy.js`) and retired the standalone
`dist/mcp-server.js`. As part of that, **global MCP registration was dropped**:
discovery is now per-project `.mcp.json` only. During the develop merge we also
removed develop's "Register Global MCP" button because it registered the retired
standalone binary.

## The gap

The full tool surface is reachable from inside any open project (and from there
an agent can already list/create/manage *other* projects). The one awkward case
is invoking a genuinely global op — `create_project`, `list_projects` — when the
user is **not inside a project workspace** (brand-new user, or `claude` from an
arbitrary directory). There's no socket to connect to, because the in-extension
server is per-workspace and only runs while VS Code has a project open.

## Proposed work

1. **Proxy discovery mode.** When `DEMO_BUILDER_MCP_SOCKET` is unset (global
   invocation, arbitrary cwd), have `mcp-proxy.js` enumerate live sockets in
   `/tmp/demo-builder-mcp/` and connect to a running extension window — or exit
   cleanly with a "open Demo Builder in VS Code first" message.
2. **Global `~/.claude.json` entry pointing at the proxy** (NOT the retired
   `mcp-server.js`), relying on the discovery mode above.
3. **Re-home develop's "Register Global MCP" affordance** to write that entry, so
   the feature returns correctly adapted to the new architecture.
4. **Multi-window tiebreak.** Decide behavior when two VS Code windows are open
   (most-recently-active, or prompt).

## Open questions

- Is the "global ops without an open project" case common enough to warrant this,
  given the projects-dashboard view can be the bootstrap entry instead?
- Multi-window semantics and the UX when no window is running.

## Why deferred

This is a design decision (discovery semantics, multi-window behavior), not a
mechanical change — it was intentionally kept out of the migration PR so that PR
stays coherent (everything points at the proxy; nothing points at a dead binary).
