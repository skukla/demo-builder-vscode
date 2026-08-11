/**
 * Global MCP registration.
 *
 * Upserts the `demo-builder` MCP entry into Claude Code's user-scope config
 * (`~/.claude.json`, top-level `mcpServers` — verified against Claude Code
 * v2.1.x). The entry points at the stdio→UDS proxy with NO socket env, so the
 * proxy resolves its target at launch: the cwd-derived socket inside a
 * workspace, otherwise live-socket discovery (see
 * `@/features/ai/server/mcpSocketDiscovery`). This is what makes global ops
 * (`create_project`, `list_projects`) reachable from an arbitrary cwd — the
 * gap the in-extension migration left open.
 *
 * Explicit opt-in only (the "Register Global MCP" command). The default remains
 * per-project `.mcp.json`, which keeps the tools out of unrelated Claude
 * sessions.
 *
 * `~/.claude.json` is user-owned Claude Code state: this module read-merge-
 * writes ONLY `mcpServers['demo-builder']`, preserves everything else, and
 * refuses to overwrite a file it cannot parse.
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { resolveNodePath } from './mcpConfigWriter';

/**
 * Register (or refresh) the global `demo-builder` MCP entry.
 *
 * @param extensionDistPath Absolute path to the extension's `dist/` directory.
 * @param nodePath Node binary for the entry; resolved via `resolveNodePath`
 *                 when omitted (tests inject it to stay hermetic).
 * @returns The path of the config file written (for user-facing messaging).
 * @throws When `~/.claude.json` exists but is malformed — never overwrite a
 *         valid-but-unreadable user-curated config.
 */
export async function registerGlobalMcp(
    extensionDistPath: string,
    nodePath?: string,
): Promise<string> {
    const configPath = path.join(os.homedir(), '.claude.json');

    let config: Record<string, unknown> = {};
    try {
        const raw = await fsPromises.readFile(configPath, 'utf-8');
        try {
            config = JSON.parse(raw) as Record<string, unknown>;
        } catch (err) {
            throw new Error(
                `~/.claude.json is malformed — refusing to overwrite valid-but-unreadable ` +
                    `user config: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw err;
        }
        // Missing file — start with an empty object
    }

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        config.mcpServers = {};
    }

    const resolvedNode = nodePath ?? (await resolveNodePath());
    // Deliberately NO env: an explicit DEMO_BUILDER_MCP_SOCKET would pin the
    // global entry to one workspace; omitting it enables per-launch discovery.
    (config.mcpServers as Record<string, unknown>)['demo-builder'] = {
        command: resolvedNode,
        args: [path.join(extensionDistPath, 'mcp-proxy.js')],
    };

    await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return configPath;
}
