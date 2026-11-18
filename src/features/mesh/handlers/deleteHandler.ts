/**
 * Mesh Handlers - Delete Handler
 *
 * Handles deleting API Mesh instances: the agent's `delete_mesh` (no webview sends it).
 *
 * Takes `meshDeployLock`, so no delete runs in the middle of a deploy, and records the mesh as
 * gone on the project when the deleted mesh was the project's own (PL-104 fix 5). It used to
 * save nothing, so the card read "Deployed" over a mesh that no longer existed.
 */

import { ServiceLocator } from '@/core/di/serviceLocator';
import { demoBuilderNode } from '@/core/shell/demoBuilderNode';
import { MESH_DELETE_COMMAND } from '@/core/shell/meshDeleteCommand';
import { buildOrgTargetFromProjectAdobe, withOrgContext, type OrgContextTarget } from '@/core/shell/orgContextEnv';
import { getMeshAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateWorkspaceId } from '@/core/validation/validators/AdobeResourceValidator';
import { ensureAuthenticated } from '@/features/mesh/handlers/shared';
import { MESH_DEPLOY_ALREADY_RUNNING, meshDeployLock } from '@/features/mesh/services/meshDeployLock';
import { recordMeshGone } from '@/features/mesh/services/meshGone';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import { HandlerContext } from '@/types/handlers';
import { toError } from '@/types/typeGuards';

/**
 * Handler: delete-api-mesh
 *
 * Delete API Mesh
 */
export async function handleDeleteApiMesh(
    context: HandlerContext,
    payload: { workspaceId: string },
): Promise<{
    success: boolean;
    error?: string;
    code?: ErrorCode;
}> {
    const { workspaceId } = payload;

    // SECURITY: Validate workspaceId to prevent command injection
    try {
        validateWorkspaceId(workspaceId);
    } catch (validationError) {
        context.logger.error('[API Mesh] Invalid workspace ID provided', validationError as Error);
        return {
            success: false,
            error: (validationError as Error).message,
            code: ErrorCode.MESH_CONFIG_INVALID,
        };
    }

    try {
        context.logger.debug('[API Mesh] Deleting mesh for workspace', { workspaceId });

        // PRE-FLIGHT: Check authentication before any Adobe CLI operations
        const authResult = await ensureAuthenticated(context, 'delete mesh');
        if (!authResult.authenticated) {
            return {
                success: false,
                error: authResult.error,
                code: authResult.code,
                // Carried through so the AGENT is told which sign-in to offer;
                // defaultShape returns a failure whole when it has more than error/code.
                ...(authResult.needsAuth ? { needsAuth: authResult.needsAuth } : {}),
            };
        }

        // Target the workspace the caller asked for. `aio api-mesh delete` takes no
        // --workspaceId, so without this the command resolves against the CLI's
        // process-global selection — whatever an earlier session or another tool
        // left there — and deletes THAT mesh. workspaceId was validated above and
        // then never used, which made the argument look load-bearing while the
        // delete went wherever. Same wrapper checkHandler uses, for the same
        // reason; the difference is that this one is destructive and runs with
        // --autoConfirmAction, so there is no prompt to catch a wrong target.
        const project = await context.stateManager.getCurrentProject();
        const cachedOrg = ServiceLocator.getAuthenticationService()
            .getCacheManager()
            .getCachedOrganization();
        const target: OrgContextTarget = buildOrgTargetFromProjectAdobe(
            {
                organization: project?.adobe?.organization,
                projectId: project?.adobe?.projectId,
                workspace: workspaceId,
            },
            cachedOrg,
        );

        if (meshDeployLock.isLocked()) {
            return { success: false, error: MESH_DEPLOY_ALREADY_RUNNING };
        }
        const commandManager = ServiceLocator.getCommandExecutor();
        const result = await meshDeployLock.run(() =>
            withOrgContext(target, () =>
                commandManager.execute(MESH_DELETE_COMMAND, {
                    timeout: TIMEOUTS.NORMAL,
                    configureTelemetry: false,
                    useNodeVersion: demoBuilderNode(),
                    enhancePath: true,
                }),
            ),
        );

        if (result.code === 0) {
            context.logger.info('[API Mesh] Mesh deleted successfully');
            // Clear the pre-existing mesh flag since user explicitly deleted it
            // Any new mesh created after this is NOT pre-existing
            context.sharedState.meshExistedBeforeSession = undefined;
            context.logger.debug(
                '[API Mesh] Cleared pre-existing mesh flag after explicit deletion',
            );
            if (project && meshWorkspaceOf(project) === workspaceId) {
                recordMeshGone(project);
                await context.stateManager.saveProject(project);
            }
            return { success: true };
        } else {
            const errorMsg = result.stderr || 'Failed to delete mesh';
            context.logger.error('[API Mesh] Delete failed', new Error(errorMsg));
            throw new Error(errorMsg);
        }
    } catch (error) {
        context.logger.error('[API Mesh Delete] Failed', error as Error);
        return {
            success: false,
            error: toError(error).message,
            code: ErrorCode.UNKNOWN,
        };
    }
}

/** The workspace the project's mesh lives in: its own record's, else the project's. */
function meshWorkspaceOf(project: Project): string | undefined {
    const mesh = getMeshAppBuilderComponent(project);
    return mesh?.workspace?.id ?? project.adobe?.workspace;
}
