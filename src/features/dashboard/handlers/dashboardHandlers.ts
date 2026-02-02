/**
 * Dashboard Handlers
 *
 * Message handlers for the Project Dashboard webview.
 * These handlers orchestrate dashboard operations by delegating to appropriate services.
 */

import * as vscode from 'vscode';
import {
    buildStatusPayload,
    hasMeshDeploymentRecord,
    hasAdobeWorkspaceContext,
    hasAdobeProjectContext,
    sendDemoStatusUpdate,
    verifyMeshDeployment,
} from './meshStatusHelpers';
import { BaseWebviewCommand } from '@/core/base';
import { ServiceLocator } from '@/core/di';
import { sessionUIState } from '@/core/state/sessionUIState';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { openInIncognito } from '@/core/utils';
import { validateURL } from '@/core/validation';
import { toggleLogsPanel } from '@/features/lifecycle/handlers/lifecycleHandlers';
import { detectFrontendChanges } from '@/features/mesh/services/stalenessDetector';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler } from '@/types/handlers';
import { getMeshComponentInstance, getProjectFrontendPort } from '@/types/typeGuards';
import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
import { getGitHubServices, showDaLiveAuthQuickPick } from '@/features/eds/handlers/edsHelpers';
import { deleteProject } from '@/features/projects-dashboard/services/projectDeletionService';

/**
 * Handle 'ready' message - Send initialization data
 */
