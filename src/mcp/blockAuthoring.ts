/**
 * Block-authoring helpers for the file-based MCP tools.
 *
 * The registry side of the block tools: the installed-block-library manifest
 * read, the promote-context extraction, `component-definition.json` read /
 * append / remove, the sibling model/filter registries, the authoring-
 * convention classifier, the block-source existence check, and the
 * defense-in-depth HTML sanitizer for AI-supplied `unsafeHTML`.
 *
 * Split from `mcp-server.ts` (god-file decomposition, 2026-08-23).
 *
 * @module mcp/blockAuthoring
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import sanitizeHtml from 'sanitize-html';

// Rows in a get_block_authoring_shape INDEX. A 78-block catalog is 5,577 bytes;
// a 300-component one measured 21,992. The index/detail split bounds the detail
// call, not a catalog that keeps growing.
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

/**
 * Read the project manifest and return the installed block libraries (or an
 * empty list if none).
 */
export async function readInstalledBlockLibraries(
    projectPath: string,
): Promise<InstalledBlockLibraryEntry[]> {
    const raw = await fsPromises.readFile(path.join(projectPath, '.demo-builder.json'), 'utf-8');
    const manifest = JSON.parse(raw);
    const libs = manifest?.installedBlockLibraries;
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

/** Parsed shape of `component-definition.json` — a groups[]-nested registry. */
interface ComponentDefinition {
    groups?: Array<{ components?: ComponentDefinitionEntry[] }>;
}

/**
 * Read and parse `<storefrontPath>/component-definition.json`.
 *
 * Both failure modes (missing file, malformed JSON) are reported against the
 * file's name — a bare ENOENT or SyntaxError says nothing about which file, and
 * three callers now depend on telling them apart.
 */
export async function readComponentDefinition(
    storefrontPath: string,
): Promise<{ compDefPath: string; parsed: ComponentDefinition }> {
    const compDefPath = path.join(storefrontPath, 'component-definition.json');
    let raw: string;
    try {
        raw = await fsPromises.readFile(compDefPath, 'utf-8');
    } catch (err) {
        throw new Error(
            `Could not read component-definition.json at ${compDefPath}: ${(err as Error).message}`,
        );
    }
    try {
        return { compDefPath, parsed: JSON.parse(raw) as ComponentDefinition };
    } catch (err) {
        throw new Error(
            `component-definition.json is not valid JSON (${compDefPath}): ${(err as Error).message}`,
        );
    }
}

/**
 * Which of the three authoring conventions an entry uses. Reported in the index
 * so an agent knows what kind of shape the detail call will return — and so
 * "registered but shapeless" is visible without a call per block.
 */
export function authoringConvention(
    entry: ComponentDefinitionEntry,
): 'table' | 'fields' | 'html' | 'none' {
    const da = entry.plugins?.da;
    if (!da) return 'none';
    if (da.unsafeHTML) return 'html';
    if (da.fields || da.type) return 'fields';
    if (da.rows !== undefined || da.columns !== undefined) return 'table';
    return 'none';
}

/**
 * Read a sibling registry file (`component-models.json` / `component-filters.json`)
 * and return the entry with the given id.
 *
 * Both files are OPTIONAL and a miss is normal, not an error: a storefront may
 * ship neither, and 38 of 78 real components resolve no model fields (27 name a
 * model id with no entry; 11 name none at all).
 * Every failure — absent file, bad JSON, unexpected top-level shape, no match —
 * collapses to `undefined`, because the caller's answer is still useful without it.
 */
async function readRegistryEntry(
    storefrontPath: string,
    fileName: string,
    id: string | undefined,
): Promise<Record<string, unknown> | undefined> {
    if (!id) return undefined;
    try {
        const raw = await fsPromises.readFile(path.join(storefrontPath, fileName), 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return undefined;
        return (parsed as Array<Record<string, unknown>>).find((e) => e?.id === id);
    } catch {
        return undefined;
    }
}

/** Model fields projected to what an author needs: what to type, where, called what. */
export async function resolveModelFields(
    storefrontPath: string,
    modelId: string | undefined,
): Promise<Array<{ name: unknown; label: unknown; component: unknown }> | undefined> {
    const model = await readRegistryEntry(storefrontPath, 'component-models.json', modelId);
    const fields = model?.fields;
    if (!Array.isArray(fields) || fields.length === 0) return undefined;
    return (fields as Array<Record<string, unknown>>).map((f) => ({
        name: f.name,
        label: f.label,
        component: f.component,
    }));
}

/** The component ids allowed to nest inside this block, per component-filters.json. */
export async function resolveFilterChildren(
    storefrontPath: string,
    filterId: string | undefined,
): Promise<string[] | undefined> {
    const filter = await readRegistryEntry(storefrontPath, 'component-filters.json', filterId);
    const components = filter?.components;
    return Array.isArray(components) && components.length > 0 ? (components as string[]) : undefined;
}

/**
 * Read component-definition.json, append the new entry to the first group's
 * components if missing, write it back, and return whether a change was made.
 *
 * `description` (when provided) lands at `components[].description` — the EDS
 * authoring runtime renders it as a tooltip on the block tile in the picker.
 */
export async function applyComponentDefinitionEntry(
    storefrontPath: string,
    blockId: string,
    title: string,
    unsafeHTML: string,
    description: string | undefined,
): Promise<'added' | 'unchanged'> {
    const { compDefPath, parsed } = await readComponentDefinition(storefrontPath);
    const groups = parsed.groups ?? [];
    const allComponents = groups.flatMap((g) => g.components ?? []);
    if (allComponents.some((c) => c.id === blockId)) {
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
    firstGroup.components = [...(firstGroup.components ?? []), entry];
    await fsPromises.writeFile(compDefPath, JSON.stringify(parsed, null, 2), 'utf-8');
    return 'added';
}

/**
 * Inverse of {@link applyComponentDefinitionEntry}: read
 * `component-definition.json`, drop any `components[]` entry with
 * `id === blockId` across all `groups[]`, and write back only if something
 * changed. Returns `'removed'` when an entry was dropped, `'absent'` otherwise.
 */
export async function removeComponentDefinitionEntry(
    storefrontPath: string,
    blockId: string,
): Promise<'removed' | 'absent'> {
    const { compDefPath, parsed } = await readComponentDefinition(storefrontPath);
    const groups = parsed.groups ?? [];
    let changed = false;
    for (const group of groups) {
        const components = group.components;
        if (!components) continue;
        const filtered = components.filter((c) => c.id !== blockId);
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
export interface ComponentDefinitionEntry {
    id: string;
    title?: string;
    description?: string;
    /** Names an entry in `component-models.json`; 27 of 78 real entries name one that does not exist, and 11 more name none. */
    model?: string;
    /** Names an entry in `component-filters.json` — which components may nest inside. */
    filter?: string;
    /**
     * The authoring shape. `unsafeHTML` is what the promote flow writes, but it
     * is the RAREST form in a real storefront (4 of 78) — template-shipped
     * blocks describe themselves with `rows`/`columns` or `name`/`type`/`fields`.
     * Left open-ended because the EDS authoring runtime owns this schema.
     */
    plugins?: { da?: Record<string, unknown> & { unsafeHTML?: string } };
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
 * Build a static TokenProvider that returns the given token.
 * The promote flow resolves the DA.live token once (from the injected
 * credentials) and wraps it here — it does not fetch/refresh mid-call.
 */

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
