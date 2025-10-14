/**
 * Mesh Handlers - Delete Handler
 *
 * Handles deleting API Mesh instances.
 */

import { ServiceLocator } from '../../../services/serviceLocator';
import { TIMEOUTS } from '@/utils/timeoutConfig';
import { HandlerContext } from '../../../commands/handlers/HandlerContext';

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
}> {
    const { workspaceId } = payload;

    try {
        context.logger.info('[API Mesh] Deleting mesh for workspace', { workspaceId });

        const commandManager = ServiceLocator.getCommandExecutor();
        const result = await commandManager.execute(
            'aio api-mesh delete --autoConfirmAction',
            {
                timeout: TIMEOUTS.API_CALL,
                configureTelemetry: false,
                useNodeVersion: null,
                enhancePath: true,
            },
        );

        if (result.code === 0) {
            context.logger.info('[API Mesh] Mesh deleted successfully');
            // Clear the pre-existing mesh flag since user explicitly deleted it
            // Any new mesh created after this is NOT pre-existing
            context.sharedState.meshExistedBeforeSession = undefined;
            context.logger.debug('[API Mesh] Cleared pre-existing mesh flag after explicit deletion');
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
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
