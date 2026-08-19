/**
 * EDS DA.live Authentication Handlers
 *
 * Message handlers for DA.live authentication operations.
 *
 * Handlers:
 * - `handleCheckDaLiveAuth`: Check DA.live authentication status
 * - `handleOpenDaLiveLogin`: Open DA.live for login with bookmarklet info
 * - `handleStoreDaLiveToken`: Store a manually pasted DA.live token
 * - `handleStoreDaLiveTokenWithOrg`: Store token and verify org in one operation
 * - `handleClearDaLiveAuth`: Clear stored DA.live authentication
 *
 * @module features/eds/handlers/edsDaLiveAuthHandlers
 */

import * as vscode from 'vscode';
import { getDaLiveAuthService, validateDaLiveTokenStrict } from './edsHelpers';
import { getBookmarkletUrl } from '@/features/eds/utils/daLiveTokenBookmarklet';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** Bookmarklet URL is static — compute once */
const bookmarkletUrl = getBookmarkletUrl();

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
 * Check DA.live authentication status
 *
 * @param context - Handler context with logging and messaging
 * @returns Success with auth status
 */
export async function handleCheckDaLiveAuth(context: HandlerContext): Promise<HandlerResponse> {
    try {
        context.logger.debug('[EDS] Checking DA.live auth status');
        const authService = getDaLiveAuthService(context.context);

        // Check if user has completed bookmarklet setup before
        const setupComplete = authService.isSetupComplete();
        // Get cached org name (from previous successful verification)
        // Get cached org name (from a previous successful auth). The
        // demoBuilder.daLive.defaultOrg fallback was removed alongside the
        // setting — the demo's namespace now comes from the wizard's picker.
        const cachedOrgName = authService.getOrgName();

        const isAuth = await authService.isAuthenticated();

        if (isAuth) {
            const tokenInfo = await authService.getStoredToken();
            context.logger.debug('[EDS] DA.live auth valid for:', tokenInfo?.email);
            await context.sendMessage('dalive-auth-status', {
                isAuthenticated: true,
                email: tokenInfo?.email,
                setupComplete,
                orgName: cachedOrgName,
                bookmarkletUrl,
            });
        } else {
            context.logger.debug('[EDS] No valid DA.live auth');
            await context.sendMessage('dalive-auth-status', {
                isAuthenticated: false,
                setupComplete,
                orgName: cachedOrgName || undefined,
                bookmarkletUrl,
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
export async function handleOpenDaLiveLogin(context: HandlerContext): Promise<HandlerResponse> {
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
        const validation = validateDaLiveTokenStrict(token);
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

        // Store token via service (handles expiry, email, and setupComplete)
        const tokenExpiry = validation.expiresAt || Date.now() + 24 * 60 * 60 * 1000;
        const authService = getDaLiveAuthService(context.context);
        await authService.storeToken(token, {
            expiresAt: tokenExpiry,
            email: validation.email,
        });

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

    return storeValidatedDaLiveToken(context, token, orgName);
}

/**
 * Validate a token and pin it to a namespace, reporting on the org channel.
 *
 * Shared by the two paths that store against a chosen namespace — the token
 * the user pasted into the card, and the token read off the clipboard. They
 * differ only in where the string came from; everything after that must be
 * identical, and a credential path is the last place to let two copies drift.
 *
 * Never throws: every outcome is both a `sendMessage` to the webview and a
 * returned result, because a handler that throws produces an `error` field the
 * webview treats differently from a refusal (see the webview-command-handler
 * skill on refusals arriving as successes).
 *
 * @param context - Handler context with logging and messaging
 * @param token - The candidate token, from either source
 * @param orgName - The namespace to pin it to
 * @returns Success status
 */
async function storeValidatedDaLiveToken(
    context: HandlerContext,
    token: string,
    orgName: string,
): Promise<HandlerResponse> {
    try {
        context.logger.debug('[EDS] Validating DA.live token and org:', orgName);

        const validation = validateDaLiveTokenStrict(token);
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

        // Pre-auth verification gate removed (namespace-picker plan). The
        // picker now provides only namespaces the user is verifiably a GitHub
        // member of, so the "does DA.live's admin already know this org" check
        // is no longer load-bearing — it just blocked first-time DA.live users
        // whose AEM Code Sync app hadn't been installed yet. First-time setup
        // is handled by Phase 3 of the create pipeline, which detects missing
        // Code Sync and prompts install. Any genuine write failure now surfaces
        // at the actual write site with contextual error messaging, not as a
        // generic "organization not found".
        const tokenExpiry = validation.expiresAt || Date.now() + 24 * 60 * 60 * 1000;
        const authService = getDaLiveAuthService(context.context);
        await authService.storeToken(token, {
            expiresAt: tokenExpiry,
            email: validation.email,
            orgName,
        });

        context.logger.info('[EDS] DA.live token stored, namespace pinned to:', orgName);

        // Send success with the picked namespace
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
 * Report WHETHER the clipboard holds a DA.live token — never the token.
 *
 * The bookmarklet's job is to copy the token, so by the time this card is on
 * screen the value is usually already on the clipboard and asking the user to
 * paste it is asking them to hand over something we can read. The webview only
 * needs to know whether to offer that path, so a boolean is the entire answer,
 * and a boolean is all that crosses the boundary.
 *
 * Uses the same strict check as every other path that accepts a credential:
 * a token-SHAPED string is not enough (see `validateDaLiveTokenStrict`).
 *
 * Never throws — a denied or empty clipboard simply means "offer the field".
 *
 * @param context - Handler context with logging and messaging
 * @returns `{ success, hasToken }`
 */
export async function handleCheckDaLiveClipboard(
    context: HandlerContext,
): Promise<HandlerResponse> {
    let hasToken = false;
    try {
        const clipped = (await vscode.env.clipboard.readText())?.trim();
        hasToken = Boolean(clipped) && validateDaLiveTokenStrict(clipped).valid;
    } catch (error) {
        context.logger.debug(
            `[EDS] Clipboard unavailable for DA.live check: ${(error as Error).message}`,
        );
    }
    context.logger.debug(`[EDS] DA.live token on clipboard: ${hasToken}`);
    return { success: true, data: { hasToken } };
}

/**
 * Store the DA.live token sitting on the clipboard, against the chosen namespace.
 *
 * The counterpart to {@link handleCheckDaLiveClipboard}: the webview sends only
 * the namespace it picked, and the token is read, validated and stored here.
 * That is deliberately narrower than {@link handleStoreDaLiveTokenWithOrg},
 * where the token travels from the webview — a value the user pasted into a
 * React state field and posted back. Nothing about this path puts the
 * credential in the webview at all.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - The namespace to pin the token to
 * @returns Success status
 */
export async function handleStoreDaLiveTokenFromClipboard(
    context: HandlerContext,
    payload?: { orgName?: string },
): Promise<HandlerResponse> {
    const { orgName } = payload || {};

    if (!orgName) {
        context.logger.error('[EDS] handleStoreDaLiveTokenFromClipboard missing orgName');
        await context.sendMessage('dalive-token-with-org-result', {
            success: false,
            error: 'Organization name is required',
        });
        return { success: false, error: 'Organization name is required' };
    }

    let token: string | undefined;
    try {
        token = (await vscode.env.clipboard.readText())?.trim();
    } catch (error) {
        context.logger.warn(`[EDS] Clipboard read failed: ${(error as Error).message}`);
    }

    if (!token) {
        // The clipboard changed between the check and the click, or the read
        // was refused. Say so plainly rather than reporting a token problem.
        const error =
            'No token found on your clipboard. Copy it again with the da.live bookmarklet, or paste it manually.';
        await context.sendMessage('dalive-token-with-org-result', { success: false, error });
        return { success: false, error };
    }

    return storeValidatedDaLiveToken(context, token, orgName);
}

/**
 * Clear DA.live authentication
 *
 * Removes stored DA.live token and related data.
 *
 * @param context - Handler context with logging and messaging
 * @returns Success status
 */
export async function handleClearDaLiveAuth(context: HandlerContext): Promise<HandlerResponse> {
    try {
        context.logger.debug('[EDS] Clearing DA.live auth');

        // Clear stored token and related data via service
        // Note: logout() preserves setupComplete so user doesn't re-learn the bookmarklet flow
        const authService = getDaLiveAuthService(context.context);
        await authService.logout();

        context.logger.info('[EDS] DA.live auth cleared');

        // Send confirmation
        await context.sendMessage('dalive-auth-status', {
            isAuthenticated: false,
            setupComplete: authService.isSetupComplete(),
        });

        return { success: true };
    } catch (error) {
        context.logger.error('[EDS] Error clearing DA.live auth:', error as Error);
        return { success: false, error: (error as Error).message };
    }
}
