/**
 * EDS Reset Service
 *
 * Shared service for resetting EDS projects to template state.
 * Used by both dashboard and projects-dashboard handlers to eliminate code duplication.
 *
 * The reset workflow:
 * 1. Reset repo to template (Git Tree API)
 * 2. Sync code to CDN + configure permissions
 * 3. Publish config.json
 * 4. Copy demo content to DA.live
 * 5. Apply EDS settings
 * 6. Purge cache + publish content
 * 7. (Optional) Redeploy API Mesh
 *
 * @module features/eds/services/edsResetService
 */

import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { TokenProvider } from './daLiveOrgOperations';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { COMPONENT_IDS } from '@/core/constants';
import demoPackagesConfig from '@/features/project-creation/config/demo-packages.json';

// ==========================================================
// Types
// ==========================================================

/**
 * Parameters for EDS reset operation
 */
export interface EdsResetParams {
    // Repository
    repoOwner: string;
    repoName: string;

    // DA.live
    daLiveOrg: string;
    daLiveSite: string;

    // Template
    templateOwner: string;
    templateRepo: string;
    contentSource: {
        org: string;
        site: string;
        indexPath?: string;
    };

    // Project data for config generation
    project: Project;

    // Optional features
    /** Include block library configuration (default: false) */
    includeBlockLibrary?: boolean;
    /** Verify CDN resources after publish (default: false) */
    verifyCdn?: boolean;
    /** Redeploy API Mesh after reset (default: false) */
    redeployMesh?: boolean;
    /** Content patches to apply during content copy */
    contentPatches?: string[];
}

/**
 * Progress callback info for EDS reset
 */
export interface EdsResetProgress {
    step: number;
    totalSteps: number;
    message: string;
}

/**
 * Result of EDS reset operation
 */
export interface EdsResetResult extends HandlerResponse {
    /** Number of files reset in repository */
    filesReset?: number;
    /** Number of content files copied */
    contentCopied?: number;
    /** Whether mesh was redeployed */
    meshRedeployed?: boolean;
    /** Specific error type for UI handling */
    errorType?: string;
    /** Additional error details */
    errorDetails?: Record<string, unknown>;
}

/**
 * Result of parameter extraction
 */
export type ExtractParamsResult = {
    success: true;
    params: EdsResetParams;
} | {
    success: false;
    error: string;
    code?: string;
};

// ==========================================================
// Parameter Extraction
// ==========================================================

/**
 * Extract reset parameters from a project
 *
 * Reads EDS metadata and template configuration from project and demo packages.
 *
 * @param project - Project to extract parameters from
 * @returns Extraction result with params or error
 */
export function extractResetParams(project: Project): ExtractParamsResult {
    // Get EDS metadata from component instance (project-specific data)
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const repoFullName = edsInstance?.metadata?.githubRepo as string | undefined;
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;

    // Derive template config from brand+stack (source of truth)
    const pkg = demoPackagesConfig.packages.find((p: { id: string }) => p.id === project.selectedPackage);
    const storefronts = pkg?.storefronts as Record<string, {
        templateOwner?: string;
        templateRepo?: string;
        contentSource?: { org: string; site: string; indexPath?: string };
        contentPatches?: string[];
    }> | undefined;
    const storefront = project.selectedStack ? storefronts?.[project.selectedStack] : undefined;
    const templateOwner = storefront?.templateOwner;
    const templateRepo = storefront?.templateRepo;
    const contentSourceConfig = storefront?.contentSource;
    const contentPatches = storefront?.contentPatches;

    // Validate required fields
    if (!repoFullName) {
        return {
            success: false,
            error: 'EDS metadata missing - no GitHub repository configured',
            code: 'CONFIG_INVALID',
        };
    }

    const [repoOwner, repoName] = repoFullName.split('/');
    if (!repoOwner || !repoName) {
        return {
            success: false,
            error: 'Invalid repository format',
            code: 'CONFIG_INVALID',
        };
    }

    if (!daLiveOrg || !daLiveSite) {
        return {
            success: false,
            error: 'DA.live configuration missing',
            code: 'CONFIG_INVALID',
        };
    }

    if (!templateOwner || !templateRepo) {
        return {
            success: false,
            error: 'Template configuration missing. Cannot reset without knowing the template repository.',
            code: 'CONFIG_INVALID',
        };
    }

    if (!contentSourceConfig) {
        return {
            success: false,
            error: 'Content source configuration missing. Cannot reset without knowing where demo content comes from.',
            code: 'CONFIG_INVALID',
        };
    }

    return {
        success: true,
        params: {
            repoOwner,
            repoName,
            daLiveOrg,
            daLiveSite,
            templateOwner,
            templateRepo,
            contentSource: contentSourceConfig,
            project,
            contentPatches,
        },
    };
}

