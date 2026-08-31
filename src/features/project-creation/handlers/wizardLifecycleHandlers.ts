/**
 * Lifecycle & Control Handlers
 *
 * Handles wizard lifecycle events:
 * - ready: Initial wizard ready event
 * - cancel: User cancels wizard
 * - cancel-project-creation: User cancels project creation
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { openUrl } from '@/core/utils/browserUtils';
import { validateURL } from '@/core/validation';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, HandlerContext } from '@/types/handlers';
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
 * Note: Navigation to projects list is handled by wizard's dispose() method
 * to avoid double-navigation race condition.
 */
export async function handleCancel(context: HandlerContext): Promise<SimpleResult> {
    context.logger.info('Wizard cancelled by user');
    // Disposing the panel triggers wizard's dispose() method which navigates to projects list
    context.panel?.dispose();

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
 * openProject - Returns to the projects list after wizard completion
 *
 * Called after project creation/edit completes. Disposes the wizard panel
 * and returns the user to the projects dashboard.
 */
export async function handleOpenProject(context: HandlerContext): Promise<SimpleResult> {
    context.logger.info('[Project Creation] openProject message received');

    try {
        const project = await context.stateManager.getCurrentProject();
        if (!project?.path) {
            context.logger.error('[Project Creation] No project found or path missing');
            throw new Error('Project not found');
        }

        // Set flag to reopen dashboard after panel disposal
        try {
            const demoBuilderDir = path.join(os.homedir(), '.demo-builder');
            await fsPromises.mkdir(demoBuilderDir, { recursive: true });

            const flagFile = path.join(demoBuilderDir, '.open-dashboard-after-restart');
            await fsPromises.writeFile(flagFile, JSON.stringify({
                projectName: project.name,
                projectPath: project.path,
                timestamp: Date.now(),
            }), 'utf8');
        } catch (flagError) {
            context.logger.warn('[Project Creation] Could not set reopen flag', toError(flagError).message);
        }

        // Close any existing Projects List webview before reopening
        BaseWebviewCommand.disposePanel('demoBuilder.projectsList');

        // Dispose the wizard panel — triggers projects list to reopen
        context.panel?.dispose();
    } catch (error) {
        context.logger.error('[Project Creation] Error returning to projects', error as Error);
        vscode.window.showErrorMessage('Failed to return to projects list.');
    }

    return { success: true };
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
 * openExternal - Open a URL in the system browser
 *
 * Opens the provided URL in the user's default browser.
 * Used for opening help pages, documentation, or setup pages.
 * Supports data URLs by writing to a temp file first.
 */
export async function handleOpenExternal(
    context: HandlerContext,
    payload?: { url: string },
): Promise<SimpleResult> {
    context.logger.info('[OpenExternal] Handler called');

    const { url } = payload || {};

    if (!url) {
        context.logger.warn('[OpenExternal] No URL provided');
        return { success: false, error: 'URL is required' };
    }

    try {
        if (!url.startsWith('data:')) {
            // Regular URL - validate to prevent open redirect/malicious URL attacks
            // SECURITY: Validates protocol and prevents SSRF to private networks
            try {
                validateURL(url);
            } catch (validationError) {
                context.logger.error('[OpenExternal] URL validation failed', validationError as Error);
                return { success: false, error: 'Invalid or unsafe URL' };
            }
        }

        context.logger.info('[OpenExternal] Opening URL');
        await openUrl(url, 'demo-builder-setup.html');

        context.logger.info('[OpenExternal] Successfully opened');
        return { success: true };
    } catch (error) {
        context.logger.error('[OpenExternal] Failed to open URL', error as Error);
        return { success: false, error: (error as Error).message };
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

// ============================================================================
// Handler Map Export (Step 3: Handler Registry Simplification)
// ============================================================================


/**
 * Lifecycle feature handler map
 * Maps message types to handler functions for wizard lifecycle operations
 *
 * Replaces LifecycleHandlerRegistry class with simple object literal.
 */
export const lifecycleHandlers = defineHandlers({
    // Core lifecycle handlers
    'ready': handleReady,
    'cancel': handleCancel,

    // Cancellation handlers
    'cancel-project-creation': handleCancelProjectCreation,

    // Project actions
    'openProject': handleOpenProject,

    // Utilities
    'log': handleLog,
    'openExternal': handleOpenExternal,
});