export const handleReady: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project || !context.panel) {
        return { success: false, error: 'No project or panel available', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const themeKind = vscode.window.activeColorTheme.kind;
    const theme = themeKind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

    await context.panel.webview.postMessage({
        type: 'init',
        payload: {
            theme,
            project: {
                name: project.name,
                path: project.path,
            },
            initialMeshStatus: project.meshStatusSummary,
        },
    });

    return { success: true };
};

/**
 * Handle 'requestStatus' message - Send current project status
 */
export const handleRequestStatus: MessageHandler = async (context) => {
    context.logger.debug('[Dashboard] handleRequestStatus called');

    if (!context.panel) {
        return { success: false, error: 'No panel available', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project available', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const meshComponent = getMeshComponentInstance(project);
    const frontendConfigChanged = project.status === 'running' ? detectFrontendChanges(project) : false;

    context.logger.debug(`[Dashboard] Status request: mesh=${meshComponent?.status || 'none'}`);

    // Determine mesh status from persisted state (no redundant re-checking)
    let meshStatus: string = 'not-deployed';

    if (meshComponent) {
        if (meshComponent.status === 'deploying') {
            meshStatus = 'deploying';
        } else {
            // Auth check — override with 'needs-auth' if not authenticated
            const authManager = ServiceLocator.getAuthenticationService();
            const isAuthenticated = await authManager.isAuthenticated();

            if (!isAuthenticated) {
                meshStatus = 'needs-auth';
                context.logger.debug('[Dashboard] Auth check failed, showing needs-auth');
            } else if (hasMeshDeploymentRecord(project)) {
                // Read persisted status — card grid already computed full fidelity
                const summary = project.meshStatusSummary;
                meshStatus = summary === 'stale' ? 'config-changed'
                    : (summary === 'unknown' || !summary) ? 'deployed'
                    : summary;

                // Lightweight background verification (is the mesh still there?)
                verifyMeshDeployment(context, project).catch(err => {
                    context.logger.debug('[Dashboard] Background mesh verification failed', err);
                });
            } else {
                meshStatus = 'not-deployed';
            }
        }
    }

    const meshEndpoint = project.meshState?.endpoint || meshComponent?.endpoint;
    const statusData = buildStatusPayload(
        project,
        frontendConfigChanged,
        meshComponent ? { status: meshStatus, endpoint: meshEndpoint } : undefined,
    );

    context.panel.webview.postMessage({
        type: 'statusUpdate',
        payload: statusData,
    });

    return { success: true, data: statusData };
};

/**
 * Handle 're-authenticate' message - Trigger browser authentication flow
 */
export const handleReAuthenticate: MessageHandler = async (context) => {
    try {
        const project = await context.stateManager.getCurrentProject();
        if (!project) {
            context.logger.error('[Dashboard] No current project for re-authentication');
            return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
        }

        // Helper to send progress updates to UI
        const sendAuthProgress = (message: string) => {
            context.panel?.webview.postMessage({
                type: 'meshStatusUpdate',
                payload: {
                    status: 'authenticating',
                    message,
                },
            });
        };

        // Update UI to 'authenticating' state
        sendAuthProgress('Opening browser for authentication...');

        context.logger.debug('[Dashboard] Starting re-authentication flow');

        const authManager = ServiceLocator.getAuthenticationService();

        // Trigger browser auth
        await authManager.login();

        context.logger.debug('[Dashboard] Browser authentication completed');
        sendAuthProgress('Restoring Adobe context...');

        // Auto-select project's Adobe context (org → project → workspace)
        // This ensures mesh commands have the required context and don't prompt interactively
        if (project.adobe?.organization) {
            context.logger.debug(`[Dashboard] Auto-selecting project org: ${project.adobe.organization}`);
            sendAuthProgress('Selecting organization...');

            try {
                await authManager.selectOrganization(project.adobe.organization);
                context.logger.debug('[Dashboard] Organization selected successfully');
            } catch (orgError) {
                context.logger.warn('[Dashboard] Could not select project organization', orgError as Error);
            }
        }

        // Auto-select project (requires org context)
        if (project.adobe?.projectId && project.adobe?.organization) {
            context.logger.debug(`[Dashboard] Auto-selecting project: ${project.adobe.projectId}`);
            sendAuthProgress('Selecting project...');

            try {
                await authManager.selectProject(project.adobe.projectId, project.adobe.organization);
                context.logger.debug('[Dashboard] Project selected successfully');
            } catch (projectError) {
                context.logger.warn('[Dashboard] Could not select project', projectError as Error);
            }
        }

        // Auto-select workspace (requires project context)
        if (project.adobe?.workspace && project.adobe?.projectId) {
            context.logger.debug(`[Dashboard] Auto-selecting workspace: ${project.adobe.workspace}`);
            sendAuthProgress('Selecting workspace...');

            try {
                await authManager.selectWorkspace(project.adobe.workspace, project.adobe.projectId);
                context.logger.debug('[Dashboard] Workspace selected successfully');
            } catch (workspaceError) {
                context.logger.warn('[Dashboard] Could not select workspace', workspaceError as Error);
            }
        }

        // Re-check mesh status with fresh authentication
        context.logger.debug('[Dashboard] Re-checking mesh status after authentication');
        sendAuthProgress('Checking mesh status...');
        await handleRequestStatus(context);

        return { success: true };
    } catch (error) {
        context.logger.error('[Dashboard] Re-authentication failed', error as Error);

        // Send error status to UI
        context.panel?.webview.postMessage({
            type: 'meshStatusUpdate',
            payload: {
                status: 'error',
                message: 'Authentication failed. Please try again.',
            },
        });

        return { success: false, error: 'Authentication failed', code: ErrorCode.AUTH_REQUIRED };
    }
};

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
 * Handle 'openBrowser' message - Open demo in browser (non-EDS projects)
 */
export const handleOpenBrowser: MessageHandler = async (context) => {
    const currentProject = await context.stateManager.getCurrentProject();
    const frontendPort = getProjectFrontendPort(currentProject);

    if (frontendPort) {
        const url = `http://localhost:${frontendPort}`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
        context.logger.debug(`[Dashboard] Opening browser: ${url}`);
    }

    return { success: true };
};

/**
 * Handle 'openLiveSite' message - Open EDS live site in browser
 *
 * Opens in incognito/private browsing mode to ensure a clean session
 * without cached content or logged-in states that could affect the demo.
 */
export const handleOpenLiveSite: MessageHandler = async (context, data) => {
    const payload = data as { url?: string };

    if (!payload?.url) {
        context.logger.warn('[Dashboard] openLiveSite called without URL');
        return { success: false, error: 'No URL provided', code: ErrorCode.CONFIG_INVALID };
    }

    // Validate URL before opening (security: prevents malicious URL injection)
    try {
        validateURL(payload.url);
    } catch (validationError) {
        context.logger.error('[Dashboard] Live site URL validation failed', validationError as Error);
        return { success: false, error: 'Invalid URL', code: ErrorCode.CONFIG_INVALID };
    }

    // Show progress notification while browser is opening
    // Incognito mode can take a moment to launch
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Opening in private browser...',
            cancellable: false,
        },
        async () => {
            // Open in incognito mode for clean demo experience (no cached content/cookies)
            // Falls back to normal browser if incognito mode is not available
            const openedIncognito = await openInIncognito(payload.url!);
            context.logger.debug(`[Dashboard] Opening live site: ${payload.url} (incognito: ${openedIncognito})`);
        },
    );

    return { success: true };
};

/**
 * Handle 'openDaLive' message - Open DA.live for authoring (EDS projects)
 */
export const handleOpenDaLive: MessageHandler = async (context, data) => {
    const payload = data as { url?: string };

    if (!payload?.url) {
        context.logger.warn('[Dashboard] openDaLive called without URL');
        return { success: false, error: 'No URL provided', code: ErrorCode.CONFIG_INVALID };
    }

    // Validate URL before opening (security: prevents malicious URL injection)
    try {
        validateURL(payload.url);
    } catch (validationError) {
        context.logger.error('[Dashboard] DA.live URL validation failed', validationError as Error);
        return { success: false, error: 'Invalid URL', code: ErrorCode.CONFIG_INVALID };
    }

    await vscode.env.openExternal(vscode.Uri.parse(payload.url));
    context.logger.debug(`[Dashboard] Opening DA.live: ${payload.url}`);

    return { success: true };
};

/**
 * Handle 'viewLogs' message - Toggle the logs output panel
 */
export const handleViewLogs: MessageHandler = async () => {
    await toggleLogsPanel();
    return { success: true };
};

/**
 * Handle 'viewDebugLogs' message - Show Debug output channel (technical diagnostics)
 */
export const handleViewDebugLogs: MessageHandler = async () => {
    await vscode.commands.executeCommand('demoBuilder.showDebugLogs');
    return { success: true };
};

/**
 * Handle 'configure' message - Open configuration UI
 */
export const handleConfigure: MessageHandler = async () => {
    await vscode.commands.executeCommand('demoBuilder.configureProject');
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
 * Handle 'openDevConsole' message - Open Adobe Developer Console
 */
export const handleOpenDevConsole: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    let consoleUrl = 'https://developer.adobe.com/console';

    if (hasAdobeWorkspaceContext(project)) {
        // Validate Adobe IDs before URL construction (security: prevents URL injection)
        try {
            const { validateOrgId, validateProjectId, validateWorkspaceId } = await import('@/core/validation');
            validateOrgId(project.adobe.organization);
            validateProjectId(project.adobe.projectId);
            validateWorkspaceId(project.adobe.workspace);
        } catch (validationError) {
            context.logger.error('[Dev Console] Adobe ID validation failed', validationError as Error);
            return { success: false, error: 'Invalid Adobe resource ID', code: ErrorCode.CONFIG_INVALID };
        }

        // Direct link to workspace
        consoleUrl = `https://developer.adobe.com/console/projects/${project.adobe.organization}/${project.adobe.projectId}/workspaces/${project.adobe.workspace}/details`;
        context.logger.debug('[Dev Console] Opening workspace-specific URL');
    } else if (hasAdobeProjectContext(project)) {
        // Validate Adobe IDs before URL construction (security: prevents URL injection)
        try {
            const { validateOrgId, validateProjectId } = await import('@/core/validation');
            validateOrgId(project.adobe.organization);
            validateProjectId(project.adobe.projectId);
        } catch (validationError) {
            context.logger.error('[Dev Console] Adobe ID validation failed', validationError as Error);
            return { success: false, error: 'Invalid Adobe resource ID', code: ErrorCode.CONFIG_INVALID };
        }

        // Fallback: project overview
        consoleUrl = `https://developer.adobe.com/console/projects/${project.adobe.organization}/${project.adobe.projectId}/overview`;
        context.logger.debug('[Dev Console] Opening project-specific URL (no workspace)');
    } else {
        context.logger.debug('[Dev Console] Opening generic console URL (missing IDs)');
    }

    // Validate final URL before opening (defense-in-depth)
    try {
        validateURL(consoleUrl);
    } catch (validationError) {
        context.logger.error('[Dev Console] URL validation failed', validationError as Error);
        return { success: false, error: 'Invalid URL', code: ErrorCode.CONFIG_INVALID };
    }

    await vscode.env.openExternal(vscode.Uri.parse(consoleUrl));
    return { success: true };
};

/**
 * Handle 'deleteProject' message - Delete current project
 *
 * Uses projectDeletionService for unified delete experience including EDS cleanup.
 * Panel disposal is handled by projectDeletionService when deletion succeeds.
 */
export const handleDeleteProject: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found to delete' };
    }

    return deleteProject(context, project);
};

