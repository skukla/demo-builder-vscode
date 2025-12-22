/**
 * EDS Handlers
 *
 * Message handlers for EDS (Edge Delivery Services) wizard operations.
 *
 * Supported operations:
 * - `handleCheckGitHubAuth`: Validate stored GitHub token and return user info
 * - `handleGitHubOAuth`: Initiate OAuth flow and exchange code for token
 * - `handleGetGitHubRepos`: List repositories user has write access to
 * - `handleVerifyDaLiveOrg`: Check user access to DA.live organization
 * - `handleVerifyGitHubRepo`: Check user has write access to existing repository
 * - `handleValidateAccsCredentials`: Test ACCS GraphQL endpoint connectivity
 *
 * All handlers follow the standard MessageHandler signature:
 * - Accept HandlerContext for logging and messaging
 * - Accept typed payload with required data
 * - Return HandlerResponse with success status
 * - Send UI updates via context.sendMessage()
 *
 * Services are instantiated internally using context.context for VS Code APIs.
 *
 * @module features/eds/handlers
 */

import * as vscode from 'vscode';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { GitHubService } from '../services/githubService';
import { DaLiveService } from '../services/daLiveService';
import { DaLiveAuthService } from '../services/daLiveAuthService';
import { getBookmarkletUrl } from '../utils/daLiveTokenBookmarklet';

// ==========================================================
// Service Instance Cache
// ==========================================================

/** Cached GitHubService instance (per extension context) */
let cachedGitHubService: GitHubService | null = null;

/** Cached DaLiveService instance */
let cachedDaLiveService: DaLiveService | null = null;

/** Cached DaLiveAuthService instance (for darkalley OAuth) */
let cachedDaLiveAuthService: DaLiveAuthService | null = null;

/**
 * Get or create GitHubService instance
 */
function getGitHubService(context: HandlerContext): GitHubService {
    if (!cachedGitHubService) {
        cachedGitHubService = new GitHubService(context.context.secrets);
    }
    return cachedGitHubService;
}

/**
 * Get or create DaLiveService instance
 */
function getDaLiveService(context: HandlerContext): DaLiveService {
    if (!cachedDaLiveService) {
        if (!context.authManager) {
            throw new Error('Authentication service not available');
        }
        cachedDaLiveService = new DaLiveService(context.authManager);
    }
    return cachedDaLiveService;
}

/**
 * Get or create DaLiveAuthService instance (for darkalley OAuth)
 */
function getDaLiveAuthService(context: HandlerContext): DaLiveAuthService {
    if (!cachedDaLiveAuthService) {
        cachedDaLiveAuthService = new DaLiveAuthService(context.context);
    }
    return cachedDaLiveAuthService;
}

// ==========================================================
// Payload Types
// ==========================================================

/**
 * Payload for handleGetDaLiveSites
 */
interface GetDaLiveSitesPayload {
    orgName: string;
}

/**
 * Payload for handleVerifyDaLiveOrg
 */
interface VerifyDaLiveOrgPayload {
    orgName: string;
}

/**
 * Payload for handleVerifyGitHubRepo
 */
interface VerifyGitHubRepoPayload {
    repoFullName: string;
}

/**
 * Payload for handleValidateAccsCredentials
 */
interface ValidateAccsCredentialsPayload {
    accsHost: string;
    storeViewCode: string;
    customerGroup: string;
}

// ==========================================================
// Handlers
// ==========================================================

/**
 * Check GitHub authentication status
 *
 * First checks for stored token, then checks VS Code for existing GitHub session.
 * If VS Code has a session (user previously signed into GitHub), we use it automatically.
 *
 * @param context - Handler context with logging and messaging
 * @returns Success with auth status
 */
