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
 */
export async function checkGitHubAppForExistingRepo(
    context: HandlerContext,
    services: SetupServices,
    repoInfo: RepoInfo,
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
    const outcome = await resolveAppInstallation(githubAppService, repoInfo, logger);

    if (outcome.kind === 'undetermined') {
        return {
            success: false,
            error: buildUndeterminedAppCheckError(repoInfo, outcome.httpStatus, outcome.noCredential),
            ...repoInfo,
        };
    }

    if (outcome.kind === 'not-installed') {
        const installUrl = githubAppService.getInstallUrl(repoInfo.repoOwner, repoInfo.repoName);
        logger.info(
            `[Storefront Setup] AEM Code Sync is not installed on ` +
                `${repoInfo.repoOwner}/${repoInfo.repoName} (${formatAdminDiagnostics(outcome)}). ` +
                `Install URL: ${installUrl}`,
        );

        await context.sendMessage('storefront-setup-github-app-required', {
            owner: repoInfo.repoOwner,
            repo: repoInfo.repoName,
            installUrl,
            message: 'The AEM Code Sync GitHub App must be installed to continue.',
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
