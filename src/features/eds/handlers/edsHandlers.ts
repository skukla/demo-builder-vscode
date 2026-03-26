/**
 * EDS Handlers
 *
 * Message handlers for EDS (Edge Delivery Services) wizard operations.
 *
 * This module re-exports handlers from domain-specific files:
 * - `edsGitHubHandlers.ts` - GitHub authentication and repository operations
 * - `edsDaLiveHandlers.ts` - DA.live authentication and organization operations
 *   (re-exports from `edsDaLiveAuthHandlers.ts` and `edsDaLiveOrgHandlers.ts`)
 * - `storefrontSetupHandlers.ts` - Storefront setup orchestration
 *
 * Additionally provides:
 * - `handleValidateAccsCredentials` - ACCS endpoint validation
 * - `handleDiscoverStoreStructure` - Commerce store hierarchy discovery
 *
 * All handlers follow the standard MessageHandler signature:
 * - Accept HandlerContext for logging and messaging
 * - Accept typed payload with required data
 * - Return HandlerResponse with success status
 * - Send UI updates via context.sendMessage()
 *
 * @module features/eds/handlers
 */

import {
    handleVerifyDaLiveOrg,
    handleGetDaLiveSites,
    handleListDaLiveOrgs,
    handleCheckDaLiveAuth,
    handleOpenDaLiveLogin,
    handleStoreDaLiveToken,
    handleStoreDaLiveTokenWithOrg,
    handleClearDaLiveAuth,
} from './edsDaLiveHandlers';
import {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
    handleGitHubChangeAccount,
    handleGetGitHubRepos,
    handleVerifyGitHubRepo,
    handleCreateGitHubRepo,
} from './edsGitHubHandlers';
import {
    handleStartStorefrontSetup,
    handleCancelStorefrontSetup,
    handleResumeStorefrontSetup,
} from './storefrontSetupHandlers';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateURL } from '@/core/validation';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';
import { discoverStoreStructure, extractTenantId } from '../services/commerceStoreDiscovery';
import type { StoreDiscoveryParams } from '@/types/commerceStore';

// Re-export all GitHub handlers
export {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
    handleGitHubChangeAccount,
    handleGetGitHubRepos,
    handleVerifyGitHubRepo,
    handleCreateGitHubRepo,
} from './edsGitHubHandlers';

