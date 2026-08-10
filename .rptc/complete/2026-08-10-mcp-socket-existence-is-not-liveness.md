# MCP socket resolution: existence is no longer evidence of liveness

**Status: SHIPPED 2026-08-10** — filed and resolved the same day, alongside the
socket-TOCTOU fix that created the condition.

## What shipped

`resolveProxyTarget` (`src/features/ai/server/mcpSocketDiscovery.ts`) now probes
**liveness** on the two deterministic paths first, and falls back to **existence**
only once it has confirmed some window is live:

1. env pin LIVE → `env`
2. cwd-derived LIVE → `cwd`
3. nothing live anywhere → guidance (fast, friendly failure)
4. something live, deterministic path merely EXISTS → that path wins anyway
5. otherwise the discovered live socket

Deterministic targeting is untouched wherever it earns its keep: whenever any
window is live, a dead-but-present pin still beats a live socket from a different
workspace. `mcpSocketDiscovery.test.ts`'s "prefers the cwd-derived socket over
discovery when the pin is gone" passes unchanged. Two tests that asserted
"dead file + nothing live → return it anyway" now assert guidance, which is what
the module docstring always said step 3 should do.

## One claim in the original filing was wrong

The filing said `mcpInspector` misreports health. It does not. It delegates to
`resolveProxyTarget` precisely so it models what an agent's proxy would do — so
when the proxy would strand, `demo-builder · error` was **honest**. There was one
defect, in the proxy, and fixing it fixed the badge for free. Left in below as
filed, because the reasoning that produced the wrong claim is worth seeing.

---

*Original filing follows.*

**Status:** ready · **Filed:** 2026-08-10 · **Size:** half a day, mostly deciding

## Provenance

Fell out of the socket-TOCTOU fix (same day). That fix deleted `removeIfStillOurs`
from `src/features/ai/server/inExtensionMcpServer.ts`: nothing may unlink the shared
socket name, because POSIX has no atomic unlink-if-inode and the check-then-act
deleted a successor's live socket. See that commit and
`docs/systems/mcp-server.md` §6.

The consequence was accepted deliberately, not overlooked: **socket files now outlive
their window.** This item is the follow-on that the accepted cost creates.

## The problem

`resolveProxyTarget` (`src/features/ai/server/mcpSocketDiscovery.ts:149`) tests
**existence** on its env and cwd branches, and **liveness** only in the discovery
sweep. Existence used to be a decent proxy for liveness because a clean shutdown
removed the file. It no longer is — the file always survives.

Two surfaces read the wrong answer:

1. **`src/mcp-proxy.ts`** — with VS Code closed, the pinned socket file still exists,
   so the proxy targets it and spends its ~23s retry window before printing the
   "not running" guidance instead of failing immediately. Correct outcome, slow.
2. **`src/features/ai/mcpInspector.ts:171`** — delegates to the same resolver. If a
   project's `.mcp.json` pins a socket path this window does not bind (in practice
   only when `DEMO_BUILDER_PROJECTS_DIR` changed after the project was created), the
   lingering stale file wins over the discovery sweep and the dashboard AI badge
   reads `demo-builder · error` **while a live server sits one branch away**. That is
   the failure `26937e42` fixed, returning through a different door.

## Why it was not fixed inline

The obvious fix — try liveness across env → cwd → discovery, fall back to existence
last — reverses a deliberate decision. `mcpSocketDiscovery.test.ts:151` ("prefers the
cwd-derived socket over discovery when the pin is gone") pins the opposite: a
**dead-but-present** deterministic path beats a **live** socket belonging to a
different window. The reasoning is sound — another window means another projects dir,
so targeting it is worse than waiting for the right one to come back, and the proxy's
connect-retry window exists precisely to ride that out.

So this is a design question, not a bug fix, and it needs answering before any code
moves.

## The question to answer first

**When the deterministic path is dead and another window is live, which does the
caller want?** It is very likely NOT the same answer for both callers:

- The **proxy** is about to become an agent's only MCP connection for the session.
  Deterministic targeting almost certainly still wins.
- The **inspector** is describing health on a badge. Reporting `error` when a live
  server is reachable is simply wrong, whatever the pin says.

If that split holds, the fix is not to re-rank `resolveProxyTarget` at all — it is to
give the inspector a resolution that prefers liveness, and leave the proxy's alone.
That keeps `mcpSocketDiscovery.test.ts:151` true and fixes the surface that is
actually misreporting.

## Execution plan

1. Confirm the split above by reading both call sites; if the proxy genuinely wants
   liveness too, this becomes a single re-rank and the test at :151 must be rewritten
   with its rationale, not merely deleted.
2. Add the liveness-preferring resolution for the inspector. Reuse `probeSocket` /
   `discoverLiveSocket` — do not write a third probe.
3. Test the two orderings distinctly. A dead pin + a live other window is the case
   that separates them, and it is the case no current test covers for the inspector.
4. Decide separately whether the proxy should shorten its retry window when nothing
   is live anywhere. Related, cheap, and out of scope until (1) is answered.

## Constraints

- **Do not reintroduce unlinking the shared socket name.** No inode check, no lock,
  no "sweep stale sockets at start" — every one of those re-creates the same race.
  `dispose()`'s docstring explains why; read it before proposing a cleanup.
- Keep `mcpSocketDiscovery.ts` free of `vscode` — the proxy bundles it standalone.

## Kickoff prompt

```
/rptc:fix MCP socket resolution treats file existence as liveness, which stopped
being true when the socket TOCTOU fix removed dispose-time cleanup. Read
.rptc/backlog/2026-08-10-mcp-socket-existence-is-not-liveness.md first — answer the
design question in it BEFORE writing code, because the two callers probably want
different answers.
```
