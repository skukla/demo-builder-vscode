/**
 * Projects Dashboard Message Handlers
 *
 * Handles messages from the Projects Dashboard webview.
 * Follows Pattern B: Returns response data (doesn't use sendMessage).
 */

import * as vscode from 'vscode';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';
import type { Project } from '@/types/base';

/**
 * Get all projects from StateManager
 *
 * Loads the list of projects and enriches with full project data.
 */
export const handleGetProjects: MessageHandler = async (
    context: HandlerContext
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
export const handleSelectProject: MessageHandler = async (
    context: HandlerContext,
    payload?: { projectPath: string }
): Promise<HandlerResponse> => {
    try {
        if (!payload?.projectPath) {
            return {
                success: false,
                error: 'Project path is required',
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
    context: HandlerContext
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
