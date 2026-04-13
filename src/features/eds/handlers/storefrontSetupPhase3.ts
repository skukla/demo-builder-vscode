/**
 * Storefront Setup Phase 3: Code Sync and Configuration Service
 *
 * Handles code sync verification, CDN publishing, DA.live permissions,
 * and Configuration Service registration for storefront setup.
 *
 * @module features/eds/handlers/storefrontSetupPhase3
 */

import { buildSiteConfigParams, ConfigurationService, DEFAULT_FOLDER_MAPPING } from '../services/configurationService';
import { configureDaLivePermissions } from './edsHelpers';
import { DaLiveAuthError } from '../services/types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';

/**
 * Execute Phase 3: Code sync verification and CDN publishing
 */
export async function executePhaseCodeSync(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    signal: AbortSignal,
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { helixService, daLiveAuthService, daLiveTokenProvider } = services;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync', message: 'Verifying code synchronization...', progress: 40,
    });

    const codeSyncResult = await verifyCodeSync(context, services, repoInfo, signal);
    if (codeSyncResult) return codeSyncResult;

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

    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config', message: 'Configuring site permissions...', progress: 46,
    });

    const daLiveEmail = await daLiveAuthService.getUserEmail();
    const userEmail = daLiveEmail || edsConfig.githubAuth?.user?.email;

    if (userEmail) {
        const adminResult = await configureDaLivePermissions(
            daLiveTokenProvider, edsConfig.daLiveOrg, edsConfig.daLiveSite, userEmail, logger,
        );
        if (!adminResult.success) {
            await context.sendMessage('storefront-setup-progress', {
                phase: 'site-config',
                message: `⚠️ Permissions partially configured: ${adminResult.error}`,
                progress: 47,
            });
        }
    } else {
        logger.warn('[Storefront Setup] No user email available for permissions');
    }

    await registerConfigurationService(context, services, repoInfo, edsConfig, logger);

    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config', message: 'Site configuration complete', progress: 49,
    });

    return null;
}

const CODE_SYNC_MAX_ATTEMPTS = 25;
const CODE_SYNC_POLL_INTERVAL_MS = 2000;

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
        const owner = encodeURIComponent(repoInfo.repoOwner);
        const repo = encodeURIComponent(repoInfo.repoName);
        const codeUrl = `https://admin.hlx.page/code/${owner}/${repo}/main/scripts/aem.js`;
        let syncVerified = false;

        for (let attempt = 0; attempt < CODE_SYNC_MAX_ATTEMPTS && !syncVerified; attempt++) {
            if (signal.aborted) throw new Error('Operation cancelled');

            try {
                const response = await fetch(codeUrl, {
                    method: 'GET', signal: AbortSignal.timeout(TIMEOUTS.QUICK),
                });
                if (response.ok) syncVerified = true;
            } catch {
                // Continue polling
            }

            if (!syncVerified && attempt < CODE_SYNC_MAX_ATTEMPTS - 1) {
                // 2s interval (faster than TIMEOUTS.EDS_CODE_SYNC_POLL=5s) — code sync typically settles quickly
                await new Promise(resolve => setTimeout(resolve, CODE_SYNC_POLL_INTERVAL_MS));
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
        if (signal.aborted) throw error;
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
        phase: 'site-config', message: 'Registering site with Configuration Service...', progress: 46,
    });

    try {
        const siteParams = buildSiteConfigParams(
            repoInfo.repoOwner, repoInfo.repoName, edsConfig.daLiveOrg, edsConfig.daLiveSite,
        );
        const skipFolderMapping = await performSiteConfigRegistration(
            configurationService, siteParams, edsConfig, context, logger,
        );

        if (!skipFolderMapping) {
            const folderResult = await configurationService.setFolderMapping(
                edsConfig.daLiveOrg, edsConfig.daLiveSite, DEFAULT_FOLDER_MAPPING,
            );
            if (folderResult.success) {
                logger.info('[Storefront Setup] Folder mapping configured via Configuration Service');
            } else if (folderResult.statusCode === 401) {
                throw new DaLiveAuthError(`Folder mapping authentication failed: ${folderResult.error}`);
            } else {
                logger.error(`[Storefront Setup] Folder mapping failed: ${folderResult.error}`);
                await context.sendMessage('storefront-setup-progress', {
                    phase: 'site-config',
                    message: '⚠️ Folder mapping failed — product detail pages may not work',
                    progress: 49,
                });
            }
        }
    } catch (error) {
        if (error instanceof DaLiveAuthError) throw error;
        logger.error(`[Storefront Setup] Configuration Service failed — Folder mapping not applied: ${(error as Error).message}`);
        await context.sendMessage('storefront-setup-progress', {
            phase: 'site-config',
            message: '⚠️ Configuration Service failed — product detail pages may not work',
            progress: 49,
        });
    }
}

