/**
 * Demo Builder MCP — shared project-tool registration.
 *
 * Defines the seven project-scoped MCP tools (list_projects, get_project,
 * get_component_config, update_project_config, sync_storefront, list_blocks,
 * get_block_source) and the security helpers they use, then exposes them via
 * `registerProjectTools(server, projectsDir)`.
 *
 * This module is NOT a server process. The in-extension MCP server
 * (`@/features/ai/server/inExtensionMcpServer`) imports `registerProjectTools`
 * and registers these tools alongside the handler-backed tools — see
 * `docs/systems/mcp-server.md` for the full architecture. The former standalone
 * `dist/mcp-server.js` stdio process was retired once the in-extension server
 * (reachable via the `dist/mcp-proxy.js` stdio→socket bridge) became the only
 * path; clients now always reach the extension host, so tools can reuse its
 * handlers and services directly.
 *
 * IMPORTANT: This file MUST NOT import 'vscode'. It is bundled into the
 * vscode-free `dist/mcp-proxy.js` path indirectly and consumed by the
 * extension host, but its tool handlers operate purely on the filesystem.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { assertPathInside, assertPathInsideSync } from '@/core/validation';
import {
    DaLiveContentOperations,
    type TokenProvider,
} from '@/features/eds/services/daLiveContentOperations';
import { previewAndPublishPage, unpublishPage } from '@/features/eds/services/helixApiClient';
import {
    PushRejectedError,
    syncAndPublish,
} from '@/features/eds/services/storefrontSyncService';

// Maximum number of file entries listed in a getBlockSource manifest — prevents
// unbounded responses when a block directory contains many assets.
const MAX_BLOCK_FILES = 50;
// Maximum bytes returned for a single file read via getBlockSource. Kept small
// because the response is consumed as LLM context tokens, not by a human — large
// vendored/minified assets should be read from disk directly, not through MCP.
const MAX_FILE_BYTES = 30_000; // 30 KB

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

/**
 * Produce a token-lean view of a project manifest for `getProject`.
 *
 * The full manifest can carry large arrays (saved AI prompts, per-library block
 * ID lists) and per-component metadata blobs that an agent rarely needs up front.
 * The summary keeps every top-level scalar/object but collapses the known
 * unbounded fields:
 *   - `aiPrompts`            → a count placeholder
 *   - `installedBlockLibraries` → name + source + blockCount (drops the blockIds list)
 *   - `componentInstances`   → id → { path } (drops the metadata blob)
 *
 * Callers that need the untouched manifest pass `full: true`.
 */
function summarizeManifest(manifest: Record<string, unknown>): Record<string, unknown> {
    const summary: Record<string, unknown> = { ...manifest };

    if (Array.isArray(manifest.aiPrompts)) {
        summary.aiPrompts = `[${manifest.aiPrompts.length} prompt(s) — pass full:true to expand]`;
    }

    if (Array.isArray(manifest.installedBlockLibraries)) {
        summary.installedBlockLibraries = manifest.installedBlockLibraries.map(lib => {
            const entry = lib as { name?: unknown; source?: unknown; blockIds?: unknown };
            return {
                name: entry.name,
                source: entry.source,
                blockCount: Array.isArray(entry.blockIds) ? entry.blockIds.length : 0,
            };
        });
    }

    const components = manifest.componentInstances;
    if (components && typeof components === 'object') {
        summary.componentInstances = Object.fromEntries(
            Object.entries(components as Record<string, unknown>).map(([id, inst]) => {
                const path = (inst as { path?: unknown } | null)?.path;
                return [id, { path }];
            }),
        );
    }

    return summary;
}

/**
 * Apply optional offset/limit slicing to a list result. Both bounds are
 * clamped to safe values so malformed input degrades to "return everything"
 * rather than throwing. Returns the array unchanged when neither is provided.
 */
function paginate<T>(items: T[], offset?: number, limit?: number): T[] {
    const start = typeof offset === 'number' && Number.isInteger(offset) && offset > 0 ? offset : 0;
    const validLimit = typeof limit === 'number' && Number.isInteger(limit) && limit >= 0 ? limit : undefined;
    if (start === 0 && validLimit === undefined) return items;
    const end = validLimit === undefined ? undefined : start + validLimit;
    return items.slice(start, end);
}

