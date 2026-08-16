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
import { generateConfigJson, buildConfigGeneratorParams } from './configGenerator';
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
    getBlockLibrarySource,
    getBlockLibraryContentSource,
    getBlockLibraryName,
    isBlockLibraryAvailableForPackage,
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

    // A non-ok response used to be dropped on the floor — no log, no counter.
    // On 2026-08-15 that meant SEVENTEEN consecutive 404s produced zero output,
    // because the template repo has no live site at all: every sheet 404s at
    // source and the reset said nothing. The gap only surfaced as nine console
    // 404s per page load in a browser, days later. Count the outcomes and say
    // so once.
    const sourceHost = `https://main--${templateRepo}--${templateOwner}.aem.live`;
    let added = 0;
    const missing: string[] = [];
    const failed: string[] = [];

    await Promise.allSettled(
        placeholderPaths.map(async (placeholderPath) => {
            try {
                const response = await fetch(`${sourceHost}/${placeholderPath}.json`, {
                    signal: AbortSignal.timeout(TIMEOUTS.PREREQUISITE_CHECK),
                });
                if (response.ok) {
                    fileOverrides.set(`${placeholderPath}.json`, await response.text());
                    added += 1;
                    logger.debug(`[EdsReset] Added ${placeholderPath}.json to code files`);
                    return;
                }
                missing.push(`${placeholderPath} (${response.status})`);
            } catch (error) {
                failed.push(`${placeholderPath} (${(error as Error).message})`);
            }
        }),
    );

    const attempted = placeholderPaths.length;
    if (added === attempted) {
        logger.info(`[EdsReset] Added ${added} placeholder sheet(s) to code files`);
        return;
    }

    // NONE landing is the signature of a source that serves nothing — a
    // template repo with no live site, say — not of individually absent sheets.
    if (added === 0) {
        logger.warn(
            `[EdsReset] No placeholder sheets available from ${sourceHost} ` +
                `(${attempted} attempted). Dropin UI labels fall back to their built-in ` +
                `defaults; the storefront still renders. This is expected for a template ` +
                `with no published site.`,
        );
    } else {
        logger.warn(
            `[EdsReset] Added ${added}/${attempted} placeholder sheet(s); ` +
                `the rest are unavailable at ${sourceHost}`,
        );
    }
    if (missing.length) logger.debug(`[EdsReset] Placeholder sheets not found: ${missing.join(', ')}`);
    if (failed.length) logger.debug(`[EdsReset] Placeholder fetch errors: ${failed.join(', ')}`);
}

/**
 * Build the combined list of block library sources (built-in + custom) for a project.
 * Filters built-in libraries by package compatibility and logs the result.
 */
