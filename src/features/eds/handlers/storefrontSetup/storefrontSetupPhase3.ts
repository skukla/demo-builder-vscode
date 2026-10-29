/**
 * Storefront Setup Phase 3: Code Sync and Configuration Service
 *
 * In this order: DA.live permissions, Configuration Service registration, the
 * code publish to the CDN, then AEM Code Sync verification. See
 * {@link executePhaseCodeSync} for why the publish follows the registration.
 *
 * @module features/eds/handlers/storefrontSetup/storefrontSetupPhase3
 */

import {
    buildAppNotOnRepositoryMessage,
    formatAdminDiagnostics,
    isAppNotOnRepositoryError,
    resolveAppInstallation,
} from '../../services/appInstallationResolver';
import { previewCodeAwaitingAdminRole } from '../../services/helix/previewCodeAwaitingAdminRole';
import { registerConfigurationService } from '../configServiceRegistration';
import { configureDaLivePermissions } from '../edsHelpers';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import { pauseForGitHubApp } from './storefrontSetupPhaseHelpers';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';
import { STOREFRONT_JOBS } from '@/core/utils/storefrontJobs';
import type { HandlerContext } from '@/types/handlers';
import type { StorefrontSetupProgressPayload } from '@/types/webviewPayloads';

/**
 * Execute Phase 3: register the site, publish its code, verify AEM Code Sync.
 *
 * ORDER IS LOAD-BEARING. The code publish (`POST admin.hlx.page/code/.../*`) needs
 * the site's Configuration Service record, so it runs after
 * `registerConfigurationService`. It ran first until 2026-10-22, when creating
 * skukla/scratch-1022 logged, one second before the site was registered:
 *
 *   10:12:13.506  Failed to preview code: 404 Not Found —
 *                 [admin] config for site not found: skukla/scratch-1022
 *   10:12:14-18   PUT config/skukla/sites/scratch-1022.json -> 201
 *
 * Nothing published again, so the project was marked ready while its site served
 * no code. The DA.live permissions step writes DA.live's own config
 * (`DaLiveConfigService.grantUserAccess`), not Helix's, so it stays first.
 */
export async function executePhaseCodeSync(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    signal?: AbortSignal,
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { daLiveAuthService, daLiveTokenProvider } = services;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync',
        message: 'Verifying code synchronization',
        progress: 40,
    } satisfies StorefrontSetupProgressPayload);

    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config',
        message: STOREFRONT_JOBS.settingSitePermissions,
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

    // Only now does the site exist for the code endpoint to publish into.
    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync',
        message: STOREFRONT_JOBS.publishingCode,
        progress: 47,
    } satisfies StorefrontSetupProgressPayload);

    const codeError = await publishCode(services, repoInfo, logger);

    await context.sendMessage('storefront-setup-progress', {
        phase: 'code-sync',
        message: describeCodePublish(repoInfo, codeError),
        progress: 47,
    } satisfies StorefrontSetupProgressPayload);

    // NOW the App can be verified, and this is the only place in the whole flow
    // where that is true. See `confirmCodeSync`.
    const codeSyncVerdict = await confirmCodeSync(context, services, repoInfo, edsConfig, {
        signal,
        codeError,
    });
    if (codeSyncVerdict) return codeSyncVerdict;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config',
        message: 'Site configuration complete',
        progress: 49,
    } satisfies StorefrontSetupProgressPayload);

    return null;
}

/**
 * Publish the repository's code to the CDN (`POST admin.hlx.page/code/.../*`).
 *
 * It runs after the site gained its admin, so a 401 is waited out while the role
 * propagates (`previewCodeAwaitingAdminRole`; scratch-1022-b, 2026-10-22). The
 * Helix service already carries the DA.live Bearer — it is built on the token
 * provider in `createSetupServices`.
 *
 * @returns undefined when it published, else the error message — whose x-error is
 *   the only place that says whether the AEM Code Sync App covers the repository
 */
