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
import * as path from 'path';
import { promisify } from 'util';
import aiDefaultsConfig from '../config/ai-defaults.json';
import { COMPONENT_IDS } from '@/core/constants';
import { resolveMcpSocketPath } from '@/features/ai/server/mcpSocketPath';
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

/**
 * Generate .claude/settings.json for the SINGLE home Chat (rooted at the Demo
 * Builder projects root). Installs a project-aware PostToolUse git-sync hook
 * that auto-commits/pushes storefront edits made anywhere under the projects
 * root — the home analogue of the per-project hook.
 *
 * Returns `{}` (no hook) when `projectsRoot` contains shell metacharacters —
 * an attacker-controlled root must not become part of an executed shell command.
 */
export function generateHomeClaudeSettings(projectsRoot: string): ClaudeSettings {
    const command = buildHomeGitSyncCommand(projectsRoot);
    if (!command) {
        // Root contained shell metacharacters — skip hook for safety
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
): Promise<McpConfig> {
    const nodePath = await resolveNodePath();
    const mcpServers: Record<string, McpServerEntry> = {
        'demo-builder': await buildDemoBuilderMcpEntry(
            extensionDistPath,
            resolveMcpSocketPath(project.path),
            nodePath,
        ),
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
 * Build the shell snippet that extracts the edited file path from the
 * PostToolUse payload into `$TOOL_FILE`.
 *
 * JSON-parsing strategy is a tolerant fallback chain so the hook works in
 * environments missing one of the tools:
 *   1. `jq` — primary, robust JSON parser (widely available)
 *   2. `python3` — secondary, present on every modern macOS/Linux install
 *   3. `grep`/`sed` — last-resort regex
 *
 * Each subsequent tool only runs if the previous one produced empty output
 * (or failed) — guarded by `[ -z "$TOOL_FILE" ]`. The query is
 * `.. | objects | .file_path? // empty` for jq, equivalent recursive logic
 * for python3, and a `grep -o` pattern for the last-resort path — all three
 * extract `file_path` at any nesting depth. Shared by the per-project and the
 * home git-sync hooks; the snippet contains no interpolated paths, so it is
 * always safe.
 */
function buildToolFileExtraction(): string {
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
        `[ -z "$TOOL_FILE" ] && TOOL_FILE=$(echo "$CLAUDE_TOOL_INPUT" | ${grepSedExtract}); `
    );
}

/**
 * Build the PostToolUse git sync shell command for the storefront path.
 *
 * Returns an empty string (no hook installed) if `storefrontPath` contains
 * shell metacharacters — an attacker-controlled path must not become part of
 * an executed shell command.
 *
 * Extracts the edited file into `$TOOL_FILE` (see `buildToolFileExtraction`),
 * then commits + pushes only when that file is under the storefront path.
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

    return (
        buildToolFileExtraction() +
        `if [[ "$TOOL_FILE" == ${quoted}* ]]; then ` +
        `git -C ${quoted} add -A && ` +
        `git -C ${quoted} commit -m "AI: sync files" && ` +
        `git -C ${quoted} push; fi`
    );
}

/**
 * Build the project-aware PostToolUse git-sync command for the SINGLE home Chat
 * (rooted at the Demo Builder projects root). Auto-commits/pushes a storefront
 * edit made anywhere under `<root>/<project>/...` — the home analogue of the
 * per-project `buildGitSyncCommand`.
 *
 * Unlike the per-project hook (which targets one fixed storefront path), the
 * home Chat can edit ANY project under the root, so this command resolves the
 * enclosing git repo at runtime and applies layered safety guards:
 *
 *   1. Returns `''` (no hook) if `projectsRoot` contains shell metacharacters —
 *      an attacker-controlled root must never become part of a shell command.
 *      Same guard as `buildGitSyncCommand`.
 *   2. Extracts the edited file into `$TOOL_FILE`; `[ -z … ] && exit 0` bails
 *      when nothing was edited or the payload couldn't be parsed.
 *   3. Resolves the enclosing repo via `git rev-parse --show-toplevel` from the
 *      edited file's directory; `|| exit 0` bails when the file isn't in a repo.
 *   4. ROOT-SCOPE guard: `case "$TOP" in "<root>"/*) … *) exit 0` — only proceed
 *      when the repo top is strictly UNDER the projects root. `"<root>"/*`
 *      requires a subpath, so the root itself (and files written directly under
 *      it, e.g. `.claude/`) never trigger a commit.
 *   5. REMOTE guard: `git remote get-url origin || exit 0` — only repos that
 *      have an `origin` remote (i.e. the storefront repos Helix watches). Never
 *      commit+push a random non-remote repo a user happens to have under root.
 *   6. Commit + push the resolved repo top.
 *
 * The root is double-quoted everywhere it is interpolated. The metachar guard
 * already rejects quotes, so quoting is purely to preserve spaces in the path.
 */
export function buildHomeGitSyncCommand(projectsRoot: string): string {
    if (SHELL_METACHAR_RE.test(projectsRoot)) {
        // Unsafe root — skip hook rather than risk shell injection
        return '';
    }

    // SHELL_METACHAR_RE already rejects any quote characters, so no further
    // escaping is needed before interpolating into double-quoted shell
    // arguments. The double quotes preserve any spaces in the root path.
    const quotedRoot = `"${projectsRoot}"`;

    return (
        buildToolFileExtraction() +
        `[ -z "$TOOL_FILE" ] && exit 0; ` +
        `TOP=$(git -C "$(dirname "$TOOL_FILE")" rev-parse --show-toplevel 2>/dev/null) || exit 0; ` +
        `case "$TOP" in ${quotedRoot}/*) ;; *) exit 0 ;; esac; ` +
        `git -C "$TOP" remote get-url origin >/dev/null 2>&1 || exit 0; ` +
        `git -C "$TOP" add -A && ` +
        `git -C "$TOP" commit -m "AI: sync files" && ` +
        `git -C "$TOP" push`
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
