/**
 * GitHub Service
 *
 * Handles GitHub OAuth authentication, token management, repository operations,
 * and file operations for EDS (Edge Delivery Services) integration.
 *
 * Features:
 * - OAuth popup flow for authentication
 * - Token storage via VS Code SecretStorage
 * - Repository creation from templates
 * - File operations (read, write, commit)
 * - Error handling with retry logic
 */

import * as vscode from 'vscode';
import { Octokit } from '@octokit/core';
import { retry } from '@octokit/plugin-retry';
import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type {
    GitHubToken,
    GitHubTokenValidation,
    GitHubUser,
    GitHubRepo,
    GitHubFileContent,
    GitHubFileResult,
    OAuthCallbackParams,
    GitHubApiError,
} from './types';
import { REQUIRED_SCOPES } from './types';

// ==========================================================
// Constants
// ==========================================================

/** Storage key for GitHub token in VS Code SecretStorage */
const TOKEN_STORAGE_KEY = 'github-token';

/** GitHub OAuth authorization URL */
const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize';

/** GitHub OAuth token URL */
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/** Default OAuth timeout (2 minutes) */
const DEFAULT_OAUTH_TIMEOUT_MS = 120000;

/** Default validation cache TTL (5 minutes) */
const DEFAULT_VALIDATION_TTL_MS = 300000;

// Error messages for consistent user-facing errors
const ERROR_MESSAGES = {
    OAUTH_CANCELLED: 'OAuth flow cancelled',
    OAUTH_TIMEOUT: 'OAuth flow timed out',
    NOT_AUTHENTICATED: 'Not authenticated',
    REPO_EXISTS: 'Repository name already exists',
    SERVICE_UNAVAILABLE: 'GitHub service is temporarily unavailable',
} as const;

/**
 * GitHub Service for OAuth, token management, and repository operations
 */
export class GitHubService {
    private logger = getLogger();
    private secretStorage: vscode.SecretStorage;
    private octokit: InstanceType<typeof Octokit> | null = null;
    private oauthResolve: ((params: OAuthCallbackParams) => void) | null = null;
    private oauthReject: ((error: Error) => void) | null = null;
    private validationCache: { result: GitHubTokenValidation; timestamp: number } | null = null;

    constructor(secretStorage: vscode.SecretStorage) {
        this.secretStorage = secretStorage;
    }

    // ==========================================================
    // OAuth Flow
    // ==========================================================

