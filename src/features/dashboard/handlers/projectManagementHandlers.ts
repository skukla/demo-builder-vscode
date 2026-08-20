/**
 * Dashboard Project Management Handlers
 *
 * Project-level CRUD from the dashboard: edit, delete, reset, rename, and the
 * two settings exports (save-dialog UI variant + the headless path-based twin
 * behind the export_project_settings MCP tool). Extracted from
 * `dashboardHandlers.ts` for the 500-line handler cap; the parent re-exports
 * everything here so import sites are unchanged.
 */

import * as vscode from 'vscode';
import { handleRequestStatus } from './statusHandlers';
import { deleteProject } from '@/features/projects-dashboard/services/projectDeletionService';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler } from '@/types/handlers';
import { isEdsProject } from '@/types/typeGuards';

/**
 * Handle 'editProject' message - Open the wizard in edit mode for the current project
 *
 * Mirrors the projects-home kebab's Edit action, resolved via getCurrentProject()
 * (the dashboard always operates on the current project). Reuses the shared
 * extractSettingsFromProject so both entry points feed the wizard identically.
 */
export const handleEditProject: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const { extractSettingsFromProject } = await import('@/features/projects-dashboard/services');
    // Include secrets — this is a local edit of the user's own project.
    const settings = extractSettingsFromProject(project, true);

    context.logger.info(`Opening edit wizard for project: ${project.name}`);
    await vscode.commands.executeCommand('demoBuilder.createProject', {
        editProject: {
            projectPath: project.path,
            // The SLUG, and it has to be: the wizard uses this as
            // `editOriginalName`, which the dedupe check compares against the
            // other projects' SLUGS so the user is allowed to keep their current
            // name. Feeding the title here made that comparison meaningless.
            projectName: project.name,
            // The title seeds the field, so editing shows what the user called it.
            projectTitle: project.title,
            settings,
        },
    });

    return { success: true };
};

/**
 * Handle 'deleteProject' message - Delete current project
 *
 * Uses projectDeletionService for unified delete experience including EDS cleanup.
 * Panel disposal is handled by projectDeletionService when deletion succeeds.
 */
export const handleDeleteProject: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found to delete' };
    }

    return deleteProject(context, project);
};

/**
 * Handle 'resetProject' message - Reset project to initial state
 *
 * Dispatches to the appropriate reset service based on project type:
 * - EDS projects: resetEdsProjectWithUI (template-based reset)
 * - Headless projects: resetProjectWithUI (component re-clone)
 */
export const handleResetProject: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();

    if (!project) {
        context.logger.error('[Dashboard] resetProject: No current project');
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    if (isEdsProject(project)) {
        const { resetEdsProjectWithUI } = await import('@/features/eds/services/edsResetUI');
        return resetEdsProjectWithUI({
            project,
            context,
            logPrefix: '[Dashboard]',
        });
    }

    const { resetProjectWithUI } = await import(
        '@/features/lifecycle/services/projectResetService'
    );
    return resetProjectWithUI({
        project,
        context,
        logPrefix: '[Dashboard]',
    });
};

/**
 * Handle 'exportProject' message - Export the current project's settings to a file
 *
 * Reuses the shared exportProjectSettings service (same one the kebab uses).
 */
export const handleExportProject: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const { exportProjectSettings } = await import('@/features/projects-dashboard/services');
    return exportProjectSettings(context, project);
};

/**
 * Handle 'renameProject' message - Rename the current project
 *
 * Resolves the project via getCurrentProject() (the {newName} payload is the
 * only data the dashboard sends), reuses the shared renameProjectCore, then
 * refreshes status so the dashboard title (driven by the status payload's name)
 * reflects the new name.
 */
export const handleRenameProject: MessageHandler<{ newName: string }> = async (context, data) => {
    const newName = data?.newName;
    if (!newName) {
        return { success: false, error: 'New name is required', code: ErrorCode.CONFIG_INVALID };
    }

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const { renameProjectCore } = await import('@/features/projects-dashboard/services');
    const result = await renameProjectCore(context, project, newName);

    // Refresh the dashboard title after a successful rename (folder/name changed).
    // The title is driven by the status payload's name, so re-run status.
    if (result.success && context.panel) {
        await handleRequestStatus(context);
    }

    return result;
};

/**
 * Handle 'exportProjectSettings' message — write the current project's settings
 * to a JSON file on disk (the headless entry behind the export_project_settings
 * MCP tool). Secrets go to the FILE only; the response carries just the path and
 * the includes-secrets flag, never the secret values. The target must resolve
 * inside the project directory. `includeSecrets` defaults to true (a local backup).
 */
export const handleExportProjectSettings: MessageHandler<{
    path?: string;
    includeSecrets?: boolean;
}> = async (context, data) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const { exportProjectSettingsToFile } = await import('@/features/projects-dashboard/services');
    try {
        const result = await exportProjectSettingsToFile(project, {
            path: data?.path,
            includeSecrets: data?.includeSecrets,
        });
        return { success: true, data: result };
    } catch (error) {
        context.logger.error(
            '[Dashboard] Failed to export project settings',
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to export project settings',
        };
    }
};
