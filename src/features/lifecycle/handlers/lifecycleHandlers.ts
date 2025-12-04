/**
 * Lifecycle & Control Handlers
 *
 * Handles wizard lifecycle events:
 * - ready: Initial wizard ready event
 * - cancel: User cancels wizard
 * - cancel-project-creation: User cancels project creation
 * - cancel-mesh-creation: User cancels mesh creation
 * - cancel-auth-polling: User cancels authentication
 */

import * as vscode from 'vscode';
import { validateProjectPath, validateURL } from '@/core/validation';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ErrorCode } from '@/types/errorCodes';
import { SimpleResult, DataResult } from '@/types/results';
import { toError } from '@/types/typeGuards';

/**
 * ready - Initial wizard ready event
 *
 * Called when the wizard webview is fully loaded and ready.
 * Loads component definitions for the component selection step.
 */
export async function handleReady(context: HandlerContext): Promise<SimpleResult> {
    context.logger.debug('Wizard webview ready');

    // Note: init message is already sent by BaseWebviewCommand with getInitialData()
    // Just load components here
    await loadComponents(context);

    return { success: true };
}

/**
 * cancel - User cancels wizard
 *
 * Disposes the wizard panel and navigates back to the projects list.
 */
export async function handleCancel(context: HandlerContext): Promise<SimpleResult> {
    context.panel?.dispose();
    context.logger.info('Wizard cancelled by user');

    // Always return to projects list with sidebar closed
    await vscode.commands.executeCommand('demoBuilder.showProjectsList');

    return { success: true };
}

/**
 * cancel-project-creation - User cancels project creation
 *
 * Aborts the active project creation process if one is running.
 */
export async function handleCancelProjectCreation(
    context: HandlerContext,
): Promise<DataResult<{ message: string }>> {
    if (context.sharedState.projectCreationAbortController) {
        context.logger.debug('[Project Creation] Cancellation requested by user');
        context.sharedState.projectCreationAbortController.abort();
        return { success: true, data: { message: 'Project creation cancelled' } };
    }
    return { success: false, data: { message: 'No active project creation to cancel' }, code: ErrorCode.PROJECT_NOT_FOUND };
}

/**
 * cancel-mesh-creation - User cancels mesh creation
 *
 * Acknowledges mesh creation cancellation.
 * (Actual cancellation logic handled by mesh creation handler)
 */
export async function handleCancelMeshCreation(
    context: HandlerContext,
): Promise<DataResult<{ cancelled: boolean }>> {
    try {
        context.logger.debug('[API Mesh] User cancelled mesh creation');
        // Set cancellation flag if needed (for future implementation)
        // For now, just acknowledge the cancellation
        return { success: true, data: { cancelled: true } };
    } catch (error) {
        context.logger.error('[API Mesh] Cancel failed', error as Error);
        return {
            success: false,
            error: toError(error).message,
            code: ErrorCode.UNKNOWN,
        };
    }
}

/**
 * cancel-auth-polling - User cancels authentication
 *
 * Cancels the Adobe authentication polling process.
 * (Polling is now handled internally by authManager.login())
 */
export async function handleCancelAuthPolling(context: HandlerContext): Promise<SimpleResult> {
    // Polling is now handled internally by authManager.login()
    context.sharedState.isAuthenticating = false;
    context.logger.debug('[Auth] Cancelled authentication request');
    return { success: true };
}

/**
 * openProject - Opens the created project in VS Code workspace
 *
 * Called after project creation completes.
 * Opens the project directory in VS Code, triggering an Extension Host restart.
 */
