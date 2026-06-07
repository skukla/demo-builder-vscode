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

import * as crypto from 'crypto';
import { Octokit } from '@octokit/core';
import { retry } from '@octokit/plugin-retry';
import type { GitHubUser } from './types';

// Re-export for backward compatibility
export const ERROR_MESSAGES = {
    OAUTH_CANCELLED: 'OAuth flow cancelled',
    OAUTH_TIMEOUT: 'OAuth flow timed out',
    NOT_AUTHENTICATED: 'Not authenticated',
    REPO_EXISTS: 'Repository name already exists',
    SERVICE_UNAVAILABLE: 'GitHub service is temporarily unavailable',
} as const;

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
    return crypto.randomBytes(16).toString('hex');
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