// ─── promote_block_to_library helpers ────────────────────────────────────────

interface PromoteBlockContext {
    storefrontPath: string;
    daLiveOrg: string;
    daLiveSite: string;
    githubRepo?: { owner: string; site: string; branch?: string };
}

/**
 * Read the manifest and extract the fields needed by promoteBlockToLibrary.
 * Throws if no EDS storefront, daLiveOrg, or daLiveSite is configured.
 */
async function readPromoteBlockContext(projectPath: string): Promise<PromoteBlockContext> {
    const raw = await fsPromises.readFile(path.join(projectPath, '.demo-builder.json'), 'utf-8');
    const manifest = JSON.parse(raw);
    const edsInstance = manifest?.componentInstances?.['eds-storefront'];
    const storefrontPath = edsInstance?.path;
    if (!storefrontPath) {
        throw new Error('No EDS storefront configured for this project');
    }
    const metadata = edsInstance?.metadata ?? {};
    const daLiveOrg = metadata.daLiveOrg;
    const daLiveSite = metadata.daLiveSite;
    if (typeof daLiveOrg !== 'string' || typeof daLiveSite !== 'string') {
        throw new Error('No DA.live org/site configured for this storefront');
    }
    let githubRepo: PromoteBlockContext['githubRepo'];
    const repo = metadata.githubRepo;
    if (typeof repo === 'string' && repo.includes('/')) {
        const [owner, site] = repo.split('/');
        const branch = typeof metadata.edsBranch === 'string' ? metadata.edsBranch : undefined;
        githubRepo = { owner, site, branch };
    }
    return { storefrontPath, daLiveOrg, daLiveSite, githubRepo };
}

/**
 * Read component-definition.json, append the new entry to the first group's
 * components if missing, write it back, and return whether a change was made.
 *
 * `description` (when provided) lands at `components[].description` — the EDS
 * authoring runtime renders it as a tooltip on the block tile in the picker.
 */
async function applyComponentDefinitionEntry(
    storefrontPath: string,
    blockId: string,
    title: string,
    unsafeHTML: string,
    description: string | undefined,
): Promise<'added' | 'unchanged'> {
    const compDefPath = path.join(storefrontPath, 'component-definition.json');
    const raw = await fsPromises.readFile(compDefPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
        groups?: Array<{ components?: ComponentDefinitionEntry[] }>;
    };
    const groups = parsed.groups ?? [];
    const allComponents = groups.flatMap(g => g.components ?? []);
    if (allComponents.some(c => c.id === blockId)) {
        return 'unchanged';
    }
    const firstGroup = groups[0];
    if (!firstGroup) {
        throw new Error('component-definition.json has no groups to add the entry to');
    }
    const entry: ComponentDefinitionEntry = {
        id: blockId,
        title,
        plugins: { da: { unsafeHTML } },
    };
    if (description) {
        entry.description = description;
    }
    firstGroup.components = [
        ...(firstGroup.components ?? []),
        entry,
    ];
    await fsPromises.writeFile(compDefPath, JSON.stringify(parsed, null, 2), 'utf-8');
    return 'added';
}

/**
 * Inverse of {@link applyComponentDefinitionEntry}: read
 * `component-definition.json`, drop any `components[]` entry with
 * `id === blockId` across all `groups[]`, and write back only if something
 * changed. Returns `'removed'` when an entry was dropped, `'absent'` otherwise.
 */
async function removeComponentDefinitionEntry(
    storefrontPath: string,
    blockId: string,
): Promise<'removed' | 'absent'> {
    const compDefPath = path.join(storefrontPath, 'component-definition.json');
    const raw = await fsPromises.readFile(compDefPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
        groups?: Array<{ components?: ComponentDefinitionEntry[] }>;
    };
    const groups = parsed.groups ?? [];
    let changed = false;
    for (const group of groups) {
        const components = group.components;
        if (!components) continue;
        const filtered = components.filter(c => c.id !== blockId);
        if (filtered.length !== components.length) {
            group.components = filtered;
            changed = true;
        }
    }
    if (!changed) {
        return 'absent';
    }
    await fsPromises.writeFile(compDefPath, JSON.stringify(parsed, null, 2), 'utf-8');
    return 'removed';
}

