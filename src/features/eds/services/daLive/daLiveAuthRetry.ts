/**
 * Recover from a DA.live credential the server refuses, mid-operation.
 *
 * A stored DA.live token can be locally valid — present, own `expiresAt` in the
 * future — and still be refused by Helix. `daLiveAuthService.isAuthenticated()`
 * cannot see that, so an up-front guard passes and the refusal lands somewhere in
 * the middle of a long pipeline.
 *
 * This is the recovery: catch `DaLiveAuthError`, prompt for re-authentication
 * through the existing `ensureDaLiveAuth` flow, and resume. Storefront setup has
 * had it since the mid-pipeline-expiry work; it lived module-private in
 * `storefrontSetupPhases.ts` and reset had nothing.
 *
 * **Why reset needed it**, measured 2026-08-16 on one project forty minutes
 * apart: run 1 carried a locally-valid but refused token, failed 52 unpublish
 * calls, could not register the site config, and died on a preview 403 — telling
 * the user at three surfaces that they lacked a role they held. Run 2, after
 * nothing but a re-auth, completed. That whole failure is one prompt's worth of
 * recoverable.
 *
 * Extracted rather than copied at the SECOND caller, not the third: the two
 * callers must agree on when a refusal is retryable, and a divergence there is
 * invisible until a pipeline fails in the field.
 *
 * @module features/eds/services/daLive/daLiveAuthRetry
 */

import { ensureDaLiveAuth } from '../../handlers/edsHelpers';
import { DaLiveAuthError } from '../types';
import type { HandlerContext } from '@/types/handlers';

/** Two re-auth attempts. A third has never recovered one that two did not. */
export const MAX_REAUTH_ATTEMPTS = 2;

export interface DaLiveAuthRetryOptions {
    /** Defaults to {@link MAX_REAUTH_ATTEMPTS}. */
    maxAttempts?: number;
    /** Log prefix, e.g. `[Storefront Setup]` or `[EdsReset]`. */
    logPrefix?: string;
    /** Names the operation in the cancellation message the user reads. */
    operationLabel?: string;
    /**
     * Tell the user their session expired, in whatever surface the caller owns —
     * a webview progress message, a notification, nothing at all. Kept as a
     * callback because the two callers have different channels and neither
     * should have to know about the other's.
     */
    onExpired?: () => Promise<void>;
    /** Re-establish anything the retry needs (services holding a dead token). */
    onBeforeRetry?: () => Promise<void>;
}

/**
 * Run `operation`, re-authenticating and retrying when DA.live refuses.
 *
 * Only `DaLiveAuthError` is retried. Anything else propagates untouched — a
 * broadened catch here would silently turn real failures into re-auth prompts,
 * which is the mirror of the bug this exists to fix.
 */
export async function withDaLiveAuthRetry<T>(
    context: HandlerContext,
    operation: () => Promise<T>,
    options: DaLiveAuthRetryOptions = {},
): Promise<T> {
    const {
        maxAttempts = MAX_REAUTH_ATTEMPTS,
        logPrefix = '[DA.live]',
        operationLabel = 'Operation',
        onExpired,
        onBeforeRetry,
    } = options;
    const logger = context.logger;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (!(error instanceof DaLiveAuthError) || attempt >= maxAttempts) {
                throw error;
            }
            logger.warn(`${logPrefix} DA.live token refused (attempt ${attempt + 1})`);
            if (onExpired) await onExpired();

            const authResult = await ensureDaLiveAuth(context, logPrefix);
            if (!authResult.authenticated) {
                throw new Error(
                    authResult.cancelled
                        ? `${operationLabel} cancelled — DA.live re-authentication required`
                        : `DA.live re-authentication failed: ${authResult.error}`,
                );
            }
            logger.info(`${logPrefix} DA.live re-authenticated`);
            if (onBeforeRetry) await onBeforeRetry();
        }
    }
    throw new Error(`${logPrefix} DA.live retry loop exhausted without result`);
}
