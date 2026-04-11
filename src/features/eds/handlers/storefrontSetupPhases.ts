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
 * @module features/eds/handlers/storefrontSetupPhases
 */

import { ConfigurationService } from '../services/configurationService';
import { createDaLiveServiceTokenProvider, DaLiveContentOperations } from '../services/daLiveContentOperations';
import { GitHubAppService } from '../services/githubAppService';
import { GitHubFileOperations } from '../services/githubFileOperations';
import { GitHubRepoOperations } from '../services/githubRepoOperations';
import { GitHubTokenService } from '../services/githubTokenService';
import { HelixService } from '../services/helixService';
import { executeEdsPipeline } from '../services/edsPipeline';
import { DaLiveAuthError } from '../services/types';
import { ensureDaLiveAuth, getDaLiveAuthService } from './edsHelpers';
import { executePhaseGitHubRepo } from './storefrontSetupPhase1';
import { executePhaseHelixConfig, type BlockLibraryOptions } from './storefrontSetupPhase2';
import { executePhaseCodeSync } from './storefrontSetupPhase3';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import { getBlockLibraryContentSource } from '@/features/project-creation/services/blockLibraryLoader';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';

// Public type re-exports
export type { StorefrontSetupResult } from './storefrontSetupTypes';
export type { BlockLibraryOptions } from './storefrontSetupPhase2';

// ==========================================================
// Orchestration Helpers
// ==========================================================

/** Create all service dependencies for storefront setup */
function createSetupServices(context: HandlerContext): SetupServices {
    const githubTokenService = new GitHubTokenService(context.context.secrets, context.logger);
    const daLiveAuthService = getDaLiveAuthService(context.context);
    const daLiveTokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
    return {
        githubRepoOps: new GitHubRepoOperations(githubTokenService, context.logger),
        githubFileOps: new GitHubFileOperations(githubTokenService, context.logger),
        githubAppService: new GitHubAppService(githubTokenService, context.logger),
        daLiveContentOps: new DaLiveContentOperations(daLiveTokenProvider, context.logger),
        helixService: new HelixService(context.logger, githubTokenService, daLiveTokenProvider),
        daLiveAuthService,
        daLiveTokenProvider,
        configurationService: new ConfigurationService(daLiveTokenProvider, context.logger),
    };
}

/** Build content source entries for block library doc pages */
function buildLibraryContentSources(blockLibraries: string[]): Array<{ org: string; site: string }> {
    const sources: Array<{ org: string; site: string }> = [];
    for (const libraryId of blockLibraries) {
        const cs = getBlockLibraryContentSource(libraryId);
        if (cs) sources.push(cs);
    }
    return sources;
}

type PipelineProgressInfo = {
    operation: string; message: string; subMessage?: string;
    percentage?: number; current?: number; total?: number;
};

const PIPELINE_PROGRESS = {
    CONTENT_CLEAR: 49,
    CONTENT_COPY_START: 50,
    CONTENT_COPY_END: 58,   // 50 + 8 (0.08 × 100)
    BLOCK_LIBRARY: 59,
    EDS_SETTINGS: 63,
    CACHE_PURGE: 66,
    CONTENT_PUBLISH_START: 67,
    CONTENT_PUBLISH_END: 94, // 67 + 27
    LIBRARY_PUBLISH: 95,    // after content-publish completes — must be > CONTENT_PUBLISH_END (94)
} as const;