/** Shape of a single entry under `component-definition.json::groups[].components[]`.
 *  All fields except `id` are optional in the schema; the promote flow always
 *  populates `title` and `plugins.da.unsafeHTML`, and optionally `description`
 *  (rendered as the picker-tile tooltip by the EDS authoring runtime). */
interface ComponentDefinitionEntry {
    id: string;
    title?: string;
    description?: string;
    plugins?: { da?: { unsafeHTML?: string } };
}

/**
 * Verify the block source directory exists under <storefrontPath>/blocks/.
 * Throws "Block source not found: <blockId>" otherwise.
 */
async function verifyBlockSourceExists(storefrontPath: string, blockId: string): Promise<void> {
    const blockDir = path.join(storefrontPath, 'blocks', blockId);
    try {
        await fsPromises.stat(blockDir);
    } catch {
        throw new Error(`Block source not found: ${blockId}`);
    }
}

/**
 * Build a static TokenProvider that returns the given token.
 * The promote flow resolves the DA.live token once (from the injected
 * credentials) and wraps it here — it does not fetch/refresh mid-call.
 */
function staticTokenProvider(token: string): TokenProvider {
    return { getAccessToken: async () => token };
}

/**
 * Defense-in-depth sanitizer for AI-supplied `unsafeHTML` flowing into the
 * `promote_block_to_library` tool. Strips XSS vectors (script tags, event
 * handlers, `javascript:` URLs, framing tags) before the HTML lands in:
 *   1. `component-definition.json` (committed + pushed to the user's repo)
 *   2. `.da/library/blocks/<id>.html` (published to the user's CDN)
 *
 * The trust boundary intentionally extends to the AI for this tool, but a
 * compromised AI session, prompt-injection from a malicious upstream page, or
 * a confused-deputy scenario can otherwise produce stored XSS against the
 * user's authoring UI and live site. The allowlist permits the EDS authoring
 * block vocabulary (semantic tags + `<picture>`/`<source>` for responsive
 * images + `class`/`id` for block styling) and rejects everything else.
 *
 * Schemes restricted to http / https / mailto / tel — explicitly blocks
 * `javascript:`, `data:` (SVG XSS), `vbscript:`, and protocol-relative
 * (`//evil.example/x`) URLs.
 *
 * Known limitations (defer until real EDS blocks need them):
 *   - Inline `<svg>` is stripped. Use raster `<img>` or a CSS background for
 *     icons in promoted blocks. Re-evaluate if a real block surfaces with
 *     inline SVG decoration.
 *   - `<style>` is stripped. Block styles belong in the block's `.css` source,
 *     not the preview HTML.
 *   - `data-*` is broadly allowed for EDS authoring runtime conventions
 *     (`data-block-name`, `data-aue-resource`, etc.). No downstream renderer
 *     in this stack treats `data-*` as a code expression — revisit if a
 *     framework like KnockoutJS / AlpineJS / Vue is added to the storefront.
 */
function sanitizeBlockHtml(rawHtml: string): string {
    return sanitizeHtml(rawHtml, {
        allowedTags: [
            // Semantic + flow content
            'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'dl', 'dt', 'dd',
            'blockquote', 'pre', 'code', 'hr', 'br',
            'strong', 'em', 'b', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark',
            'a', 'img', 'picture', 'source',
            'figure', 'figcaption',
            'table', 'thead', 'tbody', 'tr', 'td', 'th', 'caption',
            'section', 'article', 'header', 'footer', 'nav', 'aside', 'main',
        ],
        allowedAttributes: {
            // class + id allowed on all tags for EDS block styling
            '*': ['class', 'id', 'data-*', 'aria-*', 'role', 'lang', 'title'],
            a: ['href', 'target', 'rel'],
            img: ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes'],
            source: ['src', 'srcset', 'sizes', 'type', 'media'],
            picture: [],
            td: ['colspan', 'rowspan'],
            th: ['colspan', 'rowspan', 'scope'],
        },
        allowedSchemes: ['http', 'https', 'mailto', 'tel'],
        allowedSchemesByTag: {},
        allowedSchemesAppliedToAttributes: ['href', 'src', 'cite', 'srcset'],
        allowProtocolRelative: false,
        disallowedTagsMode: 'discard',
    });
}

