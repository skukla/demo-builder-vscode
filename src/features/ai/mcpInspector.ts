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
    // Use the SDK's safe-to-inherit env allowlist (PATH, HOME, USER, SHELL,
    // TERM, LANG, TMPDIR, plus Windows equivalents) rather than spreading the
    // extension host's full `process.env` — that would forward GITHUB_TOKEN,
    // DA_LIVE_IMS_TOKEN, AIO_* refresh tokens, and any other host secrets to
    // every spawned MCP child, including third-party servers.
    const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args ?? [],
        env: { ...getDefaultEnvironment(), ...(serverConfig.env ?? {}) },
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
        if (isTimeout(err)) {
            return { id, status: 'timeout', error: `Exceeded ${MCP_INSPECT_TIMEOUT_MS}ms budget` };
        }
        return {
            id,
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
        };
    } finally {
        try {
            await client.close();
        } catch {
            // best-effort cleanup
        }
    }
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

