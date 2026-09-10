/**
 * MCP Config Writer
 *
 * Generates MCP configuration files for AI agents working in a Demo Builder project.
 *
 * Writes only the Demo Builder MCP entry. Adobe-hosted MCPs (DA.live, Commerce,
 * AEM Content) are available at Claude Code's session level — users set them up
 * once via Claude Code's catalog and they appear in every project. Cursor and
 * Codex read `.mcp.json` natively, so no per-tool config files are written.
 *
 * Files written per project:
 * - `.claude/mcp.json` — Claude Code project config
 * - `.mcp.json` — Claude Code project-scope config at the project root
 * - `.claude/settings.json` — PostToolUse git-sync hook for EDS projects
 *
 * The settings content (git-sync hook + edit-preserving merge) lives in
 * `claudeSettingsWriter.ts`; this module writes the files.
 */

import * as childProcess from 'child_process';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import aiDefaultsConfig from '../../config/ai-defaults.json';
import { resolveMcpToolsDir } from './aiDefaultsInstaller';
import { aiDefaultsEntryApplies } from './aiToolingGate';
import {
    generateClaudeSettings,
    mergeClaudeSettings,
    parseExistingSettings,
} from './claudeSettingsWriter';
import type { GeneratedFileWriter } from './generatedFileWriter';
import { getLogger } from '@/core/logging/debugLogger';
import { resolveMcpSocketPath } from '@/core/utils/mcpSocketPath';
import type { AiDefaults } from '@/types/aiDefaults';
import type { Project } from '@/types/base';

const execFile = promisify(childProcess.execFile);

const aiDefaults: AiDefaults = aiDefaultsConfig as AiDefaults;

// ─── MCP entry shape ──────────────────────────────────────────────────────────

export interface McpServerEntry {
    command: string;
    args: string[];
    env?: Record<string, string>;
}

interface McpConfig {
    mcpServers: Record<string, McpServerEntry>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write MCP config files for the project.
 * Always writes `.claude/mcp.json`, `.mcp.json` (project root — Claude Code project-scope),
 * and `.claude/settings.json` (PostToolUse hook for EDS projects).
 *
 * Every bundle file lands through the ADR-013 `GeneratedFileWriter` seam:
 * the two mcp.json files hash-and-skip (a user-edited `.mcp.json` is left in
 * place and reported — they own it, at the cost of silent path repair), and
 * `.claude/settings.json` goes through `writeMerged` because the merged
 * content ALREADY incorporates the user's edits (skipping would freeze our
 * git-sync hook the moment a user adds any setting). No bundle write outside
 * the seam. The `.gitignore` upkeep is append-only maintenance, not bundle
 * content — it stays outside the seam by design.
 *
 * `nodePath` is the pre-resolved Node binary (see `resolveNodePath`); pass it
 * to skip re-resolving when refreshing many projects.
 */
