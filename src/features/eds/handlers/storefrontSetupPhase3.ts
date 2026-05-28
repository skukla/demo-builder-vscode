/**
 * Storefront Setup Phase 3: Code Sync and Configuration Service
 *
 * Handles code sync verification, CDN publishing, DA.live permissions,
 * and Configuration Service registration for storefront setup.
 *
 * @module features/eds/handlers/storefrontSetupPhase3
 */

import { buildSiteConfigParams, ConfigurationService } from '../services/configurationService';
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
 * Register site with Configuration Service.
 *
 * Folder mapping (deprecated by Adobe — see aem.live/developer/byom) is intentionally
 * NOT configured here. The CitiSignal storefront handles /products/{sku} routing
 * via client-side JavaScript; folder mapping is the wrong mechanism for SEO-sensitive
 * Commerce PDPs.
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
            edsConfig.byomOverlayUrl,
        );
        await performSiteConfigRegistration(configurationService, siteParams, edsConfig, context, logger);
    } catch (error) {
        if (error instanceof DaLiveAuthError) throw error;
        logger.error(`[Storefront Setup] Configuration Service failed: ${(error as Error).message}`);
        await context.sendMessage('storefront-setup-progress', {
            phase: 'site-config',
            message: '⚠️ Configuration Service setup incomplete — da.live preview may need manual configuration',
            progress: 49,
        });
    }
}

/**
 * Attempt site registration, handling 409 (update), 401 (auth error),
 * and 403 on new repos (propagation retry).
 */
async function performSiteConfigRegistration(
    configurationService: ConfigurationService,
    siteParams: ReturnType<typeof buildSiteConfigParams>,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    context: HandlerContext,
    logger: Logger,
): Promise<void> {
    const registerResult = await configurationService.registerSite(siteParams);

    if (registerResult.success) {
        logger.info('[Storefront Setup] Site registered with Configuration Service');
        return;
    }

    const handled = await applyRegistrationResult(registerResult, configurationService, siteParams, logger);
    if (handled !== null) return;

    if (registerResult.statusCode === 403 && edsConfig.repoMode === 'new') {
        await retryRegistrationAfterDelay(configurationService, siteParams, context, logger);
        return;
    }

    logger.warn(`[Storefront Setup] Config Service registration warning: ${registerResult.error}`);
    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config',
        message: '⚠️ Configuration Service registration failed — da.live preview may not work',
        progress: 47,
    });
}

/**
 * Handle common registration result cases (409 and 401) shared by first-attempt
 * and retry paths. Returns `void` (proceed) on 409-then-update, throws on 401,
 * and returns null for unhandled status codes (caller must handle).
 */
async function applyRegistrationResult(
    result: { success: boolean; statusCode?: number; error?: string },
    configurationService: ConfigurationService,
    siteParams: ReturnType<typeof buildSiteConfigParams>,
    logger: Logger,
): Promise<void | null> {
    if (result.statusCode === 409) {
        logger.info('[Storefront Setup] Site config exists, updating...');
        const updateResult = await configurationService.updateSiteConfig(siteParams);
        if (!updateResult.success) {
            logger.warn(`[Storefront Setup] Site config update warning: ${updateResult.error}`);
        }
        return;
    }
    if (result.statusCode === 401) {
        throw new DaLiveAuthError(`Configuration Service authentication failed: ${result.error}`);
    }
    return null;
}

/**
 * Retry site registration with increasing backoff after a 403 on a new repo.
 *
 * Per aem.live/docs/config-service-setup, the AEM Code Sync GitHub App installer
 * is granted admin role, but role propagation across Adobe identity systems
 * typically takes 30–90 seconds. A single short retry is insufficient.
 *
 * The 403 (not 401) confirms the token is accepted — only the admin role is missing.
 */
async function retryRegistrationAfterDelay(
    configurationService: ConfigurationService,
    siteParams: ReturnType<typeof buildSiteConfigParams>,
    context: HandlerContext,
    logger: Logger,
): Promise<void> {
    const RETRY_DELAYS_MS = [
        TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY,         // 30s
        TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY * 1.5,   // 45s
        TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY * 2,     // 60s
    ];

    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
        const delayMs = RETRY_DELAYS_MS[attempt];
        logger.info(`[Storefront Setup] Config Service 403 — retrying after ${delayMs / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length}). Waiting for AEM Code Sync admin role propagation...`);
        await context.sendMessage('storefront-setup-progress', {
            phase: 'site-config',
            message: `Waiting for Configuration Service access (${attempt + 1}/${RETRY_DELAYS_MS.length})...`,
            progress: 46,
        });
        await new Promise(resolve => setTimeout(resolve, delayMs));

        const retryResult = await configurationService.registerSite(siteParams);
        if (retryResult.success) {
            logger.info('[Storefront Setup] Site registered with Configuration Service');
            return;
        }

        const handled = await applyRegistrationResult(retryResult, configurationService, siteParams, logger);
        if (handled !== null) return;

        // Only keep retrying on continued 403 (admin role still propagating).
        // Other errors will not improve with more waiting.
        if (retryResult.statusCode !== 403) {
            logger.warn(`[Storefront Setup] Config Service registration warning: ${retryResult.error}`);
            break;
        }
    }

    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config',
        message: '⚠️ Configuration Service registration failed — da.live preview may not work',
        progress: 47,
    });
}