function collectLibrarySources(
    project: Project,
    effectiveBlockLibraries: string[],
    logger: Logger,
): {
    allLibraries: Array<{ source: AddonSource; name: string }>;
    libraryContentSources: Array<{ org: string; site: string }>;
} {
    const allLibraries: Array<{ source: AddonSource; name: string }> = [];
    const libraryContentSources: Array<{ org: string; site: string }> = [];
    const packageId = project.selectedPackage ?? '';

    for (const libraryId of effectiveBlockLibraries) {
        if (!isBlockLibraryAvailableForPackage(libraryId, packageId)) {
            logger.info(
                `[EdsReset] Skipping block library '${libraryId}' — not available for package '${packageId}' (onlyForPackages)`,
            );
            continue;
        }
        const source = getBlockLibrarySource(libraryId);
        if (source) {
            allLibraries.push({ source, name: getBlockLibraryName(libraryId) || libraryId });
        } else {
            logger.warn(
                `[EdsReset] Block library '${libraryId}' selected but no source configured`,
            );
        }
        const cs = getBlockLibraryContentSource(libraryId);
        if (cs) libraryContentSources.push(cs);
    }

    for (const lib of project.customBlockLibraries ?? []) {
        allLibraries.push({ source: lib.source, name: lib.name });
    }

    logger.info(
        `[EdsReset] Installing blocks from: ${allLibraries.map((l) => `${l.source.owner}/${l.source.repo}`).join(', ')}`,
    );
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
    report(
        2,
        `Re-installing blocks from ${allLibraries.length} ${allLibraries.length === 1 ? 'library' : 'libraries'}...`,
    );
    const blockResult = await installBlockCollections(
        githubFileOps,
        repoOwner,
        repoName,
        allLibraries,
        logger,
        inspectorEntries,
    );
    if (blockResult.success) {
        logger.info(
            `[EdsReset] Reinstalled ${blockResult.blocksCount} unique blocks from ${allLibraries.length} libraries (+ inspector tagging)`,
        );
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
        githubFileOps,
        repoOwner,
        repoName,
        selectedPackage,
        logger,
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
): Promise<{
    blockCollectionIds?: string[];
    libraryContentSources: Array<{ org: string; site: string }>;
}> {
    report(2, 'Preparing block libraries...');

    // Generate inspector tree entries (always, for consistency with storefront setup)
    let inspectorEntries: GitHubTreeInput[] = [];
    try {
        inspectorEntries = await generateInspectorTreeEntries(
            githubFileOps,
            repoOwner,
            repoName,
            project.selectedPackage,
            logger,
        );
    } catch (error) {
        logger.warn(`[EdsReset] Inspector tagging skipped: ${(error as Error).message}`);
    }

    logger.info('[EdsReset] Block library config', {
        selectedBlockLibraries: project.selectedBlockLibraries,
        customBlockLibraries: project.customBlockLibraries?.map(
            (l) => `${l.source.owner}/${l.source.repo}`,
        ),
        package: project.selectedPackage,
    });

    const { allLibraries, libraryContentSources } = collectLibrarySources(
        project,
        project.selectedBlockLibraries ?? [],
        logger,
    );

    let allBlockIds: string[] = [];
    if (allLibraries.length > 0) {
        allBlockIds = await installWithBlockLibraries(
            githubFileOps,
            repoOwner,
            repoName,
            allLibraries,
            logger,
            inspectorEntries,
            report,
        );
    } else if (inspectorEntries.length > 0) {
        await installInspectorOnly(
            githubFileOps,
            repoOwner,
            repoName,
            project.selectedPackage,
            logger,
            report,
        );
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
        repoOwner,
        repoName,
        daLiveOrg,
        daLiveSite,
        templateOwner,
        templateRepo,
        project,
        includeBlockLibrary = false,
        codePatches,
        codePatchSource,
    } = params;

    report(1, 'Resetting repository to template...');
    context.logger.info(`[EdsReset] Resetting repo using bulk tree operations`);

    const fstabContent = generateFstabContent({ daLiveOrg, daLiveSite });
    const fileOverrides = new Map<string, string>();
    fileOverrides.set('fstab.yaml', fstabContent);

    // Generate config.json with Commerce configuration
    const configResult = generateConfigJson(buildConfigGeneratorParams(project), context.logger);
    if (configResult.success && configResult.content) {
        fileOverrides.set('config.json', configResult.content);
        fileOverrides.set('demo-config.json', configResult.content);
        context.logger.info('[EdsReset] Generated config.json for reset');
    } else {
        context.logger.warn(
            `[EdsReset] Failed to generate demo-config.json: ${configResult.error}`,
        );
    }

    if (includeBlockLibrary) {
        await fetchPlaceholderFiles(
            fileOverrides,
            templateOwner,
            templateRepo,
            context.logger,
            codePatchSource,
        );
    }

    // Determine the template ref to reset against. Thin-layer storefronts
    // (codePatchSource configured) pin to the verified canonical LKG SHA;
    // legacy / forked packages continue to use `main` HEAD. LKG fetch
    // failure falls back to `main` with a warn (ADR-006 D1 proceed-and-warn)
    // so a transient patches-repo outage doesn't block reset entirely.
    let templateRef = 'main';
    if (codePatchSource) {
        const lkg = await readLkgSha(
            {
                owner: codePatchSource.owner,
                repo: codePatchSource.repo,
                lkgFile: codePatchSource.lkgFile,
            },
            context.logger,
        );
        if (lkg) {
            templateRef = lkg;
            context.logger.info(
                `[EdsReset] Pinning reset to LKG ${lkg.substring(0, 7)} (from ${codePatchSource.owner}/${codePatchSource.repo})`,
            );
        } else {
            context.logger.warn(
                `[EdsReset] LKG unreachable for ${codePatchSource.owner}/${codePatchSource.repo} — falling back to template main HEAD`,
            );
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
            fileOverrides,
            templateOwner,
            templateRepo,
            codePatches,
            codePatchSource,
            context.logger,
        );
    }

    const resetResult = await githubFileOps.resetRepoToTemplate(
        templateOwner,
        templateRepo,
        repoOwner,
        repoName,
        fileOverrides,
        templateRef,
    );

    context.logger.info(
        `[EdsReset] Repository reset complete: ${resetResult.fileCount} files, commit ${resetResult.commitSha.substring(0, 7)}`,
    );
    report(1, `Reset ${resetResult.fileCount} files`);

    const { blockCollectionIds, libraryContentSources } = await reinstallBlockLibraries(
        project,
        repoOwner,
        repoName,
        githubFileOps,
        context.logger,
        report,
    );

    // Install the smart 404 PDP handler into the storefront's
    // scripts/delayed.js. Same shape as inspector tagging — vendors a
    // small JS snippet into storefront code. The pipeline's subsequent
    // bulk Helix code preview picks up the committed change.
    //
    // Still non-fatal, but no longer silent. Reset is the path a user takes to
    // REPAIR a broken storefront, so a skip here mattered more than on create
    // and was the one reported least — the result was discarded entirely.
    // `report()` is the context-appropriate surface (UI progress or MCP output),
    // matching how the overlay-registration failure is surfaced on this path.
    const smart404 = await installSmart404Handler(
        githubFileOps,
        repoOwner,
        repoName,
        params.byomOverlayUrl,
        context.logger,
        daLiveOrg,
        daLiveSite,
    );
    if (!smart404.installed && params.byomOverlayUrl) {
        context.logger.warn(
            `[EdsReset] Smart-404 handler not installed: ${smart404.reason ?? 'unknown reason'}`,
        );
        report(
            1,
            '⚠️ Smart-404 handler not installed — product pages may not recover on first visit',
        );
    }

    // Wire Quick Edit (Experience Workspace WYSIWYG dependency) into the
    // storefront's scripts/scripts.js + tools/quick-edit/quick-edit.js.
    // Brand-agnostic, idempotent, non-fatal. Mirrors the create path so a
    // reset reconciles Quick Edit wiring just like every other vendored file.
    await installQuickEdit(githubFileOps, repoOwner, repoName, context.logger);

    return {
        filesReset: resetResult.fileCount,
        blockCollectionIds,
        libraryContentSources,
        canonicalCodePatchResults,
    };
}
