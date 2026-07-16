/**
 * Dashboard Handlers
 *
 * Message handlers for the Project Dashboard webview.
 * These handlers orchestrate dashboard operations by delegating to appropriate services.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import {
    buildStatusPayload,
    getMeshEndpoint,
    hasMeshDeploymentRecord,
    hasAdobeWorkspaceContext,
    hasAdobeProjectContext,
    sendDemoStatusUpdate,
} from './meshStatusHelpers';
import { BaseWebviewCommand } from '@/core/base';
import { AI_CONTEXT_VERSION, COMPONENT_IDS } from '@/core/constants';
import { ServiceLocator } from '@/core/di';
import { openInIncognito } from '@/core/utils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    validateURL,
    validateOrgId,
    validateProjectId,
    validateWorkspaceId,
} from '@/core/validation';
import { verifyAiSetup } from '@/features/ai';
import { detectMcpDrift } from '@/features/ai/mcpDriftDetector';
import {
    handleRegenerateAiFiles,
    logAiVerification,
} from '@/features/dashboard/handlers/aiHandlers';
import {
    handleAddAppBuilderComponent,
    handleDeployAppBuilderComponent,
    handleRedeployAppBuilderComponent,
    handleRemoveAppBuilderComponent,
    handleRenameAppBuilderComponent,
    handleVerifyAppBuilderComponent,
} from '@/features/dashboard/handlers/appBuilderComponentHandlers';
import {
    handleAddConsoleApis,
    handleListConsoleApis,
    handleSetConsoleApis,
} from '@/features/dashboard/handlers/consoleApiHandlers';
import {
    runOnOpenChecks,
    orgContextCheck,
    createMcpHealthCheck,
    createMeshVerifyCheck,
    createAiVerifyCheck,
    createAiContextFreshnessCheck,
} from '@/features/dashboard/services/onOpenChecks';
import {
    getEwCanvasBranch,
    resolveProjectAuthoringExperience,
} from '@/features/eds/handlers/edsHelpers';
import { detectFrontendChanges } from '@/features/mesh/services/stalenessDetector';
import { deleteProject } from '@/features/projects-dashboard/services/projectDeletionService';
import type { Project } from '@/types';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler, defineHandlers, HandlerContext } from '@/types/handlers';
import {
    getAdminPanelUrl,
    getEdsDaLiveUrl,
    getEdsLiveUrl,
    getMeshComponentInstance,
    getProjectFrontendPort,
    isEdsProject,
} from '@/types/typeGuards';

/**
 * Handle 'requestStatus' message - Send current project status
 *
 * Note: the dashboard's initial `init` payload (theme, project, hasMesh, isEds,
 * hasAdobeContext, …) is delivered once by BaseWebviewCommand via getInitialData
 * after the handshake. There is intentionally no `'ready'` handler that re-sends
 * a partial `init` — doing so previously clobbered rich fields (hasAdobeContext,
 * hasMesh, brand/stack names) that aren't ref-captured in the UI.
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
    const frontendConfigChanged =
        project.status === 'running' ? detectFrontendChanges(project) : false;

    context.logger.debug(`[Dashboard] Status request: mesh=${meshComponent?.status || 'none'}`);

    // Determine mesh status from persisted state (no redundant re-checking)
    let meshStatus: string = 'not-deployed';
    // Set when a deployed mesh should be background-verified on open (auth'd +
    // has a deployment record). The verify runs as the mesh-verify OnOpenCheck.
    let shouldVerifyMesh = false;

    if (meshComponent) {
        if (meshComponent.status === 'deploying') {
            meshStatus = 'deploying';
        } else {
            // Auth check — prompt for inline sign-in if not authenticated
            const authManager = ServiceLocator.getAuthenticationService();
            const { ensureAdobeIOAuth } = await import('@/core/auth/adobeAuthGuard');
            const authResult = await ensureAdobeIOAuth({
                authManager,
                logger: context.logger,
                logPrefix: '[Dashboard]',
                projectContext: {
                    organization: project.adobe?.organization,
                    projectId: project.adobe?.projectId,
                    workspace: project.adobe?.workspace,
                },
                warningMessage: 'Adobe sign-in required to check mesh status.',
            });

            if (!authResult.authenticated) {
                meshStatus = 'needs-auth';
            }

            // Only check deployment status if authenticated
            if (authResult.authenticated) {
                if (hasMeshDeploymentRecord(project)) {
                    // Read persisted status — card grid already computed full fidelity
                    const summary = project.meshStatusSummary;
                    if (summary === 'stale') {
                        meshStatus = 'config-changed';
                    } else if (summary === 'unknown' || !summary) {
                        meshStatus = 'deployed';
                    } else {
                        meshStatus = summary;
                    }

                    // Background verification (is the mesh still there?) runs as the
                    // mesh-verify OnOpenCheck below — it ALWAYS posts a typed outcome
                    // (ok / warning-gone / unknown-transient), never a silent flip.
                    shouldVerifyMesh = true;
                } else {
                    meshStatus = 'not-deployed';
                }
            }
            // If not authenticated, meshStatus remains 'needs-auth' from above
        }
    }

    // Keyed-first (ADR-011 D3 Steps 07+09): the endpoint lives on the keyed
    // mesh appBuilderComponents entry (legacy meshState fallback inside).
    const meshEndpoint = getMeshEndpoint(project);
    const statusData = buildStatusPayload(
        project,
        frontendConfigChanged,
        meshComponent ? { status: meshStatus, endpoint: meshEndpoint } : undefined,
    );

    context.panel.webview.postMessage({
        type: 'statusUpdate',
        payload: statusData,
    });

    // On-open checks run through the orchestrator (fire-and-forget): each posts a
    // typed outcome on the single `checkResult` channel.
    //   - org-context: non-interactive (P1) — never a browser/stall on open; the
    //     slow/CLI path stays behind user actions (Switch IMS Org / Sign in).
    //   - mcp-health (EDS only): detects stale .mcp.json paths and VISIBLY auto-heals
    //     (P2) via the regenerate pipeline, replacing the silent MODULE_NOT_FOUND.
    //   - mesh-verify (only when a deployed mesh is auth-reachable): always posts a
    //     typed outcome (ok / warning-gone / unknown-transient), never a silent flip.
    //   - ai-verify: the single on-open AI verification (the hook no longer pulls it),
    //     surfacing which MCP/skill failed and why (P2). Spawns servers once.
    const checks = [
        orgContextCheck,
        createMcpHealthCheck({
            detectDrift: detectMcpDrift,
            heal: () => handleRegenerateAiFiles(context),
        }),
        // ai-context-freshness (all projects): stamp-vs-constant staleness. Detect-only
        // per the OnOpenCheck P1 contract — a stale project flips the AI badge to
        // "AI files out of date", surfacing the existing "Regenerate AI files" action
        // (the user's explicit click is the remediation; no on-open prompt or heal).
        createAiContextFreshnessCheck({ currentVersion: AI_CONTEXT_VERSION }),
        createAiVerifyCheck({
            verify: async (p) => {
                // dist path resolved lazily (inside the check) — server-side only.
                const extensionDistPath = path.join(context.context.extensionPath, 'dist');
                const result = await verifyAiSetup(p, extensionDistPath);
                logAiVerification(context, result); // preserve the on-open observability
                return result;
            },
        }),
    ];
    if (shouldVerifyMesh) {
        // Single lazy import (resolved once) shared by both injected fns.
        const meshVerifier = await import('@/features/mesh/services/meshVerifier');
        checks.push(
            createMeshVerifyCheck({
                verify: (p) => meshVerifier.verifyMeshDeployment(p),
                syncMeshStatus: (p, r) => meshVerifier.syncMeshStatus(p, r),
                markDirty: (key) => context.stateManager.markDirty(key),
            }),
        );
    }

    void runOnOpenChecks(
        {
            project,
            logger: context.logger,
            isEds: isEdsProject(project),
            postMessage: (type, payload) => context.panel?.webview.postMessage({ type, payload }),
        },
        checks,
    );

    return { success: true, data: statusData };
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

    const url = payload?.url;
    if (!url) {
        context.logger.warn('[Dashboard] openLiveSite called without URL');
        return { success: false, error: 'No URL provided', code: ErrorCode.CONFIG_INVALID };
    }

    // Validate URL before opening (security: prevents malicious URL injection)
    try {
        validateURL(url);
    } catch (validationError) {
        context.logger.error(
            '[Dashboard] Live site URL validation failed',
            validationError as Error,
        );
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
            const openedIncognito = await openInIncognito(url);
            context.logger.debug(
                `[Dashboard] Opening live site: ${url} (incognito: ${openedIncognito})`,
            );
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
 * Handle 'openAdminPanel' message - Open the Commerce admin panel in the browser
 *
 * The admin URL resolves via getAdminPanelUrl: an explicit
 * ADOBE_COMMERCE_ADMIN_URL (PaaS Configure field / override) wins, otherwise
 * SaaS projects derive it from the ACCS tenant endpoint. When unresolvable,
 * a notification offers a jump to Configure instead of failing.
 */
