/**
 * EDS Preflight Handlers
 *
 * Message handlers for EDS preflight wizard step operations.
 * Manages GitHub repo creation, DA.live content population, and Helix configuration
 * during the preflight step, including cancel/cleanup handling.
 *
 * @module features/eds/handlers/edsPreflightHandlers
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
import { DaLiveContentOperations } from '../services/daLiveContentOperations';
import { HelixService } from '../services/helixService';
import { ToolManager } from '../services/toolManager';
import {
    GitHubRepoPhase,
    HelixConfigPhase,
    ContentPhase,
    generatePreviewUrl,
    generateLiveUrl,
} from '../services/edsSetupPhases';

// ==========================================================
// Types
// ==========================================================

/**
 * Partial state tracking for preflight operations
 * Tracks which resources have been created for cleanup on cancel
 */
export interface PreflightPartialState {
    repoCreated: boolean;
    repoUrl?: string;
    repoOwner?: string;
    repoName?: string;
    contentCopied: boolean;
    phase: string;
}

/**
 * Payload for eds-preflight-start message
 */
interface EdsPreflightStartPayload {
    projectName: string;
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
        // Selected existing repository (from searchable list)
        selectedRepo?: {
            name: string;
            fullName: string;
            htmlUrl: string;
            isPrivate?: boolean;
        };
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
 * Payload for eds-preflight-cancel message
 */
interface EdsPreflightCancelPayload {
    partialState?: PreflightPartialState;
    edsConfig?: {
        daLiveOrg?: string;
        daLiveSite?: string;
    };
}

// ==========================================================
// Handlers
// ==========================================================

/**
 * Handle cancel request for EDS preflight operations
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
export async function handleCancelEdsPreflight(
    context: HandlerContext,
    payload?: EdsPreflightCancelPayload,
): Promise<HandlerResponse> {
    const partialState = payload?.partialState;
    const edsConfig = payload?.edsConfig;

    context.logger.info('[EDS Preflight] Cancel requested');

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
            context.logger.debug('[EDS Preflight] Cancel aborted by user');
            await context.sendMessage('eds-preflight-cancel-aborted', {});
            return { success: true };
        }
    }

    // Abort any running operations
    const abortController = context.sharedState.edsPreflightAbortController as AbortController | undefined;
    if (abortController) {
        context.logger.debug('[EDS Preflight] Aborting running operations');
        abortController.abort();
        context.sharedState.edsPreflightAbortController = undefined;
    }

    // Clean up created resources
    if (hasCreatedResources) {
        try {
            await context.sendMessage('eds-preflight-progress', {
                phase: 'cancelling',
                message: 'Cleaning up resources...',
                progress: 0,
            });

            const cleanupResult = await cleanupPreflightResources(
                context,
                partialState!,
                edsConfig,
            );

            if (cleanupResult.success) {
                context.logger.info('[EDS Preflight] Cleanup completed successfully');
            } else {
                context.logger.warn('[EDS Preflight] Cleanup completed with errors:', cleanupResult.error);
            }
        } catch (error) {
            // Log error but don't fail - cleanup is best effort
            context.logger.error('[EDS Preflight] Cleanup failed', error as Error);
        }
    }

    await context.sendMessage('eds-preflight-cancelled', {});
    return { success: true };
}

/**
 * Handle start request for EDS preflight operations
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
 * @returns Success with preflight results
 */
export async function handleStartEdsPreflight(
    context: HandlerContext,
    payload?: EdsPreflightStartPayload,
): Promise<HandlerResponse> {
    if (!payload?.projectName || !payload?.edsConfig) {
        context.logger.error('[EDS Preflight] Missing required parameters');
        await context.sendMessage('eds-preflight-error', {
            message: 'Missing required parameters',
            error: 'Project name and EDS config are required',
        });
        return { success: false, error: 'Missing required parameters' };
    }

    const { projectName, edsConfig } = payload;
    context.logger.info(`[EDS Preflight] Starting for project: ${projectName}`);

    // Create AbortController for cancel support
    const abortController = new AbortController();
    context.sharedState.edsPreflightAbortController = abortController;

    // Check if AuthenticationService is available
    if (!context.authManager) {
        context.logger.error('[EDS Preflight] AuthenticationService not available');
        await context.sendMessage('eds-preflight-error', {
            message: 'Authentication required',
            error: 'Please authenticate with Adobe before starting EDS setup',
        });
        return { success: false, error: 'AuthenticationService not available' };
    }

    try {
        // Execute preflight phases
        const result = await executePreflightPhases(context, projectName, edsConfig, abortController.signal);

        if (result.success) {
            context.logger.info(`[EDS Preflight] Complete: ${result.repoUrl}`);
            await context.sendMessage('eds-preflight-complete', {
                message: 'EDS setup completed successfully!',
                githubRepo: result.repoUrl,
                daLiveSite: `https://da.live/${edsConfig.daLiveOrg}/${edsConfig.daLiveSite}`,
                repoOwner: result.repoOwner,
                repoName: result.repoName,
                previewUrl: result.previewUrl,
                liveUrl: result.liveUrl,
            });
            return { success: true, data: result };
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error(`[EDS Preflight] Failed: ${errorMessage}`);
        await context.sendMessage('eds-preflight-error', {
            message: 'EDS setup failed',
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    } finally {
        context.sharedState.edsPreflightAbortController = undefined;
    }
}

/**
 * Handle resume request after GitHub App installation
 *
 * @param context - Handler context
 * @param payload - Resume payload
 * @returns Success
 */
export async function handleResumeEdsPreflight(
    context: HandlerContext,
    payload?: EdsPreflightStartPayload,
): Promise<HandlerResponse> {
    context.logger.info('[EDS Preflight] Resume requested after GitHub App installation');

    // Continue from code-sync phase
    await context.sendMessage('eds-preflight-progress', {
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
 * Clean up resources created during preflight
 *
 * @param context - Handler context
 * @param partialState - Tracking state of created resources
 * @param edsConfig - EDS configuration for DA.live info
 * @returns Cleanup result
 */
async function cleanupPreflightResources(
    context: HandlerContext,
    partialState: PreflightPartialState,
    edsConfig?: { daLiveOrg?: string; daLiveSite?: string },
): Promise<{ success: boolean; error?: string }> {
    context.logger.debug('[EDS Preflight] Starting resource cleanup');

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
            archiveInsteadOfDelete: false, // Full delete for preflight
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
 * Result of preflight phase execution
 */
interface PreflightResult {
    success: boolean;
    error?: string;
    repoUrl?: string;
    repoOwner?: string;
    repoName?: string;
    previewUrl?: string;
    liveUrl?: string;
}

/**
 * Execute all EDS preflight phases
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
 * @param signal - Abort signal for cancellation
 * @returns Preflight result with repo details
 */
async function executePreflightPhases(
    context: HandlerContext,
    projectName: string,
    edsConfig: EdsPreflightStartPayload['edsConfig'],
    signal: AbortSignal,
): Promise<PreflightResult> {
    const logger = context.logger;

    // Create service dependencies
    const githubTokenService = new GitHubTokenService(context.context.secrets, logger);
    const githubRepoOps = new GitHubRepoOperations(githubTokenService, logger);
    const githubFileOps = new GitHubFileOperations(githubTokenService, logger);
    const githubAppService = new GitHubAppService(githubTokenService, logger);

    // Create TokenProvider adapter for DA.live operations
    const tokenProvider = context.authManager ? {
        getAccessToken: async () => {
            const token = await context.authManager!.getTokenManager().getAccessToken();
            return token ?? null;
        },
    } : {
        getAccessToken: async () => null,
    };

    const daLiveOrgOps = new DaLiveOrgOperations(tokenProvider, logger);
    const daLiveContentOps = new DaLiveContentOperations(tokenProvider, logger);

    // GitHub owner can come from explicit githubOwner or from githubAuth.user.login
    // The UI stores it at githubAuth.user.login when authenticated via Connect Services
    const githubOwner = edsConfig.githubOwner || edsConfig.githubAuth?.user?.login;
    if (!githubOwner) {
        logger.error('[EDS Preflight] GitHub owner not found. edsConfig:', JSON.stringify(edsConfig, null, 2));
        return {
            success: false,
            error: 'GitHub owner not configured. Please complete GitHub authentication.',
        };
    }
    logger.info(`[EDS Preflight] Using GitHub owner: ${githubOwner}`);

    // Get template info from stack (hardcoded for now, should come from stack config)
    const templateOwner = 'hlxsites';
    const templateRepo = 'citisignal';

    let repoUrl: string | undefined;
    let repoOwner: string = githubOwner;
    let repoName: string = edsConfig.repoName;

    // Determine if using existing repo
    const repoMode = edsConfig.repoMode || 'new';
    const useExistingRepo = repoMode === 'existing' && (edsConfig.selectedRepo || edsConfig.existingRepo);

    try {
        // ============================================
        // Phase 1: GitHub Repository Setup
        // ============================================
        if (useExistingRepo) {
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

            logger.info(`[EDS Preflight] Using existing repository: ${repoOwner}/${repoName}`);

            await context.sendMessage('eds-preflight-progress', {
                phase: 'github-repo',
                message: `Using existing repository: ${repoOwner}/${repoName}`,
                progress: 5,
                repoUrl,
                repoOwner,
                repoName,
            });

            // If resetToTemplate is set, we need to reset the repo contents
            if (edsConfig.resetToTemplate) {
                logger.info('[EDS Preflight] Resetting repository to template...');
                await context.sendMessage('eds-preflight-progress', {
                    phase: 'github-repo',
                    message: 'Resetting repository to template...',
                    progress: 10,
                });
                // TODO: Implement reset to template functionality
                // For now, just proceed with existing content
            }

            await context.sendMessage('eds-preflight-progress', {
                phase: 'github-repo',
                message: 'Repository ready',
                progress: 15,
                repoUrl,
                repoOwner,
                repoName,
            });
        } else {
            // Create new repository from template
            await context.sendMessage('eds-preflight-progress', {
                phase: 'github-repo',
                message: 'Creating GitHub repository from template...',
                progress: 5,
            });

            logger.info(`[EDS Preflight] Creating repository: ${repoName}`);

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

            logger.info(`[EDS Preflight] Repository created: ${repoUrl}`);

            // Wait for template content to be populated
            await context.sendMessage('eds-preflight-progress', {
                phase: 'github-repo',
                message: 'Waiting for repository content...',
                progress: 10,
                repoUrl,
                repoOwner,
                repoName,
            });

            await githubRepoOps.waitForContent(repoOwner, repoName, signal);

            await context.sendMessage('eds-preflight-progress', {
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
        await context.sendMessage('eds-preflight-progress', {
            phase: 'helix-config',
            message: 'Configuring Edge Delivery Services...',
            progress: 20,
        });

        // Generate fstab.yaml content
        const fstabContent = `mountpoints:
  /: https://content.da.live/${edsConfig.daLiveOrg}/${edsConfig.daLiveSite}/
`;

        // Push fstab.yaml to GitHub
        await context.sendMessage('eds-preflight-progress', {
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

        logger.info('[EDS Preflight] fstab.yaml pushed to GitHub');

        await context.sendMessage('eds-preflight-progress', {
            phase: 'helix-config',
            message: 'Helix configured',
            progress: 35,
        });

        // ============================================
        // Phase 3: Code Sync Verification
        // ============================================
        await context.sendMessage('eds-preflight-progress', {
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
                // Code sync failed - check if GitHub App is installed
                const isInstalled = await githubAppService.isAppInstalled(repoOwner, repoName);

                if (!isInstalled) {
                    const installUrl = githubAppService.getInstallUrl(repoOwner, repoName);
                    logger.info(`[EDS Preflight] GitHub App not installed. Install URL: ${installUrl}`);

                    // Notify UI to show GitHub App install dialog
                    await context.sendMessage('eds-preflight-github-app-required', {
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

                throw new Error('Code sync verification timed out');
            }

            logger.info('[EDS Preflight] Code sync verified');
        } catch (error) {
            if ((error as Error).message === 'GitHub App installation required') {
                throw error;
            }
            throw new Error(`Code sync failed: ${(error as Error).message}`);
        }

        await context.sendMessage('eds-preflight-progress', {
            phase: 'code-sync',
            message: 'Code synchronized',
            progress: 45,
        });

        // ============================================
        // Phase 4: DA.live Content Population
        // ============================================
        if (edsConfig.skipContent) {
            // Skip content copy when using existing content
            logger.info('[EDS Preflight] Skipping DA.live content copy (skipContent=true)');
            await context.sendMessage('eds-preflight-progress', {
                phase: 'dalive-content',
                message: 'Using existing DA.live content',
                progress: 95,
            });
        } else {
            await context.sendMessage('eds-preflight-progress', {
                phase: 'dalive-content',
                message: 'Populating DA.live content...',
                progress: 50,
            });

            logger.info(`[EDS Preflight] Copying content to ${edsConfig.daLiveOrg}/${edsConfig.daLiveSite}`);

            const contentResult = await daLiveContentOps.copyCitisignalContent(
                edsConfig.daLiveOrg,
                edsConfig.daLiveSite,
                (progress) => {
                    const progressValue = 50 + Math.round(progress.percentage * 0.45);
                    context.sendMessage('eds-preflight-progress', {
                        phase: 'dalive-content',
                        message: `Copying content: ${progress.percentage}%`,
                        subMessage: progress.currentFile,
                        progress: progressValue,
                    });
                },
            );

            if (!contentResult.success) {
                throw new Error(`Content copy failed: ${contentResult.failedFiles.length} files failed`);
            }

            logger.info(`[EDS Preflight] DA.live content populated: ${contentResult.totalFiles} files`);

            await context.sendMessage('eds-preflight-progress', {
                phase: 'dalive-content',
                message: 'Content populated',
                progress: 95,
            });
        }

        // ============================================
        // Complete
        // ============================================
        return {
            success: true,
            repoUrl,
            repoOwner,
            repoName,
            previewUrl: generatePreviewUrl(repoOwner, repoName),
            liveUrl: generateLiveUrl(repoOwner, repoName),
        };
    } catch (error) {
        logger.error(`[EDS Preflight] Failed: ${(error as Error).message}`);
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
    const tokenProvider = context.authManager ? {
        getAccessToken: async () => {
            const token = await context.authManager!.getTokenManager().getAccessToken();
            return token ?? null;
        },
    } : {
        getAccessToken: async () => null,
    };

    const daLiveOrgOps = new DaLiveOrgOperations(tokenProvider, context.logger);

    // HelixService requires AuthenticationService
    if (!context.authManager) {
        throw new Error('AuthenticationService required for cleanup');
    }
    const helixService = new HelixService(context.authManager, context.logger, githubTokenService);

    const toolManager = new ToolManager(context.logger);

    return new CleanupService(
        githubRepoOps,
        daLiveOrgOps,
        helixService,
        toolManager,
        context.logger,
    );
}
