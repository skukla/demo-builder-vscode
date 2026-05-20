/**
 * Demo Builder MCP Server (Multi-Project Mode)
 *
 * Standalone Node.js process (not VS Code extension host) that exposes
 * Demo Builder project tools to AI agents via the MCP protocol.
 *
 * IMPORTANT: This file MUST NOT import 'vscode' — it runs as a separate
 * process and the vscode API is unavailable.
 *
 * One global server serves ALL projects. Claude Code discovers projects
 * via `list_projects` tool; each tool takes `projectName` as first parameter.
 *
 * Started by the MCP client (Claude Code, Cursor, Codex CLI) with:
 *   node dist/mcp-server.js
 *   (DEMO_BUILDER_PROJECTS_DIR env var optional — defaults to ~/.demo-builder/projects)
 */

import * as childProcess from 'child_process';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { assertPathInside, assertPathInsideSync } from '@/core/validation';
import {
    PushRejectedError,
    syncAndPublish,
} from '@/features/eds/services/storefrontSyncService';

const execFile = promisify(childProcess.execFile);

// Maximum number of files returned by getBlockSource — prevents unbounded memory use
// when a block directory contains many large assets.
const MAX_BLOCK_FILES = 50;
// Maximum bytes read per file — prevents oversized MCP responses from vendored or minified assets.
const MAX_FILE_BYTES = 100_000; // 100 KB

// ─── Security helpers ─────────────────────────────────────────────────────────

/** Regex for safe project directory names — no path separators, traversal, or null bytes */
const SAFE_PROJECT_NAME = /^[^/\\.\0][^/\\\0]*$/;

/**
 * Validate projectName is a safe directory name and resolve to an absolute path
 * inside projectsDir. Prevents path traversal via crafted project names.
 *
 * @throws Error if projectName contains path separators, `..`, or null bytes
 * @internal — exported for unit tests
 */
export function resolveProjectPath(projectsDir: string, projectName: string): string {
    if (!projectName || !SAFE_PROJECT_NAME.test(projectName) || projectName === '..' || projectName.includes('..')) {
        throw new Error(`Invalid project name: ${projectName}`);
    }
    const resolved = path.join(projectsDir, projectName);
    assertPathInsideSync(resolved, projectsDir);
    return resolved;
}

/**
 * Validate that `resolved` is inside `projectPath`, returning canonical paths
 * for downstream allowlist checks (e.g., isAllowedConfigPath).
 */
async function assertInsideProject(
    projectPath: string,
    resolved: string,
): Promise<{ realProjectPath: string; realResolved: string }> {
    // Canonicalize projectPath first, then pass the canonical base to assertPathInside.
    // This avoids a redundant realpath call on the base inside assertPathInside.
    let realProjectPath: string;
    try {
        realProjectPath = await fsPromises.realpath(projectPath);
    } catch {
        realProjectPath = projectPath;
    }
    const realResolved = await assertPathInside(resolved, realProjectPath);
    return { realProjectPath, realResolved };
}

