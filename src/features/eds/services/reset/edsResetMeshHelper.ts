/**
 * EDS Reset — API Mesh Redeployment Helpers
 *
 * Isolated from edsResetService.ts to keep that file within the 500-line limit.
 * Handles Adobe I/O auth re-validation and API Mesh deployment as the final
 * optional step (step 12) of the EDS reset pipeline.
 *
 * @module features/eds/services/reset/edsResetMeshHelper
 */

import type { EdsResetResult } from './edsResetParams';
import { CommandExecutor } from '@/core/shell/commandExecutor';
import { buildOrgTargetFromProjectAdobe, withOrgContext, type OrgContextTarget } from '@/core/shell/orgContextEnv';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { deployMeshCreateOrUpdate } from '@/features/mesh/services/meshRedeploy';
import { updateMeshState } from '@/features/mesh/services/stalenessDetector';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { getMeshComponentInstance } from '@/types/typeGuards';

/** ADR-015: what the mesh-redeploy step needs, supplied by the reset caller. */
export interface MeshRedeployDeps {
    commandManager: CommandExecutor;
    authManager: AuthenticationService;
}

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
    deps: MeshRedeployDeps,
): Promise<EdsResetResult | null> {
    report(12, 'Redeploying API Mesh...');
    context.logger.info(`[EdsReset] Redeploying mesh for ${repoOwner}/${repoName}`);

    try {
        // Create-or-update from REMOTE truth — the shared rule lives in
        // deployMeshCreateOrUpdate (one copy, was three). Runs inside the
        // caller's withOrgContext wrapper, so the probe targets the project's
        // workspace. meshComponent.path is non-null: redeployApiMesh checked.
        const meshDeployResult = await deployMeshCreateOrUpdate(
            meshComponent.path as string,
            deps.commandManager,
            context.logger,
            (msg, sub) => report(12, sub || msg),
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
            success: true,
            filesReset,
            contentCopied,
            meshRedeployed: false,
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
    deps: MeshRedeployDeps,
): Promise<EdsResetResult | null> {
    const meshComponent = getMeshComponentInstance(project);
    if (!meshComponent?.path) {
        return null;
    }

    const authService = deps.authManager;

    report(12, 'Checking Adobe organization access...');
    const { ensureProjectAdobeContext } = await import(
        '@/features/authentication/services/ensureProjectAdobeContext'
    );
    const preflight = await ensureProjectAdobeContext({
        authManager: authService,
        project,
        logger: context.logger,
        logPrefix: '[EdsReset]',
        warningMessage:
            'Your Adobe I/O session has expired. Please sign in to continue the mesh redeployment.',
    });

    if (!preflight.ready) {
        const reason =
            preflight.blockedBy === 'org'
                ? "the project's Adobe organization is not the one you're signed into"
                : 'Adobe I/O authentication required';
        context.logger.warn(`[EdsReset] Mesh redeployment skipped before deploy: ${reason}`);
        return {
            success: true,
            filesReset,
            contentCopied,
            meshRedeployed: false,
            error: `Reset completed but mesh redeployment skipped: ${reason}`,
            errorType: 'MESH_REDEPLOY_FAILED',
        };
    }

    // Target the project's KNOWN org/project/workspace via per-invocation
    // AIO_CONSOLE_* env instead of mutating the shared `aio` global with
    // select* (which races concurrent processes). The shared builder enriches
    // org code/name from the cached org on an id match (less leaky than ID-only).
    const target: OrgContextTarget = buildOrgTargetFromProjectAdobe(
        project.adobe,
        authService.getCachedOrganization(),
    );

    return withOrgContext(target, () =>
        deployMeshAndPersist(
            meshComponent,
            project,
            repoOwner,
            repoName,
            context,
            report,
            filesReset,
            contentCopied,
            deps,
        ),
    );
}
