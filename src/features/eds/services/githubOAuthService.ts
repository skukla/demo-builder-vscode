/**
 * GitHub OAuth Service
 *
 * Handles OAuth flow for GitHub authentication including:
 * - Starting OAuth flow by opening browser
 * - Handling OAuth callback with authorization code
 * - Generating CSRF protection state
 *
 * Extracted from GitHubService as part of god file split.
 */

import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import { REQUIRED_SCOPES, type OAuthCallbackParams } from './types';

/** GitHub OAuth authorization URL */
const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize';

/** Default OAuth timeout (2 minutes) */
const DEFAULT_OAUTH_TIMEOUT_MS = 120000;

/** Error messages for OAuth flow */
const ERROR_MESSAGES = {
    OAUTH_CANCELLED: 'OAuth flow cancelled',
    OAUTH_TIMEOUT: 'OAuth flow timed out',
} as const;

/**
 * GitHub OAuth Service for authentication flow
 */
export class GitHubOAuthService {
    private logger: Logger;
    private oauthResolve: ((params: OAuthCallbackParams) => void) | null = null;
    private oauthReject: ((error: Error) => void) | null = null;

    constructor(
        _secretStorage: vscode.SecretStorage, // Kept for interface compatibility
        logger?: Logger,
    ) {
        this.logger = logger ?? getLogger();
    }

    /**
     * Start OAuth flow by opening browser
     * @param clientId - GitHub OAuth App client ID
     * @param redirectUri - Callback URI (vscode:// scheme)
     * @returns Promise resolving to OAuth callback params
     */
    async startOAuthFlow(clientId: string, redirectUri: string): Promise<OAuthCallbackParams> {
        const state = this.generateState();

        // Build OAuth URL with required scopes
        const scopes = REQUIRED_SCOPES.join(' ');
        const authUrl = new URL(GITHUB_OAUTH_URL);
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', scopes);
        authUrl.searchParams.set('state', state);

        this.logger.debug('[GitHub] Starting OAuth flow');

        // Create promise that will be resolved by callback handler
        const callbackPromise = new Promise<OAuthCallbackParams>((resolve, reject) => {
            this.oauthResolve = resolve;
            this.oauthReject = reject;
        });

        // Set timeout for OAuth flow
        const timeoutMs = TIMEOUTS.OAUTH_FLOW || DEFAULT_OAUTH_TIMEOUT_MS;
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                this.oauthResolve = null;
                this.oauthReject = null;
                reject(new Error(ERROR_MESSAGES.OAUTH_TIMEOUT));
            }, timeoutMs);
        });

        // Open browser with OAuth URL
        const opened = await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));

        if (!opened) {
            this.oauthResolve = null;
            this.oauthReject = null;
            throw new Error(ERROR_MESSAGES.OAUTH_CANCELLED);
        }

        // Wait for callback or timeout
        return Promise.race([callbackPromise, timeoutPromise]);
    }

    /**
     * Handle OAuth callback with authorization code
     * @param params - OAuth callback parameters
     */
    handleOAuthCallback(params: OAuthCallbackParams): void {
        if (this.oauthResolve) {
            this.oauthResolve(params);
            this.oauthResolve = null;
            this.oauthReject = null;
        }
    }

    /**
     * Generate random state string for OAuth CSRF protection
     * @returns 32-character hex string
     */
    generateState(): string {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
}
