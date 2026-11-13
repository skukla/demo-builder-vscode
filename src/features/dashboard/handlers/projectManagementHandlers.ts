/**
 * Dashboard Project Management Handlers
 *
 * Project-level actions from the dashboard: edit, rename, and the headless
 * settings export behind the export_project_settings MCP tool. Reset and delete
 * left for the projects list's batch window (step-05 S4: `prepareProjectsBatch`,
 * `runProjectsBatch`, `deleteFromProjectsList`). Extracted from
 * `dashboardHandlers.ts` for the 500-line handler cap; the parent re-exports
 * everything here so import sites are unchanged.
 */

import * as vscode from 'vscode';
import { handleRequestStatus } from './statusHandlers';
import { privatePackNote } from '@/features/data-installer/handlers/privatePackPrompt';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler } from '@/types/handlers';

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

    const { extractSettingsFromProject } = await import(
        '@/features/projects-dashboard/services/settingsSerializer'
    );
    // Include secrets — this is a local edit of the user's own project.
    const settings = extractSettingsFromProject(project);

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

    const { renameProjectCore } = await import(
        '@/features/projects-dashboard/services/projectRenameService'
    );
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
 * MCP tool). The file carries no credential and the response carries the path.
 * The target must resolve inside the project directory.
 */
export const handleExportProjectSettings: MessageHandler<{
    path?: string;
}> = async (context, data) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const { exportProjectSettingsToFile } = await import(
        '@/features/projects-dashboard/services/settingsTransferService'
    );
    try {
        const result = await exportProjectSettingsToFile(project, { path: data?.path, globalState: context.context.globalState });
        // The file names its pack by reference: a private one is said, for the agent to offer sharing.
        const packNote = await privatePackNote(context, project);
        return { success: true, data: { ...result, ...(packNote ? { packNote } : {}) } };
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
