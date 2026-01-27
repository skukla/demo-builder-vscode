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
import { parseEnvFile } from '@/core/utils/envParser';
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
): Promise<'deployed' | 'config-changed' | 'config-incomplete' | 'update-declined' | 'error'> {
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
            // Read persisted status instead of re-detecting changes
            // Only 'stale' needs translation — dashboard UI uses 'config-changed'
            const endpoint = project.meshState?.endpoint || meshComponent.endpoint;
            const summary = project.meshStatusSummary;
            const status = summary === 'stale' ? 'config-changed'
                : (summary === 'unknown' || !summary) ? 'deployed'
                : summary;
            meshStatus = { status, endpoint };
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
        context.stateManager.markDirty('meshState');

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
        context.stateManager.markDirty('meshState');
    }
}