export const handleOpenAdminPanel: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    const url = getAdminPanelUrl(project);

    if (!url) {
        // Fire-and-forget — the notification must not block the handler response.
        void vscode.window
            .showInformationMessage('No Admin Panel URL is set for this project.', 'Open Configure')
            .then((selection) => {
                if (selection === 'Open Configure') {
                    // Returned (not voided) so a rejection reaches the handler below.
                    return vscode.commands.executeCommand('demoBuilder.configureProject');
                }
                return undefined;
            })
            .then(undefined, (error) => {
                context.logger.error(
                    '[Dashboard] Failed to open Configure from admin-panel prompt',
                    error as Error,
                );
            });
        return { success: true };
    }

    // Validate URL before opening (security: prevents malicious URL injection).
    // http is allowed alongside https — the Configure field accepts both, and the
    // localhost/private-IP blocks still apply (mirrors configureHandlers).
    try {
        validateURL(url, ['https', 'http']);
    } catch (validationError) {
        context.logger.error(
            '[Dashboard] Admin panel URL validation failed',
            validationError as Error,
        );
        return { success: false, error: 'Invalid URL', code: ErrorCode.CONFIG_INVALID };
    }

    // No URL in the log — the stored value is user-supplied and may embed credentials.
    context.logger.debug('[Dashboard] Opening admin panel');
    await vscode.env.openExternal(vscode.Uri.parse(url));

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
 * Handle 'editProject' message - Open the wizard in edit mode for the current project
 *
 * Mirrors the projects-home kebab's Edit action, resolved via getCurrentProject()
 * (the dashboard always operates on the current project). Reuses the shared
 * extractSettingsFromProject so both entry points feed the wizard identically.
 */
