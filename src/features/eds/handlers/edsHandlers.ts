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

// ==========================================================
// Service Instance Cache
// ==========================================================

/** Cached GitHubService instance (per extension context) */
let cachedGitHubService: GitHubService | null = null;

/** Cached DaLiveService instance */
let cachedDaLiveService: DaLiveService | null = null;

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

// ==========================================================
// Payload Types
// ==========================================================

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
 * Validates stored GitHub token and returns user information if valid.
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

        // Get stored token
        const token = await githubService.getToken();

        if (!token) {
            context.logger.debug('[EDS] No GitHub token found');
            await context.sendMessage('github-auth-status', {
                isAuthenticated: false,
            });
            return { success: true };
        }

        // Validate token
        const validation = await githubService.validateToken();

        if (!validation.valid) {
            context.logger.debug('[EDS] GitHub token is invalid');
            await context.sendMessage('github-auth-status', {
                isAuthenticated: false,
            });
            return { success: true };
        }

        context.logger.debug('[EDS] GitHub auth valid for user:', validation.user?.login);
        await context.sendMessage('github-auth-status', {
            isAuthenticated: true,
            user: validation.user,
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
        const daLiveService = getDaLiveService(context);

        const result = await daLiveService.verifyOrgAccess(orgName);

        context.logger.debug('[EDS] DA.live org verification result:', result);
        await context.sendMessage('dalive-org-verified', {
            verified: result.hasAccess,
            orgName,
            error: result.reason,
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
 * Clear cached service instances
 *
 * Call this when extension is deactivated to clean up resources.
 */
export function clearServiceCache(): void {
    cachedGitHubService = null;
    cachedDaLiveService = null;
}
