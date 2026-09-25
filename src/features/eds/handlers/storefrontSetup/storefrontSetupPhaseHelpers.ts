/**
 * Storefront Setup Phase Helpers
 *
 * Shared helper functions used across storefront setup phases.
 * Functions land here when they are needed by multiple phase files
 * and placing them in any single phase would create a reverse or
 * circular import (e.g., Phase 2 importing from Phase 3).
 *
 * @module features/eds/handlers/storefrontSetup/storefrontSetupPhaseHelpers
 */

import {
    buildUndeterminedAppCheckError,
    formatAdminDiagnostics,
    resolveAppInstallation,
    waitForAppInstallation,
} from '../../services/appInstallationResolver';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { HandlerContext } from '@/types/handlers';
import type { StorefrontGitHubAppRequiredPayload, StorefrontSetupProgressPayload } from '@/types/webviewPayloads';

/**
 * Check GitHub App installation for existing repos. Returns early result if not installed.
 *
 * @param context - handler context
 * @param services - setup services
 * @param repoInfo - the repo being checked
 * @param options - `afterReset` when the repo was JUST rewritten from the template,
 *   which changes what a `404 no such site` means. See the call site in
 *   `storefrontSetupPhase1.executePhaseExistingRepo` for why the check moved.
 *   `signal` is the run's cancel signal, honoured while the run waits for the App.
 */
export async function checkGitHubAppForExistingRepo(
    context: HandlerContext,
    services: SetupServices,
    repoInfo: RepoInfo,
    options: { afterReset?: boolean; signal?: AbortSignal } = {},
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { githubAppService } = services;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'storefront-code',
        message: 'Verifying GitHub App installation',
        progress: 28,
    } satisfies StorefrontSetupProgressPayload);

    logger.info(
        `[Storefront Setup] Checking GitHub App for existing repo: ${repoInfo.repoOwner}/${repoInfo.repoName}`,
    );
    const outcome = await resolveAppInstallation(githubAppService, repoInfo, logger, {
        awaitRegistration: options.afterReset === true,
    });

    if (outcome.kind === 'undetermined') {
        return {
            success: false,
            error: buildUndeterminedAppCheckError(repoInfo, outcome.httpStatus, outcome.noCredential),
            ...repoInfo,
        };
    }

    if (outcome.kind === 'not-installed') {
        const installUrl = githubAppService.getInstallUrl(repoInfo.repoOwner, repoInfo.repoName);

        // Which 404 is it? The distinction decides what we are allowed to claim.
        //
        // INNER (`code.status: 404`): Helix knows the site and reports no code
        // sync for it. A measurement. "Install the App" is the right answer.
        //
        // OUTER (HTTP 404, no `code.status`): Helix has no site for this repo at
        // all — and `/status` reports on the SITE, not the App. It says nothing
        // about whether AEM Code Sync is installed. Measured on
        // skukla/kukla-bodea 2026-08-20: GitHub listed the repo under the
        // installation and this endpoint 404'd anyway.
        //
        // Both used to land on the install dialog, so a user with the App
        // already installed was told to install it, and the only action offered
        // could not have helped. Say what is true instead: Adobe has not
        // registered the repository yet.
        const siteUnregistered = outcome.httpStatus === 404 && outcome.codeStatus === undefined;
        logger.info(
            siteUnregistered
                ? `[Storefront Setup] Helix has no site for ${repoInfo.repoOwner}/${repoInfo.repoName} ` +
                  `(${formatAdminDiagnostics(outcome)}). This says nothing about the App — ` +
                  `/status reports on the site. Not offering the install flow.`
                : `[Storefront Setup] AEM Code Sync is not installed on ` +
                  `${repoInfo.repoOwner}/${repoInfo.repoName} (${formatAdminDiagnostics(outcome)}). ` +
                  `Install URL: ${installUrl}`,
        );

        // An outer 404 does NOT halt, because at this point in the pipeline it
        // carries no information at all.
        //
        // In Helix 5 a "site" is a Configuration Service record. Nothing before
        // `registerConfigurationService` (Phase 3) creates one, so `/status` has
        // nothing to answer with and returns `no such site` for every first-time
        // setup — App installed or not.
        //
        // Measured 2026-08-20, unauthenticated `/status/{owner}/{repo}/main`,
        // where 401 means the site exists (auth is checked before existence) and
        // 404 means it does not:
        //
        //   skukla/kukla-bodea       404   <- App installed, freshly reset, no site
        //   skukla/kukla-citisignal  401
        //   skukla/demo-builder-test 401   <- registered, nothing published
        //   adobe/helix-website      401
        //
        // Four repos with the App; three have sites. So the App does not create
        // one, and this gate could only ever pass for a repo that was ALREADY a
        // registered site — a re-run over a previously built demo. Every
        // first-time existing-repo setup was blocked by a question that had no
        // answer yet.
        //
        // The real check belongs after registration, where `/status` finally
        // means something and a missing App shows up as `code.status: 404`.
        if (siteUnregistered) {
            await context.sendMessage('storefront-setup-progress', {
                phase: 'storefront-code',
                message: 'Adobe has no site for this repository yet — continuing setup',
                progress: 28,
            } satisfies StorefrontSetupProgressPayload);
            return null;
        }

        return pauseForGitHubApp(
            context,
            services,
            repoInfo,
            {
                owner: repoInfo.repoOwner,
                repo: repoInfo.repoName,
                installUrl,
                message: 'The AEM Code Sync GitHub App must be installed to continue.',
            },
            { signal: options.signal, phase: 'storefront-code', progress: 28 },
        );
    }

    // Says only what was checked. This used to read "AEM Code Sync verified",
    // which a reader takes as "the AEM side is fine" — but it proves ONLY that
    // the GitHub App is installed and the repo is code-synced. It says nothing
    // about the Configuration Service admin role, which is a separate grant.
    // On 2026-08-13 this exact line printed immediately before a 403 on
    // leah-b2b-demo, and the false reassurance is why the real blocker went
    // unexamined. `logConfigAccessState` reports the role separately.
    logger.info(
        `[Storefront Setup] AEM Code Sync app installed on ${repoInfo.repoOwner}/${repoInfo.repoName} ` +
            `(${formatAdminDiagnostics(outcome)})`,
    );
    return null;
}

