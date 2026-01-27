/**
 * Content Patch Registry
 *
 * Loads and applies patches to DA.live HTML content during the content copy process.
 * All patch data lives in config/content-patches.json (single source of truth).
 *
 * Unlike templatePatchRegistry (which uses separate .ts files for multi-line JS
 * replacements that benefit from syntax highlighting), content patches are short
 * string replacements that fit naturally in JSON.
 */

import type { Logger } from '@/types';

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
 * All available content patches
 */
export const CONTENT_PATCHES: ContentPatch[] = contentPatchesConfig.patches;

/**
 * Gets a content patch by its ID
 */
export function getContentPatchById(id: string): ContentPatch | undefined {
    return CONTENT_PATCHES.find((p) => p.id === id);
}

/**
 * Applies content patches to HTML content for a specific page path.
 *
 * Filters patches to only those matching both the page path AND the provided patch IDs,
 * then applies search/replace on the HTML string.
 *
 * @param html - HTML content to patch
 * @param pagePath - Current page path (e.g., "/index", "/phones")
 * @param patchIds - Array of patch IDs to apply (from demo-packages.json)
 * @param logger - Logger instance
 * @returns Object with patched HTML and results array
 */
export function applyContentPatches(
    html: string,
    pagePath: string,
    patchIds: string[],
    logger: Logger,
): { html: string; results: ContentPatchResult[] } {
    const results: ContentPatchResult[] = [];

    if (!patchIds || patchIds.length === 0) {
        return { html, results };
    }

    // Get patches that match both the provided IDs and the current page path
    const patchesToApply = patchIds
        .map((id) => getContentPatchById(id))
        .filter((patch): patch is ContentPatch => patch !== undefined && patch.pagePath === pagePath);

    if (patchesToApply.length === 0) {
        return { html, results };
    }

    // Log unknown patch IDs
    const knownIds = new Set(CONTENT_PATCHES.map((p) => p.id));
    const unknownIds = patchIds.filter((id) => !knownIds.has(id));
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
