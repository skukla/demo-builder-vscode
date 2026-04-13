/**
 * Storefront Setup Phase 2: Helix Configuration
 *
 * Handles fstab.yaml generation, block collection installation,
 * feature pack installation, and GitHub App verification.
 *
 * Phase 1 (GitHub repo) lives in storefrontSetupPhase1.ts.
 * Phase 3 (code sync + config service) lives in storefrontSetupPhase3.ts.
 * The main orchestrator lives in storefrontSetupPhases.ts.
 *
 * @module features/eds/handlers/storefrontSetupPhase2
 */

import { installBlockCollections, type BlockLibraryEntry } from '../services/blockCollectionHelpers';
import { installFeaturePacks } from '../services/featurePackInstaller';
import { generateFstabContent } from '../services/fstabGenerator';
import { GitHubFileOperations } from '../services/githubFileOperations';
import { generateInspectorTreeEntries, installInspectorTagging } from '../services/inspectorHelpers';
import { type GitHubTreeInput } from '../services/types';
import { checkGitHubAppForExistingRepo } from './storefrontSetupPhaseHelpers';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import { getBlockLibraryName, getBlockLibrarySource, isBlockLibraryAvailableForPackage } from '@/features/project-creation/services/blockLibraryLoader';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';

// Validates GitHub owner/repo names. Must start and end with alphanumeric;
// no leading/trailing dots or hyphens. Invalid identifiers are rejected by GitHub API.
const GITHUB_IDENTIFIER = /^[a-zA-Z0-9](?:[a-zA-Z0-9_.-]*[a-zA-Z0-9])?$/;

// ==========================================================
// Block Library Options
// ==========================================================

/**
 * Optional block library parameters for storefront setup.
 * Bundles the four optional library-related params to reduce function arity.
 */
export interface BlockLibraryOptions {
    selectedBlockLibraries?: string[];
    customBlockLibraries?: CustomBlockLibrary[];
    packageId?: string;
    selectedFeaturePacks?: string[];
    /**
     * Whether the user selected an existing repo (vs. creating a new one).
     * Set by the orchestrator (`executeStorefrontSetupPhases`) from `edsConfig.repoMode`.
     * Any value provided by external callers is overwritten by the orchestrator.
     */
    useExistingRepo?: boolean;
}

// ==========================================================
// Phase 2: Helix Configuration
// ==========================================================

/**
 * Execute Phase 2: Helix configuration (fstab.yaml, block collection, GitHub App check)
 */
export async function executePhaseHelixConfig(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    signal: AbortSignal,
    options?: BlockLibraryOptions,
): Promise<{ blockCollectionIds?: string[]; earlyReturn?: StorefrontSetupResult }> {
    const logger = context.logger;
    const { githubFileOps } = services;
    const effectiveBlockLibraries = options?.selectedBlockLibraries ?? [];
    const useExistingRepo = options?.useExistingRepo ?? false;

    if (signal.aborted) {
        throw new Error('Operation cancelled');
    }

    await context.sendMessage('storefront-setup-progress', {
        phase: 'storefront-code', message: 'Configuring Edge Delivery Services...', progress: 20,
    });

    await pushFstabToGitHub(githubFileOps, repoInfo, edsConfig, context, logger);

    const allLibraries = collectAllBlockLibraries(
        effectiveBlockLibraries, options?.customBlockLibraries, options?.packageId ?? '', logger,
    );
    const blockCollectionIds = await installBlockCollectionsWithTracking(
        githubFileOps, repoInfo, allLibraries, context, options?.packageId, logger,
    );

    const selectedFeaturePacks = options?.selectedFeaturePacks;
    if (selectedFeaturePacks && selectedFeaturePacks.length > 0) {
        await context.sendMessage('storefront-setup-progress', {
            phase: 'storefront-code',
            message: `Installing ${selectedFeaturePacks.length} feature ${selectedFeaturePacks.length === 1 ? 'pack' : 'packs'}...`,
            progress: 32,
        });
        const fpResult = await installFeaturePacks(
            githubFileOps, repoInfo.repoOwner, repoInfo.repoName, selectedFeaturePacks, logger,
        );
        if (fpResult.success) {
            logger.info(`[Storefront Setup] Feature packs installed: ${fpResult.blocksInstalled} blocks, ${fpResult.initializersInstalled} initializers, ${fpResult.dependenciesAdded} dependencies`);
        } else {
            logger.warn(`[Storefront Setup] Feature pack installation warning: ${fpResult.error}`);
        }
    }

    if (useExistingRepo) {
        const earlyReturn = await checkGitHubAppForExistingRepo(context, services, repoInfo);
        if (earlyReturn) return { blockCollectionIds, earlyReturn };
    }

    await context.sendMessage('storefront-setup-progress', {
        phase: 'storefront-code', message: 'Helix configured', progress: 35,
    });

    return { blockCollectionIds };
}

/** Push fstab.yaml to GitHub with the DA.live content source configuration */
async function pushFstabToGitHub(
    githubFileOps: GitHubFileOperations,
    repoInfo: RepoInfo,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    context: HandlerContext,
    logger: Logger,
): Promise<void> {
    await context.sendMessage('storefront-setup-progress', {
        phase: 'storefront-code', message: 'Pushing fstab.yaml configuration...', progress: 25,
    });
    const fstabContent = generateFstabContent({ daLiveOrg: edsConfig.daLiveOrg, daLiveSite: edsConfig.daLiveSite });
    const existingFstab = await githubFileOps.getFileContent(repoInfo.repoOwner, repoInfo.repoName, 'fstab.yaml');
    await githubFileOps.createOrUpdateFile(
        repoInfo.repoOwner, repoInfo.repoName, 'fstab.yaml', fstabContent,
        'chore: configure fstab.yaml for DA.live content source', existingFstab?.sha,
    );
    logger.info('[Storefront Setup] fstab.yaml pushed to GitHub');
}

