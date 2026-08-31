/**
 * GitHub App Check Handler
 *
 * Checks if the AEM Code Sync GitHub app is installed on a repository.
 *
 * Two modes:
 * - Strict (default): Accepts code.status 200 or 400 (app installed, possibly initializing)
 *   Used for initial detection when selecting a repository.
 * - Lenient: Accepts any status except 404 (for post-install verification)
 *   Used when user clicks "Check Again" after installing the app.
 *
 * Automatic Code Sync:
 * When Helix returns HTTP 404 (repo not indexed yet), the handler automatically:
 * 1. Triggers code sync via POST /code/{owner}/{repo}/main/*, which is what makes
 *    Helix aware of the site
 * 2. Re-asks the status endpoint, which can now answer
 * This handles the case where the GitHub app is installed but Helix hasn't indexed yet.
 */

import { getGitHubServices, tryCreateDaLiveTokenProvider } from '@/features/eds/handlers/edsHelpers';
import type { HelixCodePreview } from '@/features/eds/services/helix/helixCapabilities';
import { buildUndeterminedAppCheckError } from '@/features/eds/services/appInstallationResolver';
import { HelixService } from '@/features/eds/services/helix/helixService';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { Logger } from '@/types/logger';

interface CheckGitHubAppRequest {
    owner: string;
    repo: string;
    /** If true, use lenient mode (accept non-404). Default: false (strict mode). */
    lenient?: boolean;
    /**
     * Report what Helix says right now and stop — do NOT trigger a code sync.
     *
     * A genuine 404 means Helix has never indexed the repo, and the default path
     * answers that by triggering a sync and polling for up to three minutes. That is
     * right mid-pipeline and unusable behind a step's Continue button, so the
     * selection-time check sets this. Default false: the mid-pipeline gate keeps
     * triggering, because that is where the latency is affordable.
     */
    skipTrigger?: boolean;
}

interface CheckGitHubAppResponse {
    success: boolean;
    isInstalled: boolean;
    /** The actual code.status from the Helix admin endpoint (200, 400, 404, etc.) */
    codeStatus?: number;
    installUrl?: string;
    error?: string;
    /** Whether automatic code sync was triggered */
    codeSyncTriggered?: boolean;
    /**
     * True when the check never resolved — AEM refused the credential or was
     * unreachable. Distinct from `isInstalled: false`, which asserts the App is
     * absent. The UI must not offer the install flow for an undetermined
     * result: installing cannot fix a refused credential.
     */
    undetermined?: boolean;
    /** Human-readable cause, present only when `undetermined`. */
    reason?: string;
    /** HTTP status AEM returned, when there was one. */
    httpStatus?: number;
    /** Index signature for HandlerResponse compatibility */
    [key: string]: unknown;
}

/**
 * Ask Helix to index this repository.
 *
 * A `POST /code/{owner}/{repo}/main/*` is what makes Helix aware of the site —
 * a repo it has never seen answers `404 no such site` on `/status` until this
 * runs. So the trigger IS the remedy for an outer 404, and the only thing the
 * caller needs to know is whether Helix accepted it.
 *
 * It deliberately does NOT wait for anything afterwards. It used to poll
 * `https://main--{repo}--{owner}.aem.page/scripts/aem.js` for up to three
 * minutes and report success only if that file appeared, which was wrong twice
 * over. Measured against `skukla/kukla-bodea` on 2026-08-20:
 *
 *   11:20:07.940  Successfully previewed code: /*      <- Helix accepted it
 *   11:22:41.850  Code sync polling failed: Maximum polling attempts reached
 *
 * 1. The file cannot exist yet. A repo reaching this check is typically NOT a
 *    storefront — that is why the user ticked reset — so `scripts/aem.js` is not
 *    there and will not be until Phase 1 rewrites the repo. The poll was
 *    guaranteed to fail from its first attempt and spent 154 seconds proving it.
 * 2. Its failure discarded a good answer. The caller only re-checked the status
 *    `if (syncSucceeded)`, so a failed poll for an unrelated FILE threw away the
 *    re-check of the thing actually being asked — and the handler returned the
 *    original 404, captured BEFORE the trigger that fixes it. The user's App was
 *    installed the whole time.
 *
 * The code-bus warm-up that poll was reaching for still exists, in
 * `storefrontSetupPhase3`, which runs after the repo has storefront files and is
 * the only place the question makes sense.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param tokenService - GitHub token service for authentication
 * @param logger - Logger instance
 * @returns True if Helix accepted the request
 */