export const handleEditProject: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const { extractSettingsFromProject } = await import('@/features/projects-dashboard/services');
    // Include secrets — this is a local edit of the user's own project.
    const settings = extractSettingsFromProject(project, true);

    context.logger.info(`Opening edit wizard for project: ${project.name}`);
    await vscode.commands.executeCommand('demoBuilder.createProject', {
        editProject: {
            projectPath: project.path,
            projectName: project.name,
            settings,
        },
    });

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
 * Handle 'syncStorefront' message - Push storefront changes and refresh Helix preview/live
 */
export const handleSyncStorefront: MessageHandler = async () => {
    await vscode.commands.executeCommand('demoBuilder.syncStorefront');
    return { success: true };
};

/**
 * Handle 'refreshBlockLibrary' message - Rebuild the DA.live authoring library
 * from the project's current component-definition.json.
 *
 * EDS-only kebab action for users who hand-edit component-definition.json
 * outside the AI flow and want to re-sync the DA.live library destructively.
 *
 * Return contract: `{ success: true }` means the command was **dispatched**, not
 * that the rebuild succeeded. The pipeline runs asynchronously under the
 * RefreshBlockLibraryCommand and reports its outcome via VS Code notifications
 * (progress + success/error toasts). The webview does not poll for completion;
 * the kebab item simply fires-and-forgets and the user watches the notification.
 */
