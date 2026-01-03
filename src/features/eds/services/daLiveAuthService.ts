/**
 * DA.live Authentication Service
 *
 * Implements Adobe IMS OAuth 2.0 with PKCE flow using the "darkalley" client ID.
 * This is the same authentication mechanism used by DA.live in the browser.
 *
 * Flow:
 * 1. Generate PKCE code verifier and challenge
 * 2. Start temporary localhost server to receive callback
 * 3. Open browser to Adobe IMS authorize endpoint
 * 4. Localhost server receives callback with authorization code
 * 5. Exchange authorization code for access token
 * 6. Shut down localhost server
 */

import * as crypto from 'crypto';
import * as http from 'http';
import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';

// ==========================================================
// Constants
// ==========================================================

/** Adobe IMS OAuth endpoints */
const IMS_ENDPOINTS = {
    authorize: 'https://ims-na1.adobelogin.com/ims/authorize/v2',
    token: 'https://ims-na1.adobelogin.com/ims/token/v3',
    profile: 'https://ims-na1.adobelogin.com/ims/profile/v1',
    revoke: 'https://ims-na1.adobelogin.com/ims/revoke',
};

/** DA.live client ID (same as used by DA.live in browser) */
const DA_LIVE_CLIENT_ID = 'darkalley';

/** OAuth scopes for DA.live access (matches DA.live browser app) */
const DA_LIVE_SCOPES = 'AdobeID,openid,gnav';

/** Localhost callback server port */
const LOCALHOST_PORT = 9876;

/** Localhost redirect URI */
const LOCALHOST_REDIRECT_URI = `http://localhost:${LOCALHOST_PORT}/callback`;

