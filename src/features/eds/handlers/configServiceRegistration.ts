/**
 * Configuration Service registration for storefront setup.
 *
 * Split out of `storefrontSetupPhase3`, which had grown to two unrelated jobs:
 * verifying code sync, and registering the site with the Configuration Service.
 * They share nothing beyond `repoInfo`/`edsConfig`, so the file was long for
 * structural reasons rather than intrinsic ones.
 *
 * This half owns the WIZARD'S WIRING of registration: the progress messages, the
 * `repoMode`-gated choice of whether to retry a 403, the admin-role pin, and the
 * PDP caveats a storefront must carry when its overlay could not be registered.
 *
 * The 409→update / 401→re-auth / 403→propagation-retry protocol itself lives in
 * `services/siteConfigRegistrar`, shared with the repair command so the rules —
 * particularly "the status carried out is the UPDATE's own" — exist once.
 *
 * @module features/eds/handlers/configServiceRegistration
 */

import * as vscode from 'vscode';
import { announceConfigAccess, pinSiteAdmin } from '../services/configAccessRecovery';
import { buildCodeSyncSetupUrl } from '../services/configServiceAccess';
import { buildSiteConfigParams } from '../services/configurationService';
import { lostGrantsMessage } from '../services/lostGrantsMessage';
import { registerSiteConfig } from '../services/siteConfigRegistrar';
import { DaLiveAuthError } from '../services/types';
import {
    addPdpCaveat,
    BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE,
    byomRegistrationFailureMessage,
    surfaceOverlayRegistrationFailure,
} from './edsHelpers';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import type { RepoInfo, SetupServices } from './storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import type { StorefrontSetupProgressPayload } from '@/types/webviewPayloads';

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
        phase: 'site-config',
        message: 'Registering site with Configuration Service...',
        progress: 46,
    } satisfies StorefrontSetupProgressPayload);

    // Access state, to the log and the wizard both. The detail lives in
    // `configAccessRecovery` — this handler only needs the outcome.
    // The state is consumed inside the helper (it drives the wizard warning);
    // nothing downstream branches on it here.
    await announceConfigAccess(
        services.daLiveTokenProvider,
        { owner: repoInfo.repoOwner, repo: repoInfo.repoName },
        logger,
        (message) =>
            context.sendMessage('storefront-setup-progress', {
                phase: 'site-config',
                message,
                progress: 46,
            } satisfies StorefrontSetupProgressPayload),
    );

    // Same precedence the DA.live permission step uses: the IMS identity is the
    // one the Configuration Service authorizes, so it wins over the GitHub one.
    const setupUserEmail =
        (await services.daLiveAuthService.getUserEmail()) || edsConfig.githubAuth?.user?.email;

    try {
        const siteParams = buildSiteConfigParams(
            repoInfo.repoOwner,
            repoInfo.repoName,
            edsConfig.daLiveOrg,
            edsConfig.daLiveSite,
            edsConfig.byomOverlayUrl,
        );
        const registration = await registerSiteConfig({
            configurationService,
            siteParams,
            tokenProvider: services.daLiveTokenProvider,
            logger,
            // New repos only: the Code Sync install just happened, so a 403 is
            // probably propagation. On an existing repo it is a real refusal and
            // waiting 135s only delays the message that explains it.
            retryOn403: edsConfig.repoMode === 'new',
            onProgress: (message) =>
                context.sendMessage('storefront-setup-progress', {
                    phase: 'site-config',
                    message,
                    progress: 46,
                } satisfies StorefrontSetupProgressPayload),
        });

        // Losing the site's admin list is unrecoverable from inside the app, so it
        // gets said out loud on every path — not just the repair command's.
        if (registration.lostGrants?.length) {
            vscode.window.showWarningMessage(
                lostGrantsMessage(registration.lostGrants, 'The site configuration was written'),
            );
        }

        if (registration.registered) {
            // Pinning an admin closes the admin API to anonymous callers, which is
            // what the browser-side smart-404 publisher is. The publish key that
            // keeps it working is re-minted by `registerSiteConfig` itself — the
            // write destroys it, so the re-mint belongs with the write.
            await pinSiteAdmin(
                services.daLiveTokenProvider,
                { owner: repoInfo.repoOwner, repo: repoInfo.repoName },
                setupUserEmail,
                logger,
            );
        } else {
            await context.sendMessage('storefront-setup-progress', {
                phase: 'site-config',
                message:
                    '⚠️ Configuration Service registration failed — da.live preview may not work',
                progress: 47,
            } satisfies StorefrontSetupProgressPayload);
        }

        // Three outcomes, not two. Configured-and-registered is the only one that
        // is plain success; the other two both end with a storefront that cannot
        // serve a PDP and must say so.
        if (!edsConfig.byomOverlayUrl) {
            // No overlay was even attempted — BYOM turned off, or a URL that
            // failed validation. This branch did not exist: the check below was
            // gated on the URL being truthy, so this case fell through to
            // "Storefront setup completed successfully!"
            //
            // The reason arrives already computed (see the handler). Reading the
            // setting HERE, inside this try, turned any config-read failure into
            // a spurious "Configuration Service setup incomplete" warning.
            if (edsConfig.byomAbsentReason) addPdpCaveat(repoInfo, edsConfig.byomAbsentReason);
        } else if (!registration.registered) {
            // Record it, do not just warn: a toast is dismissible and the run
            // otherwise ends by announcing success for a storefront that cannot
            // serve PDPs. The status code picks the message — a 403 is an
            // account-role refusal that a reset cannot fix.
            //
            // On a 403 the caveat carries a deep link to THIS site's Code Sync
            // setup, built from data already in hand. A generic "open the setup
            // tool" makes the user find their own site inside it; this lands on
            // it. Nothing here depends on `repoMode` — an existing project hits
            // this path exactly as a new one does, which is what previously left
            // an edit/republish with no route at all.
            const setupUrl =
                registration.statusCode === 403
                    ? buildCodeSyncSetupUrl({
                          owner: repoInfo.repoOwner,
                          repo: repoInfo.repoName,
                          contentSourceUrl: siteParams.contentSourceUrl,
                          // Pre-fills the tool's Users step.
                          userEmail: setupUserEmail,
                      })
                    : undefined;
            addPdpCaveat(
                repoInfo,
                byomRegistrationFailureMessage(registration.statusCode, setupUrl),
            );
            surfaceOverlayRegistrationFailure(
                logger,
                vscode.window.showWarningMessage,
                registration.statusCode,
                setupUrl,
            );
        }
    } catch (error) {
        if (error instanceof DaLiveAuthError) throw error;
        logger.error(
            `[Storefront Setup] Configuration Service failed: ${(error as Error).message}`,
        );
        await context.sendMessage('storefront-setup-progress', {
            phase: 'site-config',
            message:
                '⚠️ Configuration Service setup incomplete — da.live preview may need manual configuration',
            progress: 49,
        } satisfies StorefrontSetupProgressPayload);
        if (edsConfig.byomOverlayUrl) {
            addPdpCaveat(repoInfo, BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE);
            surfaceOverlayRegistrationFailure(logger, vscode.window.showWarningMessage);
        }
    }
}
