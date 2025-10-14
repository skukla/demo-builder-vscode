/**
 * Workspace Handlers
 *
 * Handles Adobe workspace management:
 * - get-workspaces: Fetch workspaces for current project
 * - select-workspace: Select a specific workspace
 */

import { withTimeout } from '../../utils/promiseUtils';
import { validateWorkspaceId } from '@/shared/validation';
import { TIMEOUTS } from '../../utils/timeoutConfig';
import { HandlerContext } from './HandlerContext';

/**
 * get-workspaces - Fetch workspaces for current project
 *
 * Retrieves list of workspaces available in the currently
 * selected Adobe project.
 */
export async function handleGetWorkspaces(
    context: HandlerContext,
    payload?: { orgId?: string; projectId?: string },
): Promise<{ success: boolean; workspaces?: import('@/features/authentication').AdobeWorkspace[]; error?: string }> {
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
        await context.sendMessage('workspaces', workspaces);
        return { success: true, workspaces };
    } catch (error) {
        const errorMessage = error instanceof Error && error.message.includes('timed out')
            ? error.message
            : 'Failed to load workspaces. Please try again.';

        context.logger.error('Failed to get workspaces:', error as Error);
        await context.sendMessage('workspaces', {
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
): Promise<{ success: boolean }> {
    const { workspaceId } = payload;

    // SECURITY: Validate workspace ID to prevent command injection
    try {
        validateWorkspaceId(workspaceId);
    } catch (validationError) {
        context.logger.error('[Workspace] Invalid workspace ID', validationError as Error);
        throw new Error(`Invalid workspace ID: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
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
            details: error instanceof Error ? error.message : String(error),
        });
        // Re-throw so the handler can send proper response
        throw error;
    }
}