/**
 * Storefront commit/push/publish step. Failures are swallowed and reported via
 * the returned status — a publish failure must NOT throw because the doc page +
 * sheet + comp-def writes may have already succeeded.
 */
async function publishStorefrontAndDaLive(
    ctx: PromoteBlockContext,
    blockId: string,
    githubToken: string | undefined,
    daLiveToken: string,
): Promise<'success' | 'partial' | 'failed'> {
    try {
        await syncAndPublish({
            storefrontPath: ctx.storefrontPath,
            commitMessage: `AI: promote block ${blockId} to library`,
            githubRepo: ctx.githubRepo,
            githubToken,
            daLiveToken,
        });
    } catch {
        return 'failed';
    }
    // Publish the DA.live doc page + sheet via Helix admin API (parallel to
    // the storefront publish). Failures here are partial — the storefront push
    // already succeeded.
    if (!ctx.githubRepo || !githubToken) {
        return 'success';
    }
    try {
        await previewAndPublishPage(
            ctx.githubRepo.owner,
            ctx.githubRepo.site,
            `/.da/library/blocks/${blockId}`,
            ctx.githubRepo.branch ?? 'main',
            { githubToken, contentSourceAuthorization: `Bearer ${daLiveToken}` },
        );
    } catch {
        return 'partial';
    }
    return 'success';
}

/**
 * Reverse of {@link publishStorefrontAndDaLive}: commit/push the storefront
 * removal, then unpublish the block's library doc page from Helix. Failures are
 * swallowed and reported via the returned status — never thrown, because the
 * comp-def + doc-page + sheet teardown may have already succeeded.
 *
 *   - `'success'` — storefront push + unpublish both succeeded (or nothing to
 *     unpublish because no GitHub repo/token is configured).
 *   - `'partial'` — storefront push succeeded but the unpublish hit an auth
 *     failure (401/403) or errored.
 *   - `'failed'`  — the storefront commit/push itself failed.
 */
async function unpublishStorefrontAndDaLive(
    ctx: PromoteBlockContext,
    blockId: string,
    githubToken: string | undefined,
    daLiveToken: string,
): Promise<'success' | 'partial' | 'failed'> {
    try {
        await syncAndPublish({
            storefrontPath: ctx.storefrontPath,
            commitMessage: `AI: remove block ${blockId} from library`,
            githubRepo: ctx.githubRepo,
            githubToken,
            daLiveToken,
        });
    } catch {
        return 'failed';
    }
    if (!ctx.githubRepo || !githubToken) {
        return 'success';
    }
    try {
        const ok = await unpublishPage(
            ctx.githubRepo.owner,
            ctx.githubRepo.site,
            `/.da/library/blocks/${blockId}`,
            ctx.githubRepo.branch ?? 'main',
            { githubToken, contentSourceAuthorization: `Bearer ${daLiveToken}` },
        );
        return ok ? 'success' : 'partial';
    } catch {
        return 'partial';
    }
}

// ─── Credentials ─────────────────────────────────────────────────────────────

/**
 * Credentials a tool invocation may use, resolved from the live extension
 * session. Both nullable — absent when the user isn't signed in.
 *
 * The in-extension server resolves these from `DaLiveAuthService` /
 * `GitHubTokenService` and threads them in (see `registerProjectTools`). They
 * replaced the former `DA_LIVE_IMS_TOKEN` / `GITHUB_TOKEN` env vars, which were
 * only ever populated by the now-retired standalone process.
 */
export interface McpToolCredentials {
    daLiveToken?: string | null;
    githubToken?: string | null;
}

/**
 * Per-call credential resolver injected by the (vscode-aware) in-extension
 * server. Kept as a plain async-string interface so this module stays
 * vscode-free. Resolved fresh on each tool call so token expiry is respected.
 */
export interface McpCredentialProvider {
    getDaLiveToken(): Promise<string | null>;
    getGitHubToken(): Promise<string | null>;
}

// ─── Tool handlers (exported for unit tests) ─────────────────────────────────

