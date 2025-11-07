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

import { validateProjectPath, validateURL } from '@/core/validation';
import { HandlerContext } from '@/features/project-creation/handlers/HandlerContext';
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
 * Disposes the wizard panel and logs cancellation.
 */
export async function handleCancel(context: HandlerContext): Promise<SimpleResult> {
    context.panel?.dispose();
    context.logger.info('Wizard cancelled by user');
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
        context.logger.info('[Project Creation] Cancellation requested by user');
        context.sharedState.projectCreationAbortController.abort();
        return { success: true, data: { message: 'Project creation cancelled' } };
    }
    return { success: false, data: { message: 'No active project creation to cancel' } };
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
        context.logger.info('[API Mesh] User cancelled mesh creation');
        // Set cancellation flag if needed (for future implementation)
        // For now, just acknowledge the cancellation
        return { success: true, data: { cancelled: true } };
    } catch (error) {
        context.logger.error('[API Mesh Cancel] Failed', error as Error);
        return {
            success: false,
            error: toError(error).message,
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
    context.logger.info('[Auth] Cancelled authentication request');
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

        // Close any existing Welcome webview before opening project
        const { WelcomeWebviewCommand } = await import('../../welcome/commands/showWelcome');
        WelcomeWebviewCommand.disposeActivePanel();
        context.logger.debug('[Project Creation] Closed Welcome webview if it was open');

        // Dispose this panel
        context.panel?.dispose();
        context.logger.info('[Project Creation] Wizard closed');

        // REMOVED (Package 4 - beta.64): No longer add workspace folder
        // Previously added workspace folder, which caused terminal directory issues.
        // Now users access projects via Dashboard or status bar.
        // context.logger.info('[Project Creation] Adding project to workspace...');
        // const added = vscode.workspace.updateWorkspaceFolders(0, 0, workspaceFolder);

        // Open dashboard directly (no workspace manipulation)
        context.logger.info('[Project Creation] Opening project dashboard...');
        await new Promise(resolve => setTimeout(resolve, 500));
        await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');

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
                };
            }

            await vscode.commands.executeCommand('workbench.view.explorer');
            await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(projectPath));
            context.logger.info('[Project Creation] Opened project in Explorer');
        }
        return { success: true };
    } catch (error) {
        context.logger.error('[Project Creation] Failed to open Explorer', error as Error);
        return { success: false, error: 'Failed to open file browser' };
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
            context.logger.info(`[Webview] ${message}`);
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

        context.logger.info('[Adobe Console] Received data from webview', {
            data: payload,
            hasOrgId: !!payload?.orgId,
            hasProjectId: !!payload?.projectId,
            hasWorkspaceId: !!payload?.workspaceId,
        });

        // Construct direct link to workspace if IDs are provided
        if (payload?.orgId && payload?.projectId && payload?.workspaceId) {
            consoleUrl = `https://developer.adobe.com/console/projects/${payload.orgId}/${payload.projectId}/workspaces/${payload.workspaceId}/details`;
            context.logger.info('[Adobe Console] Opening workspace-specific URL', {
                url: consoleUrl,
                orgId: payload.orgId,
                projectId: payload.projectId,
                workspaceId: payload.workspaceId,
            });
        } else if (payload?.orgId && payload?.projectId) {
            consoleUrl = `https://developer.adobe.com/console/projects/${payload.orgId}/${payload.projectId}/overview`;
            context.logger.info('[Adobe Console] Opening project-specific URL', {
                url: consoleUrl,
                orgId: payload.orgId,
                projectId: payload.projectId,
            });
        } else {
            context.logger.info('[Adobe Console] Opening generic console URL (missing IDs)', { data: payload });
        }

        // SECURITY: Validate URL before opening in browser
        // This provides defense-in-depth even though base URL is hardcoded
        try {
            validateURL(consoleUrl);
        } catch (validationError) {
            context.logger.error('[Adobe Console] URL validation failed', validationError as Error);
            return { success: false };
        }

        await vscode.env.openExternal(vscode.Uri.parse(consoleUrl));
        return { success: true };
    } catch (error) {
        context.logger.error('[Adobe Console] Failed to open URL', error as Error);
        return { success: false };
    }
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
