/**
 * Dashboard Panel Navigation Handlers
 *
 * Handlers that swap the visible webview surface (Configure, the projects list, plain
 * or on one project's Delete window, integrations, back to the dashboard) — each
 * disposing the sibling panel inside a webview transition before dispatching the
 * target command. Extracted from
 * `dashboardHandlers.ts` for the 500-line handler cap; the parent re-exports
 * everything here so import sites are unchanged.
 */

import * as vscode from 'vscode';
import { swapWebviewSurface } from '@/core/base/swapWebviewSurface';
import { executeCommandForWorkingProject } from '@/core/handlers/projectCommandHelper';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler } from '@/types/handlers';

/**
 * Handle 'configure' message - Open configuration UI
 */
export const handleConfigure: MessageHandler = async (context) => {
    // Configure opens for this screen's project, not whichever is current (AI-15).
    await executeCommandForWorkingProject(context, 'demoBuilder.configureProject');
    return { success: true };
};

/**
 * Handle 'navigateBack' message - Navigate back to projects list
 *
 * Clears the current project and shows the projects list view.
 * Disposes the Dashboard panel before opening Projects List to prevent blank webview.
 */
export const handleNavigateBack: MessageHandler = async (context) => {
    try {
        context.logger.info('Navigating back to projects list');

        // Clear current project from state
        await context.stateManager.clearProject();

        await swapWebviewSurface('demoBuilder.projectDashboard', 'demoBuilder.showProjectsList');

        return { success: true };
    } catch (error) {
        context.logger.error('Failed to navigate back', error as Error);
        return {
            success: false,
            error: 'Failed to navigate back to projects list',
        };
    }
};

/**
 * Handle 'deleteFromProjectsList' — the dashboard's Delete (step-05 S4, owner 2026-11-13, P5-Q2).
 *
 * Opens the projects list on its one-row Delete window for this screen's project: the dashboard
 * closes when its project is deleted, so the window cannot live here. Like navigateBack it clears
 * the current project and lands on the list; the list command holds the webview transition while
 * it closes the dashboard, so the auto-reopen does not open the list a second time. Nothing is
 * deleted here: the window asks, and only its red button runs. Cancelled, the SC stays on the list.
 */
export const handleDeleteFromProjectsList: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found to delete', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    try {
        await context.stateManager.clearProject();
        await vscode.commands.executeCommand('demoBuilder.showProjectsList', { deleteProject: project.path });
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open the projects list to delete a project', error as Error);
        return { success: false, error: 'Failed to open the projects list' };
    }
};

/**
 * Handle 'openIntegrations' message - open the dedicated integrations surface
 *
 * The dashboard's integrations summary tile opens the full-width integrations
 * screen. Tab replacement, exactly like navigateBack — but the current project
 * pointer is NOT cleared: the surface is scoped to the project we came from.
 */
export const handleOpenIntegrations: MessageHandler = async (context) => {
    try {
        context.logger.info('Opening integrations surface');

        await swapWebviewSurface('demoBuilder.projectDashboard', 'demoBuilder.showIntegrations');

        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open integrations surface', error as Error);
        return {
            success: false,
            error: 'Failed to open the integrations surface',
        };
    }
};

/**
 * Handle 'showProjectDashboard' message - return to the project dashboard
 *
 * The integrations surface's way back. The MIRROR of handleOpenIntegrations:
 * dispose the sibling panel inside a webview transition, then dispatch the
 * command. Deliberately NOT navigateBack — that clears the current project and
 * lands on the projects LIST; this keeps the project and swaps to its dashboard.
 */
export const handleShowProjectDashboard: MessageHandler = async (context) => {
    try {
        context.logger.info('Returning to the project dashboard');

        await swapWebviewSurface('demoBuilder.integrations', 'demoBuilder.showProjectDashboard');

        return { success: true };
    } catch (error) {
        context.logger.error('Failed to return to the project dashboard', error as Error);
        return {
            success: false,
            error: 'Failed to return to the project dashboard',
        };
    }
};
