/**
 * EDS Reset — API Mesh Redeployment Helpers
 *
 * Isolated from edsResetService.ts to keep that file within the 500-line limit.
 * Handles Adobe I/O auth re-validation and API Mesh deployment as the final
 * optional step (step 12) of the EDS reset pipeline.
 *
 * @module features/eds/services/edsResetMeshHelper
 */

import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { EdsResetResult } from './edsResetParams';
import { getMeshComponentInstance } from '@/types/typeGuards';
import { ServiceLocator } from '@/core/di';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import { updateMeshState } from '@/features/mesh/services/stalenessDetector';

// ==========================================================
// Helpers
// ==========================================================

/**
 * Deploy the API Mesh and persist the resulting endpoint to project state.
 * Returns null on success, or a partial-success EdsResetResult on failure.
 */
async function deployMeshAndPersist(
    meshComponent: NonNullable<ReturnType<typeof getMeshComponentInstance>>,
    project: Project,
    repoOwner: string,
    repoName: string,
    context: HandlerContext,
    report: (step: number, message: string) => void,
    filesReset: number,
    contentCopied: number,
): Promise<EdsResetResult | null> {
    report(12, 'Redeploying API Mesh...');
    context.logger.info(`[EdsReset] Redeploying mesh for ${repoOwner}/${repoName}`);

    try {
        const existingMeshId = (meshComponent.metadata?.meshId as string) || '';
        const commandManager = ServiceLocator.getCommandExecutor();

        // meshComponent.path is guaranteed non-null: redeployApiMesh checked before calling
        const meshDeployResult = await deployMeshComponent(
            meshComponent.path as string, commandManager, context.logger,
            (msg, sub) => report(12, sub || msg), existingMeshId,
        );

        if (meshDeployResult.success && meshDeployResult.data?.endpoint) {
            await updateMeshState(project, meshDeployResult.data.endpoint);
            await context.stateManager.saveProject(project);
            context.logger.info(`[EdsReset] Mesh redeployed: ${meshDeployResult.data.endpoint}`);
            return null; // Success
        }

        throw new Error(meshDeployResult.error || 'Mesh deployment failed');
    } catch (meshError) {
        context.logger.error('[EdsReset] Mesh redeployment error', meshError as Error);
        return {
            success: true, filesReset, contentCopied, meshRedeployed: false,
            error: `Reset completed but mesh redeployment failed: ${(meshError as Error).message}`,
            errorType: 'MESH_REDEPLOY_FAILED',
        };
    }
}

// ==========================================================
// Public API
// ==========================================================

/**
 * Step 12: Redeploy API Mesh.
 *
 * Re-validates Adobe I/O auth before setting CLI context — the token may have
 * expired during the ~2-minute reset pipeline. Returns a partial-success result
 * if mesh failed (reset already completed), or null on success/skip.
 */
export async function redeployApiMesh(
    project: Project,
    repoOwner: string,
    repoName: string,
    context: HandlerContext,
    report: (step: number, message: string) => void,
    filesReset: number,
    contentCopied: number,
): Promise<EdsResetResult | null> {
    const meshComponent = getMeshComponentInstance(project);
    if (!meshComponent?.path) {
        return null;
    }

    const authService = ServiceLocator.getAuthenticationService();

    report(12, 'Checking Adobe I/O authentication...');
    const authResult = await ensureAdobeIOAuth({
        authManager: authService,
        logger: context.logger,
        logPrefix: '[EdsReset]',
        projectContext: {
            organization: project.adobe?.organization,
            projectId: project.adobe?.projectId,
            workspace: project.adobe?.workspace,
        },
        warningMessage: 'Your Adobe I/O session has expired. Please sign in to continue the mesh redeployment.',
    });

    if (!authResult.authenticated) {
        context.logger.warn('[EdsReset] Adobe I/O auth failed before mesh redeployment');
        return {
            success: true,
            filesReset,
            contentCopied,
            meshRedeployed: false,
            error: 'Reset completed but mesh redeployment skipped: Adobe I/O authentication required',
            errorType: 'MESH_REDEPLOY_FAILED',
        };
    }

    report(12, 'Setting Adobe context...');
    if (project.adobe?.organization) {
        await authService.selectOrganization(project.adobe.organization, { skipPermissionCheck: true });
    }
    if (project.adobe?.projectId && project.adobe?.organization) {
        await authService.selectProject(project.adobe.projectId, project.adobe.organization);
    }
    if (project.adobe?.workspace && project.adobe?.projectId) {
        await authService.selectWorkspace(project.adobe.workspace, project.adobe.projectId);
    }

    return deployMeshAndPersist(meshComponent, project, repoOwner, repoName, context, report, filesReset, contentCopied);
}
