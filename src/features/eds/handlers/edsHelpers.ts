/**
 * EDS Helpers
 *
 * Helper functions for EDS handlers, extracted from edsHandlers.ts for better modularity.
 *
 * Contains:
 * - Service instance cache management (getGitHubServices, getDaLiveServices, getDaLiveAuthService)
 * - clearServiceCache for cleanup
 * - validateDaLiveToken for JWT validation
 *
 * @module features/eds/handlers/edsHelpers
 */

import { DaLiveAuthService } from '../services/daLiveAuthService';
import { DaLiveContentOperations } from '../services/daLiveContentOperations';
import { DaLiveOrgOperations, type TokenProvider } from '../services/daLiveOrgOperations';
import { GitHubFileOperations } from '../services/githubFileOperations';
import { GitHubOAuthService } from '../services/githubOAuthService';
import { GitHubRepoOperations } from '../services/githubRepoOperations';
import { GitHubTokenService } from '../services/githubTokenService';
import { getLogger } from '@/core/logging';
import type { HandlerContext } from '@/types/handlers';

// ==========================================================
// Service Instance Cache
// ==========================================================

/**
 * GitHub Services - composed from extracted modules
 */
export interface GitHubServices {
    tokenService: GitHubTokenService;
    repoOperations: GitHubRepoOperations;
    fileOperations: GitHubFileOperations;
    oauthService: GitHubOAuthService;
}

/**
 * DA.live Services - composed from extracted modules
 */
export interface DaLiveServices {
    orgOperations: DaLiveOrgOperations;
    contentOperations: DaLiveContentOperations;
}

/** Cached GitHub services (per extension context) */
let cachedGitHubServices: GitHubServices | null = null;

/** Cached DA.live services */
let cachedDaLiveServices: DaLiveServices | null = null;

/** Cached DaLiveAuthService instance (for darkalley OAuth) */
let cachedDaLiveAuthService: DaLiveAuthService | null = null;

/**
 * Get or create GitHub services
 * Returns all GitHub-related services with explicit dependencies
 */
export function getGitHubServices(context: HandlerContext): GitHubServices {
    if (!cachedGitHubServices) {
        const logger = getLogger();
        const tokenService = new GitHubTokenService(context.context.secrets, logger);
        const repoOperations = new GitHubRepoOperations(tokenService, logger);
        const fileOperations = new GitHubFileOperations(tokenService, logger);
        const oauthService = new GitHubOAuthService(context.context.secrets, logger);

        cachedGitHubServices = {
            tokenService,
            repoOperations,
            fileOperations,
            oauthService,
        };
    }
    return cachedGitHubServices;
}

/**
 * Get or create DA.live services
 * Returns all DA.live-related services with explicit dependencies
 */
export function getDaLiveServices(context: HandlerContext): DaLiveServices {
    if (!cachedDaLiveServices) {
        if (!context.authManager) {
            throw new Error('Authentication service not available');
        }

        const logger = getLogger();

        // Create token provider adapter from AuthenticationService
        const tokenProvider: TokenProvider = {
            getAccessToken: async () => {
                if (!context.authManager) {
                    throw new Error('AuthManager not available');
                }
                const tokenManager = context.authManager.getTokenManager();
                const token = await tokenManager.getAccessToken();
                return token ?? null;  // Convert undefined to null for TokenProvider interface
            },
        };

        const orgOperations = new DaLiveOrgOperations(tokenProvider, logger);
        const contentOperations = new DaLiveContentOperations(tokenProvider, logger);

        cachedDaLiveServices = {
            orgOperations,
            contentOperations,
        };
    }
    return cachedDaLiveServices;
}

/**
 * Get or create DaLiveAuthService instance (for darkalley OAuth)
 */
export function getDaLiveAuthService(context: HandlerContext): DaLiveAuthService {
    if (!cachedDaLiveAuthService) {
        cachedDaLiveAuthService = new DaLiveAuthService(context.context);
    }
    return cachedDaLiveAuthService;
}

/**
 * Clear cached service instances
 *
 * Call this when extension is deactivated to clean up resources.
 */
export function clearServiceCache(): void {
    cachedGitHubServices = null;
    cachedDaLiveServices = null;
    if (cachedDaLiveAuthService) {
        cachedDaLiveAuthService.dispose();
        cachedDaLiveAuthService = null;
    }
}

// ==========================================================
// Token Validation
// ==========================================================

/**
 * Result of DA.live token validation
 */
export interface DaLiveTokenValidationResult {
    /** Whether the token is valid */
    valid: boolean;
    /** Error message if validation failed */
    error?: string;
    /** Email extracted from token payload */
    email?: string;
    /** Token expiration timestamp (ms since epoch) */
    expiresAt?: number;
}

/**
 * Validate a DA.live JWT token
 *
 * Checks:
 * - JWT format (starts with "eyJ")
 * - Token expiry (if created_at and expires_in are present)
 * - Client ID (must be "darkalley" if present)
 *
 * Extracts:
 * - email (or preferred_username as fallback)
 * - expiresAt timestamp
 *
 * @param token - JWT token string to validate
 * @returns Validation result with extracted info
 */
export function validateDaLiveToken(token: string): DaLiveTokenValidationResult {
    // Check JWT format (must start with eyJ for valid base64-encoded JSON header)
    if (!token || !token.startsWith('eyJ')) {
        return {
            valid: false,
            error: 'Invalid token format. Please copy the complete token.',
        };
    }

    // Try to decode and validate the token
    try {
        const parts = token.split('.');
        if (parts.length >= 2) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

            // Extract email (prefer email field, fallback to preferred_username)
            const email = payload.email || payload.preferred_username;

            // Calculate expiry from created_at + expires_in
            let expiresAt: number | undefined;
            if (payload.created_at && payload.expires_in) {
                const createdAt = parseInt(payload.created_at, 10);
                const expiresIn = parseInt(payload.expires_in, 10);
                expiresAt = createdAt + expiresIn;

                // Check if token has expired
                if (Date.now() > expiresAt) {
                    return {
                        valid: false,
                        error: 'Token has expired. Please get a fresh token from DA.live.',
                    };
                }
            }

            // Verify it's a darkalley token (DA.live client)
            if (payload.client_id && payload.client_id !== 'darkalley') {
                return {
                    valid: false,
                    error: 'This token is not from DA.live. Please use the bookmarklet on da.live.',
                };
            }

            return {
                valid: true,
                email,
                expiresAt,
            };
        }
    } catch {
        // Token parsing failed, but format looks valid - continue without extracted info
        // This matches the original behavior where parsing errors don't invalidate the token
    }

    // Token format is valid but couldn't extract details
    return {
        valid: true,
    };
}
