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

import * as vscode from 'vscode';
import { discoverStoreStructure } from '../services/commerceStoreDiscovery';
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
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateURL } from '@/core/validation';
import type { StoreDiscoveryParams } from '@/types/commerceStore';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

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
    const { accsHost, storeViewCode } = payload || {};

    if (!accsHost || !storeViewCode) {
        context.logger.error('[EDS] handleValidateAccsCredentials missing required parameters');
        await context.sendMessage('accs-validation-result', {
            valid: false,
            error: 'Missing required ACCS credentials',
        });
        return { success: false, error: 'Missing required ACCS credentials' };
    }

    // Validate storeViewCode format to prevent HTTP header injection
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(storeViewCode)) {
        await context.sendMessage('accs-validation-result', {
            valid: false,
            error: 'Store view code must contain only letters, numbers, hyphens, or underscores (max 64 characters).',
        });
        return { success: false, error: 'Invalid store view code format' };
    }

    try {
        context.logger.debug('[EDS] Validating ACCS credentials:', accsHost);

        // Validate ACCS host URL (ACCS is always HTTPS)
        validateURL(accsHost, ['https']);

        // Build test URL — use URL constructor to prevent path injection from accsHost
        const testUrl = new URL('/graphql', accsHost).href;

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
            const errorMessage = `Connection failed (HTTP ${response.status}). Check the Commerce URL and try again.`;
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
 * Payload for handleDiscoverStoreStructure.
 * PaaS admin credentials travel in the payload so the request is self-contained —
 * the discovery handler needs no out-of-band credential cache.
 */
interface DiscoverStoreStructurePayload {
    /** Commerce backend type */
    backendType: 'paas' | 'accs';
    /** Commerce base URL (PaaS) or ACCS API base URL */
    baseUrl: string;
    /** PaaS only: admin username for token authentication */
    username?: string;
    /** PaaS only: admin password for token authentication */
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
 * For PaaS: reads admin credentials from the payload (self-contained request).
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
        validateURL(payload.baseUrl, ['https']);
    } catch {
        await context.sendMessage('store-discovery-result', {
            success: false,
            error: 'Commerce base URL must be a valid HTTPS URL.',
        });
        return { success: false, error: 'Invalid base URL' };
    }

    try {
        const params: StoreDiscoveryParams = {
            backendType: payload.backendType,
            baseUrl: payload.baseUrl,
        };

        if (payload.backendType === 'paas') {
            // Credentials arrive in the discovery payload (self-contained request).
            // The service rejects empty credentials with a user-facing message.
            //
            // NOTE (least-privilege, deferred): discovery is the only LIVE consumer of
            // the admin username/password today, so a scoped Commerce integration token
            // could replace them here. We kept username/password because the dormant
            // `integration-service` App Builder app (kukla-integration-service) still
            // hard-requires them (lib/commerce/auth.js), and its registry/config remain.
            // A token swap is safe only after that component is removed or migrated to
            // token auth. See .rptc/backlog for the integration-service/appBuilderApps
            // cleanup + token follow-ups.
            params.username = payload.username || undefined;
            params.password = payload.password || undefined;
        } else {
            const earlyReturn = await buildAccsDiscoveryParams(context, payload, params);
            if (earlyReturn !== null) return earlyReturn;
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

// ==========================================================
// ACCS Discovery Params Builder
// ==========================================================

/**
 * Build ACCS-specific discovery params, authenticating with Adobe IMS.
 * Mutates `params` on success; returns a HandlerResponse to emit on early exit,
 * or null to signal the caller should proceed.
 */
async function buildAccsDiscoveryParams(
    context: HandlerContext,
    payload: DiscoverStoreStructurePayload,
    params: StoreDiscoveryParams,
): Promise<HandlerResponse | null> {
    const services = getDiscoveryServices();
    if (services.length === 0) {
        await context.sendMessage('store-discovery-result', {
            success: false,
            error: 'No discovery service configured. Enter store codes manually.',
        });
        return { success: true };
    }

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

    const inspection = await context.authManager.getTokenManager().inspectToken();
    const imsToken = inspection.token;
    // Observability only — never log the token value itself.
    context.logger.info(
        `[Store Discovery] IMS token: valid=${inspection.valid}, ` +
        `expiresIn=${inspection.expiresIn}min, present=${!!imsToken}`,
    );
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
    try {
        validateURL(service.serviceUrl, ['https']);
    } catch {
        await context.sendMessage('store-discovery-result', {
            success: false,
            error: 'Discovery service URL must be a valid HTTPS URL.',
        });
        return { success: false, error: 'Invalid discovery service URL' };
    }
    params.discoveryServiceUrl = service.serviceUrl;
    context.logger.info(`[Store Discovery] discovery service: ${service.serviceUrl}`);

    if (payload.accsGraphqlEndpoint) {
        try {
            validateURL(payload.accsGraphqlEndpoint, ['https']);
        } catch {
            await context.sendMessage('store-discovery-result', {
                success: false,
                error: 'ACCS GraphQL endpoint must be a valid HTTPS URL.',
            });
            return { success: false, error: 'Invalid ACCS GraphQL endpoint URL' };
        }
    }
    params.accsGraphqlEndpoint = payload.accsGraphqlEndpoint;
    return null;
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
