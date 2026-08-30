/**
 * <Feature> <Action> Handler — TEMPLATE
 *
 * Derived from the real reference: src/features/mesh/handlers/subscribeHandler.ts.
 * Ordering is load-bearing: validate → ensureAuthenticated (Adobe ops only) →
 * service call → shaped { success, error?, code? } return. Return failures,
 * never throw (docs/development/sop/consistency-patterns.md §2).
 *
 * After creating from this template:
 *  1. Add '<my-message-type>' to the MessageType union in src/types/messages.ts.
 *  2. Register in the feature map:  defineHandlers({ '<my-message-type>': handleMyAction, ... })
 *  3. If the wizard dispatches it, ALSO add it to
 *     src/features/project-creation/handlers/ProjectCreationHandlerRegistry.ts.
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { validateOrgId, validateProjectId, validateWorkspaceId } from '@/core/validation';
import { ErrorCode } from '@/types/errorCodes';
import { toError } from '@/types/typeGuards';
// Adobe ops only — drop if this handler touches no Adobe CLI/API:
// import { ensureAuthenticated } from '@/features/mesh/handlers/shared';

/** Shaped response — the standard contract every webview caller branches on. */
type MyActionResult = {
    success: boolean;
    data?: unknown;
    error?: string;
    code?: ErrorCode;
};

type MyActionPayload = {
    orgId: string;
    projectId: string;
    workspaceId: string;
    // ...feature-specific fields
};

/**
 * Handler: <my-message-type>
 *
 * SECURITY: Validates every Adobe resource id (they flow into Adobe CLI
 * commands downstream) to prevent command injection.
 */
export async function handleMyAction(
    context: HandlerContext,
    payload: MyActionPayload,
): Promise<MyActionResult> {
    const { orgId, projectId, workspaceId } = payload;

    // 1. VALIDATE — anything that reaches a CLI command gets validated first.
    try {
        validateOrgId(orgId);
        validateProjectId(projectId);
        validateWorkspaceId(workspaceId);
    } catch (validationError) {
        context.logger.error('[<Feature>] Invalid Adobe resource ID', validationError as Error);
        return {
            success: false,
            error: `Invalid Adobe resource ID: ${(validationError as Error).message}`,
            code: ErrorCode.UNKNOWN, // pick the domain code (cf. MESH_CONFIG_INVALID)
        };
    }

    // 2. PRE-FLIGHT AUTH — only for handlers performing Adobe operations.
    // const authResult = await ensureAuthenticated(context.logger, '<describe the action>');
    // if (!authResult.authenticated) {
    //     return { success: false, error: authResult.error, code: authResult.code };
    // }

    // 3. SERVICE CALL — delegate to the feature service; RETURN its result.
    //    Adobe CLI ops: TIMEOUTS.* from @/core/utils/timeoutConfig, wrapped in
    //    withOrgContext; check error.stdout for success-despite-timeout in catch.
    try {
        const data = await Promise.resolve(); // await myFeatureService.doAction({...});
        return { success: true, data };
    } catch (error) {
        context.logger.error('[<Feature>] <Action> failed', error as Error);
        return {
            success: false,
            error: toError(error).message, // or a domain formatter, cf. formatApiAccessError
            code: ErrorCode.UNKNOWN,
        };
    }
}
