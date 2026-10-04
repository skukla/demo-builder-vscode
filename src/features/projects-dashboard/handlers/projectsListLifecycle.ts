/**
 * Projects list: what changes a project — delete, edit, rename, reset, pin.
 * Split from `dashboardHandlers.ts` by job (EDS-8, 2026-10-05), which re-exports
 * every handler.
 *
 * @module features/projects-dashboard/handlers/projectsListLifecycle
 */

import * as vscode from 'vscode';
import { resolveProjectFromPath } from './projectFromPath';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { deleteOperationId, resetOperationId } from '@/core/utils/operationIds';
import { validateProjectPath } from '@/core/validation/PathSafetyValidator';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { deleteProject } from '@/features/projects-dashboard/services/projectDeletionService';
import { renameProjectCore } from '@/features/projects-dashboard/services/projectRenameService';
import { extractSettingsFromProject } from '@/features/projects-dashboard/services/settingsSerializer';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';

/** What a screen sends to delete one of the projects it lists. */
export interface DeleteProjectPayload {
    projectPath: string;
    /** The id its progress modal follows (PL-59); absent from other callers. */
    id?: string;
    progress?: 'modal';
}

export interface ResetProjectPayload {
    projectPath: string;
    /** The id its progress modal follows (PL-59); absent from other callers. */
    id?: string;
    progress?: 'modal';
}

// ============================================================================
// Delete Project Handler (delegated to projectDeletionService)
// ============================================================================

/**
 * Delete a project by path
 *
 * Delegates to projectDeletionService which handles confirmation, cleanup, and retry logic.
 */
export const handleDeleteProject: MessageHandler<DeleteProjectPayload> = narrateOutcomeToModal(
    async (context, payload): Promise<HandlerResponse> => {
    try {
        const resolved = await resolveProjectFromPath(context, payload);
        if (!resolved.ok) {
            return resolved.error;
        }
        const { project } = resolved;

        const result = await deleteProject(context, project, undefined, {
            progress: progressSurfaceOf(payload),
            operationId: payload?.id ?? deleteOperationId(project.name),
        });

        // Notify UI to refresh (handles timeout scenarios)
        // Cast data to expected shape - deleteProject returns { success: boolean }
        const resultData = result.data as { success?: boolean } | undefined;
        if (result.success && resultData?.success) {
            context.sendMessage('projectDeleted', {});
        }

        return result;
    } catch (error) {
        context.logger.error(
            'Failed to delete project',
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: 'Failed to delete project',
        };
    }
    },
    (payload) => payload?.id ?? '',
);

// ============================================================================
// Edit Project Handler
// ============================================================================

/**
 * Edit an existing project
 *
 * Checks if demo is running and opens wizard in edit mode.
 */
export const handleEditProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    try {
        const resolved = await resolveProjectFromPath(context, payload);
        if (!resolved.ok) {
            return resolved.error;
        }
        const { project } = resolved;

        // Note: Edit menu is only shown when project is not running (UI enforces this)
        // Extract settings for edit mode (include secrets for local edit)
        const settings = extractSettingsFromProject(project);

        context.logger.info(`Opening edit wizard for project: ${project.name}`);
        context.logger.debug(
            `[Edit] Project package/stack: ${project.selectedPackage}/${project.selectedStack}`,
        );
        context.logger.debug(
            `[Edit] Settings package/stack: ${settings.selectedPackage}/${settings.selectedStack}`,
        );

        // Debug: Log EDS config extraction for troubleshooting
        const edsStorefront = project.componentInstances?.['eds-storefront'];
        context.logger.debug(`[Edit] EDS storefront instance exists: ${!!edsStorefront}`);
        if (edsStorefront) {
            context.logger.debug(`[Edit] EDS storefront has metadata: ${!!edsStorefront.metadata}`);
            if (edsStorefront.metadata) {
                const metadata = edsStorefront.metadata as Record<string, unknown>;
                context.logger.debug(
                    `[Edit] EDS metadata keys: [${Object.keys(metadata).join(', ')}]`,
                );
                context.logger.debug(`[Edit] EDS metadata.githubRepo: ${metadata.githubRepo}`);
                context.logger.debug(`[Edit] EDS metadata.daLiveOrg: ${metadata.daLiveOrg}`);
                context.logger.debug(`[Edit] EDS metadata.daLiveSite: ${metadata.daLiveSite}`);
            }
        }
        context.logger.debug(
            `[Edit] Extracted edsConfig: ${settings.edsConfig ? JSON.stringify(settings.edsConfig) : 'undefined'}`,
        );
        if (settings.edsConfig) {
            context.logger.debug(`[Edit] edsConfig.githubOwner: ${settings.edsConfig.githubOwner}`);
            context.logger.debug(`[Edit] edsConfig.repoName: ${settings.edsConfig.repoName}`);
            context.logger.debug(`[Edit] edsConfig.daLiveOrg: ${settings.edsConfig.daLiveOrg}`);
            context.logger.debug(`[Edit] edsConfig.daLiveSite: ${settings.edsConfig.daLiveSite}`);
        }

        // Open wizard in edit mode
        await vscode.commands.executeCommand('demoBuilder.createProject', {
            editProject: {
                projectPath: project.path,
                // The SLUG stays the identity (`editOriginalName` compares against
                // it, so the dedupe check still allows keeping the current name).
                projectName: project.name,
                // ...and the TITLE seeds the field, so editing a project shows
                // what the user called it rather than its folder.
                projectTitle: project.title,
                settings,
            },
        });

        return {
            success: true,
            data: { success: true },
        };
    } catch (error) {
        context.logger.error('Failed to edit project', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to edit project',
        };
    }
};

