# Global MCP registration pins the extension version and is never refreshed

## Provenance

A colleague installed the Claude Code CLI, tried to add an MCP server, and got Claude
Code's **MCP config diagnostics** screen instead:

```
[Conflicting scopes]
Server "demo-builder" is defined in multiple scopes with different endpoints:
  user    (… /skukla.adobe-demo-builder-1.0.0-beta.111/dist/mcp-server.js)
  project (… /skukla.adobe-demo-builder-1.0.0-beta.128/dist/mcp-proxy.js)
OAuth tokens are stored per endpoint, so authenticating in one context will not carry over.
```

(Paths abbreviated — the originals carry a colleague's home directory and this repo is
public.)

Reported 2026-08-13. Traced the same day; the mechanism below is read from source, not
inferred from the screenshot.

## What is actually wrong

`commandManager.ts`'s `demoBuilder.registerGlobalMcp` calls:

```ts
registerGlobalMcp(path.join(this.context.extensionPath, 'dist'))
```

`context.extensionPath` is **version-pinned** — VS Code names the directory
`skukla.adobe-demo-builder-1.0.0-beta.<N>`. So the absolute path written into
`~/.claude.json` is correct exactly once, for the version that was installed the day the
user ran the command. Every subsequent extension update moves the real file and **nothing
rewrites the entry** (verified: no reference to `registerGlobalMcp` or `claude.json`
anywhere under `src/features/updates/`).

The screenshot shows the failure compounded, because the entry point was renamed too:

| Scope | Written by | Version | Binary |
|---|---|---|---|
| user (`~/.claude.json`) | one-off opt-in command, at beta.111 | frozen at .111 | `mcp-server.js` — the **retired** standalone process |
| project (`.mcp.json`) | per-project writer, current | .128 | `mcp-proxy.js` — the current forwarder |

So the stale entry is wrong twice: a directory that no longer exists once VS Code prunes
old versions, and a filename current builds no longer produce (`esbuild.config.js` has one
MCP entry point, `src/mcp-proxy.ts` → `dist/mcp-proxy.js`; any `dist/mcp-server.js` on disk
is a leftover from an older build).

## Why nothing caught it

`detectMcpDrift` (`src/features/ai/mcpDriftDetector.ts`) is exactly the right shape for
this — "do this project's declared MCP-server arg paths resolve on disk?", cheap, pure,
network-free, and it gates a visible self-heal. It reads only the PROJECT's
`.claude/mcp.json`. Neither it nor `onOpenChecks/mcpHealthCheck.ts` reads `~/.claude.json`.

**The one entry that cannot heal itself is the one nothing looks at.** Project scope is
rewritten on every regenerate; user scope is written once by an opt-in command and then
never touched again.

## Scope

Fix the user-scope entry going stale. Explicitly NOT in scope: changing the default
(per-project `.mcp.json` stays the default; global stays opt-in), or the socket-discovery
design, which is version-independent already and is not implicated.

## Execution plan

1. **Reproduce first.** Write a `~/.claude.json` entry pointing at a nonexistent
   `…beta.111/dist/mcp-server.js`, confirm the diagnostics screen, and confirm the current
   code cannot notice. Do not skip this — the whole item rests on a screenshot from another
   machine.
2. **Extend the drift detector to user scope.** `detectMcpDrift` already returns
   `{ drifted, missing[] }`; add the `~/.claude.json` `demo-builder` entry as a second
   source. Keep it `fs.access`-only so it stays safe to run on dashboard open.
3. **Self-heal on activation.** When the entry exists and its path is not this version's
   `dist/mcp-proxy.js`, rewrite it. The registration module already read-merge-writes and
   refuses to overwrite a malformed `~/.claude.json` — reuse that, do not add a second
   writer.
4. **Decide the stale-name case.** An entry naming `mcp-server.js` is not merely
   out-of-date, it names a retired binary. Rewriting it to `mcp-proxy.js` is right; confirm
   no one is relying on the old standalone process before deleting the path outright.
5. **Consider removing the pin entirely.** A launcher at a version-independent location
   would end the class rather than patching each instance. Larger; evaluate, do not assume.

## Constraints

- `~/.claude.json` is **user-owned Claude Code state**. The existing module's rule stands:
  read-merge-write, and never overwrite a file that exists but does not parse.
- The heal must not run on every activation unconditionally — compare first, write only on
  a real difference. Rewriting an already-correct entry churns a user-owned file.
- No new writer for `~/.claude.json`. One module owns it.
- Redact real paths from any writeup: this repo is public and the reports carry home
  directories.

## Kickoff prompt

> Read `.rptc/plans/global-mcp-version-pin/overview.md`. Reproduce
> the conflicting-scopes diagnostic by hand-writing a stale `~/.claude.json` entry, then
> extend `detectMcpDrift` to cover user scope and self-heal the entry on activation when it
> points at a different extension version. `registerGlobalMcp` is the only module allowed to
> write that file.
