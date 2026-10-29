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

import type { RepoInfo } from '../handlers/storefrontSetup/storefrontSetupTypes';
import { GITHUB_APP_INSTALL_URL, type GitHubAppService } from './github/githubAppService';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * Delay before retrying the App check after an undetermined answer. Short
 * enough to feel responsive, long enough to ride out a momentary blip.
 */
const APP_CHECK_RETRY_DELAY_MS = 2000;

/**
 * How long to wait for Helix to register a site after a push, when the caller
 * says one has just happened.
 *
 * 10 x 2s = 20s, matching the code-bus warm-up `storefrontSetupPhase3` already
 * budgets for the same repo a moment later. Nobody has measured how long the
 * AEM Code Sync webhook actually takes to register a site, so this is a starting
 * budget, not a finding — each attempt logs, so the first real runs will say.
 */
const REGISTRATION_WAIT_ATTEMPTS = 10;
const REGISTRATION_WAIT_DELAY_MS = 2000;

/** Options for {@link resolveAppInstallation}. */
export interface ResolveAppInstallationOptions {
    /**
     * A push to this repo has JUST happened, so `404 no such site` may simply
     * mean Helix has not caught up yet — the AEM Code Sync webhook fires on the
     * push and registration follows.
     *
     * Default false, because for every other caller an outer 404 is a settled
     * answer and waiting on it only delays the verdict. Measured 2026-08-20:
     * a repo that is not a storefront 404s permanently, 28 minutes after a
     * successful code-sync trigger. Only set this where a push has just landed.
     */
    awaitRegistration?: boolean;
}

/**
 * Is this outcome the bare outer 404 — "Helix has no site for this repo"?
 *
 * Distinguished from the INNER 404 (`code.status: 404`, meaning Helix knows the
 * site and has no code sync for it) by which field carries the number. Only the
 * outer one is worth waiting on after a push; the inner one is already a real
 * answer about a site that exists.
 *
 * @param check - the raw check result
 * @returns true when Helix reported no such site
 */
function isSiteNotRegistered(check: { httpStatus?: number; codeStatus?: number }): boolean {
    return check.httpStatus === 404 && check.codeStatus === undefined;
}

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
    | {
          kind: 'undetermined';
          /** Set when Helix answered with an inner status that says nothing (400, 403…). */
          codeStatus?: number;
          httpStatus?: number;
          helixError?: string;
          noCredential?: boolean;
      };

/**
 * The reason the code endpoint (`POST admin.hlx.page/code/...`) gives in its
 * `x-error` when the AEM Code Sync App does not cover the repository. Read from a
 * live 400 on skukla/kukla-justrite, 2026-09-30 (EDS-23): the full header is
 * `[admin] github bot not installed on repository.` — matched without the prefix
 * and the full stop so a re-worded wrapper around it still counts.
 */
const APP_NOT_ON_REPOSITORY_REASON = 'github bot not installed on repository';

/**
 * Does this code-endpoint failure say the AEM Code Sync App does not cover the
 * repository? The ONLY reliable signal for that: `/status` answers an inner 400
 * both before and after the App is added (EDS-23).
 *
 * @param message - the error message (`HelixService.previewCode` carries the x-error in it)
 * @returns true when the reason is the App missing from the repository
 */
export function isAppNotOnRepositoryError(message: string): boolean {
    return message.includes(APP_NOT_ON_REPOSITORY_REASON);
}

/**
 * Plain-words answer for an SC whose code could not be published because the App
 * does not cover the repository: what happened, and the one thing to do.
 *
 * @param owner - repository owner
 * @param repo - repository name
 * @returns the message, with the install page linked
 */
export function buildAppNotOnRepositoryMessage(owner: string, repo: string): string {
    return (
        `The AEM Code Sync GitHub App is not on ${owner}/${repo}, so its code cannot reach ` +
        `the CDN. Add the repository to the App at ${GITHUB_APP_INSTALL_URL}, then publish again.`
    );
}

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
 * @param options - See {@link ResolveAppInstallationOptions}
 * @returns The classified outcome
 */
