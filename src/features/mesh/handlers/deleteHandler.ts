/**
 * Mesh Handlers - Delete Handler
 *
 * Handles deleting API Mesh instances.
 */

import * as vscode from 'vscode';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateWorkspaceId } from '@/core/validation';
import { ErrorCode } from '@/types/errorCodes';
import { toError } from '@/types/typeGuards';

/**
 * Handler: delete-api-mesh
 *
 * Delete API Mesh
 */
export async function handleDeleteApiMesh(
    context: HandlerContext,
    payload: { workspaceId: string },
): Promise<{
    success: boolean;
    error?: string;
    code?: ErrorCode;
}> {
    const { workspaceId } = payload;

    // SECURITY: Validate workspaceId to prevent command injection
    try {
        validateWorkspaceId(workspaceId);
    } catch (validationError) {
        context.logger.error('[API Mesh] Invalid workspace ID provided', validationError as Error);
        return {
            success: false,
            error: (validationError as Error).message,
            code: ErrorCode.MESH_CONFIG_INVALID,
        };
    }

    try {
        context.logger.info('[API Mesh] Deleting mesh for workspace', { workspaceId });

        // PRE-FLIGHT: Check authentication before any Adobe CLI operations
        const authManager = ServiceLocator.getAuthenticationService();
        const isAuthenticated = await authManager.isAuthenticated();

        if (!isAuthenticated) {
            context.logger.warn('[API Mesh] Authentication required to delete mesh');

            // Direct user to dashboard for authentication
            const selection = await vscode.window.showWarningMessage(
                'Adobe authentication required to delete API Mesh. Please sign in via the Project Dashboard.',
                'Open Dashboard',
            );

            if (selection === 'Open Dashboard') {
                await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
            }

            return {
                success: false,
                error: 'Adobe authentication required. Please sign in via the Project Dashboard.',
                code: ErrorCode.AUTH_REQUIRED,
            };
        }

        const commandManager = ServiceLocator.getCommandExecutor();
        const result = await commandManager.execute(
            'aio api-mesh delete --autoConfirmAction',
            {
                timeout: TIMEOUTS.API_CALL,
                configureTelemetry: false,
                useNodeVersion: null,
                enhancePath: true,
            },
        );

        if (result.code === 0) {
            context.logger.info('[API Mesh] Mesh deleted successfully');
            // Clear the pre-existing mesh flag since user explicitly deleted it
            // Any new mesh created after this is NOT pre-existing
            context.sharedState.meshExistedBeforeSession = undefined;
            context.logger.debug('[API Mesh] Cleared pre-existing mesh flag after explicit deletion');
            return { success: true };
        } else {
            const errorMsg = result.stderr || 'Failed to delete mesh';
            context.logger.error('[API Mesh] Delete failed', new Error(errorMsg));
            throw new Error(errorMsg);
        }
    } catch (error) {
        context.logger.error('[API Mesh Delete] Failed', error as Error);
        return {
            success: false,
            error: toError(error).message,
            code: ErrorCode.UNKNOWN,
        };
    }
}
