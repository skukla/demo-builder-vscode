/**
 * Storefront Setup Phase 3: Code Sync and Configuration Service
 *
 * Handles code sync verification, CDN publishing, DA.live permissions,
 * and Configuration Service registration for storefront setup.
 *
 * @module features/eds/handlers/storefrontSetupPhase3
 */

import {
    formatAdminDiagnostics,
    resolveAppInstallation,
} from '../services/appInstallationResolver';
import { registerConfigurationService } from './configServiceRegistration';
import { configureDaLivePermissions } from './edsHelpers';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';
import type { StorefrontGitHubAppRequiredPayload, StorefrontSetupProgressPayload } from '@/types/webviewPayloads';

/**
 * Execute Phase 3: Code sync verification and CDN publishing
 */
export async function executePhaseCodeSync(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { helixService, daLiveAuthService, daLiveTokenProvider } = services;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync',
        message: 'Verifying code synchronization...',
        subMessage: `${repoInfo.repoOwner}/${repoInfo.repoName}`,
        progress: 40,
    } satisfies StorefrontSetupProgressPayload);

    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync',
        message: 'Publishing code to CDN...',
        subMessage: `${repoInfo.repoOwner}/${repoInfo.repoName}`,
        progress: 43,
    } satisfies StorefrontSetupProgressPayload);

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
    } satisfies StorefrontSetupProgressPayload);

    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config',
        message: 'Configuring site permissions...',
        subMessage: `${repoInfo.repoOwner}/${repoInfo.repoName}`,
        progress: 46,
    } satisfies StorefrontSetupProgressPayload);

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
            } satisfies StorefrontSetupProgressPayload);
        }
    } else {
        logger.warn('[Storefront Setup] No user email available for permissions');
    }

    await registerConfigurationService(context, services, repoInfo, edsConfig, logger);

    // NOW the App can be verified, and this is the only place in the whole flow
    // where that is true. See `confirmCodeSync`.
    const codeSyncVerdict = await confirmCodeSync(context, services, repoInfo, edsConfig);
    if (codeSyncVerdict) return codeSyncVerdict;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config',
        message: 'Site configuration complete',
        progress: 49,
    } satisfies StorefrontSetupProgressPayload);

    return null;
}

/**
 * Verify AEM Code Sync, after the site exists.
 *
 * Every earlier check in this pipeline asked before there was anything to ask
 * about. `admin.hlx.page/status` reports on the SITE, and in Helix 5 a site is a
 * Configuration Service record — created by the `registerConfigurationService`
 * call immediately above this one. Measured on skukla/kukla-bodea 2026-08-20:
 *
 *   14:33:27.865  [ConfigAccess] access indeterminate (404)   <- no site
 *   14:33:34.018  PUT /config/skukla/sites/kukla-bodea.json -> 201 OK
 *   ... and /status went 404 -> 401, aem.page 404 -> 200
 *
 * So this is the first and only moment an App verdict means anything. Before
 * it, `installed=false` said nothing at all — which is how a user whose App was
 * installed the whole time got told eleven times to install it.
 *
 * It also REPORTS SUCCESS, not just failure. A check that only speaks when it
 * fails is indistinguishable from a check that never ran, and that ambiguity is
 * most of what made this hard to diagnose: "no green tick" looked identical to
 * "silently skipped".
 *
 * Only the inner `code.status: 404` halts — Helix having the site and reporting
 * no code sync for it. Anything else (a refused credential, an unreachable
 * service, a site still settling) is a failed CHECK, not a missing App, and must
 * not block a setup that has otherwise succeeded.
 *
 * @param context - handler context
 * @param services - setup services
 * @param repoInfo - the repo being verified
 * @returns an early result when the App is definitively missing, else null
 */
async function confirmCodeSync(
    context: HandlerContext,
    services: SetupServices,
    repoInfo: RepoInfo,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { githubAppService } = services;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config',
        message: 'Verifying AEM Code Sync...',
        subMessage: `${repoInfo.repoOwner}/${repoInfo.repoName}`,
        progress: 48,
    } satisfies StorefrontSetupProgressPayload);

    // The site was created seconds ago; code sync can lag it slightly. This is a
    // legitimate wait — unlike every earlier one, the thing being waited for is
    // genuinely on its way.
    const outcome = await resolveAppInstallation(githubAppService, repoInfo, logger, {
        awaitRegistration: true,
    });

    if (outcome.kind === 'installed') {
        logger.info(
            `[Storefront Setup] AEM Code Sync verified for ${repoInfo.repoOwner}/${repoInfo.repoName} ` +
                `(code.status ${outcome.codeStatus ?? 'none'})`,
        );
        await context.sendMessage('storefront-setup-progress', {
            phase: 'site-config',
            message: 'AEM Code Sync verified',
            progress: 48,
        } satisfies StorefrontSetupProgressPayload);
        return null;
    }

    // Helix knows the site and reports no code sync for it. The one measurement
    // that has always meant what it says, and the only one that earns a halt.
    if (outcome.kind === 'not-installed' && outcome.codeStatus === 404) {
        const installUrl = githubAppService.getInstallUrl(repoInfo.repoOwner, repoInfo.repoName);

        // A repo in the user's own namespace is theirs to fix; one in a team org
        // usually is not. SCs can install GitHub Apps on their own account but
        // typically lack admin rights on an organization, so the org case has to
        // direct them to an admin rather than imply they can do it themselves.
        //
        // Unlike every earlier version of this message, it can now state the
        // cause outright: Helix HAS the site and reports `code.status: 404`,
        // which is a measurement about code sync and not an inference from a
        // missing site.
        const githubUser = edsConfig.githubAuth?.user?.login;
        const isTeamOrg = !!githubUser && repoInfo.repoOwner !== githubUser;
        const message = isTeamOrg
            ? `AEM Code Sync is not installed on ${repoInfo.repoOwner}. Installing it on a ` +
              `GitHub organization requires admin rights — ask your team admin to install it ` +
              `from: ${installUrl}`
            : 'The AEM Code Sync GitHub App must be installed to continue.';

        logger.info(
            `[Storefront Setup] AEM Code Sync is not installed on ` +
                `${repoInfo.repoOwner}/${repoInfo.repoName} — Helix has the site and reports ` +
                `code.status 404 (isTeamOrg=${isTeamOrg}). Install URL: ${installUrl}`,
        );
        await context.sendMessage('storefront-setup-github-app-required', {
            owner: repoInfo.repoOwner,
            repo: repoInfo.repoName,
            installUrl,
            // isTeamOrg used to ride along here; nothing webview-side ever
            // read it (deleted by the 2026-08-21 channel inventory).
            siteUnregistered: false,
            message,
        } satisfies StorefrontGitHubAppRequiredPayload);
        return {
            success: false,
            error: 'GitHub App installation required',
            awaitingGitHubApp: true,
            ...repoInfo,
        };
    }

    logger.warn(
        `[Storefront Setup] Could not verify AEM Code Sync for ` +
            `${repoInfo.repoOwner}/${repoInfo.repoName} (${formatAdminDiagnostics(outcome)}). ` +
            'Setup succeeded; this is a failed check, not a missing App.',
    );
    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config',
        message: '⚠️ Could not verify AEM Code Sync — setup completed anyway',
        progress: 48,
    } satisfies StorefrontSetupProgressPayload);
    return null;
}
