/**
 * Project Command Helper
 *
 * Shared utility for executing VS Code commands in the context of a specific project.
 * Used when a webview needs to trigger a command for a project other than the current one.
 */

import * as vscode from 'vscode';
import { surfaceShowsItself } from '@/core/vscode/surfaceShowsItself';
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

    // Execute the command. The CARD that started it already shows the
    // transition, so the command's own notification would be a second, slower
    // copy of it (PL-59 R5) — under an agent the sinks stay live and it still
    // narrates.
    await surfaceShowsItself(async () => {
        await vscode.commands.executeCommand(commandId);
    });

    return { success: true };
}

/**
 * Run a VS Code command for the project this context works on: a screen's own, or an
 * agent session's (AI-15). The lifecycle commands read the CURRENT project unless they
 * are handed a path, so a dashboard shown for project A started whichever project had
 * become current since. Unlike {@link executeCommandForProject} this never makes the
 * project current: an agent's start must not move the person's project.
 *
 * @param context - the handler's context; its stateManager answers for the working project
 * @param commandId - a command that takes a project path first (`demoBuilder.startDemo`)
 */
export async function executeCommandForWorkingProject(context: HandlerContext, commandId: string): Promise<void> {
    const project = await context.stateManager.getCurrentProject();
    await vscode.commands.executeCommand(commandId, project?.path);
}
