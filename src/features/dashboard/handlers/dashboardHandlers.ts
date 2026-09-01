/**
 * Dashboard Handlers
 *
 * Message handlers for the Project Dashboard webview.
 * These handlers orchestrate dashboard operations by delegating to appropriate services.
 *
 * This file keeps the demo-lifecycle delegations and composes the feature's
 * handler map; the rest of the handlers live in sibling modules (extracted for
 * the 500-line handler cap) and are re-exported here so import sites are
 * unchanged:
 *   - statusHandlers.ts            requestStatus (status payload + on-open
 *                                  checks, incl. the AI-context freshness
 *                                  wiring) + reAuthenticate/switchOrg
 *   - openUrlHandlers.ts           open-in-browser handlers + getProjectUrls
 *   - panelNavigationHandlers.ts   webview surface swaps (configure,
 *                                  navigateBack, openIntegrations,
 *                                  showProjectDashboard)
 *   - projectManagementHandlers.ts edit/delete/reset/rename/export
 *   - edsContentHandlers.ts        syncStorefront/refreshBlockLibrary/
 *                                  republishContent
 */

import * as vscode from 'vscode';
import { handleSetProjectDestination } from './destinationHandlers';
import {
    handleSyncStorefront,
    handleRefreshBlockLibrary,
    handleRepublishContent,
} from './edsContentHandlers';
import { handleDeleteEventEntity, handleGetEventEntities } from './eventingHandlers';
import { sendDemoStatusUpdate } from './meshStatusHelpers';
import {
    handleOpenBrowser,
    handleOpenLiveSite,
    handleOpenDaLive,
    handleOpenAdminPanel,
    handleOpenDevConsole,
    handleGetProjectUrls,
} from './openUrlHandlers';
import {
    handleConfigure,
    handleNavigateBack,
    handleOpenIntegrations,
    handleShowProjectDashboard,
} from './panelNavigationHandlers';
import {
    handleEditProject,
    handleDeleteProject,
    handleResetProject,
    handleExportProject,
    handleRenameProject,
    handleExportProjectSettings,
} from './projectManagementHandlers';
import { handleRequestStatus, handleReAuthenticate, handleSwitchOrg } from './statusHandlers';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    handleAddAppBuilderComponent,
    handleDeployAppBuilderComponent,
    handleRedeployAppBuilderComponent,
    handleRemoveAppBuilderComponent,
    handleRenameAppBuilderComponent,
} from '@/features/dashboard/handlers/appBuilderComponentHandlers';
import {
    handleGetAppBuilderInstallStatus,
    handleInstallAppBuilderComponent,
} from '@/features/dashboard/handlers/appManagementInstallHandlers';
import {
    handleAddConsoleApis,
    handleListConsoleApis,
    handleSetConsoleApis,
} from '@/features/dashboard/handlers/consoleApiHandlers';
import {
    MessageHandler,
    defineHandlers,
    type HandlerContext,
    type HandlerResponse,
} from '@/types/handlers';
import { isEdsProject } from '@/types/typeGuards';

// Handlers moved to the sibling modules above; re-export so the import sites
// (tests, MCP descriptors, commands) are unchanged.
export { handleRequestStatus, handleReAuthenticate, handleSwitchOrg } from './statusHandlers';
export {
    handleOpenBrowser,
    handleOpenLiveSite,
    handleOpenDaLive,
    handleOpenAdminPanel,
    handleOpenDevConsole,
    handleGetProjectUrls,
} from './openUrlHandlers';
export {
    handleConfigure,
    handleNavigateBack,
    handleOpenIntegrations,
    handleShowProjectDashboard,
} from './panelNavigationHandlers';
export {
    handleEditProject,
    handleDeleteProject,
    handleResetProject,
    handleExportProject,
    handleRenameProject,
    handleExportProjectSettings,
} from './projectManagementHandlers';
export {
    handleSyncStorefront,
    handleRefreshBlockLibrary,
    handleRepublishContent,
} from './edsContentHandlers';

