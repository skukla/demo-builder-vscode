/**
 * Mesh Handlers - Shared utilities and helper functions
 *
 * Common helpers used across mesh handler modules.
 */

import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { Logger } from '@/types/logger';
import {
    getSetupInstructions as getSetupInstructionsHelper,
    getEndpoint as getEndpointHelper,
} from '@/features/project-creation/helpers';
import { ErrorCode } from '@/types/errorCodes';

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
}

/**
 * Pre-flight authentication guard for mesh operations.
 *
 * Checks if the user is authenticated with Adobe and prompts them
 * to sign in via the Project Dashboard if not.
 *
 * This helper consolidates the auth guard pattern that was duplicated
 * across createHandler, checkHandler, and deleteHandler (~20 lines each).
 *
 * @param logger - Logger instance for warnings
 * @param operationName - Optional name of the operation (e.g., "create mesh", "delete mesh")
 * @returns AuthGuardResult with authentication status and error details if not authenticated
 *
 * @example
 * ```typescript
 * const authResult = await ensureAuthenticated(context.logger, 'create mesh');
 * if (!authResult.authenticated) {
 *     return {
 *         success: false,
 *         error: authResult.error,
 *         code: authResult.code,
 *     };
 * }
 * // Continue with authenticated operation
 * ```
 */
export async function ensureAuthenticated(
    logger: Logger,
    operationName = 'access API Mesh',
): Promise<AuthGuardResult> {
    const authManager = ServiceLocator.getAuthenticationService();
    const isAuthenticated = await authManager.isAuthenticated();

    if (isAuthenticated) {
        return { authenticated: true };
    }

    logger.warn(`[API Mesh] Authentication required to ${operationName}`);

    // Direct user to dashboard for authentication
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
 * Get setup instructions for API Mesh
 *
 * Returns step-by-step instructions for enabling API Mesh if not available.
 */
export function getSetupInstructions(
    context: HandlerContext,
    selectedComponents: string[] = [],
): { step: string; details: string; important?: boolean }[] | undefined {
    return getSetupInstructionsHelper(
        context.sharedState.apiServicesConfig,
        selectedComponents,
        context.sharedState.componentsData as import('../../../types/components').ComponentRegistry | undefined,
    );
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
