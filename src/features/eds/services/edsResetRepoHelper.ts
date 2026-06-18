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

import { installBlockCollections } from './blockCollectionHelpers';
import { applyCanonicalCodePatches } from './codePatchPipelineHelpers';
import type { CodePatchResult } from './codePatchRegistry';
import { generateConfigJson, extractConfigParams } from './configGenerator';
import { assertValidGitHubSlug, type EdsResetParams } from './edsResetParams';
import { generateFstabContent } from './fstabGenerator';
import type { GitHubFileOperations } from './githubFileOperations';
import { generateInspectorTreeEntries, installInspectorTagging } from './inspectorHelpers';
import { readLkgSha } from './lkgReader';
import { installSmart404Handler } from './pdp404HandlerPublisher';
import { installQuickEdit } from './quickEditPublisher';
import { getRuntimeSurfaces, type RuntimeSurfaceSource } from './runtimeSurfaceResolver';
import type { GitHubTreeInput } from './types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    getBlockLibrarySource, getBlockLibraryContentSource,
    getBlockLibraryName, isBlockLibraryAvailableForPackage,
} from '@/features/project-creation/services/blockLibraryLoader';
import type { Project } from '@/types/base';
import type { AddonSource } from '@/types/demoPackages';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

// ==========================================================
// Helpers
// ==========================================================

/** Fetch placeholder JSON files from template source into file overrides map. */
async function fetchPlaceholderFiles(
    fileOverrides: Map<string, string>,
    templateOwner: string,
    templateRepo: string,
    logger: Logger,
    surfaceSource?: RuntimeSurfaceSource,
): Promise<void> {
    assertValidGitHubSlug(templateOwner, 'templateOwner');
    assertValidGitHubSlug(templateRepo, 'templateRepo');

    // Static hand list, with the ledger's generated runtime-surfaces.json merged in
    // when reachable (ADR-008 consumer). Best-effort; falls back to the static list.
    const inventory = await getRuntimeSurfaces(surfaceSource, logger);
    const placeholderPaths = inventory.placeholderSheets;

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
): Promise<{
    filesReset: number;
    blockCollectionIds?: string[];
    libraryContentSources: Array<{ org: string; site: string }>;
    canonicalCodePatchResults?: CodePatchResult[];
}> {
    const {
        repoOwner, repoName, daLiveOrg, daLiveSite, templateOwner, templateRepo,
        project, includeBlockLibrary = false,
        codePatches, codePatchSource,
    } = params;

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
        await fetchPlaceholderFiles(fileOverrides, templateOwner, templateRepo, context.logger, codePatchSource);
    }

    // Determine the template ref to reset against. Thin-layer storefronts
    // (codePatchSource configured) pin to the verified canonical LKG SHA;
    // legacy / forked packages continue to use `main` HEAD. LKG fetch
    // failure falls back to `main` with a warn (ADR-006 D1 proceed-and-warn)
    // so a transient patches-repo outage doesn't block reset entirely.
    let templateRef = 'main';
    if (codePatchSource) {
        const lkg = await readLkgSha(
            { owner: codePatchSource.owner, repo: codePatchSource.repo, lkgFile: codePatchSource.lkgFile },
            context.logger,
        );
        if (lkg) {
            templateRef = lkg;
            context.logger.info(`[EdsReset] Pinning reset to LKG ${lkg.substring(0, 7)} (from ${codePatchSource.owner}/${codePatchSource.repo})`);
        } else {
            context.logger.warn(`[EdsReset] LKG unreachable for ${codePatchSource.owner}/${codePatchSource.repo} — falling back to template main HEAD`);
        }
    }

    // Canonical-phase code patches: apply BEFORE the bulk reset so patched
    // canonical files (`head.html`, `scripts/*.js`, etc.) land in the same
    // atomic Git Tree commit as `fileOverrides`. Block-targeting patches
    // run later in `executeEdsPipeline` after the block library install.
    // Non-fatal per ADR-006 D1; results are surfaced via the pipeline's
    // patchReport (callers pass it forward into `executeEdsPipeline`).
    let canonicalCodePatchResults: CodePatchResult[] | undefined;
    if (codePatches && codePatches.length > 0 && codePatchSource) {
        canonicalCodePatchResults = await applyCanonicalCodePatches(
            fileOverrides, templateOwner, templateRepo, codePatches, codePatchSource, context.logger,
        );
    }

    const resetResult = await githubFileOps.resetRepoToTemplate(
        templateOwner, templateRepo, repoOwner, repoName, fileOverrides, templateRef,
    );

    context.logger.info(`[EdsReset] Repository reset complete: ${resetResult.fileCount} files, commit ${resetResult.commitSha.substring(0, 7)}`);
    report(1, `Reset ${resetResult.fileCount} files`);

    const { blockCollectionIds, libraryContentSources } = await reinstallBlockLibraries(
        project, repoOwner, repoName, githubFileOps, context.logger, report,
    );

    // Install the smart 404 PDP handler into the storefront's
    // scripts/delayed.js. Same shape as inspector tagging — vendors a
    // small JS snippet into storefront code. The pipeline's subsequent
    // bulk Helix code preview picks up the committed change. Non-fatal:
    // skipped silently when BYOM overlay is unset and on every other
    // failure mode (see installSmart404Handler).
    await installSmart404Handler(
        githubFileOps,
        repoOwner,
        repoName,
        params.byomOverlayUrl,
        context.logger,
        daLiveOrg,
        daLiveSite,
    );

    // Wire Quick Edit (Experience Workspace WYSIWYG dependency) into the
    // storefront's scripts/scripts.js + tools/quick-edit/quick-edit.js.
    // Brand-agnostic, idempotent, non-fatal. Mirrors the create path so a
    // reset reconciles Quick Edit wiring just like every other vendored file.
    await installQuickEdit(
        githubFileOps,
        repoOwner,
        repoName,
        context.logger,
    );

    return {
        filesReset: resetResult.fileCount,
        blockCollectionIds,
        libraryContentSources,
        canonicalCodePatchResults,
    };
}
