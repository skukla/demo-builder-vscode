# Global MCP entry point — proxy socket discovery

**Status:** Shipped 2026-07-09 (promoted from backlog, designed, implemented, and landed same day)
**Origin:** [`original-backlog-item.md`](original-backlog-item.md) (filed during the in-extension MCP migration, PR #2 / `273a1ba6`)

## Decision (approved)

Restore global `~/.claude.json` registration **properly**, via socket discovery in the
proxy — not a message-only stub, not a drop of the item.

- When `DEMO_BUILDER_MCP_SOCKET` is unset and the cwd-derived socket file does not
  exist, `mcp-proxy.js` enumerates live sockets in `$TMPDIR/demo-builder-mcp/` and
  connects to a running extension window.
- **Multi-window tiebreak: most recent socket-file mtime** = most recently *started*
  window (bind time is the only signal we have; "most recently active" is not
  tracked — docs say what we actually do).
- **No live socket anywhere → fast fail** with guidance ("open Demo Builder in
  VS Code first") instead of burning the ~23s retry window.
- Re-home the pre-migration "Register Global MCP" affordance as a palette command
  that upserts the `demo-builder` entry into `~/.claude.json`, pointing at
  `dist/mcp-proxy.js` with **no** socket env (discovery mode), merge-preserving.

## Current architecture (verified 2026-07-09)

- `src/mcp-proxy.ts` — stdio↔UDS forwarder. Target = `DEMO_BUILDER_MCP_SOCKET` env,
  else `resolveMcpSocketPath(process.cwd())`. Reload-resilient (handshake capture +
  replay). Exits with guidance after a ~23s retry window. MUST NOT import `vscode`.
- `src/features/ai/server/mcpSocketPath.ts` — `mcpSocketDir()` =
  `os.tmpdir()/demo-builder-mcp`; hashed per-workspace socket names. vscode-free.
- `src/features/ai/server/inExtensionMcpServer.ts` — binds workspace socket (+
  optional projects-root secondary), `rm`s stale files on bind, best-effort `rm` on
  dispose. **A crash leaves stale socket files** → discovery must probe liveness,
  not just existence.
- `mcpConfigWriter.ts` — per-project `.mcp.json` with explicit socket env;
  `buildDemoBuilderMcpEntry` + `resolveNodePath` reusable. The pre-migration
  `registerGlobalMcp` (merge-preserving `~/.claude.json` upsert, throws on
  malformed file) is recoverable from `git show 273a1ba6~1` — resurrect its shape,
  point it at the proxy.

## Resolution order (proxy, env unset)

1. cwd-derived socket **file exists** → use it (current behavior incl. retry
   window; covers activation races and deterministically targets the window whose
   workspace = cwd).
2. Else **discovery**: readdir `mcpSocketDir()` for `*.sock`, sort mtime desc,
   probe each with a short timeout; first live socket wins. Probe = connect +
   immediately destroy; then the normal `connect()` flow runs against the chosen
   path (a server death between probe and connect is absorbed by the existing
   retry logic).
3. Nothing live → guidance to stderr, `exit 1` **fast**.

Trade-off accepted: if the proxy spawns exactly inside a window-reload's sub-second
socket-unlink gap, discovery may pick a different window (or fail fast where the
old code would have waited). Rare enough; the deterministic env-set path (all
generated `.mcp.json` files) is untouched.

## Steps

- [x] **Step 1** — `mcpSocketDiscovery.ts` (vscode-free) + tests: candidate listing,
      liveness probe with timeout, `discoverLiveSocket`, `resolveProxyTarget`.
- [x] **Step 2** — wire `resolveProxyTarget` into `mcp-proxy.ts` (async bootstrap;
      keep reconnect logic byte-identical). Smoke-verified against the real
      bundle: env path verbatim, discovery connects to a live socket, no-window
      guidance in ~80ms (was a ~23s retry stall).
- [x] **Step 3** — `registerGlobalMcp` writer + tests (upsert `~/.claude.json`,
      proxy path, no env, malformed-file throw). NOTE: tests must mock `os` via a
      module factory (`jest.mock('os', …)`) — a plain `spyOn(os, 'homedir')` does
      not intercept the SUT and the suite would write the REAL `~/.claude.json`.
- [x] **Step 4** — `demoBuilder.registerGlobalMcp` palette command (package.json +
      CommandManager inline handler) with success/error messaging.
- [x] **Step 5** — docs sync (`src/features/CLAUDE.md`, `src/features/ai/README.md`,
      `docs/systems/mcp-server.md` §5+§12, `useDashboardStatus` comment, backlog
      README §C) + full gate.

## Constraints

- `mcp-proxy.ts` and everything it imports stay vscode-free (own process).
- `~/.claude.json` is user-owned Claude Code state: read-merge-write only
  `mcpServers['demo-builder']`; refuse to write over a malformed file.
- No magic timeouts — named constants for probe timeout.
- Tests: real UDS servers in a temp dir (pattern: `inExtensionMcpServer.test.ts`).
