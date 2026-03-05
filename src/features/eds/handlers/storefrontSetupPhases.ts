/**
 * Storefront Setup Phase Executors
 *
 * Contains the individual phase execution functions for storefront setup:
 * - GitHub repository setup (create, existing, pre-created)
 * - Helix 5 configuration (fstab.yaml, block collection)
 * - Code sync verification and CDN publishing
 * - Configuration Service registration
 * - Content pipeline orchestration
 *
 * Extracted from storefrontSetupHandlers.ts for file size management.
 *
 * @module features/eds/handlers/storefrontSetupPhases
 */

import { installBlockCollections, type BlockLibraryEntry } from '../services/blockCollectionHelpers';
import { generateInspectorTreeEntries, installInspectorTagging } from '../services/inspectorHelpers';
import { ConfigurationService, DEFAULT_FOLDER_MAPPING, buildSiteConfigParams } from '../services/configurationService';
import type { DaLiveAuthService } from '../services/daLiveAuthService';
import { createDaLiveServiceTokenProvider, DaLiveContentOperations } from '../services/daLiveContentOperations';
import { generateFstabContent } from '../services/fstabGenerator';
import { GitHubAppService } from '../services/githubAppService';
import { GitHubFileOperations } from '../services/githubFileOperations';
import { GitHubRepoOperations } from '../services/githubRepoOperations';
import { GitHubTokenService } from '../services/githubTokenService';
import { HelixService } from '../services/helixService';
import { DaLiveAuthError, type GitHubTreeInput } from '../services/types';
import { configureDaLivePermissions, ensureDaLiveAuth, getDaLiveAuthService } from './edsHelpers';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getBlockLibrarySource, getBlockLibraryContentSource, getBlockLibraryName, isBlockLibraryAvailableForPackage } from '@/features/project-creation/services/blockLibraryLoader';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

// ==========================================================
// Types
// ==========================================================

/**
 * Result of storefront setup phase execution
 */
export interface StorefrontSetupResult {
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


// ==========================================================
// Phase Executors
// ==========================================================

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
    selectedBlockLibraries: string[] | undefined,
    useExistingRepo: boolean,
    customBlockLibraries?: CustomBlockLibrary[],
    packageId?: string,
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

    // Phase 2.1: Block Libraries + Inspector Tagging
    //
    // Inspector tree entries are generated first, then merged into the block
    // collection commit for a single atomic commit. If no block libraries are
    // selected, inspector tagging makes its own standalone commit.

    const allLibraries: BlockLibraryEntry[] = [];

    // Collect built-in library sources (filter by package compatibility)
    const pkgId = packageId ?? '';
    if (selectedBlockLibraries && selectedBlockLibraries.length > 0) {
        for (const libraryId of selectedBlockLibraries) {
            if (!isBlockLibraryAvailableForPackage(libraryId, pkgId)) {
                logger.info(`[Storefront Setup] Skipping block library '${libraryId}' — not available for package '${pkgId}' (onlyForPackages)`);
                continue;
            }
            const source = getBlockLibrarySource(libraryId);
            if (source) {
                allLibraries.push({ source, name: getBlockLibraryName(libraryId) || libraryId });
            } else {
                logger.warn(`[Storefront Setup] Block library '${libraryId}' selected but no source configured`);
            }
        }
    }

    // Collect custom library sources
    if (customBlockLibraries && customBlockLibraries.length > 0) {
        for (const lib of customBlockLibraries) {
            allLibraries.push({ source: lib.source, name: lib.name });
        }
    }

    // Generate inspector tree entries (always, regardless of block libraries)
    await context.sendMessage('storefront-setup-progress', {
        phase: 'helix-config',
        message: 'Preparing inspector tagging...',
        progress: 27,
    });
    let inspectorEntries: GitHubTreeInput[];
    try {
        inspectorEntries = await generateInspectorTreeEntries(
            githubFileOps, repoInfo.repoOwner, repoInfo.repoName, packageId, logger,
        );
    } catch (error) {
        logger.warn(`[Storefront Setup] Inspector tagging skipped: ${(error as Error).message}`);
        inspectorEntries = [];
    }

