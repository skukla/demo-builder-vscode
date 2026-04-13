/**
 * EDS Reset Service
 *
 * Shared service for resetting EDS projects to template state.
 * Used by both dashboard and projects-dashboard handlers to eliminate code duplication.
 *
 * The reset workflow:
 * 1. Reset repo to template (Git Tree API)
 * 2. Install block libraries
 * 3. Install inspector tagging
 * 4. Sync code to CDN
 * 5. Configure site permissions
 * 6. Update Configuration Service
 * 7. Publish config.json to CDN
 * 8. Clear + copy demo content to DA.live
 * 9. Create block library in DA.live
 * 10. Apply EDS settings
 * 11. Purge cache + publish content
 * 12. (Optional) Redeploy API Mesh
 *
 * @module features/eds/services/edsResetService
 */

import type { TokenProvider } from './daLiveOrgOperations';
import type { Logger } from '@/types/logger';
import type { GitHubFileOperations } from './githubFileOperations';
import type { GitHubTokenService } from './githubTokenService';
import type { HandlerContext } from '@/types/handlers';
import type { EdsResetParams, EdsResetProgress, EdsResetResult } from './edsResetParams';
import { DaLiveAuthError, GitHubAppNotInstalledError } from './types';
import { DEFAULT_FOLDER_MAPPING, buildSiteConfigParams, ConfigurationService } from './configurationService';
import { HelixService } from './helixService';
import { DaLiveContentOperations } from './daLiveContentOperations';
import { executeEdsPipeline } from './edsPipeline';
import { verifyCdnResources } from './configSyncService';
import { updateStorefrontState } from './storefrontStalenessDetector';
import { getGitHubServices, configureDaLivePermissions, getDaLiveAuthService, ensureDaLiveAuth } from '../handlers/edsHelpers';
import { redeployApiMesh } from './edsResetMeshHelper';
import { resetRepoToTemplate } from './edsResetRepoHelper';

// ==========================================================
// Re-exports for backward compatibility
// ==========================================================

export type { EdsResetParams, EdsResetProgress, EdsResetResult, ExtractParamsResult } from './edsResetParams';
export { extractResetParams } from './edsResetParams';

// ==========================================================
// Constants
// ==========================================================

/** Maximum number of DA.live re-authentication attempts in the content pipeline. */
const MAX_REAUTH_ATTEMPTS = 2;

/** Maps EDS pipeline operation names to wizard step numbers for progress reporting. */
const PIPELINE_STEP_MAP: Record<string, number> = {
    'content-clear': 8, 'content-copy': 8, 'block-library': 9,
    'eds-settings': 10, 'cache-purge': 11, 'content-publish': 11, 'library-publish': 11,
};

// ==========================================================
// Core Reset Implementation
// ==========================================================

/**
 * Steps 4-5: Sync code to CDN and configure DA.live permissions.
 */
async function syncCodeAndPermissions(
    params: EdsResetParams,
    context: HandlerContext,
    githubTokenService: GitHubTokenService,
    tokenProvider: TokenProvider,
    report: (step: number, message: string) => void,
): Promise<void> {
    const { repoOwner, repoName, daLiveOrg, daLiveSite } = params;
    // Step 4: Sync code to CDN
    report(4, 'Syncing code to CDN...');
    // tokenProvider required: DA.live auth headers needed for unpublish during bulk sync
    const helixServiceForCodeSync = new HelixService(context.logger, githubTokenService, tokenProvider);
    try {
        await helixServiceForCodeSync.previewCode(repoOwner, repoName, '/*');
        context.logger.info('[EdsReset] Code synced to CDN');
        report(4, 'Code synchronized');
    } catch (codeSyncError) {
        context.logger.warn(`[EdsReset] Code sync request failed: ${(codeSyncError as Error).message}, continuing anyway`);
        report(4, 'Code sync pending...');
    }

    // Step 5: Configure site permissions
    report(5, 'Configuring site permissions...');
    const daLiveAuthService = getDaLiveAuthService(context.context);
    const userEmail = await daLiveAuthService.getUserEmail();
    if (userEmail) {
        await configureDaLivePermissions(tokenProvider, daLiveOrg, daLiveSite, userEmail, context.logger);
    } else {
        context.logger.warn('[EdsReset] No user email available for permissions');
    }
}

/**
 * Steps 6-7: Publish config.json to CDN and register site with Configuration Service.
 *
 * Step 6 (config.json publish) runs before Config Service registration so the bulk
 * code sync (previewCode '/*') has fully settled before we write to the Config Service.
 * The bulk sync is async on Helix's side and can race with a Config Service write if
 * we register immediately after.
 *
 * Step 7 (Config Service registration) runs after all code sync operations to avoid
 * a race where Helix's async bulk processing overwrites or clears the Config Service entry.
 */
