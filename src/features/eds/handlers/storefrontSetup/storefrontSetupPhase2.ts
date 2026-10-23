/**
 * Storefront Setup Phase 2: Helix Configuration
 *
 * Handles fstab.yaml generation, block collection installation, and the
 * smart-404 / Quick Edit script vendoring. The existing-repo GitHub App
 * check moved to Phase 1 on 2026-08-06 — see `executePhaseExistingRepo`.
 *
 * Phase 1 (GitHub repo) lives in storefrontSetupPhase1.ts.
 * Phase 3 (code sync + config service) lives in storefrontSetupPhase3.ts.
 * The main orchestrator lives in storefrontSetupPhases.ts.
 *
 * @module features/eds/handlers/storefrontSetup/storefrontSetupPhase2
 */

import {
    installBlockCollections,
    type BlockLibraryEntry,
} from '../../services/blockCollectionHelpers';
import { generateFstabContent } from '../../services/fstabGenerator';
import { GitHubFileOperations } from '../../services/github/githubFileOperations';
import {
    generateInspectorTreeEntries,
    installInspectorTagging,
} from '../../services/inspectorHelpers';
import { toInstalledBlockLibrary } from '../../services/installedBlockLibraryRecord';
import {
    placeholderLabelFiles,
    placeholderStubPathsFor,
    placeholderStubTreeEntries,
    removeShadowingPlaceholderFiles,
} from '../../services/placeholderStubs';
import { installQuickEdit } from '../../services/quickEditPublisher';
import { bringStorefrontUpToDate } from '../../services/storefront/storefrontUpToDate';
import { type GitHubTreeInput } from '../../services/types';
import { addPdpCaveat, describeSmart404Skip } from '../edsHelpers';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import type { RepoInfo, SetupServices } from './storefrontSetupTypes';
import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import { jobLine } from '@/core/utils/storefrontJobs';
import {
    getBlockLibraryName,
    getBlockLibrarySource,
    isBlockLibraryAvailableForPackage,
    withAlwaysIncludedBlockLibraries,
} from '@/features/components/services/blockLibraryLoader';
import type { CustomBlockLibrary, LibraryVersionInfo } from '@/types/blockLibraries';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import type { StorefrontSetupProgressPayload } from '@/types/webviewPayloads';

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
}

// ==========================================================
// Phase 2: Helix Configuration
// ==========================================================

/**
 * Execute Phase 2: Helix configuration (fstab.yaml, block collection)
 */
