/**
 * EDS DA.live Authentication Handlers
 *
 * Message handlers for DA.live authentication operations.
 *
 * Handlers:
 * - `handleDaLiveOAuth`: Initiate OAuth flow with DA.live
 * - `handleCheckDaLiveAuth`: Check DA.live authentication status
 * - `handleOpenDaLiveLogin`: Open DA.live for login with bookmarklet info
 * - `handleStoreDaLiveToken`: Store a manually pasted DA.live token
 * - `handleStoreDaLiveTokenWithOrg`: Store token and verify org in one operation
 * - `handleClearDaLiveAuth`: Clear stored DA.live authentication
 *
 * @module features/eds/handlers/edsDaLiveAuthHandlers
 */

import * as vscode from 'vscode';
import {
    getDaLiveAuthService,
    validateDaLiveToken,
} from './edsHelpers';
import { getBookmarkletUrl } from '@/features/eds/utils/daLiveTokenBookmarklet';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

// ==========================================================
// Payload Types
// ==========================================================

/**
 * Payload for handleStoreDaLiveToken
 */
interface StoreDaLiveTokenPayload {
    token: string;
}

/**
 * Payload for handleStoreDaLiveTokenWithOrg
 */
interface StoreDaLiveTokenWithOrgPayload {
    token: string;
    orgName: string;
}

// ==========================================================
// Handlers
// ==========================================================

/**
 * Initiate DA.live OAuth flow
 *
 * Uses the darkalley OAuth client for authentication.
 *
 * @param context - Handler context with logging and messaging
 * @returns Success with auth status
 */
export async function handleDaLiveOAuth(
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        context.logger.debug('[EDS] Starting DA.live OAuth with darkalley client');
        const authService = getDaLiveAuthService(context);

        // Check if already authenticated
        const isAuth = await authService.isAuthenticated();
        if (isAuth) {
            const tokenInfo = await authService.getStoredToken();
            context.logger.debug('[EDS] Already authenticated with DA.live');
            await context.sendMessage('dalive-auth-complete', {
                isAuthenticated: true,
                email: tokenInfo?.email,
            });
            return { success: true };
        }

        // Initiate OAuth flow
        const result = await authService.authenticate();

        if (result.success) {
            context.logger.debug('[EDS] DA.live OAuth completed for:', result.email);
            await context.sendMessage('dalive-auth-complete', {
                isAuthenticated: true,
                email: result.email,
            });
        } else {
            context.logger.error('[EDS] DA.live OAuth failed:', result.error);
            await context.sendMessage('dalive-oauth-error', {
                error: result.error || 'Authentication failed',
            });
        }

        return { success: result.success, error: result.error };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] DA.live OAuth error:', error as Error);
        await context.sendMessage('dalive-oauth-error', {
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    }
}

/**
 * Check DA.live authentication status
 *
 * @param context - Handler context with logging and messaging
 * @returns Success with auth status
 */
export async function handleCheckDaLiveAuth(
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        context.logger.debug('[EDS] Checking DA.live auth status');
        const authService = getDaLiveAuthService(context);

        // Check if user has completed bookmarklet setup before
        const setupComplete = context.context.globalState.get<boolean>('daLive.setupComplete') || false;
        // Get cached org name (from previous successful verification)
        const cachedOrgName = context.context.globalState.get<string>('daLive.orgName');

        const isAuth = await authService.isAuthenticated();

        if (isAuth) {
            const tokenInfo = await authService.getStoredToken();
            context.logger.debug('[EDS] DA.live auth valid for:', tokenInfo?.email);
            await context.sendMessage('dalive-auth-status', {
                isAuthenticated: true,
                email: tokenInfo?.email,
                setupComplete,
                orgName: cachedOrgName,
            });
        } else {
            context.logger.debug('[EDS] No valid DA.live auth');
            await context.sendMessage('dalive-auth-status', {
                isAuthenticated: false,
                setupComplete,
            });
        }

        return { success: true };
    } catch (error) {
        context.logger.error('[EDS] Error checking DA.live auth:', error as Error);
        await context.sendMessage('dalive-auth-status', {
            isAuthenticated: false,
            error: (error as Error).message,
        });
        return { success: false, error: (error as Error).message };
    }
}

