/**
 * GitHub Token Service
 *
 * Handles token management for GitHub authentication including:
 * - Storing tokens in VS Code SecretStorage
 * - Retrieving and parsing tokens
 * - Clearing tokens
 * - Validating tokens with GitHub API
 *
 * Extracted from GitHubService as part of god file split.
 */

import * as vscode from 'vscode';
import { Octokit } from '@octokit/core';
import { retry } from '@octokit/plugin-retry';
import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import {
    type GitHubToken,
    type GitHubTokenValidation,
    type GitHubUser,
    type GitHubApiError,
} from './types';

/** Storage key for GitHub token in VS Code SecretStorage */
const TOKEN_STORAGE_KEY = 'github-token';

/** Default validation cache TTL (5 minutes) */
const DEFAULT_VALIDATION_TTL_MS = 300000;

/**
 * GitHub Token Service for token management
 */
export class GitHubTokenService {
    private logger: Logger;
    private secretStorage: vscode.SecretStorage;
    private validationCache: { result: GitHubTokenValidation; timestamp: number } | null = null;

    constructor(secretStorage: vscode.SecretStorage, logger?: Logger) {
        this.secretStorage = secretStorage;
        this.logger = logger ?? getLogger();
    }

    /**
     * Store token in VS Code SecretStorage
     * @param token - GitHub token to store
     */
    async storeToken(token: GitHubToken): Promise<void> {
        await this.secretStorage.store(TOKEN_STORAGE_KEY, JSON.stringify(token));
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
        this.validationCache = null;
        this.logger.debug('[GitHub] Token cleared');
    }

    /**
     * Check if token exists (quick check without validation)
     * @returns True if token exists
     */
    async hasToken(): Promise<boolean> {
        const token = await this.getToken();
        return token !== undefined;
    }

    /**
     * Validate token with GitHub API
     * @returns Validation result with user info
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
            const octokit = this.createAuthenticatedOctokit(token.token);
            const response = await octokit.request('GET /user');

            const user = this.mapToGitHubUser(response.data);

            const result: GitHubTokenValidation = {
                valid: true,
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

    /**
     * Create authenticated Octokit instance
     */
    private createAuthenticatedOctokit(token: string): InstanceType<typeof Octokit> {
        const OctokitWithRetry = Octokit.plugin(retry);
        return new OctokitWithRetry({
            auth: token,
        });
    }

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
}