/** Build the progress callback for the EDS content pipeline */
function buildPipelineProgressCallback(context: HandlerContext): (info: PipelineProgressInfo) => void {
    return (info) => {
        const mapping: Record<string, { phase: string; progress: number }> = {
            'content-clear': { phase: 'content', progress: PIPELINE_PROGRESS.CONTENT_CLEAR },
            'content-copy': { phase: 'content', progress: PIPELINE_PROGRESS.CONTENT_COPY_START },
            'block-library': { phase: 'block-library', progress: PIPELINE_PROGRESS.BLOCK_LIBRARY },
            'eds-settings': { phase: 'block-library', progress: PIPELINE_PROGRESS.EDS_SETTINGS },
            'cache-purge': { phase: 'publish', progress: PIPELINE_PROGRESS.CACHE_PURGE },
            'content-publish': { phase: 'publish', progress: PIPELINE_PROGRESS.CONTENT_PUBLISH_START },
            'library-publish': { phase: 'publish', progress: PIPELINE_PROGRESS.LIBRARY_PUBLISH },
        };
        const m = mapping[info.operation] ?? { phase: info.operation, progress: PIPELINE_PROGRESS.CONTENT_COPY_START };
        let progress = m.progress;
        if (info.operation === 'content-copy' && info.percentage !== undefined) {
            progress = PIPELINE_PROGRESS.CONTENT_COPY_START + Math.round(info.percentage * 0.08);
        }
        if (info.operation === 'content-publish' && info.current !== undefined && info.total) {
            const span = PIPELINE_PROGRESS.CONTENT_PUBLISH_END - PIPELINE_PROGRESS.CONTENT_PUBLISH_START;
            progress = PIPELINE_PROGRESS.CONTENT_PUBLISH_START + Math.round((info.current / info.total) * span);
        }
        context.sendMessage('storefront-setup-progress', {
            phase: m.phase, message: info.message, subMessage: info.subMessage, progress,
        });
    };
}

const MAX_REAUTH_ATTEMPTS = 2;

/**
 * Retry an async operation on DA.live auth expiry (DaLiveAuthError).
 * Prompts re-authentication via `ensureDaLiveAuth` and calls `onBeforeRetry`
 * before each retry. Throws if auth fails or max attempts are exhausted.
 */