    // Install blocks + inspector in a single atomic commit (deduped across libraries)
    let blockCollectionIdsResult: string[] = [];
    if (allLibraries.length > 0) {
        await context.sendMessage('storefront-setup-progress', {
            phase: 'helix-config',
            message: `Installing blocks from ${allLibraries.length} ${allLibraries.length === 1 ? 'library' : 'libraries'}...`,
            progress: 28,
        });
        const result = await installBlockCollections(
            githubFileOps, repoInfo.repoOwner, repoInfo.repoName,
            allLibraries, logger, inspectorEntries,
        );
        if (result.success) {
            logger.info(`[Storefront Setup] Installed ${result.blocksCount} unique blocks from ${allLibraries.length} libraries (+ inspector tagging)`);
            blockCollectionIdsResult = result.blockIds;

            // Save block library install tracking to project state
            if (result.libraryVersions && result.libraryVersions.length > 0) {
                const currentProject = await context.stateManager.getCurrentProject();
                if (currentProject) {
                    currentProject.installedBlockLibraries = result.libraryVersions.map(lv => ({
                        name: lv.name,
                        source: lv.source,
                        commitSha: lv.commitSha,
                        blockIds: lv.blockIds,
                        installedAt: new Date().toISOString(),
                    }));
                    await context.stateManager.saveProject(currentProject);
                    logger.info(`[Storefront Setup] Saved install tracking for ${result.libraryVersions.length} block libraries`);
                }
            }
        } else {
            logger.warn(`[Storefront Setup] Block library installation failed: ${result.error}`);
        }
    } else if (inspectorEntries.length > 0) {
        // No block libraries — inspector makes its own standalone commit
        const inspectorResult = await installInspectorTagging(
            githubFileOps, repoInfo.repoOwner, repoInfo.repoName, packageId, logger,
        );
        if (inspectorResult.success) {
            await context.sendMessage('storefront-setup-progress', {
                phase: 'helix-config',
                message: 'Inspector tagging installed',
                progress: 28,
            });
            logger.info('[Storefront Setup] Inspector tagging installed (standalone)');
        } else {
            logger.warn(`[Storefront Setup] Inspector tagging skipped: ${inspectorResult.error}`);
        }
    }

    const blockCollectionIds = blockCollectionIdsResult.length > 0 ? blockCollectionIdsResult : undefined;

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
    logger: Logger,
): Promise<void> {
    const { configurationService } = services;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync', message: 'Registering site with Configuration Service...', progress: 48,
    });

    try {
        const siteParams = buildSiteConfigParams(
            repoInfo.repoOwner, repoInfo.repoName, edsConfig.daLiveOrg, edsConfig.daLiveSite,
        );
        const registerResult = await configurationService.registerSite(siteParams);

        let skipFolderMapping = false;
        if (registerResult.success) {
            logger.info('[Storefront Setup] Site registered with Configuration Service');
        } else if (registerResult.statusCode === 409) {
            logger.info('[Storefront Setup] Site config exists, updating with current values...');
            const updateResult = await configurationService.updateSiteConfig(siteParams);
            if (updateResult.success) {
                logger.info('[Storefront Setup] Site config updated via Configuration Service');
            } else {
                logger.warn(`[Storefront Setup] Site config update warning: ${updateResult.error}`);
            }
        } else if (registerResult.statusCode === 401) {
            logger.warn(`[Storefront Setup] Config Service requires org admin setup: ${registerResult.error}`);
            await context.sendMessage('storefront-setup-progress', {
                phase: 'code-sync', message: 'Site config skipped (org admin setup needed)', progress: 49,
            });
            skipFolderMapping = true;
        } else {
            logger.warn(`[Storefront Setup] Config Service registration warning: ${registerResult.error}`);
        }

        if (!skipFolderMapping) {
            const folderResult = await configurationService.setFolderMapping(
                repoInfo.repoOwner, repoInfo.repoName, DEFAULT_FOLDER_MAPPING,
            );
            if (folderResult.success) {
                logger.info('[Storefront Setup] Folder mapping configured via Configuration Service');
            } else {
                logger.warn(`[Storefront Setup] Folder mapping warning: ${folderResult.error}`);
            }
        }
    } catch (error) {
        logger.warn(`[Storefront Setup] Configuration Service warning: ${(error as Error).message}`);
    }
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
 * @returns Setup result with repo details
 */
