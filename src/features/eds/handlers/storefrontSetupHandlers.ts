/**
 * Storefront Setup Handlers
 *
 * Message handlers for storefront setup wizard step operations.
 * Manages GitHub repo creation, DA.live content population, and Helix configuration
 * during the storefront-setup step, including cancel/cleanup handling.
 *
 * Phase execution logic lives in storefrontSetupPhases.ts.
 *
 * Renamed from edsPreflightHandlers.ts to better reflect the step's purpose.
 *
 * @module features/eds/handlers/storefrontSetupHandlers
 */

import * as vscode from 'vscode';
import { hasMeshInDependencies } from '@/core/constants';
import { CleanupService } from '../services/cleanupService';
import { ConfigurationService } from '../services/configurationService';
import { createDaLiveTokenProvider, createDaLiveServiceTokenProvider } from '../services/daLiveContentOperations';
import { DaLiveOrgOperations } from '../services/daLiveOrgOperations';
import { GitHubRepoOperations } from '../services/githubRepoOperations';
import { GitHubTokenService } from '../services/githubTokenService';
import { ToolManager } from '../services/toolManager';
import type { EdsMetadata, EdsCleanupOptions } from '../services/types';
import { ensureDaLiveAuth, getDaLiveAuthService } from './edsHelpers';
import { executeStorefrontSetupPhases } from './storefrontSetupPhases';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
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
export interface StorefrontSetupStartPayload {
    projectName: string;
    /** Component configurations for config.json generation */
    componentConfigs?: Record<string, Record<string, string | boolean | number | undefined>>;
    /** Backend component ID for environment-aware config generation */
    backendComponentId?: string;
    /** Effective component dependencies (stack deps + user-selected optional deps) */
    dependencies?: string[];
    /** Selected addon IDs (e.g., ['adobe-commerce-aco']) */
    selectedAddons?: string[];
    /** Selected block library IDs (e.g., ['isle5', 'demo-team-blocks']) */
    selectedBlockLibraries?: string[];
    /** Selected feature pack IDs (e.g., ['b2b-commerce']) */
    selectedFeaturePacks?: string[];
    /** Custom block libraries added by URL */
    customBlockLibraries?: CustomBlockLibrary[];
    /** Selected package ID (e.g., 'citisignal') */
    selectedPackage?: string;
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

    // Pre-flight: Check Adobe I/O authentication when mesh is included
    const needsMesh = hasMeshInDependencies(payload.dependencies ?? []);
    if (needsMesh) {
        if (!context.authManager) {
            context.logger.error('[Storefront Setup] AuthenticationService not available');
            await context.sendMessage('storefront-setup-error', {
                message: 'Authentication required',
                error: 'Please authenticate with Adobe before starting storefront setup',
            });
            return { success: false, error: 'AuthenticationService not available' };
        }

        const adobeResult = await ensureAdobeIOAuth({
            authManager: context.authManager,
            logger: context.logger,
            logPrefix: '[Storefront Setup]',
            warningMessage: 'Adobe sign-in required for storefront setup.',
        });
        if (!adobeResult.authenticated) {
            await context.sendMessage('storefront-setup-error', {
                message: 'Authentication required',
                error: adobeResult.cancelled
                    ? 'Adobe sign-in was cancelled.'
                    : 'Adobe sign-in failed. Please try again.',
            });
            return { success: false, error: 'Adobe authentication required' };
        }
    } else {
        context.logger.info('[Storefront Setup] No mesh selected — skipping Adobe I/O auth check');
    }

    // Pre-flight: Check DA.live authentication (with inline re-auth)
    const daLiveResult = await ensureDaLiveAuth(context, '[Storefront Setup]');
    if (!daLiveResult.authenticated) {
        await context.sendMessage('storefront-setup-error', {
            message: 'DA.live authentication expired',
            error: daLiveResult.cancelled
                ? 'DA.live sign-in was cancelled.'
                : (daLiveResult.error || 'Your DA.live session has expired.'),
        });
        return { success: false, error: 'DA.live authentication required' };
    }

    try {
        // Execute storefront setup phases
        const result = await executeStorefrontSetupPhases(
            context,
            edsConfig,
            abortController.signal,
            {
                selectedBlockLibraries: payload.selectedBlockLibraries,
                customBlockLibraries: payload.customBlockLibraries,
                packageId: payload.selectedPackage,
                selectedFeaturePacks: payload.selectedFeaturePacks,
            },
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

    // TODO: Re-enter the storefront setup pipeline from the code-sync phase.
    // Implement by re-invoking executePhaseCodeSync with the stored abort signal and edsConfig.
    // Until then, return failure so the UI surfaces the incomplete state rather than
    // silently claiming success.
    await context.sendMessage('storefront-setup-error', {
        message: 'Resume not yet supported',
        error: 'Please restart the storefront setup from the beginning after installing the GitHub App.',
    });

    return { success: false, error: 'Setup resume is not yet implemented' };
}

// ==========================================================
// Helper Functions
// ==========================================================

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
 * Create CleanupService with all required dependencies
 *
 * @param context - Handler context for services
 * @returns Configured CleanupService
 */
async function createCleanupService(context: HandlerContext): Promise<CleanupService> {
    // Fail fast — all downstream services require AuthenticationService
    if (!context.authManager) {
        throw new Error('AuthenticationService required for cleanup');
    }

    // Create service dependencies
    const githubTokenService = new GitHubTokenService(context.context.secrets, context.logger);
    const githubRepoOps = new GitHubRepoOperations(githubTokenService, context.logger);

    // Create TokenProvider adapter from AuthenticationService if available
    const tokenProvider = createDaLiveTokenProvider(context.authManager);

    const daLiveOrgOps = new DaLiveOrgOperations(tokenProvider, context.logger);

    // IMPORTANT: HelixService also needs DA.live token provider for x-content-source-authorization
    // DA.live uses separate IMS auth from Adobe Console - must use DA.live token
    const daLiveAuthService = getDaLiveAuthService(context.context);
    const daLiveTokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
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

