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

import { selectDiscoveryService } from '../services/accsDiscoveryConfig';
import { discoverStoreStructure } from '../services/commerceStoreDiscovery';
import { handleCheckCredentialService } from './credentialServiceHandler';
import {
    handleCheckDaLiveAuth,
    handleOpenDaLiveLogin,
    handleStoreDaLiveToken,
    handleStoreDaLiveTokenWithOrg,
    handleClearDaLiveAuth,
} from './daLive/edsDaLiveHandlers';
import {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
    handleGitHubChangeAccount,
    handleGetGitHubRepos,
    handleCreateGitHubRepo,
} from './edsGitHubHandlers';
import { handleRefreshBlockLibraryHeadless } from './refreshBlockLibraryHandler';
import { handleStartStorefrontSetup, handleCancelStorefrontSetup } from './storefrontSetup/storefrontSetupHandlers';
import { handleGetStoreStructure } from './storeStructureHandler';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { validateURL } from '@/core/validation';
import { resolvePaasAdminPair } from '@/features/components/services/commerceCredentialStore';
import type { StoreDiscoveryParams } from '@/types/commerceStore';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

// clearServiceCache is an internal helper — re-exported here to keep edsHelpers internal
export { clearServiceCache } from './edsHelpers';

// ==========================================================
// Payload Types
// ==========================================================

// ==========================================================
// ACCS Handler
// ==========================================================

// ==========================================================
// Store Discovery Handler
// ==========================================================

/**
 * The PaaS admin pair for the CURRENT project, from wherever it lives.
 *
 * Only reached when the caller sent no credentials. Returns undefined for every
 * "there is nothing to find" case — no project, no store, an unsaved project —
 * and the service then rejects the empty pair with its own user-facing message,
 * exactly as it did when the webview sent blanks.
 */
async function resolvePaasPairForCurrentProject(
    context: HandlerContext,
): Promise<{ username: string; password: string } | undefined> {
    const project = await context.stateManager?.getCurrentProject();
    if (!project) return undefined;

    return resolvePaasAdminPair(
        {
            ...(context.context?.secrets ? { secrets: context.context.secrets } : {}),
            ...(project.path ? { projectId: project.path } : {}),
        },
        project.componentConfigs,
    );
}

/**
 * Payload for handleDiscoverStoreStructure.
 * PaaS admin credentials travel in the payload when the wizard has just collected
 * them; otherwise the host resolves them for the current project.
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

    context.logger.info(
        `[EDS] Discovering store structure (${payload.backendType}): ${payload.baseUrl}`,
    );

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
            // Credentials arrive in the payload when the WIZARD sends them, because
            // the user is typing them and no project exists yet to have saved them.
            // When the payload omits them the host resolves them from the current
            // project instead — the seam that lets Configure stop sending a
            // credential it only holds because we sent it there
            // (`.rptc/complete/component-secret-routing/`, phase 1).
            //
            // NOTE: admin username/password is the deliberate model for PaaS discovery.
            // A scoped Commerce integration token was evaluated and DECLINED (2026-06-15):
            // no attacker exposure it would close (creds are gitignored, in-process IPC,
            // HTTPS-only, never logged), and it adds real per-demo setup friction. The only
            // residual is plaintext-at-rest in .env, which a token shares and does not fix.
            const supplied =
                payload.username && payload.password
                    ? { username: payload.username, password: payload.password }
                    : await resolvePaasPairForCurrentProject(context);
            params.username = supplied?.username || undefined;
            params.password = supplied?.password || undefined;
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
    // Selected BEFORE sign-in: a missing or malformed service is not something a
    // login can fix, and prompting first would be a pointless interruption.
    const selection = selectDiscoveryService(payload.orgId);
    if (!selection.ok) {
        if (selection.reason === 'none-configured') {
            await context.sendMessage('store-discovery-result', {
                success: false,
                error: 'No discovery service configured. Enter store codes manually.',
            });
            return { success: true };
        }
        await context.sendMessage('store-discovery-result', {
            success: false,
            error: 'Discovery service URL must be a valid HTTPS URL.',
        });
        return { success: false, error: 'Invalid discovery service URL' };
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
    params.discoveryServiceUrl = selection.serviceUrl;
    context.logger.info(`[Store Discovery] discovery service: ${selection.serviceUrl}`);

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
    'create-github-repo': handleCreateGitHubRepo,

    // DA.live handlers
    'check-dalive-auth': handleCheckDaLiveAuth,
    'open-dalive-login': handleOpenDaLiveLogin,
    'store-dalive-token': handleStoreDaLiveToken,
    'store-dalive-token-with-org': handleStoreDaLiveTokenWithOrg,
    'clear-dalive-auth': handleClearDaLiveAuth,

    // ACCS handlers

    // Store discovery
    'discover-store-structure': handleDiscoverStoreStructure,

    // Will the shared service hand this user a Commerce credential? Status only —
    // the pair never crosses to the webview.
    'check-credential-service': handleCheckCredentialService,

    // Agent-facing: headless store-structure read behind the get_store_structure MCP tool
    'get-store-structure': handleGetStoreStructure,

    // Storefront setup handlers (renamed from eds-preflight-*)
    'storefront-setup-start': handleStartStorefrontSetup,
    'storefront-setup-cancel': handleCancelStorefrontSetup,

    // Agent-facing: headless block-library rebuild behind the refresh_block_library MCP tool
    'refresh-block-library': handleRefreshBlockLibraryHeadless,
});
