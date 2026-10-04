/**
 * Projects list: import a project from a file, copy one on this computer, export
 * one — each delegated to settingsTransferService (or the demo-bundle import).
 * Split from `dashboardHandlers.ts` by job (EDS-8, 2026-10-05), which re-exports
 * every handler.
 *
 * @module features/projects-dashboard/handlers/projectsListTransfer
 */

import { validateProjectPath } from '@/core/validation/PathSafetyValidator';
import { importDemoBundle } from '@/features/eds/handlers/importStorefrontZipHandler';
import {
    copySettingsFromProject,
    exportProjectSettings,
    importSettingsFromUri,
    pickImportFile,
} from '@/features/projects-dashboard/services/settingsTransferService';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';

/**
 * Import settings from a JSON file
 */
export const handleImportFromFile: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    const picked = await pickImportFile(context);
    if (!picked) return { success: true, data: { success: false, error: 'cancelled' } };
    // A demo bundle (Export's "Send a file") or the plain settings file.
    return picked.fsPath.toLowerCase().endsWith('.zip')
        ? importDemoBundle(context, picked.fsPath)
        : importSettingsFromUri(context, picked);
};

/**
 * Copy settings from an existing project
 */
export const handleCopyFromExisting: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    return copySettingsFromProject(context);
};

/**
 * Export project settings to a file
 */
export const handleExportProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    if (!payload?.projectPath) {
        return {
            success: false,
            error: 'No project path provided',
        };
    }

    try {
        validateProjectPath(payload.projectPath);
    } catch {
        return {
            success: false,
            error: 'Invalid project path',
        };
    }

    const project = await context.stateManager.loadProjectFromPath(payload.projectPath, undefined, {
        persistAfterLoad: false,
    });
    if (!project) {
        return {
            success: false,
            error: 'Project not found',
        };
    }

    return exportProjectSettings(context, project);
};
