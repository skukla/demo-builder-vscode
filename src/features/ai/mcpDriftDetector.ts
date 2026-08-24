/**
 * detectMcpDrift — a cheap, pure, network-free probe: do the declared MCP-server
 * arg paths resolve on disk?
 *
 * Projects created before a given MCP package was added (or copied/moved across
 * directories) can end up with a `.claude/mcp.json` pointing at files that no
 * longer exist — the silent MODULE_NOT_FOUND / "Connection closed" failure that
 * only showed up in logs. This detector is the P1-safe half of the open-time
 * self-heal: it only does `fs.readFile` + `fs.access` (no spawn, no fetch), so
 * it's safe to run automatically on dashboard open. The heal it gates (npm
 * install + regen) is real work and is only run on confirmed drift, visibly.
 *
 * TWO SCOPES, because both go stale the same way (2026-08-13):
 *   - the project's `.claude/mcp.json`
 *   - the user's `~/.claude.json`, when it carries a `demo-builder` entry
 *
 * Both embed the extension's `dist/` path, and VS Code names that directory with
 * the VERSION — so every update invalidates whatever was written. The project
 * copy is rewritten whenever a regenerate runs; the user copy is written once by
 * the opt-in "Register Global MCP" command and never touched again.
 *
 * `demo-builder` used to be skipped here as "extension-managed, not a project
 * tool path". The extension does WRITE it — but never re-writes it, so managed
 * meant written once and forgotten. A colleague's CLI ended up refusing to add
 * any MCP server, reporting the two scopes as conflicting endpoints (user on
 * beta.111's retired `mcp-server.js`, project on beta.128's `mcp-proxy.js`).
 *
 * @module features/ai/mcpDriftDetector
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { resolveMcpToolsDir } from '@/features/project-creation/services/aiBundle/aiDefaultsInstaller';
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

/** The extension's own entry, in either scope. */
const EXTENSION_PROXY_ID = 'demo-builder';

/**
 * The retired standalone server. `esbuild.config.js` has one MCP entry point —
 * `src/mcp-proxy.ts` → `dist/mcp-proxy.js` — so any entry still naming this is
 * stale even when the directory it names happens to exist.
 */
const RETIRED_ENTRY_POINT = 'mcp-server.js';

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
 * Read the user-scope config. Absent, unreadable or malformed all mean "nothing
 * to check" — never an error. This runs on dashboard open, and `~/.claude.json`
 * is user-owned state we only ever read here.
 */
async function readUserMcpJson(): Promise<McpJsonShape | null> {
    try {
        const raw = await fsPromises.readFile(path.join(os.homedir(), '.claude.json'), 'utf-8');
        return parseJSON<McpJsonShape>(raw);
    } catch {
        return null;
    }
}

/**
 * Collect the missing (or retired) paths declared by one server entry.
 *
 * `absoluteOnly` is set for our own `demo-builder` entry: both writers emit an
 * absolute `path.join(extensionDistPath, 'mcp-proxy.js')`, so a relative arg
 * there is not something we wrote and must not be resolved against the PROJECT's
 * tools dir — that would invent a path that was never going to exist and report
 * it as drift.
 */
async function missingArgsFor(
    args: string[] | undefined,
    toolsDir: string,
    absoluteOnly = false,
): Promise<string[]> {
    const missing: string[] = [];
    for (const arg of args ?? []) {
        if (!isPathArg(arg)) continue;
        if (absoluteOnly && !path.isAbsolute(arg)) continue;
        const resolved = path.isAbsolute(arg) ? arg : path.join(toolsDir, arg);
        // A retired entry point is stale even when its directory still exists,
        // so check the name before touching the disk.
        if (path.basename(resolved) === RETIRED_ENTRY_POINT) {
            missing.push(resolved);
            continue;
        }
        try {
            await fsPromises.access(resolved);
        } catch {
            missing.push(resolved);
        }
    }
    return missing;
}

/**
 * Resolve every declared MCP server's filesystem args — in the project's
 * `.claude/mcp.json` AND in the user's `~/.claude.json` — and report any that are
 * missing on disk. Missing/malformed config → `{ drifted: false }`.
 *
 * The `demo-builder` entry is checked rather than skipped: it pins the
 * extension's versioned `dist/` path in both scopes, so it is precisely the entry
 * that rots on update. See the module docstring.
 */
export async function detectMcpDrift(projectPath: string): Promise<McpDriftResult> {
    const toolsDir = resolveMcpToolsDir(projectPath);
    const missing: string[] = [];

    const projectConfig = await readMcpJson(projectPath);
    for (const [id, cfg] of Object.entries(projectConfig?.mcpServers ?? {})) {
        missing.push(...(await missingArgsFor(cfg.args, toolsDir, id === EXTENSION_PROXY_ID)));
    }

    // User scope: ONLY our own entry. Everything else in that file belongs to
    // other tools and to the user; a broken path there is not ours to report.
    const userConfig = await readUserMcpJson();
    const userEntry = userConfig?.mcpServers?.[EXTENSION_PROXY_ID];
    if (userEntry) {
        missing.push(...(await missingArgsFor(userEntry.args, toolsDir, true)));
    }

    // Both scopes can name the SAME stale path — the common case right after an
    // update. Report it once; this list is shown to a user.
    return { drifted: missing.length > 0, missing: [...new Set(missing)] };
}
