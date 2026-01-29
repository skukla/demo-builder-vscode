/**
 * Content Patch Registry
 *
 * Loads and applies patches to DA.live HTML content during the content copy process.
 * Supports both local patches (bundled in config/content-patches.json) and external
 * patches (fetched from a GitHub repository at runtime).
 *
 * External patches allow decoupling patch maintenance from the Demo Builder release cycle.
 * External repo structure: {path}/patches.json (same format as local content-patches.json)
 *
 * Unlike templatePatchRegistry (which uses separate .ts files for multi-line JS
 * replacements that benefit from syntax highlighting), content patches are short
 * string replacements that fit naturally in JSON.
 */

import type { Logger } from '@/types';
import type { ContentPatchSource } from '@/types/demoPackages';

import contentPatchesConfig from '../config/content-patches.json';

/**
 * Content patch definition (loaded directly from JSON)
 */
export interface ContentPatch {
    id: string;
    pagePath: string;
    description: string;
    searchPattern: string;
    replacement: string;
}

/**
 * Result of applying a content patch
 */
export interface ContentPatchResult {
    patchId: string;
    pagePath: string;
    applied: boolean;
    reason?: string;
}

/**
 * All available content patches (local/bundled)
 */
export const CONTENT_PATCHES: ContentPatch[] = contentPatchesConfig.patches;

/**
 * Gets a content patch by its ID from local patches
 */
export function getContentPatchById(id: string): ContentPatch | undefined {
    return CONTENT_PATCHES.find((p) => p.id === id);
}

/**
 * Fetch patches.json from external repository
 *
 * @param source - External patch source configuration
 * @returns Array of all patches from the external file
 */
async function fetchExternalPatches(source: ContentPatchSource): Promise<ContentPatch[]> {
    const url = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/main/${source.path}/patches.json`;

    const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch patches: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.patches || [];
}

/**
 * Get content patches - from external source if configured, else local
 *
 * @param patchIds - Array of patch IDs to retrieve
 * @param source - Optional external patch source configuration
 * @param logger - Logger instance
 * @returns Array of ContentPatch objects matching the requested IDs
 */
export async function getContentPatches(
    patchIds: string[],
    source: ContentPatchSource | undefined,
    logger: Logger,
): Promise<ContentPatch[]> {
    let allPatches: ContentPatch[];

    if (source) {
        try {
            logger.info(`[ContentPatch] Fetching patches from ${source.owner}/${source.repo}`);
            allPatches = await fetchExternalPatches(source);
        } catch (error) {
            logger.warn(`[ContentPatch] External fetch failed, falling back to local: ${(error as Error).message}`);
            allPatches = CONTENT_PATCHES;
        }
    } else {
        allPatches = CONTENT_PATCHES;
    }

    // Filter to requested patch IDs
    const patchMap = new Map(allPatches.map((p) => [p.id, p]));
    return patchIds
        .map((id) => patchMap.get(id))
        .filter((patch): patch is ContentPatch => patch !== undefined);
}

/**
 * Applies content patches to HTML content for a specific page path.
 *
 * Filters patches to only those matching both the page path AND the provided patch IDs,
 * then applies search/replace on the HTML string.
 *
 * Supports both local patches (bundled) and external patches (fetched from GitHub repo).
 *
 * @param html - HTML content to patch
 * @param pagePath - Current page path (e.g., "/index", "/phones")
 * @param patchIds - Array of patch IDs to apply (from demo-packages.json)
 * @param logger - Logger instance
 * @param contentPatchSource - Optional external patch source configuration
 * @returns Object with patched HTML and results array
 */
export async function applyContentPatches(
    html: string,
    pagePath: string,
    patchIds: string[],
    logger: Logger,
    contentPatchSource?: ContentPatchSource,
): Promise<{ html: string; results: ContentPatchResult[] }> {
    const results: ContentPatchResult[] = [];

    if (!patchIds || patchIds.length === 0) {
        return { html, results };
    }

    // Get patches from external source or local
    const allPatches = await getContentPatches(patchIds, contentPatchSource, logger);

    // Filter to patches matching the current page path
    const patchesToApply = allPatches.filter((patch) => patch.pagePath === pagePath);

    if (patchesToApply.length === 0) {
        return { html, results };
    }

    // Log unknown patch IDs (patches that were requested but not found)
    const foundIds = new Set(allPatches.map((p) => p.id));
    const unknownIds = patchIds.filter((id) => !foundIds.has(id));
    if (unknownIds.length > 0) {
        logger.warn(`[ContentPatch] Unknown content patch IDs: ${unknownIds.join(', ')}`);
    }

    let patchedHtml = html;

    for (const patch of patchesToApply) {
        if (!patchedHtml.includes(patch.searchPattern)) {
            results.push({
                patchId: patch.id,
                pagePath: patch.pagePath,
                applied: false,
                reason: 'Search pattern not found in content',
            });
            continue;
        }

        patchedHtml = patchedHtml.replace(patch.searchPattern, patch.replacement);

        logger.info(`[ContentPatch] Applied '${patch.id}' to ${patch.pagePath}`);
        results.push({
            patchId: patch.id,
            pagePath: patch.pagePath,
            applied: true,
        });
    }

    return { html: patchedHtml, results };
}