// ==========================================================
// Core Reset Implementation
// ==========================================================

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
    const {
        repoOwner,
        repoName,
        daLiveOrg,
        daLiveSite,
        templateOwner,
        templateRepo,
        contentSource: contentSourceConfig,
        project,
        includeBlockLibrary = false,
        verifyCdn = false,
        redeployMesh = false,
        contentPatches,
    } = params;

    // Calculate total steps
    const baseSteps = 6;
    const totalSteps = redeployMesh ? baseSteps + 1 : baseSteps;

    const report = (step: number, message: string) => {
        onProgress?.({ step, totalSteps, message });
    };

    // Import dependencies
    const { getGitHubServices, configureDaLivePermissions, applyDaLiveOrgConfigSettings, bulkPreviewAndPublish } =
        await import('../handlers/edsHelpers');
    const { DaLiveContentOperations } = await import('./daLiveContentOperations');
    const { HelixService } = await import('./helixService');
    const { generateFstabContent } = await import('./fstabGenerator');
    const { generateConfigJson, extractConfigParams } = await import('./configGenerator');

    // Create service dependencies
    const { tokenService: githubTokenService, fileOperations: githubFileOps } = getGitHubServices(context);
    const daLiveContentOps = new DaLiveContentOperations(tokenProvider, context.logger);

    let filesReset = 0;
    let contentCopied = 0;
    let meshRedeployed = false;

    try {
        // ============================================
        // Step 1: Reset repo to template (bulk operation)
        // ============================================
        report(1, 'Resetting repository to template...');
        context.logger.info(`[EdsReset] Resetting repo using bulk tree operations`);

        // Build fstab.yaml content using centralized generator
        const fstabContent = generateFstabContent({
            daLiveOrg,
            daLiveSite,
        });

        // Create file overrides map (files with custom content)
        const fileOverrides = new Map<string, string>();
        fileOverrides.set('fstab.yaml', fstabContent);

        // Generate config.json with Commerce configuration
        const configParams = {
            githubOwner: repoOwner,
            repoName,
            daLiveOrg,
            daLiveSite,
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

        // Copy placeholder JSON files from source for projects-dashboard flow
        if (includeBlockLibrary) {
            const placeholderPaths = [
                'placeholders/global',
                'placeholders/auth',
                'placeholders/cart',
                'placeholders/recommendations',
                'placeholders/wishlist',
            ];

            for (const placeholderPath of placeholderPaths) {
                try {
                    const sourceUrl = `https://main--${templateRepo}--${templateOwner}.aem.live/${placeholderPath}.json`;
                    const response = await fetch(sourceUrl, {
                        signal: AbortSignal.timeout(TIMEOUTS.PREREQUISITE_CHECK),
                    });

                    if (response.ok) {
                        const jsonContent = await response.text();
                        fileOverrides.set(`${placeholderPath}.json`, jsonContent);
                        context.logger.info(`[EdsReset] Added ${placeholderPath}.json to code files`);
                    }
                } catch {
                    context.logger.warn(`[EdsReset] Failed to fetch ${placeholderPath}.json from source`);
                }
            }
        }

        // Perform bulk reset
        const resetResult = await githubFileOps.resetRepoToTemplate(
            templateOwner,
            templateRepo,
            repoOwner,
            repoName,
            fileOverrides,
            'main',
        );

        filesReset = resetResult.fileCount;
        context.logger.info(`[EdsReset] Repository reset complete: ${filesReset} files, commit ${resetResult.commitSha.substring(0, 7)}`);
        report(1, `Reset ${filesReset} files`);

        // ============================================
        // Step 2: Sync code to CDN + configure permissions
        // ============================================
        report(2, 'Syncing code to CDN...');

        const helixServiceForCodeSync = new HelixService(context.logger, githubTokenService, tokenProvider);

        try {
            await helixServiceForCodeSync.previewCode(repoOwner, repoName, '/*');
            context.logger.info('[EdsReset] Code synced to CDN');
            report(2, 'Code synchronized');
        } catch (codeSyncError) {
            context.logger.warn(`[EdsReset] Code sync request failed: ${(codeSyncError as Error).message}, continuing anyway`);
            report(2, 'Code sync pending...');
        }

        // Configure permissions via DA.live Config API
        report(2, 'Configuring site permissions...');
        const { DaLiveAuthService } = await import('./daLiveAuthService');
        const daLiveAuthService = new DaLiveAuthService(context.context);
        const userEmail = await daLiveAuthService.getUserEmail();
        if (userEmail) {
            await configureDaLivePermissions(tokenProvider, daLiveOrg, daLiveSite, userEmail, context.logger);
        } else {
            context.logger.warn('[EdsReset] No user email available for permissions');
        }

        // ============================================
        // Step 3: Publish config.json to CDN
        // ============================================
        report(3, 'Publishing config.json to CDN...');
        context.logger.info(`[EdsReset] Publishing config.json to CDN for ${repoOwner}/${repoName}`);

        const helixServiceForCode = new HelixService(context.logger, githubTokenService);

        try {
            await helixServiceForCode.previewCode(repoOwner, repoName, '/config.json');
            context.logger.info('[EdsReset] config.json published to CDN');
            report(3, 'config.json published');
        } catch (configError) {
            context.logger.warn(`[EdsReset] Failed to publish config.json: ${(configError as Error).message}`);
            report(3, 'config.json publish failed, continuing...');
        }

        // ============================================
        // Step 4: Copy demo content to DA.live
        // ============================================
        const indexPath = contentSourceConfig.indexPath || '/full-index.json';
        const contentSource = {
            org: contentSourceConfig.org,
            site: contentSourceConfig.site,
            indexUrl: `https://main--${contentSourceConfig.site}--${contentSourceConfig.org}.aem.live${indexPath}`,
        };

        report(4, 'Copying demo content to DA.live...');
        context.logger.info(`[EdsReset] Copying content from ${contentSourceConfig.org}/${contentSourceConfig.site} to ${daLiveOrg}/${daLiveSite}`);

        const onContentProgress = (info: { processed: number; total: number; currentFile?: string; message?: string }) => {
            const statusMessage = info.message || `Copying content (${info.processed}/${info.total})`;
            report(4, statusMessage);
        };

        const contentResult = await daLiveContentOps.copyContentFromSource(
            contentSource,
            daLiveOrg,
            daLiveSite,
            onContentProgress,
            contentPatches,
        );

        if (!contentResult.success) {
            throw new Error(`Content copy failed: ${contentResult.failedFiles.length} files failed`);
        }

        contentCopied = contentResult.totalFiles;
        report(4, `Copied ${contentCopied} content files`);
        context.logger.info(`[EdsReset] DA.live content populated: ${contentCopied} files`);

        // Configure Block Library if requested
        let libResult = { blocksCount: 0, paths: [] as string[] };
        if (includeBlockLibrary) {
            report(4, 'Configuring block library...');
            libResult = await daLiveContentOps.createBlockLibraryFromTemplate(
                daLiveOrg,
                daLiveSite,
                templateOwner,
                templateRepo,
                (owner, repo, path) => githubFileOps.getFileContent(owner, repo, path),
            );
            if (libResult.blocksCount > 0) {
                report(4, `Configured ${libResult.blocksCount} blocks`);
                context.logger.info(`[EdsReset] Block library: ${libResult.blocksCount} blocks configured`);
            }
        }

        // ============================================
        // Step 5: Apply EDS Settings
        // ============================================
        report(5, 'Applying EDS configuration...');
        await applyDaLiveOrgConfigSettings(daLiveContentOps, daLiveOrg, daLiveSite, context.logger);

        // ============================================
        // Step 6: Publish all content to CDN
        // ============================================
        report(6, 'Publishing content to CDN...');
        context.logger.info(`[EdsReset] Publishing content to CDN for ${repoOwner}/${repoName}`);

        const helixService = new HelixService(context.logger, githubTokenService, tokenProvider);

        // Purge stale cache before publishing
        report(6, 'Purging stale cache...');
        await helixService.purgeCacheAll(repoOwner, repoName, 'main');

        const onPublishProgress = (info: {
            phase: string;
            message: string;
            current?: number;
            total?: number;
            currentPath?: string;
        }) => {
            if (info.current !== undefined && info.total !== undefined) {
                report(6, `Publishing to CDN (${info.current}/${info.total} pages)`);
            } else {
                report(6, info.message);
            }
        };

        await helixService.publishAllSiteContent(`${repoOwner}/${repoName}`, 'main', undefined, undefined, onPublishProgress);

        // Bulk publish block library paths if included
        if (includeBlockLibrary && libResult.paths.length > 0) {
            report(6, 'Publishing block library...');
            try {
                await bulkPreviewAndPublish(helixService, repoOwner, repoName, libResult.paths, context.logger);
            } catch (libPublishError) {
                context.logger.debug(`[EdsReset] Block library publish failed: ${(libPublishError as Error).message}`);
            }
        }

        context.logger.info('[EdsReset] Content published to CDN successfully');

        // Verify CDN if requested
        if (verifyCdn) {
            report(6, 'Verifying configuration...');
            const { verifyCdnResources } = await import('./configSyncService');
            const verification = await verifyCdnResources(repoOwner, repoName, context.logger);

            if (verification.configVerified) {
                report(6, 'Configuration verified');
                context.logger.info('[EdsReset] config.json verified on CDN');
            } else {
                report(6, 'Configuration propagating...');
                context.logger.warn('[EdsReset] config.json CDN verification timed out - may need more time to propagate');
            }
        }

        // ============================================
        // Step 7: Redeploy API Mesh (optional)
        // ============================================
        if (redeployMesh) {
            const { getMeshComponentInstance } = await import('@/types/typeGuards');
            const { ServiceLocator } = await import('@/core/di');

            const meshComponent = getMeshComponentInstance(project);
            const hasMesh = !!meshComponent?.path;

            if (hasMesh) {
                const authService = ServiceLocator.getAuthenticationService();

                // Set Adobe CLI context before mesh deployment
                report(7, 'Setting Adobe context...');

                if (project.adobe?.organization) {
                    await authService.selectOrganization(project.adobe.organization);
                }
                if (project.adobe?.projectId && project.adobe?.organization) {
                    await authService.selectProject(project.adobe.projectId, project.adobe.organization);
                }
                if (project.adobe?.workspace && project.adobe?.projectId) {
                    await authService.selectWorkspace(project.adobe.workspace, project.adobe.projectId);
                }

                report(7, 'Redeploying API Mesh...');
                context.logger.info(`[EdsReset] Redeploying mesh for ${repoOwner}/${repoName}`);

                try {
                    const { deployMeshComponent } = await import('@/features/mesh/services/meshDeployment');
                    const existingMeshId = (meshComponent.metadata?.meshId as string) || '';
                    const commandManager = ServiceLocator.getCommandExecutor();

                    const meshDeployResult = await deployMeshComponent(
                        meshComponent.path!,
                        commandManager,
                        context.logger,
                        (msg, sub) => report(7, sub || msg),
                        existingMeshId,
                    );

                    if (meshDeployResult.success && meshDeployResult.data?.endpoint) {
                        const { updateMeshState } = await import('@/features/mesh/services/stalenessDetector');
                        await updateMeshState(project, meshDeployResult.data.endpoint);
                        await context.stateManager.saveProject(project);
                        meshRedeployed = true;
                        context.logger.info(`[EdsReset] Mesh redeployed: ${meshDeployResult.data.endpoint}`);
                    } else {
                        throw new Error(meshDeployResult.error || 'Mesh deployment failed');
                    }
                } catch (meshError) {
                    context.logger.error('[EdsReset] Mesh redeployment error', meshError as Error);
                    // Return partial success - reset worked but mesh failed
                    return {
                        success: true,
                        filesReset,
                        contentCopied,
                        meshRedeployed: false,
                        error: `Reset completed but mesh redeployment failed: ${(meshError as Error).message}`,
                        errorType: 'MESH_REDEPLOY_FAILED',
                    };
                }
            }
        }

        // Update storefront state to track the published config
        const { updateStorefrontState } = await import('./storefrontStalenessDetector');
        updateStorefrontState(project, project.componentConfigs || {});
        project.edsStorefrontStatusSummary = 'published';
        await context.stateManager.saveProject(project);

        context.logger.info('[EdsReset] EDS project reset successfully');

        return {
            success: true,
            filesReset,
            contentCopied,
            meshRedeployed,
        };
    } catch (error) {
        // Handle GitHub App not installed error specifically
        const { GitHubAppNotInstalledError } = await import('./types');
        if (error instanceof GitHubAppNotInstalledError) {
            context.logger.info(`[EdsReset] GitHub App not installed: ${error.message}`);
            return {
                success: false,
                error: error.message,
                errorType: 'GITHUB_APP_NOT_INSTALLED',
                errorDetails: {
                    owner: error.owner,
                    repo: error.repo,
                    installUrl: error.installUrl,
                },
            };
        }

        const errorMessage = (error as Error).message;
        context.logger.error('[EdsReset] Reset failed', error as Error);
        return {
            success: false,
            error: errorMessage,
        };
    }
}