export async function handleCheckGitHubAuth(
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        context.logger.debug('[EDS] Checking GitHub auth status');
        const githubService = getGitHubService(context);

        // First, check if we have a stored token
        const storedToken = await githubService.getToken();

        if (storedToken) {
            // Validate stored token
            const validation = await githubService.validateToken();

            if (validation.valid) {
                context.logger.debug('[EDS] GitHub auth valid for user:', validation.user?.login);
                await context.sendMessage('github-auth-status', {
                    isAuthenticated: true,
                    user: validation.user,
                });
                return { success: true };
            }
            // Token invalid, fall through to check VS Code session
            context.logger.debug('[EDS] Stored GitHub token is invalid, checking VS Code session');
        }

        // Check VS Code for existing GitHub session (without prompting)
        // This catches users who are already signed into GitHub in VS Code
        const existingSession = await vscode.authentication.getSession(
            'github',
            ['repo', 'user', 'read:org'],
            { createIfNone: false, silent: true },
        );

        if (existingSession) {
            context.logger.debug('[EDS] Found existing VS Code GitHub session:', existingSession.account.label);

            // Store the token for API operations
            await githubService.storeToken({
                token: existingSession.accessToken,
                tokenType: 'bearer',
                scopes: ['repo', 'user', 'read:org'],
            });

            // Get full user info
            const user = await githubService.getAuthenticatedUser();

            await context.sendMessage('github-auth-status', {
                isAuthenticated: true,
                user: {
                    login: user.login,
                    avatarUrl: user.avatarUrl,
                    email: user.email,
                },
            });
            return { success: true };
        }

        // No stored token and no VS Code session
        context.logger.debug('[EDS] No GitHub auth found');
        await context.sendMessage('github-auth-status', {
            isAuthenticated: false,
        });

        return { success: true };
    } catch (error) {
        context.logger.error('[EDS] Error checking GitHub auth:', error as Error);
        await context.sendMessage('github-auth-status', {
            isAuthenticated: false,
            error: (error as Error).message,
        });
        return { success: false, error: (error as Error).message };
    }
}

/**
 * Initiate GitHub OAuth flow
 *
 * Uses VS Code's built-in GitHub authentication provider for a seamless experience.
 * The token is stored in GitHubService for subsequent API calls.
 *
 * @param context - Handler context with logging and messaging
 * @returns Success with user info or error
 */
export async function handleGitHubOAuth(
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        context.logger.debug('[EDS] Starting GitHub OAuth via VS Code authentication');

        // Use VS Code's built-in GitHub authentication
        // Scopes: repo (for repository operations), user (for user info)
        const session = await vscode.authentication.getSession(
            'github',
            ['repo', 'user', 'read:org'],
            { createIfNone: true },
        );

        if (!session) {
            context.logger.debug('[EDS] GitHub auth cancelled by user');
            await context.sendMessage('github-oauth-error', {
                error: 'Authentication cancelled',
            });
            return { success: false, error: 'Authentication cancelled' };
        }

        context.logger.debug('[EDS] GitHub session obtained for:', session.account.label);

        // Store the token in GitHubService for API operations
        const githubService = getGitHubService(context);
        await githubService.storeToken({
            token: session.accessToken,
            tokenType: 'bearer',
            scopes: ['repo', 'user', 'read:org'],
        });

        // Get full user info from GitHub API
        const user = await githubService.getAuthenticatedUser();

        context.logger.debug('[EDS] GitHub OAuth completed for user:', user.login);
        await context.sendMessage('github-auth-complete', {
            isAuthenticated: true,
            user: {
                login: user.login,
                avatarUrl: user.avatarUrl,
                email: user.email,
            },
        });

        return { success: true };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] GitHub OAuth error:', error as Error);
        await context.sendMessage('github-oauth-error', {
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    }
}

/**
 * Change GitHub account
 *
 * Clears stored token and initiates new OAuth with account selection.
 *
 * @param context - Handler context with logging and messaging
 * @returns Success with new auth status
 */
export async function handleGitHubChangeAccount(
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        context.logger.debug('[EDS] Changing GitHub account');
        const githubService = getGitHubService(context);

        // Clear stored token
        await githubService.clearToken();

        // Initiate new OAuth - VS Code will prompt for account selection
        const session = await vscode.authentication.getSession(
            'github',
            ['repo', 'user', 'read:org'],
            { createIfNone: true, clearSessionPreference: true },
        );

        if (!session) {
            context.logger.debug('[EDS] GitHub account change cancelled');
            await context.sendMessage('github-auth-status', {
                isAuthenticated: false,
            });
            return { success: true };
        }

        // Store new token
        await githubService.storeToken({
            token: session.accessToken,
            tokenType: 'bearer',
            scopes: ['repo', 'user', 'read:org'],
        });

        // Get user info
        const user = await githubService.getAuthenticatedUser();

        context.logger.debug('[EDS] GitHub account changed to:', user.login);
        await context.sendMessage('github-auth-complete', {
            isAuthenticated: true,
            user: {
                login: user.login,
                avatarUrl: user.avatarUrl,
                email: user.email,
            },
        });

        return { success: true };
    } catch (error) {
        context.logger.error('[EDS] Error changing GitHub account:', error as Error);
        await context.sendMessage('github-oauth-error', {
            error: (error as Error).message,
        });
        return { success: false, error: (error as Error).message };
    }
}

/**
 * Get list of GitHub repositories accessible to the user
 *
 * Returns repositories the user owns or has write access to,
 * sorted by most recently updated.
 *
 * @param context - Handler context with logging and messaging
 * @returns Success with repository list
 */