/** The two GitHubAppService calls this handler makes. */
export interface CheckGitHubAppService {
    isAppInstalled(
        owner: string,
        repo: string,
        options?: { lenient?: boolean },
    ): Promise<{
        isInstalled: boolean;
        codeStatus?: number;
        transient?: boolean;
        httpNotFound?: boolean;
        httpStatus?: number;
        helixError?: string;
        noCredential?: boolean;
    }>;
    getInstallUrl(owner: string, repo: string): string;
}

/**
 * Service seam. Defaults to the two services this handler builds from the context's
 * credentials; production never passes it.
 *
 * Both are STATELESS — credentials arrive at construction and are never mutated — so
 * ADR-015 leaves the construction here. What it cost was test design: a suite that
 * cannot hand them in has to `jest.mock` both modules, which is the wall ADR-016
 * lists for this file. Handlers take (context, payload), so this rides as a third
 * optional parameter — extra optional parameters stay assignable to `MessageHandler`.
 */
export interface CheckGitHubAppServices {
    makeHelix?: (logger: Logger, tokenService: GitHubTokenService) => HelixCodePreview;
    makeGitHubAppService?: (
        tokenService: GitHubTokenService,
        logger: Logger,
        daLiveTokenProvider: ReturnType<typeof tryCreateDaLiveTokenProvider>,
    ) => CheckGitHubAppService;
}

async function triggerCodeSync(
    owner: string,
    repo: string,
    tokenService: GitHubTokenService,
    logger: Logger,
    makeHelix: (l: Logger, gh: GitHubTokenService) => HelixCodePreview = (l, gh) =>
        new HelixService(l, gh),
): Promise<boolean> {
    logger.info(`[GitHub App Check] Triggering code sync for ${owner}/${repo}`);

    // Create HelixService with only GitHub token (no DA.live token needed for code sync)
    const helixService = makeHelix(logger, tokenService);

    try {
        await helixService.previewCode(owner, repo, '/*');
        logger.info(`[GitHub App Check] Helix accepted the code sync for ${owner}/${repo}`);
        return true;
    } catch (error) {
        logger.warn(`[GitHub App Check] Failed to trigger code sync: ${(error as Error).message}`);
        return false;
    }
}

/**
 * Summarize what the AEM admin API actually returned, omitting anything absent.
 *
 * Placeholders ("n/a") pad the line with non-information; the reader is usually
 * scanning a pasted log for the one value that explains the failure.
 */
function describeAdminResponse(result: {
    httpStatus?: number;
    codeStatus?: number;
    helixError?: string;
}): string {
    const parts: string[] = [];
    if (result.httpStatus !== undefined) parts.push(`HTTP ${result.httpStatus}`);
    if (result.codeStatus !== undefined) parts.push(`code.status ${result.codeStatus}`);
    if (result.helixError) parts.push(`x-error: ${result.helixError}`);
    return parts.length > 0 ? parts.join(', ') : 'no response';
}