export const handleRefreshBlockLibrary: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project loaded', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const { isEdsProject } = await import('@/types/typeGuards');
    if (!isEdsProject(project)) {
        return {
            success: false,
            error: 'Block library refresh applies to EDS projects only',
            code: ErrorCode.INVALID_OPERATION,
        };
    }

    await vscode.commands.executeCommand('demoBuilder.refreshBlockLibrary');
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
            const { validateOrgId, validateProjectId, validateWorkspaceId } = await import(
                '@/core/validation'
            );
            validateOrgId(project.adobe.organization);
            validateProjectId(project.adobe.projectId);
            validateWorkspaceId(project.adobe.workspace);
        } catch (validationError) {
            context.logger.error(
                '[Dev Console] Adobe ID validation failed',
                validationError as Error,
            );
            return {
                success: false,
                error: 'Invalid Adobe resource ID',
                code: ErrorCode.CONFIG_INVALID,
            };
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
            context.logger.error(
                '[Dev Console] Adobe ID validation failed',
                validationError as Error,
            );
            return {
                success: false,
                error: 'Invalid Adobe resource ID',
                code: ErrorCode.CONFIG_INVALID,
            };
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
 * Build the Developer Console deep link for a project (workspace → project →
 * generic). Mirrors {@link handleOpenDevConsole}'s branching but, being a READ,
 * falls back to the generic console URL on a malformed id instead of erroring.
 */
function resolveDevConsoleUrl(
    project: Project | undefined | null,
    context: HandlerContext,
): string {
    const generic = 'https://developer.adobe.com/console';
    try {
        if (hasAdobeWorkspaceContext(project)) {
            validateOrgId(project.adobe.organization);
            validateProjectId(project.adobe.projectId);
            validateWorkspaceId(project.adobe.workspace);
            return `https://developer.adobe.com/console/projects/${project.adobe.organization}/${project.adobe.projectId}/workspaces/${project.adobe.workspace}/details`;
        }
        if (hasAdobeProjectContext(project)) {
            validateOrgId(project.adobe.organization);
            validateProjectId(project.adobe.projectId);
            return `https://developer.adobe.com/console/projects/${project.adobe.organization}/${project.adobe.projectId}/overview`;
        }
    } catch {
        context.logger.warn(
            '[Get URLs] Dev Console id validation failed; using the generic console URL',
        );
    }
    return generic;
}

/**
 * Handle 'getProjectUrls' message - Return the project's useful URLs as DATA.
 *
 * The read behind the get_project_urls MCP tool. Computes each URL from the
 * SAME getters the open-in-browser handlers use, so an agent gets what a click
 * would open without the browser side effect. Absent URLs are omitted (the
 * getters return undefined). Deliberately pure: it never opens a browser and
 * never runs the admin-panel "Open Configure" prompt — an unresolvable admin
 * URL is simply omitted.
 */
export const handleGetProjectUrls: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const urls: Record<string, string> = {};

    // Local dev storefront — present only while the demo is running (port assigned).
    const frontendPort = getProjectFrontendPort(project);
    if (frontendPort) urls.storefront = `http://localhost:${frontendPort}`;

    // EDS live site + DA.live authoring (undefined for non-EDS projects).
    const liveSite = getEdsLiveUrl(project);
    if (liveSite) urls.liveSite = liveSite;
    const daLive = getEdsDaLiveUrl(
        project,
        resolveProjectAuthoringExperience(project),
        getEwCanvasBranch(),
    );
    if (daLive) urls.daLive = daLive;

    // Commerce admin — the pure getter (explicit field or derived ACCS URL); no prompt.
    const commerceAdmin = getAdminPanelUrl(project);
    if (commerceAdmin) urls.commerceAdmin = commerceAdmin;

    // Developer Console — always resolvable (deep link or generic fallback).
    urls.devConsole = resolveDevConsoleUrl(project, context);

    return { success: true, data: { urls } };
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
 * Handle 'resetProject' message - Reset project to initial state
 *
 * Dispatches to the appropriate reset service based on project type:
 * - EDS projects: resetEdsProjectWithUI (template-based reset)
 * - Headless projects: resetProjectWithUI (component re-clone)
 */
export const handleResetProject: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();

    if (!project) {
        context.logger.error('[Dashboard] resetProject: No current project');
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const { isEdsProject } = await import('@/types/typeGuards');

    if (isEdsProject(project)) {
        const { resetEdsProjectWithUI } = await import('@/features/eds/services/edsResetUI');
        return resetEdsProjectWithUI({
            project,
            context,
            logPrefix: '[Dashboard]',
        });
    }

    const { resetProjectWithUI } = await import(
        '@/features/lifecycle/services/projectResetService'
    );
    return resetProjectWithUI({
        project,
        context,
        logPrefix: '[Dashboard]',
    });
};

/**
 * Handle 'exportProject' message - Export the current project's settings to a file
 *
 * Reuses the shared exportProjectSettings service (same one the kebab uses).
 */
export const handleExportProject: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const { exportProjectSettings } = await import('@/features/projects-dashboard/services');
    return exportProjectSettings(context, project);
};