export async function executeStorefrontSetupPhases(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    signal: AbortSignal,
    selectedBlockLibraries?: string[],
    customBlockLibraries?: CustomBlockLibrary[],
    packageId?: string,
): Promise<StorefrontSetupResult> {
    const logger = context.logger;

    // Create service dependencies
    const githubTokenService = new GitHubTokenService(context.context.secrets, logger);
    const daLiveAuthService = getDaLiveAuthService(context.context);
    const daLiveTokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);

    const services: SetupServices = {
        githubRepoOps: new GitHubRepoOperations(githubTokenService, logger),
        githubFileOps: new GitHubFileOperations(githubTokenService, logger),
        githubAppService: new GitHubAppService(githubTokenService, logger),
        daLiveContentOps: new DaLiveContentOperations(daLiveTokenProvider, logger),
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
        logger.error('[Storefront Setup] GitHub owner not found. Config:', JSON.stringify({
            repoName: edsConfig.repoName, repoMode: edsConfig.repoMode, githubOwner: edsConfig.githubOwner,
            templateOwner: edsConfig.templateOwner, templateRepo: edsConfig.templateRepo,
        }));
        return { success: false, error: 'GitHub owner not configured. Please complete GitHub authentication.' };
    }
    logger.info(`[Storefront Setup] Using GitHub owner: ${githubOwner}`);

    // Validate template info
    const templateOwner = edsConfig.templateOwner;
    const templateRepo = edsConfig.templateRepo;
    if (!templateOwner || !templateRepo) {
        logger.error('[Storefront Setup] Template not configured. Config:', JSON.stringify({
            repoName: edsConfig.repoName, templateOwner: edsConfig.templateOwner, templateRepo: edsConfig.templateRepo,
        }));
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

        // Only install what's explicitly configured. No fallbacks.
        const effectiveBlockLibraries = selectedBlockLibraries ?? [];

        const MAX_REAUTH_ATTEMPTS = 2;

        // Phase 2-3: Helix Config + Code Sync (with token expiry recovery)
        // Phase 3 uses DA.live token for permissions and config service registration,
        // which can throw DaLiveAuthError if the token expires mid-operation.
        let blockCollectionIds: string[] = [];
        let configAttempt = 0;

        while (true) {
            try {
                const phase2Result = await executePhaseHelixConfig(
                    context, edsConfig, services, repoInfo, effectiveBlockLibraries, useExistingRepo,
                    customBlockLibraries, packageId,
                );
                blockCollectionIds = phase2Result.blockCollectionIds ?? [];
                if (phase2Result.earlyReturn) return phase2Result.earlyReturn;

                const phase3Result = await executePhaseCodeSync(
                    context, edsConfig, services, repoInfo, signal,
                );
                if (phase3Result) return phase3Result;

                break;
            } catch (error) {
                if (error instanceof DaLiveAuthError && configAttempt < MAX_REAUTH_ATTEMPTS) {
                    configAttempt++;
                    logger.warn(`[Storefront Setup] DA.live token expired during configuration (attempt ${configAttempt})`);

                    await context.sendMessage('storefront-setup-progress', {
                        phase: 'auth-recovery',
                        message: 'DA.live session expired. Please re-authenticate to continue.',
                        progress: -1,
                    });

                    const authResult = await ensureDaLiveAuth(context, '[Storefront Setup]');
                    if (!authResult.authenticated) {
                        throw new Error(
                            authResult.cancelled
                                ? 'Setup cancelled — DA.live re-authentication required'
                                : `DA.live re-authentication failed: ${authResult.error}`,
                        );
                    }

                    logger.info('[Storefront Setup] DA.live re-authenticated, resuming configuration');
                    await context.sendMessage('storefront-setup-progress', {
                        phase: 'code-sync', message: 'Resuming site configuration...', progress: 40,
                    });
                    continue;
                }
                throw error;
            }
        }

        // Phase 4-5: Content Pipeline (with token expiry recovery)
        if (signal.aborted) throw new Error('Operation cancelled');

        // Build library content sources for block doc page copying
        const libraryContentSources: Array<{ org: string; site: string }> = [];
        for (const libraryId of effectiveBlockLibraries) {
            const cs = getBlockLibraryContentSource(libraryId);
            if (cs) libraryContentSources.push(cs);
        }

        const { executeEdsPipeline } = await import('../services/edsPipeline');

        let pipelineAttempt = 0;
        let pipelineResult: { success: boolean; error?: string; libraryPaths: string[] };

        while (true) {
            try {
                pipelineResult = await executeEdsPipeline(
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
                        libraryContentSources,
                        purgeCache: Boolean(edsConfig.resetToTemplate || wantsToResetContent),
                    },
                    {
                        daLiveContentOps: services.daLiveContentOps,
                        githubFileOps: services.githubFileOps,
                        helixService: services.helixService,
                        logger,
                    },
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

                // Pipeline succeeded - break out of retry loop
                break;
            } catch (error) {
                if (error instanceof DaLiveAuthError && pipelineAttempt < MAX_REAUTH_ATTEMPTS) {
                    pipelineAttempt++;
                    logger.warn(`[Storefront Setup] DA.live token expired mid-pipeline (attempt ${pipelineAttempt})`);

                    await context.sendMessage('storefront-setup-progress', {
                        phase: 'auth-recovery',
                        message: 'DA.live session expired. Please re-authenticate to continue.',
                        progress: -1,
                    });

                    const authResult = await ensureDaLiveAuth(context, '[Storefront Setup]');
                    if (!authResult.authenticated) {
                        throw new Error(
                            authResult.cancelled
                                ? 'Setup cancelled — DA.live re-authentication required'
                                : `DA.live re-authentication failed: ${authResult.error}`,
                        );
                    }

                    logger.info('[Storefront Setup] DA.live re-authenticated, resuming pipeline');
                    await context.sendMessage('storefront-setup-progress', {
                        phase: 'content-copy', message: 'Resuming content copy...', progress: 50,
                    });
                    continue;
                }
                throw error;
            }
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