/**
 * There is no local server to start, stop or restart for an EDS storefront —
 * it is served from the Edge Delivery CDN, and the local checkout is source that
 * gets published, not something that runs.
 *
 * The DASHBOARD has always said this by hiding the control: the Start/Stop tile
 * renders behind `{!isEds && …}` in `ActionGrid.tsx`. The MCP surface said the
 * opposite by exposing `start_demo` / `stop_demo` / `restart_demo` to every
 * project, so an agent could reach an action the human interface deliberately
 * withholds — and, being a no-op dressed as a success, report that it worked.
 *
 * Guarded HERE rather than in the tool descriptors so the rule holds for every
 * caller by construction. Returns DATA with a reason and the actions that DO
 * apply, not an error: an error teaches an agent to retry, a reason teaches it
 * what to do instead.
 */
async function refuseLifecycleOnEds(
    context: HandlerContext,
    verb: string,
): Promise<HandlerResponse | undefined> {
    const project = await context.stateManager?.getCurrentProject();
    if (!project || !isEdsProject(project)) return undefined;
    return {
        success: false,
        error:
            `EDS storefronts have no local server to ${verb} — they are served from the ` +
            'Edge Delivery CDN. Use get_project_urls for the live and preview URLs, ' +
            'open_url to view the site, or sync_storefront / republish to push changes.',
    };
}

/**
 * Handle 'startDemo' message - Start demo server
 */
export const handleStartDemo: MessageHandler = async (context) => {
    const refusal = await refuseLifecycleOnEds(context, 'start');
    if (refusal) return refusal;
    await vscode.commands.executeCommand('demoBuilder.startDemo');
    // Update demo status only (don't re-check mesh)
    setTimeout(() => sendDemoStatusUpdate(context), TIMEOUTS.DEMO_STATUS_UPDATE_DELAY);
    return { success: true };
};

/**
 * Handle 'stopDemo' message - Stop demo server
 */
export const handleStopDemo: MessageHandler = async (context) => {
    const refusal = await refuseLifecycleOnEds(context, 'stop');
    if (refusal) return refusal;
    await vscode.commands.executeCommand('demoBuilder.stopDemo');
    // Update demo status only (don't re-check mesh)
    setTimeout(() => sendDemoStatusUpdate(context), TIMEOUTS.DEMO_STATUS_UPDATE_DELAY);
    return { success: true };
};

/**
 * Handle 'restartDemo' message - stop, settle, start.
 *
 * Exists because the dashboard could report "Restart needed" (a config change
 * while running) and offer nothing to act on it — the user had to press Stop and
 * then Start themselves.
 *
 * Delegates to `demoBuilder.restartDemo` rather than issuing the two commands
 * here: that command owns the settle delay between them, and re-implementing the
 * sequence would drop it and race the stop.
 */
export const handleRestartDemo: MessageHandler = async (context) => {
    const refusal = await refuseLifecycleOnEds(context, 'restart');
    if (refusal) return refusal;
    await vscode.commands.executeCommand('demoBuilder.restartDemo');
    // Update demo status only (don't re-check mesh) — same as start/stop.
    setTimeout(() => sendDemoStatusUpdate(context), TIMEOUTS.DEMO_STATUS_UPDATE_DELAY);
    return { success: true };
};

/**
 * Handle 'deployMesh' message - Deploy API mesh
 */
export const handleDeployMesh: MessageHandler = async () => {
    await vscode.commands.executeCommand('demoBuilder.deployMesh');
    return { success: true };
};

/**
 * Handle 'openDataInstaller' — open the Data Installer surface.
 *
 * Deliberately NOT the `openIntegrations` shape. That one replaces the tab: it
 * starts a webview transition and disposes the dashboard panel, because the
 * integrations surface is scoped to the project you came from.
 *
 * The datapack catalog is global to the SERVICE — the same packs whatever
 * project is open — so browsing it must not close what the user was looking at.
 * The command's own registration records that decision; this dispatches and
 * touches nothing else.
 *
 * A failed dispatch is reported, not thrown: the dashboard is still perfectly
 * usable when one tile's surface will not open.
 */
