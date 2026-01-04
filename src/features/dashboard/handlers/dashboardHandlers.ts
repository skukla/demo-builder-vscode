/**
 * Dashboard Handlers
 *
 * Message handlers for the Project Dashboard webview.
 * These handlers orchestrate dashboard operations by delegating to appropriate services.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    buildStatusPayload,
    hasMeshDeploymentRecord,
    getMeshEndpoint,
    type MeshStatusInfo,
    type StatusPayload,
} from '../services/dashboardStatusService';
import { BaseWebviewCommand } from '@/core/base';
import { ServiceLocator } from '@/core/di';
import { sessionUIState } from '@/core/state/sessionUIState';
import { parseEnvFile } from '@/core/utils/envParser';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateURL } from '@/core/validation';
import { toggleLogsPanel } from '@/features/lifecycle/handlers/lifecycleHandlers';
import { detectMeshChanges, detectFrontendChanges } from '@/features/mesh/services/stalenessDetector';
import { MESH_STATUS_MESSAGES } from '@/features/mesh/services/types';
import { Project, ComponentInstance } from '@/types';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler, defineHandlers, HandlerContext } from '@/types/handlers';
import { getProjectFrontendPort } from '@/types/typeGuards';

// Re-export for backward compatibility with any external consumers
export {
    buildStatusPayload,
    hasMeshDeploymentRecord,
    getMeshEndpoint,
    type MeshStatusInfo,
    type StatusPayload,
} from '../services/dashboardStatusService';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Type for project with guaranteed Adobe workspace context
 */
export type ProjectWithAdobeWorkspace = Project & {
    adobe: NonNullable<Project['adobe']> & {
        organization: string;
        projectId: string;
        workspace: string;
    };
};

/**
 * Type for project with guaranteed Adobe project context (no workspace required)
 */
export type ProjectWithAdobeProject = Project & {
    adobe: NonNullable<Project['adobe']> & {
        organization: string;
        projectId: string;
    };
};

// ============================================================================
// MESH STATUS HELPERS
// ============================================================================

/**
 * Type guard: Check if project has full Adobe workspace context (org + project + workspace)
 *
 * Extracts 3-level optional chain: project?.adobe?.organization && project?.adobe?.projectId && project?.adobe?.workspace
 */
export function hasAdobeWorkspaceContext(project: Project | null | undefined): project is ProjectWithAdobeWorkspace {
    if (!project?.adobe) return false;
    const { organization, projectId, workspace } = project.adobe;
    return Boolean(organization && projectId && workspace);
}

/**
 * Type guard: Check if project has Adobe project context (org + project, no workspace required)
 *
 * Extracts 3-level optional chain: project?.adobe?.organization && project?.adobe?.projectId
 */
export function hasAdobeProjectContext(project: Project | null | undefined): project is ProjectWithAdobeProject {
    if (!project?.adobe) return false;
    const { organization, projectId } = project.adobe;
    return Boolean(organization && projectId);
}

/**
 * Format session expiration message
 *
 * SOP §3: Extracted nested ternary for pluralization
 *
 * @param expiredMinutesAgo - Number of minutes since session expired
 * @returns Human-readable expiration message
 */
export function getExpirationMessage(expiredMinutesAgo: number): string {
    if (expiredMinutesAgo <= 0) return 'Session expired';
    const pluralSuffix = expiredMinutesAgo !== 1 ? 's' : '';
    return `Session expired ${expiredMinutesAgo} minute${pluralSuffix} ago`;
}

/**
 * Required environment variables for mesh deployment (INPUT variables)
 * These must all be present in the mesh's .env file for deployment to work.
 *
 * Note: MESH_ENDPOINT is NOT in this list because it's an OUTPUT of deployment,
 * not an input. The mesh endpoint is stored in componentInstances['commerce-mesh'].endpoint
 * and is checked separately.
 */
const REQUIRED_MESH_ENV_VARS = [
    'ADOBE_COMMERCE_GRAPHQL_ENDPOINT',
    'ADOBE_CATALOG_SERVICE_ENDPOINT',
    'ADOBE_COMMERCE_URL',
    'ADOBE_COMMERCE_ENVIRONMENT_ID',
    'ADOBE_COMMERCE_STORE_VIEW_CODE',
    'ADOBE_COMMERCE_WEBSITE_CODE',
    'ADOBE_COMMERCE_STORE_CODE',
    'ADOBE_CATALOG_API_KEY',
];

/**
 * Check if all required mesh configuration fields are populated
 *
 * Checks both:
 * 1. The .env file for INPUT variables (commerce URLs, credentials)
 * 2. The mesh endpoint (OUTPUT of deployment) from componentInstances
 *
 * @param meshPath - Path to the mesh component directory
 * @param meshEndpoint - Mesh endpoint from componentInstances['commerce-mesh'].endpoint
 * @returns Object with isComplete flag and list of missing fields
 */
