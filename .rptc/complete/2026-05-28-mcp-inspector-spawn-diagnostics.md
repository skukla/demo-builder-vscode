# MCP Inspector — Spawn Diagnostics & Third-Party Env

## Provenance

Surfaced 2026-05-28 while debugging "playwright · error: MCP error -32000: Connection closed" in the dashboard's AI Capabilities modal. The Playwright MCP entry in `.mcp.json` is wired correctly (storefront-anchored absolute path via `mcpConfigWriter`), and Claude Code itself prompts the user to consent to it — so the file is found. But the inspector spawn dies before responding to `tools/list`, and the dashboard surfaces only the raw JSON-RPC error code, which is too low-level to act on.

Two adjacent gaps in `src/features/ai/mcpInspector.ts` make this kind of failure mysterious. Both small, both contained, both worth fixing together.

## Goal / Scope

Make `Connection closed`-class failures actionable — when a child MCP exits early, the inspector should report **why** (its stderr), and known-safe third-party env vars (Playwright's browsers path, Node options, XDG cache dirs) should be forwarded so a class of preventable failures never happens in the first place.

**In scope:**

- Capture buffered stderr from the spawned MCP and append a short tail to the `McpInventoryEntry.error` message on both `error` and `timeout` outcomes
- Extend the env allowlist passed to children with a small set of well-known *configuration* vars (no credential carriers)
- Tests covering both behaviors in `tests/features/ai/mcpInspector.test.ts`

**Out of scope:**

- Resolving the underlying Playwright install (already covered: `applyAiDefaultsToStorefrontPackageJson` + storefront `npm install` during project creation)
- Adding a "regenerate also reinstalls" surface — separate concern; doesn't belong in the inspector
- Changing the SDK env allowlist itself (we layer additions on top)
- Per-MCP env overrides in `ai-defaults.json` — would also be useful but is a bigger surface

## Root Cause

**Stderr is piped but never read.** The transport is constructed with `stderr: 'pipe'` and nothing in `inspectOneServer` attaches a consumer or drains the buffer. On the error path we surface only `err.message` (which is the JSON-RPC error string like `"MCP error -32000: Connection closed"`), discarding the child's actual diagnostic output. The result: every spawn failure looks the same in the UI, and the user has to drop to a terminal to learn anything.

**Env allowlist is too narrow for third-party MCPs.** The SDK's `getDefaultEnvironment()` is restrictive *for good reason* — it prevents the extension host from leaking Adobe tokens (`GITHUB_TOKEN`, `DA_LIVE_IMS_TOKEN`, `AIO_*`) into every spawned MCP child, including third-party servers. But the allowlist is *POSIX home + path basics only*. Anything else (e.g. `PLAYWRIGHT_BROWSERS_PATH` for Playwright's Chromium location, `NODE_OPTIONS`, `XDG_CACHE_HOME` for Linux caches) is stripped. Some MCPs read these on startup and bail when they're missing. Claude Code itself doesn't strip — its children inherit the full parent env — so the same MCP works in Claude and fails in our inspector.

## Execution Plan

Single batch, single file (`mcpInspector.ts`), no architectural changes. TDD.

### Step 1: Capture stderr tail on error

Drain the transport's `stderr` Readable in the `catch` block of `inspectOneServer`. When the spawned process writes to stderr before exiting, Node buffers up to the stream's `highWaterMark` (default 64 KB) in paused mode — calling `read()` after the failure pulls whatever's there. Cap the tail at **4 KB** so a misbehaving MCP can't bloat the modal payload.

Extract a `describeError(err)` helper and a `readBufferedStderr(transport, maxBytes)` helper to keep the catch arm flat (no nested ternaries; the SOP scanner will flag those).

When stderr has content, the message becomes:

```
<original error message>
stderr (tail):
<last 4 KB of child stderr>
```

When stderr is empty, the message is the original error message unchanged.

Applies to both `status: 'error'` and `status: 'timeout'` outcomes — a hung server with diagnostic stderr is just as worth surfacing.

### Step 2: Extend the env allowlist

Add a module-level `EXTRA_ALLOWED_ENV_VARS` constant — a short list of well-known *configuration* vars that don't carry credentials:

- `NODE_OPTIONS` — Node runtime flags, broadly used
- `PLAYWRIGHT_BROWSERS_PATH` — where Playwright looks for Chromium
- `PLAYWRIGHT_DOWNLOAD_HOST` — proxy override
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` — CI flag
- `XDG_CACHE_HOME` — Linux cache location (npm, others)
- `XDG_DATA_HOME` — Linux data location

For each, copy `process.env[key]` into the spawn env when set. Keep the SDK default allowlist as the base; `EXTRA_ALLOWED_ENV_VARS` only ever *adds*. `serverConfig.env` continues to override last.

Refactor the env construction into a `buildSpawnEnv(serverEnv)` helper. Single source of truth, easier to test.

### Step 3: Tests

Extend `tests/features/ai/mcpInspector.test.ts`:

- **Env**: `NODE_OPTIONS`, `PLAYWRIGHT_BROWSERS_PATH`, `XDG_CACHE_HOME` set on `process.env` flow to `transportInstances[0].env`
- **Env**: a sentinel var outside the extended allowlist (existing `SECRET_THAT_MUST_NOT_LEAK` test) does **not** flow through — regression guard
- **Stderr**: when the child wrote stderr before failing, the resulting `McpInventoryEntry.error` includes a `stderr (tail):` section with that content
- **Stderr**: when the child wrote nothing, the error message has no `stderr (tail):` suffix (regression guard against always-appending an empty section)
- **Stderr**: when the child wrote more than 4 KB, only the last 4 KB are surfaced (truncation)
- **Stderr**: stderr tail is also surfaced on the timeout path

Test scaffolding: enhance the existing `StdioClientTransport` jest mock so each transport instance exposes a `read()` method backed by a per-instance chunk queue. Add a small `queueStderr(transportIndex, chunks)` helper for tests.

## Constraints

- File-size limits stay green (`mcpInspector.ts` is ~180 lines today; +60 lines is safely under the 500-line cap)
- No new dependencies
- No changes to `McpInventoryEntry` shape (the `error: string` field already carries arbitrary text)
- Existing SOP scanner must stay green: no nested ternaries, no magic timeouts (the 4 KB byte cap is a byte size, not a timeout — module-level constant is fine)
- Stderr truncation must keep the **tail** (last N bytes), not the head — the tail is where the actual error message usually lives

## Kickoff prompt

```
Implement the inspector spawn diagnostics fix in this backlog item. TDD:
RED for both behaviors first (env forwarding + stderr capture, plus the
regression guards), then GREEN. Keep the catch arm flat — extract
describeError() and readBufferedStderr() helpers. Drop EXTRA_ALLOWED_ENV_VARS
at module scope as a ReadonlyArray<string>. The SDK env allowlist stays as
the base; the new const only ever adds, never replaces.

After GREEN: tsc, jest on the affected suite, then full jest. The SOP
inline-styles + nested-ternary scanners must stay green.
```
