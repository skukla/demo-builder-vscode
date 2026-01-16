/**
 * EDS Helpers
 *
 * Helper functions for EDS handlers, extracted from edsHandlers.ts for better modularity.
 *
 * Contains:
 * - Service instance cache management (getGitHubServices, getDaLiveServices, getDaLiveAuthService)
 * - clearServiceCache for cleanup
 * - validateDaLiveToken for JWT validation
 * - showDaLiveAuthQuickPick for dashboard re-authentication
 *
 * @module features/eds/handlers/edsHelpers
 */

import * as vscode from 'vscode';
import type { HandlerContext } from '@/types/handlers';
import { GitHubTokenService } from '../services/githubTokenService';
import { GitHubRepoOperations } from '../services/githubRepoOperations';
import { GitHubFileOperations } from '../services/githubFileOperations';
import { GitHubOAuthService } from '../services/githubOAuthService';
import { DaLiveOrgOperations, type TokenProvider } from '../services/daLiveOrgOperations';
import { DaLiveContentOperations } from '../services/daLiveContentOperations';
import { DaLiveAuthService } from '../services/daLiveAuthService';
import { getLogger } from '@/core/logging';

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
    const logger = getLogger();
    if (!cachedGitHubServices) {
        logger.debug('[EDS:ServiceCache] Creating NEW GitHub services (no cache)');
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
        logger.debug('[EDS:ServiceCache] GitHub services created and cached');
    } else {
        logger.debug('[EDS:ServiceCache] Returning CACHED GitHub services');
    }
    return cachedGitHubServices;
}

/**
 * Get or create DA.live services
 * Returns all DA.live-related services with explicit dependencies
 */
export function getDaLiveServices(context: HandlerContext): DaLiveServices {
    const logger = getLogger();
    if (!cachedDaLiveServices) {
        logger.debug('[EDS:ServiceCache] Creating NEW DA.live services (no cache)');
        if (!context.authManager) {
            throw new Error('Authentication service not available');
        }

        // Create token provider adapter from AuthenticationService
        const tokenProvider: TokenProvider = {
            getAccessToken: async () => {
                const tokenManager = context.authManager!.getTokenManager();
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
        logger.debug('[EDS:ServiceCache] DA.live services created and cached');
    } else {
        logger.debug('[EDS:ServiceCache] Returning CACHED DA.live services');
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
    const logger = getLogger();
    logger.debug('[EDS:ServiceCache] CLEARING all service caches', {
        hadGitHubServices: !!cachedGitHubServices,
        hadDaLiveServices: !!cachedDaLiveServices,
        hadDaLiveAuthService: !!cachedDaLiveAuthService,
        timestamp: new Date().toISOString(),
    });
    cachedGitHubServices = null;
    cachedDaLiveServices = null;
    if (cachedDaLiveAuthService) {
        cachedDaLiveAuthService.dispose();
        cachedDaLiveAuthService = null;
    }
    logger.debug('[EDS:ServiceCache] All service caches cleared');
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

// ==========================================================
// DA.live QuickPick Authentication
// ==========================================================

/**
 * Result of QuickPick authentication flow
 */
export interface QuickPickAuthResult {
    success: boolean;
    cancelled?: boolean;
    email?: string;
    error?: string;
}

/**
 * QuickPick item with ID for selection handling
 */
interface DaLiveQuickPickItem extends vscode.QuickPickItem {
    id: 'open' | 'paste';
}

/**
 * Show QuickPick-based DA.live authentication flow
 *
 * Mirrors the wizard DA.live auth experience:
 * 1. User can open DA.live to get token via bookmarklet
 * 2. User can paste token from clipboard
 * 3. Token is validated and stored
 *
 * Used by both project dashboard and projects list for EDS reset operations.
 *
 * @param context - Handler context with extension context for token storage
 * @returns Promise with auth result (success/cancelled/error)
 */
export async function showDaLiveAuthQuickPick(
    context: HandlerContext,
): Promise<QuickPickAuthResult> {
    return new Promise((resolve) => {
        const quickPick = vscode.window.createQuickPick<DaLiveQuickPickItem>();

        // Configure QuickPick - use wizard language
        quickPick.title = 'Sign in to DA.live';
        quickPick.placeholder = 'Select an action to authenticate with DA.live';
        quickPick.items = [
            {
                id: 'open',
                label: '$(link-external) Open DA.live',
                description: 'Open DA.live in browser to copy token',
            },
            {
                id: 'paste',
                label: '$(clippy) Paste from Clipboard',
                description: 'Paste token copied from DA.live',
            },
        ];

        let isResolved = false;

        // Handle item selection
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            if (!selected) return;

            if (selected.id === 'open') {
                // Open DA.live in browser - don't close QuickPick
                await vscode.env.openExternal(vscode.Uri.parse('https://da.live'));
                // Keep QuickPick open so user can paste after copying token
                return;
            }

            if (selected.id === 'paste') {
                // Show busy state - wizard language
                quickPick.busy = true;
                quickPick.placeholder = 'Verifying...';

                try {
                    // Read token from clipboard
                    const token = await vscode.env.clipboard.readText();

                    if (!token || token.trim() === '') {
                        quickPick.busy = false;
                        quickPick.placeholder = 'Select an action to authenticate with DA.live';
                        await vscode.window.showErrorMessage(
                            'No token found on clipboard. Copy token from DA.live first.',
                        );
                        return;
                    }

                    // Validate token
                    const validation = validateDaLiveToken(token.trim());

                    if (!validation.valid) {
                        quickPick.busy = false;
                        quickPick.placeholder = 'Select an action to authenticate with DA.live';
                        await vscode.window.showErrorMessage(validation.error!);
                        // Keep QuickPick open for retry
                        return;
                    }

                    // Store valid token
                    const authService = getDaLiveAuthService(context);
                    await authService.storeToken(token.trim());

                    // Success - wizard language
                    await vscode.window.showInformationMessage('Connected to DA.live');

                    isResolved = true;
                    quickPick.hide();
                    quickPick.dispose();

                    resolve({
                        success: true,
                        email: validation.email,
                    });
                } catch (error) {
                    quickPick.busy = false;
                    quickPick.placeholder = 'Select an action to authenticate with DA.live';
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    context.logger.error(`[DA.live Auth] QuickPick error: ${errorMessage}`);
                    await vscode.window.showErrorMessage(`Authentication failed: ${errorMessage}`);
                }
            }
        });

        // Handle dismissal (Escape key or click outside)
        quickPick.onDidHide(() => {
            if (!isResolved) {
                context.logger.info('[DA.live Auth] User cancelled QuickPick authentication');
                quickPick.dispose();
                resolve({
                    success: false,
                    cancelled: true,
                });
            }
        });

        // Show the QuickPick
        quickPick.show();
    });
}
