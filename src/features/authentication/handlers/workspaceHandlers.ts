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
import { ErrorCode } from '@/types/errorCodes';
import { toAppError, isTimeout } from '@/types/errors';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
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
    payload?: { orgId?: string; projectId?: string },
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

        // Wrap getWorkspaces with timeout (30 seconds). Thread the selected org + project
        // (webview state) so the fetch targets them, not the stale in-memory cache.
        const workspacesPromise = context.authManager?.getWorkspaces(payload);
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
 * select-workspace - Accept an Adobe workspace selection
 *
 * Phase 4a: the chosen workspace lives in webview state and is threaded
 * per-op (e.g. mesh check/deploy pass it explicitly and run under
 * `withOrgContext`). This handler therefore ACCEPTS the selection and acks it
 * to the UI WITHOUT mutating the shared `aio` global via `selectWorkspace`
 * (which races concurrent processes). A current project must still exist as a
 * drift guard.
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
        // Drift guard: a project must be selected before a workspace is chosen.
        const currentProject = await context.authManager?.getCurrentProject();
        if (!currentProject?.id) {
            throw new Error('No project selected - cannot select workspace without project context');
        }

        await context.sendMessage('workspaceSelected', { workspaceId });
        return { success: true };
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

/**
 * Create an OAuth S2S credential on the current workspace.
 *
 * Called from the Settings step when "Auto-Detect" finds no credential.
 * Uses the Adobe Console SDK to create a bare OAuth S2S credential.
 */
export async function handleCreateWorkspaceCredential(
    context: HandlerContext,
): Promise<HandlerResponse> {
    if (!context.authManager) {
        return { success: false, error: 'Authentication not available' };
    }

    try {
        context.logger.info('[Workspace] Creating OAuth S2S credential');

        const credential = await context.authManager.createWorkspaceCredential(
            'Demo Builder Commerce',
            'OAuth credential for Commerce REST API access (auto-created by Demo Builder)',
        );

        if (!credential?.clientId) {
            return { success: false, error: 'Failed to create credential. Check that you have admin access to this workspace.' };
        }

        context.logger.info(`[Workspace] OAuth S2S credential created: ${credential.name}`);
        return { success: true, data: { clientId: credential.clientId } };
    } catch (error) {
        context.logger.error('[Workspace] Failed to create credential:', error as Error);
        return { success: false, error: `Failed to create credential: ${(error as Error).message}` };
    }
}

/**
 * create-adobe-workspace — Flow A: create a new workspace in the selected project.
 *
 * Defensively re-checks developer permission (the shared `can-create-adobe-project`
 * probe may be stale) and returns an `AUTH_FORBIDDEN`-coded error so the UI drops
 * to Flow B (select existing / open console / switch org). On success, refreshes
 * the workspace list and acks the new selection (mirrors `handleSelectWorkspace`).
 * Never throws.
 */
export async function handleCreateAdobeWorkspace(
    context: HandlerContext,
    payload: { name: string; description?: string },
): Promise<HandlerResponse> {
    if (!context.authManager) {
        return { success: false, error: 'Authentication not available' };
    }

    const name = (payload?.name ?? '').trim();
    const description = payload?.description ?? '';

    try {
        // Defensive permission re-check (guards a stale probe) → UI drops to Flow B.
        const { hasPermissions, error: permError } = await context.authManager.testDeveloperPermissions();
        if (!hasPermissions) {
            return {
                success: false,
                code: ErrorCode.AUTH_FORBIDDEN,
                error: permError
                    || 'You do not have permission to create workspaces in this organization. Select an existing workspace instead.',
            };
        }

        if (!name) {
            return { success: false, error: 'Workspace name is required.' };
        }

        const workspace = await context.authManager.createWorkspace(name, description);
        if (!workspace) {
            return {
                success: false,
                error: "Could not create the workspace. You may have hit your project's workspace quota — "
                    + 'select an existing workspace instead.',
            };
        }

        // Refresh the workspace list and ack the new selection (best-effort).
        try {
            const workspaces = await context.authManager.getWorkspaces();
            await context.sendMessage('get-workspaces', workspaces);
            await context.sendMessage('workspaceSelected', { workspaceId: workspace.id });
        } catch (refreshError) {
            context.debugLogger.debug('[Workspace] Post-create refresh failed:', refreshError);
        }

        context.logger.info(`[Workspace] Created workspace: ${workspace.name}`);
        return { success: true, data: workspace };
    } catch (error) {
        context.logger.error('[Workspace] Failed to create workspace:', error as Error);
        return { success: false, error: `Failed to create workspace: ${toError(error).message}` };
    }
}
