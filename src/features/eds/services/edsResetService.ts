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

import type { TokenProvider } from './daLiveOrgOperations';
import type { GitHubTreeInput } from './types';
import { COMPONENT_IDS } from '@/core/constants';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import demoPackagesConfig from '@/features/project-creation/config/demo-packages.json';
import { getBlockLibrarySource, getBlockLibraryName, isBlockLibraryAvailableForPackage } from '@/features/project-creation/services/blockLibraryLoader';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

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
    contentSource?: {
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

    return {
        success: true,
        params: {
            repoOwner,
            repoName,
            daLiveOrg,
            daLiveSite,
            templateOwner,
            templateRepo,
            ...(contentSourceConfig && { contentSource: contentSourceConfig }),
            project,
            contentPatches,
        },
    };
}

// ==========================================================
// Reset Step Helpers
// ==========================================================

/** Fetch placeholder JSON files from template source into file overrides map. */
async function fetchPlaceholderFiles(
    fileOverrides: Map<string, string>,
    templateOwner: string,
    templateRepo: string,
    logger: import('@/types/logger').Logger,
): Promise<void> {
    const placeholderPaths = [
        'placeholders/global', 'placeholders/auth', 'placeholders/cart',
        'placeholders/checkout', 'placeholders/order', 'placeholders/account',
        'placeholders/payment-services', 'placeholders/recommendations', 'placeholders/wishlist',
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
                logger.info(`[EdsReset] Added ${placeholderPath}.json to code files`);
            }
        } catch {
            logger.warn(`[EdsReset] Failed to fetch ${placeholderPath}.json from source`);
        }
    }
}

/**
 * Step 1: Reset repository to template using bulk Git Tree operations.
 * Builds file overrides (fstab.yaml, config.json, placeholders) and pushes a single commit.
 * @returns Number of files reset and optional block collection IDs.
 */