async function withDaLiveAuthRetry<T>(
    context: HandlerContext,
    operation: () => Promise<T>,
    maxAttempts: number,
    onBeforeRetry?: () => Promise<void>,
): Promise<T> {
    const logger = context.logger;
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (!(error instanceof DaLiveAuthError) || attempt >= maxAttempts) {
                throw error;
            }
            logger.warn(`[Storefront Setup] DA.live token expired (attempt ${attempt + 1})`);
            await context.sendMessage('storefront-setup-progress', {
                phase: 'auth-recovery',
                message: 'DA.live session expired. Please re-authenticate to continue.',
                progress: -1,
            });
            const authResult = await ensureDaLiveAuth(context, '[Storefront Setup]');
            if (!authResult.authenticated) {
                throw new Error(authResult.cancelled
                    ? 'Setup cancelled — DA.live re-authentication required'
                    : `DA.live re-authentication failed: ${authResult.error}`);
            }
            logger.info('[Storefront Setup] DA.live re-authenticated');
            if (onBeforeRetry) await onBeforeRetry();
        }
    }
    throw new Error('[Storefront Setup] DA.live retry loop exhausted without result');
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
                context, edsConfig, services, repoInfo, signal, options,
            );
            if (phase2Result.earlyReturn) {
                return { blockCollectionIds: undefined, earlyReturn: phase2Result.earlyReturn };
            }
            const phase3Result = await executePhaseCodeSync(context, edsConfig, services, repoInfo, signal);
            if (phase3Result) {
                return { blockCollectionIds: phase2Result.blockCollectionIds, earlyReturn: phase3Result };
            }
            return { blockCollectionIds: phase2Result.blockCollectionIds };
        },
        MAX_REAUTH_ATTEMPTS,
        async () => {
            context.logger.info('[Storefront Setup] DA.live re-authenticated, resuming configuration');
            await context.sendMessage('storefront-setup-progress', {
                phase: 'code-sync', message: 'Resuming site configuration...', progress: 40,
            });
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
): Promise<{ libraryPaths: string[] }> {
    return withDaLiveAuthRetry(
        context,
        async () => {
            const result = await executeEdsPipeline(
                {
                    repoOwner: repoInfo.repoOwner, repoName: repoInfo.repoName,
                    daLiveOrg: edsConfig.daLiveOrg, daLiveSite: edsConfig.daLiveSite,
                    templateOwner, templateRepo,
                    clearExistingContent: wantsToResetContent, skipContent,
                    contentSource: edsConfig.contentSource,
                    contentPatches: edsConfig.contentPatches, contentPatchSource: edsConfig.contentPatchSource,
                    includeBlockLibrary: true, blockCollectionIds, libraryContentSources,
                    purgeCache: Boolean(edsConfig.resetToTemplate || wantsToResetContent),
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
        MAX_REAUTH_ATTEMPTS,
        async () => {
            logger.info('[Storefront Setup] DA.live re-authenticated, resuming pipeline');
            await context.sendMessage('storefront-setup-progress', {
                phase: 'content', message: 'Resuming content copy...', progress: 50,
            });
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
 * @returns Setup result with repo details
 */
export async function executeStorefrontSetupPhases(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    signal: AbortSignal,
    options?: BlockLibraryOptions,
): Promise<StorefrontSetupResult> {
    const logger = context.logger;
    const services = createSetupServices(context);

    const wantsToResetContent = Boolean(edsConfig.resetSiteContent);
    const skipContent = !edsConfig.contentSource || (Boolean(edsConfig.selectedSite) && !wantsToResetContent);
    logger.info(`[Storefront Setup] Content: skipContent=${skipContent}, selectedSite=${Boolean(edsConfig.selectedSite)}, resetContent=${wantsToResetContent}`);

    const githubOwner = edsConfig.githubOwner || edsConfig.githubAuth?.user?.login;
    if (!githubOwner) {
        logger.error('[Storefront Setup] GitHub owner not found. Config:', JSON.stringify({
            repoName: edsConfig.repoName, repoMode: edsConfig.repoMode, githubOwner: edsConfig.githubOwner,
            templateOwner: edsConfig.templateOwner, templateRepo: edsConfig.templateRepo,
        }));
        return { success: false, error: 'GitHub owner not configured. Please complete GitHub authentication.' };
    }
    logger.info(`[Storefront Setup] Using GitHub owner: ${githubOwner}`);

    const { templateOwner, templateRepo } = edsConfig;
    if (!templateOwner || !templateRepo) {
        logger.error('[Storefront Setup] Template not configured. Config:', JSON.stringify({
            repoName: edsConfig.repoName, templateOwner, templateRepo,
        }));
        return { success: false, error: 'GitHub template not configured. Please check your stack configuration.' };
    }

    const repoInfo: RepoInfo = { repoOwner: githubOwner, repoName: edsConfig.repoName };
    const useExistingRepo = (edsConfig.repoMode ?? 'new') === 'existing' && !!(edsConfig.selectedRepo || edsConfig.existingRepo);
    const effectiveBlockLibraries = options?.selectedBlockLibraries ?? [];
    const phaseOptions: BlockLibraryOptions = { ...options, useExistingRepo };

    try {
        const phase1Result = await executePhaseGitHubRepo(
            context, edsConfig, services, repoInfo, signal, templateOwner, templateRepo,
        );
        if (phase1Result) return phase1Result;

        const { blockCollectionIds, earlyReturn } = await runConfigCodeSyncPhases(
            context, edsConfig, services, repoInfo, signal, phaseOptions,
        );
        if (earlyReturn) return earlyReturn;
        if (signal.aborted) throw new Error('Operation cancelled');

        const pipelineResult = await runEdsPipelineWithRecovery(
            context, logger, services, repoInfo, edsConfig, templateOwner, templateRepo,
            blockCollectionIds, buildLibraryContentSources(effectiveBlockLibraries),
            wantsToResetContent, skipContent, buildPipelineProgressCallback(context),
        );
        if (signal.aborted) throw new Error('Operation cancelled');

        await context.sendMessage('storefront-setup-progress', {
            phase: 'complete',
            message: pipelineResult.libraryPaths.length > 0 ? 'Site is live!' : 'Content publish complete',
            progress: 100,
        });
        return { success: true, ...repoInfo };
    } catch (error) {
        logger.error(`[Storefront Setup] Failed: ${(error as Error).message}`);
        return { success: false, error: (error as Error).message, ...repoInfo };
    }
}
