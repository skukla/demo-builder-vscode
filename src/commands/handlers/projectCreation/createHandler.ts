/**
 * Project Creation Handlers - Create Handler
 *
 * Main handler for project creation workflow with timeout and cancellation support.
 */

import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ServiceLocator } from '../../../services/serviceLocator';
import { withTimeout } from '../../../utils/promiseUtils';
import { validateProjectNameSecurity as validateProjectName } from '@/shared/validation';
import { TIMEOUTS } from '../../../utils/timeoutConfig';
import { HandlerContext } from '../HandlerContext';
import { executeProjectCreation } from './executor';
import { OVERALL_TIMEOUT_MS } from './shared';

/**
 * Handler: create-project
 *
 * Main project creation handler with timeout and cancellation support
 */
export async function handleCreateProject(
    context: HandlerContext,
    payload: Record<string, unknown>,
): Promise<{
    success: boolean;
}> {
    const config = payload;

    // SECURITY: Validate project name to prevent path traversal
    if (typeof config.projectName !== 'string') {
        throw new Error('projectName must be a string');
    }

    try {
        validateProjectName(config.projectName);
    } catch (validationError) {
        context.logger.error('[Project Creation] Invalid project name', validationError as Error);
        const errorMessage = validationError instanceof Error ? validationError.message : String(validationError);

        await context.sendMessage('creationProgress', {
            currentOperation: 'Failed',
            progress: 0,
            message: '',
            logs: [],
            error: `Invalid project name: ${errorMessage}`,
        });

        await context.sendMessage('creationFailed', {
            error: `Invalid project name: ${errorMessage}`,
            isTimeout: false,
            elapsed: '0s',
        });

        return { success: true }; // Don't throw - handler completed
    }

    const startTime = Date.now();
    const projectPath = path.join(os.homedir(), '.demo-builder', 'projects', config.projectName);

    // FIRST: Check workspace trust and offer one-time tip
    const hasShownTrustTip = context.context.globalState.get('demoBuilder.trustTipShown', false);
    if (!hasShownTrustTip && !vscode.workspace.isTrusted) {
        context.logger.info('[Project Creation] Showing one-time workspace trust tip');
        await context.context.globalState.update('demoBuilder.trustTipShown', true);

        const choice = await vscode.window.showInformationMessage(
            '💡 Tip: Trust all Demo Builder projects at once for the best experience',
            'Learn How',
            'Skip for Now',
        );

        if (choice === 'Learn How') {
            const demoBuilderPath = path.join(os.homedir(), '.demo-builder');
            vscode.window.showInformationMessage(
                `Add "${demoBuilderPath}" to your Trusted Folders ` +
                '(Cmd+Shift+P → "Workspaces: Manage Workspace Trust" → Add Folder). ' +
                'All future projects will be trusted automatically, no more dialogs!',
                'Got it!',
            );
        }
    }

    // Create abort controller for cancellation
    context.sharedState.projectCreationAbortController = new AbortController();

    try {
        context.logger.info('[Project Creation] Starting with config:', config);
        context.logger.info(`[Project Creation] Overall timeout: ${OVERALL_TIMEOUT_MS / 1000 / 60} minutes`);

        // Send initial status with progress
        await context.sendMessage('creationProgress', {
            currentOperation: 'Initializing',
            progress: 0,
            message: 'Preparing to create your project...',
            logs: [],
        });

        // Execute with timeout and cancellation support
        await withTimeout(
            executeProjectCreation(context, config),
            {
                timeoutMs: OVERALL_TIMEOUT_MS,
                timeoutMessage:
                    'Project creation timed out after 30 minutes. ' +
                    'This may indicate a network issue or very large components. ' +
                    'Please check your connection and try again.',
                signal: context.sharedState.projectCreationAbortController.signal,
            },
        );

        return { success: true };

    } catch (error) {
        const elapsed = Date.now() - startTime;
        const elapsedMin = Math.floor(elapsed / 1000 / 60);
        const elapsedSec = Math.floor((elapsed / 1000) % 60);

        context.logger.error(`[Project Creation] Failed after ${elapsedMin}m ${elapsedSec}s`, error as Error);

        // Cleanup partial project directory on failure
        try {
            if (fs.existsSync(projectPath)) {
                context.logger.info(`[Project Creation] Cleaning up partial project at ${projectPath}`);
                await fsPromises.rm(projectPath, { recursive: true, force: true });
                context.logger.info('[Project Creation] Cleanup complete');
            }

            // Cleanup API Mesh if it was created during this session
            // IMPORTANT: Only delete if we created it AND it didn't exist before
            // This prevents deleting pre-existing production meshes on cancel/failure
            if (context.sharedState.meshCreatedForWorkspace && !context.sharedState.meshExistedBeforeSession) {
                context.logger.info(`[Project Creation] Cleaning up orphaned API Mesh for workspace ${context.sharedState.meshCreatedForWorkspace}`);
                context.logger.debug('[Project Creation] Mesh was created in this session and did not exist before - safe to delete');
                try {
                    const commandManager = ServiceLocator.getCommandExecutor();
                    const deleteResult = await commandManager.execute('aio api-mesh:delete --autoConfirmAction', {
                        timeout: TIMEOUTS.API_MESH_UPDATE,
                        configureTelemetry: false,
                        enhancePath: true,
                    });

                    if (deleteResult.code === 0) {
                        context.logger.info('[Project Creation] Successfully deleted orphaned mesh');
                    } else {
                        context.logger.warn(`[Project Creation] Failed to delete orphaned mesh: ${deleteResult.stderr}`);
                    }
                } catch (meshCleanupError) {
                    context.logger.warn('[Project Creation] Error during mesh cleanup', meshCleanupError as Error);
                }
            } else if (context.sharedState.meshCreatedForWorkspace && context.sharedState.meshExistedBeforeSession) {
                context.logger.info('[Project Creation] Mesh existed before session - preserving it (not deleting on cancel/failure)');
                context.logger.debug(`[Project Creation] Pre-existing mesh preserved for workspace ${context.sharedState.meshExistedBeforeSession}`);
            }
        } catch (cleanupError) {
            context.logger.warn('[Project Creation] Failed to cleanup partial project', cleanupError as Error);
            // Don't throw - we still want to report the original error
        }

        // Determine error type
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isCancelled = errorMessage.includes('cancelled by user');
        const isTimeout = errorMessage.includes('timed out');

        await context.sendMessage('creationProgress', {
            currentOperation: isCancelled ? 'Cancelled' : 'Failed',
            progress: 0,
            message: '',
            logs: [],
            error: errorMessage,
        });

        // Send specific completion message
        if (isCancelled) {
            await context.sendMessage('creationCancelled', {
                message: 'Project creation was cancelled',
                elapsed: `${elapsedMin}m ${elapsedSec}s`,
            });
        } else {
            await context.sendMessage('creationFailed', {
                error: errorMessage,
                isTimeout,
                elapsed: `${elapsedMin}m ${elapsedSec}s`,
            });
        }

        return { success: true }; // Don't throw - handler completed successfully even if project creation failed
    } finally {
        // Cleanup
        context.sharedState.projectCreationAbortController = undefined;
        context.sharedState.meshCreatedForWorkspace = undefined;
        context.sharedState.meshExistedBeforeSession = undefined;
    }
}
