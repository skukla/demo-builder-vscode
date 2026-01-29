/**
 * Template Patch Registry
 *
 * Loads and applies patches to EDS template files during reset operations.
 *
 * Configuration structure:
 * - Patch metadata (id, filePath, description) in config/template-patches.json
 * - Patch content (searchPattern, replacement) in config/patches/{id}.ts
 *
 * This follows the same pattern as prerequisites.json and components.json,
 * with the addition of separate files for code content (better syntax highlighting).
 */

import type { Logger } from '@/types';

// Import patch metadata from JSON config
import patchesConfig from '../config/template-patches.json';

// Import patch content from TypeScript files
import { patchContent } from '../config/patches';

/**
 * Patch metadata from JSON config
 */
interface PatchMetadata {
    id: string;
    filePath: string;
    description: string;
}

/**
 * Complete patch definition (metadata + content)
 */
export interface TemplatePatch {
    /** Unique identifier for the patch (referenced in demo-packages.json) */
    id: string;

    /** Relative path to the file in the template repo (e.g., 'blocks/header/header.js') */
    filePath: string;

    /** Description of what the patch fixes */
    description: string;

    /** The original code pattern to find */
    searchPattern: string;

    /** The replacement code */
    replacement: string;
}

/**
 * Result of applying a patch
 */
export interface PatchResult {
    patchId: string;
    filePath: string;
    applied: boolean;
    reason?: string;
}

/**
 * Merge patch metadata (from JSON) with patch content (from TypeScript files)
 */
function loadPatches(): TemplatePatch[] {
    const patches: TemplatePatch[] = [];

    for (const metadata of patchesConfig.patches as PatchMetadata[]) {
        const content = patchContent[metadata.id];

        if (!content) {
            console.warn(`[TemplatePatch] Missing content file for patch '${metadata.id}'`);
            continue;
        }

        patches.push({
            id: metadata.id,
            filePath: metadata.filePath,
            description: metadata.description,
            searchPattern: content.searchPattern,
            replacement: content.replacement,
        });
    }

    return patches;
}

/**
 * Registry of all available template patches (loaded from config + content files)
 */
export const TEMPLATE_PATCHES: TemplatePatch[] = loadPatches();

/**
 * Gets a patch by its ID
 */
export function getPatchById(id: string): TemplatePatch | undefined {
    return TEMPLATE_PATCHES.find((p) => p.id === id);
}

/**
 * Gets all available patches
 */
export function getAllPatches(): TemplatePatch[] {
    return [...TEMPLATE_PATCHES];
}

/**
 * Applies specified patches to template files
 *
 * Fetches files from the template repo, applies patches, and adds them to fileOverrides.
 * Only patches whose IDs are in the patchIds array will be applied.
 *
 * @param templateOwner - GitHub owner of the template repo
 * @param templateRepo - GitHub repo name of the template
 * @param patchIds - Array of patch IDs to apply (from demo-packages.json)
 * @param fileOverrides - Map of file paths to their content (will be mutated)
 * @param logger - Logger instance for debug output
 * @returns Array of patch results
 */
export async function applyTemplatePatches(
    templateOwner: string,
    templateRepo: string,
    patchIds: string[],
    fileOverrides: Map<string, string>,
    logger: Logger,
): Promise<PatchResult[]> {
    const results: PatchResult[] = [];

    // If no patches specified, return early
    if (!patchIds || patchIds.length === 0) {
        logger.debug('[TemplatePatch] No patches specified for this template');
        return results;
    }

    // Get patches by ID
    const patchesToApply = patchIds
        .map((id) => getPatchById(id))
        .filter((patch): patch is TemplatePatch => patch !== undefined);

    // Log any unknown patch IDs
    const knownIds = new Set(TEMPLATE_PATCHES.map((p) => p.id));
    const unknownIds = patchIds.filter((id) => !knownIds.has(id));
    if (unknownIds.length > 0) {
        logger.warn(`[TemplatePatch] Unknown patch IDs in config: ${unknownIds.join(', ')}`);
    }

    for (const patch of patchesToApply) {
        try {
            // Check if we already have this file in overrides (from a previous patch)
            // This allows multiple patches to the same file to work correctly
            let content = fileOverrides.get(patch.filePath);

            if (!content) {
                // Fetch the file from the template repo
                const fileUrl = `https://raw.githubusercontent.com/${templateOwner}/${templateRepo}/main/${patch.filePath}`;
                const response = await fetch(fileUrl);

                if (!response.ok) {
                    results.push({
                        patchId: patch.id,
                        filePath: patch.filePath,
                        applied: false,
                        reason: `Failed to fetch file: HTTP ${response.status}`,
                    });
                    continue;
                }

                content = await response.text();
            }

            // Check if the search pattern exists
            if (!content.includes(patch.searchPattern)) {
                results.push({
                    patchId: patch.id,
                    filePath: patch.filePath,
                    applied: false,
                    reason: 'Search pattern not found (file may already be patched or has changed)',
                });
                continue;
            }

            // Apply the patch
            content = content.replace(patch.searchPattern, patch.replacement);
            fileOverrides.set(patch.filePath, content);

            logger.info(`[TemplatePatch] Applied patch '${patch.id}' to ${patch.filePath}`);
            results.push({
                patchId: patch.id,
                filePath: patch.filePath,
                applied: true,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.warn(`[TemplatePatch] Failed to apply patch '${patch.id}': ${message}`);
            results.push({
                patchId: patch.id,
                filePath: patch.filePath,
                applied: false,
                reason: message,
            });
        }
    }

    return results;
}
