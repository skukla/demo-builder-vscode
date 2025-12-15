/**
 * Mesh Status Helpers
 *
 * Helper functions for mesh status checking, verification, and UI updates.
 * Extracted from dashboardHandlers.ts to reduce file size.
 */

import { ServiceLocator } from '@/core/di';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import { MESH_STATUS_MESSAGES } from '@/features/mesh/services/types';
import { Project, ComponentInstance } from '@/types';
import { HandlerContext } from '@/types/handlers';
import { hasEntries, getProjectFrontendPort } from '@/types/typeGuards';

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
 * Mesh status info for UI updates
 */
export interface MeshStatusInfo {
    status: string;
    endpoint?: string;
    message?: string;
}

/**
 * Build the standard status payload for dashboard updates
 */
export function buildStatusPayload(
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
        port: getProjectFrontendPort(project),
        adobeOrg: project.adobe?.organization,
        adobeProject: project.adobe?.projectName,
        frontendConfigChanged,
        mesh,
    };
}

/**
 * Check if mesh has been deployed (has env vars recorded from previous deployment)
 */
export function hasMeshDeploymentRecord(project: Project): boolean {
    return Boolean(project.meshState && hasEntries(project.meshState.envVars));
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
 * Determine mesh status based on changes and component state
 */
export function determineMeshStatus(
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
        let meshStatus: 'needs-auth' | 'deploying' | 'deployed' | 'config-changed' | 'update-declined' | 'not-deployed' | 'error' | 'checking' = 'not-deployed';
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
export async function sendDemoStatusUpdate(context: HandlerContext): Promise<void> {
    if (!context.panel) return;

    const project = await context.stateManager.getCurrentProject();
    if (!project) return;

    const { detectFrontendChanges } = await import('@/features/mesh/services/stalenessDetector');
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
