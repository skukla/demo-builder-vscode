/**
 * Storefront Setup Handlers
 *
 * Message handlers for storefront setup wizard step operations.
 * Manages GitHub repo creation, DA.live content population, and Helix configuration
 * during the storefront-setup step, including cancel/cleanup handling.
 *
 * Renamed from edsPreflightHandlers.ts to better reflect the step's purpose.
 *
 * @module features/eds/handlers/storefrontSetupHandlers
 */

import * as vscode from 'vscode';
import { installBlockCollection } from '../services/blockCollectionHelpers';
import { CleanupService } from '../services/cleanupService';
import { ConfigurationService } from '../services/configurationService';
import { DaLiveAuthService } from '../services/daLiveAuthService';
import { DaLiveContentOperations, createDaLiveTokenProvider } from '../services/daLiveContentOperations';
import { DaLiveOrgOperations } from '../services/daLiveOrgOperations';
import { generateFstabContent } from '../services/fstabGenerator';
import { GitHubAppService } from '../services/githubAppService';
import { GitHubFileOperations } from '../services/githubFileOperations';
import { GitHubRepoOperations } from '../services/githubRepoOperations';
import { GitHubTokenService } from '../services/githubTokenService';
import { HelixService } from '../services/helixService';
import { ToolManager } from '../services/toolManager';
import type { EdsMetadata, EdsCleanupOptions } from '../services/types';
import { configureDaLivePermissions } from './edsHelpers';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

// ==========================================================
// Types
// ==========================================================

/**
 * Partial state tracking for storefront setup operations
 * Tracks which resources have been created for cleanup on cancel
 */
export interface StorefrontSetupPartialState {
    repoCreated: boolean;
    repoUrl?: string;
    repoOwner?: string;
    repoName?: string;
    contentCopied: boolean;
    phase: string;
}

/**
 * Payload for storefront-setup-start message
 */
interface StorefrontSetupStartPayload {
    projectName: string;
    /** Component configurations for config.json generation */
    componentConfigs?: Record<string, Record<string, string | boolean | number | undefined>>;
    /** Backend component ID for environment-aware config generation */
    backendComponentId?: string;
    /** Selected addon IDs (e.g., ['commerce-block-collection']) */
    selectedAddons?: string[];
    edsConfig: {
        repoName: string;
        repoMode?: 'new' | 'existing';
        existingRepo?: string;
        daLiveOrg: string;
        daLiveSite: string;
        githubOwner?: string;
        isPrivate?: boolean;
        resetToTemplate?: boolean;
        skipContent?: boolean;
        // Template repository info (from stack/brand config) for GitHub reset operations
        templateOwner?: string;
        templateRepo?: string;
        // DA.live content source (explicit config, not derived from GitHub URL)
        contentSource?: {
            org: string;
            site: string;
            indexPath?: string;
        };
        // Selected existing repository (from searchable list)
        selectedRepo?: {
            name: string;
            fullName: string;
            htmlUrl: string;
            isPrivate?: boolean;
        };
        // Selected existing DA.live site (from searchable list)
        // Used to determine if user is using an existing site vs creating new
        selectedSite?: {
            id: string;
            name: string;
        };
        // Whether to reset existing site content (repopulate with demo data)
        // Only applies when selectedSite is set (existing site mode)
        resetSiteContent?: boolean;
        // Created repository info (set when repo was created in GitHubRepoSelectionStep)
        // If present, skip repo creation in StorefrontSetupStep
        createdRepo?: {
            owner: string;
            name: string;
            url: string;
            fullName: string;
        };
        // Patch IDs to apply during setup (from demo-packages.json storefronts)
        patches?: string[];
        // Content patch IDs to apply during DA.live content copy (from demo-packages.json storefronts)
        contentPatches?: string[];
        // External source for content patches (from demo-packages.json storefronts)
        contentPatchSource?: {
            owner: string;
            repo: string;
            path: string;
        };
        // GitHub auth info from Connect Services step
        githubAuth?: {
            isAuthenticated?: boolean;
            user?: {
                login: string;
                name?: string;
                avatarUrl?: string;
                email?: string;
            };
        };
    };
}

/**
 * Payload for storefront-setup-cancel message
 */
interface StorefrontSetupCancelPayload {
    partialState?: StorefrontSetupPartialState;
    edsConfig?: {
        daLiveOrg?: string;
        daLiveSite?: string;
    };
}

// ==========================================================
// Handlers
// ==========================================================

/**
 * Handle cancel request for storefront setup operations
 *
 * This handler:
 * 1. Shows confirmation dialog if resources exist
 * 2. Aborts running operations via AbortController
 * 3. Cleans up created resources (GitHub repo, DA.live content)
 * 4. Notifies UI of cancel completion
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Cancel payload with partial state info
 * @returns Success if cancel handled properly
 */