export async function handleOpenProject(context: HandlerContext): Promise<SimpleResult> {
    const vscode = await import('vscode');

    context.logger.info('[Project Creation] ✅ openProject message received');
    context.logger.debug(`[Project Creation] Current panel: ${context.panel ? 'exists' : 'undefined'}`);

    try {
        // Get current project to access path
        const project = await context.stateManager.getCurrentProject();

        if (!project?.path) {
            context.logger.error('[Project Creation] No project found or path missing');
            throw new Error('Project not found');
        }

        // Set flag to reopen dashboard after Extension Host restart
        try {
            const os = await import('os');
            const path = await import('path');
            const fs = await import('fs/promises');

            const demoBuilderDir = path.join(os.homedir(), '.demo-builder');
            await fs.mkdir(demoBuilderDir, { recursive: true });

            const flagFile = path.join(demoBuilderDir, '.open-dashboard-after-restart');
            await fs.writeFile(flagFile, JSON.stringify({
                projectName: project.name,
                projectPath: project.path,
                timestamp: Date.now(),
            }), 'utf8');

            context.logger.debug('[Project Creation] Set dashboard reopen flag');
        } catch (flagError) {
            context.logger.warn('[Project Creation] Could not set reopen flag', toError(flagError).message);
        }

        // Close any existing Projects List webview before opening project
        const { ShowProjectsListCommand } = await import('../../projects-dashboard/commands/showProjectsList');
        ShowProjectsListCommand.disposeActivePanel();
        context.logger.debug('[Project Creation] Closed Projects List webview if it was open');

        // Dispose this panel
        context.panel?.dispose();
        context.logger.debug('[Project Creation] Wizard closed');

        // REMOVED (Package 4 - beta.64): No longer add workspace folder
        // Previously added workspace folder, which caused terminal directory issues.
        // Now users access projects via Dashboard or status bar.
        // context.logger.info('[Project Creation] Adding project to workspace...');
        // const added = vscode.workspace.updateWorkspaceFolders(0, 0, workspaceFolder);

        // Navigate to projects list (home screen) so user can see and select their new project
        context.logger.debug('[Project Creation] Opening projects list...');
        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DASHBOARD_OPEN_DELAY));
        await vscode.commands.executeCommand('demoBuilder.showProjectsList');

    } catch (error) {
        context.logger.error('[Project Creation] Error opening project', error as Error);
        const vscodeWindow = await import('vscode');
        vscodeWindow.window.showErrorMessage('Failed to open project. Please use the tree view or status bar to access your project.');
    }

    return { success: true };
}

/**
 * browseFiles - Opens project directory in VS Code Explorer
 *
 * Reveals the project folder in the VS Code file explorer.
 */
export async function handleBrowseFiles(
    context: HandlerContext,
    payload: { projectPath: string },
): Promise<SimpleResult> {
    const vscode = await import('vscode');

    try {
        const projectPath = payload.projectPath;
        if (projectPath) {
            // SECURITY: Validate path to prevent directory traversal
            try {
                validateProjectPath(projectPath);
            } catch (validationError) {
                context.logger.error('[Project Creation] Invalid project path', validationError as Error);
                return {
                    success: false,
                    error: `Access denied: ${toError(validationError).message}`,
                    code: ErrorCode.CONFIG_INVALID,
                };
            }

            await vscode.commands.executeCommand('workbench.view.explorer');
            await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(projectPath));
            context.logger.debug('[Project Creation] Opened project in Explorer');
        }
        return { success: true };
    } catch (error) {
        context.logger.error('[Project Creation] Failed to open Explorer', error as Error);
        return { success: false, error: 'Failed to open file browser', code: ErrorCode.UNKNOWN };
    }
}

/**
 * log - Handles logging messages from webview
 *
 * Routes log messages from the webview to the appropriate logger.
 */
export async function handleLog(
    context: HandlerContext,
    payload: { level: string; message: string },
): Promise<SimpleResult> {
    const { level, message } = payload;
    switch (level) {
        case 'error':
            context.logger.error(`[Webview] ${message}`);
            break;
        case 'warn':
            context.logger.warn(`[Webview] ${message}`);
            break;
        case 'debug':
            context.logger.debug(`[Webview] ${message}`);
            break;
        default:
            context.logger.debug(`[Webview] ${message}`);
    }
    return { success: true };
}

