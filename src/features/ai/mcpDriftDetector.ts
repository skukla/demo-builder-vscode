/**
 * detectMcpDrift — a cheap, pure, network-free probe: do this project's declared
 * MCP-server arg paths resolve on disk?
 *
 * Projects created before a given MCP package was added (or copied/moved across
 * directories) can end up with a `.claude/mcp.json` pointing at files that no
 * longer exist — the silent MODULE_NOT_FOUND / "Connection closed" failure that
 * only showed up in logs. This detector is the P1-safe half of the open-time
 * self-heal: it only does `fs.readFile` + `fs.access` (no spawn, no fetch), so
 * it's safe to run automatically on dashboard open. The heal it gates (npm
 * install + regen) is real work and is only run on confirmed drift, visibly.
 *
 * @module features/ai/mcpDriftDetector
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { resolveMcpToolsDir } from '@/features/project-creation/services/aiDefaultsInstaller';
import { parseJSON } from '@/types/typeGuards';

export interface McpDriftResult {
    /** True when at least one declared server arg path is missing on disk. */
    drifted: boolean;
    /** The resolved paths that don't exist (for the heal log + UI detail). */
    missing: string[];
}

/** Minimal shape we read from `.claude/mcp.json` (mirrors mcpInspector's). */
interface McpJsonShape {
    mcpServers?: Record<string, { args?: string[] }>;
}

/** The extension's own in-process proxy — its arg is `dist/mcp-proxy.js`, not a project tool. */
const EXTENSION_PROXY_ID = 'demo-builder';

/** Does this arg look like a filesystem path we should stat? */
function isPathArg(arg: string): boolean {
    return /\.(c|m)?js$/.test(arg) || arg.includes('node_modules');
}

async function readMcpJson(projectPath: string): Promise<McpJsonShape | null> {
    const filePath = path.join(projectPath, '.claude', 'mcp.json');
    let raw: string;
    try {
        raw = await fsPromises.readFile(filePath, 'utf-8');
    } catch {
        // Missing (or unreadable) file → AI-not-setup, not stale-path drift.
        return null;
    }
    return parseJSON<McpJsonShape>(raw);
}

/**
 * Resolve each declared MCP server's filesystem args and report any that are
 * missing on disk. Missing/malformed `.mcp.json` → `{ drifted: false }`.
 */
export async function detectMcpDrift(projectPath: string): Promise<McpDriftResult> {
    const config = await readMcpJson(projectPath);
    if (!config?.mcpServers) return { drifted: false, missing: [] };

    const toolsDir = resolveMcpToolsDir(projectPath);
    const missing: string[] = [];

    for (const [id, cfg] of Object.entries(config.mcpServers)) {
        if (id === EXTENSION_PROXY_ID) continue; // extension-managed; not a project tool path
        for (const arg of cfg.args ?? []) {
            if (!isPathArg(arg)) continue;
            const resolved = path.isAbsolute(arg) ? arg : path.join(toolsDir, arg);
            try {
                await fsPromises.access(resolved);
            } catch {
                missing.push(resolved);
            }
        }
    }

    return { drifted: missing.length > 0, missing };
}
