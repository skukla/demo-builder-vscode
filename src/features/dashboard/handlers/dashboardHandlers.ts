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
    handleAddConsoleApis,
    handleListConsoleApis,
    handleSetConsoleApis,
} from '@/features/dashboard/handlers/consoleApiHandlers';
import { MessageHandler, defineHandlers } from '@/types/handlers';

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
 * Handle 'startDemo' message - Start demo server
 */
export const handleStartDemo: MessageHandler = async (context) => {
    await vscode.commands.executeCommand('demoBuilder.startDemo');
    // Update demo status only (don't re-check mesh)
    setTimeout(() => sendDemoStatusUpdate(context), TIMEOUTS.DEMO_STATUS_UPDATE_DELAY);
    return { success: true };
};

/**
 * Handle 'stopDemo' message - Stop demo server
 */
export const handleStopDemo: MessageHandler = async (context) => {
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
