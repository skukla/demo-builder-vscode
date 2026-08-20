/**
 * Storefront Setup Phase Helpers
 *
 * Shared helper functions used across storefront setup phases.
 * Functions land here when they are needed by multiple phase files
 * and placing them in any single phase would create a reverse or
 * circular import (e.g., Phase 2 importing from Phase 3).
 *
 * @module features/eds/handlers/storefrontSetupPhaseHelpers
 */

import {
    buildUndeterminedAppCheckError,
    formatAdminDiagnostics,
    resolveAppInstallation,
} from '../services/appInstallationResolver';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';

/**
 * Check GitHub App installation for existing repos. Returns early result if not installed.
 *
 * @param context - handler context
 * @param services - setup services
 * @param repoInfo - the repo being checked
 * @param options - `afterReset` when the repo was JUST rewritten from the template,
 *   which changes what a `404 no such site` means. See the call site in
 *   `storefrontSetupPhase1.executePhaseExistingRepo` for why the check moved.
 */
export async function checkGitHubAppForExistingRepo(
    context: HandlerContext,
    services: SetupServices,
    repoInfo: RepoInfo,
    options: { afterReset?: boolean } = {},
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { githubAppService } = services;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'storefront-code',
        message: 'Verifying GitHub App installation...',
        progress: 28,
    });

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

        await context.sendMessage('storefront-setup-github-app-required', {
            owner: repoInfo.repoOwner,
            repo: repoInfo.repoName,
            installUrl,
            siteUnregistered,
            message: siteUnregistered
                ? `Adobe has not registered ${repoInfo.repoOwner}/${repoInfo.repoName} yet.`
                : 'The AEM Code Sync GitHub App must be installed to continue.',
        });

        return {
            success: false,
            error: 'GitHub App installation required',
            awaitingGitHubApp: true,
            ...repoInfo,
        };
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