export async function handleCancelStorefrontSetup(
    context: HandlerContext,
    payload?: StorefrontSetupCancelPayload,
): Promise<HandlerResponse> {
    const partialState = payload?.partialState;
    const edsConfig = payload?.edsConfig;

    context.logger.info('[Storefront Setup] Cancel requested');

    // Check if any resources were created
    const hasCreatedResources = partialState?.repoCreated || partialState?.contentCopied;

    if (hasCreatedResources) {
        // Show confirmation dialog
        const confirm = await vscode.window.showWarningMessage(
            'Cancelling will delete the GitHub repository and DA.live content created so far. Continue?',
            { modal: true },
            'Yes, Cancel',
        );

        if (confirm !== 'Yes, Cancel') {
            context.logger.debug('[Storefront Setup] Cancel aborted by user');
            await context.sendMessage('storefront-setup-cancel-aborted', {});
            return { success: true };
        }
    }

    // Abort any running operations
    const abortController = context.sharedState.storefrontSetupAbortController as AbortController | undefined;
    if (abortController) {
        context.logger.debug('[Storefront Setup] Aborting running operations');
        abortController.abort();
        context.sharedState.storefrontSetupAbortController = undefined;
    }

    // Clean up created resources
    if (hasCreatedResources && partialState) {
        try {
            await context.sendMessage('storefront-setup-progress', {
                phase: 'cancelling',
                message: 'Cleaning up resources...',
                progress: 0,
            });

            const cleanupResult = await cleanupStorefrontSetupResources(
                context,
                partialState,
                edsConfig,
            );

            if (cleanupResult.success) {
                context.logger.info('[Storefront Setup] Cleanup completed successfully');
            } else {
                context.logger.warn('[Storefront Setup] Cleanup completed with errors:', cleanupResult.error);
            }
        } catch (error) {
            // Log error but don't fail - cleanup is best effort
            context.logger.error('[Storefront Setup] Cleanup failed', error as Error);
        }
    }

    await context.sendMessage('storefront-setup-cancelled', {});
    return { success: true };
}

/**
 * Handle start request for storefront setup operations
 *
 * Executes the EDS setup phases that need to happen BEFORE project creation:
 * 1. GitHub repository creation (from template)
 * 2. Helix 5 configuration (fstab.yaml)
 * 3. Code bus synchronization verification
 * 4. DA.live content population
 *
 * The executor will skip these phases when `preflightComplete` is true.
 *
 * @param context - Handler context
 * @param payload - Start payload with project and EDS config
 * @returns Success with setup results
 */
