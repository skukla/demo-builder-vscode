/**
 * Dashboard Panel Navigation Handlers
 *
 * Handlers that swap the visible webview surface (Configure, projects list,
 * integrations, back to the dashboard) — each disposing the sibling panel inside
 * a webview transition before dispatching the target command. Extracted from
 * `dashboardHandlers.ts` for the 500-line handler cap; the parent re-exports
 * everything here so import sites are unchanged.
 */

import * as vscode from 'vscode';
import { warmOrgServicesCatalog } from './warmOrgServicesCatalog';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { MessageHandler } from '@/types/handlers';

/**
 * Handle 'configure' message - Open configuration UI
 */
export const handleConfigure: MessageHandler = async () => {
    await vscode.commands.executeCommand('demoBuilder.configureProject');
    return { success: true };
};

/**
 * Handle 'openDebugLogs' — show the Debug Logs channel, where an operation's full
 * detail goes. The progress modal's failure state offers it (PL-59).
 */
export const handleOpenDebugLogs: MessageHandler = async () => {
    await vscode.commands.executeCommand('demoBuilder.showDebugLogs');
    return { success: true };
};

/**
 * The shared tab-replacement sequence: dispose the named panel (if open)
 * inside a webview transition — so its disposal callback doesn't fire and
 * re-open another surface — then dispatch the target command.
 */
async function swapWebviewSurface(panelId: string, commandId: string): Promise<void> {
    await BaseWebviewCommand.startWebviewTransition();
    try {
        const panel = BaseWebviewCommand.getActivePanel(panelId);
        if (panel) {
            try {
                panel.dispose();
            } catch {
                // Panel may already be disposed - this is OK
            }
        }
        await vscode.commands.executeCommand(commandId);
    } finally {
        BaseWebviewCommand.endWebviewTransition();
    }
}

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
 * Handle 'openIntegrations' message - open the dedicated integrations surface
 *
 * The dashboard's integrations summary tile opens the full-width integrations
 * screen. Tab replacement, exactly like navigateBack — but the current project
 * pointer is NOT cleared: the surface is scoped to the project we came from.
 */
export const handleOpenIntegrations: MessageHandler = async (context) => {
    try {
        context.logger.info('Opening integrations surface');

        // Deliberately not awaited — see warmOrgServicesCatalog.
        void warmOrgServicesCatalog(context);

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
