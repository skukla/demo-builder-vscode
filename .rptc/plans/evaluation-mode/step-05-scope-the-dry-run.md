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

## The fix, and its floor

**Goal — scope the dry run to the evaluation's own MCP connection.** The server
sees one connection per client. If the evaluation's spawned `claude` can be
identified at connect time, `dryRun` becomes per-connection rather than global,
and the hazard disappears rather than being explained.

Route to check FIRST, before designing anything: `evaluate_prompt` spawns the
CLI, so it can pass an environment variable that the stdio→UDS proxy
(`dist/mcp-proxy.js`) forwards, or a distinguishing argument the server can read
at `initialize` (`clientInfo` is already read there for the build stamp). Verify
which of those actually reaches the server — do not assume either does. This is
the whole step if it works.

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
