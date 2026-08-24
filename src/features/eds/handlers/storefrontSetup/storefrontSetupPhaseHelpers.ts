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
} from '../../services/appInstallationResolver';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';
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

        await context.sendMessage('storefront-setup-github-app-required', {
            owner: repoInfo.repoOwner,
            repo: repoInfo.repoName,
            installUrl,
            siteUnregistered,
            message: 'The AEM Code Sync GitHub App must be installed to continue.',
        } satisfies StorefrontGitHubAppRequiredPayload);

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