/** State storage keys */
const STATE_KEYS = {
    codeVerifier: 'daLive.pkce.codeVerifier',
    state: 'daLive.oauth.state',
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
// PKCE Utilities
// ==========================================================

/**
 * Generate cryptographically random code verifier for PKCE
 * Must be 43-128 characters using unreserved URI characters
 */
function generateCodeVerifier(): string {
    const length = 64;
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomBytes = crypto.randomBytes(length);
    let verifier = '';

    for (let i = 0; i < length; i++) {
        verifier += characters[randomBytes[i] % characters.length];
    }

    return verifier;
}

/**
 * Generate code challenge from verifier using SHA-256 (S256 method)
 */
function generateCodeChallenge(verifier: string): string {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    // Base64-URL encode (replace +/ with -_, remove padding)
    return hash.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Generate cryptographically random state parameter for CSRF protection
 */
function generateStateParameter(): string {
    return crypto.randomBytes(32).toString('hex');
}

// ==========================================================
// DA.live Authentication Service
// ==========================================================

export class DaLiveAuthService {
    private logger = getLogger();
    private context: vscode.ExtensionContext;
    private callbackServer: http.Server | undefined;
    private authPromiseResolve: ((result: DaLiveAuthResult) => void) | undefined;
    private authPromiseReject: ((error: Error) => void) | undefined;
    private authTimeout: NodeJS.Timeout | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Check if user is authenticated with DA.live
     */
    async isAuthenticated(): Promise<boolean> {
        const tokenInfo = await this.getStoredToken();
        return tokenInfo !== null && tokenInfo.expiresAt > Date.now();
    }

    /**
     * Get stored access token if valid
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
     * Get access token, authenticating if necessary
     */
    async getAccessToken(): Promise<string | null> {
        const tokenInfo = await this.getStoredToken();
        if (tokenInfo) {
            return tokenInfo.accessToken;
        }

        // No valid token, need to authenticate
        const result = await this.authenticate();
        return result.success ? result.accessToken || null : null;
    }

    /**
     * Initiate OAuth authentication flow
     */
    async authenticate(): Promise<DaLiveAuthResult> {
        this.logger.info('[DA.live Auth] Starting OAuth PKCE flow with darkalley client');

        try {
            // Generate PKCE values
            const codeVerifier = generateCodeVerifier();
            const codeChallenge = generateCodeChallenge(codeVerifier);
            const state = generateStateParameter();

            // Store PKCE values for callback
            await this.context.globalState.update(STATE_KEYS.codeVerifier, codeVerifier);
            await this.context.globalState.update(STATE_KEYS.state, state);

            // Start localhost callback server
            await this.startCallbackServer();

            // Build authorization URL
            const authUrl = new URL(IMS_ENDPOINTS.authorize);
            authUrl.searchParams.append('client_id', DA_LIVE_CLIENT_ID);
            authUrl.searchParams.append('code_challenge', codeChallenge);
            authUrl.searchParams.append('code_challenge_method', 'S256');
            authUrl.searchParams.append('redirect_uri', LOCALHOST_REDIRECT_URI);
            authUrl.searchParams.append('scope', DA_LIVE_SCOPES);
            authUrl.searchParams.append('response_type', 'code');
            authUrl.searchParams.append('state', state);

            this.logger.debug(`[DA.live Auth] Authorization URL: ${authUrl.toString()}`);
            this.logger.debug(`[DA.live Auth] Redirect URI: ${LOCALHOST_REDIRECT_URI}`);

            // Open browser for authentication
            await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));

            // Wait for callback (with timeout)
            return await this.waitForCallback();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`[DA.live Auth] Authentication error: ${errorMessage}`);
            this.stopCallbackServer();
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Start localhost HTTP server to receive OAuth callback
     */
    private startCallbackServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            // Stop existing server if any
            this.stopCallbackServer();

            this.callbackServer = http.createServer(async (req, res) => {
                // Only handle /callback path
                if (!req.url?.startsWith('/callback')) {
                    res.writeHead(404);
                    res.end('Not Found');
                    return;
                }

                this.logger.debug(`[DA.live Auth] Received callback: ${req.url}`);

                try {
                    const url = new URL(req.url, `http://localhost:${LOCALHOST_PORT}`);
                    const code = url.searchParams.get('code');
                    const state = url.searchParams.get('state');
                    const error = url.searchParams.get('error');
                    const errorDescription = url.searchParams.get('error_description');

                    // Send response to browser immediately
                    if (error) {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(this.getErrorPage(errorDescription || error));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(this.getSuccessPage());
                    }

                    // Handle error response
                    if (error) {
                        const message = errorDescription || error;
                        this.logger.error(`[DA.live Auth] OAuth error: ${message}`);
                        this.resolveAuth({ success: false, error: message });
                        return;
                    }

                    // Validate state parameter
                    const storedState = this.context.globalState.get<string>(STATE_KEYS.state);
                    if (state !== storedState) {
                        this.logger.error('[DA.live Auth] State mismatch - possible CSRF attack');
                        this.resolveAuth({ success: false, error: 'State validation failed' });
                        return;
                    }

                    if (!code) {
                        this.logger.error('[DA.live Auth] No authorization code received');
                        this.resolveAuth({ success: false, error: 'No authorization code received' });
                        return;
                    }

                    // Exchange code for token
                    const result = await this.exchangeCodeForToken(code);
                    this.resolveAuth(result);
                } catch (err) {
                    const errorMessage = err instanceof Error ? err.message : String(err);
                    this.logger.error(`[DA.live Auth] Callback error: ${errorMessage}`);
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end(this.getErrorPage(errorMessage));
                    this.resolveAuth({ success: false, error: errorMessage });
                } finally {
                    // Clean up PKCE values
                    await this.context.globalState.update(STATE_KEYS.codeVerifier, undefined);
                    await this.context.globalState.update(STATE_KEYS.state, undefined);
                }
            });

            this.callbackServer.on('error', (err) => {
                this.logger.error(`[DA.live Auth] Server error: ${err.message}`);
                reject(err);
            });

            this.callbackServer.listen(LOCALHOST_PORT, '127.0.0.1', () => {
                this.logger.debug(`[DA.live Auth] Callback server listening on port ${LOCALHOST_PORT}`);
                resolve();
            });
        });
    }

    /**
     * Stop the callback server
     */
    private stopCallbackServer(): void {
        if (this.callbackServer) {
            this.callbackServer.close();
            this.callbackServer = undefined;
        }
    }

    /**
     * Generate success page HTML for browser
     */
    private getSuccessPage(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <title>Authentication Successful</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff; }
        .container { text-align: center; }
        h1 { color: #4caf50; }
        p { color: #aaa; }
    </style>
</head>
<body>
    <div class="container">
        <h1>✓ Authentication Successful</h1>
        <p>You can close this window and return to VS Code.</p>
    </div>
</body>
</html>`;
    }

    /**
     * Generate error page HTML for browser
     */
    private getErrorPage(error: string): string {
        // Escape HTML special characters to prevent XSS
        const escapedError = this.escapeHtml(error);
        return `<!DOCTYPE html>
<html>
<head>
    <title>Authentication Failed</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff; }
        .container { text-align: center; }
        h1 { color: #f44336; }
        p { color: #aaa; }
        .error { color: #ff6b6b; font-family: monospace; margin-top: 1rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>&#10007; Authentication Failed</h1>
        <p>Please close this window and try again in VS Code.</p>
        <p class="error">${escapedError}</p>
    </div>
</body>
</html>`;
    }

    /**
     * Exchange authorization code for access token
     */
    private async exchangeCodeForToken(code: string): Promise<DaLiveAuthResult> {
        const codeVerifier = this.context.globalState.get<string>(STATE_KEYS.codeVerifier);
        if (!codeVerifier) {
            return { success: false, error: 'Code verifier not found' };
        }

        // Build token request
        const formData = new URLSearchParams();
        formData.append('code', code);
        formData.append('code_verifier', codeVerifier);
        formData.append('grant_type', 'authorization_code');
        formData.append('redirect_uri', LOCALHOST_REDIRECT_URI);

        this.logger.debug('[DA.live Auth] Exchanging code for token...');

        const response = await fetch(
            `${IMS_ENDPOINTS.token}?client_id=${encodeURIComponent(DA_LIVE_CLIENT_ID)}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            },
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error_description || errorData.error || response.statusText;
            this.logger.error('[DA.live Auth] Token exchange failed:', errorMessage);
            return { success: false, error: `Token exchange failed: ${errorMessage}` };
        }

        const tokenData = await response.json();

        if (!tokenData.access_token) {
            return { success: false, error: 'No access token in response' };
        }

        // Store token
        const expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
        await this.context.globalState.update(STATE_KEYS.accessToken, tokenData.access_token);
        await this.context.globalState.update(STATE_KEYS.tokenExpiration, expiresAt);

        // Fetch user profile
        const email = await this.fetchUserEmail(tokenData.access_token);
        if (email) {
            await this.context.globalState.update(STATE_KEYS.userEmail, email);
        }

        this.logger.info('[DA.live Auth] Authentication successful');

        return {
            success: true,
            accessToken: tokenData.access_token,
            email,
        };
    }

    /**
     * Fetch user email from IMS profile
     */
    private async fetchUserEmail(accessToken: string): Promise<string | undefined> {
        try {
            const response = await fetch(
                `${IMS_ENDPOINTS.profile}?client_id=${encodeURIComponent(DA_LIVE_CLIENT_ID)}`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                },
            );

            if (response.ok) {
                const profile = await response.json();
                return profile.email;
            }
        } catch (error) {
            this.logger.warn(`[DA.live Auth] Failed to fetch user profile: ${(error as Error).message}`);
        }
        return undefined;
    }

    /**
     * Wait for OAuth callback with timeout
     */
    private waitForCallback(): Promise<DaLiveAuthResult> {
        return new Promise((resolve, reject) => {
            this.authPromiseResolve = resolve;
            this.authPromiseReject = reject;

            // Set timeout (5 minutes)
            this.authTimeout = setTimeout(() => {
                if (this.authPromiseResolve) {
                    this.logger.warn('[DA.live Auth] Authentication timed out');
                    this.resolveAuth({
                        success: false,
                        error: 'Authentication timed out. Please try again.',
                    });
                }
            }, 5 * 60 * 1000);
        });
    }

    /**
     * Resolve pending authentication promise
     */
    private resolveAuth(result: DaLiveAuthResult): void {
        // Clear timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = undefined;
        }

        // Resolve promise
        if (this.authPromiseResolve) {
            this.authPromiseResolve(result);
            this.authPromiseResolve = undefined;
            this.authPromiseReject = undefined;
        }

        // Stop callback server
        this.stopCallbackServer();
    }

    /**
     * Log out and clear stored tokens
     */
    async logout(): Promise<void> {
        const accessToken = this.context.globalState.get<string>(STATE_KEYS.accessToken);

        // Revoke token if we have one
        if (accessToken) {
            try {
                await fetch(
                    `${IMS_ENDPOINTS.revoke}?client_id=${encodeURIComponent(DA_LIVE_CLIENT_ID)}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: new URLSearchParams({ token: accessToken }).toString(),
                    },
                );
            } catch (error) {
                this.logger.warn(`[DA.live Auth] Token revocation failed: ${(error as Error).message}`);
            }
        }

        // Clear stored state
        await this.context.globalState.update(STATE_KEYS.accessToken, undefined);
        await this.context.globalState.update(STATE_KEYS.tokenExpiration, undefined);
        await this.context.globalState.update(STATE_KEYS.userEmail, undefined);
        await this.context.globalState.update(STATE_KEYS.codeVerifier, undefined);
        await this.context.globalState.update(STATE_KEYS.state, undefined);

        this.logger.info('[DA.live Auth] Logged out');
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.stopCallbackServer();
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = undefined;
        }
    }

    /**
     * Escape HTML special characters to prevent XSS
     */
    private escapeHtml(text: string): string {
        const htmlEscapeMap: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        };
        return text.replace(/[&<>"']/g, char => htmlEscapeMap[char] || char);
    }
}
