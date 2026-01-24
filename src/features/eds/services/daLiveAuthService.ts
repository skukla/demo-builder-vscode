/**
 * DA.live Authentication Service
 *
 * Token storage wrapper for DA.live authentication.
 * Tokens are obtained externally via the wizard's bookmarklet/token-paste flow
 * or the dashboard's QuickPick authentication flow.
 *
 * Note: The OAuth PKCE flow was removed as it requires the app to be hosted
 * on the da.live domain for OAuth callbacks, which VS Code extensions cannot do.
 */

import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';

// ==========================================================
// Constants
// ==========================================================

/** State storage keys for DA.live token data */
const STATE_KEYS = {
    accessToken: 'daLive.accessToken',
    tokenExpiration: 'daLive.tokenExpiration',
    userEmail: 'daLive.userEmail',
};

// ==========================================================
// Types
// ==========================================================

export interface DaLiveAuthResult {
    success: boolean;
    accessToken?: string;
    email?: string;
    error?: string;
}

export interface DaLiveTokenInfo {
    accessToken: string;
    expiresAt: number;
    email?: string;
}

// ==========================================================
// DA.live Authentication Service
// ==========================================================

export class DaLiveAuthService {
    private logger = getLogger();
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Authenticate with DA.live
     *
     * OAuth PKCE flow is not available for VS Code extensions as it requires
     * callbacks to the da.live domain. Returns an error directing users to
     * use the bookmarklet flow instead.
     *
     * @returns Result indicating OAuth is not available
     */
    async authenticate(): Promise<DaLiveAuthResult> {
        this.logger.warn('[DA.live Auth] OAuth flow not available - use bookmarklet flow');
        return {
            success: false,
            error: 'OAuth flow not available. Please use the DA.live bookmarklet to obtain a token.',
        };
    }

    /**
     * Check if user is authenticated with DA.live
     *
     * Returns true if a valid, non-expired token exists.
     * Uses a 5-minute buffer to prevent mid-operation token expiration.
     */
    async isAuthenticated(): Promise<boolean> {
        const tokenInfo = await this.getStoredToken();
        return tokenInfo !== null && tokenInfo.expiresAt > Date.now();
    }

    /**
     * Get stored access token if valid
     *
     * Returns null if no token exists or if the token is expired/expiring soon.
     * The 5-minute expiration buffer prevents tokens from expiring mid-operation.
     */
    async getStoredToken(): Promise<DaLiveTokenInfo | null> {
        const accessToken = this.context.globalState.get<string>(STATE_KEYS.accessToken);
        const expiresAt = this.context.globalState.get<number>(STATE_KEYS.tokenExpiration);
        const email = this.context.globalState.get<string>(STATE_KEYS.userEmail);

        if (!accessToken || !expiresAt) {
            return null;
        }

        // Check if token is expired (with 5-minute buffer)
        if (expiresAt < Date.now() + 5 * 60 * 1000) {
            return null;
        }

        return { accessToken, expiresAt, email };
    }

    /**
     * Get access token if available
     *
     * Returns the stored token if valid, or null if no valid token exists.
     * Does not trigger any authentication flow - use the wizard or dashboard
     * QuickPick flow to obtain a new token if needed.
     */
    async getAccessToken(): Promise<string | null> {
        const tokenInfo = await this.getStoredToken();
        return tokenInfo?.accessToken ?? null;
    }

    /**
     * Store a manually-provided token (from bookmarklet/QuickPick flow)
     *
     * Used when token is obtained via DA.live bookmarklet and pasted by user.
     * Stores token with expiration info extracted from JWT payload.
     *
     * @param token - JWT token string to store (should be pre-validated)
     */
    async storeToken(token: string): Promise<void> {
        // Store the token
        await this.context.globalState.update(STATE_KEYS.accessToken, token);

        // Extract expiration and email from JWT payload
        try {
            const parts = token.split('.');
            if (parts.length >= 2) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

                // Calculate expiry from created_at + expires_in
                if (payload.created_at && payload.expires_in) {
                    const createdAt = parseInt(payload.created_at, 10);
                    const expiresIn = parseInt(payload.expires_in, 10);
                    const expiresAt = createdAt + expiresIn;
                    await this.context.globalState.update(STATE_KEYS.tokenExpiration, expiresAt);
                }

                // Store email if available
                const email = payload.email || payload.preferred_username;
                if (email) {
                    await this.context.globalState.update(STATE_KEYS.userEmail, email);
                }
            }
        } catch {
            // Token parsing failed, but token was pre-validated so continue
            this.logger.warn('[DA.live Auth] Could not parse token payload for expiration/email');
        }

        this.logger.info('[DA.live Auth] Token stored successfully');
    }

    /**
     * Log out and clear stored tokens
     *
     * Clears all stored token data from globalState.
     * Token revocation is not performed as tokens expire naturally.
     */
    async logout(): Promise<void> {
        await this.context.globalState.update(STATE_KEYS.accessToken, undefined);
        await this.context.globalState.update(STATE_KEYS.tokenExpiration, undefined);
        await this.context.globalState.update(STATE_KEYS.userEmail, undefined);

        this.logger.info('[DA.live Auth] Logged out');
    }

    /**
     * Dispose resources
     *
     * No resources to clean up after PKCE removal.
     */
    dispose(): void {
        // No resources to clean up
    }
}
