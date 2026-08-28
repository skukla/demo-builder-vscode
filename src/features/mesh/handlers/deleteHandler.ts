/**
 * Mesh Handlers - Delete Handler
 *
 * Handles deleting API Mesh instances.
 */

import { ServiceLocator } from '@/core/di';
import {
    buildOrgTargetFromProjectAdobe,
    withOrgContext,
    type OrgContextTarget,
} from '@/core/shell';
import { MESH_DELETE_COMMAND } from '@/core/shell/meshDeleteCommand';
import { getMeshNodeVersion } from '@/core/utils/meshConfig';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateWorkspaceId } from '@/core/validation';
import { ensureAuthenticated } from '@/features/mesh/handlers/shared';
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
        const authResult = await ensureAuthenticated(context.logger, 'delete mesh');
        if (!authResult.authenticated) {
            return {
                success: false,
                error: authResult.error,
                code: authResult.code,
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
        const cachedOrg = ServiceLocator.getAuthenticationService().getCachedOrganization();
        const target: OrgContextTarget = buildOrgTargetFromProjectAdobe(
            {
                organization: project?.adobe?.organization,
                projectId: project?.adobe?.projectId,
                workspace: workspaceId,
            },
            cachedOrg,
        );

        const commandManager = ServiceLocator.getCommandExecutor();
        const result = await withOrgContext(target, () =>
            commandManager.execute(MESH_DELETE_COMMAND, {
                timeout: TIMEOUTS.NORMAL,
                configureTelemetry: false,
                useNodeVersion: getMeshNodeVersion(),
                enhancePath: true,
            }),
        );

        if (result.code === 0) {
            context.logger.info('[API Mesh] Mesh deleted successfully');
            // Clear the pre-existing mesh flag since user explicitly deleted it
            // Any new mesh created after this is NOT pre-existing
            context.sharedState.meshExistedBeforeSession = undefined;
            context.logger.debug(
                '[API Mesh] Cleared pre-existing mesh flag after explicit deletion',
            );
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