// ==========================================================
// Full Reset with UI (Consolidated Handler Logic)
// ==========================================================

/**
 * Options for the full reset UI flow
 */
export interface ResetWithUIOptions {
    /** Project to reset */
    project: Project;
    /** Handler context */
    context: HandlerContext;
    /** Log prefix for messages (e.g., '[Dashboard]' or '[ProjectsList]') */
    logPrefix?: string;
    /** Include block library configuration (default: false) */
    includeBlockLibrary?: boolean;
    /** Verify CDN resources after publish (default: false) */
    verifyCdn?: boolean;
    /** Redeploy API Mesh after reset (default: auto-detect based on project) */
    redeployMesh?: boolean;
    /** Show "Show Logs" button in error messages (default: false) */
    showLogsOnError?: boolean;
}

/**
 * Reset an EDS project with full UI flow
 *
 * This is the consolidated entry point for resetting EDS projects.
 * It handles:
 * 1. Parameter extraction and validation
 * 2. Confirmation dialog (shown immediately)
 * 3. Progress notification (shown immediately after confirmation)
 * 4. Auth checks inside progress (DA.live, Adobe I/O if mesh exists)
 * 5. GitHub App check inside progress
 * 6. Actual reset via executeEdsReset
 * 7. Success/error notifications
 *
 * Both dashboard and projects-dashboard handlers should use this function
 * to eliminate code duplication.
 *
 * @param options - Reset options
 * @returns Reset result
 */