export async function handleStartStorefrontSetup(
    context: HandlerContext,
    payload?: StorefrontSetupStartPayload,
): Promise<HandlerResponse> {
    if (!payload?.projectName || !payload?.edsConfig) {
        context.logger.error('[Storefront Setup] Missing required parameters');
        await context.sendMessage('storefront-setup-error', {
            message: 'Missing required parameters',
            error: 'Project name and EDS config are required',
        });
        return { success: false, error: 'Missing required parameters' };
    }

    const { projectName, edsConfig } = payload;
    context.logger.info(`[Storefront Setup] Starting for project: ${projectName}`);

    // Create AbortController for cancel support
    const abortController = new AbortController();
    context.sharedState.storefrontSetupAbortController = abortController;

    // Check if AuthenticationService is available
    if (!context.authManager) {
        context.logger.error('[Storefront Setup] AuthenticationService not available');
        await context.sendMessage('storefront-setup-error', {
            message: 'Authentication required',
            error: 'Please authenticate with Adobe before starting storefront setup',
        });
        return { success: false, error: 'AuthenticationService not available' };
    }

    try {
        // Execute storefront setup phases
        const result = await executeStorefrontSetupPhases(
            context,
            projectName,
            edsConfig,
            payload.componentConfigs,
            payload.backendComponentId,
            abortController.signal,
            payload.selectedAddons,
        );

        if (result.success) {
            context.logger.info(`[Storefront Setup] Complete: ${result.repoUrl}`);
            await context.sendMessage('storefront-setup-complete', {
                message: 'Storefront setup completed successfully!',
                githubRepo: result.repoUrl,
                daLiveSite: `https://da.live/${edsConfig.daLiveOrg}/${edsConfig.daLiveSite}`,
                repoOwner: result.repoOwner,
                repoName: result.repoName,
                // Note: previewUrl/liveUrl not sent - derived from githubRepo by typeGuards
            });
            return { success: true, data: result };
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error(`[Storefront Setup] Failed: ${errorMessage}`);
        await context.sendMessage('storefront-setup-error', {
            message: 'Storefront setup failed',
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    } finally {
        context.sharedState.storefrontSetupAbortController = undefined;
    }
}

/**
 * Handle resume request after GitHub App installation
 *
 * @param context - Handler context
 * @param payload - Resume payload
 * @returns Success
 */
export async function handleResumeStorefrontSetup(
    context: HandlerContext,
    _payload?: StorefrontSetupStartPayload,
): Promise<HandlerResponse> {
    context.logger.info('[Storefront Setup] Resume requested after GitHub App installation');

    // Continue from code-sync phase
    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync',
        message: 'Verifying code synchronization...',
        progress: 40,
    });

    return { success: true };
}

// ==========================================================
// Helper Functions
// ==========================================================

/** Sentinel to skip folder mapping when Config Service registration fails with 401 */
class SkipConfigService extends Error {
    constructor() {
        super('Config Service skipped');
    }
}

/**
 * Clean up resources created during storefront setup
 *
 * @param context - Handler context
 * @param partialState - Tracking state of created resources
 * @param edsConfig - EDS configuration for DA.live info
 * @returns Cleanup result
 */
async function cleanupStorefrontSetupResources(
    context: HandlerContext,
    partialState: StorefrontSetupPartialState,
    edsConfig?: { daLiveOrg?: string; daLiveSite?: string },
): Promise<{ success: boolean; error?: string }> {
    context.logger.debug('[Storefront Setup] Starting resource cleanup');

    try {
        // Build metadata from partial state
        const githubRepo = partialState.repoOwner && partialState.repoName
            ? `${partialState.repoOwner}/${partialState.repoName}`
            : partialState.repoUrl?.replace('https://github.com/', '');

        const metadata: EdsMetadata = {
            githubRepo,
            daLiveOrg: edsConfig?.daLiveOrg,
            daLiveSite: edsConfig?.daLiveSite,
        };

        const options: EdsCleanupOptions = {
            deleteGitHub: partialState.repoCreated,
            deleteDaLive: partialState.contentCopied,
            deleteConfigService: partialState.repoCreated, // Clean up Config Service if repo was created
            archiveInsteadOfDelete: false, // Full delete for setup
        };

        // Create cleanup service with required dependencies
        const cleanupService = await createCleanupService(context);
        const result = await cleanupService.cleanupEdsResources(metadata, options);

        // Check if any operation failed
        const failures = [];
        if (!result.github.success && !result.github.skipped) {
            failures.push(`GitHub: ${result.github.error}`);
        }
        if (!result.daLive.success && !result.daLive.skipped) {
            failures.push(`DA.live: ${result.daLive.error}`);
        }

        if (failures.length > 0) {
            return { success: false, error: failures.join('; ') };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

/**
 * Result of storefront setup phase execution
 */
interface StorefrontSetupResult {
    success: boolean;
    error?: string;
    repoUrl?: string;
    repoOwner?: string;
    repoName?: string;
    // Note: previewUrl/liveUrl not included - derived from githubRepo by typeGuards
}

/**
 * Services bundle for storefront setup phases
 */
interface SetupServices {
    githubRepoOps: GitHubRepoOperations;
    githubFileOps: GitHubFileOperations;
    githubAppService: GitHubAppService;
    daLiveContentOps: DaLiveContentOperations;
    helixService: HelixService;
    daLiveAuthService: DaLiveAuthService;
    daLiveTokenProvider: { getAccessToken: () => Promise<string | null> };
    configurationService: ConfigurationService;
}

/**
 * Mutable repo info passed through phases
 */
interface RepoInfo {
    repoUrl?: string;
    repoOwner: string;
    repoName: string;
}

/**
 * Execute Phase 1: GitHub repository setup (create, use existing, or pre-created)
 */
async function executePhaseGitHubRepo(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    signal: AbortSignal,
    templateOwner: string,
    templateRepo: string,
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    if (signal.aborted) {
        throw new Error('Operation cancelled');
    }

    const repoMode = edsConfig.repoMode || 'new';
    const useExistingRepo = repoMode === 'existing' && (edsConfig.selectedRepo || edsConfig.existingRepo);
    const usePreCreatedRepo = repoMode === 'new' && !!edsConfig.createdRepo;

    if (usePreCreatedRepo && edsConfig.createdRepo) {
        repoInfo.repoOwner = edsConfig.createdRepo.owner;
        repoInfo.repoName = edsConfig.createdRepo.name;
        repoInfo.repoUrl = edsConfig.createdRepo.url;

        logger.info(`[Storefront Setup] Using pre-created repository: ${repoInfo.repoOwner}/${repoInfo.repoName}`);
        await context.sendMessage('storefront-setup-progress', {
            phase: 'github-repo',
            message: `Using repository: ${repoInfo.repoOwner}/${repoInfo.repoName}`,
            progress: 15,
            ...repoInfo,
        });
    } else if (useExistingRepo) {
        await executePhaseExistingRepo(context, edsConfig, services, repoInfo, templateOwner, templateRepo);
    } else {
        await executePhaseNewRepo(context, edsConfig, services, repoInfo, signal, templateOwner, templateRepo);
    }

    return null;
}

/**
 * Handle existing repository setup (parse info, optional reset to template)
 */
async function executePhaseExistingRepo(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    templateOwner: string,
    templateRepo: string,
): Promise<void> {
    const logger = context.logger;

    if (edsConfig.selectedRepo) {
        const [owner, name] = edsConfig.selectedRepo.fullName.split('/');
        repoInfo.repoOwner = owner;
        repoInfo.repoName = name;
        repoInfo.repoUrl = edsConfig.selectedRepo.htmlUrl;
    } else if (edsConfig.existingRepo) {
        const [owner, name] = edsConfig.existingRepo.split('/');
        repoInfo.repoOwner = owner;
        repoInfo.repoName = name;
        repoInfo.repoUrl = `https://github.com/${edsConfig.existingRepo}`;
    }

    logger.info(`[Storefront Setup] Using existing repository: ${repoInfo.repoOwner}/${repoInfo.repoName}`);
    await context.sendMessage('storefront-setup-progress', {
        phase: 'github-repo',
        message: `Using existing repository: ${repoInfo.repoOwner}/${repoInfo.repoName}`,
        progress: 5,
        ...repoInfo,
    });

    if (edsConfig.resetToTemplate) {
        logger.info('[Storefront Setup] Resetting repository to template...');
        await context.sendMessage('storefront-setup-progress', {
            phase: 'github-repo', message: 'Resetting repository to template...', progress: 6,
        });

        await services.githubRepoOps.resetToTemplate(
            repoInfo.repoOwner, repoInfo.repoName,
            templateOwner, templateRepo, 'main', 'chore: reset to template',
        );
        logger.info('[Storefront Setup] Repository reset to template');
    }

    await context.sendMessage('storefront-setup-progress', {
        phase: 'github-repo', message: 'Repository ready', progress: 15, ...repoInfo,
    });
}

/**
 * Handle new repository creation from template
 */
async function executePhaseNewRepo(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    signal: AbortSignal,
    templateOwner: string,
    templateRepo: string,
): Promise<void> {
    const logger = context.logger;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'github-repo', message: 'Creating GitHub repository from template...', progress: 5,
    });

    logger.info(`[Storefront Setup] Creating repository: ${repoInfo.repoName}`);

    const repo = await services.githubRepoOps.createFromTemplate(
        templateOwner, templateRepo, repoInfo.repoName, edsConfig.isPrivate ?? false,
    );

    repoInfo.repoUrl = repo.htmlUrl;
    const [owner, name] = repo.fullName.split('/');
    repoInfo.repoOwner = owner;
    repoInfo.repoName = name;

    logger.info(`[Storefront Setup] Repository created: ${repoInfo.repoUrl}`);

    await context.sendMessage('storefront-setup-progress', {
        phase: 'github-repo', message: 'Waiting for repository content...', progress: 10, ...repoInfo,
    });

    await services.githubRepoOps.waitForContent(repoInfo.repoOwner, repoInfo.repoName, signal);

    await context.sendMessage('storefront-setup-progress', {
        phase: 'github-repo', message: 'Repository ready', progress: 15, ...repoInfo,
    });
}

/**
 * Execute Phase 2: Helix configuration (fstab.yaml, block collection, GitHub App check)
 */
async function executePhaseHelixConfig(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    selectedAddons: string[] | undefined,
    useExistingRepo: boolean,
): Promise<{ blockCollectionIds?: string[]; earlyReturn?: StorefrontSetupResult }> {
    const logger = context.logger;
    const { githubFileOps } = services;

    if (context.sharedState.storefrontSetupAbortController &&
        (context.sharedState.storefrontSetupAbortController as AbortController).signal.aborted) {
        throw new Error('Operation cancelled');
    }

    await context.sendMessage('storefront-setup-progress', {
        phase: 'helix-config', message: 'Configuring Edge Delivery Services...', progress: 20,
    });

    const fstabContent = generateFstabContent({ daLiveOrg: edsConfig.daLiveOrg, daLiveSite: edsConfig.daLiveSite });

    await context.sendMessage('storefront-setup-progress', {
        phase: 'helix-config', message: 'Pushing fstab.yaml configuration...', progress: 25,
    });

    const existingFstab = await githubFileOps.getFileContent(repoInfo.repoOwner, repoInfo.repoName, 'fstab.yaml');
    await githubFileOps.createOrUpdateFile(
        repoInfo.repoOwner, repoInfo.repoName, 'fstab.yaml', fstabContent,
        'chore: configure fstab.yaml for DA.live content source', existingFstab?.sha,
    );
    logger.info('[Storefront Setup] fstab.yaml pushed to GitHub');

    // Phase 2.1: Commerce Block Collection (if selected)
    let blockCollectionIds: string[] | undefined;
    if (selectedAddons?.includes('commerce-block-collection')) {
        await context.sendMessage('storefront-setup-progress', {
            phase: 'helix-config', message: 'Installing Commerce Block Collection...', progress: 25,
        });
        const result = await installBlockCollection(githubFileOps, repoInfo.repoOwner, repoInfo.repoName, logger);
        if (result.success) {
            logger.info(`[Storefront Setup] Block collection: ${result.blocksCount} blocks installed`);
            blockCollectionIds = result.blockIds;
        } else {
            logger.warn(`[Storefront Setup] Block collection failed: ${result.error}`);
        }
    }

    // Phase 2.5: GitHub App Check (EXISTING repos only)
    if (useExistingRepo) {
        const earlyReturn = await checkGitHubAppForExistingRepo(
            context, services, repoInfo,
        );
        if (earlyReturn) {
            return { blockCollectionIds, earlyReturn };
        }
    }

    await context.sendMessage('storefront-setup-progress', {
        phase: 'helix-config', message: 'Helix configured', progress: 35,
    });

    return { blockCollectionIds };
}

/**
 * Check GitHub App installation for existing repos. Returns early result if not installed.
 */
async function checkGitHubAppForExistingRepo(
    context: HandlerContext,
    services: SetupServices,
    repoInfo: RepoInfo,
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { githubAppService } = services;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'helix-config', message: 'Verifying GitHub App installation...', progress: 28,
    });

    logger.info(`[Storefront Setup] Checking GitHub App for existing repo: ${repoInfo.repoOwner}/${repoInfo.repoName}`);
    const { isInstalled, codeStatus } = await githubAppService.isAppInstalled(repoInfo.repoOwner, repoInfo.repoName);

    if (!isInstalled) {
        const installUrl = githubAppService.getInstallUrl(repoInfo.repoOwner, repoInfo.repoName);
        logger.info(`[Storefront Setup] GitHub App not installed. Install URL: ${installUrl}`);

        await context.sendMessage('storefront-setup-github-app-required', {
            owner: repoInfo.repoOwner, repo: repoInfo.repoName, installUrl,
            message: 'The AEM Code Sync GitHub App must be installed to continue.',
        });

        return { success: false, error: 'GitHub App installation required', ...repoInfo };
    }

    logger.info(`[Storefront Setup] GitHub App verified for existing repo (code.status: ${codeStatus})`);
    return null;
}

