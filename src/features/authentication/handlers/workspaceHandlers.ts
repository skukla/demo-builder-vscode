/**
 * Workspace Handlers
 *
 * Handles Adobe workspace management:
 * - get-workspaces: Fetch workspaces for current project
 * - select-workspace: Select a specific workspace
 */

import { withTimeout } from '@/core/utils/promiseUtils';
import { validateWorkspaceId } from '@/core/validation';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { toError } from '@/types/typeGuards';
import { HandlerContext } from '@/types/handlers';
import { DataResult, SimpleResult } from '@/types/results';
import type { AdobeWorkspace } from '@/features/authentication/services/types';

/**
 * get-workspaces - Fetch workspaces for current project
 *
 * Retrieves list of workspaces available in the currently
 * selected Adobe project.
 */
export async function handleGetWorkspaces(
    context: HandlerContext,
    payload?: { orgId?: string; projectId?: string },
): Promise<DataResult<AdobeWorkspace[]>> {
    try {
        // Send loading status with sub-message
        const currentProject = await context.authManager.getCurrentProject();
        if (currentProject) {
            await context.sendMessage('workspace-loading-status', {
                isLoading: true,
                message: 'Loading workspaces...',
                subMessage: `Fetching from project: ${currentProject.title || currentProject.name}`,
            });
        }

        // Wrap getWorkspaces with timeout (30 seconds)
        const workspaces = await withTimeout(
            context.authManager.getWorkspaces(),
            {
                timeoutMs: TIMEOUTS.WORKSPACE_LIST,
                timeoutMessage: 'Request timed out. Please check your connection and try again.',
            },
        );
        await context.sendMessage('get-workspaces', workspaces);
        return { success: true, data: workspaces };
    } catch (error) {
        const errorMessage = error instanceof Error && error.message.includes('timed out')
            ? error.message
            : 'Failed to load workspaces. Please try again.';

        context.logger.error('Failed to get workspaces:', error as Error);
        await context.sendMessage('get-workspaces', {
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    }
}

/**
 * select-workspace - Select an Adobe workspace
 *
 * Sets the specified workspace as the current workspace context
 * in Adobe CLI configuration.
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
        // Actually call the authManager to select the workspace
        const success = await context.authManager.selectWorkspace(workspaceId);
        if (success) {
            context.logger.info(`Selected workspace: ${workspaceId}`);

            // Cache invalidation is handled in authManager.selectWorkspace

            await context.sendMessage('workspaceSelected', { workspaceId });
            return { success: true };
        } else {
            context.logger.error(`Failed to select workspace ${workspaceId}`);
            await context.sendMessage('error', {
                message: 'Failed to select workspace',
                details: `Workspace selection for ${workspaceId} was unsuccessful`,
            });
            throw new Error(`Failed to select workspace ${workspaceId}`);
        }
    } catch (error) {
        context.logger.error('Failed to select workspace:', error as Error);
        await context.sendMessage('error', {
            message: 'Failed to select workspace',
            details: toError(error).message,
        });
        // Re-throw so the handler can send proper response
        throw error;
    }
}
