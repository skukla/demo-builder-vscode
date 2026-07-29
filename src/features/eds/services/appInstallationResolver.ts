/**
 * AEM Code Sync Installation Resolver
 *
 * The single classifier for "is AEM Code Sync installed on this repo?".
 *
 * It lives in the services layer because every gate and every UI surface must
 * agree on the answer — the storefront-setup gates, the wizard's check handler,
 * and the project-reset preflight. When they disagreed, a refused credential
 * was reported as a missing GitHub App and users reinstalled an App that was
 * already there.
 *
 * @module features/eds/services/appInstallationResolver
 */

import type { RepoInfo } from '../handlers/storefrontSetupTypes';
import type { GitHubAppService } from './githubAppService';
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
    | { kind: 'undetermined'; httpStatus?: number; helixError?: string; noCredential?: boolean };

/**
 * Render whatever the AEM admin API actually told us, omitting anything it
 * didn't.
 *
 * Padding absent fields with "n/a" buries the one value that matters in a line
 * of placeholders — a real cost when the reader is triaging a pasted log.
 */
export function formatAdminDiagnostics(d: {
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
    // A missing credential is undetermined but NOT retryable — waiting cannot
    // mint a token, so skip straight to the verdict.
    if (!check.isInstalled && check.transient && !check.noCredential) {
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
            noCredential: check.noCredential,
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
export function buildUndeterminedAppCheckError(
    repoInfo: RepoInfo,
    httpStatus?: number,
    noCredential?: boolean,
): string {
    const repo = `${repoInfo.repoOwner}/${repoInfo.repoName}`;

    if (noCredential) {
        return `Couldn't verify AEM Code Sync for ${repo} — you're not signed in to GitHub. `
            + `Sign in on the Storefront step, then re-run setup.`;
    }

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