/**
 * Execute Phase 3: Code sync verification and CDN publishing
 */
async function executePhaseCodeSync(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    signal: AbortSignal,
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { helixService, daLiveAuthService, daLiveTokenProvider } = services;

    // Phase 3: Code Sync Verification
    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync', message: 'Verifying code synchronization...', progress: 40,
    });

    const codeSyncResult = await verifyCodeSync(
        context, services, repoInfo, signal,
    );
    if (codeSyncResult) return codeSyncResult;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync', message: 'Code synchronized', progress: 42,
    });

    // Phase 3b: Publish Code to CDN
    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync', message: 'Publishing code to CDN...', progress: 43,
    });

    try {
        await helixService.previewCode(repoInfo.repoOwner, repoInfo.repoName, '/*', 'main');
        logger.info('[Storefront Setup] Code published to CDN');
    } catch (error) {
        logger.warn(`[Storefront Setup] Code preview warning: ${(error as Error).message}`);
    }

    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync', message: 'Code synchronized', progress: 45,
    });

    // Phase 3c: Configure Admin Access
    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync', message: 'Configuring site permissions...', progress: 47,
    });

    const daLiveEmail = await daLiveAuthService.getUserEmail();
    const userEmail = daLiveEmail || edsConfig.githubAuth?.user?.email;

    if (userEmail) {
        const adminResult = await configureDaLivePermissions(
            daLiveTokenProvider, edsConfig.daLiveOrg, edsConfig.daLiveSite, userEmail, logger,
        );
        if (!adminResult.success) {
            await context.sendMessage('storefront-setup-progress', {
                phase: 'code-sync',
                message: `⚠️ Permissions partially configured: ${adminResult.error}`,
                progress: 47,
            });
        }
    } else {
        logger.warn('[Storefront Setup] No user email available for permissions');
    }

    // Phase 3d: Configuration Service Registration
    await registerConfigurationService(context, services, repoInfo, edsConfig, logger);

    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync', message: 'Site configuration complete', progress: 49,
    });

    return null;
}

