/**
 * Mesh Status Helpers
 *
 * Helper functions for mesh status checking, verification, and UI updates.
 * Extracted from dashboardHandlers.ts to reduce file size.
 *
 * Note: Core status functions have been moved to dashboard services.
 * This file re-exports them for backward compatibility and contains
 * handler-specific logic.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ServiceLocator } from '@/core/di';
import { parseEnvFile } from '@/core/utils/envParser';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import { MESH_STATUS_MESSAGES } from '@/features/mesh/services/types';
import { Project, ComponentInstance } from '@/types';
import { HandlerContext } from '@/types/handlers';
import { getMeshComponentInstance } from '@/types/typeGuards';

// Import from services for use in this file
import {
    buildStatusPayload,
    hasMeshDeploymentRecord,
    getMeshEndpoint,
} from '../services/dashboardStatusService';

// Re-export for backward compatibility
export {
    buildStatusPayload,
    hasMeshDeploymentRecord,
    getMeshEndpoint,
    type MeshStatusInfo,
    type StatusPayload,
} from '../services/dashboardStatusService';

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

// MeshStatusInfo, buildStatusPayload, hasMeshDeploymentRecord are now in dashboardStatusService
// and re-exported above for backward compatibility

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

    const { detectFrontendChanges } = await import('@/features/mesh/services/stalenessDetector');
    const frontendConfigChanged = project.status === 'running' ? detectFrontendChanges(project) : false;

    const meshComponent = getMeshComponentInstance(project);
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
