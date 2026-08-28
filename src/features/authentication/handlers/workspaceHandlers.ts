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
import { isConsoleOpFailure, type AdobeWorkspace } from '@/features/authentication/services/types';
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
        const workspaces = await withTimeout(workspacesPromise, {
            timeoutMs: TIMEOUTS.NORMAL,
            timeoutMessage: 'Request timed out. Please check your connection and try again.',
        });
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
 * (which races concurrent processes). A project must still be selected as a
 * drift guard.
 *
 * That guard reads the CALLER'S project (`payload.projectId`) — the same webview
 * selection every downstream op is targeted with. It used to read
 * `getCurrentProject()`, the Adobe CLI's persisted `aio console where` selection,
 * which is the wrong source twice over: the extension deliberately stopped writing
 * that global (Phase 4a), so it reflects some earlier session, and it could name a
 * project under an org this token cannot even reach. It also could not fail — the
 * resolver fabricated a name-shaped id on a miss, so `.id` was always truthy.
 */
export async function handleSelectWorkspace(
    context: HandlerContext,
    payload: { workspaceId: string; projectId?: string },
): Promise<SimpleResult> {
    const { workspaceId, projectId } = payload;

    // SECURITY: Validate workspace ID to prevent command injection
    try {
        validateWorkspaceId(workspaceId);
    } catch (validationError) {
        context.logger.error('[Workspace] Invalid workspace ID', validationError as Error);
        throw new Error(`Invalid workspace ID: ${toError(validationError).message}`);
    }

    try {
        // Drift guard: a project must be selected before a workspace is chosen.
        // Presence only — this handler runs no shell command, so the id never
        // reaches a command line (unlike the workspace id validated above).
        if (!projectId) {
            throw new Error(
                'No project selected - cannot select workspace without project context',
            );
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
 * create-adobe-workspace — Flow A: create a new workspace in the selected project.
 *
 * Defensively re-checks developer permission (the shared `can-create-adobe-project`
 * probe may be stale) and returns an `AUTH_FORBIDDEN`-coded error so the UI drops
 * to Flow B (select existing / open console / switch org). On success, returns the
 * refreshed workspace list alongside the new workspace so the caller can seed its
 * cache — see the comment on that block for why this must not be a push. Never throws.
 */
export async function handleCreateAdobeWorkspace(
    context: HandlerContext,
    payload: { name: string; description?: string; projectId?: string },
): Promise<HandlerResponse> {
    if (!context.authManager) {
        return { success: false, error: 'Authentication not available' };
    }

    const name = (payload?.name ?? '').trim();
    const description = payload?.description ?? '';

    try {
        // Defensive permission re-check (guards a stale probe) → UI drops to Flow B.
        const { hasPermissions, error: permError } =
            await context.authManager.testDeveloperPermissions();
        if (!hasPermissions) {
            return {
                success: false,
                code: ErrorCode.AUTH_FORBIDDEN,
                error:
                    permError ||
                    'You do not have permission to create workspaces in this organization. Select an existing workspace instead.',
            };
        }

        if (!name) {
            return { success: false, error: 'Workspace name is required.' };
        }

        const workspace = await context.authManager.createWorkspace(name, description);
        if (isConsoleOpFailure(workspace)) {
            // The service carries Console's own reason now — surface it instead
            // of the old quota guess, which the measured failure never matched.
            return { success: false, error: `Could not create the workspace: ${workspace.error}` };
        }

        // Refresh the workspace list and return it ON THIS RESPONSE (best-effort).
        // It must NOT be a `sendMessage` push: the only listener for `get-workspaces`
        // lives in AdobeWorkspacePicker, which AdobeWorkspaceField has replaced with
        // the create panel by the time this runs. WebviewClient drops a message with
        // no registered listener, so the pushed refresh was lost and the remounted
        // picker read a stale cache. The caller awaits this response, so it lands.
        //
        // Thread the wizard's project so the fetch takes the SDK path (the org
        // resolves via the fetcher's token-org fallback); unthreaded it would drop
        // to the stale-org CLI.
        let workspaces: AdobeWorkspace[] | undefined;
        try {
            workspaces = await context.authManager.getWorkspaces({
                projectId: payload?.projectId,
            });
        } catch (refreshError) {
            // Omitted, not empty: the caller clears its cache and reloads.
            context.debugLogger.debug('[Workspace] Post-create refresh failed:', refreshError);
        }

        context.logger.info(`[Workspace] Created workspace: ${workspace.name}`);
        return { success: true, data: workspace, workspaces };
    } catch (error) {
        context.logger.error('[Workspace] Failed to create workspace:', error as Error);
        return { success: false, error: `Failed to create workspace: ${toError(error).message}` };
    }
}
