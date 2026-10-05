/**
 * Projects list: import a project from a file, copy one on this computer, export
 * one — each delegated to settingsTransferService (or the demo-bundle import).
 * Split from `dashboardHandlers.ts` by job (EDS-8, 2026-10-05), which re-exports
 * every handler.
 *
 * @module features/projects-dashboard/handlers/projectsListTransfer
 */

import { validateProjectPath } from '@/core/validation/PathSafetyValidator';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withModalAsking } from '@/core/vscode/operationPrompt';
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

/** What the projects list sends when it starts a copy in its modal. */
export interface CopyFromExistingPayload {
    id?: string;
    progress?: 'modal';
}

/**
 * Copy settings from an existing project. From the projects list, which project
 * is asked in that screen's modal; otherwise a QuickPick asks.
 */
export const handleCopyFromExisting: MessageHandler<CopyFromExistingPayload> = narrateOutcomeToModal(
    async (context, payload) => {
        const id = payload?.id;
        if (progressSurfaceOf(payload) !== 'modal' || !id) return copySettingsFromProject(context);
        const result = await withModalAsking(id, () => copySettingsFromProject(context));
        // The modal ends on the OUTER answer, so a copy that could not read the
        // project's settings must say so there rather than end on a tick.
        const copied = result.data as { success?: boolean; error?: string } | undefined;
        if (copied?.success === false && copied.error !== 'cancelled') {
            return { success: false, error: copied.error };
        }
        return result;
    },
    (payload) => payload?.id,
);

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