export async function handleGetGitHubRepos(
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        context.logger.debug('[EDS] Fetching GitHub repositories');
        const githubService = getGitHubService(context);

        const repos = await githubService.listUserRepositories();

        context.logger.debug(`[EDS] Found ${repos.length} repositories`);
        // Map to GitHubRepoItem format with string IDs for useSelectionStep hook
        const repoItems = repos.map(repo => ({
            id: repo.fullName,  // Use fullName as string ID
            name: repo.name,
            fullName: repo.fullName,
            description: repo.description,
            updatedAt: repo.updatedAt,
            isPrivate: repo.isPrivate,
            htmlUrl: repo.htmlUrl,
        }));
        await context.sendMessage('get-github-repos', repoItems);

        return { success: true };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] Error fetching GitHub repos:', error as Error);
        await context.sendMessage('get-github-repos-error', {
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    }
}

/**
 * Verify DA.live organization access
 *
 * Checks if user has access to the specified DA.live organization.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Contains org name to verify
 * @returns Success with verification status
 */
export async function handleVerifyDaLiveOrg(
    context: HandlerContext,
    payload?: VerifyDaLiveOrgPayload,
): Promise<HandlerResponse> {
    const { orgName } = payload || {};

    if (!orgName) {
        context.logger.error('[EDS] handleVerifyDaLiveOrg missing orgName');
        await context.sendMessage('dalive-org-verified', {
            verified: false,
            orgName: '',
            error: 'Organization name required',
        });
        return { success: false, error: 'Organization name required' };
    }

    try {
        context.logger.debug('[EDS] Verifying DA.live org access:', orgName);

        // Get stored DA.live token (from bookmarklet flow)
        const token = context.context.globalState.get<string>('daLive.accessToken');
        if (!token) {
            context.logger.error('[EDS] No DA.live token stored');
            await context.sendMessage('dalive-org-verified', {
                verified: false,
                orgName,
                error: 'Not authenticated with DA.live. Please sign in first.',
            });
            return { success: false, error: 'Not authenticated' };
        }

        // Verify org access using stored token
        const response = await fetch(`https://admin.da.live/list/${orgName}/`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        context.logger.debug('[EDS] DA.live org verification response:', response.status);

        if (response.status === 403) {
            await context.sendMessage('dalive-org-verified', {
                verified: false,
                orgName,
                error: 'Access denied. You may not have permission to access this organization.',
            });
            return { success: true };
        }

        if (response.status === 404) {
            await context.sendMessage('dalive-org-verified', {
                verified: false,
                orgName,
                error: 'Organization not found.',
            });
            return { success: true };
        }

        if (!response.ok) {
            await context.sendMessage('dalive-org-verified', {
                verified: false,
                orgName,
                error: `Verification failed: ${response.status}`,
            });
            return { success: true };
        }

        // Success - org is accessible
        await context.sendMessage('dalive-org-verified', {
            verified: true,
            orgName,
        });

        return { success: true };
    } catch (error) {
        context.logger.error('[EDS] Error verifying DA.live org:', error as Error);
        await context.sendMessage('dalive-org-verified', {
            verified: false,
            orgName,
            error: (error as Error).message,
        });
        return { success: false, error: (error as Error).message };
    }
}

/**
 * Get list of DA.live sites in an organization
 *
 * Returns sites (top-level folders) in the specified organization,
 * sorted alphabetically by name.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Contains org name to list sites for
 * @returns Success with site list
 */
export async function handleGetDaLiveSites(
    context: HandlerContext,
    payload?: GetDaLiveSitesPayload,
): Promise<HandlerResponse> {
    const { orgName } = payload || {};

    if (!orgName) {
        context.logger.error('[EDS] handleGetDaLiveSites missing orgName');
        await context.sendMessage('get-dalive-sites-error', {
            error: 'Organization name required',
        });
        return { success: false, error: 'Organization name required' };
    }

    try {
        context.logger.debug('[EDS] Fetching DA.live sites for org:', orgName);

        // Get stored DA.live token (from bookmarklet flow)
        const token = context.context.globalState.get<string>('daLive.accessToken');
        if (!token) {
            context.logger.error('[EDS] No DA.live token stored');
            await context.sendMessage('get-dalive-sites-error', {
                error: 'Not authenticated with DA.live. Please sign in first.',
            });
            return { success: false, error: 'Not authenticated' };
        }

        // Fetch sites directly using stored token
        const response = await fetch(`https://admin.da.live/list/${orgName}/`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            if (response.status === 403) {
                context.logger.warn('[EDS] No access to DA.live org:', orgName);
                await context.sendMessage('get-dalive-sites', []);
                return { success: true };
            }
            if (response.status === 404) {
                context.logger.warn('[EDS] DA.live org not found:', orgName);
                await context.sendMessage('get-dalive-sites', []);
                return { success: true };
            }
            throw new Error(`Failed to fetch sites: ${response.status}`);
        }

        const entries = await response.json();

        // Log raw response for debugging
        context.logger.debug(`[EDS] DA.live API returned ${entries.length} entries`);
        if (entries.length > 0) {
            context.logger.debug('[EDS] First entry sample:', JSON.stringify(entries[0]));
        }

        // Sites are top-level folders in DA.live
        // The API returns objects with 'name' and possibly other fields
        const siteItems = entries
            .filter((entry: { name: string; ext?: string }) => {
                // Filter out files (entries with extensions) - sites are folders (no ext)
                const isFolder = !entry.ext;
                if (!isFolder) {
                    context.logger.debug(`[EDS] Skipping file: ${entry.name}`);
                }
                return isFolder;
            })
            .map((entry: { name: string; lastModified?: string }) => ({
                id: entry.name,
                name: entry.name,
                lastModified: entry.lastModified,
            }))
            .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

        context.logger.debug(`[EDS] Found ${siteItems.length} DA.live sites`);
        await context.sendMessage('get-dalive-sites', siteItems);

        return { success: true };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] Error fetching DA.live sites:', error as Error);
        await context.sendMessage('get-dalive-sites-error', {
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    }
}

/**
 * Verify GitHub repository access
 *
 * Checks if user has write access to the specified GitHub repository.
 * Used when selecting an existing repository for EDS project setup.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Contains repository full name (owner/repo format)
 * @returns Success with verification status
 */
export async function handleVerifyGitHubRepo(
    context: HandlerContext,
    payload?: VerifyGitHubRepoPayload,
): Promise<HandlerResponse> {
    const { repoFullName } = payload || {};

    if (!repoFullName) {
        context.logger.error('[EDS] handleVerifyGitHubRepo missing repoFullName');
        await context.sendMessage('github-repo-verified', {
            verified: false,
            repoFullName: '',
            error: 'Repository name required',
        });
        return { success: false, error: 'Repository name required' };
    }

    // Parse owner/repo format
    const parts = repoFullName.split('/');
    if (parts.length !== 2) {
        context.logger.error('[EDS] Invalid repository format:', repoFullName);
        await context.sendMessage('github-repo-verified', {
            verified: false,
            repoFullName,
            error: 'Invalid format. Use owner/repository',
        });
        return { success: false, error: 'Invalid format. Use owner/repository' };
    }

    const [owner, repo] = parts;

    try {
        context.logger.debug('[EDS] Verifying GitHub repo access:', repoFullName);
        const githubService = getGitHubService(context);

        const result = await githubService.checkRepositoryAccess(owner, repo);

        context.logger.debug('[EDS] GitHub repo verification result:', result);
        await context.sendMessage('github-repo-verified', {
            verified: result.hasAccess,
            repoFullName,
            error: result.error,
        });

        return { success: true };
    } catch (error) {
        context.logger.error('[EDS] Error verifying GitHub repo:', error as Error);
        await context.sendMessage('github-repo-verified', {
            verified: false,
            repoFullName,
            error: (error as Error).message,
        });
        return { success: false, error: (error as Error).message };
    }
}

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

/**
 * Initiate DA.live OAuth flow with PKCE
 *
 * Uses the "darkalley" client ID (same as DA.live browser app).
 * Note: This may not work if VS Code redirect URIs are not registered
 * with Adobe's darkalley OAuth configuration.
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

        // Basic JWT format validation (starts with eyJ)
        if (!token.startsWith('eyJ')) {
            await context.sendMessage('dalive-token-stored', {
                success: false,
                error: 'Invalid token format. Please copy the complete token.',
            });
            return { success: false, error: 'Invalid token format' };
        }

        // Decode the JWT to extract user info and validate expiry
        let email: string | undefined;
        let expiresAt: number | undefined;
        try {
            const parts = token.split('.');
            if (parts.length >= 2) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                // Adobe IMS tokens may have user_id or email in different fields
                email = payload.email || payload.preferred_username;

                // Check token expiry from JWT payload
                // Adobe IMS tokens have created_at (timestamp) and expires_in (ms)
                if (payload.created_at && payload.expires_in) {
                    const createdAt = parseInt(payload.created_at, 10);
                    const expiresIn = parseInt(payload.expires_in, 10);
                    expiresAt = createdAt + expiresIn;

                    if (Date.now() > expiresAt) {
                        context.logger.warn('[EDS] DA.live token has expired');
                        await context.sendMessage('dalive-token-stored', {
                            success: false,
                            error: 'Token has expired. Please get a fresh token from DA.live.',
                        });
                        return { success: false, error: 'Token has expired' };
                    }
                }

                // Verify it's a darkalley token (DA.live client)
                if (payload.client_id && payload.client_id !== 'darkalley') {
                    context.logger.warn('[EDS] Token is not from DA.live (wrong client_id)');
                    await context.sendMessage('dalive-token-stored', {
                        success: false,
                        error: 'This token is not from DA.live. Please use the bookmarklet on da.live.',
                    });
                    return { success: false, error: 'Wrong token source' };
                }
            }
        } catch {
            // Token parsing failed, but might still be valid - continue
            context.logger.debug('[EDS] Could not parse JWT payload, continuing anyway');
        }

        // Store token with expiry from JWT or default 24-hour
        const tokenExpiry = expiresAt || (Date.now() + 24 * 60 * 60 * 1000);
        await context.context.globalState.update('daLive.accessToken', token);
        await context.context.globalState.update('daLive.tokenExpiration', tokenExpiry);
        if (email) {
            await context.context.globalState.update('daLive.userEmail', email);
        }

        // Mark setup as complete (user has successfully used the bookmarklet flow)
        await context.context.globalState.update('daLive.setupComplete', true);

        context.logger.info('[EDS] DA.live token stored successfully');
        await context.sendMessage('dalive-token-stored', {
            success: true,
            email,
        });

        // Also send auth status update
        await context.sendMessage('dalive-auth-status', {
            isAuthenticated: true,
            email,
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

        // Basic JWT format validation (starts with eyJ)
        if (!token.startsWith('eyJ')) {
            await context.sendMessage('dalive-token-with-org-result', {
                success: false,
                error: 'Invalid token format. Please copy the complete token.',
            });
            return { success: false, error: 'Invalid token format' };
        }

        // Decode the JWT to extract user info and validate expiry
        let email: string | undefined;
        let expiresAt: number | undefined;
        try {
            const parts = token.split('.');
            if (parts.length >= 2) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                email = payload.email || payload.preferred_username;

                // Check token expiry
                if (payload.created_at && payload.expires_in) {
                    const createdAt = parseInt(payload.created_at, 10);
                    const expiresIn = parseInt(payload.expires_in, 10);
                    expiresAt = createdAt + expiresIn;

                    if (Date.now() > expiresAt) {
                        context.logger.warn('[EDS] DA.live token has expired');
                        await context.sendMessage('dalive-token-with-org-result', {
                            success: false,
                            error: 'Token has expired. Please get a fresh token from DA.live.',
                        });
                        return { success: false, error: 'Token has expired' };
                    }
                }

                // Verify it's a darkalley token (DA.live client)
                if (payload.client_id && payload.client_id !== 'darkalley') {
                    context.logger.warn('[EDS] Token is not from DA.live (wrong client_id)');
                    await context.sendMessage('dalive-token-with-org-result', {
                        success: false,
                        error: 'This token is not from DA.live. Please use the bookmarklet on da.live.',
                    });
                    return { success: false, error: 'Wrong token source' };
                }
            }
        } catch {
            context.logger.debug('[EDS] Could not parse JWT payload, continuing anyway');
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
        const tokenExpiry = expiresAt || (Date.now() + 24 * 60 * 60 * 1000);
        await context.context.globalState.update('daLive.accessToken', token);
        await context.context.globalState.update('daLive.tokenExpiration', tokenExpiry);
        await context.context.globalState.update('daLive.orgName', orgName);
        if (email) {
            await context.context.globalState.update('daLive.userEmail', email);
        }
        await context.context.globalState.update('daLive.setupComplete', true);

        context.logger.info('[EDS] DA.live token stored and org verified:', orgName);

        // Send success with verified org
        await context.sendMessage('dalive-token-with-org-result', {
            success: true,
            email,
            orgName,
        });

        // Also send auth status update
        await context.sendMessage('dalive-auth-status', {
            isAuthenticated: true,
            email,
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

/**
 * Clear cached service instances
 *
 * Call this when extension is deactivated to clean up resources.
 */
export function clearServiceCache(): void {
    cachedGitHubService = null;
    cachedDaLiveService = null;
    if (cachedDaLiveAuthService) {
        cachedDaLiveAuthService.dispose();
        cachedDaLiveAuthService = null;
    }
}