/**
 * Open DA.live for login and return bookmarklet info
 *
 * Opens da.live in browser so user can log in, then provides
 * the bookmarklet URL they can use to extract their token.
 *
 * @param context - Handler context with logging and messaging
 * @returns Success with bookmarklet info
 */
export async function handleOpenDaLiveLogin(
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        context.logger.debug('[EDS] Opening DA.live for login');

        // Open DA.live in browser
        await vscode.env.openExternal(vscode.Uri.parse('https://da.live'));

        // Return the bookmarklet URL for the UI to display
        const bookmarkletUrl = getBookmarkletUrl();

        await context.sendMessage('dalive-login-opened', {
            bookmarkletUrl,
            instructions: [
                'Log in to DA.live in your browser',
                'Drag the "Get Token" button to your bookmarks bar (one-time setup)',
                'Click the bookmark to copy your token',
                'Paste the token below',
            ],
        });

        return { success: true };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] Error opening DA.live:', error as Error);
        return { success: false, error: errorMessage };
    }
}

/**
 * Store a manually pasted DA.live token
 *
 * Validates the token format and stores it for subsequent API calls.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Contains the pasted token
 * @returns Success with validation result
 */
export async function handleStoreDaLiveToken(
    context: HandlerContext,
    payload?: StoreDaLiveTokenPayload,
): Promise<HandlerResponse> {
    const { token } = payload || {};

    if (!token) {
        context.logger.error('[EDS] handleStoreDaLiveToken missing token');
        await context.sendMessage('dalive-token-stored', {
            success: false,
            error: 'Token is required',
        });
        return { success: false, error: 'Token is required' };
    }

    try {
        context.logger.debug('[EDS] Validating and storing DA.live token');

        // Validate token using helper
        const validation = validateDaLiveToken(token);
        if (!validation.valid) {
            if (validation.error?.includes('expired')) {
                context.logger.warn('[EDS] DA.live token has expired');
            } else if (validation.error?.includes('not from DA.live')) {
                context.logger.warn('[EDS] Token is not from DA.live (wrong client_id)');
            }
            await context.sendMessage('dalive-token-stored', {
                success: false,
                error: validation.error,
            });
            return { success: false, error: validation.error };
        }

        // Store token with expiry from JWT or default 24-hour
        const tokenExpiry = validation.expiresAt || (Date.now() + 24 * 60 * 60 * 1000);
        await context.context.globalState.update('daLive.accessToken', token);
        await context.context.globalState.update('daLive.tokenExpiration', tokenExpiry);
        if (validation.email) {
            await context.context.globalState.update('daLive.userEmail', validation.email);
        }

        // Mark setup as complete (user has successfully used the bookmarklet flow)
        await context.context.globalState.update('daLive.setupComplete', true);

        context.logger.info('[EDS] DA.live token stored successfully');
        await context.sendMessage('dalive-token-stored', {
            success: true,
            email: validation.email,
        });

        // Also send auth status update
        await context.sendMessage('dalive-auth-status', {
            isAuthenticated: true,
            email: validation.email,
            setupComplete: true,
        });

        return { success: true };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] Error storing DA.live token:', error as Error);
        await context.sendMessage('dalive-token-stored', {
            success: false,
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    }
}

/**
 * Store DA.live token and verify org access in one operation
 *
 * This combined handler eliminates the need for a separate org verification step.
 * Validates the token format, stores it, then verifies access to the specified org.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Contains the token and org name
 * @returns Success with token stored and org verified status
 */
export async function handleStoreDaLiveTokenWithOrg(
    context: HandlerContext,
    payload?: StoreDaLiveTokenWithOrgPayload,
): Promise<HandlerResponse> {
    const { token, orgName } = payload || {};

    if (!token) {
        context.logger.error('[EDS] handleStoreDaLiveTokenWithOrg missing token');
        await context.sendMessage('dalive-token-with-org-result', {
            success: false,
            error: 'Token is required',
        });
        return { success: false, error: 'Token is required' };
    }

    if (!orgName) {
        context.logger.error('[EDS] handleStoreDaLiveTokenWithOrg missing orgName');
        await context.sendMessage('dalive-token-with-org-result', {
            success: false,
            error: 'Organization name is required',
        });
        return { success: false, error: 'Organization name is required' };
    }

    try {
        context.logger.debug('[EDS] Validating DA.live token and org:', orgName);

        // Validate token using helper
        const validation = validateDaLiveToken(token);
        if (!validation.valid) {
            if (validation.error?.includes('expired')) {
                context.logger.warn('[EDS] DA.live token has expired');
            } else if (validation.error?.includes('not from DA.live')) {
                context.logger.warn('[EDS] Token is not from DA.live (wrong client_id)');
            }
            await context.sendMessage('dalive-token-with-org-result', {
                success: false,
                error: validation.error,
            });
            return { success: false, error: validation.error };
        }

        // Verify org access BEFORE storing the token
        context.logger.debug('[EDS] Verifying org access with token');
        const orgResponse = await fetch(`https://admin.da.live/list/${orgName}/`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (orgResponse.status === 403) {
            await context.sendMessage('dalive-token-with-org-result', {
                success: false,
                error: `Access denied to organization "${orgName}". Please check the name or your permissions.`,
            });
            return { success: false, error: 'Access denied' };
        }

        if (orgResponse.status === 404) {
            await context.sendMessage('dalive-token-with-org-result', {
                success: false,
                error: `Organization "${orgName}" not found. Please check the name.`,
            });
            return { success: false, error: 'Organization not found' };
        }

        if (!orgResponse.ok) {
            await context.sendMessage('dalive-token-with-org-result', {
                success: false,
                error: `Failed to verify organization: ${orgResponse.status}`,
            });
            return { success: false, error: 'Verification failed' };
        }

        // Org verified! Now store the token and org name
        const tokenExpiry = validation.expiresAt || (Date.now() + 24 * 60 * 60 * 1000);
        await context.context.globalState.update('daLive.accessToken', token);
        await context.context.globalState.update('daLive.tokenExpiration', tokenExpiry);
        await context.context.globalState.update('daLive.orgName', orgName);
        if (validation.email) {
            await context.context.globalState.update('daLive.userEmail', validation.email);
        }
        await context.context.globalState.update('daLive.setupComplete', true);

        context.logger.info('[EDS] DA.live token stored and org verified:', orgName);

        // Send success with verified org
        await context.sendMessage('dalive-token-with-org-result', {
            success: true,
            email: validation.email,
            orgName,
        });

        // Also send auth status update
        await context.sendMessage('dalive-auth-status', {
            isAuthenticated: true,
            email: validation.email,
            setupComplete: true,
        });

        return { success: true };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] Error storing DA.live token with org:', error as Error);
        await context.sendMessage('dalive-token-with-org-result', {
            success: false,
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    }
}

/**
 * Clear DA.live authentication
 *
 * Removes stored DA.live token and related data.
 *
 * @param context - Handler context with logging and messaging
 * @returns Success status
 */
export async function handleClearDaLiveAuth(
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        context.logger.debug('[EDS] Clearing DA.live auth');

        // Clear stored token and related data
        await context.context.globalState.update('daLive.accessToken', undefined);
        await context.context.globalState.update('daLive.tokenExpiration', undefined);
        await context.context.globalState.update('daLive.userEmail', undefined);
        await context.context.globalState.update('daLive.orgName', undefined);
        // Note: Keep setupComplete so user doesn't have to re-learn the bookmarklet flow

        context.logger.info('[EDS] DA.live auth cleared');

        // Send confirmation
        await context.sendMessage('dalive-auth-status', {
            isAuthenticated: false,
            setupComplete: context.context.globalState.get<boolean>('daLive.setupComplete') || false,
        });

        return { success: true };
    } catch (error) {
        context.logger.error('[EDS] Error clearing DA.live auth:', error as Error);
        return { success: false, error: (error as Error).message };
    }
}
