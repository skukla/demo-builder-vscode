/**
 * EDS Reset — Repository Reset Helpers
 *
 * Functions for resetting a GitHub repository to template state and
 * re-installing block libraries and inspector tagging.
 *
 * Separated from edsResetService to keep the service file under 500 lines.
 *
 * @module features/eds/services/edsResetRepoHelper
 */

import type { GitHubTreeInput } from './types';
import type { Logger } from '@/types/logger';
import type { GitHubFileOperations } from './githubFileOperations';
import type { HandlerContext } from '@/types/handlers';
import type { AddonSource } from '@/types/demoPackages';
import type { Project } from '@/types/base';
import { assertValidGitHubSlug } from './edsResetParams';
import type { EdsResetParams } from './edsResetParams';
import { generateFstabContent } from './fstabGenerator';
import { generateConfigJson, extractConfigParams } from './configGenerator';
import { installBlockCollections } from './blockCollectionHelpers';
import { generateInspectorTreeEntries, installInspectorTagging } from './inspectorHelpers';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    getBlockLibrarySource, getBlockLibraryContentSource,
    getBlockLibraryName, isBlockLibraryAvailableForPackage,
} from '@/features/project-creation/services/blockLibraryLoader';

// ==========================================================
// Helpers
// ==========================================================

/** Fetch placeholder JSON files from template source into file overrides map. */
async function fetchPlaceholderFiles(
    fileOverrides: Map<string, string>,
    templateOwner: string,
    templateRepo: string,
    logger: Logger,
): Promise<void> {
    assertValidGitHubSlug(templateOwner, 'templateOwner');
    assertValidGitHubSlug(templateRepo, 'templateRepo');

    const placeholderPaths = [
        'placeholders/global', 'placeholders/auth', 'placeholders/cart',
        'placeholders/checkout', 'placeholders/order', 'placeholders/account',
        'placeholders/payment-services', 'placeholders/recommendations', 'placeholders/wishlist',
    ];

    await Promise.allSettled(
        placeholderPaths.map(async (placeholderPath) => {
            try {
                const sourceUrl = `https://main--${templateRepo}--${templateOwner}.aem.live/${placeholderPath}.json`;
                const response = await fetch(sourceUrl, {
                    signal: AbortSignal.timeout(TIMEOUTS.PREREQUISITE_CHECK),
                });
                if (response.ok) {
                    const jsonContent = await response.text();
                    fileOverrides.set(`${placeholderPath}.json`, jsonContent);
                    logger.info(`[EdsReset] Added ${placeholderPath}.json to code files`);
                }
            } catch {
                logger.warn(`[EdsReset] Failed to fetch ${placeholderPath}.json from source`);
            }
        }),
    );
}

/**
 * Build the combined list of block library sources (built-in + custom) for a project.
 * Filters built-in libraries by package compatibility and logs the result.
 */
function collectLibrarySources(
    project: Project,
    effectiveBlockLibraries: string[],
    logger: Logger,
): { allLibraries: Array<{ source: AddonSource; name: string }>; libraryContentSources: Array<{ org: string; site: string }> } {
    const allLibraries: Array<{ source: AddonSource; name: string }> = [];
    const libraryContentSources: Array<{ org: string; site: string }> = [];
    const packageId = project.selectedPackage ?? '';

    for (const libraryId of effectiveBlockLibraries) {
        if (!isBlockLibraryAvailableForPackage(libraryId, packageId)) {
            logger.info(`[EdsReset] Skipping block library '${libraryId}' — not available for package '${packageId}' (onlyForPackages)`);
            continue;
        }
        const source = getBlockLibrarySource(libraryId);
        if (source) {
            allLibraries.push({ source, name: getBlockLibraryName(libraryId) || libraryId });
        } else {
            logger.warn(`[EdsReset] Block library '${libraryId}' selected but no source configured`);
        }
        const cs = getBlockLibraryContentSource(libraryId);
        if (cs) libraryContentSources.push(cs);
    }

    for (const lib of project.customBlockLibraries ?? []) {
        allLibraries.push({ source: lib.source, name: lib.name });
    }

    logger.info(`[EdsReset] Installing blocks from: ${allLibraries.map(l => `${l.source.owner}/${l.source.repo}`).join(', ')}`);
    return { allLibraries, libraryContentSources };
}

/** Step 2: Install block collections with inspector tagging merged into the same commit. */
async function installWithBlockLibraries(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    allLibraries: Array<{ source: AddonSource; name: string }>,
    logger: Logger,
    inspectorEntries: GitHubTreeInput[],
    report: (step: number, message: string) => void,
): Promise<string[]> {
    report(2, `Re-installing blocks from ${allLibraries.length} ${allLibraries.length === 1 ? 'library' : 'libraries'}...`);
    const blockResult = await installBlockCollections(
        githubFileOps, repoOwner, repoName, allLibraries, logger, inspectorEntries,
    );
    if (blockResult.success) {
        logger.info(`[EdsReset] Reinstalled ${blockResult.blocksCount} unique blocks from ${allLibraries.length} libraries (+ inspector tagging)`);
        return blockResult.blockIds;
    }
    logger.warn(`[EdsReset] Block library reinstall failed: ${blockResult.error}`);
    return [];
}