/**
 * Poll for code sync and handle GitHub App not installed scenario
 */
async function verifyCodeSync(
    context: HandlerContext,
    services: SetupServices,
    repoInfo: RepoInfo,
    signal: AbortSignal,
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { githubAppService } = services;

    try {
        const codeUrl = `https://admin.hlx.page/code/${repoInfo.repoOwner}/${repoInfo.repoName}/main/scripts/aem.js`;
        let syncVerified = false;
        const maxAttempts = 25;
        const pollInterval = 2000;

        for (let attempt = 0; attempt < maxAttempts && !syncVerified; attempt++) {
            if (signal.aborted) throw new Error('Operation cancelled');

            try {
                const response = await fetch(codeUrl, {
                    method: 'GET', signal: AbortSignal.timeout(TIMEOUTS.QUICK),
                });
                if (response.ok) syncVerified = true;
            } catch {
                // Continue polling
            }

            if (!syncVerified && attempt < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
        }

        if (!syncVerified) {
            const { isInstalled, codeStatus } = await githubAppService.isAppInstalled(repoInfo.repoOwner, repoInfo.repoName);

            if (!isInstalled) {
                const installUrl = githubAppService.getInstallUrl(repoInfo.repoOwner, repoInfo.repoName);
                logger.info(`[Storefront Setup] GitHub App not installed. Install URL: ${installUrl}`);

                await context.sendMessage('storefront-setup-github-app-required', {
                    owner: repoInfo.repoOwner, repo: repoInfo.repoName, installUrl,
                    message: 'The AEM Code Sync GitHub App must be installed to continue.',
                });

                return { success: false, error: 'GitHub App installation required', ...repoInfo };
            }

            if (codeStatus === 400) {
                logger.info('[Storefront Setup] Code sync in progress (initializing), continuing...');
            } else {
                logger.warn(`[Storefront Setup] Code sync status unclear (code.status: ${codeStatus}), continuing...`);
            }
        } else {
            logger.info('[Storefront Setup] Code sync verified');
        }
    } catch (error) {
        if ((error as Error).message === 'GitHub App installation required') throw error;
        throw new Error(`Code sync failed: ${(error as Error).message}`);
    }

    return null;
}

/**
 * Register site with Configuration Service and set folder mapping
 */
async function registerConfigurationService(
    context: HandlerContext,
    services: SetupServices,
    repoInfo: RepoInfo,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    logger: import('@/types/logger').Logger,
): Promise<void> {
    const { configurationService } = services;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync', message: 'Registering site with Configuration Service...', progress: 48,
    });

    try {
        const contentSourceUrl = `https://content.da.live/${edsConfig.daLiveOrg}/${edsConfig.daLiveSite}/`;
        const registerResult = await configurationService.registerSite({
            org: repoInfo.repoOwner, site: repoInfo.repoName,
            codeOwner: repoInfo.repoOwner, codeRepo: repoInfo.repoName, contentSourceUrl,
        });

        if (registerResult.success) {
            logger.info('[Storefront Setup] Site registered with Configuration Service');
        } else if (registerResult.statusCode === 409) {
            logger.info('[Storefront Setup] Site config already exists (409), continuing');
        } else if (registerResult.statusCode === 401) {
            logger.warn(`[Storefront Setup] Config Service requires org admin setup: ${registerResult.error}`);
            await context.sendMessage('storefront-setup-progress', {
                phase: 'code-sync', message: 'Site config skipped (org admin setup needed)', progress: 49,
            });
            throw new SkipConfigService();
        } else {
            logger.warn(`[Storefront Setup] Config Service registration warning: ${registerResult.error}`);
        }

        const folderResult = await configurationService.setFolderMapping(
            repoInfo.repoOwner, repoInfo.repoName, { '/products/': '/products/default' },
        );
        if (folderResult.success) {
            logger.info('[Storefront Setup] Folder mapping configured via Configuration Service');
        } else {
            logger.warn(`[Storefront Setup] Folder mapping warning: ${folderResult.error}`);
        }
    } catch (error) {
        if (error instanceof SkipConfigService) {
            // Expected — org admin not set up, already logged above
        } else {
            logger.warn(`[Storefront Setup] Configuration Service warning: ${(error as Error).message}`);
        }
    }
}

