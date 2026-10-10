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
 * Ensure DA.live authentication, prompting sign-in if expired.
 *
 * Shared pause-and-prompt guard used by:
 * - EDS project reset (edsResetPreflight.ts)
 * - Storefront setup pre-flight (storefrontSetupHandlers.ts)
 * - Storefront setup mid-pipeline recovery (storefrontSetupPhases.ts)
 */
export async function ensureDaLiveAuth(
    context: DaLiveAuthContext,
    logPrefix = '[Auth]',
    probeOrg?: string,
): Promise<DaLiveGuardResult> {
    const daLiveAuthService = getDaLiveAuthService(context.context);

    // A server refusal and a local expiry get different prompt copy — telling
    // a user their session "expired" when the server just refused a live-dated
    // token sends them to check the wrong thing.
    let refusedByServer = false;

    if (await daLiveAuthService.isAuthenticated()) {
        // Local pass. When the caller told us which org the coming operation
        // targets, ask the SERVER too — the local check reads the token's own
        // expiry and cannot see a server-refused credential (the 2026-08-16
        // evidence run passed it and then failed 52 authenticated calls, each
        // 403 misread as a missing permission). One HEAD; `unknown` (network
        // trouble) fails open — a flaky probe must never block a pipeline the
        // credential could serve.
        if (!probeOrg) {
            return { authenticated: true };
        }
        const verdict = await daLiveAuthService.isServerAccepted(probeOrg);
        if (verdict !== 'refused') {
            return { authenticated: true };
        }
        refusedByServer = true;
        context.logger.warn(
            `${logPrefix} DA.live token is locally valid but the server refused it — re-authentication required`,
        );
    } else {
        context.logger.warn(`${logPrefix} DA.live token expired or missing`);
    }

    const expiry = refusedByServer
        ? 'Your DA.live session was refused by the server.'
        : 'Your DA.live session has expired.';

    // In a modal the expiry line heads the sign-in FORM: a Sign In button in front
    // of a form the modal was going to show anyway is a click that asks nothing
    // (owner, 2026-09-20). With no modal up, it is the notification it always was,
    // and its answer opens the input-box flow below.
    if (!modalIsAsking()) {
        const selection = await askDuringOperation(`${expiry} Please sign in to continue.`, 'Sign In');
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
