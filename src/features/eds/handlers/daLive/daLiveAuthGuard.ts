/**
 * The DA.live session guard: before an operation that needs DA.live, check the
 * stored token and, when it is expired or refused, pause and ask the SC to sign in.
 *
 * The sign-in itself is `daLiveAuthPrompt`'s; this decides whether to run it and
 * what to say first.
 *
 * @module features/eds/handlers/daLive/daLiveAuthGuard
 */

import { getDaLiveAuthService } from '../edsServiceCache';
import { showDaLiveAuthQuickPick, type DaLiveAuthContext } from './daLiveAuthPrompt';
import { askDuringOperation, modalIsAsking } from '@/core/vscode/operationPrompt';

export interface DaLiveGuardResult {
    /** Whether the user is now authenticated */
    authenticated: boolean;
    /** User dismissed the dialog without signing in */
    cancelled?: boolean;
    /** Error message if auth failed */
    error?: string;
}

/**
 * Ensure DA.live authentication, prompting sign-in if expired or refused.
 *
 * Shared pause-and-prompt guard used by:
 * - EDS project reset (edsResetPreflight.ts)
 * - Storefront setup pre-flight (storefrontSetupHandlers.ts)
 * - Storefront setup mid-pipeline recovery (storefrontSetupPhases.ts)
 *
 * Asks IMS, through the one sign-in reader (`DaLiveAuthService.checkSignIn`), whether
 * the stored token still works: a local expiry check cannot see a token IMS has
 * cancelled, and on 2026-10-28 a forced Adobe sign-in cancelled one with 23 hours
 * left. `unknown` (IMS did not answer) carries on as signed in: a flaky network must
 * never block work the token can still do, and a real refusal stops the first DA.live
 * call that meets it.
 */
export async function ensureDaLiveAuth(
    context: DaLiveAuthContext,
    logPrefix = '[Auth]',
): Promise<DaLiveGuardResult> {
    const signIn = await getDaLiveAuthService(context.context).checkSignIn();
    if (signIn.state === 'valid' || signIn.state === 'unknown') {
        return { authenticated: true };
    }

    // A server refusal and a local expiry get different prompt copy — telling
    // a user their session "expired" when the server just refused a live-dated
    // token sends them to check the wrong thing.
    const refusedByServer = signIn.state === 'refused';
    context.logger.warn(
        refusedByServer
            ? `${logPrefix} DA.live token is locally valid but IMS no longer accepts it — re-authentication required`
            : `${logPrefix} DA.live token expired or missing`,
    );

    const expiry = refusedByServer
        ? 'Adobe no longer accepts your DA.live sign-in.'
        : 'Your DA.live session has expired.';

    // In a modal the expiry line heads the sign-in FORM: a Sign In button in front
    // of a form the modal was going to show anyway is a click that asks nothing
    // (owner, 2026-09-20). With no modal up, it is the notification it always was,
    // and its answer opens the input-box flow below.
    if (!modalIsAsking()) {
        const selection = await askDuringOperation(
            { title: 'Sign in to DA.live', message: `${expiry} Sign in to keep going.` },
            'Sign In',
        );
        if (selection !== 'Sign In') {
            return { authenticated: false, cancelled: true };
        }
    }

    const authResult = await showDaLiveAuthQuickPick(context, expiry);

    if (!authResult.cancelled && authResult.success) {
        return { authenticated: true };
    }

    return {
        authenticated: false,
        cancelled: authResult.cancelled,
        error: authResult.error || 'DA.live authentication required',
    };
}
