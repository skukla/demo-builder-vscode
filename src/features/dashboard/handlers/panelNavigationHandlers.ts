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
import { BaseWebviewCommand } from '@/core/base';
import { ServiceLocator } from '@/core/di';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell';
import { MessageHandler, HandlerContext } from '@/types/handlers';

/**
 * Handle 'configure' message - Open configuration UI
 */
export const handleConfigure: MessageHandler = async () => {
    await vscode.commands.executeCommand('demoBuilder.configureProject');
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

        // Start transition BEFORE disposing to prevent disposal callback from firing
        await BaseWebviewCommand.startWebviewTransition();
        try {
            // Dispose Dashboard panel before opening Projects List
            // This prevents the blank webview issue during transition
            const dashboardPanel = BaseWebviewCommand.getActivePanel(
                'demoBuilder.projectDashboard',
            );
            if (dashboardPanel) {
                try {
                    dashboardPanel.dispose();
                } catch {
                    // Panel may already be disposed - this is OK
                }
            }

            // Navigate to projects list
            await vscode.commands.executeCommand('demoBuilder.showProjectsList');
        } finally {
            BaseWebviewCommand.endWebviewTransition();
        }

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
 * screen. Tab replacement, exactly like navigateBack: dispose the dashboard
 * panel inside a webview transition (so the disposal callback doesn't re-open
 * the projects list), then dispatch the command. The current project pointer is
 * NOT cleared — the surface is scoped to the project we came from.
 */
/**
 * Warm the org's Adobe API catalog in the background.
 *
 * `getServicesForOrg` is a single SDK call, but a highly variable one — 348ms
 * against a warm endpoint and 42s against a cold one, measured minutes apart on
 * the same 96-service org. Nothing warmed it, so the first consumer was always a
 * surface that BLOCKS on it: the Manage APIs modal and the Add flow's API stage
 * both fetch on open and show a spinner until it lands.
 *
 * Opening the integrations surface is the last cheap moment before either is
 * reachable, so the wait overlaps with the user reading the grid. The fetcher
 * caches per-org for 30 minutes and single-flights, so this can never cause a
 * second fetch — a later opener either joins this one or reads its result.
 *
 * Three things this must not do, in order of how badly they would bite:
 * - trigger interactive Adobe auth. `getTokenStatus` reads the token file
 *   directly (no CLI call, no browser), so both the guard and the skip are silent.
 * - block the surface. Fire-and-forget; the caller never awaits it.
 * - surface an error. A cosmetic warm-up has nothing to report.
 *
 * Org-targeted like every other `aio`-backed read: an unwrapped call inherits the
 * CLI's process-global console selection and would warm the WRONG org's catalog —
 * worse than a cold cache, because the modal would then show it.
 */
async function warmOrgServicesCatalog(context: HandlerContext): Promise<void> {
    try {
        const project = await context.stateManager.getCurrentProject();
        const orgId = project?.adobe?.organization;
        if (!project || !orgId) return;

        const authManager = ServiceLocator.getAuthenticationService();
        const { isAuthenticated } = await authManager.getTokenStatus();
        if (!isAuthenticated) return;

        await withOrgContext(buildOrgTargetFromProjectAdobe(project.adobe), () =>
            authManager.getServicesForOrg(orgId),
        );
        context.logger.debug('[Integrations] API catalog prefetched');
    } catch {
        // Best-effort: the consumer that actually needs it will fetch and report.
    }
}

export const handleOpenIntegrations: MessageHandler = async (context) => {
    try {
        context.logger.info('Opening integrations surface');

        // Deliberately not awaited — see warmOrgServicesCatalog.
        void warmOrgServicesCatalog(context);

        await BaseWebviewCommand.startWebviewTransition();
        try {
            const dashboardPanel = BaseWebviewCommand.getActivePanel(
                'demoBuilder.projectDashboard',
            );
            if (dashboardPanel) {
                try {
                    dashboardPanel.dispose();
                } catch {
                    // Panel may already be disposed - this is OK
                }
            }

            await vscode.commands.executeCommand('demoBuilder.showIntegrations');
        } finally {
            BaseWebviewCommand.endWebviewTransition();
        }

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

        await BaseWebviewCommand.startWebviewTransition();
        try {
            const integrationsPanel = BaseWebviewCommand.getActivePanel('demoBuilder.integrations');
            if (integrationsPanel) {
                try {
                    integrationsPanel.dispose();
                } catch {
                    // Panel may already be disposed - this is OK
                }
            }

            await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
        } finally {
            BaseWebviewCommand.endWebviewTransition();
        }

        return { success: true };
    } catch (error) {
        context.logger.error('Failed to return to the project dashboard', error as Error);
        return {
            success: false,
            error: 'Failed to return to the project dashboard',
        };
    }
};
