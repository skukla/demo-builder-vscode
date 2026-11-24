/**
 * Block-authoring helpers for the file-based MCP tools.
 *
 * The manifest side of the block tools: the installed-block-library manifest
 * read, the promote-context extraction, the block-source existence check, and
 * the defense-in-depth HTML sanitizer for AI-supplied `unsafeHTML`. (The
 * `component-definition.json` helpers were deleted with EDS-71 step 5: the
 * block list follows the storefront's code.)
 *
 * Split from `mcp-server.ts` (god-file decomposition, 2026-08-23).
 *
 * @module mcp/blockAuthoring
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import sanitizeHtml from 'sanitize-html';
import type { ManifestWithInstances } from '@/features/eds/services/blockLibrary/examplesNeededRecord';

// Rows in a get_block_authoring_shape INDEX. An index of 300 registry entries
// measured 21,992 bytes before this cap. The index/detail split bounds the
// detail call, not a storefront that keeps growing.
export const MAX_AUTHORING_INDEX_ROWS = 100;
// Default page size for the file-based list tools. 100 rather than the 20 used
// for the Data Installer's lists: these rows are terse (a name and a path) and
// seeing the whole catalog is usually the point, so 100 changes nothing for a
// real project while capping the tail.
export const DEFAULT_LIST_LIMIT = 100;

export interface InstalledBlockLibraryEntry {
    name: string;
    source: { owner: string; repo: string; branch?: string };
    blockIds: string[];
}

/** The manifest fields the block tools read, as JSON on disk (nothing here is trusted). */
export interface BlockToolManifest extends ManifestWithInstances {
    installedBlockLibraries?: unknown;
}

/** The project's manifest as it is on disk (`.demo-builder.json`). Read only, never written here. */
export async function readManifest(projectPath: string): Promise<BlockToolManifest> {
    const raw = await fsPromises.readFile(path.join(projectPath, '.demo-builder.json'), 'utf-8');
    return JSON.parse(raw);
}

/**
 * Read the project manifest and return the installed block libraries (or an
 * empty list if none).
 */
export async function readInstalledBlockLibraries(
    projectPath: string,
): Promise<InstalledBlockLibraryEntry[]> {
    const libs = (await readManifest(projectPath))?.installedBlockLibraries;
    return Array.isArray(libs) ? (libs as InstalledBlockLibraryEntry[]) : [];
}

// ─── promote_block_to_library helpers ────────────────────────────────────────

export interface PromoteBlockContext {
    storefrontPath: string;
    daLiveOrg: string;
    daLiveSite: string;
    githubRepo?: { owner: string; site: string; branch?: string };
}

/**
 * Read the manifest and extract the fields needed by promoteBlockToLibrary.
 * Throws if no EDS storefront, daLiveOrg, or daLiveSite is configured.
 */
export async function readPromoteBlockContext(projectPath: string): Promise<PromoteBlockContext> {
    const raw = await fsPromises.readFile(path.join(projectPath, '.demo-builder.json'), 'utf-8');
    const manifest = JSON.parse(raw);
    const edsInstance = manifest?.componentInstances?.['eds-storefront'];
    const storefrontPath = edsInstance?.path;
    if (!storefrontPath) {
        throw new Error('No EDS storefront configured for this project');
    }
    const metadata = edsInstance?.metadata ?? {};
    const daLiveOrg = metadata.daLiveOrg;
    // Legacy-first, repo fallback: daLiveSite metadata survives only on
    // unmigrated projects; the loader strips the redundant equal copy.
    const daLiveSite =
        metadata.daLiveSite ??
        (typeof metadata.githubRepo === 'string' ? metadata.githubRepo.split('/')[1] : undefined);
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
 * Verify the block source directory exists under <storefrontPath>/blocks/.
 * Throws "Block source not found: <blockId>" otherwise.
 */
export async function verifyBlockSourceExists(storefrontPath: string, blockId: string): Promise<void> {
    const blockDir = path.join(storefrontPath, 'blocks', blockId);
    try {
        await fsPromises.stat(blockDir);
    } catch {
        throw new Error(`Block source not found: ${blockId}`);
    }
}

/**
 * Defense-in-depth sanitizer for AI-supplied `unsafeHTML` flowing into the
 * `promote_block_to_library` tool. Strips XSS vectors (script tags, event
 * handlers, `javascript:` URLs, framing tags) before the HTML lands in
 * `.da/library/blocks/<id>.html` (published to the user's CDN).
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
export function sanitizeBlockHtml(rawHtml: string): string {
    return sanitizeHtml(rawHtml, {
        allowedTags: [
            // Semantic + flow content
            'div',
            'span',
            'p',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'ul',
            'ol',
            'li',
            'dl',
            'dt',
            'dd',
            'blockquote',
            'pre',
            'code',
            'hr',
            'br',
            'strong',
            'em',
            'b',
            'i',
            'u',
            's',
            'small',
            'sub',
            'sup',
            'mark',
            'a',
            'img',
            'picture',
            'source',
            'figure',
            'figcaption',
            'table',
            'thead',
            'tbody',
            'tr',
            'td',
            'th',
            'caption',
            'section',
            'article',
            'header',
            'footer',
            'nav',
            'aside',
            'main',
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
