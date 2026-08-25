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

**The route, checked 2026-08-25 rather than assumed.** Every piece already
exists:

1. `evaluate_prompt` spawns the CLI, so it can set an environment variable —
   a per-run token, not a constant, so a stale value cannot mark an unrelated
   connection.
2. `mcp-proxy.js` is OUR code and runs as a child of that spawn, so it inherits
   the variable. It already CAPTURES the client's `initialize` line and replays
   it on reconnect (`initializedLine`, `capturedHandshake`), so stamping the
   token into what it forwards is an edit to a line it is already holding — and
   the stamp survives the reconnects the proxy is built to ride out.
3. The server creates **a fresh MCP server instance per socket connection**
   (`StdioServerTransport(socket, socket)`, and `withToolLogging` already wraps
   per connection). So a per-connection flag has a natural home; there is no
   shared object to thread it through.

Then `dryRun` becomes `thisConnectionIsAnEvaluation || the setting`, and
`evaluationSession` keeps only the recursion guard — which is what it was
actually good for.

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