async function publishCode(
    services: SetupServices,
    repoInfo: RepoInfo,
    logger: HandlerContext['logger'],
): Promise<string | undefined> {
    try {
        await previewCodeAwaitingAdminRole(
            services.helixService,
            { owner: repoInfo.repoOwner, repo: repoInfo.repoName, path: '/*', branch: 'main' },
            logger,
        );
        logger.info('[Storefront Setup] Code published to CDN');
        return undefined;
    } catch (error) {
        const message = (error as Error).message;
        logger.warn(`[Storefront Setup] Code preview warning: ${message}`);
        return message;
    }
}

/**
 * The code line of the progress feed. It read "Code synchronized" after a failed
 * publish until 2026-09-30, when a repo whose code never reached the CDN was
 * reported synchronized and the storefront 404'd on every script. The line says
 * what happened; {@link codePublishFailed} is what stops the run calling it ready.
 */
function describeCodePublish(repoInfo: RepoInfo, codeError: string | undefined): string {
    if (codeError === undefined) return 'Code synchronized';
    if (isAppNotOnRepositoryError(codeError)) {
        return (
            `⚠️ Code not published to the CDN — the AEM Code Sync GitHub App is not on ` +
            `${repoInfo.repoOwner}/${repoInfo.repoName}`
        );
    }
    return `⚠️ Code not published to the CDN: ${codeError}`;
}

/**
 * The run's result when the code did not reach the CDN for a reason other than the
 * App. The site then serves no scripts at all, so a warning that still ends in
 * "ready" is not an answer: the run fails with the reason, the same way the App
 * wait reports running out of time, and the SC sees it with Retry.
 */
function codePublishFailed(
    logger: HandlerContext['logger'],
    repoInfo: RepoInfo,
    codeError: string,
): StorefrontSetupResult {
    const repo = `${repoInfo.repoOwner}/${repoInfo.repoName}`;
    logger.error(`[Storefront Setup] Code not published to the CDN for ${repo}: ${codeError}`);
    return {
        success: false,
        error:
            `The storefront code for ${repo} could not be published, so the site would ` +
            `serve no pages. Adobe answered: ${codeError}. Select Retry to publish it again.`,
        ...repoInfo,
    };
}

/**
 * Wait-probe for a pause the code endpoint started: publish the code again. Ends
 * the wait when the publish succeeds, or fails for a reason other than the App —
 * then the App is no longer what blocks it. `lastError` keeps that reason, so the
 * run reports it rather than carrying on over unpublished code.
 * `/status` cannot end this wait: it reads an inner 400 before and after (EDS-23).
 */
function codePublishProbe(
    services: SetupServices,
    repoInfo: RepoInfo,
    logger: HandlerContext['logger'],
): { probe: () => Promise<boolean>; lastError: () => string | undefined } {
    let lastError: string | undefined;
    return {
        probe: async () => {
            lastError = await publishCode(services, repoInfo, logger);
            return lastError === undefined || !isAppNotOnRepositoryError(lastError);
        },
        lastError: () => lastError,
    };
}

/**
 * The code endpoint has said the App does not cover the repository. `/status`
 * cannot add to that — it reads an inner 400 either way (EDS-23) — so pause for
 * the App, and let the same publish say when it is there.
 *
 * @returns null when the code then published; a failed result when the wait ran
 *   out, or when the publish stopped naming the App but still failed
 */
