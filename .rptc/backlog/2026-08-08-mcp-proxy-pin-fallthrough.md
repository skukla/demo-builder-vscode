# Proxy: fall through to discovery when the pinned socket is gone

**Status:** ready — fix immediately (user direction, 2026-08-08)

## Provenance

Surfaced while fixing the socket-unlink race
(`fix(ai): stop an exiting MCP server deleting its successor's socket`). That fix
stops a dead socket being *created*. This one stops a dead socket being *fatal*.

Found by the codebase research agent during that session, at
`src/features/ai/server/mcpSocketDiscovery.ts:136-138`.

## The problem

`resolveProxyTarget` has four branches. Branch 1 returns the pinned path
**verbatim, with no existence check**:

```ts
if (envSocket) return { socketPath: envSocket, via: 'env' };
```

Every project's `.claude/mcp.json` and `.mcp.json` pins
`DEMO_BUILDER_MCP_SOCKET` (`mcpConfigWriter.ts:301,319`), so a pinned path that
no longer exists never reaches the cwd branch or the liveness-probing discovery
branch below it. `net.connect` gets ENOENT, which `isRetryableConnectError`
classifies as retryable (`mcpProxyRetry.ts:30`), so the proxy burns the full
~23s retry window and exits(1). The fast, useful `guidance` message is only
reached when *nothing* resolved — which a pin never triggers.

Net effect: a stale pin costs 23 seconds and then fails, when a live server was
sitting one branch further down.

## Goal / Scope

Make branch 1 conditional on the file existing:

```ts
if (envSocket && (await exists(envSocket))) {
    return { socketPath: envSocket, via: 'env' };
}
// else fall through: cwd → discovery
```

Also needed for the same reason:

- `mcpInspector.ts:163-166` reads the pin out of the config and probes it
  directly. Same fallthrough, or the AI Capabilities modal keeps reporting
  `demo-builder · timed out` against a path nothing serves.

Explicitly OUT of scope: changing the socket path scheme. The path stays
workspace-hashed and stable — that is what lets existing `.mcp.json` files keep
working with no `AI_CONTEXT_VERSION` bump.

## Constraints

- **No AI_CONTEXT_VERSION bump, no regeneration.** The whole appeal of this fix
  is that it repairs existing pinned configs without touching them. If a change
  here starts requiring regeneration, stop and reconsider.
- **Name the behaviour change.** A pinned-but-dead socket will now silently
  retarget to a *different window's* server rather than failing. That is right
  under a shared-path scheme where any live server serves the same projects
  root, but it is a semantic shift and belongs in the commit message.
- One `access()` per proxy launch on the happy path. Acceptable.
- `diagnostics.checkMcp` recomputes the socket path from a pure function rather
  than asking the server what it bound (`diagnostics.ts:194`). Out of scope
  here, but it is why Diagnostics can confidently report a socket the server
  never had — worth a runtime accessor eventually.

## Tests

- A pinned path that exists is used, and discovery is not consulted.
- A pinned path that does NOT exist falls through to discovery and returns the
  live socket.
- Neither case regresses the cwd branch or the no-server `guidance` path.
- Control each one: an assertion that passes with the fallthrough removed is
  testing nothing.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-08-mcp-proxy-pin-fallthrough.md`. Make
> `resolveProxyTarget`'s env-pin branch fall through to discovery when the
> pinned socket file does not exist, and apply the same fallthrough to
> `mcpInspector`'s direct-probe branch. Tests first; control each one.
