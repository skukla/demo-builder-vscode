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
 * Ensure Adobe I/O authentication, prompting sign-in if expired.
 *
 * Shared pause-and-prompt guard used by:
 * - Mesh deployment (deployMesh.ts)
 * - EDS project reset (edsResetUI.ts)
 * - Storefront setup (storefrontSetupHandlers.ts)
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

    logger.warn(`${logPrefix} Adobe I/O token expired or missing`);

    const selection = await vscode.window.showWarningMessage(
        warningMessage,
        'Sign In',
        'Cancel',
    );

    if (selection !== 'Sign In') {
        return { authenticated: false, cancelled: true };
    }

    logger.info(`${logPrefix} Starting Adobe sign-in`);
    const loginSuccess = await authManager.loginAndRestoreProjectContext(projectContext);

    if (!loginSuccess || !(await authManager.isAuthenticated())) {
        return { authenticated: false };
    }

    logger.info(`${logPrefix} Adobe sign-in successful`);
    return { authenticated: true };
}
