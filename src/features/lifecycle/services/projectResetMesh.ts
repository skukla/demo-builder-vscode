/**
 * The mesh leg of a headless project reset: step 6 of `projectResetService`.
 *
 * Split out of `projectResetService.ts` on 2026-10-03, when the reset gained a
 * headless core for the `reset_project` agent tool and the service grew past its
 * size limit. Both doors — the SC's Reset button and the agent tool — reach this
 * through that core; nothing else calls it.
 *
 * @module features/lifecycle/services/projectResetMesh
 */

import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { buildOrgTargetFromProjectAdobe, withOrgContext, type OrgContextTarget } from '@/core/shell/orgContextEnv';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** Step 6 of 6: the mesh redeploy is the reset's last step. */
const MESH_STEP = { index: 6, total: 6 };

// ==========================================================
// Mesh Redeployment
// ==========================================================

/**
 * Ensure Adobe auth AND the correct org context before redeploying the mesh.
 * Uses the shared existing-project pre-flight so this flow can't drift from the
 * dashboard deploy command (auth-expiry → Sign In; wrong org → Switch IMS Org).
 */
async function ensureAdobeContext(
    project: Project,
    context: HandlerContext,
    logPrefix: string,
    authService: AuthenticationService,
): Promise<boolean> {

    const { ensureProjectAdobeContext } = await import(
        '@/features/authentication/services/ensureProjectAdobeContext'
    );
    const result = await ensureProjectAdobeContext({
        authManager: authService,
        project,
        logger: context.logger,
        logPrefix,
        warningMessage:
            'Your Adobe I/O session has expired. Sign in to redeploy the API Mesh, or skip to finish without redeploying.',
    });

    return result.ready;
}

/**
 * Build the org-context target for the project's KNOWN org/project/workspace via
 * the shared builder (enriches org code/name from the cached org only on an id
 * match). Targets per-invocation env instead of mutating the global.
 */
async function buildProjectOrgTarget(
    project: Project,
    authService: AuthenticationService,
): Promise<OrgContextTarget> {
    const cachedOrg = authService.getCacheManager().getCachedOrganization();
    return buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg);
}

/** Deploy the mesh under org-context targeting and persist the endpoint. */
async function runTargetedMeshDeploy(
    project: Project,
    meshPath: string,
    context: HandlerContext,
    logPrefix: string,
    report: ReportStage,
    vscode: typeof import('vscode'),
    commandManager: CommandExecutor,
): Promise<{ redeployed: boolean; earlyReturn?: HandlerResponse }> {
    report('Redeploying the mesh', undefined, MESH_STEP);
    context.logger.info(`${logPrefix} Redeploying mesh`);

    try {
        // Create-or-update from REMOTE truth — the shared rule lives in
        // deployMeshCreateOrUpdate (one copy, was three).
        const { deployMeshCreateOrUpdate } = await import('@/features/mesh/services/meshRedeploy');
        const meshResult = await deployMeshCreateOrUpdate(
            meshPath,
            commandManager,
            context.logger,
            (stage, step) => report('Redeploying the mesh', step || stage, MESH_STEP),
        );

        if (meshResult.success && meshResult.data?.endpoint) {
            const { updateMeshState } = await import('@/features/mesh/services/meshDeployBaseline');
            await updateMeshState(project, meshResult.data.endpoint);
            context.logger.info(`${logPrefix} Mesh redeployed: ${meshResult.data.endpoint}`);
            return { redeployed: true };
        }
        throw new Error(meshResult.error || 'Mesh deployment failed');
    } catch (meshError) {
        context.logger.error(`${logPrefix} Mesh redeployment failed`, meshError as Error);
        project.status = 'ready';
        await context.stateManager.saveProject(project);

        void vscode.window.showWarningMessage(
            `"${project.name}" reset successfully, but mesh redeployment failed: ${(meshError as Error).message}. You can redeploy manually from the dashboard.`,
        );

        return {
            redeployed: false,
            earlyReturn: {
                success: true,
                error: `Reset completed but mesh redeployment failed: ${(meshError as Error).message}`,
            },
        };
    }
}

/** Handle mesh redeployment during project reset */
export async function handleMeshRedeployment(
    project: Project,
    context: HandlerContext,
    logPrefix: string,
    report: ReportStage,
    vscode: typeof import('vscode'),
    commandManager: CommandExecutor,
    authService: AuthenticationService,
): Promise<{ redeployed: boolean; earlyReturn?: HandlerResponse } | null> {
    const { getMeshComponentInstance } = await import('@/types/typeGuards');
    const meshComponent = getMeshComponentInstance(project);

    if (!meshComponent?.path) return null;

    report('Redeploying the mesh', 'Checking your Adobe access', MESH_STEP);
    const ready = await ensureAdobeContext(project, context, logPrefix, authService);

    if (!ready) {
        context.logger.info(`${logPrefix} Adobe context unavailable, skipping mesh redeploy`);
        return { redeployed: false };
    }

    // Target the project's KNOWN org/project/workspace via per-invocation env
    // instead of mutating the shared `aio` global with select* (racey).
    const target = await buildProjectOrgTarget(project, authService);
    return withOrgContext(target, () =>
        runTargetedMeshDeploy(
            project,
            meshComponent.path as string,
            context,
            logPrefix,
            report,
            vscode,
            commandManager,
        ),
    );
}