/** Collect built-in and custom block library entries, filtering by package compatibility */
function collectAllBlockLibraries(
    selectedBlockLibraries: string[] | undefined,
    customBlockLibraries: CustomBlockLibrary[] | undefined,
    packageId: string,
    logger: Logger,
): BlockLibraryEntry[] {
    const allLibraries: BlockLibraryEntry[] = [];
    if (selectedBlockLibraries && selectedBlockLibraries.length > 0) {
        for (const libraryId of selectedBlockLibraries) {
            if (!isBlockLibraryAvailableForPackage(libraryId, packageId)) {
                logger.info(`[Storefront Setup] Skipping block library '${libraryId}' — not available for package '${packageId}' (onlyForPackages)`);
                continue;
            }
            const source = getBlockLibrarySource(libraryId);
            if (source) {
                allLibraries.push({ source, name: getBlockLibraryName(libraryId) || libraryId });
            } else {
                logger.warn(`[Storefront Setup] Block library '${libraryId}' selected but no source configured`);
            }
        }
    }
    if (customBlockLibraries && customBlockLibraries.length > 0) {
        for (const lib of customBlockLibraries) {
            if (!lib.source.owner || !lib.source.repo ||
                !GITHUB_IDENTIFIER.test(lib.source.owner) || !GITHUB_IDENTIFIER.test(lib.source.repo)) {
                logger.warn(`[Storefront Setup] Skipping custom block library '${lib.name}' — invalid source owner or repo`);
                continue;
            }
            allLibraries.push({ source: lib.source, name: lib.name });
        }
    }
    return allLibraries;
}

/**
 * Generate inspector entries and install block collections atomically.
 * Falls back to standalone inspector tagging when no libraries are selected.
 * Returns the installed block collection IDs, or undefined if none installed.
 */
async function installBlockCollectionsWithTracking(
    githubFileOps: GitHubFileOperations,
    repoInfo: RepoInfo,
    allLibraries: BlockLibraryEntry[],
    context: HandlerContext,
    packageId: string | undefined,
    logger: Logger,
): Promise<string[] | undefined> {
    await context.sendMessage('storefront-setup-progress', {
        phase: 'storefront-code', message: 'Preparing inspector tagging...', progress: 27,
    });
    let inspectorEntries: GitHubTreeInput[];
    try {
        inspectorEntries = await generateInspectorTreeEntries(
            githubFileOps, repoInfo.repoOwner, repoInfo.repoName, packageId, logger,
        );
    } catch (error) {
        logger.warn(`[Storefront Setup] Inspector tagging skipped: ${(error as Error).message}`);
        inspectorEntries = [];
    }

    if (allLibraries.length > 0) {
        await context.sendMessage('storefront-setup-progress', {
            phase: 'storefront-code',
            message: `Installing blocks from ${allLibraries.length} ${allLibraries.length === 1 ? 'library' : 'libraries'}...`,
            progress: 28,
        });
        const result = await installBlockCollections(
            githubFileOps, repoInfo.repoOwner, repoInfo.repoName, allLibraries, logger, inspectorEntries,
        );
        if (result.success) {
            logger.info(`[Storefront Setup] Installed ${result.blocksCount} unique blocks from ${allLibraries.length} libraries (+ inspector tagging)`);
            if (result.libraryVersions && result.libraryVersions.length > 0) {
                const currentProject = await context.stateManager.getCurrentProject();
                if (currentProject) {
                    currentProject.installedBlockLibraries = result.libraryVersions.map(lv => ({
                        name: lv.name, source: lv.source, commitSha: lv.commitSha,
                        blockIds: lv.blockIds, installedAt: new Date().toISOString(),
                    }));
                    await context.stateManager.saveProject(currentProject);
                    logger.info(`[Storefront Setup] Saved install tracking for ${result.libraryVersions.length} block libraries`);
                }
            }
            return result.blockIds;
        }
        logger.warn(`[Storefront Setup] Block library installation failed: ${result.error}`);
    } else if (inspectorEntries.length > 0) {
        await applyStandaloneInspectorTagging(githubFileOps, repoInfo, packageId, context, logger);
    }
    return undefined;
}

/**
 * Install inspector tagging when no block libraries are selected.
 */
async function applyStandaloneInspectorTagging(
    githubFileOps: GitHubFileOperations,
    repoInfo: RepoInfo,
    packageId: string | undefined,
    context: HandlerContext,
    logger: Logger,
): Promise<void> {
    const inspectorResult = await installInspectorTagging(
        githubFileOps, repoInfo.repoOwner, repoInfo.repoName, packageId, logger,
    );
    if (inspectorResult.success) {
        await context.sendMessage('storefront-setup-progress', {
            phase: 'storefront-code', message: 'Inspector tagging installed', progress: 28,
        });
        logger.info('[Storefront Setup] Inspector tagging installed (standalone)');
    } else {
        logger.warn(`[Storefront Setup] Inspector tagging skipped: ${inspectorResult.error}`);
    }
}