export const handleOpenDataInstaller: MessageHandler = async (context) => {
    try {
        context.logger.info('Opening Data Installer surface');
        await vscode.commands.executeCommand('demoBuilder.showDataInstaller');
        return { success: true };
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        context.logger.error(`Failed to open the Data Installer: ${reason}`);
        return { success: false, error: reason };
    }
};

// ============================================================================
// Handler Map Export (Step 3: Handler Registry Simplification)
// ============================================================================

/**
 * Dashboard feature handler map
 * Maps message types to handler functions for the Project Dashboard
 *
 * Replaces DashboardHandlerRegistry class with simple object literal.
 */
export const dashboardHandlers = defineHandlers({
    // Initialization handlers (init is delivered by BaseWebviewCommand on handshake;
    // no 'ready' handler — see note on handleRequestStatus in statusHandlers.ts)
    requestStatus: handleRequestStatus,

    // Demo lifecycle handlers
    startDemo: handleStartDemo,
    stopDemo: handleStopDemo,
    restartDemo: handleRestartDemo,

    // Navigation handlers
    openBrowser: handleOpenBrowser,
    openLiveSite: handleOpenLiveSite,
    openDaLive: handleOpenDaLive,
    openAdminPanel: handleOpenAdminPanel,
    configure: handleConfigure,
    openDevConsole: handleOpenDevConsole,
    getProjectUrls: handleGetProjectUrls,
    navigateBack: handleNavigateBack,
    openIntegrations: handleOpenIntegrations,
    openDataInstaller: handleOpenDataInstaller,
    showProjectDashboard: handleShowProjectDashboard,

    // Mesh handlers
    deployMesh: handleDeployMesh,

    // AppBuilderComponent (integrations list) handlers — live D1 runner wiring.
    // The singular id-less addApp/deployApp/redeployApp/removeApp delegates
    // retired with the dormant AppBuilderCard (ADR-011 D3 Step 08).
    addAppBuilderComponent: handleAddAppBuilderComponent,
    deployAppBuilderComponent: handleDeployAppBuilderComponent,
    redeployAppBuilderComponent: handleRedeployAppBuilderComponent,
    removeAppBuilderComponent: handleRemoveAppBuilderComponent,
    renameAppBuilderComponent: handleRenameAppBuilderComponent,
    // App Management install state (AB-5): the live status read and the
    // install-without-redeploy retry.
    installAppBuilderComponent: handleInstallAppBuilderComponent,
    getAppBuilderInstallStatus: handleGetAppBuilderInstallStatus,
    // Eventing (AB-6 headful): the workspace's I/O event providers +
    // registrations, listed and deleted from the integrations surface.
    getEventEntities: handleGetEventEntities,
    deleteEventEntity: handleDeleteEventEntity,

    // Console API access (runtime API subscription — list_console_apis / add_console_apis)
    listConsoleApis: handleListConsoleApis,
    addConsoleApis: handleAddConsoleApis,
    setConsoleApis: handleSetConsoleApis,

    // EDS storefront sync
    syncStorefront: handleSyncStorefront,

    // EDS block library refresh (re-sync DA.live library from component-definition.json)
    refreshBlockLibrary: handleRefreshBlockLibrary,

    // Authentication handlers
    reAuthenticate: handleReAuthenticate,
    switchOrg: handleSwitchOrg,

    // Project management handlers
    deleteProject: handleDeleteProject,
    editProject: handleEditProject,
    renameProject: handleRenameProject,
    exportProjectSettings: handleExportProjectSettings,
    exportProject: handleExportProject,

    // EDS content republish (re-push DA.live content to CDN)
    republishContent: handleRepublishContent,

    // Project reset handler
    resetProject: handleResetProject,

    // Adobe deploy destination (project-scoped — one target for every integration)
    setProjectDestination: handleSetProjectDestination,
});