async function publishConfigAndRegisterSite(
    { repoOwner, repoName, daLiveOrg, daLiveSite }: Pick<EdsResetParams, 'repoOwner' | 'repoName' | 'daLiveOrg' | 'daLiveSite'>,
    githubTokenService: GitHubTokenService,
    tokenProvider: TokenProvider,
    logger: Logger,
    report: (step: number, message: string) => void,
): Promise<void> {
    // Step 6: Publish config.json to CDN
    // No tokenProvider: publishing config.json only needs GitHub token (no DA.live auth)
    report(6, 'Publishing config.json to CDN...');
    logger.info(`[EdsReset] Publishing config.json to CDN for ${repoOwner}/${repoName}`);
    const helixServiceForCode = new HelixService(logger, githubTokenService);
    try {
        await helixServiceForCode.previewCode(repoOwner, repoName, '/config.json');
        logger.info('[EdsReset] config.json published to CDN');
        report(6, 'config.json published');
    } catch (configError) {
        logger.warn(`[EdsReset] Failed to publish config.json: ${(configError as Error).message}`);
        report(6, 'config.json publish failed, continuing...');
    }

    // Step 7: Update Configuration Service with current content source
    report(7, 'Updating Configuration Service...');
    const configService = new ConfigurationService(tokenProvider, logger);
    try {
        const configResult = await configService.updateSiteConfig(
            buildSiteConfigParams(repoOwner, repoName, daLiveOrg, daLiveSite),
        );
        if (configResult.success) {
            logger.info('[EdsReset] Configuration Service updated');
            report(7, 'Configuring folder mapping...');
            const folderResult = await configService.setFolderMapping(
                daLiveOrg, daLiveSite, DEFAULT_FOLDER_MAPPING,
            );
            if (folderResult.success) {
                logger.info('[EdsReset] Folder mapping configured');
            } else {
                logger.warn(`[EdsReset] Folder mapping warning: ${folderResult.error}`);
            }
            report(7, 'Configuration Service updated');
        } else {
            logger.warn(`[EdsReset] Configuration Service update warning: ${configResult.error}`);
        }
    } catch (configError) {
        logger.warn(`[EdsReset] Configuration Service update skipped: ${(configError as Error).message}`);
    }
}

/**
 * Handle a DA.live authentication failure mid-pipeline by prompting re-authentication.
 * Returns on success (caller should continue the pipeline loop); throws on cancellation.
 */
async function handlePipelineAuthRetry(
    context: HandlerContext,
    attempt: number,
    report: (step: number, message: string) => void,
): Promise<void> {
    context.logger.warn(`[EdsReset] DA.live token expired mid-pipeline (attempt ${attempt})`);
    report(8, 'DA.live session expired. Please re-authenticate...');

    const authResult = await ensureDaLiveAuth(context, '[EdsReset]');
    if (!authResult.authenticated) {
        throw new Error(
            authResult.cancelled
                ? 'Reset cancelled — DA.live re-authentication required'
                : `DA.live re-authentication failed: ${authResult.error}`,
        );
    }

    context.logger.info('[EdsReset] DA.live re-authenticated, resuming pipeline');
    report(8, 'Resuming content pipeline...');
}

/** Map a pipeline progress event to the wizard step number and format the message. */
function mapPipelineProgress(
    info: { operation: string; message: string; current?: number; total?: number },
    report: (step: number, message: string) => void,
): void {
    let message = info.message;
    if (info.operation === 'content-publish' && info.current !== undefined && info.total) {
        message = `Publishing to CDN (${info.current}/${info.total} pages)`;
    }
    report(PIPELINE_STEP_MAP[info.operation] ?? 8, message);
}

/**
 * Steps 8-11: Run the EDS content pipeline with automatic DA.live re-auth retry.
 * Returns the number of content files copied.
 */
async function runContentPipeline(
    params: EdsResetParams,
    repoResetResult: { blockCollectionIds?: string[]; libraryContentSources: Array<{ org: string; site: string }> },
    daLiveContentOps: DaLiveContentOperations,
    githubFileOps: GitHubFileOperations,
    githubTokenService: GitHubTokenService,
    tokenProvider: TokenProvider,
    context: HandlerContext,
    report: (step: number, message: string) => void,
): Promise<number> {
    const {
        repoOwner, repoName, daLiveOrg, daLiveSite, templateOwner, templateRepo,
        contentSource: contentSourceConfig, includeBlockLibrary = false, contentPatches,
    } = params;

    // tokenProvider required: DA.live content operations (copy, publish) need IMS token
    const helixService = new HelixService(context.logger, githubTokenService, tokenProvider);
    let pipelineAttempt = 0;

    while (pipelineAttempt <= MAX_REAUTH_ATTEMPTS) {
        try {
            const pipelineResult = await executeEdsPipeline(
                {
                    repoOwner, repoName, daLiveOrg, daLiveSite, templateOwner, templateRepo,
                    clearExistingContent: true, skipContent: !contentSourceConfig,
                    contentSource: contentSourceConfig, contentPatches, includeBlockLibrary,
                    blockCollectionIds: repoResetResult.blockCollectionIds,
                    libraryContentSources: repoResetResult.libraryContentSources,
                    purgeCache: true, skipPublish: false,
                },
                { daLiveContentOps, githubFileOps, helixService, logger: context.logger },
                (info) => mapPipelineProgress(info, report),
            );

            if (!pipelineResult.success) {
                throw new Error(pipelineResult.error || 'Content pipeline failed');
            }

            context.logger.info('[EdsReset] Content pipeline completed successfully');
            return pipelineResult.contentFilesCopied;
        } catch (error) {
            if (error instanceof DaLiveAuthError && pipelineAttempt < MAX_REAUTH_ATTEMPTS) {
                pipelineAttempt++;
                await handlePipelineAuthRetry(context, pipelineAttempt, report);
                continue;
            }
            throw error;
        }
    }

    /* istanbul ignore next */
    return 0; // Unreachable: loop throws or returns above
}

