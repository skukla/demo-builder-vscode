/**
 * Storefront Setup Phase Executors
 *
 * Contains the main orchestrator for storefront setup.
 * Phase 1 (GitHub repo) lives in storefrontSetupPhase1.ts.
 * Phase 2 (Helix config) lives in storefrontSetupPhase2.ts.
 * Phase 3 (code sync + config service) lives in storefrontSetupPhase3.ts.
 * Shared types live in storefrontSetupTypes.ts.
 *
 * StorefrontSetupResult is re-exported from storefrontSetupTypes.ts for
 * backward compatibility with existing consumers that import from this module.
 *
 * @module features/eds/handlers/storefrontSetup/storefrontSetupPhases
 */

import * as vscode from 'vscode';
import { ConfigurationService } from '../../services/configService/configurationService';
import { withDaLiveAuthRetry, MAX_REAUTH_ATTEMPTS } from '../../services/daLive/daLiveAuthRetry';
import {
    createDaLiveServiceTokenProvider,
    DaLiveContentOperations,
} from '../../services/daLive/daLiveContentOperations';
import { executeEdsPipeline } from '../../services/edsPipeline';
import { GitHubAppService } from '../../services/github/githubAppService';
import { GitHubFileOperations } from '../../services/github/githubFileOperations';
import { GitHubRepoOperations } from '../../services/github/githubRepoOperations';
import { HelixService } from '../../services/helix/helixService';
import {
    createPatchReport,
    reportUnapplied,
    type PatchReport,
} from '../../services/patches/patchReportHelper';
import { getDaLiveAuthService } from '../edsHelpers';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import { executePhaseGitHubRepo } from './storefrontSetupPhase1';
import { executePhaseHelixConfig, type BlockLibraryOptions } from './storefrontSetupPhase2';
import { executePhaseCodeSync } from './storefrontSetupPhase3';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getBlockLibraryContentSource } from '@/features/components/services/blockLibraryLoader';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { projectTargetsStorefront } from '@/features/eds/services/catalogPrewarmService';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import type {
    StorefrontSetupProgressPayload,
    StorefrontSetupProgressPhase,
} from '@/types/webviewPayloads';

// Public type re-exports
export type { StorefrontSetupResult } from './storefrontSetupTypes';
export type { BlockLibraryOptions } from './storefrontSetupPhase2';

// ==========================================================
// Orchestration Helpers
// ==========================================================

/** Create all service dependencies for storefront setup */
function createSetupServices(context: HandlerContext): SetupServices {
    const { tokenService: githubTokenService } = getGitHubServices(context.context.secrets);
    const daLiveAuthService = getDaLiveAuthService(context.context);
    const daLiveTokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
    return {
        githubRepoOps: new GitHubRepoOperations(
            githubTokenService,
            ServiceLocator.getCommandExecutor(),
            context.logger,
        ),
        githubFileOps: new GitHubFileOperations(githubTokenService, context.logger),
        githubAppService: new GitHubAppService(
            githubTokenService,
            context.logger,
            daLiveTokenProvider,
        ),
        daLiveContentOps: new DaLiveContentOperations(daLiveTokenProvider, context.logger),
        helixService: new HelixService(context.logger, githubTokenService, daLiveTokenProvider),
        daLiveAuthService,
        daLiveTokenProvider,
        configurationService: new ConfigurationService(daLiveTokenProvider, context.logger),
    };
}

/** Build content source entries for block library doc pages */
function buildLibraryContentSources(
    blockLibraries: string[],
): Array<{ org: string; site: string }> {
    const sources: Array<{ org: string; site: string }> = [];
    for (const libraryId of blockLibraries) {
        const cs = getBlockLibraryContentSource(libraryId);
        if (cs) sources.push(cs);
    }
    return sources;
}

type PipelineProgressInfo = {
    operation: string;
    message: string;
    subMessage?: string;
    percentage?: number;
    current?: number;
    total?: number;
};

const PIPELINE_PROGRESS = {
    CONTENT_CLEAR: 49,
    CONTENT_COPY_START: 50,
    CONTENT_COPY_END: 58, // 50 + 8 (0.08 × 100)
    BLOCK_LIBRARY: 59,
    EDS_SETTINGS: 63,
    CACHE_PURGE: 66,
    CONTENT_PUBLISH_START: 67,
    CONTENT_PUBLISH_END: 94, // 67 + 27
    LIBRARY_PUBLISH: 95, // after content-publish completes — must be > CONTENT_PUBLISH_END (94)
} as const;