/**
 * Handle 'republishContent' message - Republish DA.live content to CDN (EDS only)
 *
 * Mirrors the kebab's handleRepublishContent but resolves the project via
 * getCurrentProject(). Reuses republishStorefrontContent and the same EDS
 * metadata reads + DA.live auth + progress notification.
 */
export const handleRepublishContent: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    // Read EDS metadata from the storefront component instance
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const repoFullName = edsInstance?.metadata?.githubRepo as string | undefined;
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;

    if (!repoFullName) {
        vscode.window.showErrorMessage(
            'Repository information not found. Republish is only available for EDS projects.',
        );
        return {
            success: false,
            error: 'Repository information not found. Republish is only available for EDS projects.',
        };
    }

    const [repoOwner, repoName] = repoFullName.split('/');
    if (!repoOwner || !repoName) {
        vscode.window.showErrorMessage('Invalid repository format');
        return { success: false, error: 'Invalid repository format' };
    }

    const effectiveDaLiveOrg = daLiveOrg || repoOwner;
    const effectiveDaLiveSite = daLiveSite || repoName;

    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Republishing ${project.name}`,
            cancellable: false,
        },
        async (progress) => {
            try {
                context.logger.info(`[Dashboard] Republishing content for ${repoFullName}`);

                progress.report({ message: 'Checking authentication...' });
                const { ensureDaLiveAuth, getDaLiveAuthService, getGitHubServices } = await import(
                    '@/features/eds/handlers/edsHelpers'
                );
                const daLiveAuthResult = await ensureDaLiveAuth(context, '[Dashboard]');

                if (!daLiveAuthResult.authenticated) {
                    return {
                        success: false,
                        error: daLiveAuthResult.error || 'DA.live authentication required',
                        errorType: 'DALIVE_AUTH_REQUIRED',
                        cancelled: daLiveAuthResult.cancelled,
                    };
                }

                const daLiveAuthService = getDaLiveAuthService(context.context);
                const { tokenService: githubTokenService } = getGitHubServices(context);

                progress.report({ message: 'Republishing content...' });
                const { republishStorefrontContent } = await import(
                    '@/features/eds/services/storefrontRepublishService'
                );
                const contentResult = await republishStorefrontContent({
                    project,
                    repoOwner,
                    repoName,
                    daLiveOrg: effectiveDaLiveOrg,
                    daLiveSite: effectiveDaLiveSite,
                    secrets: context.context.secrets,
                    logger: context.logger,
                    daLiveAuthService,
                    githubTokenService,
                    onProgress: (message: string) => progress.report({ message }),
                });

                if (!contentResult.success) {
                    return { success: false, error: contentResult.error };
                }
                if (!contentResult.cdnVerified) {
                    context.logger.warn(
                        '[Dashboard] CDN verification timed out - content may still be propagating',
                    );
                }

                context.logger.info(`[Dashboard] Content republished for ${repoFullName}`);
                return { success: true };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                context.logger.error('[Dashboard] Republish failed', error as Error);
                vscode.window.showErrorMessage(`Failed to republish content: ${errorMessage}`);
                return { success: false, error: errorMessage };
            }
        },
    );
};

/**
 * Handle 'renameProject' message - Rename the current project
 *
 * Resolves the project via getCurrentProject() (the {newName} payload is the
 * only data the dashboard sends), reuses the shared renameProjectCore, then
 * refreshes status so the dashboard title (driven by the status payload's name)
 * reflects the new name.
 */
export const handleRenameProject: MessageHandler<{ newName: string }> = async (context, data) => {
    const newName = data?.newName;
    if (!newName) {
        return { success: false, error: 'New name is required', code: ErrorCode.CONFIG_INVALID };
    }

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const { renameProjectCore } = await import('@/features/projects-dashboard/services');
    const result = await renameProjectCore(context, project, newName);

    // Refresh the dashboard title after a successful rename (folder/name changed).
    // The title is driven by the status payload's name, so re-run status.
    if (result.success && context.panel) {
        await handleRequestStatus(context);
    }

    return result;
};

/**
 * Handle 'exportProjectSettings' message — write the current project's settings
 * to a JSON file on disk (the headless entry behind the export_project_settings
 * MCP tool). Secrets go to the FILE only; the response carries just the path and
 * the includes-secrets flag, never the secret values. The target must resolve
 * inside the project directory. `includeSecrets` defaults to true (a local backup).
 */
export const handleExportProjectSettings: MessageHandler<{
    path?: string;
    includeSecrets?: boolean;
}> = async (context, data) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const { exportProjectSettingsToFile } = await import('@/features/projects-dashboard/services');
    try {
        const result = await exportProjectSettingsToFile(project, {
            path: data?.path,
            includeSecrets: data?.includeSecrets,
        });
        return { success: true, data: result };
    } catch (error) {
        context.logger.error(
            '[Dashboard] Failed to export project settings',
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to export project settings',
        };
    }
};

/**
 * Handle 'reAuthenticate' message - Re-authenticate with Adobe
 *
 * Called when user clicks "Sign in" link after session expired (needs-auth status).
 * Uses loginAndRestoreProjectContext to restore full project context after login,
 * then requests a status refresh to update the mesh status display.
 */
export const handleReAuthenticate: MessageHandler = async (context) => {
    context.logger.debug('[Dashboard] handleReAuthenticate called');

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project available', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const authManager = ServiceLocator.getAuthenticationService();

    context.logger.info('[Dashboard] Starting Adobe sign-in from re-authenticate link');
    const loginSuccess = await authManager.loginAndRestoreProjectContext({
        organization: project.adobe?.organization,
        projectId: project.adobe?.projectId,
        workspace: project.adobe?.workspace,
    });

    if (!loginSuccess) {
        context.logger.warn('[Dashboard] Sign-in failed or cancelled');
        return { success: false, error: 'Sign-in failed or cancelled' };
    }

    context.logger.info('[Dashboard] Sign-in successful, refreshing status');

    // Trigger status refresh by calling handleRequestStatus
    return handleRequestStatus(context);
};

/**
 * Handle 'switchOrg' message - Forced Adobe account/org switch recovery.
 *
 * Called when the dashboard detects an org mismatch (the project's Adobe org is
 * not reachable by the current token). Unlike the session-expiry re-auth path,
 * this performs a FORCED sign-in (`aio auth login -f`) so the browser presents
 * the IMS account/org chooser — a non-forced login would silently reuse the
 * browser's existing SSO session and could loop back to the wrong org.
 *
 * After the forced sign-in it re-runs the status check (verify): the refreshed
 * payload re-runs the proactive org-mismatch detection, so if the user is still
 * in the wrong org (e.g. another browser tab reasserted it) the banner persists
 * with a no-loop hint instead of silently failing.
 */
export const handleSwitchOrg: MessageHandler = async (context) => {
    context.logger.debug('[Dashboard] handleSwitchOrg called');

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project available', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const authManager = ServiceLocator.getAuthenticationService();

    context.logger.info('[Dashboard] Starting FORCED Adobe sign-in to switch organization');
    const loginSuccess = await authManager.loginAndRestoreProjectContext(
        {
            organization: project.adobe?.organization,
            projectId: project.adobe?.projectId,
            workspace: project.adobe?.workspace,
        },
        true, // force — present the browser org chooser; never silently reuse the SSO tab
    );

    if (!loginSuccess) {
        context.logger.warn('[Dashboard] Forced sign-in failed or cancelled');
        return { success: false, error: 'Sign-in failed or cancelled' };
    }

    // Verify the landed org by re-running the status check. If the token still
    // can't reach the project's org, handleRequestStatus re-surfaces orgMismatch
    // and the banner persists — no silent loop.
    context.logger.info('[Dashboard] Forced sign-in complete, verifying organization');
    return handleRequestStatus(context);
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
    // no 'ready' handler — see note on handleRequestStatus)
    requestStatus: handleRequestStatus,

    // Demo lifecycle handlers
    startDemo: handleStartDemo,
    stopDemo: handleStopDemo,

    // Navigation handlers
    openBrowser: handleOpenBrowser,
    openLiveSite: handleOpenLiveSite,
    openDaLive: handleOpenDaLive,
    openAdminPanel: handleOpenAdminPanel,
    configure: handleConfigure,
    openDevConsole: handleOpenDevConsole,
    getProjectUrls: handleGetProjectUrls,
    navigateBack: handleNavigateBack,

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
    verifyAppBuilderComponent: handleVerifyAppBuilderComponent,

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
});
