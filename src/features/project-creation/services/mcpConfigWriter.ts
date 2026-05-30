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
 * Known Limitations (unverified assumptions — see [Unreleased] in CHANGELOG):
 * - PostToolUse hook env var for the modified file path is $CLAUDE_TOOL_INPUT parsed for file_path.
 *   Not verified against Claude Code hooks docs. If wrong, the hook silently does nothing.
 */

import * as childProcess from 'child_process';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import aiDefaultsConfig from '../config/ai-defaults.json';
import { COMPONENT_IDS } from '@/core/constants';
import { resolveMcpSocketPath } from '@/features/ai/server/mcpSocketPath';
import type { AiDefaults } from '@/types/aiDefaults';
import type { Project } from '@/types/base';

const execFile = promisify(childProcess.execFile);

const aiDefaults: AiDefaults = aiDefaultsConfig as AiDefaults;

/**
 * globalState key tracking whether the user has opted into registering
 * demo-builder in the canonical Claude Code user config (~/.claude.json).
 *
 * States:
 *   - undefined:    not registered globally (the default — per-project .mcp.json
 *                   is written at creation and is sufficient for AI agents)
 *   - 'registered': user clicked Register in the dashboard AI tab; the
 *                   demo-builder entry is in ~/.claude.json
 *
 * The legacy 'declined' value is retained in the type for backward
 * compatibility with any previously-persisted state, but is no longer written
 * now that global registration is a manual opt-in rather than an auto-prompt.
 */
export const GLOBAL_MCP_REG_STATE_KEY = 'demoBuilder.ai.globalMcpRegistration';

export type GlobalMcpRegistrationState = 'registered' | 'declined';

// ─── MCP entry shape ──────────────────────────────────────────────────────────

