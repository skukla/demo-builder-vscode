/**
 * MCP Inspector
 *
 * Reads `<project>/.claude/mcp.json`, spawns each declared server as a stdio
 * subprocess via the @modelcontextprotocol/sdk client, calls `tools/list`
 * with pagination, and returns one `McpInventoryEntry` per server.
 *
 * Per-server timeout (15s overall budget). Module-level TTL cache so the
 * Configure tab can refresh inventory cheaply on tab re-open without
 * re-spawning every MCP every time. Cache only stores successful results;
 * timeouts and errors are retried on the next call.
 *
 * The cache key is the server id (the key in `mcpServers`). Config changes
 * (command, args, env) require an explicit `clearMcpCache(id)` from the
 * `inspect-mcp` handler — there is no automatic config-change invalidation;
 * the 5-minute TTL keeps the staleness window short.
 *
 * Pure stdlib + SDK + cache utils — no VS Code coupling.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { Readable } from 'stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
    createCacheEntry,
    getCacheTTLWithJitter,
    isExpired,
    type CacheEntry,
} from '@/core/cache/cacheUtils';
import { withTimeout } from '@/core/utils/promiseUtils';
import { CACHE_TTL, TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { McpInventoryEntry, McpToolEntry } from '@/types/ai';
import { isTimeout } from '@/types/errors';
import { parseJSON } from '@/types/typeGuards';

/** Per-server inspection budget. Re-exported for tests; pulls from TIMEOUTS.MCP_INSPECT. */
export const MCP_INSPECT_TIMEOUT_MS = TIMEOUTS.MCP_INSPECT;

/**
 * Bytes of stderr to surface in `McpInventoryEntry.error` on failure.
 * We keep the *tail* (not the head) — the diagnostic that explains the exit
 * is almost always at the bottom of the output, after any banner / progress
 * lines. 4 KB comfortably holds a typical node stack trace plus context.
 */
const STDERR_TAIL_BYTES = 4 * 1024;

/**
 * Environment variables we forward to spawned MCP children IN ADDITION to the
 * SDK's `getDefaultEnvironment()` allowlist (PATH/HOME/USER/SHELL/TERM/etc.).
 *
 * The SDK's list is deliberately narrow to keep extension-host secrets
 * (`GITHUB_TOKEN`, `DA_LIVE_IMS_TOKEN`, `AIO_*`) out of every child. But it's
 * also too narrow for some third-party MCPs that read well-known *config*
 * vars on startup — Playwright MCP needs `PLAYWRIGHT_BROWSERS_PATH` to find
 * its Chromium install; many Node tools read `NODE_OPTIONS`; Linux tools
 * resolve caches via `XDG_*`. None of these are credential carriers.
 *
 * Keep this list short and credential-free. If a new entry is needed, document
 * why and confirm it's not a likely token bearer in any common configuration.
 */
const EXTRA_ALLOWED_ENV_VARS: ReadonlyArray<string> = [
    'NODE_OPTIONS',
    'PLAYWRIGHT_BROWSERS_PATH',
    'PLAYWRIGHT_DOWNLOAD_HOST',
    'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD',
    'XDG_CACHE_HOME',
    'XDG_DATA_HOME',
];

interface McpServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

interface McpJsonShape {
    mcpServers?: Record<string, McpServerConfig>;
}

// ─── Module-level cache ───────────────────────────────────────────────────────

const cache: Map<string, CacheEntry<McpInventoryEntry>> = new Map();

/**
 * Clear cached inspection results. With no argument, clears every entry.
 * With a `serverId`, clears that single entry — useful when the `inspect-mcp`
 * handler wants to force a refresh for one server without disturbing others.
 */