export async function checkMeshConfigCompleteness(
    meshPath: string | undefined,
    meshEndpointFromConfigs?: string,
): Promise<{
    isComplete: boolean;
    missingFields: string[];
}> {
    const missingFields: string[] = [];

    if (!meshPath) {
        return { isComplete: false, missingFields: [...REQUIRED_MESH_ENV_VARS, 'MESH_ENDPOINT'] };
    }

    // Read the .env file from the mesh component directory
    const envFilePath = path.join(meshPath, '.env');
    let envConfig: Record<string, string> = {};

    try {
        const content = await fs.readFile(envFilePath, 'utf-8');
        envConfig = parseEnvFile(content);
    } catch {
        // .env file doesn't exist or can't be read - all fields are missing
        return { isComplete: false, missingFields: [...REQUIRED_MESH_ENV_VARS, 'MESH_ENDPOINT'] };
    }

    // Check INPUT variables from .env file
    for (const field of REQUIRED_MESH_ENV_VARS) {
        const value = envConfig[field];
        if (value === undefined || value === null || value === '') {
            missingFields.push(field);
        }
    }

    // Check OUTPUT variable (mesh endpoint from componentInstances)
    if (!meshEndpointFromConfigs) {
        missingFields.push('MESH_ENDPOINT');
    }

    return {
        isComplete: missingFields.length === 0,
        missingFields,
    };
}

/**
 * Determine mesh status based on changes, component state, and config completeness
 */
export async function determineMeshStatus(
    meshChanges: { hasChanges: boolean; unknownDeployedState?: boolean },
    meshComponent: ComponentInstance,
    project: Project,
): Promise<'deployed' | 'config-changed' | 'config-incomplete' | 'update-declined' | 'error' | 'checking'> {
    // Get MESH_ENDPOINT from componentInstances (single source of truth)
    const meshEndpointFromConfigs = getMeshEndpoint(project);

    // Check if configuration is complete (both .env INPUT vars and mesh endpoint)
    const configCheck = await checkMeshConfigCompleteness(meshComponent.path, meshEndpointFromConfigs);
    if (!configCheck.isComplete) {
        return 'config-incomplete';
    }

    if (meshChanges.hasChanges) {
        // User previously declined update → 'update-declined' (orange badge)
        // Otherwise → 'config-changed' (yellow badge)
        return project.meshState?.userDeclinedUpdate ? 'update-declined' : 'config-changed';
    }
    // No config changes: show error if previous deployment failed, otherwise deployed
    return meshComponent.status === 'error' ? 'error' : 'deployed';
}

/**
 * Check if we should perform async mesh status check
 * (mesh exists, not currently deploying, and not in error state)
 */
export function shouldAsyncCheckMesh(meshComponent: ComponentInstance | undefined): boolean {
    return Boolean(meshComponent && meshComponent.status !== 'deploying' && meshComponent.status !== 'error');
}

/**
 * Check mesh status asynchronously and update UI when complete
 */
export async function checkMeshStatusAsync(
    context: HandlerContext,
    project: Project,
    meshComponent: ComponentInstance,
    frontendConfigChanged: boolean,
): Promise<void> {
    context.logger.debug('[Dashboard] Starting async mesh status check');

    try {
        let meshStatus: 'needs-auth' | 'deploying' | 'deployed' | 'config-changed' | 'config-incomplete' | 'update-declined' | 'not-deployed' | 'error' | 'checking' = 'not-deployed';
        let meshEndpoint: string | undefined;
        let meshMessage: string | undefined;

        if (project.componentConfigs) {
            const authManager = ServiceLocator.getAuthenticationService();

            const tokenStatus = await authManager.getTokenStatus();

            if (!tokenStatus.isAuthenticated) {
                // Calculate how long ago the session expired
                const expiredMinutesAgo = Math.abs(tokenStatus.expiresInMinutes);
                const expiredMessage = getExpirationMessage(expiredMinutesAgo);

                context.logger.debug(`[Dashboard] Auth check failed: ${expiredMessage}`);
                context.panel?.webview.postMessage({
                    type: 'statusUpdate',
                    payload: buildStatusPayload(project, frontendConfigChanged, {
                        status: 'needs-auth',
                        message: expiredMessage,
                    }),
                });
                return;
            }

            // Skip org access check during dashboard open - CLI commands can trigger
            // unexpected browser auth even when token appears valid.
            // Org access is verified when user attempts mesh operations instead.
            // See: dashboard regression where opening dashboard triggered browser login

            // Initialize meshState if needed
            if (!project.meshState) {
                project.meshState = {
                    envVars: {},
                    sourceHash: null,
                    lastDeployed: '',
                };
            }

            const meshChanges = await detectMeshChanges(project, project.componentConfigs);

            if (meshChanges.shouldSaveProject) {
                await context.stateManager.saveProject(project);
            }

            if (hasMeshDeploymentRecord(project)) {
                meshStatus = await determineMeshStatus(meshChanges, meshComponent, project);
                // Read endpoint from meshState (authoritative) with fallback to componentInstance (legacy)
                meshEndpoint = project.meshState?.endpoint || meshComponent.endpoint;

                verifyMeshDeployment(context, project).catch(() => {
                    // Background verification - errors logged internally
                });
            } else if (meshChanges.unknownDeployedState) {
                meshStatus = meshComponent.status === 'error' ? 'error' : 'not-deployed';
                meshMessage = MESH_STATUS_MESSAGES.UNKNOWN;
            }
        }

        context.logger.debug(`[Dashboard] Mesh check complete: ${meshStatus}`);
        if (context.panel) {
            context.panel.webview.postMessage({
                type: 'statusUpdate',
                payload: buildStatusPayload(project, frontendConfigChanged, {
                    status: meshStatus,
                    endpoint: meshEndpoint,
                    message: meshMessage,
                }),
            });
        }
    } catch (error) {
        context.logger.error('[Dashboard] Error in async mesh status check', error as Error);

        if (context.panel) {
            context.panel.webview.postMessage({
                type: 'statusUpdate',
                payload: buildStatusPayload(project, frontendConfigChanged, {
                    status: 'error',
                    message: 'Failed to check deployment status',
                }),
            });
        }
    }
}

