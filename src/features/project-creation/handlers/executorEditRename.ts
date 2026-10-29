/**
 * Rename the project after an Edit, when the SC typed a new name in it.
 *
 * Edit runs in the project's existing folder under its original name, so the name
 * and the folder agree throughout; the new name is applied once the Edit has
 * finished, by the same rename Configure and the dashboard use. That rename moves
 * the folder, re-keys the secrets stored under its path and rewrites the AI files.
 * The name was locked in Edit until this existed, because Edit's own rename changed
 * only the label (owner, 2026-10-17).
 *
 * @module features/project-creation/handlers/executorEditRename
 */

import * as vscode from 'vscode';
import { handleRenameProject } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

type RenameProject = typeof handleRenameProject;

/**
 * @param context - the handler context
 * @param config - the Edit's config; `editRenameTo` carries the new name
 * @param rename - the shared rename (injected for tests)
 */
export async function renameAfterEdit(
    context: HandlerContext,
    config: ProjectCreationConfig,
    rename: RenameProject = handleRenameProject,
): Promise<void> {
    if (!config.editProjectPath || !config.editRenameTo) return;
    const result = await rename(context, {
        projectPath: config.editProjectPath,
        newName: config.editRenameTo,
    });
    if (result.success) return;
    // The Edit itself is saved; only the name did not change.
    context.logger.warn(`[Project Edit] Rename to "${config.editRenameTo}" failed: ${result.error ?? 'unknown'}`);
    void vscode.window.showWarningMessage(
        `Your changes were saved, but the project could not be renamed to "${config.editRenameTo}". ` +
            'Rename it on the dashboard or in project configuration.',
    );
}
