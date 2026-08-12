/**
 * Store Structure Handler
 *
 * Handles the `get-store-structure` message: the headless entry behind the
 * `get_store_structure` MCP tool. Resolves the current project and runs the
 * shared {@link readStoreStructure} core, returning the websites / store groups
 * / store views the Commerce backend actually has, plus whether the scope the
 * project is configured for resolves against them.
 *
 * The wizard's `discover-store-structure` handler answers the same question for
 * a form the user is still filling in, and reports through `sendMessage`. This
 * one is panel-free and returns its result directly, so an agent can call it.
 */

import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { readStoreStructure } from '@/features/eds/services/storeStructureReader';
import { ErrorCode } from '@/types/errorCodes';
import type { MessageHandler } from '@/types/handlers';

/**
 * Handle 'get-store-structure' — read the current project's Commerce store
 * hierarchy and check its configured scope against it.
 *
 * ACCS projects need an IMS token. Rather than deriving the backend type twice,
 * the read is attempted first and only the `authRequired` signal triggers
 * sign-in — so PaaS projects never see an Adobe prompt.
 */
export const handleGetStoreStructure: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const firstAttempt = await readStoreStructure(project);
    if (firstAttempt.success) {
        return { success: true, data: firstAttempt.data };
    }
    if (!firstAttempt.authRequired) {
        return { success: false, error: firstAttempt.error };
    }

    if (!context.authManager) {
        return {
            success: false,
            error: 'Adobe sign-in required to read store structure.',
            code: ErrorCode.AUTH_REQUIRED,
        };
    }

    const authResult = await ensureAdobeIOAuth({
        authManager: context.authManager,
        logger: context.logger,
        logPrefix: '[Store Structure]',
        projectContext: {
            organization: project.adobe?.organization,
            projectId: project.adobe?.projectId,
            workspace: project.adobe?.workspace,
        },
        warningMessage: 'Adobe sign-in required to read store structure.',
    });
    if (!authResult.authenticated) {
        return {
            success: false,
            error: 'Adobe sign-in required to read store structure.',
            code: ErrorCode.AUTH_REQUIRED,
        };
    }

    const inspection = await context.authManager.getTokenManager().inspectToken();
    if (!inspection.token) {
        return {
            success: false,
            error: 'Adobe sign-in succeeded but no IMS token was available.',
            code: ErrorCode.AUTH_REQUIRED,
        };
    }

    const retry = await readStoreStructure(project, { imsToken: inspection.token });
    if (retry.success) {
        return { success: true, data: retry.data };
    }
    return {
        success: false,
        error: retry.error,
        code: retry.authRequired ? ErrorCode.AUTH_REQUIRED : undefined,
    };
};
