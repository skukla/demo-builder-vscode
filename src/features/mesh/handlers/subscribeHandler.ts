/**
 * Mesh Subscribe Handler
 *
 * Handles the ensure-mesh-api-subscribed message: wraps the shipped, idempotent
 * `ensureMeshApiSubscribed` service so the wizard's Mesh Integration card can
 * provision the API Mesh API (and baseline) at workspace-selection time instead
 * of deep in project creation.
 *
 * Ordering mirrors {@link handleCheckApiMesh}: validateWorkspaceId ->
 * ensureAuthenticated -> service. The org comes from the PAYLOAD (`payload.orgId`),
 * NOT `getCurrentProject()` — the wizard has no current project yet.
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ServiceLocator } from '@/core/di';
import { validateOrgId, validateProjectId, validateWorkspaceId } from '@/core/validation';
import type { SubscribedApi } from '@/features/app-builder/services/apiSubscriber';
import {
    ensureMeshApiSubscribed,
    type MeshSubscribeTarget,
} from '@/features/app-builder/services/ensureMeshApiSubscribed';
import { ensureAuthenticated } from '@/features/mesh/handlers/shared';
import { formatApiAccessError } from '@/features/mesh/utils/errorFormatter';
import { ErrorCode } from '@/types/errorCodes';
import { toError } from '@/types/typeGuards';

type EnsureMeshApiSubscribedResult = {
    success: boolean;
    /** On success: the resolved+subscribed APIs (code + display name when known). */
    data?: { apis: SubscribedApi[] };
    error?: string;
    code?: ErrorCode;
};

type EnsureMeshApiSubscribedPayload = {
    orgId: string;
    projectId: string;
    workspaceId: string;
    backendId?: string;
    frontendId?: string;
};

/**
 * Handler: ensure-mesh-api-subscribed
 *
 * Subscribes the API Mesh API onto the selected workspace via the idempotent
 * `ensureMeshApiSubscribed` service. Returns a shaped result the card row uses
 * to render its status.
 *
 * SECURITY: Validates orgId, projectId and workspaceId (all flow into Adobe CLI
 * commands downstream) to prevent command injection.
 */
export async function handleEnsureMeshApiSubscribed(
    context: HandlerContext,
    payload: EnsureMeshApiSubscribedPayload,
): Promise<EnsureMeshApiSubscribedResult> {
    const { orgId, projectId, workspaceId, backendId, frontendId } = payload;

    // SECURITY: Validate every Adobe resource id to prevent command injection
    try {
        validateOrgId(orgId);
        validateProjectId(projectId);
        validateWorkspaceId(workspaceId);
    } catch (validationError) {
        context.logger.error(
            '[API Mesh] Invalid Adobe resource ID provided',
            validationError as Error,
        );
        return {
            success: false,
            error: `Invalid Adobe resource ID: ${(validationError as Error).message}`,
            code: ErrorCode.MESH_CONFIG_INVALID,
        };
    }

    // PRE-FLIGHT: Check authentication before any Adobe operations
    const authResult = await ensureAuthenticated(context.logger, 'enable the API Mesh API');
    if (!authResult.authenticated) {
        return {
            success: false,
            error: authResult.error,
            code: authResult.code,
        };
    }

    try {
        const target: MeshSubscribeTarget = {
            adobe: { organization: orgId, projectId, workspace: workspaceId },
            componentSelections: { backend: backendId, frontend: frontendId },
        };

        const apis = await ensureMeshApiSubscribed({
            project: target,
            authService: ServiceLocator.getAuthenticationService(),
            logger: context.logger,
        });

        return { success: true, data: { apis } };
    } catch (error) {
        context.logger.error('[API Mesh] Subscribe failed', error as Error);
        return {
            success: false,
            error: formatApiAccessError(toError(error)),
            code: ErrorCode.UNKNOWN,
        };
    }
}
