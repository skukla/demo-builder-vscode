# Step 05 — Scope the dry run to the run that asked for it

**Ships:** an evaluation stops changing what the user is doing everywhere else.
**Depends on:** steps 01–04 (shipped).
**Why first:** it is a LIVE hazard. The feature is on the branch already, and
this is the only item on the list that can currently mislead someone.

## The hazard, stated plainly

While an evaluation runs, the **whole window** is in dry run for up to two
minutes. If the producer is working in another chat at the same time, their
changes are silently simulated — and the message the agent receives says only
"Dry run is on", never that an evaluation caused it. So the cause is invisible
from the one place the effect shows up.

It was a deliberate trade when step 03 shipped (`evaluationSession`: the spawned
agent reaches the same server, so forcing it window-wide was the only guarantee
that held). The trade is defensible for the run the user is watching. It is not
defensible for a run they forgot they left open in another tab.

## A worse problem found while planning this (2026-08-25)

The window-wide dry run is the visible hazard. Checking whether per-connection
scoping was possible turned up a correctness gap underneath it.

`isEvaluating()` is **module state in ONE window**. The spawned `claude` reaches
a server through `mcp-proxy.js`, which resolves its target as: the pinned
`DEMO_BUILDER_MCP_SOCKET` from the project's `.mcp.json` **if that socket is
live**, otherwise a newest-mtime sweep of the socket directory
(`mcpSocketDiscovery.ts`).

So when the pinned socket is dead — the window was reloaded, or the extension
host restarted — and another window is live, the evaluation's agent connects to a
DIFFERENT window's server. That server's `isEvaluating()` is false. **Its writes
execute for real, while the workbench reports "nothing was changed."**

It needs two conditions at once, so it is not the common case. It is also the
worst possible failure for this feature: the one promise it makes, broken
silently, with a UI actively asserting the opposite.

**Per-connection scoping fixes this as a side effect**, because the marker
travels with the connection rather than living in whichever window happened to
start the run. That moves it from "the nicer fix" to "the correct one".

## The fix, and its floor

**Goal — scope the dry run to the evaluation's own MCP connection.** The server
sees one connection per client. If the evaluation's spawned `claude` can be
identified at connect time, `dryRun` becomes per-connection rather than global,
and the hazard disappears rather than being explained.

**The route, checked 2026-08-25 rather than assumed — and the first design was
wrong.**

The obvious plan was to mark the evaluation's connection: set an environment
variable on the spawn, have `mcp-proxy.js` stamp it into the handshake it is
already holding, and read it server-side. Every piece exists. **It does not
work.** The project's `.mcp.json` pins `DEMO_BUILDER_MCP_SOCKET` in the server
entry's own `env` block, and Claude Code re-applies that block over the inherited
environment — the exact trap the battery README already records for
`ENABLE_TOOL_SEARCH` ("unsetting it in the spawned process does nothing").

**What works instead: give the evaluation its OWN server.**

1. When an evaluation starts, the extension opens a SECOND `InExtensionMcpServer`
   on its own socket path, built from the same options as the main one — same
   tools, same trace recorder — but with `dryRun` hard-wired to `true`.
2. The spawn passes `--mcp-config <json>` naming that socket, plus
   `--strict-mcp-config` so the project's `.mcp.json` is ignored rather than
   merged. Both flags verified present in the installed CLI.
3. The listener is disposed when the run ends.

This is better than marking a connection, not just easier:

- **Nothing else pauses.** The main server never enters dry run, so the producer's
  other chats keep working. That was the whole hazard.
- **The multi-window escape closes.** The evaluation cannot land on another
  window's server, because it is told exactly which socket to use and that socket
  is live.
- **No protocol change.** No handshake rewriting, no marker to keep in sync
  across the proxy's reconnect-and-replay path.

**One trap `--strict-mcp-config` introduces.** It drops every OTHER MCP server the
project declares — Playwright and anything else in `.mcp.json`. An evaluation
without them measures a path the producer would never take, which contradicts the
reason reads execute at all. So the config passed in must be the project's own
`.mcp.json` with ONLY the demo-builder socket swapped, not a config containing
demo-builder alone. Test that a third-party entry survives the swap.

**Floor — if per-connection proves impossible, make it VISIBLE and say why.**
Not a smaller version of the fix; a different one, and it must be complete:

- The status bar item changes while an evaluation runs: "Evaluating — changes
  paused", not the ordinary dry-run text. A mode you cannot see is a trap, and
  this is a mode WITHIN a mode.
- The blocked-call note names the cause: "An evaluation is running, so nothing
  was changed" rather than "Dry run is on". One line, and it is the difference
  between a puzzle and an answer.
- Starting an evaluation while another chat is live says so first.

## Tests

- Per-connection: two clients on one server, one marked as the evaluation. The
  marked one is blocked; the other writes normally. By execution — this is the
  whole property.
- Floor: the blocked note names an evaluation as the cause when one is running,
  and does not when the toggle alone is on.
- The status bar reflects which of the two modes is active.

## Done when

Either an evaluation no longer affects other connections, or it visibly and
audibly does — with the cause named where the effect appears. `gate` clean.