/**
 * Handle 'viewComponents' message - Toggle the components tree view in the sidebar
 * Switches between UtilityBar (default) and Components tree
 */
export const handleViewComponents: MessageHandler = async () => {
    if (sessionUIState.isComponentsViewShown) {
        // Hide components, show UtilityBar
        await vscode.commands.executeCommand('setContext', 'demoBuilder.showComponents', false);
        sessionUIState.isComponentsViewShown = false;
    } else {
        // Show components, hide UtilityBar
        await vscode.commands.executeCommand('setContext', 'demoBuilder.showComponents', true);
        sessionUIState.isComponentsViewShown = true;
    }
    return { success: true };
};

/**
 * Reset toggle states (called when navigating away from dashboard)
 */
export function resetToggleStates(): void {
    sessionUIState.resetPanelState();
    // Also hide the components panel
    vscode.commands.executeCommand('setContext', 'demoBuilder.showComponents', false);
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

        // Reset toggle states (components, logs)
        resetToggleStates();

        // Clear current project from state
        await context.stateManager.clearProject();

        // Start transition BEFORE disposing to prevent disposal callback from firing
        await BaseWebviewCommand.startWebviewTransition();
        try {
            // Dispose Dashboard panel before opening Projects List
            // This prevents the blank webview issue during transition
            const dashboardPanel = BaseWebviewCommand.getActivePanel('demoBuilder.projectDashboard');
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
 * Handle 'resetEds' message - Reset EDS project to template state
 *
 * Resets the repository contents to match the template without deleting the repo.
 * This preserves the repo URL, settings, webhooks, and GitHub App installation.
 *
 * Delegates to shared EdsResetService for the core workflow.
 *
 * Steps:
 * 1. Reset repo to template using bulk tree operations
 * 2. Waits for code sync
 * 3. Copies demo content to DA.live
 * 4. Publishes all content to CDN
 */
export const handleResetEds: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();

    if (!project) {
        context.logger.error('[Dashboard] resetEds: No current project');
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    // Extract reset parameters from project
    const { extractResetParams, executeEdsReset } =
        await import('@/features/eds/services/edsResetService');
    const paramsResult = extractResetParams(project);

    if (!paramsResult.success) {
        context.logger.error(`[Dashboard] resetEds: ${paramsResult.error}`);
        return { success: false, error: paramsResult.error, code: ErrorCode.CONFIG_INVALID };
    }

    const { repoOwner, repoName } = paramsResult.params;
    const repoFullName = `${repoOwner}/${repoName}`;

    // Pre-check DA.live authentication
    const daLiveAuthService = new DaLiveAuthService(context.context);
    const isDaLiveAuthenticated = await daLiveAuthService.isAuthenticated();

    if (!isDaLiveAuthenticated) {
        context.logger.info('[Dashboard] resetEds: DA.live token expired or missing');

        const signInButton = 'Sign In';
        const selection = await vscode.window.showWarningMessage(
            'Your DA.live session has expired. Please sign in to continue.',
            signInButton,
        );

        if (selection === signInButton) {
            const authResult = await showDaLiveAuthQuickPick(context);
            if (authResult.cancelled || !authResult.success) {
                return {
                    success: false,
                    error: authResult.error || 'DA.live authentication required',
                    errorType: 'DALIVE_AUTH_REQUIRED',
                    cancelled: authResult.cancelled,
                };
            }
        } else {
            return {
                success: false,
                error: 'DA.live authentication required',
                errorType: 'DALIVE_AUTH_REQUIRED',
            };
        }
    }

    // Show confirmation dialog
    const confirmButton = 'Reset Project';
    const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to reset this EDS project? This will reset all code to the template state and re-copy demo content.`,
        { modal: true },
        confirmButton,
    );

    if (confirmation !== confirmButton) {
        context.logger.info('[Dashboard] resetEds: User cancelled reset');
        return { success: false, cancelled: true };
    }

    // Check if AEM Code Sync app is installed
    const { tokenService: preCheckTokenService } = getGitHubServices(context);
    const { GitHubAppService } = await import('@/features/eds/services/githubAppService');
    const appService = new GitHubAppService(preCheckTokenService, context.logger);
    const appCheck = await appService.isAppInstalled(repoOwner, repoName);

    if (!appCheck.isInstalled) {
        context.logger.warn(`[Dashboard] AEM Code Sync app not installed on ${repoFullName}`);

        const installButton = 'Install App';
        const continueButton = 'Continue Anyway';
        const appWarning = await vscode.window.showWarningMessage(
            'The AEM Code Sync GitHub App is not installed on this repository. ' +
            'Without it, code changes will not sync to the CDN and the site may not work correctly.',
            installButton,
            continueButton,
        );

        if (appWarning === installButton) {
            const installUrl = appService.getInstallUrl(repoOwner, repoName);
            await vscode.env.openExternal(vscode.Uri.parse(installUrl));

            const afterInstall = await vscode.window.showInformationMessage(
                'After installing the app, click Continue to proceed with the reset.',
                'Continue',
                'Cancel',
            );

            if (afterInstall !== 'Continue') {
                context.logger.info('[Dashboard] resetEds: User cancelled after app installation prompt');
                return { success: false, cancelled: true };
            }
        } else if (appWarning !== continueButton) {
            context.logger.info('[Dashboard] resetEds: User cancelled at app check');
            return { success: false, cancelled: true };
        }
    }

    // Create token provider for DA.live operations
    const tokenProvider = {
        getAccessToken: async () => {
            return await daLiveAuthService.getAccessToken();
        },
    };

    // Execute reset with progress notification
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Resetting EDS Project',
            cancellable: false,
        },
        async (progress) => {
            context.logger.info(`[Dashboard] Resetting EDS project: ${repoFullName}`);

            const result = await executeEdsReset(
                paramsResult.params,
                context,
                tokenProvider,
                (p) => {
                    progress.report({ message: `Step ${p.step}/${p.totalSteps}: ${p.message}` });
                },
            );

            if (result.success) {
                // Show auto-dismissing success notification
                void vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: `"${project.name}" reset successfully` },
                    async () => new Promise(resolve => setTimeout(resolve, TIMEOUTS.UI.NOTIFICATION)),
                );
            } else if (result.errorType === 'GITHUB_APP_NOT_INSTALLED') {
                const installButton = 'Install GitHub App';
                const selection = await vscode.window.showErrorMessage(
                    `Cannot reset EDS project: The AEM Code Sync GitHub App is not installed on ${result.errorDetails?.owner}/${result.errorDetails?.repo}. ` +
                    `Please install the app and try again.`,
                    installButton,
                );
                if (selection === installButton && result.errorDetails?.installUrl) {
                    await vscode.env.openExternal(vscode.Uri.parse(result.errorDetails.installUrl as string));
                }
            } else if (result.error) {
                vscode.window.showErrorMessage(`Failed to reset EDS project: ${result.error}`);
            }

            return result;
        },
    );
};

// ============================================================================
// Handler Map Export (Step 3: Handler Registry Simplification)
// ============================================================================

import { defineHandlers } from '@/types/handlers';

/**
 * Dashboard feature handler map
 * Maps message types to handler functions for the Project Dashboard
 *
 * Replaces DashboardHandlerRegistry class with simple object literal.
 */
export const dashboardHandlers = defineHandlers({
    // Initialization handlers
    'ready': handleReady,
    'requestStatus': handleRequestStatus,

    // Authentication handlers
    're-authenticate': handleReAuthenticate,

    // Demo lifecycle handlers
    'startDemo': handleStartDemo,
    'stopDemo': handleStopDemo,

    // Navigation handlers
    'openBrowser': handleOpenBrowser,
    'openLiveSite': handleOpenLiveSite,
    'openDaLive': handleOpenDaLive,
    'viewLogs': handleViewLogs,
    'viewDebugLogs': handleViewDebugLogs,
    'configure': handleConfigure,
    'openDevConsole': handleOpenDevConsole,
    'navigateBack': handleNavigateBack,
    'viewComponents': handleViewComponents,

    // Mesh handlers
    'deployMesh': handleDeployMesh,

    // Project management handlers
    'deleteProject': handleDeleteProject,

    // EDS handlers
    'resetEds': handleResetEds,
});