/** Build the progress callback for the EDS content pipeline */
function buildPipelineProgressCallback(
    context: HandlerContext,
): (info: PipelineProgressInfo) => void {
    return (info) => {
        const mapping: Record<string, { phase: StorefrontSetupProgressPhase; progress: number }> = {
            'content-clear': { phase: 'content', progress: PIPELINE_PROGRESS.CONTENT_CLEAR },
            'content-copy': { phase: 'content', progress: PIPELINE_PROGRESS.CONTENT_COPY_START },
            'block-library': { phase: 'block-library', progress: PIPELINE_PROGRESS.BLOCK_LIBRARY },
            'eds-settings': { phase: 'block-library', progress: PIPELINE_PROGRESS.EDS_SETTINGS },
            'cache-purge': { phase: 'publish', progress: PIPELINE_PROGRESS.CACHE_PURGE },
            'content-publish': {
                phase: 'publish',
                progress: PIPELINE_PROGRESS.CONTENT_PUBLISH_START,
            },
            'library-publish': { phase: 'publish', progress: PIPELINE_PROGRESS.LIBRARY_PUBLISH },
            'catalog-prewarm': { phase: 'publish', progress: PIPELINE_PROGRESS.LIBRARY_PUBLISH },
        };
        // Fallback for an operation the mapping doesn't know. It used to push
        // the raw operation string as the phase — a value outside the phase
        // vocabulary that the webview's bookkeeping silently ignored.
        const m = mapping[info.operation] ?? {
            phase: 'content' as const,
            progress: PIPELINE_PROGRESS.CONTENT_COPY_START,
        };
        let progress = m.progress;
        if (info.operation === 'content-copy' && info.percentage !== undefined) {
            progress = PIPELINE_PROGRESS.CONTENT_COPY_START + Math.round(info.percentage * 0.08);
        }
        if (info.operation === 'content-publish' && info.current !== undefined && info.total) {
            const span =
                PIPELINE_PROGRESS.CONTENT_PUBLISH_END - PIPELINE_PROGRESS.CONTENT_PUBLISH_START;
            progress =
                PIPELINE_PROGRESS.CONTENT_PUBLISH_START +
                Math.round((info.current / info.total) * span);
        }
        context.sendMessage('storefront-setup-progress', {
            phase: m.phase,
            message: info.message,
            subMessage: info.subMessage,
            progress,
        } satisfies StorefrontSetupProgressPayload);
    };
}

/**
 * Run Phase 2 (Helix config) and Phase 3 (code sync) with DA.live auth recovery.
 * Returns blockCollectionIds and any early-return result.
 */
async function runConfigCodeSyncPhases(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    signal: AbortSignal,
    options?: BlockLibraryOptions,
): Promise<{ blockCollectionIds: string[] | undefined; earlyReturn?: StorefrontSetupResult }> {
    return withDaLiveAuthRetry(
        context,
        async () => {
            const phase2Result = await executePhaseHelixConfig(
                context,
                edsConfig,
                services,
                repoInfo,
                signal,
                options,
            );
            if (phase2Result.earlyReturn) {
                return { blockCollectionIds: undefined, earlyReturn: phase2Result.earlyReturn };
            }
            const phase3Result = await executePhaseCodeSync(context, edsConfig, services, repoInfo);
            if (phase3Result) {
                return {
                    blockCollectionIds: phase2Result.blockCollectionIds,
                    earlyReturn: phase3Result,
                };
            }
            return { blockCollectionIds: phase2Result.blockCollectionIds };
        },
        {
            maxAttempts: MAX_REAUTH_ATTEMPTS,
            logPrefix: '[Storefront Setup]',
            operationLabel: 'Setup',
            onExpired: () =>
                context.sendMessage('storefront-setup-progress', {
                    phase: 'auth-recovery',
                    message: 'DA.live session expired. Please re-authenticate to continue.',
                    progress: -1,
                } satisfies StorefrontSetupProgressPayload),
            onBeforeRetry: async () => {
                context.logger.info(
                    '[Storefront Setup] DA.live re-authenticated, resuming configuration',
                );
                await context.sendMessage('storefront-setup-progress', {
                    phase: 'code-sync',
                    message: 'Resuming setup...',
                    progress: 40,
                } satisfies StorefrontSetupProgressPayload);
            },
        },
    );
}

/**
 * Run the EDS content pipeline with DA.live auth recovery.
 * Returns the pipeline result including library paths.
 */
