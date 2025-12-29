/**
 * ProjectDeletionService
 *
 * Handles project deletion with confirmation, demo stopping, and retry logic
 * for handling transient filesystem errors.
 */

import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { TIMEOUTS } from '@/core/utils';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { toError } from '@/types/typeGuards';

/**
 * Retryable error codes for filesystem operations:
 * - EBUSY: Resource busy (file in use)
 * - ENOTEMPTY: Directory not empty
 * - EPERM: Permission error (temporary lock)
 * - EMFILE/ENFILE: Too many open files
 */
const RETRYABLE_CODES = ['EBUSY', 'ENOTEMPTY', 'EPERM', 'EMFILE', 'ENFILE'];
const MAX_RETRIES = 5;
const BASE_DELAY = TIMEOUTS.FILE_DELETE_RETRY_BASE;

/**
 * Delete a project with confirmation and cleanup
 *
 * Shows confirmation dialog, stops demo if running, deletes files,
 * and removes from recent projects.
 */
export async function deleteProject(
    context: HandlerContext,
    project: Project,
): Promise<HandlerResponse> {
    // Show confirmation dialog
    const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${project.name}"?`,
        {
            modal: true,
            detail: 'This will remove all project files and configuration. This action cannot be undone.',
        },
        'Delete',
    );

    if (confirm !== 'Delete') {
        // User cancelled - return success with cancelled flag (no error toast)
        return {
            success: true,
            data: { success: false, error: 'cancelled' },
        };
    }

    // Show progress notification during deletion
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Deleting "${project.name}"...`,
            cancellable: false,
        },
        async () => {
            // Stop demo if running
            if (project.status === 'running') {
                // Set as current project so stopDemo knows which to stop
                await context.stateManager.saveProject(project);
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
            }

            // Delete project files with retry logic
            const projectPath = project.path;
            if (projectPath) {
                context.logger.debug(`[Delete Project] Deleting directory: ${projectPath}`);

                // Wait for OS to release file handles
                await new Promise(resolve => setTimeout(resolve, TIMEOUTS.FILE_HANDLE_RELEASE));

                // Delete with retry
                await deleteDirectoryWithRetry(projectPath, context);
            }

            // Remove from recent projects list
            if (projectPath) {
                await context.stateManager.removeFromRecentProjects(projectPath);
            }

            // Clear current project if it was the deleted one
            const currentProject = await context.stateManager.getCurrentProject();
            if (currentProject?.path === projectPath) {
                await context.stateManager.clearProject();
            }
        },
    );

    context.logger.info(`Deleted project: ${project.name}`);

    // Show success message
    vscode.window.showInformationMessage(`"${project.name}" deleted.`);

    return {
        success: true,
        data: { success: true, projectName: project.name },
    };
}

/**
 * Delete directory with exponential backoff retry on transient filesystem errors
 */
async function deleteDirectoryWithRetry(path: string, context: HandlerContext): Promise<void> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            context.logger.debug(`[Delete Project] Attempt ${attempt + 1}/${MAX_RETRIES}`);
            await fs.rm(path, { recursive: true, force: true });
            context.logger.debug(`[Delete Project] Deletion successful`);
            return;
        } catch (error) {
            const err = toError(error);
            const code = (error as NodeJS.ErrnoException).code;
            const isRetryable = code !== undefined && RETRYABLE_CODES.includes(code);

            context.logger.debug(`[Delete Project] Error: ${code} - ${err.message} (retryable: ${isRetryable})`);

            if (isRetryable && attempt < MAX_RETRIES - 1) {
                const delay = BASE_DELAY * Math.pow(2, attempt);
                context.logger.debug(`[Delete Project] Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else if (isRetryable) {
                throw new Error(`Failed to delete project after ${MAX_RETRIES} attempts: ${err.message}`);
            } else {
                throw new Error(`Failed to delete project: ${err.message}`);
            }
        }
    }
}