/**
 * Send quick demo status update without re-checking mesh
 */
export async function sendDemoStatusUpdate(context: HandlerContext): Promise<void> {
    if (!context.panel) return;

    const project = await context.stateManager.getCurrentProject();
    if (!project) return;

    const frontendConfigChanged = project.status === 'running' ? detectFrontendChanges(project) : false;

    const meshComponent = project.componentInstances?.['commerce-mesh'];
    let meshStatus: { status: string; message?: string; endpoint?: string } | undefined = undefined;

    if (meshComponent) {
        if (meshComponent.status === 'deploying') {
            meshStatus = { status: 'deploying', message: 'Deploying...' };
        } else if (meshComponent.status === 'error') {
            meshStatus = { status: 'error', message: 'Deployment error' };
        } else if (hasMeshDeploymentRecord(project)) {
            // Read endpoint from meshState (authoritative) with fallback to componentInstance (legacy)
            const endpoint = project.meshState?.endpoint || meshComponent.endpoint;
            if (project.componentConfigs) {
                const meshChanges = await detectMeshChanges(project, project.componentConfigs);
                // Use determineMeshStatus for consistent config completeness checking
                const status = await determineMeshStatus(meshChanges, meshComponent, project);
                meshStatus = {
                    status,
                    endpoint,
                };
            } else {
                // No componentConfigs - MESH_ENDPOINT definitely missing from frontend .env
                meshStatus = {
                    status: 'config-incomplete',
                    endpoint,
                };
            }
        } else {
            meshStatus = { status: 'not-deployed' };
        }
    }

    context.panel.webview.postMessage({
        type: 'statusUpdate',
        payload: buildStatusPayload(project, frontendConfigChanged, meshStatus),
    });
}

/**
 * Verify mesh deployment with Adobe I/O
 */
export async function verifyMeshDeployment(context: HandlerContext, project: Project): Promise<void> {
    const { verifyMeshDeployment: verify, syncMeshStatus } = await import('@/features/mesh/services/meshVerifier');

    const verificationResult = await verify(project);

    if (!verificationResult.success || !verificationResult.data?.exists) {
        // Distinguish between verification errors and actual "mesh not found"
        const isVerificationError = !verificationResult.success;
        const errorMessage = verificationResult.error || '';

        if (isVerificationError) {
            context.logger.warn('[Dashboard] Cannot verify mesh - verification failed', {
                error: errorMessage,
            });
        } else {
            context.logger.warn('[Dashboard] Mesh not found in Adobe I/O - may have been deleted externally');
        }

        await syncMeshStatus(project, verificationResult);
        await context.stateManager.saveProject(project);

        // Note: Do NOT call handleRequestStatus() here - it would create an infinite loop
        // since handleRequestStatus() triggers verifyMeshDeployment() in the background.
        // The UI is updated via meshStatusUpdate message below.

        if (context.panel) {
            await context.panel.webview.postMessage({
                type: 'meshStatusUpdate',
                payload: {
                    status: 'not-deployed',
                    message: isVerificationError
                        ? 'Cannot verify mesh status'
                        : 'Mesh not found in Adobe I/O - may have been deleted externally',
                },
            });
        }
    } else {
        await syncMeshStatus(project, verificationResult);
        await context.stateManager.saveProject(project);
    }
}

