/**
 * A project's LOCAL footprint, deleted: the folder (with retry), its place in the recent
 * list, the current-project pointer, and its secrets in SecretStorage.
 *
 * Split from `projectDeletionService.ts` on 2026-10-01, when the secret cleanup (PL-64)
 * would have been that 620-line file's sixteenth import. That file keeps the confirmation,
 * progress and cloud cleanup the UI delete wraps around this; the agents' `delete_project`
 * calls this directly.
 *
 * @module features/projects-dashboard/services/projectFilesDeletion
 */

import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { forgetProjectSecrets } from '@/features/projects-dashboard/services/projectSecretCleanup';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
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
 * Delete a project's LOCAL footprint — no modals, no external-resource cleanup.
 *
 * Stops the demo if running, removes the project directory (with retry), drops it
 * from the recent list, and clears the current-project pointer if it matched. The
 * headless core shared by the UI `deleteProject` (which wraps it with confirmation
 * + progress + optional EDS cloud cleanup) and the MCP `delete_project` tool
 * (which gates it with confirm + a name echo). Cloud resources are handled
 * separately (delete_github_repo / cleanup_dalive_site).
 */
export async function deleteProjectFiles(
    context: HandlerContext,
    project: Project,
): Promise<void> {
    // Stop demo if running
    if (project.status === 'running') {
        await context.stateManager.saveProject(project);
        await vscode.commands.executeCommand('demoBuilder.stopDemo');
    }

    // Delete project files with retry logic, then drop from the recent list
    const projectPath = project.path;
    if (projectPath) {
        context.logger.debug(`[Delete Project] Deleting directory: ${projectPath}`);
        await sleep(TIMEOUTS.FILE_HANDLE_RELEASE);
        await deleteDirectoryWithRetry(projectPath, context);
        await context.stateManager.removeFromRecentProjects(projectPath);
        // Only once the folder is gone: a delete that failed keeps the project, and its secrets.
        await forgetProjectSecrets(project, context.context?.secrets, (line) => context.logger.warn(line));
    }

    // Clear current project if it was the deleted one
    const currentProject = await context.stateManager.getCurrentProject();
    if (currentProject?.path === projectPath) {
        await context.stateManager.clearProject();
    }

    context.logger.info(`Deleted project: ${project.name}`);
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
                context.logger.debug(`[Delete Project] Waiting ${delay}ms before retry`);
                await sleep(delay);
            } else if (isRetryable) {
                throw new Error(`Failed to delete project after ${MAX_RETRIES} attempts: ${err.message}`);
            } else {
                throw new Error(`Failed to delete project: ${err.message}`);
            }
        }
    }
}