/**
 * Execute all storefront setup phases
 *
 * This runs the remote setup operations:
 * 1. Create GitHub repository from template
 * 2. Configure Helix 5 (push fstab.yaml to GitHub)
 * 3. Verify code bus synchronization
 * 4. Populate DA.live content
 *
 * @param context - Handler context
 * @param projectName - Project name
 * @param edsConfig - EDS configuration from wizard
 * @param componentConfigs - Component configurations for config.json generation
 * @param signal - Abort signal for cancellation
 * @returns Setup result with repo details
 */
async function executeStorefrontSetupPhases(
    context: HandlerContext,
    _projectName: string,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    _componentConfigs: StorefrontSetupStartPayload['componentConfigs'],
    _backendComponentId: string | undefined,
    signal: AbortSignal,
    selectedAddons?: string[],
): Promise<StorefrontSetupResult> {
    const logger = context.logger;

    // Create service dependencies
    const githubTokenService = new GitHubTokenService(context.context.secrets, logger);
    const daLiveAuthService = new DaLiveAuthService(context.context);
    const daLiveTokenProvider = {
        getAccessToken: async () => daLiveAuthService.getAccessToken(),
    };

    const services: SetupServices = {
        githubRepoOps: new GitHubRepoOperations(githubTokenService, logger),
        githubFileOps: new GitHubFileOperations(githubTokenService, logger),
        githubAppService: new GitHubAppService(githubTokenService, logger),
        daLiveContentOps: new DaLiveContentOperations(
            createDaLiveTokenProvider(context.authManager), logger,
        ),
        helixService: new HelixService(logger, githubTokenService, daLiveTokenProvider),
        daLiveAuthService,
        daLiveTokenProvider,
        configurationService: new ConfigurationService(daLiveTokenProvider, logger),
    };

    // Derive skipContent from user selections
    const contentSource = edsConfig.contentSource;
    const isUsingExistingSite = Boolean(edsConfig.selectedSite);
    const wantsToResetContent = Boolean(edsConfig.resetSiteContent);
    const skipContent = !contentSource || (isUsingExistingSite && !wantsToResetContent);

    // Log content handling decision
    logger.info(`[Storefront Setup] Content handling decision:`);
    logger.info(`  - selectedSite: ${edsConfig.selectedSite ? JSON.stringify(edsConfig.selectedSite) : 'undefined (new site)'}`);
    logger.info(`  - resetSiteContent: ${edsConfig.resetSiteContent ?? 'undefined (default false)'}`);
    logger.info(`  - isUsingExistingSite: ${isUsingExistingSite}`);
    logger.info(`  - wantsToResetContent: ${wantsToResetContent}`);
    logger.info(`  - RESULT skipContent: ${skipContent} (${skipContent ? 'will SKIP content copy' : 'will COPY content'})`);

    // Validate GitHub owner
    const githubOwner = edsConfig.githubOwner || edsConfig.githubAuth?.user?.login;
    if (!githubOwner) {
        logger.error('[Storefront Setup] GitHub owner not found. edsConfig:', JSON.stringify(edsConfig, null, 2));
        return { success: false, error: 'GitHub owner not configured. Please complete GitHub authentication.' };
    }
    logger.info(`[Storefront Setup] Using GitHub owner: ${githubOwner}`);

    // Validate template info
    const templateOwner = edsConfig.templateOwner;
    const templateRepo = edsConfig.templateRepo;
    if (!templateOwner || !templateRepo) {
        logger.error('[Storefront Setup] Template not configured. edsConfig:', JSON.stringify(edsConfig, null, 2));
        return { success: false, error: 'GitHub template not configured. Please check your stack configuration.' };
    }

    const repoInfo: RepoInfo = { repoOwner: githubOwner, repoName: edsConfig.repoName };
    const repoMode = edsConfig.repoMode || 'new';
    const useExistingRepo = repoMode === 'existing' && !!(edsConfig.selectedRepo || edsConfig.existingRepo);

    try {
        // Phase 1: GitHub Repository Setup
        const phase1Result = await executePhaseGitHubRepo(
            context, edsConfig, services, repoInfo, signal, templateOwner, templateRepo,
        );
        if (phase1Result) return phase1Result;

        // Phase 2: Helix Configuration
        const { blockCollectionIds, earlyReturn } = await executePhaseHelixConfig(
            context, edsConfig, services, repoInfo, selectedAddons, useExistingRepo,
        );
        if (earlyReturn) return earlyReturn;

        // Phase 3: Code Sync Verification + CDN publish + permissions + config service
        const phase3Result = await executePhaseCodeSync(
            context, edsConfig, services, repoInfo, signal,
        );
        if (phase3Result) return phase3Result;

        // Phase 4-5: Content Pipeline
        if (signal.aborted) throw new Error('Operation cancelled');

        const { executeEdsPipeline } = await import('../services/edsPipeline');

        const pipelineResult = await executeEdsPipeline(
            {
                repoOwner: repoInfo.repoOwner,
                repoName: repoInfo.repoName,
                daLiveOrg: edsConfig.daLiveOrg,
                daLiveSite: edsConfig.daLiveSite,
                templateOwner,
                templateRepo,
                clearExistingContent: wantsToResetContent,
                skipContent,
                contentSource,
                contentPatches: edsConfig.contentPatches,
                contentPatchSource: edsConfig.contentPatchSource,
                includeBlockLibrary: true,
                blockCollectionIds,
                purgeCache: Boolean(edsConfig.resetToTemplate || wantsToResetContent),
            },
            { daLiveContentOps: services.daLiveContentOps, githubFileOps: services.githubFileOps, helixService: services.helixService, logger },
            (info) => {
                const mapping: Record<string, { phase: string; progress: number }> = {
                    'content-clear': { phase: 'content-copy', progress: 45 },
                    'content-copy': { phase: 'content-copy', progress: 50 },
                    'block-library': { phase: 'content-copy', progress: 61 },
                    'eds-settings': { phase: 'content-copy', progress: 63 },
                    'cache-purge': { phase: 'content-publish', progress: 66 },
                    'content-publish': { phase: 'content-publish', progress: 67 },
                    'library-publish': { phase: 'content-publish', progress: 91 },
                };
                const m = mapping[info.operation] ?? { phase: info.operation, progress: 50 };
                let progress = m.progress;

                if (info.operation === 'content-copy' && info.percentage !== undefined) {
                    progress = 50 + Math.round(info.percentage * 0.1);
                }
                if (info.operation === 'content-publish' && info.current !== undefined && info.total) {
                    progress = 67 + Math.round((info.current / info.total) * 23);
                }

                context.sendMessage('storefront-setup-progress', {
                    phase: m.phase, message: info.message, subMessage: info.subMessage, progress,
                });
            },
        );

        if (!pipelineResult.success) {
            throw new Error(pipelineResult.error || 'Content pipeline failed');
        }

        if (signal.aborted) throw new Error('Operation cancelled');

        await context.sendMessage('storefront-setup-progress', {
            phase: 'content-publish',
            message: pipelineResult.libraryPaths.length > 0 ? 'Site is live!' : 'Content publish complete',
            progress: 90,
        });

        return { success: true, ...repoInfo };
    } catch (error) {
        logger.error(`[Storefront Setup] Failed: ${(error as Error).message}`);
        return { success: false, error: (error as Error).message, ...repoInfo };
    }
}

