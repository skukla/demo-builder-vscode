/**
 * Project Command Helper
 *
 * Shared utility for executing VS Code commands in the context of a specific project.
 * Used when a webview needs to trigger a command for a project other than the current one.
 */

import * as vscode from 'vscode';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/**
 * Execute a VS Code command for a specific project by path
 *
 * Pattern: Load project → Set as current → Execute command
 * Used by projects-dashboard handlers that operate on any project in the list.
 *
 * @param context - Handler context with stateManager and logger
 * @param projectPath - Path to the project to operate on
 * @param commandId - VS Code command to execute (e.g., 'demoBuilder.startDemo')
 * @returns HandlerResponse with success/error status
 */
export async function executeCommandForProject(
    context: HandlerContext,
    projectPath: string | undefined,
    commandId: string,
): Promise<HandlerResponse> {
    if (!projectPath) {
        return { success: false, error: 'Project path is required' };
    }

    const project = await context.stateManager.loadProjectFromPath(projectPath);
    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    // Set as current project so the command knows which project to operate on
    await context.stateManager.saveProject(project);

    // Execute the command
    await vscode.commands.executeCommand(commandId);

    return { success: true };
}