/**
 * Attempt site registration, handling 409 (update), 401 (auth error),
 * and 403 on new repos (propagation retry). Returns whether to skip folder mapping.
 */
async function performSiteConfigRegistration(
    configurationService: ConfigurationService,
    siteParams: ReturnType<typeof buildSiteConfigParams>,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    context: HandlerContext,
    logger: Logger,
): Promise<boolean> {
    const registerResult = await configurationService.registerSite(siteParams);

    if (registerResult.success) {
        logger.info('[Storefront Setup] Site registered with Configuration Service');
        return false;
    }

    const handled = await applyRegistrationResult(registerResult, configurationService, siteParams, logger);
    if (handled !== null) return handled;

    if (registerResult.statusCode === 403 && edsConfig.repoMode === 'new') {
        return retryRegistrationAfterDelay(configurationService, siteParams, context, logger);
    }

    // Other errors — fail gracefully, skip folder mapping
    logger.warn(`[Storefront Setup] Config Service registration warning: ${registerResult.error}`);
    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config',
        message: '⚠️ Configuration Service registration failed — da.live preview may not work',
        progress: 47,
    });
    return true;
}

/**
 * Handle common registration result cases (409 and 401) shared by first-attempt
 * and retry paths. Returns false (proceed) on 409-then-update, throws on 401,
 * and returns null for unhandled status codes (caller must handle).
 */
async function applyRegistrationResult(
    result: { success: boolean; statusCode?: number; error?: string },
    configurationService: ConfigurationService,
    siteParams: ReturnType<typeof buildSiteConfigParams>,
    logger: Logger,
): Promise<false | null> {
    if (result.statusCode === 409) {
        logger.info('[Storefront Setup] Site config exists, updating...');
        const updateResult = await configurationService.updateSiteConfig(siteParams);
        if (!updateResult.success) {
            logger.warn(`[Storefront Setup] Site config update warning: ${updateResult.error}`);
        }
        return false;
    }
    if (result.statusCode === 401) {
        throw new DaLiveAuthError(`Configuration Service authentication failed: ${result.error}`);
    }
    return null;
}

/**
 * Retry site registration once after a propagation delay (403 on new repo).
 * Returns whether to skip folder mapping.
 */
async function retryRegistrationAfterDelay(
    configurationService: ConfigurationService,
    siteParams: ReturnType<typeof buildSiteConfigParams>,
    context: HandlerContext,
    logger: Logger,
): Promise<boolean> {
    logger.info('[Storefront Setup] Config Service 403 on new repo — retrying after propagation delay...');
    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config', message: 'Waiting for Configuration Service access...', progress: 46,
    });
    await new Promise(resolve => setTimeout(resolve, TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY));

    const retryResult = await configurationService.registerSite(siteParams);
    if (retryResult.success) {
        logger.info('[Storefront Setup] Site registered with Configuration Service (retry succeeded)');
        return false;
    }

    const handled = await applyRegistrationResult(retryResult, configurationService, siteParams, logger);
    if (handled !== null) return handled;

    logger.warn(`[Storefront Setup] Config Service registration warning after retry: ${retryResult.error}`);
    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config',
        message: '⚠️ Configuration Service registration failed — da.live preview may not work',
        progress: 47,
    });
    return true;
}