/**
 * openAdobeConsole - Opens Adobe Developer Console in browser
 *
 * Opens the Adobe Developer Console with optional direct links to
 * specific workspace, project, or organization.
 *
 * SECURITY: Validates all constructed URLs to prevent open redirect attacks
 * even though the base URL is hardcoded.
 */
export async function handleOpenAdobeConsole(
    context: HandlerContext,
    payload?: { orgId?: string; projectId?: string; workspaceId?: string },
): Promise<SimpleResult> {
    const vscode = await import('vscode');

    try {
        let consoleUrl = 'https://developer.adobe.com/console';

        // Construct direct link to workspace if IDs are provided
        if (payload?.orgId && payload?.projectId && payload?.workspaceId) {
            consoleUrl = `https://developer.adobe.com/console/projects/${payload.orgId}/${payload.projectId}/workspaces/${payload.workspaceId}/details`;
            context.logger.debug('[Adobe Console] Opening workspace-specific URL');
        } else if (payload?.orgId && payload?.projectId) {
            consoleUrl = `https://developer.adobe.com/console/projects/${payload.orgId}/${payload.projectId}/overview`;
            context.logger.debug('[Adobe Console] Opening project-specific URL');
        } else {
            context.logger.debug('[Adobe Console] Opening generic console URL');
        }

        // SECURITY: Validate URL before opening in browser
        // This provides defense-in-depth even though base URL is hardcoded
        try {
            validateURL(consoleUrl);
        } catch (validationError) {
            context.logger.error('[Adobe Console] URL validation failed', validationError as Error);
            return { success: false, error: 'Invalid URL', code: ErrorCode.CONFIG_INVALID };
        }

        await vscode.env.openExternal(vscode.Uri.parse(consoleUrl));
        return { success: true };
    } catch (error) {
        context.logger.error('[Adobe Console] Failed to open URL', error as Error);
        return { success: false, error: 'Failed to open Adobe Console', code: ErrorCode.UNKNOWN };
    }
}

// Track logs panel visibility state for toggle behavior (shared across all handlers)
let isLogsViewShown = false;

/**
 * Toggle the logs output panel
 *
 * Shared utility for toggling the logs panel. Used by both wizard and dashboard.
 * Returns the new visibility state.
 */
export async function toggleLogsPanel(): Promise<boolean> {
    if (isLogsViewShown) {
        await vscode.commands.executeCommand('workbench.action.closePanel');
        isLogsViewShown = false;
    } else {
        await vscode.commands.executeCommand('demoBuilder.showLogs');
        isLogsViewShown = true;
    }
    return isLogsViewShown;
}

/**
 * Reset logs view state - for testing only
 * @internal
 */
export function resetLogsViewState(): void {
    isLogsViewShown = false;
}

/**
 * show-logs - Toggle the VS Code output panel with Demo Builder logs
 *
 * Toggles the output panel: shows logs if hidden, closes panel if shown.
 * This is a non-critical action - we return success even if command fails.
 */
export async function handleShowLogs(context: HandlerContext): Promise<SimpleResult> {
    try {
        const isNowShown = await toggleLogsPanel();
        context.logger.debug(`[Logs] ${isNowShown ? 'Opening' : 'Closing'} output panel`);
    } catch (error) {
        // Non-critical action - log but don't fail
        context.logger.warn('[Logs] Failed to toggle output panel', error as Error);
    }

    return { success: true };
}

/**
 * Helper: Load components
 *
 * Loads component definitions from templates/components.json
 * Uses the modern handler pattern by directly invoking the handler
 */
async function loadComponents(context: HandlerContext): Promise<void> {
    try {
        // Invoke the loadComponents handler directly
        const { handleLoadComponents } = await import('../../components/handlers/componentHandlers');
        const result = await handleLoadComponents(context);

        // Send result to webview if successful
        if (result.success && result.data && context.communicationManager) {
            const messageType = (result as { type?: string }).type || 'componentsLoaded';
            await context.communicationManager.sendMessage(messageType, result.data);
        }
    } catch (error) {
        context.logger.error('Failed to load components:', error as Error);
    }
}