async function resetRepoToTemplate(
    params: EdsResetParams,
    context: HandlerContext,
    githubFileOps: import('./githubFileOperations').GitHubFileOperations,
    report: (step: number, message: string) => void,
): Promise<{ filesReset: number; blockCollectionIds?: string[] }> {
    const { repoOwner, repoName, daLiveOrg, daLiveSite, templateOwner, templateRepo, project, includeBlockLibrary = false } = params;

    report(1, 'Resetting repository to template...');
    context.logger.info(`[EdsReset] Resetting repo using bulk tree operations`);

    const { generateFstabContent } = await import('./fstabGenerator');
    const { generateConfigJson, extractConfigParams } = await import('./configGenerator');

    const fstabContent = generateFstabContent({ daLiveOrg, daLiveSite });
    const fileOverrides = new Map<string, string>();
    fileOverrides.set('fstab.yaml', fstabContent);

    // Generate config.json with Commerce configuration
    const configParams = {
        githubOwner: repoOwner, repoName, daLiveOrg, daLiveSite,
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

    if (includeBlockLibrary) {
        await fetchPlaceholderFiles(fileOverrides, templateOwner, templateRepo, context.logger);
    }

    const resetResult = await githubFileOps.resetRepoToTemplate(
        templateOwner, templateRepo, repoOwner, repoName, fileOverrides, 'main',
    );

    context.logger.info(`[EdsReset] Repository reset complete: ${resetResult.fileCount} files, commit ${resetResult.commitSha.substring(0, 7)}`);
    report(1, `Reset ${resetResult.fileCount} files`);

    // Generate inspector tree entries (always, for consistency with storefront setup)
    let inspectorEntries: GitHubTreeInput[] = [];
    try {
        const { generateInspectorTreeEntries } = await import('./inspectorHelpers');
        inspectorEntries = await generateInspectorTreeEntries(
            githubFileOps, repoOwner, repoName, project.selectedPackage, context.logger,
        );
    } catch (error) {
        context.logger.warn(`[EdsReset] Inspector tagging skipped: ${(error as Error).message}`);
    }

    // Re-install block libraries if project had them (deduped, single commit)
    // Only install what's explicitly configured. No fallbacks.
    const effectiveBlockLibraries = project.selectedBlockLibraries ?? [];

    context.logger.info('[EdsReset] Block library config', {
        selectedBlockLibraries: project.selectedBlockLibraries,
        customBlockLibraries: project.customBlockLibraries?.map(l => `${l.source.owner}/${l.source.repo}`),
        package: project.selectedPackage,
    });

    const allLibraries: Array<{ source: import('@/types/demoPackages').AddonSource; name: string }> = [];

    // Collect built-in library sources (filter by package compatibility)
    const packageId = project.selectedPackage ?? '';
    for (const libraryId of effectiveBlockLibraries) {
        if (!isBlockLibraryAvailableForPackage(libraryId, packageId)) {
            context.logger.info(`[EdsReset] Skipping block library '${libraryId}' — not available for package '${packageId}' (onlyForPackages)`);
            continue;
        }
        const source = getBlockLibrarySource(libraryId);
        if (source) {
            allLibraries.push({ source, name: getBlockLibraryName(libraryId) || libraryId });
        } else {
            context.logger.warn(`[EdsReset] Block library '${libraryId}' selected but no source configured`);
        }
    }

    // Collect custom library sources
    if (project.customBlockLibraries && project.customBlockLibraries.length > 0) {
        for (const lib of project.customBlockLibraries) {
            allLibraries.push({ source: lib.source, name: lib.name });
        }
    }

    context.logger.info('[EdsReset] Installing blocks from', allLibraries.map(l => `${l.source.owner}/${l.source.repo}`));

    const { installBlockCollections } = await import('./blockCollectionHelpers');
    const { installInspectorTagging } = await import('./inspectorHelpers');

    let allBlockIds: string[] = [];
    if (allLibraries.length > 0) {
        report(1, `Re-installing blocks from ${allLibraries.length} ${allLibraries.length === 1 ? 'library' : 'libraries'}...`);
        const blockResult = await installBlockCollections(
            githubFileOps, repoOwner, repoName, allLibraries, context.logger, inspectorEntries,
        );
        if (blockResult.success) {
            allBlockIds = blockResult.blockIds;
            context.logger.info(`[EdsReset] Reinstalled ${blockResult.blocksCount} unique blocks from ${allLibraries.length} libraries (+ inspector tagging)`);
        } else {
            context.logger.warn(`[EdsReset] Block library reinstall failed: ${blockResult.error}`);
        }
    } else if (inspectorEntries.length > 0) {
        // No block libraries — inspector makes its own standalone commit
        report(1, 'Installing inspector tagging...');
        const inspectorResult = await installInspectorTagging(
            githubFileOps, repoOwner, repoName, project.selectedPackage, context.logger,
        );
        if (inspectorResult.success) {
            context.logger.info('[EdsReset] Inspector tagging installed (standalone)');
        } else {
            context.logger.warn(`[EdsReset] Inspector tagging skipped: ${inspectorResult.error}`);
        }
    }

    const blockCollectionIds = allBlockIds.length > 0 ? allBlockIds : undefined;

    return { filesReset: resetResult.fileCount, blockCollectionIds };
}

/**
 * Step 2: Sync code to CDN and configure DA.live permissions.
 */
async function syncCodeAndPermissions(
    params: EdsResetParams,
    context: HandlerContext,
    githubTokenService: import('./githubTokenService').GitHubTokenService,
    tokenProvider: TokenProvider,
    report: (step: number, message: string) => void,
): Promise<void> {
    const { repoOwner, repoName, daLiveOrg, daLiveSite } = params;
    const { HelixService } = await import('./helixService');
    const { configureDaLivePermissions } = await import('../handlers/edsHelpers');

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

    report(2, 'Configuring site permissions...');
    const { getDaLiveAuthService } = await import('../handlers/edsHelpers');
    const daLiveAuthService = getDaLiveAuthService(context.context);
    const userEmail = await daLiveAuthService.getUserEmail();
    if (userEmail) {
        await configureDaLivePermissions(tokenProvider, daLiveOrg, daLiveSite, userEmail, context.logger);
    } else {
        context.logger.warn('[EdsReset] No user email available for permissions');
    }
}

/**
 * Step 7: Redeploy API Mesh.
 * @returns Partial-success result if mesh failed, or null on success/skip.
 */
async function redeployApiMesh(
    project: Project,
    repoOwner: string,
    repoName: string,
    context: HandlerContext,
    report: (step: number, message: string) => void,
    filesReset: number,
    contentCopied: number,
): Promise<EdsResetResult | null> {
    const { getMeshComponentInstance } = await import('@/types/typeGuards');
    const { ServiceLocator } = await import('@/core/di');

    const meshComponent = getMeshComponentInstance(project);
    if (!meshComponent?.path) {
        return null;
    }

    // Re-validate Adobe I/O auth — the token may have expired during the reset pipeline
    const { ensureAdobeIOAuth } = await import('@/core/auth/adobeAuthGuard');
    const authService = ServiceLocator.getAuthenticationService();

    report(7, 'Checking Adobe I/O authentication...');
    const authResult = await ensureAdobeIOAuth({
        authManager: authService,
        logger: context.logger,
        logPrefix: '[EdsReset]',
        projectContext: {
            organization: project.adobe?.organization,
            projectId: project.adobe?.projectId,
            workspace: project.adobe?.workspace,
        },
        warningMessage: 'Your Adobe I/O session has expired. Please sign in to continue the mesh redeployment.',
    });

    if (!authResult.authenticated) {
        context.logger.warn('[EdsReset] Adobe I/O auth failed before mesh redeployment');
        return {
            success: true,
            filesReset,
            contentCopied,
            meshRedeployed: false,
            error: 'Reset completed but mesh redeployment skipped: Adobe I/O authentication required',
            errorType: 'MESH_REDEPLOY_FAILED',
        };
    }

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
            meshComponent.path, commandManager, context.logger,
            (msg, sub) => report(7, sub || msg), existingMeshId,
        );

        if (meshDeployResult.success && meshDeployResult.data?.endpoint) {
            const { updateMeshState } = await import('@/features/mesh/services/stalenessDetector');
            await updateMeshState(project, meshDeployResult.data.endpoint);
            await context.stateManager.saveProject(project);
            context.logger.info(`[EdsReset] Mesh redeployed: ${meshDeployResult.data.endpoint}`);
            return null; // Success
        }

        throw new Error(meshDeployResult.error || 'Mesh deployment failed');
    } catch (meshError) {
        context.logger.error('[EdsReset] Mesh redeployment error', meshError as Error);
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
        repoOwner, repoName, daLiveOrg, daLiveSite, templateOwner, templateRepo,
        contentSource: contentSourceConfig, project,
        includeBlockLibrary = false, verifyCdn = false, redeployMesh = false, contentPatches,
    } = params;

    const baseSteps = 6;
    const totalSteps = redeployMesh ? baseSteps + 1 : baseSteps;
    const report = (step: number, message: string) => {
        onProgress?.({ step, totalSteps, message });
    };

    const { getGitHubServices } = await import('../handlers/edsHelpers');
    const { DaLiveContentOperations } = await import('./daLiveContentOperations');
    const { HelixService } = await import('./helixService');

    const { tokenService: githubTokenService, fileOperations: githubFileOps } = getGitHubServices(context);
    const daLiveContentOps = new DaLiveContentOperations(tokenProvider, context.logger);

    let filesReset = 0;
    let contentCopied = 0;

    try {
        // Step 1: Reset repo to template
        const repoResetResult = await resetRepoToTemplate(params, context, githubFileOps, report);
        filesReset = repoResetResult.filesReset;

        // Step 2: Sync code to CDN + configure permissions
        await syncCodeAndPermissions(params, context, githubTokenService, tokenProvider, report);

        // Step 2.5: Update Configuration Service with current content source
        try {
            const { ConfigurationService } = await import('./configurationService');
            const configService = new ConfigurationService(tokenProvider, context.logger);
            const contentSourceUrl = `https://content.da.live/${daLiveOrg}/${daLiveSite}/`;
            const configResult = await configService.updateSiteConfig({
                org: repoOwner, site: repoName,
                codeOwner: repoOwner, codeRepo: repoName, contentSourceUrl,
            });
            if (configResult.success) {
                context.logger.info('[EdsReset] Configuration Service updated');
                // Also update folder mapping
                await configService.setFolderMapping(
                    repoOwner, repoName, { '/products/': '/products/default' },
                );
            } else {
                context.logger.warn(`[EdsReset] Configuration Service update warning: ${configResult.error}`);
            }
        } catch (configError) {
            context.logger.warn(`[EdsReset] Configuration Service update skipped: ${(configError as Error).message}`);
        }

        // Step 3: Publish config.json to CDN
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

        // Steps 4-6: Content Pipeline
        const helixService = new HelixService(context.logger, githubTokenService, tokenProvider);
        const { executeEdsPipeline } = await import('./edsPipeline');

        const pipelineResult = await executeEdsPipeline(
            {
                repoOwner, repoName, daLiveOrg, daLiveSite, templateOwner, templateRepo,
                clearExistingContent: true,
                skipContent: !contentSourceConfig,
                contentSource: contentSourceConfig,
                contentPatches, includeBlockLibrary,
                blockCollectionIds: repoResetResult.blockCollectionIds,
                purgeCache: true, skipPublish: false,
            },
            { daLiveContentOps, githubFileOps, helixService, logger: context.logger },
            (info) => {
                const stepMap: Record<string, number> = {
                    'content-clear': 4, 'content-copy': 4, 'block-library': 4,
                    'eds-settings': 5, 'cache-purge': 6, 'content-publish': 6, 'library-publish': 6,
                };
                let message = info.message;
                if (info.operation === 'content-publish' && info.current !== undefined && info.total) {
                    message = `Publishing to CDN (${info.current}/${info.total} pages)`;
                }
                report(stepMap[info.operation] ?? 4, message);
            },
        );

        if (!pipelineResult.success) {
            throw new Error(pipelineResult.error || 'Content pipeline failed');
        }

        contentCopied = pipelineResult.contentFilesCopied;
        context.logger.info('[EdsReset] Content pipeline completed successfully');

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

        // Step 7: Redeploy API Mesh (optional)
        if (redeployMesh) {
            const meshResult = await redeployApiMesh(project, repoOwner, repoName, context, report, filesReset, contentCopied);
            if (meshResult) {
                return meshResult; // Partial success
            }
        }

        // Update storefront state
        const { updateStorefrontState } = await import('./storefrontStalenessDetector');
        updateStorefrontState(project, project.componentConfigs || {});
        project.edsStorefrontStatusSummary = 'published';
        await context.stateManager.saveProject(project);

        context.logger.info('[EdsReset] EDS project reset successfully');

        return { success: true, filesReset, contentCopied, meshRedeployed: redeployMesh };
    } catch (error) {
        const { GitHubAppNotInstalledError } = await import('./types');
        if (error instanceof GitHubAppNotInstalledError) {
            context.logger.info(`[EdsReset] GitHub App not installed: ${error.message}`);
            return {
                success: false,
                error: error.message,
                errorType: 'GITHUB_APP_NOT_INSTALLED',
                errorDetails: { owner: error.owner, repo: error.repo, installUrl: error.installUrl },
            };
        }

        const errorMessage = (error as Error).message;
        context.logger.error('[EdsReset] Reset failed', error as Error);
        return { success: false, error: errorMessage };
    }
}
