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
import { GitHubTokenService } from '../services/githubTokenService';
import { GITHUB_SCOPES } from '../services/types';
import { getGitHubServices } from './edsHelpers';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

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

            if (validation.valid && validation.user) {
                context.logger.debug('[EDS] GitHub auth valid for user:', validation.user.login);
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
            [...GITHUB_SCOPES],
            { createIfNone: false, silent: true },
        );

        if (existingSession) {
            context.logger.debug('[EDS] Found existing VS Code GitHub session:', existingSession.account.label);

            // Store the token for API operations
            await tokenService.storeToken({
                token: existingSession.accessToken,
                tokenType: 'bearer',
                scopes: [...GITHUB_SCOPES],
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
        const { tokenService } = getGitHubServices(context);

        // First attempt: let VS Code return its cached session if one exists,
        // or prompt fresh auth via createIfNone. This is the fast path for
        // the common case.
        let session = await acquireGitHubSession(tokenService, { forceNew: false });
        if (!session) {
            context.logger.debug('[EDS] GitHub auth cancelled by user');
            await context.sendMessage('github-oauth-error', {
                error: 'Authentication cancelled',
            });
            return { success: false, error: 'Authentication cancelled' };
        }
        context.logger.debug('[EDS] GitHub session obtained for:', session.account.label);

        // Sanity-check the token. The common failure here isn't a real auth
        // problem — it's VS Code returning a stale cached session for a
        // token that's been revoked since (user cleared the OAuth app in
        // GitHub Settings, password reset, OAuth app de-authorized at the
        // org level, etc.). In that case, `forceNewSession` invalidates the
        // cache and prompts a fresh browser-side OAuth flow that mints a
        // working token. See the `validateToken` side-effect note below.
        const validation = await tokenService.validateToken();
        if (!validation.valid) {
            context.logger.warn(
                '[EDS] Initial GitHub token failed validation — likely stale cached VS Code session; forcing fresh OAuth',
            );

            // `validateToken` clears the stored token on 401 as a side effect.
            // Defensive explicit clear here as well: future refactors of
            // `validateToken` mustn't break the precondition that our store is
            // empty before the forced re-auth writes a new token.
            await tokenService.clearToken();

            session = await acquireGitHubSession(tokenService, {
                forceNew: true,
                reauthDetail: 'Your previous GitHub authorization is no longer valid. Re-authorize Demo Builder to continue.',
            });
            if (!session) {
                context.logger.debug('[EDS] GitHub re-authorization cancelled by user');
                await context.sendMessage('github-oauth-error', {
                    error: 'Re-authorization cancelled',
                });
                return { success: false, error: 'Re-authorization cancelled' };
            }
            context.logger.info('[EDS] GitHub re-authorization succeeded for:', session.account.label);
        }

        // session.account.label is the GitHub login. Do NOT re-validate after a
        // forced re-auth — the token was just minted; a transient 401 here
        // would falsely flag a working session as broken and re-prompt
        // indefinitely. Trust VS Code's session as the source of truth for the
        // user identity; richer profile fields are fetched lazily by
        // downstream code that needs them.
        const user = {
            login: session.account.label,
            email: null,
            name: null,
            avatarUrl: null,
        };

        context.logger.debug('[EDS] GitHub OAuth completed for user:', user.login);
        await context.sendMessage('github-auth-complete', {
            isAuthenticated: true,
            user,
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
 * Acquire a GitHub session via VS Code's auth provider and store its token.
 *
 * Wraps `vscode.authentication.getSession` with the two modes the OAuth flows
 * need: cached-or-create (default) and force-new-session (for stale-session
 * recovery and explicit account changes). Centralizes the
 * `[...GITHUB_SCOPES]` + `storeToken` boilerplate that was previously
 * duplicated across `handleGitHubOAuth` and `handleGitHubChangeAccount`.
 *
 * Returns the session on success, or `undefined` if the user cancelled.
 */
async function acquireGitHubSession(
    tokenService: GitHubTokenService,
    options: { forceNew: boolean; reauthDetail?: string },
): Promise<vscode.AuthenticationSession | undefined> {
    const session = await vscode.authentication.getSession(
        'github',
        [...GITHUB_SCOPES],
        options.forceNew
            ? { forceNewSession: { detail: options.reauthDetail ?? 'Re-authorize Demo Builder to use GitHub' } }
            : { createIfNone: true },
    );
    if (!session) return undefined;

    await tokenService.storeToken({
        token: session.accessToken,
        tokenType: 'bearer',
        scopes: [...GITHUB_SCOPES],
    });
    return session;
}

/**
 * Change GitHub account
 *
 * Clears stored token and forces fresh OAuth flow with full scope authorization.
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

        // Clear stored token before fresh auth — the new session must not
        // inherit any state from the old one.
        await tokenService.clearToken();

        const session = await acquireGitHubSession(tokenService, {
            forceNew: true,
            reauthDetail: 'Re-authorize to grant all required permissions',
        });
        if (!session) {
            context.logger.debug('[EDS] GitHub account change cancelled');
            await context.sendMessage('github-auth-status', {
                isAuthenticated: false,
            });
            return { success: true };
        }

        // session.account.label is the new login. Symmetric with
        // handleGitHubOAuth: trust VS Code's session as source of truth and
        // skip the validateToken roundtrip — it would clear the fresh token
        // on any transient 401 (see the comment in handleGitHubOAuth).
        const user = {
            login: session.account.label,
            email: null,
            name: null,
            avatarUrl: null,
        };

        context.logger.debug('[EDS] GitHub account changed to:', user.login);
        await context.sendMessage('github-auth-complete', {
            isAuthenticated: true,
            user,
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
