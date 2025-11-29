/**
 * Dashboard Handlers
 *
 * Message handlers for the Project Dashboard webview.
 * These handlers orchestrate dashboard operations by delegating to appropriate services.
 */

import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di';
import { Logger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateURL } from '@/core/validation';
import { detectMeshChanges, detectFrontendChanges } from '@/features/mesh/services/stalenessDetector';
import { MESH_STATUS_MESSAGES } from '@/features/mesh/services/types';
import { Project, ComponentInstance } from '@/types';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler, HandlerContext } from '@/types/handlers';
import { hasEntries, getProjectFrontendPort } from '@/types/typeGuards';

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

    if (shouldAsync) {
        // Send initial status with 'checking' for mesh
        const initialStatusData = buildStatusPayload(project, frontendConfigChanged, {
            status: 'checking',
            message: MESH_STATUS_MESSAGES.CHECKING,
        });

        context.panel.webview.postMessage({
            type: 'statusUpdate',
            payload: initialStatusData,
        });

        // Check mesh status asynchronously
        checkMeshStatusAsync(context, project, meshComponent, frontendConfigChanged).catch(err => {
            context.logger.error('[Dashboard] Failed to check mesh status', err as Error);
        });

        return { success: true, data: initialStatusData };
    }

    // For other cases (deploying, error, no mesh), continue with synchronous check
    let meshStatus: 'deploying' | 'deployed' | 'config-changed' | 'update-declined' | 'not-deployed' | 'error' | 'checking' = 'not-deployed';

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
                        meshStatus = determineMeshStatus(meshChanges, meshComponent, project);

                        if (meshChanges.hasChanges && meshChanges.unknownDeployedState) {
                            context.logger.debug('[Dashboard] Mesh flagged as changed due to unknown deployed state');
                        }

                        // Verify mesh still exists
                        verifyMeshDeployment(context, project).catch(err => {
                            context.logger.debug('[Project Dashboard] Background mesh verification failed', err);
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

    const statusData = buildStatusPayload(
        project,
        frontendConfigChanged,
        meshComponent ? { status: meshStatus, endpoint: meshComponent.endpoint } : undefined,
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

        // Update UI to 'authenticating' state
        context.panel?.webview.postMessage({
            type: 'meshStatusUpdate',
            payload: {
                status: 'authenticating',
                message: 'Opening browser for authentication...',
            },
        });

        context.logger.debug('[Dashboard] Starting re-authentication flow');

        const authManager = ServiceLocator.getAuthenticationService();

        // Trigger browser auth
        await authManager.login();

        context.logger.info('[Dashboard] Browser authentication completed');

        // Auto-select project's organization if available
        if (project.adobe?.organization) {
            context.logger.debug(`[Dashboard] Auto-selecting project org: ${project.adobe.organization}`);

            try {
                await authManager.selectOrganization(project.adobe.organization);
                context.logger.info('[Dashboard] Organization selected successfully');
            } catch (orgError) {
                context.logger.warn('[Dashboard] Could not select project organization', orgError as Error);
            }
        }

        // Re-check mesh status with fresh authentication
        context.logger.debug('[Dashboard] Re-checking mesh status after authentication');
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
 * Handle 'openBrowser' message - Open demo in browser
 */
export const handleOpenBrowser: MessageHandler = async (context) => {
    const currentProject = await context.stateManager.getCurrentProject();
    const frontendPort = getProjectFrontendPort(currentProject);

    if (frontendPort) {
        const url = `http://localhost:${frontendPort}`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
        context.logger.debug(`[Project Dashboard] Opening browser: ${url}`);
    }

    return { success: true };
};

/**
 * Handle 'viewLogs' message - Show Logs output channel (user-facing)
 */
export const handleViewLogs: MessageHandler = async () => {
    await vscode.commands.executeCommand('demoBuilder.showLogs');
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
 */
export const handleDeleteProject: MessageHandler = async (context) => {
    await vscode.commands.executeCommand('demoBuilder.deleteProject');
    // Close dashboard after delete
    context.panel?.dispose();
    return { success: true };
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build the standard status payload for dashboard updates
 */
interface MeshStatusInfo {
    status: string;
    endpoint?: string;
    message?: string;
}

function buildStatusPayload(
    project: Project,
    frontendConfigChanged: boolean,
    mesh?: MeshStatusInfo,
): {
    name: string;
    path: string;
    status: string;
    port: number | undefined;
    adobeOrg: string | undefined;
    adobeProject: string | undefined;
    frontendConfigChanged: boolean;
    mesh?: MeshStatusInfo;
} {
    return {
        name: project.name,
        path: project.path,
        status: project.status || 'ready',
        port: project.componentInstances?.['citisignal-nextjs']?.port,
        adobeOrg: project.adobe?.organization,
        adobeProject: project.adobe?.projectName,
        frontendConfigChanged,
        mesh,
    };
}

/**
 * Check if mesh has been deployed (has env vars recorded from previous deployment)
 */
function hasMeshDeploymentRecord(project: Project): boolean {
    return Boolean(project.meshState && hasEntries(project.meshState.envVars));
}

/**
 * Type for project with guaranteed Adobe workspace context
 */
type ProjectWithAdobeWorkspace = Project & {
    adobe: NonNullable<Project['adobe']> & {
        organization: string;
        projectId: string;
        workspace: string;
    };
};

/**
 * Type for project with guaranteed Adobe project context (no workspace required)
 */
type ProjectWithAdobeProject = Project & {
    adobe: NonNullable<Project['adobe']> & {
        organization: string;
        projectId: string;
    };
};

/**
 * Type guard: Check if project has full Adobe workspace context (org + project + workspace)
 *
 * Extracts 3-level optional chain: project?.adobe?.organization && project?.adobe?.projectId && project?.adobe?.workspace
 */
function hasAdobeWorkspaceContext(project: Project | null | undefined): project is ProjectWithAdobeWorkspace {
    if (!project?.adobe) return false;
    const { organization, projectId, workspace } = project.adobe;
    return Boolean(organization && projectId && workspace);
}

/**
 * Type guard: Check if project has Adobe project context (org + project, no workspace required)
 *
 * Extracts 3-level optional chain: project?.adobe?.organization && project?.adobe?.projectId
 */
function hasAdobeProjectContext(project: Project | null | undefined): project is ProjectWithAdobeProject {
    if (!project?.adobe) return false;
    const { organization, projectId } = project.adobe;
    return Boolean(organization && projectId);
}

/**
 * Determine mesh status based on changes and component state
 */
function determineMeshStatus(
    meshChanges: { hasChanges: boolean; unknownDeployedState?: boolean },
    meshComponent: ComponentInstance,
    project: Project,
): 'deployed' | 'config-changed' | 'update-declined' | 'error' | 'checking' {
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
function shouldAsyncCheckMesh(meshComponent: ComponentInstance | undefined): boolean {
    return Boolean(meshComponent && meshComponent.status !== 'deploying' && meshComponent.status !== 'error');
}

/**
 * Check mesh status asynchronously and update UI when complete
 */
async function checkMeshStatusAsync(
    context: HandlerContext,
    project: Project,
    meshComponent: ComponentInstance,
    frontendConfigChanged: boolean,
): Promise<void> {
    context.logger.debug('[Dashboard] Starting async mesh status check');

    try {
        let meshStatus: 'needs-auth' | 'deploying' | 'deployed' | 'config-changed' | 'update-declined' | 'not-deployed' | 'error' | 'checking' = 'not-deployed';
        let meshEndpoint: string | undefined;
        let meshMessage: string | undefined;

        if (project.componentConfigs) {
            const authManager = ServiceLocator.getAuthenticationService();

            const isAuthenticated = await authManager.isAuthenticated();

            if (!isAuthenticated) {
                context.panel?.webview.postMessage({
                    type: 'statusUpdate',
                    payload: buildStatusPayload(project, frontendConfigChanged, {
                        status: 'needs-auth',
                        message: 'Sign in to verify mesh status',
                    }),
                });
                return;
            }

            // Check org access
            await authManager.ensureSDKInitialized();

            if (project.adobe?.organization) {
                const currentOrg = await authManager.getCurrentOrganization();
                if (!currentOrg || currentOrg.id !== project.adobe.organization) {
                    context.logger.warn('[Dashboard] User lost access to project organization');
                    context.panel?.webview.postMessage({
                        type: 'statusUpdate',
                        payload: buildStatusPayload(project, frontendConfigChanged, {
                            status: 'error',
                            message: 'Organization access lost',
                        }),
                    });
                    return;
                }
            }

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
                meshStatus = determineMeshStatus(meshChanges, meshComponent, project);
                meshEndpoint = meshComponent.endpoint;

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
async function sendDemoStatusUpdate(context: HandlerContext): Promise<void> {
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
            if (project.componentConfigs) {
                const meshChanges = await detectMeshChanges(project, project.componentConfigs);
                meshStatus = {
                    status: meshChanges.hasChanges ? 'config-changed' : 'deployed',
                    endpoint: meshComponent.endpoint,
                };
            } else {
                meshStatus = { status: 'deployed', endpoint: meshComponent.endpoint };
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
async function verifyMeshDeployment(context: HandlerContext, project: Project): Promise<void> {
    const { verifyMeshDeployment: verify, syncMeshStatus } = await import('@/features/mesh/services/meshVerifier');

    const verificationResult = await verify(project);

    if (!verificationResult.success || !verificationResult.data?.exists) {
        context.logger.warn('[Project Dashboard] Mesh verification failed - mesh may not exist in Adobe I/O', {
            error: verificationResult.success ? undefined : verificationResult.error,
        });

        await syncMeshStatus(project, verificationResult);
        await context.stateManager.saveProject(project);

        await handleRequestStatus(context);

        if (context.panel) {
            await context.panel.webview.postMessage({
                type: 'meshStatusUpdate',
                payload: {
                    status: 'not-deployed',
                    message: 'Mesh not found in Adobe I/O - may have been deleted externally',
                },
            });
        }
    } else {
        await syncMeshStatus(project, verificationResult);
        await context.stateManager.saveProject(project);
    }
}