async function runEdsPipelineWithRecovery(
    context: HandlerContext,
    logger: Logger,
    services: SetupServices,
    repoInfo: RepoInfo,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    templateOwner: string,
    templateRepo: string,
    blockCollectionIds: string[] | undefined,
    libraryContentSources: Array<{ org: string; site: string }>,
    wantsToResetContent: boolean,
    skipContent: boolean,
    onProgress: (info: PipelineProgressInfo) => void,
    patchReport?: PatchReport,
): Promise<{ libraryPaths: string[] }> {
    // The project for catalog pre-warming (v1 ACCS only). Optional — the
    // pipeline skips pre-warming when it is undefined.
    //
    // GUARDED, because `storefront-setup-start` is registered by the WIZARD as
    // well as the dashboard, and in the wizard the project being created does
    // not exist yet: `getCurrentProject()` there returns whatever was last open.
    // Unguarded, a user with one existing project who creates a second
    // storefront prewarms the FIRST project's catalog onto the second's site —
    // measured 2026-08-18, where it surfaced only as an unexplained
    // `No index was found` against a store view nobody had asked about.
    //
    // On the create path this correctly yields undefined, and project creation
    // pre-warms after its sample-data phase instead, where the real project
    // exists AND its datapack has been imported.
    const currentProject = await context.stateManager.getCurrentProject();
    const project = projectTargetsStorefront(
        currentProject ?? undefined,
        repoInfo.repoOwner,
        repoInfo.repoName,
    )
        ? currentProject
        : undefined;

    return withDaLiveAuthRetry(
        context,
        async () => {
            const result = await executeEdsPipeline(
                {
                    repoOwner: repoInfo.repoOwner,
                    repoName: repoInfo.repoName,
                    daLiveOrg: edsConfig.daLiveOrg,
                    daLiveSite: edsConfig.daLiveSite,
                    templateOwner,
                    templateRepo,
                    clearExistingContent: wantsToResetContent,
                    skipContent,
                    contentSource: edsConfig.contentSource,
                    accountContentSource: edsConfig.accountContentSource,
                    contentPatches: edsConfig.contentPatches,
                    contentPatchSource: edsConfig.contentPatchSource,
                    codePatches: edsConfig.codePatches,
                    codePatchSource: edsConfig.codePatchSource,
                    brandAssets: edsConfig.brandAssets,
                    // Thread the orchestrator's shared patch report through so canonical-phase
                    // results (from Step 1 LKG-pinning) + block-phase + content-patch results
                    // all aggregate into ONE report. The orchestrator owns reportUnapplied so
                    // there's a single toast per setup, not one per source.
                    patchReport,
                    includeBlockLibrary: true,
                    blockCollectionIds,
                    libraryContentSources,
                    purgeCache: Boolean(edsConfig.resetToTemplate || wantsToResetContent),
                    byomOverlayUrl: edsConfig.byomOverlayUrl,
                    project: project ?? undefined,
                },
                {
                    daLiveContentOps: services.daLiveContentOps,
                    githubFileOps: services.githubFileOps,
                    helixService: services.helixService,
                    logger,
                },
                onProgress,
            );
            if (!result.success) throw new Error(result.error || 'Content pipeline failed');
            return { libraryPaths: result.libraryPaths };
        },
        {
            maxAttempts: MAX_REAUTH_ATTEMPTS,
            logPrefix: '[Storefront Setup]',
            operationLabel: 'Setup',
            onExpired: () =>
                context.sendMessage('storefront-setup-progress', {
                    phase: 'auth-recovery',
                    message: 'DA.live session expired. Please re-authenticate to continue.',
                    progress: -1,
                } satisfies StorefrontSetupProgressPayload),
            onBeforeRetry: async () => {
                logger.info('[Storefront Setup] DA.live re-authenticated, resuming pipeline');
                await context.sendMessage('storefront-setup-progress', {
                    phase: 'content',
                    message: 'Resuming content copy...',
                    progress: 50,
                } satisfies StorefrontSetupProgressPayload);
            },
        },
    );
}

// ==========================================================
// Main Orchestrator
// ==========================================================

/**
 * Execute all storefront setup phases
 *
 * This runs the remote setup operations:
 * 1. Create GitHub repository from template
 * 2. Configure Helix 5 (push fstab.yaml to GitHub)
 * 3. Code sync verification and CDN publishing
 * 4. Populate DA.live content
 *
 * @param context - Handler context
 * @param edsConfig - EDS configuration from wizard
 * @param signal - Abort signal for cancellation
 * @param options - Optional block library and feature pack parameters
 * @param servicesOverride - Service bundle seam; defaults to `createSetupServices`.
 *   Production never passes it.
 * @returns Setup result with repo details
 */
