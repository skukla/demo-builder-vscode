/**
 * Projects Dashboard Message Handlers
 *
 * Handles messages from the Projects Dashboard webview.
 * Follows Pattern B: Returns response data (doesn't use sendMessage).
 */

import * as vscode from 'vscode';
import { validateProjectPath } from '@/core/validation/securityValidation';
import type { Project } from '@/types/base';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';

/**
 * Get all projects from StateManager
 *
 * Loads the list of projects and enriches with full project data.
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

        return {
            success: true,
            data: { projects },
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
        // Prevents path traversal attacks (CWE-22)
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
        // Note: The dashboard command handles disposing the Projects List panel
        try {
            await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
        } catch (navError) {
            // Log navigation failure but don't fail the selection
            // Project was successfully selected, navigation is non-critical
            context.logger.error(
                'Failed to navigate to dashboard',
                navError instanceof Error ? navError : undefined,
            );
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
        // Note: The wizard command handles disposing the Projects List panel
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
        // TODO: Replace with actual documentation URL when available
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
        // TODO: Replace with actual help URL when available
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
        // Open VS Code settings filtered to this extension
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
