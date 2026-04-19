/**
 * MCP Config Writer
 *
 * Generates and writes MCP configuration files for AI tools (Claude Code, Cursor, Codex CLI)
 * and the Claude Code PostToolUse hook settings.
 *
 * Written into each project directory at creation time so AI agents can use the Demo Builder
 * MCP server and external Adobe MCPs without manual configuration.
 *
 * Known Limitations (unverified assumptions — see [Unreleased] in CHANGELOG):
 * - PostToolUse hook env var for the modified file path is $CLAUDE_TOOL_INPUT parsed for file_path.
 *   Not verified against Claude Code hooks docs. If wrong, the hook silently does nothing.
 * - Codex CLI uses the same { mcpServers: {...} } format as Claude Code (.codex/mcp.json).
 *   Not verified against OpenAI Codex CLI docs. If wrong, the generated .codex/mcp.json is ignored.
 */

import * as childProcess from 'child_process';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';

const execFile = promisify(childProcess.execFile);

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AiSettings {
    /** Which external MCP servers to include (from demoBuilder.ai.externalMcpServers) */
    externalMcpServers: string[];
    /** Which AI tools to generate config files for (from demoBuilder.ai.mcpConfigTargets) */
    mcpConfigTargets: string[];
}

// ─── MCP entry shape (shared across all tools) ───────────────────────────────

interface McpServerEntry {
    /** Stdio server: executable command */
    command?: string;
    /** Stdio server: arguments */
    args?: string[];
    /** Stdio server: environment variables */
    env?: Record<string, string>;
    /** Remote HTTP server: URL */
    url?: string;
}

interface McpConfig {
    mcpServers: Record<string, McpServerEntry>;
}

// ─── Claude Settings types ────────────────────────────────────────────────────

interface HookEntry {
    type: string;
    command: string;
}

interface PostToolUseHook {
    matcher: string;
    hooks: HookEntry[];
}

