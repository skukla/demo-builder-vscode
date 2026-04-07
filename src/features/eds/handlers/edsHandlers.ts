/**
 * EDS Handlers
 *
 * Provides ACCS endpoint validation and Commerce store hierarchy discovery.
 * Domain-specific handlers (GitHub, DA.live, Storefront Setup) live in
 * their respective files and are exported via index.ts.
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
import * as vscode from 'vscode';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateURL } from '@/core/validation';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';
import { discoverStoreStructure } from '../services/commerceStoreDiscovery';
import type { StoreDiscoveryParams } from '@/types/commerceStore';

// clearServiceCache is an internal helper — re-exported here to keep edsHelpers internal
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
        const msg = (error as Error).message;
        const errorMessage = msg.includes('abort') || msg.includes('timeout')
            ? 'Connection timed out. Check the Commerce URL and try again.'
            : 'Connection failed. Check the Commerce URL and try again.';

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

/** ACCS Discovery Service entry from VS Code settings */
interface AccsDiscoveryService {
    orgName: string;
    orgId?: string;
    serviceUrl: string;
}

/** Get all configured discovery services from VS Code settings */
function getDiscoveryServices(): AccsDiscoveryService[] {
    return vscode.workspace.getConfiguration('demoBuilder.accsDiscovery')
        .get<AccsDiscoveryService[]>('services', []);
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
            // ACCS — requires a discovery service
            const services = getDiscoveryServices();
            if (services.length === 0) {
                // No discovery service — skip silently, fields stay as text inputs
                await context.sendMessage('store-discovery-result', {
                    success: false,
                    error: 'No discovery service configured. Enter store codes manually.',
                });
                return { success: true };
            }

            // Ensure Adobe auth (prompts for re-sign-in if expired)
            if (!context.authManager) {
                await context.sendMessage('store-discovery-result', {
                    success: false,
                    error: 'Authentication not available.',
                });
                return { success: false, error: 'AuthManager not available' };
            }

            const authResult = await ensureAdobeIOAuth({
                authManager: context.authManager,
                logger: context.logger,
                logPrefix: '[Store Discovery]',
                warningMessage: 'Adobe sign-in required for store discovery.',
            });
            if (!authResult.authenticated) {
                await context.sendMessage('store-discovery-result', {
                    success: false,
                    error: authResult.cancelled
                        ? 'Adobe sign-in was cancelled.'
                        : 'Adobe sign-in failed. Please try again.',
                });
                return { success: false, error: 'Adobe authentication required' };
            }

            const imsToken = await context.authManager.getTokenManager().getAccessToken();
            if (!imsToken) {
                await context.sendMessage('store-discovery-result', {
                    success: false,
                    error: 'Failed to retrieve IMS token after sign-in.',
                });
                return { success: false, error: 'IMS token not available' };
            }

            params.imsToken = imsToken;
            const service = payload.orgId
                ? (services.find(s => s.orgId === payload.orgId) ?? services[0])
                : services[0];
            params.discoveryServiceUrl = service.serviceUrl;
            params.accsGraphqlEndpoint = payload.accsGraphqlEndpoint;
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
        context.logger.error('[EDS] Store discovery error:', error as Error);
        await context.sendMessage('store-discovery-result', {
            success: false,
            error: 'Store discovery failed. Please try again.',
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
