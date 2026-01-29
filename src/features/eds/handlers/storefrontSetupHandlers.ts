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
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { EdsMetadata, EdsCleanupOptions, GitHubRepo } from '../services/types';
import { GitHubAppNotInstalledError } from '../services/types';
import { CleanupService } from '../services/cleanupService';
import { GitHubRepoOperations } from '../services/githubRepoOperations';
import { GitHubFileOperations } from '../services/githubFileOperations';
import { GitHubTokenService } from '../services/githubTokenService';
import { GitHubAppService } from '../services/githubAppService';
import { DaLiveOrgOperations } from '../services/daLiveOrgOperations';
import { DaLiveContentOperations, createDaLiveTokenProvider } from '../services/daLiveContentOperations';
import { DaLiveAuthService } from '../services/daLiveAuthService';
import { HelixService } from '../services/helixService';
import { ToolManager } from '../services/toolManager';
import { generateFstabContent } from '../services/fstabGenerator';
import { bulkPreviewAndPublish } from './edsHelpers';

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
        // GitHub auth info from Connect Services step
        githubAuth?: {
            isAuthenticated?: boolean;
            user?: {
                login: string;
                name?: string;
                avatarUrl?: string;
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
    if (hasCreatedResources) {
        try {
            await context.sendMessage('storefront-setup-progress', {
                phase: 'cancelling',
                message: 'Cleaning up resources...',
                progress: 0,
            });

            const cleanupResult = await cleanupStorefrontSetupResources(
                context,
                partialState!,
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
    payload?: StorefrontSetupStartPayload,
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
    projectName: string,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    componentConfigs: StorefrontSetupStartPayload['componentConfigs'],
    backendComponentId: string | undefined,
    signal: AbortSignal,
): Promise<StorefrontSetupResult> {
    const logger = context.logger;

    // Create service dependencies
    const githubTokenService = new GitHubTokenService(context.context.secrets, logger);
    const githubRepoOps = new GitHubRepoOperations(githubTokenService, logger);
    const githubFileOps = new GitHubFileOperations(githubTokenService, logger);
    const githubAppService = new GitHubAppService(githubTokenService, logger);

    // Create TokenProvider adapter for DA.live operations
    const tokenProvider = createDaLiveTokenProvider(context.authManager);

    const daLiveOrgOps = new DaLiveOrgOperations(tokenProvider, logger);
    const daLiveContentOps = new DaLiveContentOperations(tokenProvider, logger);

    // Create HelixService for CDN operations (code preview, content publish)
    // Uses GitHub token for admin API auth and DA.live token for x-content-source-authorization
    const daLiveAuthService = new DaLiveAuthService(context.context);
    const daLiveTokenProvider = {
        getAccessToken: async () => {
            return await daLiveAuthService.getAccessToken();
        },
    };
    const helixService = new HelixService(logger, githubTokenService, daLiveTokenProvider);

    // Derive skipContent from user selections:
    // - If using an EXISTING site (selectedSite exists) AND not resetting content → skip content copy
    // - If creating a NEW site OR resetting existing site → copy content
    const isUsingExistingSite = Boolean(edsConfig.selectedSite);
    const wantsToResetContent = Boolean(edsConfig.resetSiteContent);
    const skipContent = isUsingExistingSite && !wantsToResetContent;

    // Create a modified config with the derived skipContent value
    const resolvedEdsConfig = {
        ...edsConfig,
        skipContent,
    };

    // Log content handling decision with full context for debugging
    logger.info(`[Storefront Setup] Content handling decision:`);
    logger.info(`  - selectedSite: ${edsConfig.selectedSite ? JSON.stringify(edsConfig.selectedSite) : 'undefined (new site)'}`);
    logger.info(`  - resetSiteContent: ${edsConfig.resetSiteContent ?? 'undefined (default false)'}`);
    logger.info(`  - isUsingExistingSite: ${isUsingExistingSite}`);
    logger.info(`  - wantsToResetContent: ${wantsToResetContent}`);
    logger.info(`  - RESULT skipContent: ${skipContent} (${skipContent ? 'will SKIP content copy' : 'will COPY content'})`);

    // GitHub owner can come from explicit githubOwner or from githubAuth.user.login
    // The UI stores it at githubAuth.user.login when authenticated via Connect Services
    const githubOwner = edsConfig.githubOwner || edsConfig.githubAuth?.user?.login;
    if (!githubOwner) {
        logger.error('[Storefront Setup] GitHub owner not found. edsConfig:', JSON.stringify(edsConfig, null, 2));
        return {
            success: false,
            error: 'GitHub owner not configured. Please complete GitHub authentication.',
        };
    }
    logger.info(`[Storefront Setup] Using GitHub owner: ${githubOwner}`);

    // Get template info from edsConfig (set during wizard flow)
    const templateOwner = edsConfig.templateOwner;
    const templateRepo = edsConfig.templateRepo;

    if (!templateOwner || !templateRepo) {
        logger.error('[Storefront Setup] Template not configured. edsConfig:', JSON.stringify(edsConfig, null, 2));
        return {
            success: false,
            error: 'GitHub template not configured. Please check your stack configuration.',
        };
    }

    // Validate content source if content copy is needed
    const contentSource = edsConfig.contentSource;
    if (!resolvedEdsConfig.skipContent && !contentSource) {
        logger.error('[Storefront Setup] Content source not configured. edsConfig:', JSON.stringify(edsConfig, null, 2));
        return {
            success: false,
            error: 'DA.live content source not configured. Please check your stack configuration.',
        };
    }

    let repoUrl: string | undefined;
    let repoOwner: string = githubOwner;
    let repoName: string = edsConfig.repoName;

    // Determine if using existing repo
    const repoMode = edsConfig.repoMode || 'new';
    const useExistingRepo = repoMode === 'existing' && (edsConfig.selectedRepo || edsConfig.existingRepo);
    // Check if repo was pre-created in GitHubRepoSelectionStep (new flow)
    const usePreCreatedRepo = repoMode === 'new' && !!edsConfig.createdRepo;

    try {
        // ============================================
        // Phase 1: GitHub Repository Setup
        // ============================================
        if (usePreCreatedRepo && edsConfig.createdRepo) {
            // Repository was already created in GitHubRepoSelectionStep
            // Just use the info and skip creation
            repoOwner = edsConfig.createdRepo.owner;
            repoName = edsConfig.createdRepo.name;
            repoUrl = edsConfig.createdRepo.url;

            logger.info(`[Storefront Setup] Using pre-created repository: ${repoOwner}/${repoName}`);

            await context.sendMessage('storefront-setup-progress', {
                phase: 'github-repo',
                message: `Using repository: ${repoOwner}/${repoName}`,
                progress: 15,
                repoUrl,
                repoOwner,
                repoName,
            });
        } else if (useExistingRepo) {
            // Use existing repository
            if (edsConfig.selectedRepo) {
                // Parse from selectedRepo (newer format)
                const [owner, name] = edsConfig.selectedRepo.fullName.split('/');
                repoOwner = owner;
                repoName = name;
                repoUrl = edsConfig.selectedRepo.htmlUrl;
            } else if (edsConfig.existingRepo) {
                // Parse from existingRepo string (legacy format: owner/repo)
                const [owner, name] = edsConfig.existingRepo.split('/');
                repoOwner = owner;
                repoName = name;
                repoUrl = `https://github.com/${edsConfig.existingRepo}`;
            }

            logger.info(`[Storefront Setup] Using existing repository: ${repoOwner}/${repoName}`);

            await context.sendMessage('storefront-setup-progress', {
                phase: 'github-repo',
                message: `Using existing repository: ${repoOwner}/${repoName}`,
                progress: 5,
                repoUrl,
                repoOwner,
                repoName,
            });

            // If resetToTemplate is set, reset the repo to match template
            // Uses Git Tree API for atomic reset (~4 API calls vs 4000+ for file-by-file)
            if (edsConfig.resetToTemplate) {
                logger.info('[Storefront Setup] Resetting repository to template...');
                await context.sendMessage('storefront-setup-progress', {
                    phase: 'github-repo',
                    message: 'Resetting repository to template...',
                    progress: 6,
                });

                await githubRepoOps.resetToTemplate(
                    repoOwner,
                    repoName,
                    templateOwner,
                    templateRepo,
                    'main',
                    'chore: reset to template',
                );

                logger.info('[Storefront Setup] Repository reset to template');
            }

            await context.sendMessage('storefront-setup-progress', {
                phase: 'github-repo',
                message: 'Repository ready',
                progress: 15,
                repoUrl,
                repoOwner,
                repoName,
            });
        } else {
            // Create new repository from template
            await context.sendMessage('storefront-setup-progress', {
                phase: 'github-repo',
                message: 'Creating GitHub repository from template...',
                progress: 5,
            });

            logger.info(`[Storefront Setup] Creating repository: ${repoName}`);

            const repo = await githubRepoOps.createFromTemplate(
                templateOwner,
                templateRepo,
                repoName,
                edsConfig.isPrivate ?? false,
            );

            repoUrl = repo.htmlUrl;
            // Parse owner from fullName (format: owner/repo)
            const [owner, name] = repo.fullName.split('/');
            repoOwner = owner;
            repoName = name;

            logger.info(`[Storefront Setup] Repository created: ${repoUrl}`);

            // Wait for template content to be populated
            await context.sendMessage('storefront-setup-progress', {
                phase: 'github-repo',
                message: 'Waiting for repository content...',
                progress: 10,
                repoUrl,
                repoOwner,
                repoName,
            });

            await githubRepoOps.waitForContent(repoOwner, repoName, signal);

            await context.sendMessage('storefront-setup-progress', {
                phase: 'github-repo',
                message: 'Repository ready',
                progress: 15,
                repoUrl,
                repoOwner,
                repoName,
            });
        }

        // ============================================
        // Phase 2: Helix Configuration
        // ============================================
        await context.sendMessage('storefront-setup-progress', {
            phase: 'helix-config',
            message: 'Configuring Edge Delivery Services...',
            progress: 20,
        });

        // Generate fstab.yaml content using centralized generator (single source of truth)
        const fstabContent = generateFstabContent({
            daLiveOrg: edsConfig.daLiveOrg,
            daLiveSite: edsConfig.daLiveSite,
        });

        // Push fstab.yaml to GitHub
        await context.sendMessage('storefront-setup-progress', {
            phase: 'helix-config',
            message: 'Pushing fstab.yaml configuration...',
            progress: 25,
        });

        // Check if fstab.yaml already exists (to get SHA for update)
        const existingFstab = await githubFileOps.getFileContent(repoOwner, repoName, 'fstab.yaml');
        const fstabSha = existingFstab?.sha;

        await githubFileOps.createOrUpdateFile(
            repoOwner,
            repoName,
            'fstab.yaml',
            fstabContent,
            'chore: configure fstab.yaml for DA.live content source',
            fstabSha,
        );

        logger.info('[Storefront Setup] fstab.yaml pushed to GitHub');

        // ============================================
        // Phase 2.5: GitHub App Check (EXISTING repos only)
        // ============================================
        // For EXISTING repos, check GitHub App AFTER fstab.yaml push
        // Helix now knows about the repo (via fstab.yaml), so the check will work correctly
        // NEW repos already verified the app in GitHubRepoSelectionStep
        if (useExistingRepo) {
            await context.sendMessage('storefront-setup-progress', {
                phase: 'helix-config',
                message: 'Verifying GitHub App installation...',
                progress: 28,
            });

            logger.info(`[Storefront Setup] Checking GitHub App for existing repo: ${repoOwner}/${repoName}`);

            const { isInstalled, codeStatus } = await githubAppService.isAppInstalled(repoOwner, repoName);

            if (!isInstalled) {
                const installUrl = githubAppService.getInstallUrl(repoOwner, repoName);
                logger.info(`[Storefront Setup] GitHub App not installed. Install URL: ${installUrl}`);

                // Notify UI to show GitHub App install dialog
                await context.sendMessage('storefront-setup-github-app-required', {
                    owner: repoOwner,
                    repo: repoName,
                    installUrl,
                    message: 'The AEM Code Sync GitHub App must be installed to continue.',
                });

                // Return early - UI will resume after app installation
                return {
                    success: false,
                    error: 'GitHub App installation required',
                    repoUrl,
                    repoOwner,
                    repoName,
                };
            }

            logger.info(`[Storefront Setup] GitHub App verified for existing repo (code.status: ${codeStatus})`);
        }

        // ============================================
        // Phase 2b: Apply Template Patches
        // ============================================
        // Apply patches from demo-packages.json (e.g., header-nav-tools-defensive)
        // These fix issues with the template code for specific configurations
        // Track patched code paths for later publish to live CDN (declared outside if block)
        let patchedCodePaths: string[] = [];

        if (edsConfig.patches && edsConfig.patches.length > 0) {
            await context.sendMessage('storefront-setup-progress', {
                phase: 'helix-config',
                message: 'Applying template patches...',
                progress: 30,
            });

            const { applyTemplatePatches } = await import('../services/templatePatchRegistry');

            // Create fileOverrides map to collect patched content
            const fileOverrides = new Map<string, string>();

            const patchResults = await applyTemplatePatches(
                templateOwner,
                templateRepo,
                edsConfig.patches,
                fileOverrides,
                logger,
            );

            // Log patch results and collect patched file paths for later publish
            const { getAppliedPatchPaths } = await import('./edsHelpers');
            patchedCodePaths = getAppliedPatchPaths(patchResults);

            for (const result of patchResults) {
                if (result.applied) {
                    logger.info(`[Storefront Setup] Patch '${result.patchId}' applied to ${result.filePath}`);
                } else {
                    logger.warn(`[Storefront Setup] Patch '${result.patchId}' not applied: ${result.reason}`);
                }
            }

            // Push patched files to GitHub
            for (const [filePath, content] of fileOverrides) {
                // Check if file already exists (to get SHA for update)
                const existingFile = await githubFileOps.getFileContent(repoOwner, repoName, filePath);
                const fileSha = existingFile?.sha;

                await githubFileOps.createOrUpdateFile(
                    repoOwner,
                    repoName,
                    filePath,
                    content,
                    `chore: apply template patch for ${filePath}`,
                    fileSha,
                );

                logger.info(`[Storefront Setup] Pushed patched file: ${filePath}`);
            }

            logger.info(`[Storefront Setup] Template patches applied: ${patchResults.filter((r: { applied: boolean }) => r.applied).length}/${patchResults.length}`);
        }

        // NOTE: config.json generation moved to executor Phase 4/5
        // Phase 4 generates config.json locally with mesh endpoint (via generateEdsConfigJson)
        // Phase 5 syncs config.json to GitHub and publishes to CDN (via syncConfigToRemote)
        // This consolidation ensures config.json always has the mesh endpoint and is only pushed once

        await context.sendMessage('storefront-setup-progress', {
            phase: 'helix-config',
            message: 'Helix configured',
            progress: 35,
        });

        // ============================================
        // Phase 3: Code Sync Verification
        // ============================================
        await context.sendMessage('storefront-setup-progress', {
            phase: 'code-sync',
            message: 'Verifying code synchronization...',
            progress: 40,
        });

        try {
            // Poll for code sync
            const codeUrl = `https://admin.hlx.page/code/${repoOwner}/${repoName}/main/scripts/aem.js`;
            let syncVerified = false;
            const maxAttempts = 25;
            const pollInterval = 2000;

            for (let attempt = 0; attempt < maxAttempts && !syncVerified; attempt++) {
                if (signal.aborted) {
                    throw new Error('Operation cancelled');
                }

                try {
                    const response = await fetch(codeUrl, {
                        method: 'GET',
                        signal: AbortSignal.timeout(5000),
                    });
                    if (response.ok) {
                        syncVerified = true;
                    }
                } catch {
                    // Continue polling
                }

                if (!syncVerified && attempt < maxAttempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                }
            }

            if (!syncVerified) {
                // Code sync not yet complete - check if GitHub App is installed
                const { isInstalled, codeStatus } = await githubAppService.isAppInstalled(repoOwner, repoName);

                if (!isInstalled) {
                    const installUrl = githubAppService.getInstallUrl(repoOwner, repoName);
                    logger.info(`[Storefront Setup] GitHub App not installed. Install URL: ${installUrl}`);

                    // Notify UI to show GitHub App install dialog
                    await context.sendMessage('storefront-setup-github-app-required', {
                        owner: repoOwner,
                        repo: repoName,
                        installUrl,
                        message: 'The AEM Code Sync GitHub App must be installed to continue.',
                    });

                    // Return early - UI will resume after app installation
                    return {
                        success: false,
                        error: 'GitHub App installation required',
                        repoUrl,
                        repoOwner,
                        repoName,
                    };
                }

                // App is installed - sync will complete eventually, continue setup
                if (codeStatus === 400) {
                    // Status 400 = sync initializing, this is normal for new repos
                    logger.info('[Storefront Setup] Code sync in progress (initializing), continuing...');
                } else {
                    // Status 200 but file not found, or other status - unexpected but not fatal
                    logger.warn(`[Storefront Setup] Code sync status unclear (code.status: ${codeStatus}), continuing...`);
                }
            } else {
                logger.info('[Storefront Setup] Code sync verified');
            }
        } catch (error) {
            if ((error as Error).message === 'GitHub App installation required') {
                throw error;
            }
            throw new Error(`Code sync failed: ${(error as Error).message}`);
        }

        await context.sendMessage('storefront-setup-progress', {
            phase: 'code-sync',
            message: 'Code synchronized',
            progress: 42,
        });

        // ============================================
        // Phase 3b: Publish Code to CDN
        // ============================================
        // Code sync only makes code accessible via admin.hlx.page/code
        // We need to POST to actually publish code to the CDN (aem.live)
        await context.sendMessage('storefront-setup-progress', {
            phase: 'code-sync',  // Use code-sync (code-publish not a valid UI phase)
            message: 'Publishing code to CDN...',
            progress: 43,
        });

        try {
            // Preview all code files (/* wildcard) to publish to CDN
            await helixService.previewCode(repoOwner, repoName, '/*', 'main');
            logger.info('[Storefront Setup] Code published to CDN');
        } catch (error) {
            // Code preview failure is not fatal - site may still work, just with stale code
            logger.warn(`[Storefront Setup] Code preview warning: ${(error as Error).message}`);
        }

        await context.sendMessage('storefront-setup-progress', {
            phase: 'code-sync',
            message: 'Code synchronized',
            progress: 45,
        });

        // ============================================
        // Phase 4: DA.live Content Population
        // ============================================
        // Track library paths for explicit publishing (may be missed by publishAllSiteContent)
        let libraryPaths: string[] = [];

        if (resolvedEdsConfig.skipContent) {
            // Skip content copy when using existing content
            logger.info('[Storefront Setup] Skipping DA.live content copy (skipContent=true)');
            await context.sendMessage('storefront-setup-progress', {
                phase: 'content-copy',
                message: 'Using existing DA.live content',
                progress: 60,
            });
        } else {
            await context.sendMessage('storefront-setup-progress', {
                phase: 'content-copy',
                message: 'Populating DA.live content...',
                progress: 50,
            });

            logger.info(`[Storefront Setup] Copying content from ${contentSource!.org}/${contentSource!.site} to ${edsConfig.daLiveOrg}/${edsConfig.daLiveSite}`);

            // Build full content source with index URL from explicit config
            const indexPath = contentSource!.indexPath || '/full-index.json';
            const fullContentSource = {
                org: contentSource!.org,
                site: contentSource!.site,
                indexUrl: `https://main--${contentSource!.site}--${contentSource!.org}.aem.live${indexPath}`,
            };

            const contentResult = await daLiveContentOps.copyContentFromSource(
                fullContentSource,
                edsConfig.daLiveOrg,
                edsConfig.daLiveSite,
                (progress) => {

                    // Scale progress from 50% to 60% during content copy
                    const progressValue = 50 + Math.round(progress.percentage * 0.10);
                    // Use custom message if provided (during initialization), otherwise show file count
                    const statusMessage = progress.message || `Copying content (${progress.processed}/${progress.total})`;
                    context.sendMessage('storefront-setup-progress', {
                        phase: 'content-copy',
                        message: statusMessage,
                        subMessage: progress.currentFile,
                        progress: progressValue,
                    });
                },
                edsConfig.contentPatches,
            );

            if (!contentResult.success) {
                throw new Error(`Content copy failed: ${contentResult.failedFiles.length} files failed`);
            }

            logger.info(`[Storefront Setup] DA.live content populated: ${contentResult.totalFiles} files`);

            await context.sendMessage('storefront-setup-progress', {
                phase: 'content-copy',
                message: 'Content populated',
                progress: 60,
            });

            // ============================================
            // Phase 4b: Configure Block Library (non-blocking)
            // ============================================
            await context.sendMessage('storefront-setup-progress', {
                phase: 'content-copy',
                message: 'Configuring block library...',
                progress: 61,
            });

            const libResult = await daLiveContentOps.createBlockLibraryFromTemplate(
                edsConfig.daLiveOrg,
                edsConfig.daLiveSite,
                templateOwner,
                templateRepo,
                (owner, repo, path) => githubFileOps.getFileContent(owner, repo, path),
            );
            if (libResult.blocksCount > 0) {
                logger.info(`[Storefront Setup] Block library: ${libResult.blocksCount} blocks configured`);
                await context.sendMessage('storefront-setup-progress', {
                    phase: 'content-copy',
                    message: `Block library configured (${libResult.blocksCount} blocks)`,
                    progress: 62,
                });
            }

            // Store library paths for explicit publishing later
            libraryPaths = libResult.paths;
        }

        // ============================================
        // Phase 5: Publish Content to CDN
        // ============================================
        // This makes the site LIVE and viewable
        if (!resolvedEdsConfig.skipContent) {
            await context.sendMessage('storefront-setup-progress', {
                phase: 'content-publish',
                message: 'Publishing content to CDN...',
                progress: 65,
            });

            logger.info(`[Storefront Setup] Publishing content to CDN for ${repoOwner}/${repoName}`);

            try {
                // Progress callback to report publish status to UI
                // Scale from 65% (start) to 90% (end) of overall progress
                const onPublishProgress = (info: {
                    phase: string;
                    message: string;
                    current?: number;
                    total?: number;
                    currentPath?: string;
                }) => {
                    // Calculate progress within the 65-90% range
                    let progressValue = 65;
                    if (info.total && info.current) {
                        progressValue = 65 + Math.round((info.current / info.total) * 25);
                    }

                    context.sendMessage('storefront-setup-progress', {
                        phase: 'content-publish',
                        message: info.message,
                        subMessage: info.currentPath,
                        progress: progressValue,
                    });
                };

                await helixService.publishAllSiteContent(
                    `${repoOwner}/${repoName}`,
                    'main',
                    undefined,
                    undefined,
                    onPublishProgress,
                );

                // Bulk publish block library paths (may be missed due to .da folder)
                if (libraryPaths.length > 0) {
                    await context.sendMessage('storefront-setup-progress', {
                        phase: 'content-publish',
                        message: 'Publishing block library...',
                        progress: 88,
                    });

                    try {
                        await bulkPreviewAndPublish(helixService, repoOwner, repoName, libraryPaths, logger);
                        // Note: Block library CDN verification happens in Phase 5 (syncConfigToRemote)
                        // alongside config.json verification for efficiency
                    } catch (libPublishError) {
                        // Non-fatal - library config was created, publishing can be retried
                        logger.debug(`[Storefront Setup] Block library publish failed: ${(libPublishError as Error).message}`);
                    }
                }

                logger.info('[Storefront Setup] Content published to CDN successfully');

                // Publish patched code files to live CDN
                const { publishPatchedCodeToLive } = await import('./edsHelpers');
                await publishPatchedCodeToLive(helixService, repoOwner, repoName, patchedCodePaths, logger);
            } catch (error) {
                throw new Error(`Failed to publish content to CDN: ${(error as Error).message}`);
            }

            await context.sendMessage('storefront-setup-progress', {
                phase: 'content-publish',
                message: 'Site is live!',
                progress: 90,
            });
        } else {
            // Skip publish when content was skipped
            logger.info('[Storefront Setup] Skipping content publish (skipContent=true)');
            await context.sendMessage('storefront-setup-progress', {
                phase: 'content-publish',
                message: 'Content publish skipped',
                progress: 90,
            });
        }

        // NOTE: Frontend availability verification removed
        // The HTTP 200 check was misleading - site can return 200 but show
        // "Configuration Error" because config.json doesn't exist yet.
        // The reliable "site ready" indicator is the config.json verification
        // in Phase 5 of the executor (syncConfigToRemote), which validates
        // the commerce-endpoint field exists in the config.

        // ============================================
        // Complete
        // ============================================
        return {
            success: true,
            repoUrl,
            repoOwner,
            repoName,
        };
    } catch (error) {
        logger.error(`[Storefront Setup] Failed: ${(error as Error).message}`);
        return {
            success: false,
            error: (error as Error).message,
            repoUrl,
            repoOwner,
            repoName,
        };
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
            return await daLiveAuthService.getAccessToken();
        },
    };
    const helixService = new HelixService(context.logger, githubTokenService, daLiveTokenProvider);

    const toolManager = new ToolManager(context.logger);

    return new CleanupService(
        githubRepoOps,
        daLiveOrgOps,
        helixService,
        toolManager,
        context.logger,
    );
}

// ==========================================================
// Backward Compatibility Exports
// ==========================================================

// Export type aliases for backward compatibility during migration
export type PreflightPartialState = StorefrontSetupPartialState;
