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

import { buildStatusPayload } from '../services/dashboardStatusService';
import { hasMeshDeploymentRecord, getMeshEndpoint } from '@/core/state/appBuilderComponentState';
import { detectFrontendChanges } from '@/features/mesh/services/stalenessDetector';
import { Project } from '@/types';
import { HandlerContext } from '@/types/handlers';
import { getMeshComponentInstance } from '@/types/typeGuards';
import type { MeshStatusInfo } from '@/types/webviewPayloads';

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
export function hasAdobeWorkspaceContext(
    project: Project | null | undefined,
): project is ProjectWithAdobeWorkspace {
    if (!project?.adobe) return false;
    const { organization, projectId, workspace } = project.adobe;
    return Boolean(organization && projectId && workspace);
}

/**
 * Type guard: Check if project has Adobe project context (org + project, no workspace required)
 *
 * Extracts 3-level optional chain: project?.adobe?.organization && project?.adobe?.projectId
 */
export function hasAdobeProjectContext(
    project: Project | null | undefined,
): project is ProjectWithAdobeProject {
    if (!project?.adobe) return false;
    const { organization, projectId } = project.adobe;
    return Boolean(organization && projectId);
}

// MeshStatusInfo, buildStatusPayload, hasMeshDeploymentRecord are now in dashboardStatusService
/**
 * Send quick demo status update without re-checking mesh
 */
export async function sendDemoStatusUpdate(context: HandlerContext): Promise<void> {
    if (!context.panel) return;

    const project = await context.stateManager.getCurrentProject();
    if (!project) return;

    const frontendConfigChanged =
        project.status === 'running' ? detectFrontendChanges(project) : false;

    const meshComponent = getMeshComponentInstance(project);
    let meshStatus: MeshStatusInfo | undefined = undefined;

    if (meshComponent) {
        if (meshComponent.status === 'deploying') {
            meshStatus = { status: 'deploying', message: 'Deploying...' };
        } else if (meshComponent.status === 'error') {
            meshStatus = { status: 'error', message: 'Deployment error' };
        } else if (hasMeshDeploymentRecord(project)) {
            // Read persisted status instead of re-detecting changes
            // Only 'stale' needs translation — dashboard UI uses 'config-changed'
            const endpoint = getMeshEndpoint(project);
            const summary = project.meshStatusSummary;
            const status =
                summary === 'stale'
                    ? 'config-changed'
                    : summary === 'unknown' || !summary
                      ? 'deployed'
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
