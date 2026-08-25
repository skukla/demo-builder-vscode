/**
 * The MCP config an evaluation run is launched with.
 *
 * An evaluation must reach a server that is IN DRY RUN, and only that one. The
 * obvious route — an environment variable on the spawn — does not work: the
 * project's `.mcp.json` pins `DEMO_BUILDER_MCP_SOCKET` in the server entry's own
 * `env` block, and Claude Code re-applies that block over the inherited
 * environment. (Same trap the battery README records for `ENABLE_TOOL_SEARCH`.)
 *
 * So the run is launched with `--mcp-config <json> --strict-mcp-config`, and
 * this module builds that json.
 *
 * ## Why the project's OTHER servers must survive
 *
 * `--strict-mcp-config` ignores every other MCP configuration. Handed a config
 * containing only demo-builder, an evaluation would run without Playwright and
 * anything else the project declares — measuring a path the producer would never
 * take, which contradicts the reason reads execute during a dry run at all.
 *
 * So this takes the project's own `.mcp.json` and swaps ONE value: the
 * demo-builder entry's socket. Everything else passes through untouched.
 *
 * @module features/ai/evaluation/evaluationMcpConfig
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { parseJSON } from '@/types/typeGuards';

/** The demo-builder server's key in a generated `.mcp.json`. */
const DEMO_BUILDER_KEY = 'demo-builder';

/** The shape of a `.mcp.json`, as far as this module needs it. */
interface McpConfigFile {
    mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>;
}

/**
 * Build the config for an evaluation run.
 *
 * @param projectPath - the project the prompt is evaluated against
 * @param evaluationSocketPath - the dry-run server's socket
 * @returns the config as a JSON string for `--mcp-config`, or undefined when the
 *   project has no `.mcp.json` to base it on
 */
export async function buildEvaluationMcpConfig(
    projectPath: string,
    evaluationSocketPath: string,
): Promise<string | undefined> {
    let raw: string;
    try {
        raw = await fsPromises.readFile(path.join(projectPath, '.mcp.json'), 'utf-8');
    } catch {
        // No bundle to base it on. The caller decides what that means — running
        // WITHOUT the flag would silently reach the main server and defeat the
        // whole point, so it must not fall back to that.
        return undefined;
    }

    const parsed = parseJSON<McpConfigFile>(raw);
    const servers = parsed?.mcpServers;
    if (!servers?.[DEMO_BUILDER_KEY]) {
        // A config with no demo-builder entry cannot be pointed at the dry-run
        // server, and passing it through would run the evaluation against the
        // main one.
        return undefined;
    }

    const entry = servers[DEMO_BUILDER_KEY];
    return JSON.stringify({
        mcpServers: {
            ...servers,
            [DEMO_BUILDER_KEY]: {
                ...entry,
                // The ONE value that changes. `env` is spread first so any other
                // variable the bundle sets survives.
                env: { ...(entry.env ?? {}), DEMO_BUILDER_MCP_SOCKET: evaluationSocketPath },
            },
        },
    });
}