export async function executeStorefrontSetupPhases(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    signal: AbortSignal,
    options?: BlockLibraryOptions,
    servicesOverride?: Partial<SetupServices>,
): Promise<StorefrontSetupResult> {
    const logger = context.logger;
    /**
     * One seam for the whole bundle, rather than one per service.
     *
     * `createSetupServices` builds SIX collaborators, three of which are stateless
     * classes that suites could only supply by mocking their modules — ADR-016 counts
     * four suites here module-mocking `ConfigurationService` and four mocking
     * `GitHubAppService`, plus `HelixService` on top. Taking the bundle rather than
     * each member means one optional parameter retires all three walls at once, and a
     * suite hands in exactly the members it asserts on.
     */
    // Merged, not replaced: a caller (in practice a suite) supplies only the
    // collaborators it cares about and the rest are built as usual. An all-or-nothing
    // override forced every caller to stand in for eight services to steer one.
    const services: SetupServices = { ...createSetupServices(context), ...servicesOverride };

    const wantsToResetContent = Boolean(edsConfig.resetSiteContent);
    const skipContent =
        !edsConfig.contentSource || (Boolean(edsConfig.selectedSite) && !wantsToResetContent);
    logger.info(
        `[Storefront Setup] Content: skipContent=${skipContent}, selectedSite=${Boolean(edsConfig.selectedSite)}, resetContent=${wantsToResetContent}`,
    );

    const githubOwner = edsConfig.githubOwner || edsConfig.githubAuth?.user?.login;
    if (!githubOwner) {
        logger.error(
            '[Storefront Setup] GitHub owner not found. Config:',
            JSON.stringify({
                repoName: edsConfig.repoName,
                repoMode: edsConfig.repoMode,
                githubOwner: edsConfig.githubOwner,
                templateOwner: edsConfig.templateOwner,
                templateRepo: edsConfig.templateRepo,
            }),
        );
        return {
            success: false,
            error: 'GitHub owner not configured. Please complete GitHub authentication.',
        };
    }
    // Log the authenticated identity alongside the target namespace. When these
    // differ, the repo lives in an org rather than the signed-in user's own
    // account — which changes both the permissions in play and who can install
    // the AEM Code Sync App. Without both values a log cannot distinguish an
    // identity mismatch from a credential problem.
    const authenticatedLogin = edsConfig.githubAuth?.user?.login;
    logger.info(
        `[Storefront Setup] Using GitHub owner: ${githubOwner}` +
            `${authenticatedLogin ? ` (authenticated as ${authenticatedLogin})` : ' (authenticated user unknown)'}`,
    );

    const { templateOwner, templateRepo } = edsConfig;
    if (!templateOwner || !templateRepo) {
        logger.error(
            '[Storefront Setup] Template not configured. Config:',
            JSON.stringify({
                repoName: edsConfig.repoName,
                templateOwner,
                templateRepo,
            }),
        );
        return {
            success: false,
            error: 'GitHub template not configured. Please check your stack configuration.',
        };
    }

    const repoInfo: RepoInfo = { repoOwner: githubOwner, repoName: edsConfig.repoName };
    const effectiveBlockLibraries = options?.selectedBlockLibraries ?? [];
    const phaseOptions: BlockLibraryOptions = { ...options };

    // Shared patch report — canonical-phase results from Phase 1's LKG pin
    // and block-phase + content-patch results from the pipeline both append
    // here, so the single reportUnapplied call below covers everything in
    // one toast (ADR-006 D1).
    const patchReport = createPatchReport();

    try {
        const phase1Result = await executePhaseGitHubRepo(
            context,
            edsConfig,
            services,
            repoInfo,
            signal,
            templateOwner,
            templateRepo,
            patchReport,
        );
        if (phase1Result) return phase1Result;

        const { blockCollectionIds, earlyReturn } = await runConfigCodeSyncPhases(
            context,
            edsConfig,
            services,
            repoInfo,
            signal,
            phaseOptions,
        );
        if (earlyReturn) return earlyReturn;
        if (signal.aborted) throw new Error('Operation cancelled');

        const pipelineResult = await runEdsPipelineWithRecovery(
            context,
            logger,
            services,
            repoInfo,
            edsConfig,
            templateOwner,
            templateRepo,
            blockCollectionIds,
            buildLibraryContentSources(effectiveBlockLibraries),
            wantsToResetContent,
            skipContent,
            buildPipelineProgressCallback(context),
            patchReport,
        );
        if (signal.aborted) throw new Error('Operation cancelled');

        // Single toast covering canonical + block + content patches.
        await reportUnapplied(patchReport, logger, vscode.window.showWarningMessage);

        await context.sendMessage('storefront-setup-progress', {
            phase: 'complete',
            message:
                pipelineResult.libraryPaths.length > 0
                    ? 'Site is live!'
                    : 'Content publish complete',
            progress: 100,
        } satisfies StorefrontSetupProgressPayload);
        return { success: true, ...repoInfo };
    } catch (error) {
        logger.error(`[Storefront Setup] Failed: ${(error as Error).message}`);
        return { success: false, error: (error as Error).message, ...repoInfo };
    }
}