    /**
     * Start OAuth flow by opening browser
     * @param clientId - GitHub OAuth App client ID
     * @param redirectUri - Callback URI (vscode:// scheme)
     * @returns Promise resolving to OAuth callback params
     */
    async startOAuthFlow(clientId: string, redirectUri: string): Promise<OAuthCallbackParams> {
        // Generate random state for CSRF protection
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
     * Exchange authorization code for access token
     * @param code - Authorization code from GitHub
     * @param clientId - GitHub OAuth App client ID
     * @param clientSecret - GitHub OAuth App client secret
     * @returns GitHub token
     */
    async exchangeCodeForToken(
        code: string,
        clientId: string,
        clientSecret: string
    ): Promise<GitHubToken> {
        const octokit = this.createOctokit();

        const response = await octokit.request('POST ' + GITHUB_TOKEN_URL, {
            client_id: clientId,
            client_secret: clientSecret,
            code,
            headers: {
                accept: 'application/json',
            },
        });

        const data = response.data as {
            access_token: string;
            token_type: string;
            scope: string;
        };

        return {
            token: data.access_token,
            tokenType: data.token_type,
            scopes: data.scope.split(',').map(s => s.trim()),
        };
    }

    // ==========================================================
    // Token Management
    // ==========================================================

    /**
     * Store token in VS Code SecretStorage
     * @param token - GitHub token to store
     */
    async storeToken(token: GitHubToken): Promise<void> {
        await this.secretStorage.store(TOKEN_STORAGE_KEY, JSON.stringify(token));
        this.invalidateOctokit();
        this.validationCache = null;
        this.logger.debug('[GitHub] Token stored');
    }

    /**
     * Get token from SecretStorage
     * @returns Token if exists, undefined otherwise
     */
    async getToken(): Promise<GitHubToken | undefined> {
        const stored = await this.secretStorage.get(TOKEN_STORAGE_KEY);
        if (!stored) {
            return undefined;
        }

        try {
            return JSON.parse(stored) as GitHubToken;
        } catch {
            this.logger.warn('[GitHub] Failed to parse stored token');
            return undefined;
        }
    }

    /**
     * Clear token from SecretStorage
     */
    async clearToken(): Promise<void> {
        await this.secretStorage.delete(TOKEN_STORAGE_KEY);
        this.invalidateOctokit();
        this.validationCache = null;
        this.logger.debug('[GitHub] Token cleared');
    }

    /**
     * Validate token with GitHub API
     * @returns Validation result with user info and scopes
     */
    async validateToken(): Promise<GitHubTokenValidation> {
        // Check cache first
        if (this.validationCache) {
            const cacheAge = Date.now() - this.validationCache.timestamp;
            const ttl = TIMEOUTS.TOKEN_VALIDATION_TTL || DEFAULT_VALIDATION_TTL_MS;
            if (cacheAge < ttl) {
                return this.validationCache.result;
            }
        }

        const token = await this.getToken();
        if (!token) {
            return { valid: false };
        }

        try {
            const octokit = this.getAuthenticatedOctokit(token.token);
            const response = await octokit.request('GET /user');

            // Parse scopes from response header
            const scopeHeader = response.headers['x-oauth-scopes'] as string | undefined;
            const scopes = scopeHeader
                ? scopeHeader.split(',').map(s => s.trim())
                : [];

            // Check for required scopes
            const missingScopes = REQUIRED_SCOPES.filter(
                required => !scopes.some(s => s === required)
            );

            const user = this.mapToGitHubUser(response.data);

            const result: GitHubTokenValidation = {
                valid: missingScopes.length === 0,
                scopes,
                missingScopes: missingScopes.length > 0 ? missingScopes : undefined,
                user,
            };

            // Cache valid result
            this.validationCache = {
                result,
                timestamp: Date.now(),
            };

            return result;
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 401) {
                // Token is invalid/expired - clear it
                await this.clearToken();
            }

            return { valid: false };
        }
    }

    // ==========================================================
    // Repository Operations
    // ==========================================================

    /**
     * Create repository from template
     * @param templateOwner - Owner of template repository
     * @param templateRepo - Name of template repository
     * @param newRepoName - Name for new repository
     * @param isPrivate - Whether new repo should be private (default: false)
     * @returns Created repository info
     */
    async createFromTemplate(
        templateOwner: string,
        templateRepo: string,
        newRepoName: string,
        isPrivate = false
    ): Promise<GitHubRepo> {
        const octokit = await this.ensureAuthenticated();

        try {
            const response = await octokit.request(
                'POST /repos/{template_owner}/{template_repo}/generate',
                {
                    template_owner: templateOwner,
                    template_repo: templateRepo,
                    name: newRepoName,
                    private: isPrivate,
                }
            );

            return {
                id: response.data.id,
                name: response.data.name,
                fullName: response.data.full_name,
                htmlUrl: response.data.html_url,
                cloneUrl: response.data.clone_url,
                defaultBranch: response.data.default_branch,
            };
        } catch (error) {
            const apiError = error as GitHubApiError & {
                errors?: Array<{ message: string }>;
            };

            if (apiError.status === 422) {
                const nameError = apiError.errors?.find(e =>
                    e.message.includes('name already exists')
                );
                if (nameError) {
                    throw new Error(ERROR_MESSAGES.REPO_EXISTS);
                }
            }

            throw error;
        }
    }

