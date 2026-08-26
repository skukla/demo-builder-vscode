---
id: AI-1j
kind: feature
area: ai
parent: AI-1
needs: []
value: high
status: active
layer: B
---
# reload_window — the last manual step in the measure loop

## Index hook

*The item in one paragraph.*

**The fix-measure loop breaks in the middle and waits for a human to press F5.**
Extension-host code cannot be measured until the host restarts, and nothing can
restart it from outside the editor — so `AI-1g` sits at `built` with a
measurement nobody can run. The pieces already exist: the extension calls
`workbench.action.reloadWindow` in three places (reset, extension update,
auto-update), and `open_view` is an MCP tool that drives the editor over the
socket. This is those two facts joined. Gated behind `confirm` because it
restarts the host and kills anything in flight. Filed 2026-08-26.

## Why it is worth a tool rather than a habit

Fix -> compile -> **reload** -> measure. Every step is automatable except the
third, and one manual step in the middle stalls the whole chain: on 2026-08-26
the host served a bundle from 03:18 for the entire working day while twenty-four
commits landed, and every probe answered confidently from it.

## It corrects a claim in `mcp-live-probe`

That skill says *"Extension-host changes need F5, not Cmd+R — Cmd+R reloads only
the webview."* The second half is imprecise and it is why F5 has been treated as
unavoidable. `workbench.action.reloadWindow` reloads the WINDOW, extension host
included — `extensionUpdater.ts` uses it precisely to load a newly installed
extension version, which cannot work otherwise. Cmd+R may vary with focus; the
command does not.

## Three sharp edges

1. **Respond before reloading.** The reload tears down the MCP server mid-call.
   The tool must return its result and schedule the reload just after, or the
   caller sees a dropped connection rather than an answer.
2. **`confirm: true`.** It restarts the host and discards in-flight work. This is
   the exact class `mcp-live-probe`'s allowlist exists to keep out of an
   enumerate-and-call sweep.
3. **The socket goes away and comes back.** Anything scripted around it must wait
   for the rebind, not assume continuity. `probe.mjs info` is the readiness check
   — it reports the build that is serving, which is also how you confirm the
   reload actually picked up the new bundle.

## Done when

`AI-1g` can be measured end to end without anyone touching the editor: compile,
reload over the socket, wait for the rebind, run the battery, compare.

Filed 2026-08-26.
