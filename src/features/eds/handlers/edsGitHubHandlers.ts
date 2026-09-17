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
 *
 * @module features/eds/handlers/edsGitHubHandlers
 */

import * as vscode from 'vscode';
import { GitHubTokenService } from '../services/github/githubTokenService';
import { GITHUB_SCOPES } from '../services/types';
import { getGitHubServices } from './edsHelpers';
import { createRepoFromSource } from './storefrontSetup/storefrontSetupPhase1';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import type { GitHubAuthStatusPayload, GitHubOAuthErrorPayload } from '@/types/webviewPayloads';

// ==========================================================
// Payload Types
// ==========================================================

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
        const { tokenService } = getGitHubServices(context.context.secrets);

        // First, check if we have a stored token
        const storedToken = await tokenService.getToken();

        if (storedToken) {
            // Validate stored token
            const validation = await tokenService.validateToken();

            if (validation.valid && validation.user) {
                context.logger.debug('[EDS] GitHub auth valid for user:', validation.user.login);
                const orgs = await tokenService.getUserOrgs();
                await context.sendMessage('github-auth-status', {
                    isAuthenticated: true,
                    user: validation.user,
                    orgs,
                } satisfies GitHubAuthStatusPayload);
                return { success: true };
            }

            // Token invalid, fall through to check VS Code session
            context.logger.debug('[EDS] Stored GitHub token is invalid, checking VS Code session');
        }

        // Check VS Code for existing GitHub session (without prompting)
        // This catches users who are already signed into GitHub in VS Code
        const existingSession = await adoptExistingGitHubSession(tokenService);

        if (existingSession) {
            context.logger.debug('[EDS] Found existing VS Code GitHub session:', existingSession.account.label);

            // Get full user info by validating the new token
            const validation = await tokenService.validateToken();

            const orgs = await tokenService.getUserOrgs();

            await context.sendMessage('github-auth-status', {
                isAuthenticated: true,
                user: validation.user,
                orgs,
            } satisfies GitHubAuthStatusPayload);
            return { success: true };
        }

        // No stored token and no VS Code session
        context.logger.debug('[EDS] No GitHub auth found');
        await context.sendMessage('github-auth-status', {
            isAuthenticated: false,
        } satisfies GitHubAuthStatusPayload);

        return { success: true };
    } catch (error) {
        context.logger.error('[EDS] Error checking GitHub auth:', error as Error);
        await context.sendMessage('github-auth-status', {
            isAuthenticated: false,
            error: (error as Error).message,
        } satisfies GitHubAuthStatusPayload);
        return { success: false, error: (error as Error).message };
    }
}

/**
 * Sign in to GitHub through VS Code's provider, recovering from a session that
 * VS Code still caches but GitHub no longer accepts.
 *
 * ONE sign-in path, called by the webview handler below and by the
 * "Sign in to GitHub" palette command. A second copy would drift, and the
 * drifting one would be whichever nobody watched.
 *
 * @param tokenService - stores the token every GitHub call then uses
 * @param logger - receives each step
 * @param options - `force` skips straight to a fresh browser sign-in
 * @returns the GitHub login, or why there is none
 */
export async function signInToGitHub(
    tokenService: GitHubTokenService,
    logger: Logger,
    options: { force?: boolean } = {},
): Promise<{ login: string } | { error: string; cancelled?: boolean }> {
    const reauth = 'Your previous GitHub authorization is no longer valid. Re-authorize Demo Builder to continue.';
    let session = options.force
        ? await acquireGitHubSession(tokenService, { forceNew: true, reauthDetail: reauth })
        : await acquireGitHubSession(tokenService, { forceNew: false });
    if (!session) {
        logger.debug('[EDS] GitHub auth cancelled by user');
        return { error: 'Authentication cancelled', cancelled: true };
    }
    logger.debug('[EDS] GitHub session obtained for:', session.account.label);

    if (!options.force) {
        // The common failure here isn't a real auth problem — it's VS Code
        // returning a stale cached session for a token revoked since (the OAuth
        // app cleared in GitHub Settings, a password reset, an org de-authorizing
        // it). `forceNewSession` invalidates the cache and mints a working token.
        const validation = await tokenService.validateToken();
        if (!validation.valid) {
            logger.warn(
                '[EDS] Initial GitHub token failed validation — likely stale cached VS Code session; forcing fresh OAuth',
            );
            // `validateToken` clears the stored token on 401 as a side effect.
            // Explicit here too: a future refactor of it must not break the
            // precondition that the store is empty before the re-auth writes.
            await tokenService.clearToken();
            session = await acquireGitHubSession(tokenService, { forceNew: true, reauthDetail: reauth });
            if (!session) {
                logger.debug('[EDS] GitHub re-authorization cancelled by user');
                return { error: 'Re-authorization cancelled', cancelled: true };
            }
            logger.info('[EDS] GitHub re-authorization succeeded for:', session.account.label);
        }
    }

    // session.account.label is the GitHub login. Do NOT re-validate after a
    // forced re-auth — the token was just minted; a transient 401 here would
    // falsely flag a working session as broken and re-prompt indefinitely.
    return { login: session.account.label };
}

