/**
 * GitHub Service Helpers
 *
 * Utility functions for GitHub operations:
 * - Octokit instance creation
 * - Token URL injection
 * - User data mapping
 * - State generation for OAuth
 *
 * Extracted from GitHubService for better modularity.
 */

import { Octokit } from '@octokit/core';
import { retry } from '@octokit/plugin-retry';
import type { GitHubUser, GitHubApiError } from './types';

// Re-export for backward compatibility
export const ERROR_MESSAGES = {
    OAUTH_CANCELLED: 'OAuth flow cancelled',
    OAUTH_TIMEOUT: 'OAuth flow timed out',
    NOT_AUTHENTICATED: 'Not authenticated',
    REPO_EXISTS: 'Repository name already exists',
    SERVICE_UNAVAILABLE: 'GitHub service is temporarily unavailable',
} as const;

/**
 * Create an unauthenticated Octokit instance with retry plugin
 */
export function createOctokit(): InstanceType<typeof Octokit> {
    const OctokitWithRetry = Octokit.plugin(retry);
    return new OctokitWithRetry();
}

/**
 * Create an authenticated Octokit instance with retry plugin
 */
export function createAuthenticatedOctokit(token: string): InstanceType<typeof Octokit> {
    const OctokitWithRetry = Octokit.plugin(retry);
    return new OctokitWithRetry({
        auth: token,
    });
}

/**
 * Generate a cryptographically secure state string for OAuth
 * Returns a 32-character hex string
 */
export function generateOAuthState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Inject token into clone URL for authenticated git operations
 */
export function injectTokenIntoUrl(url: string, token: string): string {
    const urlObj = new URL(url);
    urlObj.username = token;
    urlObj.password = 'x-oauth-basic';
    return urlObj.toString();
}

/**
 * Map GitHub API user response to GitHubUser type
 */
export function mapToGitHubUser(data: {
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
 * Wrap Octokit instance with error handling for common scenarios
 */
export function wrapOctokitWithErrorHandling(
    octokit: InstanceType<typeof Octokit>,
    onUnauthorized: () => Promise<void>,
): InstanceType<typeof Octokit> {
    const originalRequest = octokit.request.bind(octokit);

    const wrappedOctokit = Object.create(octokit);
    wrappedOctokit.request = async (...args: Parameters<typeof octokit.request>) => {
        try {
            return await originalRequest(...args);
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 401) {
                await onUnauthorized();
                throw error;
            }

            if (apiError.status === 403) {
                const rateLimitRemaining = apiError.headers?.['x-ratelimit-remaining'];
                if (rateLimitRemaining === '0') {
                    const resetTime = apiError.headers?.['x-ratelimit-reset'];
                    throw new Error(
                        `GitHub API rate limit exceeded. Resets at ${new Date(
                            parseInt(resetTime || '0') * 1000,
                        ).toISOString()}`,
                    );
                }
            }

            if (apiError.status === 503) {
                throw new Error(ERROR_MESSAGES.SERVICE_UNAVAILABLE);
            }

            throw error;
        }
    };

    return wrappedOctokit;
}
