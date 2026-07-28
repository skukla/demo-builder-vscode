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

import type { GitHubAppService } from '../services/githubAppService';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

/**
 * Delay before retrying the App check after an undetermined answer. Short
 * enough to feel responsive, long enough to ride out a momentary blip.
 */
const APP_CHECK_RETRY_DELAY_MS = 2000;

/**
 * Outcome of resolving whether AEM Code Sync is installed on a repo.
 *
 * The third case is the one that matters. Helix can decline to answer — and a
 * declined answer is not a "no". Collapsing `undetermined` into `not-installed`
 * produced a field failure where a user was told eleven times to install a
 * GitHub App that was already installed and actively syncing her repo, because
 * `admin.hlx.page/status` was returning HTTP 401. No number of reinstalls could
 * have cleared it.
 */
export type AppInstallationOutcome =
    | { kind: 'installed'; codeStatus?: number }
    | { kind: 'not-installed'; codeStatus?: number; httpStatus?: number; helixError?: string }
    | { kind: 'undetermined'; httpStatus?: number; helixError?: string };

/**
 * Render whatever the AEM admin API actually told us, omitting anything it
 * didn't.
 *
 * Padding absent fields with "n/a" buries the one value that matters in a line
 * of placeholders — a real cost when the reader is triaging a pasted log.
 */
function formatAdminDiagnostics(d: {
    httpStatus?: number;
    codeStatus?: number;
    helixError?: string;
}): string {
    const parts: string[] = [];
    if (d.httpStatus !== undefined) parts.push(`HTTP ${d.httpStatus}`);
    if (d.codeStatus !== undefined) parts.push(`code.status ${d.codeStatus}`);
    if (d.helixError) parts.push(`x-error: ${d.helixError}`);
    return parts.length > 0 ? parts.join(', ') : 'no response';
}

/**
 * Resolve AEM Code Sync installation for a repo, retrying once when Helix
 * declines to answer.
 *
 * Shared by both gates (the existing-repo gate here and Phase 3's new-repo
 * gate) so they cannot drift apart on the classification that matters.
 *
 * @param githubAppService - Service performing the Helix status check
 * @param repoInfo - Repo being checked
 * @param logger - Logger for diagnostic breadcrumbs
 * @returns The classified outcome
 */
export async function resolveAppInstallation(
    githubAppService: Pick<GitHubAppService, 'isAppInstalled'>,
    repoInfo: RepoInfo,
    logger: Logger,
): Promise<AppInstallationOutcome> {
    const { repoOwner, repoName } = repoInfo;

    let check = await githubAppService.isAppInstalled(repoOwner, repoName);

    // Only an undetermined answer is worth retrying. A definitive "not
    // installed" won't change, and retrying it just delays the install prompt.
    if (!check.isInstalled && check.transient) {
        logger.info(
            `[Storefront Setup] AEM Code Sync check inconclusive ` +
                `(${formatAdminDiagnostics(check)}) — retrying once`,
        );
        await new Promise((resolve) => setTimeout(resolve, APP_CHECK_RETRY_DELAY_MS));
        check = await githubAppService.isAppInstalled(repoOwner, repoName);
    }

    if (check.isInstalled) {
        return { kind: 'installed', codeStatus: check.codeStatus };
    }

    if (check.transient) {
        logger.warn(
            `[Storefront Setup] AEM Code Sync status undetermined for ${repoOwner}/${repoName} — ` +
                `admin.hlx.page returned ${formatAdminDiagnostics(check)}. ` +
                `The App may well be installed; this is a failed check, not a missing App.`,
        );
        return {
            kind: 'undetermined',
            httpStatus: check.httpStatus,
            helixError: check.helixError,
        };
    }

    return {
        kind: 'not-installed',
        codeStatus: check.codeStatus,
        httpStatus: check.httpStatus,
        helixError: check.helixError,
    };
}

/**
 * Build the user-facing error for an undetermined App check.
 *
 * Read mid-setup by someone who wants to get unstuck, so: what failed, what to
 * do, nothing else. The two cases need different advice — a rejected sign-in is
 * fixed by re-authorizing, an unreachable service is not.
 *
 * The closing "Reinstalling the app won't help" earns its place: the failure
 * this replaces sent a user through eleven reinstalls, and it is the last thing
 * read before acting.
 */
export function buildUndeterminedAppCheckError(repoInfo: RepoInfo, httpStatus?: number): string {
    const repo = `${repoInfo.repoOwner}/${repoInfo.repoName}`;

    if (httpStatus === undefined) {
        return (
            `Couldn't verify AEM Code Sync for ${repo} — no response from AEM. ` +
            `Check your connection and re-run setup.`
        );
    }

    return (
        `Couldn't verify AEM Code Sync for ${repo} — AEM rejected your GitHub sign-in ` +
        `(HTTP ${httpStatus}). Select "Change" beside your GitHub account on the ` +
        `Storefront step, then re-run setup. Reinstalling the app won't help.`
    );
}

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
            error: buildUndeterminedAppCheckError(repoInfo, outcome.httpStatus),
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

        return { success: false, error: 'GitHub App installation required', ...repoInfo };
    }

    logger.info(
        `[Storefront Setup] AEM Code Sync verified on ${repoInfo.repoOwner}/${repoInfo.repoName} ` +
            `(${formatAdminDiagnostics(outcome)})`,
    );
    return null;
}