interface McpServerEntry {
    command: string;
    args: string[];
    env?: Record<string, string>;
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
 * Write MCP config files for the project.
 * Always writes `.claude/mcp.json`, `.mcp.json` (project root — Claude Code project-scope),
 * and `.claude/settings.json` (PostToolUse hook for EDS projects).
 *
 * Adds the generated files to the project's .gitignore so they are not committed —
 * they contain machine-specific paths.
 */
export async function writeMcpConfigs(
    projectPath: string,
    project: Project,
    extensionDistPath: string,
): Promise<void> {
    const writeJson = async (filePath: string, data: unknown): Promise<void> => {
        await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
        await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    };

    const mcpConfig = await buildMcpConfig(extensionDistPath, project);

    await writeJson(path.join(projectPath, '.claude', 'mcp.json'), mcpConfig);
    await writeJson(path.join(projectPath, '.mcp.json'), mcpConfig);

    const claudeSettings = generateClaudeSettings(project);
    await writeJson(path.join(projectPath, '.claude', 'settings.json'), claudeSettings);

    await ensureMcpFilesGitignored(projectPath);
}


/**
 * Upsert the demo-builder MCP server entry into Claude Code's canonical
 * user-scope config file: `~/.claude.json` top-level `mcpServers` field
 * (verified against Claude Code v2.1.x on 2026-05-20).
 *
 * Preserves every other field in the file. Idempotent. This is an explicit,
 * user-initiated opt-in (the dashboard AI tab's Register button) — it is never
 * called automatically, so the user always consents by clicking Register.
 *
 * Throws if `~/.claude.json` exists but is malformed, so we never overwrite a
 * valid-but-unreadable user-curated config.
 */
export async function registerGlobalMcp(extensionDistPath: string): Promise<void> {
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

    const nodePath = await resolveNodePath();
    // Global (user-scope) entry carries NO socket env: the proxy derives the
    // per-workspace socket path from its cwd (the project dir Claude is launched
    // in), so one global entry connects to whichever VS Code window has that
    // project open.
    (config.mcpServers as Record<string, unknown>)['demo-builder'] = {
        command: nodePath,
        args: [path.join(extensionDistPath, 'mcp-proxy.js')],
    };

    await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
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
 * user can fix the path manually in ~/.claude/.mcp.json).
 */
async function resolveNodePath(): Promise<string> {
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

async function buildMcpConfig(
    extensionDistPath: string,
    project: Project,
): Promise<McpConfig> {
    const nodePath = await resolveNodePath();
    // Per-project entry: the stdio→UDS proxy with the explicit socket path for
    // this project. The in-extension server (when this project is the open
    // workspace) listens on the same path. Stable across restarts — no
    // per-activation rewrite needed.
    const mcpServers: Record<string, McpServerEntry> = {
        'demo-builder': {
            command: nodePath,
            args: [path.join(extensionDistPath, 'mcp-proxy.js')],
            env: { DEMO_BUILDER_MCP_SOCKET: resolveMcpSocketPath(project.path) },
        },
    };

    // ai-defaults.json packages live under the storefront's node_modules
    // (added as devDeps before `npm install`). Claude Code spawns each MCP
    // with cwd = wherever it was launched (= project.path, not the storefront
    // path), so relative `node_modules/...` refs would not resolve. Anchor
    // each declared arg to the storefront path. Headless projects have no
    // storefront — skip the entries entirely; the packages are not installed
    // anywhere for those projects.
    const storefrontPath = resolveStorefrontPath(project);
    if (storefrontPath) {
        for (const entry of aiDefaults.mcpServers) {
            mcpServers[entry.id] = {
                command: entry.command,
                args: entry.args.map(arg =>
                    path.isAbsolute(arg) ? arg : path.join(storefrontPath, arg),
                ),
            };
        }
    }

    return { mcpServers };
}

function resolveStorefrontPath(project: Project): string | undefined {
    return project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path;
}

/**
 * Shell metacharacters that could enable injection in the hook command.
 * Includes: quotes/backtick (`"'\`), variable expansion ($), command separators (;|&),
 * redirects (<>), escapes (\\), globs (*?[]), process substitution ((){}), and newlines.
 *
 * Whitespace is allowed — macOS users often have paths containing spaces
 * (e.g., `/Users/Some User/...`), and the command quotes the path properly.
 */
const SHELL_METACHAR_RE = /["`$;|&<>\n\r\\'*?[\](){}]/;

/**
 * Build the PostToolUse git sync shell command for the storefront path.
 *
 * Returns an empty string (no hook installed) if `storefrontPath` contains
 * shell metacharacters — an attacker-controlled path must not become part of
 * an executed shell command.
 *
 * JSON-parsing strategy is a tolerant fallback chain so the hook works in
 * environments missing one of the tools:
 *   1. `jq` — primary, robust JSON parser (widely available)
 *   2. `python3` — secondary, present on every modern macOS/Linux install
 *   3. `grep`/`sed` — last-resort regex
 *
 * The chain uses `||` so each tool only runs if the previous one produced
 * empty output (or failed). The query is `.. | objects | .file_path? // empty`
 * for jq, equivalent recursive logic for python3, and a `grep -o` pattern for
 * the last-resort path — all three extract `file_path` at any nesting depth.
 */
function buildGitSyncCommand(storefrontPath: string): string {
    if (SHELL_METACHAR_RE.test(storefrontPath)) {
        // Unsafe path — skip hook rather than risk shell injection
        return '';
    }

    // SHELL_METACHAR_RE already rejects any quote characters, so no further
    // escaping of storefrontPath is needed before interpolating into double-quoted
    // shell arguments. The double quotes preserve any spaces.
    const quoted = `"${storefrontPath}"`;

    const jqExtract = `jq -r '.. | objects | .file_path? // empty' 2>/dev/null`;
    const pythonExtract =
        `python3 -c 'import json,sys\n` +
        `def find(o):\n` +
        `    if isinstance(o,dict):\n` +
        `        if "file_path" in o: print(o["file_path"]); return True\n` +
        `        return any(find(v) for v in o.values())\n` +
        `    if isinstance(o,list):\n` +
        `        return any(find(v) for v in o)\n` +
        `    return False\n` +
        `find(json.load(sys.stdin))' 2>/dev/null`;
    const grepSedExtract =
        `grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | ` +
        `sed 's/"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//'`;

    return (
        `TOOL_FILE=$(echo "$CLAUDE_TOOL_INPUT" | ${jqExtract}); ` +
        `[ -z "$TOOL_FILE" ] && TOOL_FILE=$(echo "$CLAUDE_TOOL_INPUT" | ${pythonExtract}); ` +
        `[ -z "$TOOL_FILE" ] && TOOL_FILE=$(echo "$CLAUDE_TOOL_INPUT" | ${grepSedExtract}); ` +
        `if [[ "$TOOL_FILE" == ${quoted}* ]]; then ` +
        `git -C ${quoted} add -A && ` +
        `git -C ${quoted} commit -m "AI: sync files" && ` +
        `git -C ${quoted} push; fi`
    );
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
 */
async function ensureMcpFilesGitignored(projectPath: string): Promise<void> {
    const gitignorePath = path.join(projectPath, '.gitignore');

    let existing = '';
    try {
        existing = await fsPromises.readFile(gitignorePath, 'utf-8');
    } catch {
        // File may not exist yet — start empty
    }

    const toAdd = MCP_GITIGNORE_ENTRIES.filter(entry =>
        !existing.split('\n').some(line => line.trim() === entry),
    );

    if (toAdd.length === 0) return;

    const section = '\n# MCP config files (generated by Demo Builder)\n' +
        toAdd.join('\n') + '\n';
    try {
        await fsPromises.appendFile(gitignorePath, section, 'utf-8');
    } catch (err) {
        // Non-fatal: project creation continues, but warn so the user knows the
        // MCP config files are not gitignored.
        process.stderr.write(
            `[Demo Builder] WARNING: Could not update .gitignore — MCP config files ` +
            `(${toAdd.join(', ')}) may be accidentally committed. Error: ` +
            `${err instanceof Error ? err.message : String(err)}\n`,
        );
    }
}