export async function executePhaseHelixConfig(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    signal: AbortSignal,
    options?: BlockLibraryOptions,
): Promise<{ blockCollectionIds?: string[] }> {
    const logger = context.logger;
    const { githubFileOps } = services;
    const effectiveBlockLibraries = options?.selectedBlockLibraries ?? [];

    if (signal.aborted) {
        throw new Error('Operation cancelled');
    }

    await context.sendMessage('storefront-setup-progress', {
        phase: 'storefront-code',
        message: 'Configuring Edge Delivery Services',
        progress: 20,
    } satisfies StorefrontSetupProgressPayload);

    await pushFstabToGitHub(githubFileOps, repoInfo, edsConfig, context, logger);

    // Placeholder stub sheets, one bulk commit: the boilerplate requests 16 or so
    // optional label sheets per page load and the browser prints every 404 to
    // the console (no JS can suppress it) — red noise during any demo with
    // devtools open. A stub does NOT step aside for a copied sheet (measured live
    // 2026-10-12: the file in the repository is what the site serves), so the
    // source the content copy reads from is asked first and an area it has a
    // sheet for gets no stub. Reset decides from the same function. Non-fatal: a
    // failed commit costs console cosmetics, never the setup.
    try {
        const stubPaths = await placeholderStubPathsFor(edsConfig.contentSource);
        // The new repository holds the template's tree: a label file the template ships
        // keeps its labels (the B2B checkout's heading and Edit link read "undefined"
        // without them). Reset reads the template the same way.
        const labelFiles = await placeholderLabelFiles(stubPaths, async (path) =>
            (await githubFileOps.getFileContent(repoInfo.repoOwner, repoInfo.repoName, path, 'main'))?.content,
        );
        const stubCommit = await githubFileOps.commitTreeToBranch(
            repoInfo.repoOwner,
            repoInfo.repoName,
            'main',
            placeholderStubTreeEntries(labelFiles),
            'chore: placeholder stub sheets (console hygiene)',
        );
        logger.info(
            `[Storefront Setup] Placeholder stub sheets committed: ${stubPaths.length} (the source has the rest)`,
        );
        // The template's own label files hide the copied sheets at the same paths
        // (the B2B template's placeholders/checkout.json did, EDS-53). Reset does the same.
        await removeShadowingPlaceholderFiles(
            githubFileOps,
            { owner: repoInfo.repoOwner, repo: repoInfo.repoName, ref: stubCommit },
            stubPaths,
            logger,
        );
    } catch (error) {
        logger.warn(
            `[Storefront Setup] Placeholder stubs skipped (non-fatal): ${(error as Error).message}`,
        );
    }

    const allLibraries = collectAllBlockLibraries(
        // Demo Builder Blocks and any other always-included library, whatever was ticked.
        withAlwaysIncludedBlockLibraries(effectiveBlockLibraries, options?.packageId ?? ''),
        options?.customBlockLibraries,
        options?.packageId ?? '',
        logger,
    );
    const blockCollectionIds = await installBlockCollectionsWithTracking(
        githubFileOps,
        repoInfo,
        allLibraries,
        context,
        options?.packageId,
        logger,
    );

    // Install the smart 404 PDP handler into the storefront's
    // scripts/delayed.js, then bring the storefront up to Demo Builder's current
    // fixes (the 404 page's import map, retired fixes taken out: EDS-62) — the
    // same step reset and a tested-boilerplate update run. The surrounding
    // pipeline's bulk Helix code preview picks up the committed change.
    //
    // Still non-fatal — that is deliberate. What changed on 2026-08-10 is that
    // the result is no longer DISCARDED: a skip (no delayed.js, unparseable
    // overlay URL, failed commit) used to reach the debug log and nowhere else
    // while the run reported Complete.
    const { smart404, current } = await bringStorefrontUpToDate(
        githubFileOps,
        repoInfo.repoOwner,
        repoInfo.repoName,
        edsConfig.byomOverlayUrl,
        logger,
        edsConfig.daLiveOrg,
        edsConfig.daLiveSite,
    );
    // Recorded on the project by creation: a storefront whose fixes did not all land reads
    // "Needs reset" (`storefrontChanges.ts`).
    repoInfo.storefrontBuildComplete = current;
    if (!smart404.installed && edsConfig.byomOverlayUrl) {
        // Only when an overlay was configured. Without one the skip is expected,
        // and phase 3 already raises the absent-overlay caveat — two sentences
        // for one cause would be noise.
        addPdpCaveat(repoInfo, describeSmart404Skip(smart404.reason));
    }

    // Wire Quick Edit (Experience Workspace WYSIWYG dependency) into the
    // storefront's scripts/scripts.js + tools/quick-edit/quick-edit.js.
    // Brand-agnostic, idempotent, non-fatal — inert under Universal Editor,
    // active under Experience Workspace. See installQuickEdit.
    await installQuickEdit(githubFileOps, repoInfo.repoOwner, repoInfo.repoName, logger);

    // The existing-repo AEM Code Sync gate used to run here (progress 28). It moved
    // to Phase 1 on 2026-08-06, ahead of `resetToTemplate` and every write above —
    // checking after the repo has been rewritten told the user too late to matter.
    // Phase 3's own check remains the mid-flight backstop for both repo modes.

    await context.sendMessage('storefront-setup-progress', {
        phase: 'storefront-code',
        message: 'Edge Delivery Services configured',
        progress: 35,
    } satisfies StorefrontSetupProgressPayload);

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
        phase: 'storefront-code',
        message: jobLine(
            'Connecting the content source',
            `${edsConfig.daLiveOrg}/${edsConfig.daLiveSite}`,
        ),
        progress: 25,
    } satisfies StorefrontSetupProgressPayload);
    const fstabContent = generateFstabContent({
        daLiveOrg: edsConfig.daLiveOrg,
        daLiveSite: edsConfig.daLiveSite,
    });
    const existingFstab = await githubFileOps.getFileContent(
        repoInfo.repoOwner,
        repoInfo.repoName,
        'fstab.yaml',
    );
    await githubFileOps.createOrUpdateFile(
        repoInfo.repoOwner,
        repoInfo.repoName,
        'fstab.yaml',
        fstabContent,
        'chore: configure fstab.yaml for DA.live content source',
        existingFstab?.sha,
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
                logger.info(
                    `[Storefront Setup] Skipping block library '${libraryId}' — not available for package '${packageId}' (onlyForPackages)`,
                );
                continue;
            }
            const source = getBlockLibrarySource(libraryId);
            if (source) {
                allLibraries.push({ source, name: getBlockLibraryName(libraryId) || libraryId });
            } else {
                logger.warn(
                    `[Storefront Setup] Block library '${libraryId}' selected but no source configured`,
                );
            }
        }
    }
    if (customBlockLibraries && customBlockLibraries.length > 0) {
        for (const lib of customBlockLibraries) {
            if (
                !lib.source.owner ||
                !lib.source.repo ||
                !GITHUB_IDENTIFIER.test(lib.source.owner) ||
                !GITHUB_IDENTIFIER.test(lib.source.repo)
            ) {
                logger.warn(
                    `[Storefront Setup] Skipping custom block library '${lib.name}' — invalid source owner or repo`,
                );
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
        phase: 'storefront-code',
        message: 'Preparing inspector tagging',
        progress: 27,
    } satisfies StorefrontSetupProgressPayload);
    let inspectorEntries: GitHubTreeInput[];
    try {
        inspectorEntries = await generateInspectorTreeEntries(
            githubFileOps,
            repoInfo.repoOwner,
            repoInfo.repoName,
            packageId,
            logger,
        );
    } catch (error) {
        logger.warn(`[Storefront Setup] Inspector tagging skipped: ${(error as Error).message}`);
        inspectorEntries = [];
    }

    if (allLibraries.length > 0) {
        await context.sendMessage('storefront-setup-progress', {
            phase: 'storefront-code',
            // Configure's step for the same job, named by the libraries it adds.
            message: jobLine(
                S.addingBlockLibraries.label,
                allLibraries.map((lib) => lib.name).join(', '),
            ),
            progress: 28,
        } satisfies StorefrontSetupProgressPayload);
        const result = await installBlockCollections(
            githubFileOps,
            repoInfo.repoOwner,
            repoInfo.repoName,
            allLibraries,
            logger,
            inspectorEntries,
        );
        if (result.success) {
            const blockMsg =
                result.blocksCount > 0
                    ? `Installed ${result.blocksCount} unique blocks from ${allLibraries.length} ${allLibraries.length === 1 ? 'library' : 'libraries'} (+ inspector tagging)`
                    : `All blocks already present in destination — skipped copy, applied inspector tagging`;
            logger.info(`[Storefront Setup] ${blockMsg}`);
            // Handed back, never saved here: project creation records them on the
            // project it creates or edits. In the wizard that project does not exist
            // yet, and `getCurrentProject()` — where these went until 2026-10-09 —
            // is whatever was open before, which got the new project's list.
            const versions = await withEveryLibraryRecorded(
                allLibraries, result.libraryVersions ?? [], githubFileOps, logger,
            );
            if (versions.length > 0) {
                repoInfo.installedBlockLibraries = versions.map((lv) => toInstalledBlockLibrary(lv));
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
 * Every library setup installed, including one whose blocks were all already in the
 * repository (an adopted existing repository, or blocks another library supplied).
 *
 * The installer credits a library only for blocks it copied, which is right for the
 * blocks; but a library it credited nothing was left out of the project's record,
 * so the update check offered "install" for it on every run (EDS-51, the recreated
 * canary). The update path's own install records such a library at its source's
 * latest commit with no blocks (`versionWithNoBlocks`); setup now does the same.
 * No blocks are claimed, so removal still deletes only folders it can prove it added.
 */
function sameSource(a: { owner: string; repo: string }, b: { owner: string; repo: string }): boolean {
    return a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase();
}

async function withEveryLibraryRecorded(
    libraries: readonly BlockLibraryEntry[],
    versions: readonly LibraryVersionInfo[],
    githubFileOps: GitHubFileOperations,
    logger: Logger,
): Promise<LibraryVersionInfo[]> {
    const recorded = [...versions];
    for (const lib of libraries) {
        // Matched the way the update check matches a record: by name or by source.
        if (versions.some((v) => v.name === lib.name || sameSource(v.source, lib.source))) continue;
        const { owner, repo, branch } = lib.source;
        const commitSha = await githubFileOps.getLatestCommitSha(owner, repo, branch).catch(() => null);
        if (!commitSha) {
            logger.warn(`[Storefront Setup] ${lib.name}: no source commit to record; it may be offered again`);
            continue;
        }
        recorded.push({ name: lib.name, source: lib.source, commitSha, blockIds: [] });
    }
    return recorded;
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
        githubFileOps,
        repoInfo.repoOwner,
        repoInfo.repoName,
        packageId,
        logger,
    );
    if (inspectorResult.success) {
        await context.sendMessage('storefront-setup-progress', {
            phase: 'storefront-code',
            message: 'Inspector tagging installed',
            progress: 28,
        } satisfies StorefrontSetupProgressPayload);
        logger.info('[Storefront Setup] Inspector tagging installed (standalone)');
    } else {
        logger.warn(`[Storefront Setup] Inspector tagging skipped: ${inspectorResult.error}`);
    }
}