/** @internal — exported only for unit tests; not part of the public API */
export const toolHandlers = {
    async listProjects(projectsDir: string, offset?: number, limit?: number): Promise<string> {
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
        return JSON.stringify(paginate(projects, offset, limit));
    },

    async getProject(projectsDir: string, projectName: string, full = false): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const jsonPath = path.join(projectPath, '.demo-builder.json');
        try {
            const raw = await fsPromises.readFile(jsonPath, 'utf-8');
            const manifest = JSON.parse(raw);
            // Compact JSON (no indentation) — the response is consumed as LLM
            // context, not read by a human, so whitespace is pure token waste.
            return JSON.stringify(full ? manifest : summarizeManifest(manifest));
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

    async syncStorefront(
        projectsDir: string,
        projectName: string,
        commitMessage: string,
        tokens?: McpToolCredentials,
    ): Promise<string> {
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

        // Credentials come from the live extension session (DaLiveAuthService /
        // GitHubTokenService), injected by registerProjectTools. Absence is fine:
        // git falls back to ambient auth and the Helix publish step is skipped.
        const githubToken = tokens?.githubToken ?? undefined;
        const daLiveToken = tokens?.daLiveToken ?? undefined;

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

    async listBlocks(projectsDir: string, projectName: string, offset?: number, limit?: number): Promise<string> {
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
        return JSON.stringify(paginate(result, offset, limit));
    },

    /**
     * Progressive block-source reader.
     *
     * Without `fileName`, returns a lightweight manifest — `{ files: [{ name, bytes }] }`
     * — so an agent can pick exactly which file it needs instead of ingesting every
     * file in the block. With `fileName`, returns that single file's source
     * (`{ name, content }`), truncated if it exceeds {@link MAX_FILE_BYTES}.
     *
     * Returning one file per call keeps the aggregate response bounded by a single
     * file's cap, rather than the old behavior of dumping up to MAX_BLOCK_FILES ×
     * MAX_FILE_BYTES in one response.
     */
    async getBlockSource(
        projectsDir: string,
        projectName: string,
        blockName: string,
        fileName?: string,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const storefrontPath = await resolveStorefrontPath(projectPath);
        if (!path.isAbsolute(storefrontPath)) {
            throw new Error(`storefrontPath must be an absolute path: ${storefrontPath}`);
        }
        await assertInsideProject(projectPath, storefrontPath);
        const resolved = path.resolve(path.join(storefrontPath, 'blocks'), blockName);
        await assertInsideProject(path.join(storefrontPath, 'blocks'), resolved);
        const entries = await fsPromises.readdir(resolved, { withFileTypes: true });
        const files = entries.filter(e => e.isFile());

        // No fileName → return a names + sizes manifest only (cheap; lets the agent
        // choose what to fetch). The size lets it skip files that would truncate.
        if (!fileName) {
            const manifest = await Promise.all(
                files.slice(0, MAX_BLOCK_FILES).map(async f => {
                    const { size } = await fsPromises.stat(path.join(resolved, f.name));
                    return { name: f.name, bytes: size };
                }),
            );
            return JSON.stringify({ files: manifest });
        }

        // fileName provided → read that single file. The fileName must name a real
        // entry in this block directory; matching against the listing (plus the
        // realpath check below) rules out traversal and symlink escapes.
        const match = files.find(f => f.name === fileName);
        if (!match) {
            throw new Error(`File "${fileName}" not found in block "${blockName}"`);
        }
        const filePath = path.resolve(resolved, fileName);
        await assertInsideProject(resolved, filePath);
        const { size } = await fsPromises.stat(filePath);
        const content =
            size > MAX_FILE_BYTES
                ? `[truncated: ${size} bytes — file exceeds ${MAX_FILE_BYTES / 1000} KB; read it directly from disk if full contents are needed]`
                : await fsPromises.readFile(filePath, 'utf-8');
        return JSON.stringify({ name: fileName, content });
    },

    /**
     * Promote a local block to the DA.live authoring library.
     *
     * Adds the block to `component-definition.json`, writes the doc page in
     * `.da/library/blocks/<blockId>`, appends a row to `.da/library/blocks.json`,
     * commits/pushes the storefront, and previews/publishes the doc page.
     *
     * Partial-success: a publish failure does NOT throw — the returned status
     * fields surface the real state of each step. Validation and "block source
     * not found" failures DO throw (per the MCP error envelope contract).
     */
    async promoteBlockToLibrary(
        projectsDir: string,
        projectName: string,
        blockId: string,
        title: string,
        unsafeHTML: string,
        description?: string,
        tokens?: McpToolCredentials,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const ctx = await readPromoteBlockContext(projectPath);

        // Validate the storefront path is absolute and lives inside the project.
        if (!path.isAbsolute(ctx.storefrontPath)) {
            throw new Error(`storefrontPath must be an absolute path: ${ctx.storefrontPath}`);
        }
        await assertInsideProject(projectPath, ctx.storefrontPath);

        await verifyBlockSourceExists(ctx.storefrontPath, blockId);

        // Defense-in-depth: sanitize AI-supplied HTML before it lands in two
        // persistent stores (component-definition.json + published doc page).
        // See sanitizeBlockHtml() for the allowlist rationale.
        const safeHtml = sanitizeBlockHtml(unsafeHTML);

        const componentDefinition = await applyComponentDefinitionEntry(
            ctx.storefrontPath, blockId, title, safeHtml, description,
        );

        // Credentials come from the live extension session (DaLiveAuthService /
        // GitHubTokenService), injected by registerProjectTools.
        const daLiveToken = tokens?.daLiveToken;
        if (!daLiveToken) {
            throw new Error(
                'DA.live token unavailable — sign in to DA.live first '
                + '(check get_auth_status, then the sign_in tool with provider:"dalive").',
            );
        }
        const githubToken = tokens?.githubToken ?? undefined;

        // Logger is unused for the MCP stdio flow — supply a no-op shim. The
        // DA.live operations log to stderr in the real flow; the MCP wrapper
        // intentionally suppresses noise.
        const noopLogger = {
            trace: () => undefined, debug: () => undefined, info: () => undefined,
            warn: () => undefined, error: () => undefined,
        };
        const daLiveOps = new DaLiveContentOperations(staticTokenProvider(daLiveToken), noopLogger);

        // Doc page: upsertBlockDocPage always writes so AI iteration on
        // unsafeHTML refreshes the rendered preview. (ensureBlockDocPages is
        // deliberately non-destructive for the template path — wrong contract
        // for this flow.)
        const docPage = await daLiveOps.upsertBlockDocPage(ctx.daLiveOrg, ctx.daLiveSite, {
            id: blockId,
            exampleHtml: safeHtml,
        });

        const sheetResult = await daLiveOps.appendBlockToLibrary(ctx.daLiveOrg, ctx.daLiveSite, {
            blockId, title,
        });

        const publish = await publishStorefrontAndDaLive(ctx, blockId, githubToken, daLiveToken);

        return JSON.stringify({
            docPage,
            sheet: sheetResult.status,
            componentDefinition,
            publish,
            details: `Block "${title}" (${blockId}) promoted to ${ctx.daLiveOrg}/${ctx.daLiveSite}`,
        });
    },

    /**
     * Remove a block from the DA.live authoring library — inverse of
     * {@link promoteBlockToLibrary}.
     *
     * Reverses the library registration: removes the entry from
     * `component-definition.json`, deletes the DA.live doc page, drops the
     * sheet row, commits/pushes the storefront removal, and unpublishes the
     * doc page. Does NOT delete the block's source files in `blocks/<blockId>/`
     * — that is the agent's job (see the remove-custom-block skill).
     *
     * Partial-success: the storefront push / unpublish failures do NOT throw —
     * the returned status fields surface the real state of each step. Validation
     * and missing-DA.live-token failures DO throw (per the MCP error envelope).
     */
    async removeBlockFromLibrary(
        projectsDir: string,
        projectName: string,
        blockId: string,
        tokens?: McpToolCredentials,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const ctx = await readPromoteBlockContext(projectPath);

        if (!path.isAbsolute(ctx.storefrontPath)) {
            throw new Error(`storefrontPath must be an absolute path: ${ctx.storefrontPath}`);
        }
        await assertInsideProject(projectPath, ctx.storefrontPath);

        const daLiveToken = tokens?.daLiveToken;
        if (!daLiveToken) {
            throw new Error(
                'DA.live token unavailable — sign in to DA.live first '
                + '(check get_auth_status, then the sign_in tool with provider:"dalive").',
            );
        }
        const githubToken = tokens?.githubToken ?? undefined;

        const componentDefinition = await removeComponentDefinitionEntry(ctx.storefrontPath, blockId);

        const noopLogger = {
            trace: () => undefined, debug: () => undefined, info: () => undefined,
            warn: () => undefined, error: () => undefined,
        };
        const daLiveOps = new DaLiveContentOperations(staticTokenProvider(daLiveToken), noopLogger);
        const { docPage, sheet } = await daLiveOps.removeBlockFromLibrary(
            ctx.daLiveOrg, ctx.daLiveSite, { blockId },
        );

        const unpublish = await unpublishStorefrontAndDaLive(ctx, blockId, githubToken, daLiveToken);

        return JSON.stringify({
            componentDefinition,
            docPage,
            sheet,
            unpublish,
            details: `Block "${blockId}" removed from ${ctx.daLiveOrg}/${ctx.daLiveSite} library`,
        });
    },
};

// ─── Tool registration (shared) ──────────────────────────────────────────────

/**
 * Register the nine project tools on an MCP server instance. Consumed by the
 * in-extension server (`@/features/ai/server/inExtensionMcpServer`) — the only
 * live path now that the standalone `dist/mcp-server.js` stdio process is
 * retired (see this file's header).
 *
 * `server` is typed `any` to avoid TS2589 (deep type instantiation with inline
 * Zod schema inference) — a confirmed SDK regression (issue #1180, v1.23.0+).
 * The MCP SDK validates all inputs at runtime via the Zod schemas, so the cast
 * is safe.
 *
 * @param server      An `McpServer` instance (typed `any`; see above).
 * @param projectsDir Absolute path to the projects root (`~/.demo-builder/projects`).
 * @param credentials Optional resolver for DA.live / GitHub tokens, injected by
 *   the in-extension server so the credential-needing tools (`sync_storefront`,
 *   `promote_block_to_library`) use the live sign-in session rather than env
 *   vars. Omitted in vscode-free/file-only contexts (tools fall back to env).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function registerProjectTools(
    server: any,
    projectsDir: string,
    credentials?: McpCredentialProvider,
): void {
    // Resolve credentials fresh per call (token expiry); undefined when no
    // provider, so the handlers fall back to their env-var path.
    const resolveCredentials = async (): Promise<McpToolCredentials | undefined> => {
        if (!credentials) {
            return undefined;
        }
        const [daLiveToken, githubToken] = await Promise.all([
            credentials.getDaLiveToken(),
            credentials.getGitHubToken(),
        ]);
        return { daLiveToken, githubToken };
    };

    const projectNameSchema = z.string().describe('Project name (directory name under ~/.demo-builder/projects/)');
    const offsetSchema = z.number().int().min(0).optional().describe('Number of items to skip (pagination)');
    const limitSchema = z.number().int().min(0).optional().describe('Maximum number of items to return (pagination)');

    server.registerTool('list_projects', {
        title: 'List Projects',
        description: 'List all Demo Builder projects',
        inputSchema: { offset: offsetSchema, limit: limitSchema },
    }, async (args: any) => ({
        content: [{ type: 'text' as const, text: await toolHandlers.listProjects(projectsDir, args.offset, args.limit) }],
    }));

    server.registerTool('get_project', {
        title: 'Get Project',
        description: 'Read Demo Builder project state. Returns a summary by default (large arrays collapsed); pass full=true for the complete .demo-builder.json',
        inputSchema: {
            projectName: projectNameSchema,
            full: z.boolean().optional().describe('Return the complete manifest instead of the summary'),
        },
    }, async (args: any) => ({
        content: [{ type: 'text' as const, text: await toolHandlers.getProject(projectsDir, args.projectName, args.full === true) }],
    }));

    server.registerTool('get_component_config', {
        title: 'Get Component Config',
        description: 'Read .demo-builder.json or a .env file within the project directory (path must not escape the project root)',
        inputSchema: {
            projectName: projectNameSchema,
            configRelPath: z.string().describe('Relative path to config file within project'),
        },
    }, async (args: any) => ({
        content: [{ type: 'text' as const, text: await toolHandlers.getComponentConfig(projectsDir, args.projectName, args.configRelPath as string) }],
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
        content: [{ type: 'text' as const, text: await toolHandlers.updateProjectConfig(projectsDir, args.projectName, args.configRelPath as string, args.content as string) }],
    }));

    server.registerTool('sync_storefront', {
        title: 'Sync Storefront',
        description: 'Git add, commit, and push changes in the storefront directory',
        inputSchema: {
            projectName: projectNameSchema,
            commitMessage: z.string().max(500).describe('Git commit message'),
        },
    }, async (args: any) => ({
        content: [{ type: 'text' as const, text: await toolHandlers.syncStorefront(projectsDir, args.projectName, args.commitMessage as string, await resolveCredentials()) }],
    }));

    server.registerTool('list_blocks', {
        title: 'List Blocks',
        description: 'List all block directories in the storefront blocks/ directory',
        inputSchema: { projectName: projectNameSchema, offset: offsetSchema, limit: limitSchema },
    }, async (args: any) => ({
        content: [{ type: 'text' as const, text: await toolHandlers.listBlocks(projectsDir, args.projectName, args.offset, args.limit) }],
    }));

    server.registerTool('get_block_source', {
        title: 'Get Block Source',
        description: "List a block's files (names + sizes) by default; pass fileName to read one file's source",
        inputSchema: {
            projectName: projectNameSchema,
            blockName: z.string().regex(/^[a-zA-Z0-9_-]+$/).describe('Name of the block directory inside blocks/'),
            fileName: z.string().regex(/^[a-zA-Z0-9._-]+$/).optional().describe('A file within the block to read; omit to list the block\'s files'),
        },
    }, async (args: any) => ({
        content: [{ type: 'text' as const, text: await toolHandlers.getBlockSource(projectsDir, args.projectName, args.blockName as string, args.fileName as string | undefined) }],
    }));

    server.registerTool('promote_block_to_library', {
        title: 'Promote Block to Library',
        // Phrasing matches sync-changes.md:18 ("Block changes to push back to source library")
        // so the capabilityStatements regression test (mcpServer-promoteBlock + capabilityStatements)
        // stays green.
        description: 'Block changes to push back to source library — adds a block to the DA.live authoring library by updating component-definition.json, writing the doc page, appending the sheet row, and committing/pushing/publishing the storefront',
        inputSchema: {
            projectName: projectNameSchema,
            blockId: z.string().regex(/^[a-zA-Z0-9_-]+$/).describe('Block directory name inside storefront blocks/'),
            title: z.string().min(1).max(200).describe('Human-readable block title shown in the DA.live library'),
            unsafeHTML: z.string().max(100_000).describe('Example HTML for the block, embedded as plugins.da.unsafeHTML'),
            description: z.string().max(1_000).optional().describe('Optional human-readable description'),
        },
    }, async (args: any) => ({
        content: [{
            type: 'text' as const,
            text: await toolHandlers.promoteBlockToLibrary(
                projectsDir,
                args.projectName,
                args.blockId as string,
                args.title as string,
                args.unsafeHTML as string,
                args.description as string | undefined,
                await resolveCredentials(),
            ),
        }],
    }));

    server.registerTool('remove_block_from_library', {
        title: 'Remove Block from Library',
        description: 'Remove (delete) a block from the DA.live authoring library — the inverse of promote_block_to_library. Removes the component-definition.json entry, deletes the doc page, drops the sheet row, commits/pushes the removal, and unpublishes the doc page. Does NOT delete the block source files in blocks/. Destructive: requires confirm:true.',
        inputSchema: {
            projectName: projectNameSchema,
            blockId: z.string().regex(/^[a-zA-Z0-9_-]+$/).describe('Block directory name inside storefront blocks/'),
            confirm: z.boolean().optional().describe('Must be true — this unpublishes the live doc page and pushes a removal commit'),
        },
    }, async (args: any) => {
        if (args?.confirm !== true) {
            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        error: 'remove_block_from_library unpublishes the live doc page and pushes a removal commit. Call again with confirm:true.',
                        destructive: true,
                    }),
                }],
            };
        }
        return {
            content: [{
                type: 'text' as const,
                text: await toolHandlers.removeBlockFromLibrary(
                    projectsDir,
                    args.projectName,
                    args.blockId as string,
                    await resolveCredentials(),
                ),
            }],
        };
    });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