export async function resolveAppInstallation(
    githubAppService: Pick<GitHubAppService, 'isAppInstalled'>,
    repoInfo: RepoInfo,
    logger: Logger,
    options: ResolveAppInstallationOptions = {},
): Promise<AppInstallationOutcome> {
    const { repoOwner, repoName } = repoInfo;

    let check = await githubAppService.isAppInstalled(repoOwner, repoName);

    // A push has just landed and Helix has no site yet. Unlike every other
    // not-installed answer, this one is EXPECTED to change on its own: the AEM
    // Code Sync webhook fires on the push and the site appears. Waiting here is
    // what stops a freshly reset repo being reported as "App not installed"
    // purely because we asked one second too early.
    if (options.awaitRegistration && !check.isInstalled && isSiteNotRegistered(check)) {
        for (let attempt = 1; attempt <= REGISTRATION_WAIT_ATTEMPTS; attempt++) {
            logger.info(
                `[Storefront Setup] Waiting for Helix to register ${repoOwner}/${repoName} ` +
                    `(attempt ${attempt}/${REGISTRATION_WAIT_ATTEMPTS})`,
            );
            await sleep(REGISTRATION_WAIT_DELAY_MS);
            check = await githubAppService.isAppInstalled(repoOwner, repoName);
            if (!isSiteNotRegistered(check)) break;
        }
    }

    // Only an undetermined answer is worth retrying. A definitive "not
    // installed" won't change, and retrying it just delays the install prompt.
    // A missing credential is undetermined but NOT retryable — waiting cannot
    // mint a token, so skip straight to the verdict.
    if (!check.isInstalled && check.transient && !check.noCredential) {
        logger.info(
            `[Storefront Setup] AEM Code Sync check inconclusive ` +
                `(${formatAdminDiagnostics(check)}) — retrying once`,
        );
        await sleep(APP_CHECK_RETRY_DELAY_MS);
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
            codeStatus: check.codeStatus,
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

/** Options for {@link waitForAppInstallation}. */
export interface WaitForAppInstallationOptions {
    /**
     * The run's cancel signal. Read before every poll, so a Cancel lands within
     * one poll interval rather than at the end of the wait.
     */
    signal?: AbortSignal;
    /** Milliseconds between polls. Defaults to `TIMEOUTS.EDS_CODE_SYNC_POLL`. */
    pollMs?: number;
    /** The longest wait before giving up. Defaults to `TIMEOUTS.EDS_CODE_SYNC_INSTALL_WAIT`. */
    maxWaitMs?: number;
    /**
     * Ask this instead of `/status`. For a wait that `/status` cannot end: when the
     * App was found missing by the code endpoint, `/status` reads the same inner 400
     * before and after the install (EDS-23), so only the code endpoint can say.
     */
    probe?: () => Promise<boolean>;
}

/** How a wait for the App ended. */
export type AppInstallationWaitVerdict = 'installed' | 'timed-out' | 'aborted';

/**
 * Wait for AEM Code Sync to appear on a repo whose App was just found missing.
 *
 * The counterpart to {@link resolveAppInstallation}: that one asks once and
 * classifies; this one asks again every `pollMs` until the answer is "installed",
 * the caller cancels, or `maxWaitMs` is spent. It is what lets a setup run pause
 * at the install dialog and continue from the same line instead of ending there
 * (EDS-20, 2026-09-25).
 *
 * Strict mode on purpose (see `statusProbe`): a 401 or a network blip is not
 * an install, because the run is about to build on the answer; the dialog's own
 * lenient check is for reassuring a person, not for deciding whether to write.
 * A caller whose question `/status` cannot answer passes its own `probe`.
 *
 * Attempts are counted, not clocked, so a suite that mocks `sleep` can drive the
 * timeout without a real clock.
 *
 * @param githubAppService - Service performing the Helix status check
 * @param repoInfo - Repo being waited on
 * @param logger - Logger for the per-poll breadcrumb
 * @param options - See {@link WaitForAppInstallationOptions}
 * @returns How the wait ended
 */
export async function waitForAppInstallation(
    githubAppService: Pick<GitHubAppService, 'isAppInstalled'>,
    repoInfo: RepoInfo,
    logger: Logger,
    options: WaitForAppInstallationOptions = {},
): Promise<AppInstallationWaitVerdict> {
    const {
        signal,
        pollMs = TIMEOUTS.EDS_CODE_SYNC_POLL,
        maxWaitMs = TIMEOUTS.EDS_CODE_SYNC_INSTALL_WAIT,
    } = options;
    const { repoOwner, repoName } = repoInfo;
    const attempts = Math.max(1, Math.ceil(maxWaitMs / pollMs));
    const probe = options.probe ?? statusProbe(githubAppService, repoInfo, logger);
    for (let attempt = 1; attempt <= attempts; attempt++) {
        if (signal?.aborted) return 'aborted';
        await sleep(pollMs);
        if (signal?.aborted) return 'aborted';
        if (await probe()) {
            logger.info(
                `[Storefront Setup] AEM Code Sync detected on ${repoOwner}/${repoName} ` +
                    `after ${attempt} check(s)`,
            );
            return 'installed';
        }
        logger.debug(
            `[Storefront Setup] Still waiting for AEM Code Sync on ${repoOwner}/${repoName} ` +
                `(${attempt}/${attempts})`,
        );
    }
    logger.warn(
        `[Storefront Setup] Gave up waiting for AEM Code Sync on ${repoOwner}/${repoName} ` +
            `after ${attempts} checks`,
    );
    return 'timed-out';
}

/**
 * The default wait probe: ask `/status` (strict).
 *
 * This wait starts from an inner `code.status: 404`, so an inner 400 counts as the
 * install: on its own a 400 proves nothing (EDS-23), but LEAVING 404 for it is the
 * change an install makes. A 401 or a network blip still does not count — the run
 * is about to build on the answer. Phase 3 re-checks by the code endpoint.
 */
function statusProbe(
    githubAppService: Pick<GitHubAppService, 'isAppInstalled'>,
    repoInfo: RepoInfo,
    logger: Logger,
): () => Promise<boolean> {
    return async () => {
        const check = await githubAppService.isAppInstalled(repoInfo.repoOwner, repoInfo.repoName);
        logger.debug(`[Storefront Setup] AEM Code Sync poll: ${formatAdminDiagnostics(check)}`);
        return check.isInstalled || check.codeStatus === 400;
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
    codeStatus?: number,
): string {
    const repo = `${repoInfo.repoOwner}/${repoInfo.repoName}`;

    // AEM DID answer — with an inner 400, which reads the same whether or not the
    // App covers the repository (EDS-23). Not a connection problem.
    if (codeStatus === 400) {
        return (
            `AEM's status check cannot tell whether AEM Code Sync is on ${repo} (code status ` +
            `400). Storefront setup confirms it when it publishes the code.`
        );
    }

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