async function pauseUntilCodePublishes(
    context: HandlerContext,
    services: SetupServices,
    repoInfo: RepoInfo,
    codeError: string,
    signal: AbortSignal | undefined,
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { githubAppService } = services;
    logger.info(
        `[Storefront Setup] AEM Code Sync is not on ${repoInfo.repoOwner}/${repoInfo.repoName} ` +
            `— the code endpoint said: ${codeError}`,
    );
    const publish = codePublishProbe(services, repoInfo, logger);
    const paused = await pauseForGitHubApp(
        context,
        services,
        repoInfo,
        {
            owner: repoInfo.repoOwner,
            repo: repoInfo.repoName,
            installUrl: githubAppService.getInstallUrl(repoInfo.repoOwner, repoInfo.repoName),
            message: buildAppNotOnRepositoryMessage(repoInfo.repoOwner, repoInfo.repoName),
        },
        { signal, phase: 'site-config', progress: 48, probe: publish.probe },
    );
    if (paused) return paused;
    const stillFailing = publish.lastError();
    return stillFailing === undefined ? null : codePublishFailed(logger, repoInfo, stillFailing);
}

/** Options for {@link confirmCodeSync}. */
interface ConfirmCodeSyncOptions {
    signal?: AbortSignal;
    /** The code publish's error, or undefined when it published. */
    codeError?: string;
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
 * The code publish decides first. Its "github bot not installed" x-error pauses
 * for the App; any other failure fails the run, because a site with no code is
 * not ready whatever `/status` says. Only after a publish that SUCCEEDED is
 * `/status` asked, and then only the inner `code.status: 404` pauses — Helix
 * having the site and reporting no code sync for it. Anything else (a refused
 * credential, an unreachable service, a site still settling) is a failed CHECK,
 * not a missing App, and must not block a setup whose code is published.
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
    options: ConfirmCodeSyncOptions,
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { githubAppService } = services;
    const { signal, codeError } = options;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'site-config',
        message: 'Verifying AEM Code Sync',
        progress: 48,
    } satisfies StorefrontSetupProgressPayload);

    if (codeError !== undefined && isAppNotOnRepositoryError(codeError)) {
        return pauseUntilCodePublishes(context, services, repoInfo, codeError, signal);
    }

    // Any other failed publish is the answer on its own. `/status` is not asked:
    // after a failed publish its inner 400 was read as success (scratch-1022,
    // 2026-10-22), and no reading of it would put the code on the CDN.
    if (codeError !== undefined) return codePublishFailed(logger, repoInfo, codeError);

    // The site was created seconds ago; code sync can lag it slightly. This is a
    // legitimate wait — unlike every earlier one, the thing being waited for is
    // genuinely on its way.
    const outcome = await resolveAppInstallation(githubAppService, repoInfo, logger, {
        awaitRegistration: true,
    });

    // An inner 400 says nothing (EDS-23); a code publish that SUCCEEDED does —
    // Helix fetched the code from GitHub, which needs the App on the repository.
    // Every failed publish has returned above, so reaching here means it succeeded.
    const publishProvesApp = outcome.kind === 'undetermined' && outcome.codeStatus === 400;
    if (outcome.kind === 'installed' || publishProvesApp) {
        logger.info(
            `[Storefront Setup] AEM Code Sync verified for ${repoInfo.repoOwner}/${repoInfo.repoName} ` +
                `(code.status ${outcome.codeStatus ?? 'none'}` +
                `${publishProvesApp ? ', and the code published' : ''})`,
        );
        await context.sendMessage('storefront-setup-progress', {
            phase: 'site-config',
            message: 'AEM Code Sync verified',
            progress: 48,
        } satisfies StorefrontSetupProgressPayload);
        return null;
    }

    // Helix knows the site and reports no code sync for it. The one measurement
    // that has always meant what it says, and the only one that earns a pause.
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
        // Pause here, not halt: the run waits for the App and picks up at the
        // next line, so nothing above is repeated (EDS-20, 2026-09-25).
        return pauseForGitHubApp(
            context,
            services,
            repoInfo,
            {
                owner: repoInfo.repoOwner,
                repo: repoInfo.repoName,
                installUrl,
                // isTeamOrg used to ride along here; nothing webview-side ever
                // read it (deleted by the 2026-08-21 channel inventory).
                message,
            },
            { signal, phase: 'site-config', progress: 48 },
        );
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