// Values that pass this regex are safe to source unquoted — no shell expansion, no
// word splitting, no glob, no redirection, no command invocation. The allowlist is
// intentionally narrow: URL query strings (with `?` or `&`), values with whitespace,
// tildes, and other common but unsafe characters must be quoted.
const SAFE_UNQUOTED_VALUE = /^[A-Za-z0-9_.:/@+,=%-]*$/;
// Single-quoted values are literal — no expansion, no escape processing. Embedded
// single quotes would close the quoting, so they are disallowed.
const SINGLE_QUOTED_VALUE = /^'[^']*'$/;
// Double-quoted values permit most characters, but `$`, backtick, and `\` trigger
// expansion/escaping on source. Disallow all three to keep the value inert.
const DOUBLE_QUOTED_VALUE_NO_EXPANSION = /^"[^"$`\\]*"$/;

/**
 * Validate the content of a .env file before writing.
 *
 * Allowlist approach (supersedes prior denylist). A value is accepted if and only if:
 *   - It is empty (`KEY=`), OR
 *   - It matches {@link SAFE_UNQUOTED_VALUE}: alphanumeric + `_.:/@+,=%-`, OR
 *   - It is single-quoted with no embedded `'`, OR
 *   - It is double-quoted with no `$`, backtick, or `\` inside.
 *
 * Defense-in-depth rationale: the MCP server lets AI agents write `.env` content that
 * a user's startup scripts may then `source`. Denylist approaches (block `$(`, then
 * `<(`, then `>`, then whitespace, then globs...) leak — three prior review iterations
 * found four distinct bypasses, culminating in a confirmed RCE via the bash
 * `VAR=value command args` assignment-prefix grammar. The allowlist closes that class
 * of bypasses in one rule.
 *
 * Specific-category guards (subshell, process substitution, parameter expansion,
 * shell metacharacters) still run for improved error messages — they help AI agents
 * diagnose and correct their output. The allowlist is the final safety net.
 *
 * @throws {Error} on the first line that fails validation.
 * @internal — exported only for unit tests
 */
export function validateEnvContent(content: string): void {
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) {
            throw new Error(
                `Invalid .env line (must be KEY=VALUE, a comment, or blank): ${trimmed.slice(0, 80)}`,
            );
        }
        const value = trimmed.slice(trimmed.indexOf('=') + 1);

        // Quoted escape hatches — short-circuit on properly-formed quoted values so the
        // specific guards below do not false-positive on literal `$(` inside single quotes.
        if (SINGLE_QUOTED_VALUE.test(value) || DOUBLE_QUOTED_VALUE_NO_EXPANSION.test(value)) continue;

        // Specific guards for clearer error messages on common dangerous unquoted patterns.
        // These do not change the set of rejected values (the final allowlist already rejects
        // them); they produce category-specific errors that help AI agents self-correct.
        if (/\$\(/.test(value) || /`/.test(value)) {
            throw new Error(`.env value must not contain subshell syntax ($(...) or backticks)`);
        }
        if (/[<>=]\(/.test(value)) {
            throw new Error('.env value must not contain process substitution syntax (<(...), >(...), or =(...))');
        }
        if (/\$[A-Za-z_0-9@?!#*$\-{]/.test(value)) {
            throw new Error('.env value must not contain shell parameter expansion ($VAR, ${VAR}, $1, $@, etc.)');
        }
        if (/[<>|&;]/.test(value)) {
            throw new Error('.env value must not contain unquoted shell metacharacters (<, >, |, &, ;) — quote the value if it needs these characters');
        }

        // Allowlist backstop. Catches remaining dangerous grammar not hit by the specific
        // guards above: whitespace (prefix-env command invocation `KEY=x whoami`), glob
        // metacharacters (`*`, `?`, `[`), tilde expansion (`~`), brace expansion (`{a,b}`),
        // deprecated arithmetic (`$[...]`), and any other character outside the safe set.
        if (value === '' || SAFE_UNQUOTED_VALUE.test(value)) continue;
        throw new Error(
            `.env value must be safe-chars-only, single-quoted, or double-quoted without expansion: ${value.slice(0, 80)}`,
        );
    }
}

/**
 * Check if a canonical path is on the allowlist. Both arguments must be canonicalized
 * (via realpath) by the caller — otherwise a symlinked `.demo-builder.json` could pass
 * this check while the actual write lands on the symlink target. `assertInsideProject`
 * returns canonical paths for exactly this purpose.
 */
function isAllowedConfigPath(realProjectPath: string, realResolved: string): boolean {
    if (realResolved === path.resolve(realProjectPath, '.demo-builder.json')) return true;
    // Allow .env files anywhere inside the project, excluding node_modules and .git
    // (AI agents need to update component .env files at any nesting level).
    if (path.basename(realResolved) === '.env') {
        const rel = path.relative(realProjectPath, realResolved);
        const parts = rel.split(path.sep);
        if (!rel.startsWith('..') && !parts.includes('node_modules') && !parts.includes('.git')) {
            return true;
        }
    }
    return false;
}

/**
 * Read the project manifest and extract the EDS storefront path.
 * @throws Error if no EDS storefront is configured
 */
async function resolveStorefrontPath(projectPath: string): Promise<string> {
    const raw = await fsPromises.readFile(path.join(projectPath, '.demo-builder.json'), 'utf-8');
    const manifest = JSON.parse(raw);
    const storefrontPath = manifest?.componentInstances?.['eds-storefront']?.path;
    if (!storefrontPath) {
        throw new Error('No EDS storefront configured for this project');
    }
    return storefrontPath;
}

interface InstalledBlockLibraryEntry {
    name: string;
    source: { owner: string; repo: string; branch?: string };
    blockIds: string[];
}

/**
 * Read the project manifest and return the installed block libraries (or an
 * empty list if none).
 */
async function readInstalledBlockLibraries(projectPath: string): Promise<InstalledBlockLibraryEntry[]> {
    const raw = await fsPromises.readFile(path.join(projectPath, '.demo-builder.json'), 'utf-8');
    const manifest = JSON.parse(raw);
    const libs = manifest?.installedBlockLibraries;
    return Array.isArray(libs) ? (libs as InstalledBlockLibraryEntry[]) : [];
}

/**
 * Read the project manifest and extract the storefront's GitHub repo (owner, repo, branch).
 * Returns undefined if the storefront has no `githubRepo` recorded.
 */
async function readStorefrontGithubRepo(projectPath: string): Promise<{ owner: string; site: string; branch?: string } | undefined> {
    try {
        const raw = await fsPromises.readFile(path.join(projectPath, '.demo-builder.json'), 'utf-8');
        const manifest = JSON.parse(raw);
        const repo = manifest?.componentInstances?.['eds-storefront']?.metadata?.githubRepo;
        const branch = manifest?.componentInstances?.['eds-storefront']?.metadata?.edsBranch;
        if (typeof repo !== 'string' || !repo.includes('/')) return undefined;
        const [owner, site] = repo.split('/');
        return { owner, site, branch: typeof branch === 'string' ? branch : undefined };
    } catch {
        return undefined;
    }
}

// ─── Tool handlers (exported for unit tests) ─────────────────────────────────

/** @internal — exported only for unit tests; not part of the public API */
export const toolHandlers = {
    async listProjects(projectsDir: string): Promise<string> {
        let entries: Array<{ name: string; isDirectory: () => boolean }>;
        try {
            entries = await fsPromises.readdir(projectsDir, { withFileTypes: true });
        } catch {
            return JSON.stringify([]);
        }
        const projects: Array<{ name: string; path: string; status: string }> = [];
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const dirPath = path.join(projectsDir, entry.name);
            const manifestPath = path.join(dirPath, '.demo-builder.json');
            try {
                await fsPromises.stat(manifestPath);
                const raw = await fsPromises.readFile(manifestPath, 'utf-8');
                const manifest = JSON.parse(raw);
                projects.push({
                    name: manifest.name ?? entry.name,
                    path: dirPath,
                    status: manifest.status ?? 'unknown',
                });
            } catch {
                // Skip directories without valid .demo-builder.json
            }
        }
        return JSON.stringify(projects);
    },

    async getProject(projectsDir: string, projectName: string): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const jsonPath = path.join(projectPath, '.demo-builder.json');
        try {
            const raw = await fsPromises.readFile(jsonPath, 'utf-8');
            return JSON.stringify(JSON.parse(raw), null, 2);
        } catch (err) {
            return `Error reading project state: ${err instanceof Error ? err.message : String(err)}`;
        }
    },

    async getComponentConfig(projectsDir: string, projectName: string, configRelPath: string): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const resolved = path.resolve(projectPath, configRelPath);
        const { realProjectPath, realResolved } = await assertInsideProject(projectPath, resolved);
        if (!isAllowedConfigPath(realProjectPath, realResolved)) {
            throw new Error(`Reading ${configRelPath} is not permitted. Allowed: .demo-builder.json, .env files.`);
        }
        return fsPromises.readFile(resolved, 'utf-8');
    },

    async updateProjectConfig(
        projectsDir: string,
        projectName: string,
        configRelPath: string,
        content: string,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const resolved = path.resolve(projectPath, configRelPath);
        const { realProjectPath, realResolved } = await assertInsideProject(projectPath, resolved);
        if (!isAllowedConfigPath(realProjectPath, realResolved)) {
            throw new Error(`Writing to ${configRelPath} is not permitted. Allowed: .demo-builder.json, .env files.`);
        }
        if (path.basename(realResolved) === '.env') {
            validateEnvContent(content);
        }
        await fsPromises.mkdir(path.dirname(resolved), { recursive: true });
        await fsPromises.writeFile(resolved, content, 'utf-8');
        return `Updated ${configRelPath}`;
    },

    async syncStorefront(projectsDir: string, projectName: string, commitMessage: string): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const storefrontPath = await resolveStorefrontPath(projectPath);
        if (!path.isAbsolute(storefrontPath)) {
            throw new Error(`storefrontPath must be an absolute path: ${storefrontPath}`);
        }
        await assertInsideProject(projectPath, storefrontPath);
        try {
            await fsPromises.stat(path.join(storefrontPath, '.git'));
        } catch {
            throw new Error(`storefrontPath is not a git repository root: ${storefrontPath}`);
        }

        // Tokens come from environment when running standalone (Claude Code launches
        // the MCP server). The extension can write them into the spawn env via
        // Cycle D's launch wiring. Absence is fine: git falls back to ambient auth
        // and the Helix step is skipped.
        const githubToken = process.env.GITHUB_TOKEN || process.env.DEMO_BUILDER_GITHUB_TOKEN || undefined;
        const daLiveToken = process.env.DA_LIVE_IMS_TOKEN || process.env.DEMO_BUILDER_DA_LIVE_TOKEN || undefined;

        const githubRepo = await readStorefrontGithubRepo(projectPath);

        try {
            const result = await syncAndPublish({
                storefrontPath,
                commitMessage,
                githubRepo,
                githubToken,
                daLiveToken,
            });

            if (!result.committed && !result.helixPublished) return 'Nothing to commit';
            if (result.helixPublished) return 'Storefront synced and published successfully';
            return 'Storefront synced successfully';
        } catch (err) {
            if (err instanceof PushRejectedError) {
                throw new Error(
                    `${err.message} Resolve from VS Code (Demo Builder dashboard → Sync Storefront) — ` +
                    `rebase/merge editor is not available in the AI tool surface.`,
                );
            }
            throw err;
        }
    },

    async listBlocks(projectsDir: string, projectName: string): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const storefrontPath = await resolveStorefrontPath(projectPath);
        if (!path.isAbsolute(storefrontPath)) {
            throw new Error(`storefrontPath must be an absolute path: ${storefrontPath}`);
        }
        await assertInsideProject(projectPath, storefrontPath);
        const blocksDir = path.join(storefrontPath, 'blocks');
        let dirNames: string[];
        try {
            const entries = await fsPromises.readdir(blocksDir, { withFileTypes: true });
            dirNames = entries.filter(e => e.isDirectory()).map(e => e.name);
        } catch {
            return JSON.stringify([]);
        }

        // Cross-reference each block against installedBlockLibraries so AI agents
        // know which library a block came from (informs promotion target choice).
        // First matching library wins on collisions — install order is the
        // canonical source-of-truth for which library a block currently mirrors.
        const libs = await readInstalledBlockLibraries(projectPath);
        const result = dirNames.map(name => {
            const lib = libs.find(l => Array.isArray(l.blockIds) && l.blockIds.includes(name));
            if (!lib) return { name };
            return {
                name,
                originLibrary: { name: lib.name, owner: lib.source.owner, repo: lib.source.repo },
            };
        });
        return JSON.stringify(result);
    },

    async getBlockSource(projectsDir: string, projectName: string, blockName: string): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const storefrontPath = await resolveStorefrontPath(projectPath);
        if (!path.isAbsolute(storefrontPath)) {
            throw new Error(`storefrontPath must be an absolute path: ${storefrontPath}`);
        }
        await assertInsideProject(projectPath, storefrontPath);
        const resolved = path.resolve(path.join(storefrontPath, 'blocks'), blockName);
        await assertInsideProject(path.join(storefrontPath, 'blocks'), resolved);
        const entries = await fsPromises.readdir(resolved, { withFileTypes: true });
        const files = entries.filter(e => e.isFile()).slice(0, MAX_BLOCK_FILES);
        const sources = await Promise.all(
            files.map(async f => {
                const filePath = path.join(resolved, f.name);
                const { size } = await fsPromises.stat(filePath);
                const content =
                    size > MAX_FILE_BYTES
                        ? `[truncated: ${size} bytes — file exceeds ${MAX_FILE_BYTES / 1000} KB]`
                        : await fsPromises.readFile(filePath, 'utf-8');
                return { name: f.name, content };
            }),
        );
        return JSON.stringify(sources, null, 2);
    },
};