export async function checkGitHubApp(
    context: HandlerContext,
    data: unknown,
    services?: CheckGitHubAppServices,
): Promise<HandlerResponse> {
    const request = data as CheckGitHubAppRequest;

    context.logger.info(`[GitHub App Check] Checking ${request.owner}/${request.repo}`);

    try {
        // Get properly initialized GitHub services
        const { tokenService } = getGitHubServices(context.context.secrets);

        // Lazy-load GitHubAppService
        const { GitHubAppService } = await import('@/features/eds/services/github/githubAppService');
        // Pass the DA.live session. Without it this check 401s on any site
        // carrying an `access.admin` role — which storefront setup now pins on
        // every project — and reports "installed=false, codeStatus=none", which
        // the wizard renders as a permanent "Registering...".
        const makeGitHubAppService =
            services?.makeGitHubAppService ??
            ((ts, l, tp) => new GitHubAppService(ts, l, tp));
        const githubAppService = makeGitHubAppService(
            tokenService,
            context.logger,
            tryCreateDaLiveTokenProvider(context.context),
        );

        // Check if app is installed
        // - Strict mode (default): Requires code.status === 200
        // - Lenient mode: Accepts any status except 404 (for post-install verification)
        const lenient = request.lenient ?? false;
        let result = await githubAppService.isAppInstalled(request.owner, request.repo, {
            lenient,
        });

        let codeSyncTriggered = false;

        // Detect HTTP 404 (repo not indexed by Helix yet).
        //
        // This MUST come from the service's explicit `httpNotFound` flag. It was
        // previously inferred from `codeStatus === undefined`, which is equally
        // true when Helix rejects the credential with HTTP 401 — so a 401 was
        // logged as "HTTP 404 detected" and fired a code-sync trigger that could
        // only 401 in turn. Two concurrent pollers did that ~40 times in a
        // minute against a repo whose App was installed and syncing fine.
        const isHttpNotFound = result.httpNotFound === true;

        if (!result.isInstalled && !isHttpNotFound) {
            context.logger.info(
                `[GitHub App Check] ${request.owner}/${request.repo}: ` +
                    `${result.transient ? 'undetermined' : 'not installed'} — ` +
                    `admin.hlx.page returned ${describeAdminResponse(result)}`,
            );
        }

        if (isHttpNotFound && request.skipTrigger) {
            context.logger.info(
                `[GitHub App Check] HTTP 404 for ${request.owner}/${request.repo} — ` +
                    'reporting without triggering a code sync (selection-time check)',
            );
        } else if (isHttpNotFound) {
            context.logger.info(
                `[GitHub App Check] HTTP 404 detected - repo not indexed yet, triggering code sync`,
            );

            const triggered = await triggerCodeSync(
                request.owner,
                request.repo,
                tokenService,
                context.logger,
                services?.makeHelix,
            );
            codeSyncTriggered = true;

            // Re-ask whenever Helix ACCEPTED the trigger. The old condition also
            // required a three-minute poll for `scripts/aem.js` to succeed, so a
            // repo that is not a storefront yet — the usual case here — never got
            // re-checked at all and the stale pre-trigger 404 was returned as the
            // verdict. The whole point of triggering is that the answer changes.
            if (triggered) {
                context.logger.info(
                    `[GitHub App Check] Re-checking status now Helix knows ${request.owner}/${request.repo}`,
                );
                result = await githubAppService.isAppInstalled(request.owner, request.repo, {
                    lenient,
                });
            }
        }

        const response: CheckGitHubAppResponse = {
            success: true,
            isInstalled: result.isInstalled,
            codeStatus: result.codeStatus,
            codeSyncTriggered,
        };

        // An undetermined check is not evidence the App is missing. Report it as
        // its own state and withhold the install URL, so no surface can render an
        // "Install App" action that could not resolve the failure.
        if (!result.isInstalled && result.transient) {
            response.undetermined = true;
            response.httpStatus = result.httpStatus;
            response.reason = buildUndeterminedAppCheckError(
                { repoOwner: request.owner, repoName: request.repo, repoUrl: '' },
                result.httpStatus,
                result.noCredential,
            );
        } else if (!result.isInstalled) {
            response.installUrl = githubAppService.getInstallUrl(request.owner, request.repo);
        }

        // INFO, not debug: this verdict gates the selection step, and the Debug Logs
        // channel is what users paste when stuck. Logging the question at info and the
        // answer at debug is why a colleague's log showed two "Checking <repo>" lines
        // and no outcome at all (2026-07-28).
        context.logger.info(
            `[GitHub App Check] ${request.owner}/${request.repo}: installed=${result.isInstalled}, codeStatus=${result.codeStatus ?? 'none'}, codeSyncTriggered=${codeSyncTriggered}`,
        );

        // Return response directly (not wrapped in { data }) so UI can access fields directly
        return response;
    } catch (error) {
        context.logger.error('[GitHub App Check] Failed', error as Error);

        // Return error response directly
        return {
            success: false,
            isInstalled: false,
            error: (error as Error).message,
        };
    }
}