/** Where the run paused, so the resume line lands on the same progress row. */
export interface GitHubAppPauseOptions {
    /** The run's cancel signal. A Cancel during the wait ends the run like any other phase. */
    signal?: AbortSignal;
    /** The progress phase the pause interrupts; the resume line reuses it. */
    phase: StorefrontSetupProgressPayload['phase'];
    /** The progress value the pause interrupts; the resume line reuses it. */
    progress: number;
}

/**
 * Show the install dialog and WAIT for the App, inside the run.
 *
 * Until 2026-09-25 (EDS-20) this was a halt: the dialog went up, the run returned
 * a result flagged as awaiting the App, and when the dialog's own check saw the
 * App the only way on was Retry — a second run from phase 1 that re-created or
 * re-reset the repository, re-registered the site, and lost the cancel cleanup's
 * record that a repository had been created. The DA.live session already had the
 * right shape (`withDaLiveAuthRetry`): pause where you are, wait for the person,
 * resume from the same line. The App gets the same.
 *
 * Both gates call this — phase 1 for an existing repository that already has a
 * site, phase 3 for a new or reset one right after the site is registered — so
 * they cannot drift on what "waiting" means.
 *
 * @returns null when the App appeared and the caller continues; a failed result
 *   when the wait ran out. Throws the run's cancel error when the run is cancelled.
 */
export async function pauseForGitHubApp(
    context: HandlerContext,
    services: SetupServices,
    repoInfo: RepoInfo,
    payload: StorefrontGitHubAppRequiredPayload,
    options: GitHubAppPauseOptions,
): Promise<StorefrontSetupResult | null> {
    const repo = `${repoInfo.repoOwner}/${repoInfo.repoName}`;
    await context.sendMessage('storefront-setup-github-app-required', payload);
    const verdict = await waitForAppInstallation(
        services.githubAppService,
        repoInfo,
        context.logger,
        { signal: options.signal },
    );
    if (verdict === 'aborted') throw new Error('Operation cancelled');
    if (verdict === 'timed-out') {
        const minutes = Math.round(TIMEOUTS.EDS_CODE_SYNC_INSTALL_WAIT / (60 * 1000));
        return {
            success: false,
            error:
                `Waited ${minutes} minutes for the AEM Code Sync GitHub App on ${repo} and did ` +
                'not see it installed. Install the App, then select Retry.',
            ...repoInfo,
        };
    }
    context.logger.info(`[Storefront Setup] AEM Code Sync installed on ${repo} — resuming setup`);
    await context.sendMessage('storefront-setup-progress', {
        phase: options.phase,
        message: 'AEM Code Sync verified — resuming setup',
        subMessage: repo,
        progress: options.progress,
    } satisfies StorefrontSetupProgressPayload);
    return null;
}