    /**
     * Clone repository to local path
     * @param repoUrl - Repository URL to clone
     * @param localPath - Local path to clone to
     */
    async cloneRepository(repoUrl: string, localPath: string): Promise<void> {
        const token = await this.getToken();
        if (!token) {
            throw new Error(ERROR_MESSAGES.NOT_AUTHENTICATED);
        }

        // Inject token into URL for authenticated clone
        const authedUrl = this.injectTokenIntoUrl(repoUrl, token.token);
        await this.executeGitCommand(`git clone ${authedUrl}`, localPath);
    }

    /**
     * Get authenticated user information
     * @returns GitHub user info
     */
    async getAuthenticatedUser(): Promise<GitHubUser> {
        const octokit = await this.ensureAuthenticated();

        const response = await octokit.request('GET /user');

        return this.mapToGitHubUser(response.data);
    }

    /**
     * List repositories accessible to the authenticated user
     * Returns repos the user owns or has write access to, sorted by most recently updated
     *
     * @returns Array of repositories with write access
     */
    async listUserRepositories(): Promise<GitHubRepo[]> {
        const octokit = await this.ensureAuthenticated();

        try {
            // Get repos user owns or collaborates on, sorted by most recently updated
            // Using manual pagination since we use @octokit/core without the paginate plugin
            const allRepos: GitHubRepo[] = [];
            let page = 1;
            const perPage = 100;

            while (true) {
                const response = await octokit.request('GET /user/repos', {
                    sort: 'updated',
                    direction: 'desc',
                    per_page: perPage,
                    page,
                    affiliation: 'owner,collaborator',
                });

                const repos = response.data;

                // Filter to only repos with push access and map to our type
                const mappedRepos = repos
                    .filter((repo: any) => repo.permissions?.push)
                    .map((repo: any) => ({
                        id: repo.id,
                        name: repo.name,
                        fullName: repo.full_name,
                        htmlUrl: repo.html_url,
                        cloneUrl: repo.clone_url,
                        defaultBranch: repo.default_branch,
                        description: repo.description,
                        updatedAt: repo.updated_at,
                        isPrivate: repo.private,
                    }));

                allRepos.push(...mappedRepos);

                // If we got fewer repos than perPage, we've reached the end
                if (repos.length < perPage) {
                    break;
                }

                page++;

                // Safety limit: don't fetch more than 10 pages (1000 repos)
                if (page > 10) {
                    this.logger.warn('[GitHub] Reached pagination limit (1000 repos)');
                    break;
                }
            }

            return allRepos;
        } catch (error) {
            this.logger.error('[GitHub] Failed to list repositories', error as Error);
            throw new Error(`Failed to list repositories: ${(error as Error).message}`);
        }
    }