export async function resetEdsProjectWithUI(options: ResetWithUIOptions): Promise<EdsResetResult> {
    const {
        project,
        context,
        logPrefix = '[EdsReset]',
        includeBlockLibrary = false,
        verifyCdn = false,
        redeployMesh,
        showLogsOnError = false,
    } = options;

    // Dynamic imports to avoid circular dependencies
    const vscode = await import('vscode');
    const { DaLiveAuthService } = await import('./daLiveAuthService');
    const { showDaLiveAuthQuickPick, getGitHubServices } = await import('../handlers/edsHelpers');
    const { ServiceLocator } = await import('@/core/di');
    const { getMeshComponentInstance } = await import('@/types/typeGuards');

    // Extract reset parameters
    const paramsResult = extractResetParams(project);
    if (!paramsResult.success) {
        context.logger.error(`${logPrefix} resetEds: ${paramsResult.error}`);
        return { success: false, error: paramsResult.error };
    }

    const { repoOwner, repoName } = paramsResult.params;
    const repoFullName = `${repoOwner}/${repoName}`;

    // Show confirmation dialog FIRST (immediate UX feedback)
    const confirmButton = 'Reset Project';
    const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to reset "${project.name}"? This will reset all code to the template state and re-copy demo content.`,
        { modal: true },
        confirmButton,
    );

    if (confirmation !== confirmButton) {
        context.logger.info(`${logPrefix} resetEds: User cancelled reset`);
        return { success: false, cancelled: true };
    }

    // Set project status to 'resetting' so UI shows transitional state
    const originalStatus = project.status;
    project.status = 'resetting';
    await context.stateManager.saveProject(project);

    // Execute reset with progress notification - shown IMMEDIATELY after confirmation
    try {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Resetting EDS Project',
                cancellable: false,
            },
            async (progress) => {
                context.logger.info(`${logPrefix} Resetting EDS project: ${repoFullName}`);

                // Check DA.live authentication (inside progress for immediate feedback)
                progress.report({ message: 'Checking authentication...' });
                const daLiveAuthService = new DaLiveAuthService(context.context);
                const isDaLiveAuthenticated = await daLiveAuthService.isAuthenticated();

                if (!isDaLiveAuthenticated) {
                    context.logger.info(`${logPrefix} resetEds: DA.live token expired or missing`);

                    const signInButton = 'Sign In';
                    const selection = await vscode.window.showWarningMessage(
                        'Your DA.live session has expired. Please sign in to continue.',
                        signInButton,
                    );

                    if (selection === signInButton) {
                        const authResult = await showDaLiveAuthQuickPick(context);
                        if (authResult.cancelled || !authResult.success) {
                            project.status = originalStatus;
                            await context.stateManager.saveProject(project);
                            return {
                                success: false,
                                error: authResult.error || 'DA.live authentication required',
                                errorType: 'DALIVE_AUTH_REQUIRED',
                                cancelled: authResult.cancelled,
                            };
                        }
                    } else {
                        project.status = originalStatus;
                        await context.stateManager.saveProject(project);
                        return {
                            success: false,
                            error: 'DA.live authentication required',
                            errorType: 'DALIVE_AUTH_REQUIRED',
                        };
                    }
                }

                // Check Adobe I/O authentication (if project has mesh)
                const meshComponent = getMeshComponentInstance(project);
                const hasMesh = !!meshComponent?.path;

                if (hasMesh) {
                    progress.report({ message: 'Checking Adobe I/O authentication...' });
                    const authService = ServiceLocator.getAuthenticationService();
                    const isAdobeAuthenticated = await authService.isAuthenticated();

                    if (!isAdobeAuthenticated) {
                        context.logger.info(`${logPrefix} resetEds: Adobe I/O token expired or missing`);

                        const signInButton = 'Sign In';
                        const selection = await vscode.window.showWarningMessage(
                            'Your Adobe I/O session has expired. Please sign in to continue.',
                            signInButton,
                        );

                        if (selection === signInButton) {
                            const loginSuccess = await authService.login();
                            if (!loginSuccess) {
                                project.status = originalStatus;
                                await context.stateManager.saveProject(project);
                                return {
                                    success: false,
                                    error: 'Adobe I/O authentication required',
                                    errorType: 'ADOBE_AUTH_REQUIRED',
                                    cancelled: true,
                                };
                            }
                        } else {
                            project.status = originalStatus;
                            await context.stateManager.saveProject(project);
                            return {
                                success: false,
                                error: 'Adobe I/O authentication required',
                                errorType: 'ADOBE_AUTH_REQUIRED',
                            };
                        }
                    }
                }

                // Check if AEM Code Sync app is installed
                progress.report({ message: 'Checking GitHub App...' });
                const { tokenService: preCheckTokenService } = getGitHubServices(context);
                const { GitHubAppService } = await import('./githubAppService');
                const appService = new GitHubAppService(preCheckTokenService, context.logger);
                const appCheck = await appService.isAppInstalled(repoOwner, repoName);

                if (!appCheck.isInstalled) {
                    context.logger.warn(`${logPrefix} AEM Code Sync app not installed on ${repoFullName}`);

                    const installButton = 'Install App';
                    const continueButton = 'Continue Anyway';
                    const appWarning = await vscode.window.showWarningMessage(
                        'The AEM Code Sync GitHub App is not installed on this repository. ' +
                        'Without it, code changes will not sync to the CDN and the site may not work correctly.',
                        installButton,
                        continueButton,
                    );

                    if (appWarning === installButton) {
                        const installUrl = appService.getInstallUrl(repoOwner, repoName);
                        await vscode.env.openExternal(vscode.Uri.parse(installUrl));

                        const afterInstall = await vscode.window.showInformationMessage(
                            'After installing the app, click Continue to proceed with the reset.',
                            'Continue',
                            'Cancel',
                        );

                        if (afterInstall !== 'Continue') {
                            context.logger.info(`${logPrefix} resetEds: User cancelled after app installation prompt`);
                            project.status = originalStatus;
                            await context.stateManager.saveProject(project);
                            return { success: false, cancelled: true };
                        }
                    } else if (appWarning !== continueButton) {
                        context.logger.info(`${logPrefix} resetEds: User cancelled at app check`);
                        project.status = originalStatus;
                        await context.stateManager.saveProject(project);
                        return { success: false, cancelled: true };
                    }
                }

                // Create token provider for DA.live operations
                const tokenProvider = {
                    getAccessToken: async () => {
                        return await daLiveAuthService.getAccessToken();
                    },
                };

                // Determine if we should redeploy mesh (auto-detect if not specified)
                const shouldRedeployMesh = redeployMesh ?? hasMesh;

                // Build reset params with options
                const resetParams: EdsResetParams = {
                    ...paramsResult.params,
                    includeBlockLibrary,
                    verifyCdn,
                    redeployMesh: shouldRedeployMesh,
                };

                // Execute the actual reset
                const result = await executeEdsReset(
                    resetParams,
                    context,
                    tokenProvider,
                    (p) => {
                        progress.report({ message: `Step ${p.step}/${p.totalSteps}: ${p.message}` });
                    },
                );

                if (result.success) {
                    // Show auto-dismissing success notification
                    void vscode.window.withProgress(
                        { location: vscode.ProgressLocation.Notification, title: `"${project.name}" reset successfully` },
                        async () => new Promise(resolve => setTimeout(resolve, TIMEOUTS.UI.NOTIFICATION)),
                    );

                    // Handle partial success (reset worked but mesh failed)
                    if (result.errorType === 'MESH_REDEPLOY_FAILED') {
                        vscode.window.showWarningMessage(
                            `${result.error} Commerce features may not work until mesh is manually redeployed.`,
                        );
                    }
                } else if (result.errorType === 'GITHUB_APP_NOT_INSTALLED') {
                    const installButton = 'Install GitHub App';
                    const selection = await vscode.window.showErrorMessage(
                        `Cannot reset EDS project: The AEM Code Sync GitHub App is not installed on ${result.errorDetails?.owner}/${result.errorDetails?.repo}. ` +
                        `Please install the app and try again.`,
                        installButton,
                    );
                    if (selection === installButton && result.errorDetails?.installUrl) {
                        await vscode.env.openExternal(vscode.Uri.parse(result.errorDetails.installUrl as string));
                    }
                } else if (result.error) {
                    // Show error with optional "Show Logs" button
                    if (showLogsOnError) {
                        const { getLogger } = await import('@/core/logging');
                        vscode.window.showErrorMessage(
                            `Failed to reset EDS project: ${result.error}`,
                            'Show Logs',
                        ).then(selection => {
                            if (selection === 'Show Logs') {
                                getLogger().show(false);
                            }
                        });
                    } else {
                        vscode.window.showErrorMessage(`Failed to reset EDS project: ${result.error}`);
                    }
                }

                return result;
            },
        );
    } finally {
        // Reset status back to original
        project.status = originalStatus;
        await context.stateManager.saveProject(project);
    }
}