// ============================================================================
// DASHBOARD HANDLERS
// ============================================================================

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

    const meshComponent = project.componentInstances?.['commerce-mesh'];
    const frontendConfigChanged = project.status === 'running' ? detectFrontendChanges(project) : false;
    const shouldAsync = meshComponent && shouldAsyncCheckMesh(meshComponent);

    context.logger.debug(`[Dashboard] Status request: mesh=${meshComponent?.status || 'none'}, asyncCheck=${shouldAsync}`);

    // Always send initial 'checking' status when mesh exists (unless deploying)
    // This ensures UI shows "Checking" state during any async operations
    if (meshComponent && meshComponent.status !== 'deploying') {
        const initialStatusData = buildStatusPayload(project, frontendConfigChanged, {
            status: 'checking',
            message: MESH_STATUS_MESSAGES.CHECKING,
        });

        context.panel.webview.postMessage({
            type: 'statusUpdate',
            payload: initialStatusData,
        });
    }

    if (shouldAsync) {
        // Check mesh status asynchronously
        checkMeshStatusAsync(context, project, meshComponent, frontendConfigChanged).catch(err => {
            context.logger.error('[Dashboard] Failed to check mesh status', err as Error);
        });

        // Return initial 'checking' status data for Pattern B (request-response)
        // UI receives data via return value AND postMessage updates
        const initialStatusData = buildStatusPayload(project, frontendConfigChanged, {
            status: 'checking',
            message: MESH_STATUS_MESSAGES.CHECKING,
        });
        return { success: true, data: initialStatusData };
    }

    // For other cases (deploying, error, no mesh), continue with synchronous check
    let meshStatus: 'deploying' | 'deployed' | 'config-changed' | 'config-incomplete' | 'update-declined' | 'not-deployed' | 'error' | 'checking' = 'not-deployed';

    if (meshComponent) {
        if (meshComponent.status === 'deploying') {
            meshStatus = 'deploying';
        }
        // Note: We still check for config changes even when status is 'error'
        // This allows the user to fix config errors and see 'config-changed' status
        // instead of being stuck on 'error' forever
        else {
            if (project.componentConfigs) {
                // Pre-check: Verify auth before fetching
                const authManager = ServiceLocator.getAuthenticationService();

                const isAuthenticated = await authManager.isAuthenticated();

                if (!isAuthenticated) {
                    meshStatus = 'not-deployed';
                } else {
                    // Initialize meshState if it doesn't exist
                    if (!project.meshState) {
                        project.meshState = {
                            envVars: {},
                            sourceHash: null,
                            lastDeployed: '',
                        };
                    }

                    const meshChanges = await detectMeshChanges(project, project.componentConfigs);

                    if (meshChanges.shouldSaveProject) {
                        context.logger.debug('[Dashboard] Populated meshState.envVars from deployed config, saving project');
                        await context.stateManager.saveProject(project);
                        // Note: Don't set meshStatus here - let the logic below handle it
                        // based on whether there are actual changes to display
                    }

                    if (hasMeshDeploymentRecord(project)) {
                        meshStatus = await determineMeshStatus(meshChanges, meshComponent, project);

                        if (meshChanges.hasChanges && meshChanges.unknownDeployedState) {
                            context.logger.debug('[Dashboard] Mesh flagged as changed due to unknown deployed state');
                        }

                        // Verify mesh still exists
                        verifyMeshDeployment(context, project).catch(err => {
                            context.logger.debug('[Dashboard] Background mesh verification failed', err);
                        });
                    } else if (meshChanges.unknownDeployedState) {
                        // Unable to determine if config changed
                        // If previous deployment failed, show error (encourages investigation)
                        // Otherwise show not-deployed (safe assumption when verification failed)
                        meshStatus = meshComponent.status === 'error' ? 'error' : 'not-deployed';
                        context.logger.debug('[Dashboard] Unable to verify mesh deployment status');
                    }
                }
            } else {
                context.logger.debug('[Dashboard] No component configs available for mesh status check');
            }
        }
    }

    // Read endpoint from meshState (authoritative) with fallback to componentInstance (legacy)
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

    await vscode.env.openExternal(vscode.Uri.parse(payload.url));
    context.logger.debug(`[Dashboard] Opening live site: ${payload.url}`);

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
 * Note: Panel disposal is handled by the deleteProject command itself
 * (via closeProjectPanels) only when deletion succeeds. We don't dispose
 * here because the user might cancel the confirmation dialog.
 */
export const handleDeleteProject: MessageHandler = async () => {
    await vscode.commands.executeCommand('demoBuilder.deleteProject');
    return { success: true };
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

// ============================================================================
// HANDLER MAP EXPORT
// ============================================================================

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
});
