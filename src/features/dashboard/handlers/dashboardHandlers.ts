/**
 * Dashboard Handlers
 *
 * Message handlers for the Project Dashboard webview.
 * These handlers orchestrate dashboard operations by delegating to appropriate services.
 */

import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di';
import { Logger } from '@/core/logging';
import { validateURL } from '@/core/validation';
import { AuthenticationService } from '@/features/authentication';
import { detectMeshChanges, detectFrontendChanges } from '@/features/mesh/services/stalenessDetector';
import { Project, ComponentInstance } from '@/types';
import { MessageHandler, HandlerResponse, HandlerContext } from '@/types/handlers';

/**
 * Handle 'ready' message - Send initialization data
 */
export const handleReady: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project || !context.panel) {
        return { success: false, error: 'No project or panel available' };
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
    if (!context.panel) {
        return { success: false, error: 'No panel available' };
    }

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project available' };
    }

    context.logger.debug('[Project Dashboard] Project data:', {
        hasComponentInstances: !!project.componentInstances,
        componentKeys: Object.keys(project.componentInstances || {}),
        hasMeshState: !!project.meshState,
        meshStateKeys: project.meshState ? Object.keys(project.meshState) : [],
    });

    const meshComponent = project.componentInstances?.['commerce-mesh'];

    context.logger.debug('[Project Dashboard] Mesh component data:', {
        hasMeshComponent: !!meshComponent,
        meshStatus: meshComponent?.status,
        meshEndpoint: meshComponent?.endpoint,
        meshPath: meshComponent?.path,
    });

    const frontendConfigChanged = project.status === 'running' ? detectFrontendChanges(project) : false;

    if (meshComponent && meshComponent.status !== 'deploying' && meshComponent.status !== 'error') {
        // Send initial status with 'checking' for mesh
        const initialStatusData = {
            name: project.name,
            path: project.path,
            status: project.status || 'ready',
            port: project.componentInstances?.['citisignal-nextjs']?.port,
            adobeOrg: project.adobe?.organization,
            adobeProject: project.adobe?.projectName,
            frontendConfigChanged,
            mesh: {
                status: 'checking',
                message: 'Verifying deployment status...',
            },
        };

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
    let meshStatus: 'deploying' | 'deployed' | 'config-changed' | 'not-deployed' | 'error' = 'not-deployed';

    if (meshComponent) {
        if (meshComponent.status === 'deploying') {
            meshStatus = 'deploying';
        }
        else if (meshComponent.status === 'error') {
            meshStatus = 'error';
        }
        else {
            if (project.componentConfigs) {
                context.logger.debug('[Dashboard] Checking mesh deployment status...');

                // Pre-check: Verify auth before fetching
                const authManager = ServiceLocator.getAuthenticationService();

                const isAuthenticated = await authManager.isAuthenticated();

                if (!isAuthenticated) {
                    context.logger.debug('[Dashboard] Not authenticated, skipping mesh status fetch');
                    meshStatus = 'not-deployed';
                } else {
                    // Initialize meshState if it doesn't exist
                    if (!project.meshState) {
                        context.logger.debug('[Dashboard] No meshState found, initializing empty state');
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
                        meshStatus = 'deployed';
                    }

                    if (project.meshState && Object.keys(project.meshState.envVars || {}).length > 0) {
                        meshStatus = 'deployed';

                        if (meshChanges.hasChanges) {
                            meshStatus = 'config-changed';

                            if (meshChanges.unknownDeployedState) {
                                context.logger.debug('[Dashboard] Mesh flagged as changed due to unknown deployed state');
                            }
                        }

                        // Verify mesh still exists
                        verifyMeshDeployment(context, project).catch(err => {
                            context.logger.debug('[Project Dashboard] Background mesh verification failed', err);
                        });
                    } else if (meshChanges.unknownDeployedState) {
                        meshStatus = 'not-deployed';
                        context.logger.debug('[Dashboard] Could not verify mesh deployment status');
                    }
                }
            } else {
                context.logger.debug('[Dashboard] No component configs available for mesh status check');
            }
        }
    }

    const statusData = {
        name: project.name,
        path: project.path,
        status: project.status || 'ready',
        port: project.componentInstances?.['citisignal-nextjs']?.port,
        adobeOrg: project.adobe?.organization,
        adobeProject: project.adobe?.projectName,
        frontendConfigChanged,
        mesh: meshComponent ? {
            status: meshStatus,
            endpoint: meshComponent.endpoint,
            message: undefined,
        } : undefined,
    };

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
            return { success: false, error: 'No project found' };
        }

        // Update UI to 'authenticating' state
        context.panel?.webview.postMessage({
            type: 'meshStatusUpdate',
            payload: {
                status: 'authenticating',
                message: 'Opening browser for authentication...',
            },
        });

        context.logger.info('[Dashboard] Starting re-authentication flow');

        const authManager = ServiceLocator.getAuthenticationService();

        // Trigger browser auth
        await authManager.login();

        context.logger.info('[Dashboard] Browser authentication completed');

        // Auto-select project's organization if available
        if (project.adobe?.organization) {
            context.logger.info(`[Dashboard] Auto-selecting project org: ${project.adobe.organization}`);

            try {
                await authManager.selectOrganization(project.adobe.organization);
                context.logger.info('[Dashboard] Organization selected successfully');
            } catch (orgError) {
                context.logger.warn('[Dashboard] Could not select project organization', orgError as Error);
            }
        }

        // Re-check mesh status with fresh authentication
        context.logger.info('[Dashboard] Re-checking mesh status after authentication');
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

        return { success: false, error: 'Authentication failed' };
    }
};