// ============================================================================
// Rename Project Handler
// ============================================================================

/**
 * Rename an existing project
 *
 * Updates the project name in the manifest without requiring the full edit wizard.
 */
export const handleRenameProject: MessageHandler<{ projectPath: string; newName: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string; newName: string },
): Promise<HandlerResponse> => {
    if (!payload?.projectPath || !payload?.newName) {
        return {
            success: false,
            error: 'Project path and new name are required',
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

    // Load project (persist after load since we'll be saving changes)
    const project = await context.stateManager.loadProjectFromPath(payload.projectPath, undefined, {
        persistAfterLoad: true,
    });
    if (!project) {
        return {
            success: false,
            error: 'Project not found',
        };
    }

    // Shared rename core (folder rename + path updates + recent-projects + save)
    return renameProjectCore(context, project, payload.newName);
};


/**
 * Handle 'resetProject' message - Reset project to initial state
 *
 * Dispatches to the appropriate reset service based on project type:
 * - EDS projects: resetEdsProjectWithUI (template-based reset)
 * - Headless projects: resetProjectWithUI (component re-clone)
 *
 * From a screen that hosts the progress modal it narrates there (PL-59 R1),
 * which is why the whole body is wrapped: the modal has to be recorded before
 * the first confirmation dialog, not after it.
 */
export const handleResetProject: MessageHandler<ResetProjectPayload> = narrateOutcomeToModal(
    async (context, payload) => {
        const resolved = await resolveProjectFromPath(context, payload);
        if (!resolved.ok) {
            return resolved.error;
        }
        const { project } = resolved;
        const progress = progressSurfaceOf(payload);
        const operationId = payload?.id ?? resetOperationId(project.name);

        const { isEdsProject } = await import('@/types/typeGuards');

        if (isEdsProject(project)) {
            const { resetEdsProjectWithUI } = await import(
                '@/features/eds/services/reset/edsResetUI'
            );
            return resetEdsProjectWithUI({
                meshDeps: {
                    commandManager: ServiceLocator.getCommandExecutor(),
                    authManager: ServiceLocator.getAuthenticationService(),
                },
                project,
                context,
                logPrefix: '[ProjectsList]',
                includeBlockLibrary: true,
                verifyCdn: true,
                showLogsOnError: true,
                progress,
                operationId,
            });
        }

        const { resetProjectWithUI } = await import(
            '@/features/lifecycle/services/projectResetService'
        );
        return resetProjectWithUI({
            commandManager: ServiceLocator.getCommandExecutor(),
            authManager: ServiceLocator.getAuthenticationService(),
            project,
            context,
            logPrefix: '[ProjectsList]',
            progress,
            operationId,
        });
    },
    (payload) => payload?.id ?? '',
);

// ============================================================================
// Project Pinning
// ============================================================================

/**
 * Set the pinned flag on a project.
 *
 * Pinned projects render first on the projects dashboard (alphabetical
 * within the pinned and unpinned groups). The flag is persisted to the
 * project's `.demo-builder.json` manifest via `stateManager.saveProject`.
 */
export const handleSetProjectPinned: MessageHandler<{
    projectPath: string;
    pinned: boolean;
}> = async (
    context: HandlerContext,
    payload?: { projectPath: string; pinned: boolean },
): Promise<HandlerResponse> => {
    if (!payload?.projectPath || typeof payload.pinned !== 'boolean') {
        return { success: false, error: 'projectPath and pinned (boolean) are required' };
    }

    try {
        validateProjectPath(payload.projectPath);
    } catch {
        return { success: false, error: 'Invalid project path' };
    }

    try {
        const project = await context.stateManager.loadProjectFromPath(
            payload.projectPath,
            undefined,
            { persistAfterLoad: false },
        );
        if (!project) {
            return { success: false, error: 'Project not found' };
        }
        // Use saveProjectConfigOnly — saveProject would replace currentProject
        // and fire onProjectChanged, side effects we don't want from the
        // home-screen kebab.
        await context.stateManager.saveProjectConfigOnly({ ...project, pinned: payload.pinned });
        // Report the resulting state rather than a bare success.
        //
        // The webview ignores this (the kebab re-reads the list), but
        // `set_project_pinned` does not: `defaultShape` renders a bare success as
        // the literal "{}", and — measured live 2026-08-17 — that is a 2-byte
        // answer an agent has NO other way to confirm, because nothing else
        // reported pinned state at all. `list_projects` now carries it too, so the
        // pair is a write that says what it did and a read that can check it.
        return {
            success: true,
            pinned: { projectPath: payload.projectPath, pinned: payload.pinned },
            // NAME the confirming read. The tier-2 battery run (2026-08-28)
            // measured an agent burning 13 shell calls looking for this state
            // on DISK after a successful pin — it lives in extension storage,
            // where ls can never see it, and nothing said so.
            verify:
                'Confirmed. Pinned state lives in extension storage (not a file) — ' +
                're-check with list_projects, never the filesystem.',
        };
    } catch (error) {
        context.logger.error(
            'Failed to set project pinned state',
            error instanceof Error ? error : undefined,
        );
        return { success: false, error: 'Failed to set project pinned state' };
    }
};
