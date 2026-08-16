/**
 * Storefront Setup Phase 3: Code Sync and Configuration Service
 *
 * Handles code sync verification, CDN publishing, DA.live permissions,
 * and Configuration Service registration for storefront setup.
 *
 * @module features/eds/handlers/storefrontSetupPhase3
 */

import {
    buildUndeterminedAppCheckError,
    resolveAppInstallation,
} from '../services/appInstallationResolver';
import { registerConfigurationService } from './configServiceRegistration';
import { configureDaLivePermissions } from './edsHelpers';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { HandlerContext } from '@/types/handlers';

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
        phase: 'code-sync',
        message: 'Verifying code synchronization...',
        progress: 40,
    });

    const codeSyncResult = await verifyCodeSync(context, services, repoInfo, signal, edsConfig);
    if (codeSyncResult) return codeSyncResult;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync',
        message: 'Publishing code to CDN...',
        progress: 43,
    });

    try {
        await helixService.previewCode(repoInfo.repoOwner, repoInfo.repoName, '/*', 'main');
        logger.info('[Storefront Setup] Code published to CDN');
    } catch (error) {
        logger.warn(`[Storefront Setup] Code preview warning: ${(error as Error).message}`);
    }

    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync',
        message: 'Code synchronized',
        progress: 45,
    });

    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config',
        message: 'Configuring site permissions...',
        progress: 46,
    });

    const daLiveEmail = await daLiveAuthService.getUserEmail();
    const userEmail = daLiveEmail || edsConfig.githubAuth?.user?.email;

    if (userEmail) {
        const adminResult = await configureDaLivePermissions(
            daLiveTokenProvider,
            edsConfig.daLiveOrg,
            edsConfig.daLiveSite,
            userEmail,
            logger,
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
        phase: 'site-config',
        message: 'Site configuration complete',
        progress: 49,
    });

    return null;
}

// Warm-up wait after the App-installed check passes. 10 × 2s = 20s caps the
// worst-case latency before downstream phases reference the bus. App-installed
// repos typically settle in under 10s in practice; longer warm-ups added
// latency without changing correctness now that the App check is the gate.
const CODE_SYNC_MAX_ATTEMPTS = 10;
const CODE_SYNC_POLL_INTERVAL_MS = 2000;

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
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { githubAppService } = services;

    try {
        // 1. Ground truth — is the AEM Code Sync GitHub App installed on this repo?
        //    The check can fail transiently (network blip, Helix 5xx, parse error).
        //    Since the dialog this gates is disruptive — it asks the user to leave
        //    the IDE and complete a GitHub install flow — give a flaky first check
        //    exactly one short retry before declaring the App missing.
        const outcome = await resolveAppInstallation(githubAppService, repoInfo, logger);

        // Helix declined to answer. Do NOT show the install dialog — a rejected
        // credential says nothing about whether the App is installed, and the
        // install flow cannot resolve it. Fail with the real reason instead.
        if (outcome.kind === 'undetermined') {
            return {
                success: false,
                error: buildUndeterminedAppCheckError(
                    repoInfo,
                    outcome.httpStatus,
                    outcome.noCredential,
                ),
                ...repoInfo,
            };
        }

        const initialCheck = {
            isInstalled: outcome.kind === 'installed',
            codeStatus: outcome.codeStatus,
        };

        if (!initialCheck.isInstalled) {
            const installUrl = githubAppService.getInstallUrl(
                repoInfo.repoOwner,
                repoInfo.repoName,
            );

            // Differentiate the install-prompt message based on whether the
            // repo lives in the SC's personal namespace or a team org. SCs
            // can install GitHub Apps on their own accounts (personal case);
            // they typically cannot install on a team org without admin
            // rights (team-org case), so the messaging needs to direct them
            // to ask the org admin rather than implying they can fix it
            // themselves.
            const githubUser = edsConfig.githubAuth?.user?.login;
            const isTeamOrg = !!githubUser && repoInfo.repoOwner !== githubUser;

            const message = isTeamOrg
                ? `AEM Code Sync is not installed on ${repoInfo.repoOwner}. ` +
                  `Installing it on a GitHub organization requires admin rights — ask your ` +
                  `team admin to install it from: ${installUrl}`
                : 'The AEM Code Sync GitHub App must be installed to continue.';

            logger.info(
                `[Storefront Setup] GitHub App not installed (isTeamOrg=${isTeamOrg}). Install URL: ${installUrl}`,
            );

            await context.sendMessage('storefront-setup-github-app-required', {
                owner: repoInfo.repoOwner,
                repo: repoInfo.repoName,
                installUrl,
                isTeamOrg,
                message,
            });

            return {
                success: false,
                error: 'GitHub App installation required',
                awaitingGitHubApp: true,
                ...repoInfo,
            };
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
                    method: 'GET',
                    signal: AbortSignal.timeout(TIMEOUTS.QUICK),
                });
                if (response.ok) syncVerified = true;
            } catch {
                // Continue polling
            }

            if (!syncVerified && attempt < CODE_SYNC_MAX_ATTEMPTS - 1) {
                // 2s interval (faster than TIMEOUTS.EDS_CODE_SYNC_POLL=5s) — code sync typically settles quickly
                await sleep(CODE_SYNC_POLL_INTERVAL_MS);
            }
        }

        if (syncVerified) {
            logger.info('[Storefront Setup] Code sync verified');
        } else if (initialCheck.codeStatus === 400) {
            logger.info('[Storefront Setup] Code sync in progress (initializing), continuing...');
        } else {
            logger.warn(
                `[Storefront Setup] Code sync warm-up exhausted (code.status: ${initialCheck.codeStatus}), continuing...`,
            );
        }
    } catch (error) {
        if (signal.aborted) throw error;
        throw new Error(`Code sync failed: ${(error as Error).message}`);
    }

    return null;
}