interface ClaudeSettings {
    hooks?: {
        PostToolUse?: PostToolUseHook[];
    };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write MCP config files for all enabled AI tool targets.
 * Always writes .mcp.json (project root — Claude Code project-scope config),
 * .claude/mcp.json, and .claude/settings.json.
 * Only writes .cursor/mcp.json and .codex/mcp.json if selected.
 *
 * Also adds the generated MCP config files to the project's .gitignore so they
 * are not committed — they contain session tokens and machine-specific paths.
 */
export async function writeMcpConfigs(
    projectPath: string,
    project: Project,
    extensionDistPath: string,
    settings: AiSettings,
    options?: { helixToken?: string },
): Promise<void> {
    const writeJson = async (filePath: string, data: unknown): Promise<void> => {
        await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
        await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    };

    // Build config once — all targets use the same server list
    const mcpConfig = await buildMcpConfig(project, extensionDistPath, settings, options?.helixToken);

    // Always write Claude Code configs
    await writeJson(path.join(projectPath, '.claude', 'mcp.json'), mcpConfig);
    await writeJson(path.join(projectPath, '.mcp.json'), mcpConfig);

    // Always write Claude Code settings (PostToolUse hooks)
    const claudeSettings = generateClaudeSettings(project);
    await writeJson(path.join(projectPath, '.claude', 'settings.json'), claudeSettings);

    // Optional: Cursor
    if (settings.mcpConfigTargets.includes('cursor')) {
        await writeJson(path.join(projectPath, '.cursor', 'mcp.json'), mcpConfig);
    }

    // Optional: Codex CLI
    if (settings.mcpConfigTargets.includes('codex')) {
        await writeJson(path.join(projectPath, '.codex', 'mcp.json'), mcpConfig);
    }

    // Ensure generated MCP files are gitignored (they hold session tokens + machine paths)
    await ensureMcpFilesGitignored(projectPath, settings);
}


/**
 * Write the global MCP config entry for Claude Code (~/.claude/settings.json).
 *
 * Reads existing settings, preserves all keys, and upserts the demo-builder
 * MCP server entry. No DEMO_BUILDER_PROJECTS_DIR env var — the server uses
 * its built-in default (~/.demo-builder/projects).
 *
 * Idempotent — safe to call on every extension activation.
 */
export async function writeGlobalMcpConfig(extensionDistPath: string): Promise<void> {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

    // Read existing settings (gracefully handle missing/invalid)
    let settings: Record<string, unknown> = {};
    try {
        const raw = await fsPromises.readFile(settingsPath, 'utf-8');
        settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        // File missing or invalid JSON — start fresh
    }

    // Ensure mcpServers key exists
    if (!settings.mcpServers || typeof settings.mcpServers !== 'object') {
        settings.mcpServers = {};
    }

    // Upsert demo-builder entry with the real Node.js binary path
    const nodePath = await resolveNodePath();
    (settings.mcpServers as Record<string, unknown>)['demo-builder'] = {
        command: nodePath,
        args: [`${extensionDistPath}/mcp-server.js`],
    };

    await fsPromises.mkdir(path.dirname(settingsPath), { recursive: true });
    await fsPromises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Generate .claude/settings.json with PostToolUse git sync hook.
 * Hook is only added when the project has an EDS storefront with a local path
 * and that path contains no shell metacharacters.
 */
export function generateClaudeSettings(project: Project): ClaudeSettings {
    const storefrontPath = resolveStorefrontPath(project);
    if (!storefrontPath) {
        return {};
    }

    const command = buildGitSyncCommand(storefrontPath);
    if (!command) {
        // Path contained shell metacharacters — skip hook for safety
        return {};
    }

    return {
        hooks: {
            PostToolUse: [
                {
                    matcher: 'Write|Edit',
                    hooks: [{ type: 'command', command }],
                },
            ],
        },
    };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Resolve the absolute path to the Node.js binary.
 *
 * `process.execPath` inside VS Code returns the Electron helper binary, not
 * the system Node.js — so a standalone MCP server script can't use it.
 * This function shells out to find the real `node` binary.
 *
 * Falls back to `process.execPath` if resolution fails (better than nothing —
 * user can fix the path manually in ~/.claude/settings.json).
 */
async function resolveNodePath(): Promise<string> {
    try {
        // `which node` works on macOS/Linux; resolves fnm/nvm shims
        const { stdout } = await execFile('which', ['node']);
        const resolved = stdout.trim();
        if (resolved && path.isAbsolute(resolved)) return resolved;
    } catch {
        // `which` not available or node not on PATH
    }
    return process.execPath;
}

async function buildMcpConfig(
    project: Project,
    extensionDistPath: string,
    settings: AiSettings,
    helixToken?: string,
): Promise<McpConfig> {
    const servers: Record<string, McpServerEntry> = {};

    // Demo Builder MCP (always included — multi-project mode, no env vars needed)
    const nodePath = await resolveNodePath();
    servers['demo-builder'] = {
        command: nodePath,
        args: [`${extensionDistPath}/mcp-server.js`],
    };

    // External servers (included only when selected)
    for (const serverId of settings.externalMcpServers) {
        const entry = buildExternalServerEntry(serverId, project, helixToken);
        if (entry) {
            servers[serverId] = entry;
        }
    }

    return { mcpServers: servers };
}

function buildExternalServerEntry(
    serverId: string,
    project: Project,
    helixToken?: string,
): McpServerEntry | null {
    switch (serverId) {
        case 'da-live':
            return { url: 'https://mcp.adobeaemcloud.com/adobe/mcp/da' };

        case 'aem-content':
            return { url: 'https://mcp.adobeaemcloud.com/adobe/mcp/content' };

        case 'aem-eds': {
            const token = resolveHelixToken(project, helixToken);
            return {
                command: 'npx',
                args: ['-y', '@neerajgrg93/aem-eds-mcp-server@1.0.0'],
                env: { HELIX_ADMIN_API_TOKEN: token },
            };
        }

        case 'adobe-commerce-dev':
            return {
                command: 'npx',
                args: ['-y', '@rafaelcg/adobe-commerce-dev-mcp@1.0.3'],
            };

        default:
            return null;
    }
}

function resolveStorefrontPath(project: Project): string | undefined {
    return project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path;
}

/**
 * Resolve the Helix Admin API token.
 *
 * Priority:
 * 1. Token stored in project component metadata (from a previous user save)
 * 2. Live DA.live session token (same Adobe IMS Bearer token the extension uses
 *    for all Helix admin operations — no separate manual entry needed)
 * 3. Empty string (field left blank; user can fill it in later)
 */
function resolveHelixToken(project: Project, sessionToken?: string): string {
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const stored = edsInstance?.metadata?.['HELIX_ADMIN_API_TOKEN'] as string | undefined;
    return stored || sessionToken || '';
}

/**
 * Shell metacharacters that could enable injection in the hook command.
 * Includes: quotes/backtick (`"'\`), variable expansion ($), command separators (;|&),
 * redirects (<>), escapes (\\), globs (*?[]), process substitution ((){}), and newlines.
 */
const SHELL_METACHAR_RE = /["`$;|&<>\n\r\\'*?[\](){} \t]/;

/**
 * Build the PostToolUse git sync shell command for the storefront path.
 *
 * Returns an empty string (no hook installed) if `storefrontPath` contains
 * shell metacharacters — an attacker-controlled path must not become part of
 * an executed shell command.
 */
function buildGitSyncCommand(storefrontPath: string): string {
    if (SHELL_METACHAR_RE.test(storefrontPath)) {
        // Unsafe path — skip hook rather than risk shell injection
        return '';
    }

    // PostToolUse hook: after Write or Edit, if the modified file is inside the
    // storefront directory, auto-commit and push.
    //
    // ASSUMPTION: Claude Code hook env var for the modified file is available via
    // CLAUDE_TOOL_INPUT (JSON string). Using bash to parse the file_path field.
    // Verify the exact variable name against Claude Code hooks documentation.
    //
    // TODO(phase-2): Replace grep-o/sed parser with jq for robustness. The current approach
    // is fragile — it will fail if the JSON format changes or if the file_path value contains
    // characters that break the regex. The SHELL_METACHAR_RE guard above prevents the
    // worst-case injection vectors, making this acceptable for Phase 1.
    const escapedPath = storefrontPath.replace(/"/g, '\\"');
    return (
        `TOOL_FILE=$(echo "$CLAUDE_TOOL_INPUT" | ` +
        `grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | ` +
        `sed 's/"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//'); ` +
        `if [[ "$TOOL_FILE" == "${escapedPath}"* ]]; then ` +
        `git -C "${escapedPath}" add -A && ` +
        `git -C "${escapedPath}" commit -m "AI: sync files" && ` +
        `git -C "${escapedPath}" push; fi`
    );
}

/**
 * Entries to add to the project's .gitignore for generated MCP config files.
 * These files contain session tokens and machine-specific paths — not for git.
 */
const MCP_GITIGNORE_ENTRIES: ReadonlyArray<string> = [
    '.mcp.json',
    '.claude/mcp.json',
    '.claude/settings.json',
    '.cursor/mcp.json',
    '.codex/mcp.json',
];

/**
 * Ensure the project's .gitignore excludes generated MCP config files.
 * Appends only entries that are not already present — idempotent.
 */
async function ensureMcpFilesGitignored(projectPath: string, settings: AiSettings): Promise<void> {
    const gitignorePath = path.join(projectPath, '.gitignore');

    let existing = '';
    try {
        existing = await fsPromises.readFile(gitignorePath, 'utf-8');
    } catch {
        // File may not exist yet — start empty
    }

    const toAdd = MCP_GITIGNORE_ENTRIES.filter(entry => {
        // Only add entries for targets that were actually written
        if (entry.startsWith('.cursor') && !settings.mcpConfigTargets.includes('cursor')) return false;
        if (entry.startsWith('.codex') && !settings.mcpConfigTargets.includes('codex')) return false;
        return !existing.split('\n').some(line => line.trim() === entry);
    });

    if (toAdd.length === 0) return;

    const section = '\n# MCP config files (contain session tokens — generated by Demo Builder)\n' +
        toAdd.join('\n') + '\n';
    try {
        await fsPromises.appendFile(gitignorePath, section, 'utf-8');
    } catch (err) {
        // Non-fatal: project creation continues, but warn so the user knows the
        // MCP config files containing session tokens are not gitignored.
        process.stderr.write(
            `[Demo Builder] WARNING: Could not update .gitignore — MCP config files ` +
            `(${toAdd.join(', ')}) may be accidentally committed. Error: ` +
            `${err instanceof Error ? err.message : String(err)}\n`,
        );
    }
}
