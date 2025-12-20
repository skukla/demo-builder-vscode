/**
 * Projects Dashboard Message Handlers
 *
 * Handles messages from the Projects Dashboard webview.
 * Follows Pattern B: Returns response data (doesn't use sendMessage).
 *
 * Complex operations are delegated to services:
 * - settingsTransferService: Import/export/copy settings
 * - projectDeletionService: Project deletion with retry logic
 */

import * as vscode from 'vscode';
import { extractSettingsFromProject } from '../services/settingsSerializer';
import {
    importSettingsFromFile,
    copySettingsFromProject,
    exportProjectSettings,
    deleteProject,
} from './services';
import { BaseWebviewCommand } from '@/core/base';
import { executeCommandForProject } from '@/core/handlers';
import { sessionUIState } from '@/core/state/sessionUIState';
import { validateProjectPath } from '@/core/validation';
import type { Project } from '@/types/base';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';

/**
 * Get all projects from StateManager
 *
 * Loads the list of projects and enriches with full project data.
 * Also includes current config for initial render.
 */
export const handleGetProjects: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        // Get list of project paths
        const projectList = await context.stateManager.getAllProjects();

        // Load full project data for each
        const projects: Project[] = [];
        for (const item of projectList) {
            const project = await context.stateManager.loadProjectFromPath(item.path);
            if (project) {
                projects.push(project);
            }
        }

        // Include config in response (avoids race condition with init message)
        // Session override takes precedence over VS Code setting
        const config = vscode.workspace.getConfiguration('demoBuilder');
        const configViewMode = config.get<'cards' | 'rows'>('projectsViewMode', 'cards');
        const projectsViewMode = sessionUIState.viewModeOverride ?? configViewMode;

        // Find running project path (if any)
        const runningProject = projects.find(p => p.status === 'running');
        const runningProjectPath = runningProject?.path;

        return {
            success: true,
            data: { projects, projectsViewMode, runningProjectPath },
        };
    } catch (error) {
        context.logger.error('Failed to load projects', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to load projects',
        };
    }
};

/**
 * Select a project by path
 *
 * Loads the project and sets it as the current project.
 */
export const handleSelectProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    try {
        if (!payload?.projectPath) {
            return {
                success: false,
                error: 'Project path is required',
            };
        }

        // SECURITY: Validate path is within demo-builder projects directory
        try {
            validateProjectPath(payload.projectPath);
        } catch (validationError) {
            context.logger.error(
                'Path validation failed',
                validationError instanceof Error ? validationError : undefined,
            );
            return {
                success: false,
                error: 'Invalid project path',
            };
        }

        const project = await context.stateManager.loadProjectFromPath(payload.projectPath);

        if (!project) {
            return {
                success: false,
                error: 'Project not found',
            };
        }

        // Set as current project in state
        await context.stateManager.saveProject(project);
        context.logger.info(`Selected project: ${project.name}`);

        // Navigate to project dashboard
        await BaseWebviewCommand.startWebviewTransition();
        try {
            await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
        } catch (navError) {
            context.logger.error(
                'Failed to navigate to dashboard',
                navError instanceof Error ? navError : undefined,
            );
        } finally {
            BaseWebviewCommand.endWebviewTransition();
        }

        return {
            success: true,
            data: { project },
        };
    } catch (error) {
        context.logger.error('Failed to select project', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to select project',
        };
    }
};

/**
 * Trigger project creation wizard
 */
export const handleCreateProject: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        context.logger.info('Creating new project from dashboard');
        await vscode.commands.executeCommand('demoBuilder.createProject');
        return {
            success: true,
        };
    } catch (error) {
        context.logger.error('Failed to start project creation', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to start project creation',
        };
    }
};

/**
 * Open documentation URL
 */
export const handleOpenDocs: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        const docsUrl = 'https://github.com/anthropics/demo-builder-vscode#readme';
        await vscode.env.openExternal(vscode.Uri.parse(docsUrl));
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open documentation', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to open documentation',
        };
    }
};

/**
 * Open help/support URL
 */
export const handleOpenHelp: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        const helpUrl = 'https://github.com/anthropics/demo-builder-vscode/issues';
        await vscode.env.openExternal(vscode.Uri.parse(helpUrl));
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open help', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to open help',
        };
    }
};

/**
 * Open VS Code settings for this extension
 */
export const handleOpenSettings: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:adobe.demo-builder');
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open settings', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to open settings',
        };
    }
};

/**
 * Set view mode override for the session
 */
export const handleSetViewModeOverride: MessageHandler<{ viewMode: 'cards' | 'rows' }> = async (
    _context: HandlerContext,
    payload?: { viewMode: 'cards' | 'rows' },
): Promise<HandlerResponse> => {
    if (payload?.viewMode) {
        sessionUIState.viewModeOverride = payload.viewMode;
    }
    return { success: true };
};

/**
 * Reset view mode session state - for testing
 * @internal
 * @deprecated Use sessionUIState.reset() instead
 */
export function resetViewModeOverride(): void {
    sessionUIState.viewModeOverride = undefined;
}

// ============================================================================
// Settings Import/Export Handlers (delegated to settingsTransferService)
// ============================================================================

/**
 * Import settings from a JSON file
 */
export const handleImportFromFile: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    return importSettingsFromFile(context);
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

    const project = await context.stateManager.loadProjectFromPath(payload.projectPath);
    if (!project) {
        return {
            success: false,
            error: 'Project not found',
        };
    }

    return exportProjectSettings(context, project);
};

// ============================================================================
// Delete Project Handler (delegated to projectDeletionService)
// ============================================================================

/**
 * Delete a project by path
 *
 * Delegates to projectDeletionService which handles confirmation, cleanup, and retry logic.
 */
export const handleDeleteProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    try {
        if (!payload?.projectPath) {
            return {
                success: false,
                error: 'Project path is required',
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

        const project = await context.stateManager.loadProjectFromPath(payload.projectPath);
        if (!project) {
            return {
                success: false,
                error: 'Project not found',
            };
        }

        return deleteProject(context, project);
    } catch (error) {
        context.logger.error('Failed to delete project', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to delete project',
        };
    }
};

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
        if (!payload?.projectPath) {
            return {
                success: false,
                error: 'Project path is required',
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

        const project = await context.stateManager.loadProjectFromPath(payload.projectPath);
        if (!project) {
            return {
                success: false,
                error: 'Project not found',
            };
        }

        // Note: Edit menu is only shown when project is not running (UI enforces this)
        // Extract settings for edit mode (include secrets for local edit)
        const settings = extractSettingsFromProject(project, true);

        context.logger.info(`Opening edit wizard for project: ${project.name}`);

        // Open wizard in edit mode
        await vscode.commands.executeCommand('demoBuilder.createProject', {
            editProject: {
                projectPath: project.path,
                projectName: project.name,
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
// Demo Control Handlers (Start/Stop/Open)
// ============================================================================

/**
 * Start a demo for a project
 */
export const handleStartDemo: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    return executeCommandForProject(context, payload?.projectPath, 'demoBuilder.startDemo');
};

/**
 * Stop a demo for a project
 */
export const handleStopDemo: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    return executeCommandForProject(context, payload?.projectPath, 'demoBuilder.stopDemo');
};

/**
 * Open a running demo in browser
 */
export const handleOpenBrowser: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    return executeCommandForProject(context, payload?.projectPath, 'demoBuilder.openBrowser');
};
