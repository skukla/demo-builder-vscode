/**
 * Adobe I/O Authentication Guard
 *
 * Shared "check -> warn -> Sign In -> loginAndRestoreProjectContext -> verify"
 * pattern extracted from:
 * - Mesh deployment (deployMesh.ts)
 * - EDS project reset (edsResetUI.ts)
 * - Storefront setup (storefrontSetupHandlers.ts)
 *
 * @module core/auth/adobeAuthGuard
 */

import * as vscode from 'vscode';
import { withBrowserSignInNotice } from './browserSignInNotice';
import { SingleFlight } from '@/core/utils/singleFlight';
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

    const selection = await vscode.window.showWarningMessage(warningMessage, 'Sign In', 'Cancel');
    if (selection !== 'Sign In') {
        return { authenticated: false, cancelled: true };
    }

    logger.info(`${logPrefix} Starting Adobe sign-in`);
    // Signing in opens a browser window; surface progress so the click has visible effect.
    const loginSuccess = await withBrowserSignInNotice(() =>
        authManager.loginAndRestoreProjectContext(projectContext),
    );

    if (!loginSuccess || !(await authManager.isAuthenticated())) {
        return { authenticated: false };
    }

    logger.info(`${logPrefix} Adobe sign-in successful`);
    return { authenticated: true };
}
