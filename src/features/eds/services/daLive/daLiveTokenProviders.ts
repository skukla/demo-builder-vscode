/**
 * DA.live TokenProvider adapters — turn whatever holds a token (the Adobe
 * authentication manager, or a DaLiveAuthService) into the `TokenProvider`
 * shape the DA.live services take.
 *
 * Split out of `daLiveContentOperations.ts` (EDS-8, 2026-10-08): most callers
 * of these factories never touch the content services at all, and the adapters
 * change for sign-in reasons, not content reasons.
 *
 * vscode-free: the standalone MCP server imports this module.
 */

import type { TokenProvider } from './daLiveApiClient';

/**
 * Authentication manager interface for token provider creation.
 * This matches the shape of AuthenticationService.getTokenManager().
 */
interface TokenManager {
    inspectToken(): Promise<{ valid: boolean; expiresIn: number; token?: string }>;
}

interface AuthManagerLike {
    getTokenManager(): TokenManager;
}

/**
 * Create a TokenProvider adapter from an authentication manager.
 *
 * This factory function consolidates the repeated pattern of creating
 * TokenProvider adapters throughout the codebase. It handles:
 * - Null/undefined authManager (returns null-returning provider)
 * - Converting undefined tokens to null (as required by TokenProvider)
 *
 * @param authManager - Optional authentication manager with getTokenManager()
 * @returns TokenProvider that wraps the auth manager's token access
 */
export function createDaLiveTokenProvider(authManager?: AuthManagerLike | null): TokenProvider {
    if (!authManager) {
        return {
            getAccessToken: async () => null,
        };
    }

    return {
        getAccessToken: async () => {
            const token = (await authManager.getTokenManager().inspectToken()).token;
            return token ?? null;
        },
    };
}

/**
 * Create a TokenProvider that wraps a DaLiveAuthService instance.
 * Use this when you have a DaLiveAuthService and need a TokenProvider
 * for DaLiveContentOperations or DaLiveOrgOperations.
 *
 * @param authService - Any object with getAccessToken (e.g., DaLiveAuthService)
 * @returns TokenProvider that delegates to the auth service
 */
export function createDaLiveServiceTokenProvider(authService: {
    getAccessToken(): Promise<string | null>;
}): TokenProvider {
    return {
        getAccessToken: () => authService.getAccessToken(),
    };
}