export function clearMcpCache(serverId?: string): void {
    if (serverId === undefined) {
        cache.clear();
        return;
    }
    cache.delete(serverId);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Inspect every server declared in `<projectPath>/.claude/mcp.json`. Returns
 * an empty array when the file is missing, malformed, or has no servers.
 *
 * Each server is inspected in parallel. A server failing (timeout, crash,
 * missing `tools` capability) does not block others — its entry comes back
 * with `status: 'error'` or `'timeout'` and a short diagnostic.
 */
export async function inspectAllServers(projectPath: string): Promise<McpInventoryEntry[]> {
    const config = await readMcpJson(projectPath);
    if (!config?.mcpServers) return [];

    const servers = Object.entries(config.mcpServers);
    const inspections = servers.map(async ([id, serverConfig]): Promise<McpInventoryEntry> => {
        const cached = cache.get(id);
        if (cached && !isExpired(cached)) return cached.value;

        const result = await inspectOneServer(id, serverConfig, projectPath);

        // Only cache successful results — errors/timeouts retry next call.
        if (result.status === 'ok') {
            cache.set(id, createCacheEntry(result, getCacheTTLWithJitter(CACHE_TTL.MEDIUM)));
        }

        return result;
    });

    return Promise.all(inspections);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function readMcpJson(projectPath: string): Promise<McpJsonShape | null> {
    const filePath = path.join(projectPath, '.claude', 'mcp.json');
    let raw: string;
    try {
        raw = await fsPromises.readFile(filePath, 'utf-8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
    }
    return parseJSON<McpJsonShape>(raw);
}

async function inspectOneServer(
    id: string,
    serverConfig: McpServerConfig,
    projectPath: string,
): Promise<McpInventoryEntry> {
    // Env: layer the extra credential-free allowlist on top of the SDK default,
    // then let `serverConfig.env` override last. See EXTRA_ALLOWED_ENV_VARS
    // for the security rationale.
    const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args ?? [],
        env: buildSpawnEnv(serverConfig.env),
        cwd: projectPath,
        stderr: 'pipe',
    });

    const client = new Client({
        name: 'demo-builder-inspector',
        version: '1.0.0',
    });

    try {
        const tools = await withTimeout(collectTools(client, transport), {
            timeoutMs: MCP_INSPECT_TIMEOUT_MS,
            timeoutMessage: `MCP server "${id}" introspection`,
        });
        return { id, status: 'ok', tools };
    } catch (err) {
        return buildFailureEntry(id, err, transport);
    } finally {
        try {
            await client.close();
        } catch {
            // best-effort cleanup
        }
    }
}

/**
 * Build the env passed to the spawned MCP child.
 *
 *   SDK allowlist  ∪  EXTRA_ALLOWED_ENV_VARS (from process.env)  ∪  serverConfig.env
 *
 * `serverConfig.env` wins last so explicit per-server overrides always take
 * effect, even on keys the SDK or our extra list also set.
 */
function buildSpawnEnv(serverEnv: Record<string, string> | undefined): Record<string, string> {
    const env: Record<string, string> = { ...getDefaultEnvironment() };
    for (const key of EXTRA_ALLOWED_ENV_VARS) {
        const value = process.env[key];
        if (value !== undefined) {
            env[key] = value;
        }
    }
    if (serverEnv) {
        Object.assign(env, serverEnv);
    }
    return env;
}

/**
 * Construct the failure McpInventoryEntry. Combines a short `describeError()`
 * summary with whatever the child wrote to stderr before exiting — the latter
 * is usually the *actual* diagnostic ("cannot find module X", "browser binary
 * missing"), where the former is just the JSON-RPC error code.
 */
function buildFailureEntry(
    id: string,
    err: unknown,
    transport: StdioClientTransport,
): McpInventoryEntry {
    const stderrTail = readBufferedStderr(transport, STDERR_TAIL_BYTES);
    const baseMessage = describeError(err);
    const message = stderrTail
        ? `${baseMessage}\nstderr (tail):\n${stderrTail}`
        : baseMessage;
    const status: 'timeout' | 'error' = isTimeout(err) ? 'timeout' : 'error';
    return { id, status, error: message };
}

/** One-line summary of the failure cause. No stderr — that's appended separately. */
function describeError(err: unknown): string {
    if (isTimeout(err)) return `Exceeded ${MCP_INSPECT_TIMEOUT_MS}ms budget`;
    if (err instanceof Error) return err.message;
    return String(err);
}

/**
 * Drain whatever the child wrote to `transport.stderr` into a UTF-8 string
 * and return the last `maxBytes` of it. Best-effort: Node Readables buffer up
 * to their `highWaterMark` in paused mode (no consumer), and we call `read()`
 * after the spawn has already failed, so very chatty servers may overflow
 * before we get here — but for typical "exit with one error line" failures
 * the diagnostic survives.
 */
function readBufferedStderr(transport: StdioClientTransport, maxBytes: number): string {
    const stream = transport.stderr as unknown as Readable | undefined;
    if (!stream) return '';
    const parts: string[] = [];
    let total = 0;
    let chunk: unknown = stream.read();
    while (chunk !== null && chunk !== undefined) {
        const piece = toUtf8(chunk);
        parts.push(piece);
        total += piece.length;
        if (total > maxBytes * 4) break; // safety: don't grow unbounded
        chunk = stream.read();
    }
    const combined = parts.join('').trim();
    if (combined.length <= maxBytes) return combined;
    return combined.slice(combined.length - maxBytes).trim();
}

/** Convert a chunk emitted by a Readable into a UTF-8 string. */
function toUtf8(chunk: unknown): string {
    if (chunk instanceof Buffer) return chunk.toString('utf-8');
    if (typeof chunk === 'string') return chunk;
    return '';
}

async function collectTools(client: Client, transport: StdioClientTransport): Promise<McpToolEntry[]> {
    await client.connect(transport);

    const tools: McpToolEntry[] = [];
    let cursor: string | undefined;
    do {
        const page = await client.listTools(cursor ? { cursor } : {});
        for (const tool of page.tools) {
            tools.push({
                name: tool.name,
                description: typeof tool.description === 'string' ? tool.description : '',
            });
        }
        cursor = page.nextCursor;
    } while (cursor);

    return tools;
}