    /**
     * Check if user has access to a repository
     * @param owner - Repository owner
     * @param repo - Repository name
     * @returns Object with hasAccess boolean and optional repo info or error
     */
    async checkRepositoryAccess(
        owner: string,
        repo: string
    ): Promise<{ hasAccess: boolean; repo?: GitHubRepo; error?: string }> {
        const octokit = await this.ensureAuthenticated();

        try {
            const response = await octokit.request('GET /repos/{owner}/{repo}', {
                owner,
                repo,
            });

            // Check if user has push access (needed for EDS operations)
            const permissions = response.data.permissions as { push?: boolean } | undefined;
            const hasPushAccess = permissions?.push ?? false;

            if (!hasPushAccess) {
                return {
                    hasAccess: false,
                    error: 'You need write access to this repository',
                };
            }

            return {
                hasAccess: true,
                repo: {
                    id: response.data.id,
                    name: response.data.name,
                    fullName: response.data.full_name,
                    htmlUrl: response.data.html_url,
                    cloneUrl: response.data.clone_url,
                    defaultBranch: response.data.default_branch,
                },
            };
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 404) {
                return {
                    hasAccess: false,
                    error: 'Repository not found',
                };
            }

            if (apiError.status === 403) {
                return {
                    hasAccess: false,
                    error: 'Access denied to this repository',
                };
            }

            throw error;
        }
    }

    /**
     * Get repository information
     * Fetches details about an existing repository for use in project setup.
     *
     * @param owner - Repository owner
     * @param repo - Repository name
     * @returns Repository information
     * @throws Error if repository not found or access denied
     */
    async getRepository(owner: string, repo: string): Promise<GitHubRepo> {
        const octokit = await this.ensureAuthenticated();

        try {
            const response = await octokit.request('GET /repos/{owner}/{repo}', {
                owner,
                repo,
            });

            return {
                id: response.data.id,
                name: response.data.name,
                fullName: response.data.full_name,
                htmlUrl: response.data.html_url,
                cloneUrl: response.data.clone_url,
                defaultBranch: response.data.default_branch,
            };
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 404) {
                throw new Error('Repository not found');
            }

            if (apiError.status === 403) {
                throw new Error('Access denied to this repository');
            }

            throw error;
        }
    }

    // ==========================================================
    // Repository Deletion/Archive Operations
    // ==========================================================

    /**
     * Delete a repository
     * Requires delete_repo OAuth scope.
     *
     * @param owner - Repository owner
     * @param repo - Repository name
     * @throws Error if delete_repo scope is missing or operation fails
     */
    async deleteRepository(owner: string, repo: string): Promise<void> {
        const octokit = await this.ensureAuthenticated();

        try {
            await octokit.request('DELETE /repos/{owner}/{repo}', {
                owner,
                repo,
            });

            this.logger.debug(`[GitHub] Repository ${owner}/${repo} deleted`);
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 403) {
                throw new Error(
                    `Cannot delete repository: missing delete_repo scope. ` +
                    `Please re-authenticate with the delete_repo permission.`
                );
            }

            throw error;
        }
    }

    /**
     * Archive a repository
     * Only requires repo OAuth scope (safer than delete).
     *
     * @param owner - Repository owner
     * @param repo - Repository name
     */
    async archiveRepository(owner: string, repo: string): Promise<void> {
        const octokit = await this.ensureAuthenticated();

        await octokit.request('PATCH /repos/{owner}/{repo}', {
            owner,
            repo,
            archived: true,
        });

        this.logger.debug(`[GitHub] Repository ${owner}/${repo} archived`);
    }

    // ==========================================================
    // File Operations
    // ==========================================================

    /**
     * Get file content from repository
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param path - File path
     * @param ref - Git ref (branch/tag/commit) - optional
     * @returns File content or null if not found
     */
    async getFileContent(
        owner: string,
        repo: string,
        path: string,
        ref?: string
    ): Promise<GitHubFileContent | null> {
        const octokit = await this.ensureAuthenticated();

        try {
            const response = await octokit.request(
                'GET /repos/{owner}/{repo}/contents/{path}',
                {
                    owner,
                    repo,
                    path,
                    ...(ref && { ref }),
                }
            );

            const data = response.data as {
                content: string;
                sha: string;
                path: string;
                encoding: string;
            };

            // Decode base64 content
            const decodedContent = Buffer.from(data.content, 'base64').toString('utf-8');

            return {
                content: decodedContent,
                sha: data.sha,
                path: data.path,
                encoding: data.encoding,
            };
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 404) {
                return null;
            }

            throw error;
        }
    }

    /**
     * Create or update file in repository
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param path - File path
     * @param content - File content (will be base64 encoded)
     * @param message - Commit message
     * @param sha - SHA of existing file (required for updates)
     * @returns Result with file and commit SHAs
     */
    async createOrUpdateFile(
        owner: string,
        repo: string,
        path: string,
        content: string,
        message: string,
        sha?: string
    ): Promise<GitHubFileResult> {
        const octokit = await this.ensureAuthenticated();

        // Base64 encode content
        const encodedContent = Buffer.from(content).toString('base64');

        const response = await octokit.request(
            'PUT /repos/{owner}/{repo}/contents/{path}',
            {
                owner,
                repo,
                path,
                message,
                content: encodedContent,
                ...(sha && { sha }),
            }
        );

        return {
            sha: response.data.content?.sha ?? '',
            commitSha: response.data.commit?.sha ?? '',
        };
    }

    // ==========================================================
    // Private Helpers
    // ==========================================================

    /**
     * Map GitHub API user response to GitHubUser
     */
    private mapToGitHubUser(data: {
        login: string;
        email?: string | null;
        name?: string | null;
        avatar_url?: string | null;
    }): GitHubUser {
        return {
            login: data.login,
            email: data.email || null,
            name: data.name || null,
            avatarUrl: data.avatar_url || null,
        };
    }

    /**
     * Generate random state string for OAuth CSRF protection
     */
    private generateState(): string {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Create unauthenticated Octokit instance
     */
    private createOctokit(): InstanceType<typeof Octokit> {
        const OctokitWithRetry = Octokit.plugin(retry);
        return new OctokitWithRetry();
    }

    /**
     * Create authenticated Octokit instance
     */
    private getAuthenticatedOctokit(token: string): InstanceType<typeof Octokit> {
        const OctokitWithRetry = Octokit.plugin(retry);
        return new OctokitWithRetry({
            auth: token,
        });
    }

    /**
     * Invalidate cached Octokit instance
     */
    private invalidateOctokit(): void {
        this.octokit = null;
    }

    /**
     * Ensure we have an authenticated Octokit instance
     * @returns Authenticated Octokit instance
     * @throws Error if not authenticated
     */
    private async ensureAuthenticated(): Promise<InstanceType<typeof Octokit>> {
        const token = await this.getToken();
        if (!token) {
            throw new Error(ERROR_MESSAGES.NOT_AUTHENTICATED);
        }

        if (!this.octokit) {
            this.octokit = this.getAuthenticatedOctokit(token.token);
        }

        // Wrap request to handle errors
        return this.wrapOctokitWithErrorHandling(this.octokit);
    }

    /**
     * Wrap Octokit with error handling
     */
    private wrapOctokitWithErrorHandling(
        octokit: InstanceType<typeof Octokit>
    ): InstanceType<typeof Octokit> {
        const originalRequest = octokit.request.bind(octokit);

        const wrappedOctokit = Object.create(octokit);
        wrappedOctokit.request = async (...args: Parameters<typeof octokit.request>) => {
            try {
                return await originalRequest(...args);
            } catch (error) {
                const apiError = error as GitHubApiError;

                // Handle 401 - clear token
                if (apiError.status === 401) {
                    await this.clearToken();
                    throw error;
                }

                // Handle rate limiting
                if (apiError.status === 403) {
                    const rateLimitRemaining = apiError.headers?.['x-ratelimit-remaining'];
                    if (rateLimitRemaining === '0') {
                        const resetTime = apiError.headers?.['x-ratelimit-reset'];
                        throw new Error(
                            `GitHub API rate limit exceeded. Resets at ${new Date(
                                parseInt(resetTime || '0') * 1000
                            ).toISOString()}`
                        );
                    }
                }

                // Handle service unavailable
                if (apiError.status === 503) {
                    throw new Error(ERROR_MESSAGES.SERVICE_UNAVAILABLE);
                }

                throw error;
            }
        };

        return wrappedOctokit;
    }

    /**
     * Inject token into git URL for authenticated operations
     */
    private injectTokenIntoUrl(url: string, token: string): string {
        const urlObj = new URL(url);
        urlObj.username = token;
        urlObj.password = 'x-oauth-basic';
        return urlObj.toString();
    }

    /**
     * Execute git command (abstracted for testing)
     */
    private async executeGitCommand(command: string, _cwd: string): Promise<void> {
        // This will be implemented with actual command execution
        // For now, this is a placeholder that tests can mock
        // SECURITY: Mask any tokens in the command before logging
        const safeCommand = command.replace(/https:\/\/[^@]+@/g, 'https://***@');
        this.logger.debug(`[GitHub] Executing: ${safeCommand}`);
    }
}