// Re-export all DA.live handlers
export {
    handleVerifyDaLiveOrg,
    handleGetDaLiveSites,
    handleListDaLiveOrgs,
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

        // Validate ACCS host URL (ACCS is always HTTPS)
        validateURL(accsHost, ['https']);

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
            signal: AbortSignal.timeout(TIMEOUTS.PREREQUISITE_CHECK),
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

// ==========================================================
// Store Discovery Helpers
// ==========================================================

interface AccsError { error: string; code?: string }

/** Resolve ACCS-specific params (IMS token, tenant ID, client ID). Returns error object on failure. */
async function resolveAccsParams(
    context: HandlerContext,
    payload: { orgId?: string; accsGraphqlEndpoint?: string },
): Promise<{ imsToken: string; orgId?: string; tenantId: string; clientId: string } | AccsError> {
    if (!context.authManager) {
        return { error: 'Adobe authentication not available. Please sign in first.' };
    }

    const imsToken = await context.authManager.getTokenManager().getAccessToken();
    if (!imsToken) {
        return { error: 'Adobe IMS token expired. Please re-authenticate.' };
    }

    if (!payload.accsGraphqlEndpoint) {
        return { error: 'ACCS GraphQL endpoint is required to determine tenant ID.' };
    }

    const credential = await context.authManager.getWorkspaceCredential();
    if (!credential?.clientId) {
        return {
            error: 'No OAuth credential found for this workspace.',
            code: 'CREDENTIAL_MISSING',
        };
    }

    return {
        imsToken,
        orgId: payload.orgId,
        tenantId: extractTenantId(payload.accsGraphqlEndpoint),
        clientId: credential.clientId,
    };
}

// ==========================================================
// Store Discovery Handler
// ==========================================================

/**
 * Payload for handleDiscoverStoreStructure
 */
interface DiscoverStoreStructurePayload {
    /** Commerce backend type */
    backendType: 'paas' | 'accs';
    /** Commerce base URL (PaaS) or ACCS API base URL */
    baseUrl: string;
    /** PaaS only: admin username */
    username?: string;
    /** PaaS only: admin password */
    password?: string;
    /** ACCS only: IMS org ID (from wizard state adobeOrg.id) */
    orgId?: string;
    /** ACCS only: ACCS GraphQL endpoint URL (to extract tenant ID) */
    accsGraphqlEndpoint?: string;
}

/**
 * Handle store structure discovery request.
 *
 * Fetches websites, store groups, and store views from the Commerce REST API.
 * For PaaS: uses admin credentials from payload.
 * For ACCS: uses IMS token from authManager + org ID and tenant ID from payload.
 *
 * Sends result via 'store-discovery-result' message.
 */
export async function handleDiscoverStoreStructure(
    context: HandlerContext,
    payload?: DiscoverStoreStructurePayload,
): Promise<HandlerResponse> {
    if (!payload?.baseUrl || !payload?.backendType) {
        context.logger.error('[EDS] handleDiscoverStoreStructure missing required parameters');
        await context.sendMessage('store-discovery-result', {
            success: false,
            error: 'Missing required parameters (baseUrl, backendType)',
        });
        return { success: false, error: 'Missing required parameters' };
    }

    context.logger.info(`[EDS] Discovering store structure (${payload.backendType}): ${payload.baseUrl}`);

    try {
        const params: StoreDiscoveryParams = {
            backendType: payload.backendType,
            baseUrl: payload.baseUrl,
        };

        if (payload.backendType === 'paas') {
            params.username = payload.username;
            params.password = payload.password;
        } else {
            // ACCS: resolve IMS token, tenant ID, and client ID
            const accsResult = await resolveAccsParams(context, payload);
            if ('error' in accsResult) {
                await context.sendMessage('store-discovery-result', {
                    success: false,
                    error: accsResult.error,
                    code: accsResult.code,
                });
                return { success: false, error: accsResult.error };
            }
            Object.assign(params, accsResult);
        }

        const result = await discoverStoreStructure(params);

        if (result.success) {
            context.logger.info(
                `[EDS] Store discovery successful: ${result.data.websites.length} websites, ` +
                `${result.data.storeGroups.length} store groups, ${result.data.storeViews.length} store views`,
            );
        } else {
            context.logger.warn(`[EDS] Store discovery failed: ${result.error}`);
        }

        await context.sendMessage('store-discovery-result', result);
        return { success: true };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] Store discovery error:', error as Error);
        await context.sendMessage('store-discovery-result', {
            success: false,
            error: errorMessage,
        });
        return { success: true }; // Handler succeeded, discovery failed
    }
}

// ============================================================================
// Handler Map Export (Step 3: Handler Registry Simplification)
// ============================================================================

/**
 * EDS feature handler map
 * Maps message types to handler functions for EDS operations
 *
 * Replaces EdsHandlerRegistry class with simple object literal.
 */
export const edsHandlers = defineHandlers({
    // GitHub handlers
    'check-github-auth': handleCheckGitHubAuth,
    'github-oauth': handleGitHubOAuth,
    'github-change-account': handleGitHubChangeAccount,
    'get-github-repos': handleGetGitHubRepos,
    'verify-github-repo': handleVerifyGitHubRepo,
    'create-github-repo': handleCreateGitHubRepo,

    // DA.live handlers
    'check-dalive-auth': handleCheckDaLiveAuth,
    'open-dalive-login': handleOpenDaLiveLogin,
    'store-dalive-token': handleStoreDaLiveToken,
    'store-dalive-token-with-org': handleStoreDaLiveTokenWithOrg,
    'clear-dalive-auth': handleClearDaLiveAuth,
    'get-dalive-sites': handleGetDaLiveSites,
    'verify-dalive-org': handleVerifyDaLiveOrg,
    'list-dalive-orgs': handleListDaLiveOrgs,

    // ACCS handlers
    'validate-accs-credentials': handleValidateAccsCredentials,

    // Store discovery
    'discover-store-structure': handleDiscoverStoreStructure,

    // Storefront setup handlers (renamed from eds-preflight-*)
    'storefront-setup-start': handleStartStorefrontSetup,
    'storefront-setup-cancel': handleCancelStorefrontSetup,
    'storefront-setup-resume': handleResumeStorefrontSetup,
});