/**
 * Handle GitHub OAuth authentication for the wizard.
 *
 * Signs in through `signInToGitHub`, then pushes the identity and the org
 * memberships the namespace picker needs.
 *
 * @param context - Handler context with logging and messaging
 * @returns Success with user info or error
 */
export async function handleGitHubOAuth(context: HandlerContext): Promise<HandlerResponse> {
    try {
        context.logger.debug('[EDS] Starting GitHub OAuth via VS Code authentication');
        const { tokenService } = getGitHubServices(context.context.secrets);
        const outcome = await signInToGitHub(tokenService, context.logger);
        if ('error' in outcome) {
            await context.sendMessage('github-oauth-error', {
                error: outcome.error,
            } satisfies GitHubOAuthErrorPayload);
            return { success: false, error: outcome.error };
        }

        // Richer profile fields are fetched lazily by downstream code that needs them.
        const user = { login: outcome.login, email: null, name: null, avatarUrl: null };

        // The user's GitHub org memberships, for the wizard's namespace picker.
        // read:org is already in GITHUB_SCOPES, so no extra prompt fires;
        // failures degrade to "personal account only" (getUserOrgs' contract).
        const orgs = await tokenService.getUserOrgs();
        context.logger.debug(
            `[EDS] GitHub OAuth completed for user: ${user.login}, orgs: ${orgs.join(', ') || '(none)'}`,
        );

        await context.sendMessage('github-auth-complete', {
            isAuthenticated: true,
            user,
            orgs,
        } satisfies GitHubAuthStatusPayload);

        return { success: true };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] GitHub OAuth error:', error as Error);
        await context.sendMessage('github-oauth-error', {
            error: errorMessage,
        } satisfies GitHubOAuthErrorPayload);
        return { success: false, error: errorMessage };
    }
}

/**
 * Adopt the GitHub session VS Code already holds, without prompting: an SC
 * signed into GitHub in VS Code has a session the extension can use, and
 * this stores its token for the API operations. Undefined when there is none.
 * Shared by the auth check and by the reads that run before the Storefront
 * step's sign-in (the Add a demo package probe).
 */
export async function adoptExistingGitHubSession(
    tokenService: GitHubTokenService,
): Promise<vscode.AuthenticationSession | undefined> {
    const session = await vscode.authentication.getSession('github', [...GITHUB_SCOPES], {
        createIfNone: false,
        silent: true,
    });
    if (!session) return undefined;
    await tokenService.storeToken({
        token: session.accessToken,
        tokenType: 'bearer',
        scopes: [...GITHUB_SCOPES],
    });
    return session;
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
        const { tokenService } = getGitHubServices(context.context.secrets);

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
            } satisfies GitHubAuthStatusPayload);
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
        } satisfies GitHubAuthStatusPayload);

        return { success: true };
    } catch (error) {
        context.logger.error('[EDS] Error changing GitHub account:', error as Error);
        await context.sendMessage('github-oauth-error', {
            error: (error as Error).message,
        } satisfies GitHubOAuthErrorPayload);
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
        const { repoOperations } = getGitHubServices(context.context.secrets);

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
            defaultBranch: repo.defaultBranch,
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
    /**
     * The template is an added demo's source, which may not be a GitHub
     * template: check the flag and fall back to an empty repository reset onto
     * the source (`createRepoFromSource`). Shipped brands never set this.
     */
    fromAddedDemo?: boolean;
}

/**
 * Create a GitHub repository from a template
 *
 * Creates the repository and waits for template content to be populated.
 * This is called from RepoSelectionInline when creating a new repository,
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
    const { repoName, templateOwner, templateRepo, isPrivate, fromAddedDemo } = payload || {};

    if (!repoName || !templateOwner || !templateRepo) {
        const error = 'Missing required parameters: repoName, templateOwner, templateRepo';
        context.logger.error('[EDS] handleCreateGitHubRepo:', error);
        return { success: false, error };
    }

    try {
        context.logger.info(`[EDS] Creating GitHub repository: ${repoName} from ${templateOwner}/${templateRepo}`);
        const { repoOperations } = getGitHubServices(context.context.secrets);

        // Create repository from template — or, for an added demo whose source
        // is not a template, an empty repository reset onto the source.
        const templateSync = new TemplateSyncService(
            context.context.secrets,
            context.logger,
            ServiceLocator.getCommandExecutor(),
        );
        const repo = await createRepoFromSource(
            { repoOps: repoOperations, templateSync },
            { newRepoName: repoName, isPrivate: isPrivate ?? false, fromAddedDemo: Boolean(fromAddedDemo) },
            templateOwner,
            templateRepo,
            context.logger,
        );

        context.logger.debug(`[EDS] Repository created: ${repo.fullName}`);

        // Wait for template content to be populated
        context.logger.debug('[EDS] Waiting for repository content');
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
