/**
 * The Configuration Service site-registration state machine, with no UI attached.
 *
 * Extracted from `configServiceRegistration` when the repair path needed the same
 * behaviour. Registration is not a single write: it is a small protocol —
 * 409 means the site exists and the write becomes an update, 401 means the
 * DA.live session died mid-run, and 403 may mean the admin role is still
 * propagating from a Code Sync install (30–90s) rather than a real refusal. Three
 * callers now drive it:
 *
 * - the wizard (`configServiceRegistration`), reporting into the setup progress
 *   stream, retrying a 403 only for a brand-new repo;
 * - the repair command (`repairSiteConfigHeadless`), reporting into a progress
 *   notification, retrying a 403 always — a repair runs *because* someone just
 *   granted the role, so propagation is the expected case rather than the
 *   unlikely one;
 * - the reset path (`edsResetService`), same 403 policy as the repair and for the
 *   same reason: a reset is what someone runs to fix a broken storefront. It had
 *   its own retry helper (`configServiceRetry`, now deleted) that handled only
 *   the 403, so it got no 409 or 401 handling at all until it moved here.
 *
 * Copying the protocol into each caller would have meant three places to get
 * the 409-carries-the-update's-status rule right. That rule already caused one
 * bug (a 500 on the update reported as "not authorized" with a Code Sync deep
 * link), so it lives in exactly one function.
 *
 * @module features/eds/services/siteConfigRegistrar
 */

import type { buildSiteConfigParams, ConfigurationService } from './configurationService';
import { DaLiveAuthError } from './types';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * Backoff between registration retries on a 403.
 *
 * Attempts land at +30s, +45s, +60s — the last at ~135s after the first try,
 * past the documented 30–90s admin-role propagation window.
 */
export const CONFIG_SERVICE_PROPAGATION_DELAYS_MS: readonly number[] = [
    TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY, // 30s
    TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY * 1.5, // 45s
    TIMEOUTS.CONFIG_SERVICE_RETRY_DELAY * 2, // 60s
];

/** The site config payload, exactly as {@link buildSiteConfigParams} produces it. */
type SiteParams = ReturnType<typeof buildSiteConfigParams>;

/**
 * @property registered - whether the site config is in place after this call
 * @property statusCode - the status of the call that FAILED, absent on success
 */
export interface SiteRegistrationOutcome {
    registered: boolean;
    statusCode?: number;
    /** The message from the call that FAILED — the update's, not the handled 409's. */
    error?: string;
    /** Masked addresses whose grants the update could not restore. */
    lostGrants?: string[];
}

export interface RegisterSiteConfigParams {
    configurationService: ConfigurationService;
    siteParams: SiteParams;
    logger: Logger;
    /**
     * Retry a 403 on the propagation backoff (~135s total).
     *
     * The wizard passes `true` only for a new repo, where the Code Sync install
     * just happened. A repair passes `true` unconditionally: it is invoked right
     * after a grant, so waiting is the whole point.
     */
    retryOn403: boolean;
    /** Surface progress to whatever UI the caller owns. Never used for control flow. */
    onProgress?: (message: string) => void | Promise<void>;
}

/**
 * Register a site, resolving the 409/401/403 cases.
 *
 * @throws DaLiveAuthError on 401 — the session must be re-established before any
 *   retry could mean anything, and that is the caller's job.
 */
export async function registerSiteConfig(
    params: RegisterSiteConfigParams,
): Promise<SiteRegistrationOutcome> {
    const { configurationService, siteParams, logger, retryOn403, onProgress } = params;

    const first = await configurationService.registerSite(siteParams);
    if (first.success) {
        logger.info('[ConfigService] Site registered');
        return { registered: true };
    }

    const handled = await applyRegistrationResult(first, configurationService, siteParams, logger);
    // The 409→update outcome, or the original failure when nothing handled it.
    const outcome = handled ?? {
        registered: false,
        statusCode: first.statusCode,
        error: first.error,
    };
    if (outcome.registered) return outcome;

    // Retry on the RESOLVED status, not the first response's. A site that already
    // exists answers 409, so its real refusal shows up on the UPDATE — checking
    // `first.statusCode` meant the propagation retry never ran for an existing
    // site, which is every reset and every edit.
    if (outcome.statusCode === 403 && retryOn403) {
        const retried = await retryWhilePropagating(
            configurationService,
            siteParams,
            logger,
            onProgress,
        );
        // The outcome, verbatim — not a fresh literal, and with no `?? 403`
        // fallback. Collapsing it dropped `lostGrants`, so an update that
        // succeeded on retry while failing to hand the admin list back reported a
        // clean success. And the fallback could only ever have fired on a resolved
        // failure carrying its own status (exhaustion already returns 403 via
        // `last`), stamping 403 on unrelated errors and sending the user off to
        // grant themselves a role they already hold.
        return retried;
    }

    logger.warn(`[ConfigService] Registration failed: ${outcome.error ?? first.error}`);
    return outcome;
}

