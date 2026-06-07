/**
 * Storefront Setup Phase 3: Code Sync and Configuration Service
 *
 * Handles code sync verification, CDN publishing, DA.live permissions,
 * and Configuration Service registration for storefront setup.
 *
 * @module features/eds/handlers/storefrontSetupPhase3
 */

import { buildSiteConfigParams, ConfigurationService } from '../services/configurationService';
import { DaLiveAuthError } from '../services/types';
import { configureDaLivePermissions } from './edsHelpers';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

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

// Warm-up wait after the App-installed check passes. 10 × 2s = 20s caps the
// worst-case latency before downstream phases reference the bus. App-installed
// repos typically settle in under 10s in practice; longer warm-ups added
// latency without changing correctness now that the App check is the gate.
const CODE_SYNC_MAX_ATTEMPTS = 10;
const CODE_SYNC_POLL_INTERVAL_MS = 2000;

// Delay before retrying isAppInstalled on a transient failure. Short enough
// to feel snappy, long enough to ride out a momentary network blip.
const APP_CHECK_RETRY_DELAY_MS = 2000;

/**
 * Verify the AEM Code Sync GitHub App is installed, then wait for the code
 * bus to warm up.
 *
 * Ground-truth ordering is load-bearing. The code bus retains files seeded
 * during initial template setup (e.g., `scripts/aem.js` pushed by DA.live or
 * a template-clone bootstrap) even when the GitHub App is not installed on
 * the user's repo. A poll that treats file fetchability as proof of sync
 * therefore produces a false positive — it sees the seeded boilerplate, calls
 * verification done, and lets the user finish setup. Their *next* push then
 * 404s on the bus because no GitHub → Helix webhook fires without the App.
 *
 * Fix: check `isAppInstalled` first. If the App is missing, surface the
 * install dialog and stop the phase — never poll. If the App is installed,
 * the existing poll is preserved as a warm-up wait for sync to settle before
 * downstream phases reference the bus.
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
        // 1. Ground truth — is the AEM Code Sync GitHub App installed on this repo?
        //    The check can fail transiently (network blip, Helix 5xx, parse error).
        //    Since the dialog this gates is disruptive — it asks the user to leave
        //    the IDE and complete a GitHub install flow — give a flaky first check
        //    exactly one short retry before declaring the App missing.
        let initialCheck = await githubAppService.isAppInstalled(repoInfo.repoOwner, repoInfo.repoName);

        if (!initialCheck.isInstalled && initialCheck.transient) {
            logger.info('[Storefront Setup] Code sync check failed transiently — retrying once');
            await new Promise(resolve => setTimeout(resolve, APP_CHECK_RETRY_DELAY_MS));
            initialCheck = await githubAppService.isAppInstalled(repoInfo.repoOwner, repoInfo.repoName);
        }

        if (!initialCheck.isInstalled) {
            const installUrl = githubAppService.getInstallUrl(repoInfo.repoOwner, repoInfo.repoName);
            logger.info(`[Storefront Setup] GitHub App not installed. Install URL: ${installUrl}`);

            await context.sendMessage('storefront-setup-github-app-required', {
                owner: repoInfo.repoOwner, repo: repoInfo.repoName, installUrl,
                message: 'The AEM Code Sync GitHub App must be installed to continue.',
            });

            return { success: false, error: 'GitHub App installation required', ...repoInfo };
        }

        // 2. App is installed — wait briefly for the bus to start serving the
        //    boilerplate before downstream phases reference it. Exhaustion is
        //    not fatal here; the App check above already confirmed sync will work.
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

        if (syncVerified) {
            logger.info('[Storefront Setup] Code sync verified');
        } else if (initialCheck.codeStatus === 400) {
            logger.info('[Storefront Setup] Code sync in progress (initializing), continuing...');
        } else {
            logger.warn(`[Storefront Setup] Code sync warm-up exhausted (code.status: ${initialCheck.codeStatus}), continuing...`);
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
export async function registerConfigurationService(
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
