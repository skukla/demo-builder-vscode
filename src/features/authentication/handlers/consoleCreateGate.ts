/**
 * The pre-flight that `create-adobe-project` and `create-adobe-workspace` share.
 *
 * Both handlers refuse the same three ways before they touch Console: no auth
 * service on the context, no developer permission (the shared
 * `can-create-adobe-project` probe may be stale, so it is re-checked here and
 * the refusal carries `AUTH_FORBIDDEN` so the UI drops to select-an-existing),
 * and an empty name. Only the noun in the copy differs. One gate, so the policy
 * cannot drift between the two (PL-69 pair 35).
 *
 * The permission probe may throw; this does not catch it. The caller's own
 * try/catch owns that answer ("Failed to create project: ...").
 *
 * @module features/authentication/handlers/consoleCreateGate
 */

import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** What the handler creates; picks the copy a refusal shows. */
export type ConsoleCreateNoun = 'project' | 'workspace';

/** The payload both create handlers receive from the webview. */
export interface ConsoleCreatePayload {
    name: string;
    description?: string;
}

/** The refusal copy, verbatim per noun, so a grep for the message still finds it. */
const CREATE_COPY: Record<ConsoleCreateNoun, { forbidden: string; nameRequired: string }> = {
    project: {
        forbidden:
            'You do not have permission to create projects in this organization. Select an existing project instead.',
        nameRequired: 'Project name is required.',
    },
    workspace: {
        forbidden:
            'You do not have permission to create workspaces in this organization. Select an existing workspace instead.',
        nameRequired: 'Workspace name is required.',
    },
};

/** Either the answer to send back, or everything the create needs to go ahead. */
export type ConsoleCreateGate =
    | { refusal: HandlerResponse; authManager?: undefined; name?: undefined; description?: undefined }
    | {
          refusal?: undefined;
          authManager: AuthenticationService;
          name: string;
          description: string;
      };

/**
 * Decide whether a create may proceed, in the order the handlers always
 * checked: auth service present, developer permission, non-empty name.
 *
 * @param context - the handler context; only `authManager` is read
 * @param payload - the webview payload; `name` is trimmed, `description` defaults to ''
 * @param noun - which entity is being created, for the refusal copy
 * @returns a `refusal` to return as-is, or the auth service, name and description
 * @throws whatever `testDeveloperPermissions` throws; the caller's catch owns it
 */
export async function gateConsoleCreate(
    context: Pick<HandlerContext, 'authManager'>,
    payload: ConsoleCreatePayload | undefined,
    noun: ConsoleCreateNoun,
): Promise<ConsoleCreateGate> {
    const { authManager } = context;
    if (!authManager) {
        return { refusal: { success: false, error: 'Authentication not available' } };
    }

    const name = (payload?.name ?? '').trim();
    const description = payload?.description ?? '';

    // Defensive permission re-check (guards a stale probe) → UI drops to Flow B.
    const { hasPermissions, error: permError } = await authManager.testDeveloperPermissions();
    if (!hasPermissions) {
        return {
            refusal: {
                success: false,
                code: ErrorCode.AUTH_FORBIDDEN,
                error: permError || CREATE_COPY[noun].forbidden,
            },
        };
    }

    if (!name) {
        return { refusal: { success: false, error: CREATE_COPY[noun].nameRequired } };
    }

    return { authManager, name, description };
}
