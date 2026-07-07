# Step 1 — `detectMcpDrift` pure detection helper

**Goal:** a cheap, pure, network-free check: do this project's declared MCP-server paths resolve on disk?

## File

New: `src/features/ai/mcpDriftDetector.ts` (lives beside `mcpInspector.ts` in the `ai` feature).
Test: `tests/features/ai/mcpDriftDetector.test.ts`.

## Public API

```ts
export interface McpDriftResult {
  drifted: boolean;
  missing: string[]; // resolved paths that don't exist (server id + path for the log)
}
export async function detectMcpDrift(projectPath: string): Promise<McpDriftResult>;
```

## Behavior

1. Read `<projectPath>/.claude/mcp.json` (the file `mcpInspector` uses). Parse via
   `parseJSON<McpJsonShape>` (`typeGuards.ts`). Missing/invalid file → `{ drifted: false, missing: [] }`
   (out of scope — that's AI-not-setup, not stale-path drift).
2. `toolsDir = resolveMcpToolsDir(projectPath)` (`aiDefaultsInstaller.ts`).
3. For each `[id, cfg]` in `mcpServers`:
   - **Skip `id === 'demo-builder'`** (extension-managed proxy; arg is `dist/mcp-proxy.js`).
   - For each `arg` in `cfg.args ?? []` that looks like a filesystem path (ends in `.js`/`.cjs`/`.mjs`
     or contains `node_modules`): resolve = `path.isAbsolute(arg) ? arg : path.join(toolsDir, arg)`;
     `await fs.access(resolve)`; on throw, push to `missing`.
4. `drifted = missing.length > 0`.

Pure: no spawn, no fetch. Only `fs.access` + `fs.readFile`.

## Tests (write FIRST)

- **healthy:** `.mcp.json` with `commerce-extensibility`/`playwright` args that exist on disk → `{ drifted: false, missing: [] }`.
- **drifted:** one arg path missing → `drifted: true`, `missing` contains that path.
- **skips demo-builder:** a `demo-builder` server whose proxy path is absent does NOT cause drift.
- **relative arg resolution:** a relative arg is resolved against `resolveMcpToolsDir`, not cwd.
- **absolute arg resolution:** an absolute arg (e.g. a stale cross-project path) is stat'd as-is → drift.
- **no `.mcp.json`:** missing file → `{ drifted: false, missing: [] }` (not an error).
- **malformed `.mcp.json`:** invalid JSON → `{ drifted: false, missing: [] }` (degrade, don't throw).
- **no server args / non-path args:** server with `env`-only (no file args) → not drifted.

## Constraints

- Mock `fs/promises` (`access`, `readFile`) — mirror `mcpInspector.test.ts` mocking style.
- Do NOT import vscode (keep it usable from the vscode-free surfaces).
- Reuse `resolveMcpToolsDir` and `McpJsonShape`/`parseJSON` — don't redefine them.