export async function writeMcpConfigs(
    projectPath: string,
    project: Project,
    extensionDistPath: string,
    writer: GeneratedFileWriter,
    nodePath?: string,
): Promise<void> {
    // Resolve the Node binary once and thread it to BOTH the MCP proxy entry
    // and the git-sync hook extractor (which parses tool input via `node -e`).
    const resolvedNode = nodePath ?? (await resolveNodePath());

    const mcpConfig = await buildMcpConfig(extensionDistPath, project, resolvedNode);
    const mcpJson = JSON.stringify(mcpConfig, null, 2);

    await writer.write('.claude/mcp.json', mcpJson);
    await writer.write('.mcp.json', mcpJson);

    // Edit-preserving: MERGE our git-sync hook into any existing settings.json
    // instead of overwriting it, so a regenerate never wipes the user's own
    // hooks / permissions / env. Our entry is identified by its stable git-sync
    // signature, so a path change refreshes it (no duplicate) and a non-EDS
    // project just drops it (keeping the user's content).
    const settingsPath = path.join(projectPath, '.claude', 'settings.json');
    const existingSettings = parseExistingSettings(await readOrUndefined(settingsPath));
    const desiredSettings = generateClaudeSettings(project, resolvedNode);
    const merged = mergeClaudeSettings(existingSettings, desiredSettings);
    await writer.writeMerged('.claude/settings.json', JSON.stringify(merged, null, 2));

    await ensureMcpFilesGitignored(projectPath);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Read a file's content, or `undefined` when it is absent/unreadable — the
 * settings merge treats both the same way (nothing to merge into).
 */
async function readOrUndefined(filePath: string): Promise<string | undefined> {
    try {
        return await fsPromises.readFile(filePath, 'utf-8');
    } catch {
        return undefined;
    }
}

/**
 * Resolve the absolute path to the Node.js binary.
 *
 * `process.execPath` inside VS Code returns the Electron helper binary, not
 * the system Node.js — so a standalone MCP server script can't use it.
 * This function shells out to find the real `node` binary.
 *
 * Falls back to `process.execPath` if resolution fails (better than nothing —
 * user can fix the path manually in ~/.claude/.mcp.json).
 */
export async function resolveNodePath(): Promise<string> {
    try {
        // `which node` finds the node binary (resolves fnm/nvm shims)
        const { stdout: whichOut } = await execFile('which', ['node']);
        const whichPath = whichOut.trim();
        if (!whichPath || !path.isAbsolute(whichPath)) return process.execPath;

        // Resolve symlinks to get the STABLE path. fnm creates ephemeral
        // multishell paths (~/.local/state/fnm_multishells/PID_*/bin/node)
        // that don't survive reboots. realpath follows the symlink chain to
        // the installed version (~/.local/share/fnm/node-versions/vX/installation/bin/node).
        try {
            const { stdout: realOut } = await execFile('realpath', [whichPath]);
            const realPath = realOut.trim();
            if (realPath && path.isAbsolute(realPath)) return realPath;
        } catch {
            // realpath not available — use the which result as-is
        }

        return whichPath;
    } catch {
        // `which` not available or node not on PATH
    }
    return process.execPath;
}

/**
 * Build the `demo-builder` MCP entry: the stdio→UDS proxy pointed at an explicit
 * socket path. The in-extension server (when the matching folder is the open
 * workspace) listens on that same path. Stable across restarts — no
 * per-activation rewrite needed.
 *
 * Shared by the per-project writer (socket keyed to `project.path`) and the home
 * writer (socket keyed to the projects root). `nodePath` may be supplied by the
 * caller to avoid resolving it twice; otherwise it is resolved here.
 */
export async function buildDemoBuilderMcpEntry(
    extensionDistPath: string,
    socketPath: string,
    nodePath?: string,
): Promise<McpServerEntry> {
    const resolvedNode = nodePath ?? (await resolveNodePath());
    return {
        command: resolvedNode,
        args: [path.join(extensionDistPath, 'mcp-proxy.js')],
        env: { DEMO_BUILDER_MCP_SOCKET: socketPath },
    };
}

async function buildMcpConfig(
    extensionDistPath: string,
    project: Project,
    nodePath: string,
): Promise<McpConfig> {
    // The in-extension MCP server listens on a socket keyed to the OPEN
    // WORKSPACE — under the always-root home-Chat model (PR #36) that's the
    // projects root, not any individual project. Point the proxy at THAT
    // root socket so the per-project mcp.json reaches the live server.
    // (Keying to project.path produced "demo-builder: timed out" in the AI
    // Capabilities modal whenever the workspace was the projects root.)
    const mcpServers: Record<string, McpServerEntry> = {
        'demo-builder': await buildDemoBuilderMcpEntry(
            extensionDistPath,
            resolveMcpSocketPath(path.dirname(project.path)),
            nodePath,
        ),
    };

    // ai-defaults.json packages install into the per-project ISOLATED MCP tools
    // dir (`<project>/.demo-builder-mcp/node_modules/...`) — decoupled from the
    // storefront manifest, whose own `npm install` can abort on b2b @dropins.
    // Claude Code spawns each MCP with cwd = wherever it was launched
    // (= project.path, not the tools dir), so relative `node_modules/...` refs
    // would not resolve; anchor each declared arg to the isolated dir. Each
    // entry gates itself via its `requires` field: the Developer Agent tooling
    // applies to any App Builder-adjacent project (storefront, mesh, or
    // attached component); Playwright stays storefront-only.
    const toolsDir = resolveMcpToolsDir(project.path);
    for (const entry of aiDefaults.mcpServers) {
        if (!aiDefaultsEntryApplies(entry, project)) continue;
        mcpServers[entry.id] = {
            command: entry.command,
            args: entry.args.map((arg) => (path.isAbsolute(arg) ? arg : path.join(toolsDir, arg))),
        };
    }

    return { mcpServers };
}

/**
 * Entries to add to the project's .gitignore for generated MCP config files.
 * These files contain machine-specific paths — not for git.
 */
const MCP_GITIGNORE_ENTRIES: ReadonlyArray<string> = [
    '.mcp.json',
    '.claude/mcp.json',
    '.claude/settings.json',
];

/**
 * Ensure the project's .gitignore excludes generated MCP config files.
 * Appends only entries that are not already present — idempotent.
 *
 * Outside the ADR-013 seam by design (the seam's hash-and-skip would fight the
 * append-only contract), but it carries the seam's SYMLINK guard: `appendFile`
 * follows links, so a planted `.gitignore → ~/.gitconfig` would get this block
 * appended to an arbitrary user file on every sweep repair (2026-08-14 review).
 */
async function ensureMcpFilesGitignored(projectPath: string): Promise<void> {
    const gitignorePath = path.join(projectPath, '.gitignore');

    let isSymlink = false;
    try {
        isSymlink = (await fsPromises.lstat(gitignorePath)).isSymbolicLink();
    } catch {
        // File may not exist yet — the append creates it.
    }
    if (isSymlink) {
        getLogger().warn(
            '[AI Bundle] Refusing to update .gitignore — it is a symlink; ' +
                'MCP config files may be accidentally committed',
        );
        return;
    }

    let existing = '';
    try {
        existing = await fsPromises.readFile(gitignorePath, 'utf-8');
    } catch {
        // File may not exist yet — start empty
    }

    const toAdd = MCP_GITIGNORE_ENTRIES.filter(
        (entry) => !existing.split('\n').some((line) => line.trim() === entry),
    );

    if (toAdd.length === 0) return;

    const section = '\n# MCP config files (generated by Demo Builder)\n' + toAdd.join('\n') + '\n';
    try {
        await fsPromises.appendFile(gitignorePath, section, 'utf-8');
    } catch (err) {
        // Non-fatal: project creation continues, but warn (through the logging
        // system, where every other [AI Bundle] line lands) so the user knows
        // the MCP config files are not gitignored.
        getLogger().warn(
            `[AI Bundle] Could not update .gitignore — MCP config files ` +
                `(${toAdd.join(', ')}) may be accidentally committed: ` +
                `${err instanceof Error ? err.message : String(err)}`,
        );
    }
}