/**
 * Handle 'startDemo' message - Start demo server
 */
export const handleStartDemo: MessageHandler = async (context) => {
    await vscode.commands.executeCommand('demoBuilder.startDemo');
    // Update demo status only (don't re-check mesh)
    setTimeout(() => sendDemoStatusUpdate(context), 1000);
    return { success: true };
};

/**
 * Handle 'stopDemo' message - Stop demo server
 */
export const handleStopDemo: MessageHandler = async (context) => {
    await vscode.commands.executeCommand('demoBuilder.stopDemo');
    // Update demo status only (don't re-check mesh)
    setTimeout(() => sendDemoStatusUpdate(context), 1000);
    return { success: true };
};

/**
 * Handle 'openBrowser' message - Open demo in browser
 */
export const handleOpenBrowser: MessageHandler = async (context) => {
    const currentProject = await context.stateManager.getCurrentProject();
    const frontendPort = currentProject?.componentInstances?.['citisignal-nextjs']?.port;

    if (frontendPort) {
        const url = `http://localhost:${frontendPort}`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
        context.logger.info(`[Project Dashboard] Opening browser: ${url}`);
    }

    return { success: true };
};

/**
 * Handle 'viewLogs' message - Show logs output channel
 */
export const handleViewLogs: MessageHandler = async () => {
    await vscode.commands.executeCommand('demoBuilder.showLogs');
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

    if (project?.adobe?.organization && project?.adobe?.projectId && project?.adobe?.workspace) {
        // Direct link to workspace
        consoleUrl = `https://developer.adobe.com/console/projects/${project.adobe.organization}/${project.adobe.projectId}/workspaces/${project.adobe.workspace}/details`;
        context.logger.info('[Dev Console] Opening workspace-specific URL', {
            org: project.adobe.organization,
            project: project.adobe.projectId,
            workspace: project.adobe.workspace,
        });
    } else if (project?.adobe?.organization && project?.adobe?.projectId) {
        // Fallback: project overview
        consoleUrl = `https://developer.adobe.com/console/projects/${project.adobe.organization}/${project.adobe.projectId}/overview`;
        context.logger.info('[Dev Console] Opening project-specific URL (no workspace)');
    } else {
        context.logger.info('[Dev Console] Opening generic console URL (missing IDs)');
    }

    // Validate URL before opening
    try {
        validateURL(consoleUrl);
    } catch (validationError) {
        context.logger.error('[Dev Console] URL validation failed', validationError as Error);
        return { success: false, error: 'Invalid URL' };
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
 * Check mesh status asynchronously and update UI when complete
 */
async function checkMeshStatusAsync(
    context: HandlerContext,
    project: Project,
    meshComponent: ComponentInstance,
    frontendConfigChanged: boolean,
): Promise<void> {
    try {
        let meshStatus: 'needs-auth' | 'deploying' | 'deployed' | 'config-changed' | 'not-deployed' | 'error' = 'not-deployed';
        let meshEndpoint: string | undefined;
        let meshMessage: string | undefined;

        if (project.componentConfigs) {
            context.logger.debug('[Dashboard] Checking mesh deployment status...');

            const authManager = ServiceLocator.getAuthenticationService();

            const isAuthenticated = await authManager.isAuthenticatedQuick();

            if (!isAuthenticated) {
                context.logger.debug('[Dashboard] Not authenticated, showing auth prompt');
                context.panel?.webview.postMessage({
                    type: 'statusUpdate',
                    payload: {
                        name: project.name,
                        path: project.path,
                        status: project.status || 'ready',
                        port: project.componentInstances?.['citisignal-nextjs']?.port,
                        adobeOrg: project.adobe?.organization,
                        adobeProject: project.adobe?.projectName,
                        frontendConfigChanged,
                        mesh: {
                            status: 'needs-auth',
                            message: 'Sign in to verify mesh status',
                        },
                    },
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
                        payload: {
                            name: project.name,
                            path: project.path,
                            status: project.status || 'ready',
                            port: project.componentInstances?.['citisignal-nextjs']?.port,
                            adobeOrg: project.adobe?.organization,
                            adobeProject: project.adobe?.projectName,
                            frontendConfigChanged,
                            mesh: {
                                status: 'error',
                                message: 'Organization access lost',
                            },
                        },
                    });
                    return;
                }
            }

            // Initialize meshState if needed
            if (!project.meshState) {
                context.logger.debug('[Dashboard] No meshState found, initializing empty state');
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
                meshStatus = 'deployed';
            }

            if (project.meshState && Object.keys(project.meshState.envVars || {}).length > 0) {
                meshStatus = 'deployed';

                if (meshChanges.hasChanges) {
                    meshStatus = 'config-changed';

                    if (meshChanges.unknownDeployedState) {
                        context.logger.debug('[Dashboard] Mesh flagged as changed due to unknown deployed state');
                    }
                }

                meshEndpoint = meshComponent.endpoint;

                verifyMeshDeployment(context, project).catch(err => {
                    context.logger.debug('[Project Dashboard] Background mesh verification failed', err);
                });
            } else if (meshChanges.unknownDeployedState) {
                meshStatus = 'not-deployed';
                context.logger.debug('[Dashboard] Could not verify mesh deployment status');
            }
        } else {
            context.logger.debug('[Dashboard] No component configs available for mesh status check');
        }

        // Send updated status to UI
        if (context.panel) {
            context.panel.webview.postMessage({
                type: 'statusUpdate',
                payload: {
                    name: project.name,
                    path: project.path,
                    status: project.status || 'ready',
                    port: project.componentInstances?.['citisignal-nextjs']?.port,
                    adobeOrg: project.adobe?.organization,
                    adobeProject: project.adobe?.projectName,
                    frontendConfigChanged,
                    mesh: {
                        status: meshStatus,
                        endpoint: meshEndpoint,
                        message: meshMessage,
                    },
                },
            });
        }
    } catch (error) {
        context.logger.error('[Dashboard] Error in async mesh status check', error as Error);

        if (context.panel) {
            context.panel.webview.postMessage({
                type: 'statusUpdate',
                payload: {
                    name: project.name,
                    path: project.path,
                    status: project.status || 'ready',
                    port: project.componentInstances?.['citisignal-nextjs']?.port,
                    adobeOrg: project.adobe?.organization,
                    adobeProject: project.adobe?.projectName,
                    frontendConfigChanged,
                    mesh: {
                        status: 'error',
                        message: 'Failed to check deployment status',
                    },
                },
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
        } else if (project.meshState && Object.keys(project.meshState.envVars || {}).length > 0) {
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
        payload: {
            name: project.name,
            path: project.path,
            status: project.status || 'ready',
            port: project.componentInstances?.['citisignal-nextjs']?.port,
            adobeOrg: project.adobe?.organization,
            adobeProject: project.adobe?.projectName,
            frontendConfigChanged,
            mesh: meshStatus,
        },
    });
}

/**
 * Verify mesh deployment with Adobe I/O
 */
async function verifyMeshDeployment(context: HandlerContext, project: Project): Promise<void> {
    const { verifyMeshDeployment: verify, syncMeshStatus } = await import('@/features/mesh/services/meshVerifier');

    context.logger.debug('[Project Dashboard] Verifying mesh deployment with Adobe I/O...');

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
        context.logger.debug('[Project Dashboard] Mesh verified successfully', {
            meshId: verificationResult.data.meshId,
            endpoint: verificationResult.data.endpoint,
        });

        await syncMeshStatus(project, verificationResult);
        await context.stateManager.saveProject(project);
    }
}
