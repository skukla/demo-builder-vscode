/**
 * Mesh Handlers - Shared utilities and helper functions
 *
 * Common helpers used across mesh handler modules.
 */

import * as vscode from 'vscode';
import { getEndpoint as getEndpointHelper } from '../services/meshEndpoint';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { ErrorCode } from '@/types/errorCodes';
import { HandlerContext } from '@/types/handlers';

/**
 * Result of authentication guard check.
 */
export interface AuthGuardResult {
    /** Whether the user is authenticated */
    authenticated: boolean;
    /** Error message if not authenticated */
    error?: string;
    /** Error code if not authenticated */
    code?: ErrorCode;
    /**
     * Which sign-in the AGENT surface should offer. Present only on the headless
     * branch — a webview gets the notification instead, and a marker it cannot use.
     */
    needsAuth?: 'adobe';
}

/**
 * Pre-flight authentication guard for mesh operations.
 *
 * This helper consolidates the auth guard pattern that was duplicated across
 * createHandler, checkHandler, and deleteHandler (~20 lines each).
 *
 * IT BRANCHES ON THE SURFACE, and until 2026-09-01 it did not. It always called
 * `vscode.window.showWarningMessage(..., 'Open Dashboard')` and AWAITED the
 * click — so an unauthenticated call from an MCP TOOL put a notification on the
 * user's window and blocked the tool until somebody dismissed it. An agent
 * cannot click, and the user had no idea what was waiting on them.
 *
 * `dataInstallerHandlers` had already met this and written down the rule:
 * "`ensureAdobeIOAuth` shows a VS Code warning notification: correct from a
 * webview, wrong from an agent tool, where it would pop a modal on the user's
 * window and block the tool until someone clicks." The mesh handlers never got
 * that treatment. Found 2026-08-31 by reviewing all 114 tools for the
 * credentials rule.
 *
 * So: prompt when a panel is present, and on the agent surface report with the
 * `needsAuth` marker instead. `defaultShape` now carries that marker through to
 * the caller, so the agent is told which sign-in to offer rather than handed
 * prose.
 *
 * @param context - the handler context; `context.panel` is what says whether a
 *   human is looking at this
 * @param operationName - Optional name of the operation (e.g., "create mesh")
 * @returns AuthGuardResult with authentication status and error details if not authenticated
 *
 * @example
 * ```typescript
 * const authResult = await ensureAuthenticated(context, 'create mesh');
 * if (!authResult.authenticated) {
 *     return {
 *         success: false,
 *         error: authResult.error,
 *         code: authResult.code,
 *         ...(authResult.needsAuth ? { needsAuth: authResult.needsAuth } : {}),
 *     };
 * }
 * // Continue with authenticated operation
 * ```
 */
export async function ensureAuthenticated(
    context: Pick<HandlerContext, 'logger' | 'panel'>,
    operationName = 'access API Mesh',
): Promise<AuthGuardResult> {
    const authManager = ServiceLocator.getAuthenticationService();
    const isAuthenticated = await authManager.isAuthenticated();

    if (isAuthenticated) {
        return { authenticated: true };
    }

    context.logger.warn(`[API Mesh] Authentication required to ${operationName}`);

    if (context.panel === undefined) {
        // Agent surface: report, never prompt. Awaiting a click here would block
        // the tool on a person who does not know they are being waited for.
        return {
            authenticated: false,
            error: `Adobe sign-in required to ${operationName}. Check get_auth_status, then sign_in(provider:"adobe", confirm:true) once the user agrees.`,
            code: ErrorCode.AUTH_REQUIRED,
            needsAuth: 'adobe',
        };
    }

    // Webview surface: a person is looking at this, so offer the way there.
    const selection = await vscode.window.showWarningMessage(
        `Adobe authentication required to ${operationName}. Please sign in via the Project Dashboard.`,
        'Open Dashboard',
    );

    if (selection === 'Open Dashboard') {
        await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
    }

    return {
        authenticated: false,
        error: 'Adobe authentication required. Please sign in via the Project Dashboard.',
        code: ErrorCode.AUTH_REQUIRED,
    };
}

/**
 * Get mesh endpoint using single source of truth approach
 *
 * Uses a 3-tier strategy:
 * 1. Use cached endpoint if available (instant)
 * 2. Call aio api-mesh:describe (official Adobe method, ~3s)
 * 3. Construct from meshId as reliable fallback
 */
export async function getEndpoint(
    context: HandlerContext,
    meshId: string,
    cachedEndpoint?: string,
): Promise<string> {
    const commandManager = ServiceLocator.getCommandExecutor();
    return getEndpointHelper(
        meshId,
        cachedEndpoint,
        commandManager,
        context.logger,
        context.debugLogger,
    );
}
