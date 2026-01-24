/**
 * EDS GitHub Handlers
 *
 * Message handlers for GitHub-related EDS operations.
 *
 * Handlers:
 * - `handleCheckGitHubAuth`: Validate stored GitHub token and return user info
 * - `handleGitHubOAuth`: Initiate OAuth flow via VS Code authentication
 * - `handleGitHubChangeAccount`: Switch to a different GitHub account
 * - `handleGetGitHubRepos`: List repositories user has write access to
 * - `handleVerifyGitHubRepo`: Check user has write access to existing repository
 *
 * @module features/eds/handlers/edsGitHubHandlers
 */

import * as vscode from 'vscode';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { getGitHubServices } from './edsHelpers';

// ==========================================================
// Payload Types
// ==========================================================

/**
 * Payload for handleVerifyGitHubRepo
 */
interface VerifyGitHubRepoPayload {
    repoFullName: string;
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
        const { tokenService } = getGitHubServices(context);

        // First, check if we have a stored token
        const storedToken = await tokenService.getToken();

        if (storedToken) {
            // Validate stored token
            const validation = await tokenService.validateToken();

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
        // Note: delete_repo scope is needed for the repurpose/overwrite repo flow
        const existingSession = await vscode.authentication.getSession(
            'github',
            ['repo', 'user', 'read:org', 'delete_repo'],
            { createIfNone: false, silent: true },
        );

        if (existingSession) {
            context.logger.debug('[EDS] Found existing VS Code GitHub session:', existingSession.account.label);

            // Store the token for API operations
            await tokenService.storeToken({
                token: existingSession.accessToken,
                tokenType: 'bearer',
                scopes: ['repo', 'user', 'read:org', 'delete_repo'],
            });

            // Get full user info by validating the new token
            const validation = await tokenService.validateToken();

            await context.sendMessage('github-auth-status', {
                isAuthenticated: true,
                user: validation.user,
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
 * The token is stored in GitHubTokenService for subsequent API calls.
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
        // Scopes: repo (for repository operations), user (for user info),
        //         delete_repo (for repurpose/overwrite repo flow)
        const session = await vscode.authentication.getSession(
            'github',
            ['repo', 'user', 'read:org', 'delete_repo'],
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

        // Store the token in GitHubTokenService for API operations
        const { tokenService } = getGitHubServices(context);
        await tokenService.storeToken({
            token: session.accessToken,
            tokenType: 'bearer',
            scopes: ['repo', 'user', 'read:org', 'delete_repo'],
        });

        // Get full user info by validating the token
        const validation = await tokenService.validateToken();

        context.logger.debug('[EDS] GitHub OAuth completed for user:', validation.user?.login);
        await context.sendMessage('github-auth-complete', {
            isAuthenticated: true,
            user: validation.user,
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
        const { tokenService } = getGitHubServices(context);

        // Clear stored token
        await tokenService.clearToken();

        // Initiate new OAuth - VS Code will prompt for account selection
        // Include delete_repo for repurpose/overwrite repo flow
        const session = await vscode.authentication.getSession(
            'github',
            ['repo', 'user', 'read:org', 'delete_repo'],
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
        await tokenService.storeToken({
            token: session.accessToken,
            tokenType: 'bearer',
            scopes: ['repo', 'user', 'read:org', 'delete_repo'],
        });

        // Get user info by validating the token
        const validation = await tokenService.validateToken();

        context.logger.debug('[EDS] GitHub account changed to:', validation.user?.login);
        await context.sendMessage('github-auth-complete', {
            isAuthenticated: true,
            user: validation.user,
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
        const { repoOperations } = getGitHubServices(context);

        const repos = await repoOperations.listUserRepositories();

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
 * Verify GitHub repository access
 *
 * Checks if user has write access to an existing repository.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Contains repository name to verify
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
        const { repoOperations } = getGitHubServices(context);

        const result = await repoOperations.checkRepositoryAccess(owner, repo);

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

// ==========================================================
// GitHub Repository Creation Handler
// ==========================================================

/**
 * Payload for handleCreateGitHubRepo
 */
interface CreateGitHubRepoPayload {
    repoName: string;
    templateOwner: string;
    templateRepo: string;
    isPrivate?: boolean;
}

/**
 * Create a GitHub repository from a template
 *
 * Creates the repository and waits for template content to be populated.
 * This is called from GitHubRepoSelectionStep when creating a new repository,
 * allowing the repo to exist before proceeding to code sync verification.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Contains repository creation parameters
 * @returns Success with repository info
 */
export async function handleCreateGitHubRepo(
    context: HandlerContext,
    payload?: CreateGitHubRepoPayload,
): Promise<HandlerResponse> {
    const { repoName, templateOwner, templateRepo, isPrivate } = payload || {};

    if (!repoName || !templateOwner || !templateRepo) {
        const error = 'Missing required parameters: repoName, templateOwner, templateRepo';
        context.logger.error('[EDS] handleCreateGitHubRepo:', error);
        return { success: false, error };
    }

    try {
        context.logger.info(`[EDS] Creating GitHub repository: ${repoName} from ${templateOwner}/${templateRepo}`);
        const { repoOperations } = getGitHubServices(context);

        // Create repository from template
        const repo = await repoOperations.createFromTemplate(
            templateOwner,
            templateRepo,
            repoName,
            isPrivate ?? false,
        );

        context.logger.debug(`[EDS] Repository created: ${repo.fullName}`);

        // Wait for template content to be populated
        context.logger.debug('[EDS] Waiting for repository content...');
        await repoOperations.waitForContent(repo.fullName.split('/')[0], repo.name);

        context.logger.info(`[EDS] Repository ready: ${repo.htmlUrl}`);

        // Parse owner from fullName
        const [owner, name] = repo.fullName.split('/');

        return {
            success: true,
            data: {
                owner,
                name,
                url: repo.htmlUrl,
                fullName: repo.fullName,
            },
        };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] Error creating GitHub repo:', error as Error);
        return { success: false, error: errorMessage };
    }
}