/** Step 3: Install inspector tagging as a standalone commit (no block libraries present). */
async function installInspectorOnly(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    selectedPackage: string | undefined,
    logger: Logger,
    report: (step: number, message: string) => void,
): Promise<void> {
    report(3, 'Installing inspector tagging...');
    const inspectorResult = await installInspectorTagging(
        githubFileOps, repoOwner, repoName, selectedPackage, logger,
    );
    if (inspectorResult.success) {
        logger.info('[EdsReset] Inspector tagging installed (standalone)');
    } else {
        logger.warn(`[EdsReset] Inspector tagging skipped: ${inspectorResult.error}`);
    }
}

/**
 * Steps 2-3: Re-install block libraries and inspector tagging.
 *
 * Step 2 installs block libraries (with inspector entries merged into the same commit).
 * Step 3 runs only when no block libraries are configured — it is skipped in the Step 2 path.
 *
 * Returns block collection IDs and DA.live content sources for installed libraries.
 */
async function reinstallBlockLibraries(
    project: Project,
    repoOwner: string,
    repoName: string,
    githubFileOps: GitHubFileOperations,
    logger: Logger,
    report: (step: number, message: string) => void,
): Promise<{ blockCollectionIds?: string[]; libraryContentSources: Array<{ org: string; site: string }> }> {
    report(2, 'Preparing block libraries...');

    // Generate inspector tree entries (always, for consistency with storefront setup)
    let inspectorEntries: GitHubTreeInput[] = [];
    try {
        inspectorEntries = await generateInspectorTreeEntries(
            githubFileOps, repoOwner, repoName, project.selectedPackage, logger,
        );
    } catch (error) {
        logger.warn(`[EdsReset] Inspector tagging skipped: ${(error as Error).message}`);
    }

    logger.info('[EdsReset] Block library config', {
        selectedBlockLibraries: project.selectedBlockLibraries,
        customBlockLibraries: project.customBlockLibraries?.map(l => `${l.source.owner}/${l.source.repo}`),
        package: project.selectedPackage,
    });

    const { allLibraries, libraryContentSources } = collectLibrarySources(
        project, project.selectedBlockLibraries ?? [], logger,
    );

    let allBlockIds: string[] = [];
    if (allLibraries.length > 0) {
        allBlockIds = await installWithBlockLibraries(
            githubFileOps, repoOwner, repoName, allLibraries, logger, inspectorEntries, report,
        );
    } else if (inspectorEntries.length > 0) {
        await installInspectorOnly(githubFileOps, repoOwner, repoName, project.selectedPackage, logger, report);
    }

    return {
        blockCollectionIds: allBlockIds.length > 0 ? allBlockIds : undefined,
        libraryContentSources,
    };
}

// ==========================================================
// Public API
// ==========================================================

/**
 * Step 1: Reset repository to template using bulk Git Tree operations.
 * Builds file overrides (fstab.yaml, config.json, placeholders) and pushes a single commit.
 * @returns Number of files reset and optional block collection IDs.
 */
export async function resetRepoToTemplate(
    params: EdsResetParams,
    context: HandlerContext,
    githubFileOps: GitHubFileOperations,
    report: (step: number, message: string) => void,
): Promise<{ filesReset: number; blockCollectionIds?: string[]; libraryContentSources: Array<{ org: string; site: string }> }> {
    const { repoOwner, repoName, daLiveOrg, daLiveSite, templateOwner, templateRepo, project, includeBlockLibrary = false } = params;

    report(1, 'Resetting repository to template...');
    context.logger.info(`[EdsReset] Resetting repo using bulk tree operations`);

    const fstabContent = generateFstabContent({ daLiveOrg, daLiveSite });
    const fileOverrides = new Map<string, string>();
    fileOverrides.set('fstab.yaml', fstabContent);

    // Generate config.json with Commerce configuration
    const configParams = {
        githubOwner: repoOwner, repoName, daLiveOrg, daLiveSite,
        ...extractConfigParams(project),
    };
    const configResult = generateConfigJson(configParams, context.logger);
    if (configResult.success && configResult.content) {
        fileOverrides.set('config.json', configResult.content);
        fileOverrides.set('demo-config.json', configResult.content);
        context.logger.info('[EdsReset] Generated config.json for reset');
    } else {
        context.logger.warn(`[EdsReset] Failed to generate demo-config.json: ${configResult.error}`);
    }

    if (includeBlockLibrary) {
        await fetchPlaceholderFiles(fileOverrides, templateOwner, templateRepo, context.logger);
    }

    const resetResult = await githubFileOps.resetRepoToTemplate(
        templateOwner, templateRepo, repoOwner, repoName, fileOverrides, 'main',
    );

    context.logger.info(`[EdsReset] Repository reset complete: ${resetResult.fileCount} files, commit ${resetResult.commitSha.substring(0, 7)}`);
    report(1, `Reset ${resetResult.fileCount} files`);

    const { blockCollectionIds, libraryContentSources } = await reinstallBlockLibraries(
        project, repoOwner, repoName, githubFileOps, context.logger, report,
    );

    return { filesReset: resetResult.fileCount, blockCollectionIds, libraryContentSources };
}