// ─── MCP server wiring ────────────────────────────────────────────────────────

// Only start the server when running as a standalone process (not in tests).
if (process.env.NODE_ENV !== 'test') {
    const PROJECTS_DIR = process.env.DEMO_BUILDER_PROJECTS_DIR
        ?? path.join(os.homedir(), '.demo-builder', 'projects');

    // Typed as `any` to avoid TS2589 (deep type instantiation with inline Zod schema inference).
    // This is a confirmed SDK regression (issue #1180, v1.23.0+). The MCP SDK validates all
    // inputs at runtime via the Zod schemas below — the cast is safe.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const server: any = new McpServer({ name: 'demo-builder', version: '1.0.0' });

    const projectNameSchema = z.string().describe('Project name (directory name under ~/.demo-builder/projects/)');

    // Tool handlers return result strings directly. The SDK's built-in error handling
    // catches thrown errors and converts them to { isError: true } responses automatically
    // (via createToolError in the CallToolRequestSchema handler).
    /* eslint-disable @typescript-eslint/no-explicit-any */
    server.registerTool('list_projects', {
        title: 'List Projects',
        description: 'List all Demo Builder projects',
        inputSchema: {},
    }, async () => ({
        content: [{ type: 'text' as const, text: await toolHandlers.listProjects(PROJECTS_DIR) }],
    }));

    server.registerTool('get_project', {
        title: 'Get Project',
        description: 'Read a Demo Builder project state (.demo-builder.json)',
        inputSchema: { projectName: projectNameSchema },
    }, async (args: any) => ({
        content: [{ type: 'text' as const, text: await toolHandlers.getProject(PROJECTS_DIR, args.projectName) }],
    }));

    server.registerTool('get_component_config', {
        title: 'Get Component Config',
        description: 'Read .demo-builder.json or a .env file within the project directory (path must not escape the project root)',
        inputSchema: {
            projectName: projectNameSchema,
            configRelPath: z.string().describe('Relative path to config file within project'),
        },
    }, async (args: any) => ({
        content: [{ type: 'text' as const, text: await toolHandlers.getComponentConfig(PROJECTS_DIR, args.projectName, args.configRelPath as string) }],
    }));

    server.registerTool('update_project_config', {
        title: 'Update Project Config',
        description: 'Write content to .demo-builder.json or a .env file inside the project directory (path must not escape the project root)',
        inputSchema: {
            projectName: projectNameSchema,
            configRelPath: z.string().describe('Relative path (.demo-builder.json or path to .env file)'),
            content: z.string().max(1_000_000).describe('New file content'),
        },
    }, async (args: any) => ({
        content: [{ type: 'text' as const, text: await toolHandlers.updateProjectConfig(PROJECTS_DIR, args.projectName, args.configRelPath as string, args.content as string) }],
    }));

    server.registerTool('sync_storefront', {
        title: 'Sync Storefront',
        description: 'Git add, commit, and push changes in the storefront directory',
        inputSchema: {
            projectName: projectNameSchema,
            commitMessage: z.string().max(500).describe('Git commit message'),
        },
    }, async (args: any) => ({
        content: [{ type: 'text' as const, text: await toolHandlers.syncStorefront(PROJECTS_DIR, args.projectName, args.commitMessage as string) }],
    }));

    server.registerTool('list_blocks', {
        title: 'List Blocks',
        description: 'List all block directories in the storefront blocks/ directory',
        inputSchema: { projectName: projectNameSchema },
    }, async (args: any) => ({
        content: [{ type: 'text' as const, text: await toolHandlers.listBlocks(PROJECTS_DIR, args.projectName) }],
    }));

    server.registerTool('get_block_source', {
        title: 'Get Block Source',
        description: 'Read all source files for a named block in the storefront',
        inputSchema: {
            projectName: projectNameSchema,
            blockName: z.string().regex(/^[a-zA-Z0-9_-]+$/).describe('Name of the block directory inside blocks/'),
        },
    }, async (args: any) => ({
        content: [{ type: 'text' as const, text: await toolHandlers.getBlockSource(PROJECTS_DIR, args.projectName, args.blockName as string) }],
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */

    (async () => {
        const transport = new StdioServerTransport();
        await server.connect(transport);
    })().catch(err => {
        process.stderr.write(`Fatal: ${(err as Error).message}\n`);
        process.exit(1);
    });
}