/**
 * Create CleanupService with all required dependencies
 *
 * @param context - Handler context for services
 * @returns Configured CleanupService
 */
async function createCleanupService(context: HandlerContext): Promise<CleanupService> {
    // Create service dependencies
    const githubTokenService = new GitHubTokenService(context.context.secrets, context.logger);
    const githubRepoOps = new GitHubRepoOperations(githubTokenService, context.logger);

    // Create TokenProvider adapter from AuthenticationService if available
    const tokenProvider = createDaLiveTokenProvider(context.authManager);

    const daLiveOrgOps = new DaLiveOrgOperations(tokenProvider, context.logger);

    // HelixService requires AuthenticationService
    if (!context.authManager) {
        throw new Error('AuthenticationService required for cleanup');
    }

    // IMPORTANT: HelixService also needs DA.live token provider for x-content-source-authorization
    // DA.live uses separate IMS auth from Adobe Console - must use DA.live token
    const daLiveAuthService = new DaLiveAuthService(context.context);
    const daLiveTokenProvider = {
        getAccessToken: async () => {
            return daLiveAuthService.getAccessToken();
        },
    };
    const _helixService = new HelixService(context.logger, githubTokenService, daLiveTokenProvider);

    const toolManager = new ToolManager(context.logger);
    const configurationService = new ConfigurationService(daLiveTokenProvider, context.logger);

    return new CleanupService(
        githubRepoOps,
        daLiveOrgOps,
        toolManager,
        context.logger,
        configurationService,
    );
}

// ==========================================================
// Backward Compatibility Exports
// ==========================================================

// Export type aliases for backward compatibility during migration
export type PreflightPartialState = StorefrontSetupPartialState;
