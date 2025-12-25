/**
 * EDS Handlers
 *
 * Message handlers for EDS (Edge Delivery Services) wizard operations.
 *
 * This module re-exports handlers from domain-specific files:
 * - `edsGitHubHandlers.ts` - GitHub authentication and repository operations
 * - `edsDaLiveHandlers.ts` - DA.live authentication and organization operations
 *
 * Additionally provides:
 * - `handleValidateAccsCredentials` - ACCS endpoint validation
 *
 * All handlers follow the standard MessageHandler signature:
 * - Accept HandlerContext for logging and messaging
 * - Accept typed payload with required data
 * - Return HandlerResponse with success status
 * - Send UI updates via context.sendMessage()
 *
 * @module features/eds/handlers
 */

import type { HandlerContext, HandlerResponse } from '@/types/handlers';

// Re-export all GitHub handlers
export {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
    handleGitHubChangeAccount,
    handleGetGitHubRepos,
    handleVerifyGitHubRepo,
} from './edsGitHubHandlers';

// Re-export all DA.live handlers
export {
    handleVerifyDaLiveOrg,
    handleGetDaLiveSites,
    handleDaLiveOAuth,
    handleCheckDaLiveAuth,
    handleOpenDaLiveLogin,
    handleStoreDaLiveToken,
    handleStoreDaLiveTokenWithOrg,
    handleClearDaLiveAuth,
} from './edsDaLiveHandlers';

// Re-export clearServiceCache for backward compatibility
export { clearServiceCache } from './edsHelpers';

// ==========================================================
// Payload Types
// ==========================================================

/**
 * Payload for handleValidateAccsCredentials
 */
interface ValidateAccsCredentialsPayload {
    accsHost: string;
    storeViewCode: string;
    customerGroup: string;
}

// ==========================================================
// ACCS Handler
// ==========================================================

/**
 * Validate ACCS credentials
 *
 * Tests connection to ACCS endpoint with provided credentials.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Contains ACCS credentials
 * @returns Success with validation result
 */
export async function handleValidateAccsCredentials(
    context: HandlerContext,
    payload?: ValidateAccsCredentialsPayload,
): Promise<HandlerResponse> {
    const { accsHost, storeViewCode, customerGroup } = payload || {};

    if (!accsHost || !storeViewCode || !customerGroup) {
        context.logger.error('[EDS] handleValidateAccsCredentials missing required parameters');
        await context.sendMessage('accs-validation-result', {
            valid: false,
            error: 'Missing required ACCS credentials',
        });
        return { success: false, error: 'Missing required ACCS credentials' };
    }

    try {
        context.logger.debug('[EDS] Validating ACCS credentials:', accsHost);

        // Build test URL - typically a catalog API endpoint
        const testUrl = `${accsHost}/graphql`;

        // Test connection with a simple request
        const response = await fetch(testUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Store': storeViewCode,
            },
            body: JSON.stringify({
                query: '{ __typename }',
            }),
            signal: AbortSignal.timeout(10000),
        });

        const isValid = response.ok || response.status === 400; // 400 is acceptable (query might fail but endpoint works)

        if (isValid) {
            context.logger.debug('[EDS] ACCS validation successful');
            await context.sendMessage('accs-validation-result', {
                valid: true,
            });
            return { success: true };
        } else {
            const errorMessage = `Connection failed: ${response.status} ${response.statusText}`;
            context.logger.warn('[EDS] ACCS validation failed:', errorMessage);
            await context.sendMessage('accs-validation-result', {
                valid: false,
                error: errorMessage,
            });
            return { success: true }; // Handler succeeded, validation failed
        }
    } catch (error) {
        const errorMessage = (error as Error).message.includes('abort')
            ? 'Connection timed out'
            : `Connection failed: ${(error as Error).message}`;

        context.logger.error('[EDS] ACCS validation error:', error as Error);
        await context.sendMessage('accs-validation-result', {
            valid: false,
            error: errorMessage,
        });
        return { success: true }; // Handler succeeded, validation failed
    }
}