/**
 * Resolve the two cases that mean something other than "it failed".
 *
 * @returns the outcome on 409→update, `null` when the caller must decide
 * @throws DaLiveAuthError on 401
 */
async function applyRegistrationResult(
    result: { success: boolean; statusCode?: number; error?: string },
    configurationService: ConfigurationService,
    siteParams: SiteParams,
    logger: Logger,
): Promise<SiteRegistrationOutcome | null> {
    if (result.statusCode === 409) {
        logger.info('[ConfigService] Site config exists, updating...');
        const update = await configurationService.updateSiteConfig(siteParams);
        // The UPDATE's 401 throws too. Checking only the first response meant an
        // existing site — every reset and every edit, since those always 409 —
        // reported a dead session as a registration failure, and all three
        // surfaces then prescribed a reset instead of a sign-in.
        if (update.statusCode === 401) {
            const authError = new DaLiveAuthError(
                `Configuration Service authentication failed: ${update.error}`,
            );
            // The write may have destroyed the admin list before failing to
            // authenticate; the throw is the only way out, so they ride on it.
            if (update.grantsRestored === false) authError.lostGrants = update.lostGrants;
            throw authError;
        }
        if (!update.success) {
            logger.warn(`[ConfigService] Site config update warning: ${update.error}`);
        }
        // The status carried out is the UPDATE's own. Reporting the handled 409
        // instead is how a 403 on the update once picked the wrong user-facing
        // message — and a 500 picked the Code Sync deep link.
        return {
            registered: update.success,
            statusCode: update.success ? undefined : update.statusCode,
            error: update.success ? undefined : update.error,
            ...(update.grantsRestored === false && { lostGrants: update.lostGrants }),
        };
    }
    if (result.statusCode === 401) {
        throw new DaLiveAuthError(`Configuration Service authentication failed: ${result.error}`);
    }
    return null;
}

/**
 * Retry while the admin role propagates.
 *
 * Per aem.live/docs/config-service-setup the Code Sync installer is granted the
 * admin role, but propagation across Adobe identity systems takes 30–90s. A 403
 * (not 401) confirms the token itself is accepted and only the role is missing,
 * which is what makes waiting worth doing.
 */
async function retryWhilePropagating(
    configurationService: ConfigurationService,
    siteParams: SiteParams,
    logger: Logger,
    onProgress?: (message: string) => void | Promise<void>,
): Promise<SiteRegistrationOutcome> {
    const delays = CONFIG_SERVICE_PROPAGATION_DELAYS_MS;
    // Carries the last refusal out, so an exhausted loop reports the status it
    // actually saw rather than a bare `{ registered: false }`.
    let last: SiteRegistrationOutcome = { registered: false, statusCode: 403 };

    for (let attempt = 0; attempt < delays.length; attempt++) {
        const delayMs = delays[attempt];
        logger.info(
            `[ConfigService] 403 — retrying after ${delayMs / 1000}s ` +
                `(attempt ${attempt + 1}/${delays.length}). Waiting for admin-role propagation...`,
        );
        await onProgress?.(
            `Waiting for Configuration Service access (${attempt + 1}/${delays.length})...`,
        );
        await sleep(delayMs);

        const retry = await configurationService.registerSite(siteParams);
        if (retry.success) {
            logger.info('[ConfigService] Site registered');
            return { registered: true };
        }

        const handled = await applyRegistrationResult(
            retry,
            configurationService,
            siteParams,
            logger,
        );
        const outcome = handled ?? {
            registered: false,
            statusCode: retry.statusCode,
            error: retry.error,
        };
        if (outcome.registered) return outcome;

        // Judge the RESOLVED status, as above. Returning on any handled result
        // ended the loop after one attempt for an existing site, because its 403
        // always arrives via the 409→update branch.
        if (outcome.statusCode !== 403) {
            logger.warn(`[ConfigService] Registration failed: ${outcome.error ?? retry.error}`);
            return outcome;
        }
        last = outcome;
    }

    return last;
}
