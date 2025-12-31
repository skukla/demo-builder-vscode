/**
 * Workspace Handlers
 *
 * Handles Adobe workspace management:
 * - get-workspaces: Fetch workspaces for current project
 * - select-workspace: Select a specific workspace
 */

import { withTimeout } from '@/core/utils/promiseUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateWorkspaceId } from '@/core/validation';
import type { AdobeWorkspace } from '@/features/authentication/services/types';
import { toAppError, isTimeout } from '@/types/errors';
import { HandlerContext } from '@/types/handlers';
import { DataResult, SimpleResult } from '@/types/results';
import { toError } from '@/types/typeGuards';

/**
 * get-workspaces - Fetch workspaces for current project
 *
 * Retrieves list of workspaces available in the currently
 * selected Adobe project.
 */
export async function handleGetWorkspaces(
    context: HandlerContext,
    _payload?: { orgId?: string; projectId?: string },
): Promise<DataResult<AdobeWorkspace[]>> {
    try {
        // Send loading status with sub-message
        const currentProject = await context.authManager?.getCurrentProject();
        if (currentProject) {
            await context.sendMessage('workspace-loading-status', {
                isLoading: true,
                message: 'Loading workspaces...',
                subMessage: `Fetching from project: ${currentProject.title || currentProject.name}`,
            });
        }

        // Wrap getWorkspaces with timeout (30 seconds)
        const workspacesPromise = context.authManager?.getWorkspaces();
        if (!workspacesPromise) {
            throw new Error('Auth manager not available');
        }
        const workspaces = await withTimeout(
            workspacesPromise,
            {
                timeoutMs: TIMEOUTS.NORMAL,
                timeoutMessage: 'Request timed out. Please check your connection and try again.',
            },
        );
        await context.sendMessage('get-workspaces', workspaces);
        return { success: true, data: workspaces };
    } catch (error) {
        const appError = toAppError(error);
        const errorMessage = isTimeout(appError)
            ? appError.userMessage
            : 'Failed to load workspaces. Please try again.';

        context.logger.error('[Workspace] Failed to get workspaces:', appError);
        await context.sendMessage('get-workspaces', {
            error: errorMessage,
            code: appError.code,
        });
        return { success: false, error: errorMessage, code: appError.code };
    }
}

/**
 * select-workspace - Select an Adobe workspace
 *
 * Sets the specified workspace as the current workspace context
 * in Adobe CLI configuration.
 *
 * Requires project ID to protect against context drift
 * (e.g., when another process changes the global Adobe CLI context).
 */
export async function handleSelectWorkspace(
    context: HandlerContext,
    payload: { workspaceId: string },
): Promise<SimpleResult> {
    const { workspaceId } = payload;

    // SECURITY: Validate workspace ID to prevent command injection
    try {
        validateWorkspaceId(workspaceId);
    } catch (validationError) {
        context.logger.error('[Workspace] Invalid workspace ID', validationError as Error);
        throw new Error(`Invalid workspace ID: ${toError(validationError).message}`);
    }

    try {
        // Get project ID for context guard (required for drift protection)
        const currentProject = await context.authManager?.getCurrentProject();
        if (!currentProject?.id) {
            throw new Error('No project selected - cannot select workspace without project context');
        }

        // Select workspace with project context guard to protect against context drift
        const success = await context.authManager?.selectWorkspace(workspaceId, currentProject.id);
        if (success) {
            // Note: Selection already logged by adobeEntityService with workspace name

            // Cache invalidation is handled in authManager.selectWorkspace

            await context.sendMessage('workspaceSelected', { workspaceId });
            return { success: true };
        } else {
            context.logger.error(`[Workspace] Failed to select workspace ${workspaceId}`);
            await context.sendMessage('error', {
                message: 'Failed to select workspace',
                details: `Workspace selection for ${workspaceId} was unsuccessful`,
            });
            throw new Error(`Failed to select workspace ${workspaceId}`);
        }
    } catch (error) {
        context.logger.error('[Workspace] Failed to select workspace:', error as Error);
        await context.sendMessage('error', {
            message: 'Failed to select workspace',
            details: toError(error).message,
        });
        // Re-throw so the handler can send proper response
        throw error;
    }
}