/**
 * Final steps: optional CDN verification, optional mesh redeploy, and state persistence.
 */
async function finalizeReset(
    params: EdsResetParams,
    context: HandlerContext,
    report: (step: number, message: string) => void,
    filesReset: number,
    contentCopied: number,
): Promise<EdsResetResult> {
    const { repoOwner, repoName, project, verifyCdn = false, redeployMesh = false } = params;

    if (verifyCdn) {
        report(11, 'Verifying configuration...');
        const verification = await verifyCdnResources(repoOwner, repoName, context.logger);
        if (verification.configVerified) {
            report(11, 'Configuration verified');
            context.logger.info('[EdsReset] config.json verified on CDN');
        } else {
            report(11, 'Configuration propagating...');
            context.logger.warn('[EdsReset] config.json CDN verification timed out - may need more time to propagate');
        }
    }

    if (redeployMesh) {
        const meshResult = await redeployApiMesh(project, repoOwner, repoName, context, report, filesReset, contentCopied);
        if (meshResult) return meshResult; // Partial success
    }

    updateStorefrontState(project, project.componentConfigs || {});
    project.edsStorefrontStatusSummary = 'published';
    await context.stateManager.saveProject(project);
    context.logger.info('[EdsReset] EDS project reset successfully');
    return { success: true, filesReset, contentCopied, meshRedeployed: redeployMesh };
}

/** Map an unknown caught error to a structured EdsResetResult. */
function handleResetError(error: unknown, logger: Logger): EdsResetResult {
    if (error instanceof GitHubAppNotInstalledError) {
        logger.info(`[EdsReset] GitHub App not installed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            errorType: 'GITHUB_APP_NOT_INSTALLED',
            errorDetails: { owner: error.owner, repo: error.repo, installUrl: error.installUrl },
        };
    }
    const errorMessage = (error as Error).message;
    logger.error('[EdsReset] Reset failed', error as Error);
    return { success: false, error: errorMessage };
}

/**
 * Execute EDS project reset
 *
 * Resets the repository contents to match the template without deleting the repo.
 * This preserves the repo URL, settings, webhooks, and GitHub App installation.
 *
 * @param params - Reset parameters
 * @param context - Handler context with services
 * @param tokenProvider - Token provider for DA.live operations
 * @param onProgress - Optional progress callback
 * @returns Reset result
 */
export async function executeEdsReset(
    params: EdsResetParams,
    context: HandlerContext,
    tokenProvider: TokenProvider,
    onProgress?: (progress: EdsResetProgress) => void,
): Promise<EdsResetResult> {
    const { redeployMesh = false } = params;

    const baseSteps = 11;
    const totalSteps = redeployMesh ? baseSteps + 1 : baseSteps;
    const report = (step: number, message: string) => {
        onProgress?.({ step, totalSteps, message });
    };

    const { tokenService: githubTokenService, fileOperations: githubFileOps } = getGitHubServices(context);
    const daLiveContentOps = new DaLiveContentOperations(tokenProvider, context.logger);

    let filesReset = 0;
    let contentCopied = 0;

    try {
        // Step 1: Reset repo to template
        const repoResetResult = await resetRepoToTemplate(params, context, githubFileOps, report);
        filesReset = repoResetResult.filesReset;

        // Steps 4-5: Sync code to CDN + configure permissions
        await syncCodeAndPermissions(params, context, githubTokenService, tokenProvider, report);

        await publishConfigAndRegisterSite(
            params, githubTokenService, tokenProvider, context.logger, report,
        );

        // Steps 8-11: Content Pipeline (with DA.live re-auth retry)
        contentCopied = await runContentPipeline(
            params, repoResetResult, daLiveContentOps, githubFileOps,
            githubTokenService, tokenProvider, context, report,
        );

        // Steps 11-12: CDN verification + optional mesh redeploy + state persistence
        return await finalizeReset(params, context, report, filesReset, contentCopied);
    } catch (error) {
        return handleResetError(error, context.logger);
    }
}
