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

/**
 * Correct an EXISTING global entry that no longer points at this build.
 *
 * The entry embeds `context.extensionPath`, and VS Code names that directory with
 * the version — so every extension update invalidates whatever was written, and
 * until 2026-08-13 nothing re-wrote it. A colleague's CLI ended up refusing to
 * add any MCP server, reporting user scope (beta.111, the retired
 * `mcp-server.js`) and project scope (beta.128, `mcp-proxy.js`) as conflicting
 * endpoints with separate OAuth tokens.
 *
 * The rule is narrow on purpose: **correct what the user already opted into, and
 * never opt them in.** An absent entry stays absent — global registration remains
 * the explicit "Register Global MCP" choice.
 *
 * Safe on the COMMON path: a read, a parse and two comparisons, with no write
 * unless something actually differs, so it cannot churn a user-owned file on
 * every launch. The repair path is heavier — `registerGlobalMcp` calls
 * `resolveNodePath`, which spawns `which` and `realpath` — but that runs only
 * when the entry is genuinely stale, i.e. once per extension update.
 *
 * Staleness is judged on BOTH halves of the entry:
 *   - `args[0]` must be this build's `mcp-proxy.js`
 *   - `command` must still exist, when it is an absolute path
 *
 * The command check uses `access`, not a fresh `resolveNodePath`: re-resolving
 * node to compare would put those two spawns on every activation, and the point
 * is to keep the common path cheap. A bare `node` is left alone — PATH lookup is
 * not something `access` can answer, and a phantom repair is worse than a missed
 * one.
 *
 * @param extensionDistPath Absolute path to THIS build's `dist/` directory.
 * @param nodePath Node binary; resolved via `resolveNodePath` when omitted.
 * @returns True when the entry was repaired; false when absent, already correct,
 *          or the config could not be read.
 */
export async function refreshGlobalMcpIfPresent(
    extensionDistPath: string,
    nodePath?: string,
): Promise<boolean> {
    const configPath = path.join(os.homedir(), '.claude.json');

    let config: Record<string, unknown>;
    try {
        config = JSON.parse(await fsPromises.readFile(configPath, 'utf-8')) as Record<
            string,
            unknown
        >;
    } catch {
        // Absent, unreadable, or malformed. A repair pass is not the place to
        // report that — and never the place to overwrite it.
        return false;
    }

    const servers = config.mcpServers;
    if (!servers || typeof servers !== 'object') return false;
    const entry = (servers as Record<string, { args?: string[] } | undefined>)['demo-builder'];
    if (!entry) return false;

    const expected = path.join(extensionDistPath, 'mcp-proxy.js');
    const argsCurrent = entry.args?.length === 1 && entry.args[0] === expected;
    if (!argsCurrent) {
        await registerGlobalMcp(extensionDistPath, nodePath);
        return true;
    }

    // Correct args are not enough: the node binary can vanish independently (an
    // fnm/nvm multishell path that did not survive a reboot), and that entry is
    // just as broken while looking current.
    const command = (entry as { command?: string }).command;
    if (command && path.isAbsolute(command)) {
        try {
            await fsPromises.access(command);
        } catch {
            await registerGlobalMcp(extensionDistPath, nodePath);
            return true;
        }
    }

    return false;
}
