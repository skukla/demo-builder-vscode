/**
 * Adobe I/O Authentication Guard
 *
 * Shared "check -> warn -> Sign In -> loginAndRestoreProjectContext -> verify"
 * pattern extracted from:
 * - Mesh deployment (deployMesh.ts)
 * - EDS project reset (edsResetPreflight.ts)
 * - Storefront setup (storefrontSetupHandlers.ts)
 *
 * @module core/auth/adobeAuthGuard
 */

import { withBrowserSignInNotice } from './browserSignInNotice';
import { signInWasCancelled } from './signInSession';
import { SingleFlight } from '@/core/utils/singleFlight';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { askDuringOperation } from '@/core/vscode/operationPrompt';
import type { Logger } from '@/types/logger';

export interface AdobeAuthResult {
    /** Whether the user is now authenticated */
    authenticated: boolean;
    /** User dismissed the dialog without signing in */
    cancelled?: boolean;
}

export interface AdobeAuthManager {
    isAuthenticated(): Promise<boolean>;
    loginAndRestoreProjectContext(context: Record<string, unknown>): Promise<boolean>;
}

/**
 * The pending sign-in prompt+login, shared by concurrent callers. Adobe has ONE
 * session, so a second guard that fires while a prompt is already up must reuse it:
 * a duplicate `showWarningMessage` with the same text makes VS Code collapse the two
 * and resolve the first as a phantom cancel — a premature "sign-in was cancelled".
 */
const signInFlight = new SingleFlight<AdobeAuthResult>();

/**
 * Ensure Adobe I/O authentication, prompting sign-in if expired.
 *
 * Shared pause-and-prompt guard for the many sign-in-gated flows (mesh deploy, EDS
 * reset, storefront setup, store discovery, App Builder component guards, …).
 * Concurrent callers share a single prompt (see {@link signInFlight}).
 */
export async function ensureAdobeIOAuth(options: {
    authManager: AdobeAuthManager;
    logger: Logger;
    logPrefix?: string;
    projectContext?: Record<string, unknown>;
    warningMessage?: string;
}): Promise<AdobeAuthResult> {
    const {
        authManager,
        logger,
        logPrefix = '[Auth]',
        projectContext = {},
        warningMessage = 'Adobe sign-in required to continue.',
    } = options;

    if (await authManager.isAuthenticated()) {
        return { authenticated: true };
    }

    // Concurrent callers share ONE prompt (SingleFlight does the synchronous
    // check-and-set), so a second caller never shows a duplicate notification.
    return signInFlight.run(
        () => promptAndSignIn(authManager, logger, logPrefix, projectContext, warningMessage),
        () => logger.info(`${logPrefix} Reusing the in-flight Adobe sign-in prompt`),
    );
}

/** Show the sign-in prompt and, on "Sign In", run the browser login with progress. */
async function promptAndSignIn(
    authManager: AdobeAuthManager,
    logger: Logger,
    logPrefix: string,
    projectContext: Record<string, unknown>,
    warningMessage: string,
): Promise<AdobeAuthResult> {
    logger.warn(`${logPrefix} Adobe I/O token expired or missing`);

    // Name the wait, and never hold an operation on it forever: an agent-path
    // deploy sat 9+ minutes on this exact prompt in a window nobody was
    // watching (2026-08-27) — the third interactive pause of the day to hang a
    // headless call silently (consent modal, teardown, now this). Unanswered
    // resolves into the existing cancelled path. The operation does not resume on
    // a late "Sign In", but the sign-in itself still runs: a VS Code modal cannot
    // be taken down from code, so it stays on screen after the wait ends, and a
    // button that does nothing when pressed reads as broken (owner, 2026-10-31,
    // after pressing it seven hours on).
    logger.info(`${logPrefix} awaiting the sign-in prompt in the VS Code window`);
    let timedOut = false;
    const asked = askDuringOperation({ title: 'Sign in to Adobe', message: warningMessage }, 'Sign In', 'Cancel');
    const selection = await Promise.race([
        asked,
        new Promise<undefined>((resolve) =>
            setTimeout(() => {
                timedOut = true;
                resolve(undefined);
            }, TIMEOUTS.LONG),
        ),
    ]);
    if (selection !== 'Sign In') {
        if (timedOut) {
            logger.warn(`${logPrefix} sign-in prompt unanswered — treating as cancelled`);
            void asked.then((late) => signInLate(late, authManager, logger, logPrefix, projectContext));
        }
        return { authenticated: false, cancelled: true };
    }

    logger.info(`${logPrefix} Starting Adobe sign-in`);
    const loginSuccess = await signIn(authManager, projectContext);

    if (!loginSuccess || !(await authManager.isAuthenticated())) {
        return signInWasCancelled() ? { authenticated: false, cancelled: true } : { authenticated: false };
    }

    logger.info(`${logPrefix} Adobe sign-in successful`);
    return { authenticated: true };
}

/** Signing in happens in the browser; say so where the SC is looking, with a Cancel. */
function signIn(authManager: AdobeAuthManager, projectContext: Record<string, unknown>): Promise<boolean> {
    return withBrowserSignInNotice(() => authManager.loginAndRestoreProjectContext(projectContext));
}

/** "Sign In" pressed after the operation stopped waiting: sign in, and resume nothing. */
async function signInLate(
    late: string | undefined,
    authManager: AdobeAuthManager,
    logger: Logger,
    logPrefix: string,
    projectContext: Record<string, unknown>,
): Promise<void> {
    if (late !== 'Sign In') return;
    logger.info(`${logPrefix} Sign In pressed after the wait ended — signing in; the operation is not resumed`);
    try {
        await signIn(authManager, projectContext);
    } catch (error) {
        logger.warn(`${logPrefix} late sign-in failed: ${(error as Error).message}`);
    }
}
