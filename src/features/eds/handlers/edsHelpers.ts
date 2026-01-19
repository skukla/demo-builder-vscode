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
// DA.live Multi-Step Input Authentication
// ==========================================================

/**
 * Result of multi-step authentication flow
 */
export interface QuickPickAuthResult {
    success: boolean;
    cancelled?: boolean;
    email?: string;
    error?: string;
}

/**
 * Show multi-step input DA.live authentication flow
 *
 * Mirrors the wizard DA.live auth form with two input fields:
 * 1. Organization name input (with stored default)
 * 2. Token input (password-masked)
 * 3. Validates token format and verifies org access
 * 4. Stores token and org on success
 *
 * Used by both project dashboard and projects list for EDS reset operations.
 *
 * @param context - Handler context with extension context for token storage
 * @returns Promise with auth result (success/cancelled/error)
 */
export async function showDaLiveAuthQuickPick(
    context: HandlerContext,
): Promise<QuickPickAuthResult> {
    context.logger.info('[DA.live Auth] Starting multi-step authentication flow');

    // Get stored org name as default value for returning users
    const storedOrgName = context.context.globalState.get<string>('daLive.orgName') || '';

    // Step 1: Ask for organization name
    const orgName = await vscode.window.showInputBox({
        title: 'Sign in to DA.live (Step 1/2)',
        prompt: 'Enter your DA.live organization name',
        placeHolder: 'e.g., my-organization',
        value: storedOrgName,
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value?.trim()) {
                return 'Organization name is required';
            }
            // Basic validation: no spaces, reasonable characters
            if (!/^[a-zA-Z0-9_-]+$/.test(value.trim())) {
                return 'Organization name can only contain letters, numbers, hyphens, and underscores';
            }
            return null;
        },
    });

    // User cancelled
    if (orgName === undefined) {
        context.logger.info('[DA.live Auth] User cancelled at organization step');
        return { success: false, cancelled: true };
    }

    // Step 2a: Show info message with option to open DA.live
    const openDaLiveChoice = await vscode.window.showInformationMessage(
        'You\'ll need a token from DA.live. Click "Open DA.live" to get one, or continue if you already have it.',
        { modal: false },
        'Open DA.live',
        'I have my token',
    );

    // User dismissed the message (clicked X or pressed Escape)
    if (openDaLiveChoice === undefined) {
        context.logger.info('[DA.live Auth] User cancelled at token prompt');
        return { success: false, cancelled: true };
    }

    // Open DA.live if requested
    if (openDaLiveChoice === 'Open DA.live') {
        context.logger.debug('[DA.live Auth] Opening DA.live in browser');
        await vscode.env.openExternal(vscode.Uri.parse('https://da.live'));
    }

    // Step 2b: Ask for token (password-masked)
    const token = await vscode.window.showInputBox({
        title: 'Sign in to DA.live (Step 2/2)',
        prompt: 'Paste your DA.live token (use the bookmarklet on da.live to copy it)',
        placeHolder: 'Paste token here',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value?.trim()) {
                return 'Token is required';
            }
            if (!value.trim().startsWith('eyJ')) {
                return 'Invalid token format. Token should start with "eyJ"';
            }
            return null;
        },
    });

    // User cancelled
    if (token === undefined) {
        context.logger.info('[DA.live Auth] User cancelled at token step');
        return { success: false, cancelled: true };
    }

    // Show progress while validating
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Verifying DA.live credentials...',
            cancellable: false,
        },
        async () => {
            try {
                const trimmedToken = token.trim();
                const trimmedOrg = orgName.trim();

                // Validate token format
                const validation = validateDaLiveToken(trimmedToken);
                if (!validation.valid) {
                    context.logger.warn(`[DA.live Auth] Token validation failed: ${validation.error}`);
                    await vscode.window.showErrorMessage(validation.error!);
                    return { success: false, error: validation.error };
                }

                // Verify org access with the token
                context.logger.debug(`[DA.live Auth] Verifying org access: ${trimmedOrg}`);
                const orgResponse = await fetch(`https://admin.da.live/list/${trimmedOrg}/`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${trimmedToken}`,
                    },
                });

                if (orgResponse.status === 403) {
                    const error = `Access denied to organization "${trimmedOrg}". Please check the name or your permissions.`;
                    context.logger.warn(`[DA.live Auth] Org access denied: ${trimmedOrg}`);
                    await vscode.window.showErrorMessage(error);
                    return { success: false, error };
                }

                if (orgResponse.status === 404) {
                    const error = `Organization "${trimmedOrg}" not found. Please check the name.`;
                    context.logger.warn(`[DA.live Auth] Org not found: ${trimmedOrg}`);
                    await vscode.window.showErrorMessage(error);
                    return { success: false, error };
                }

                if (!orgResponse.ok) {
                    const error = `Failed to verify organization: ${orgResponse.status}`;
                    context.logger.error(`[DA.live Auth] Org verification failed: ${orgResponse.status}`);
                    await vscode.window.showErrorMessage(error);
                    return { success: false, error };
                }

                // Success! Store the token and org
                const tokenExpiry = validation.expiresAt || (Date.now() + 24 * 60 * 60 * 1000);
                await context.context.globalState.update('daLive.accessToken', trimmedToken);
                await context.context.globalState.update('daLive.tokenExpiration', tokenExpiry);
                await context.context.globalState.update('daLive.orgName', trimmedOrg);
                if (validation.email) {
                    await context.context.globalState.update('daLive.userEmail', validation.email);
                }
                await context.context.globalState.update('daLive.setupComplete', true);

                context.logger.info(`[DA.live Auth] Successfully authenticated to org: ${trimmedOrg}`);
                // Don't await - let the progress dismiss immediately and show success message briefly
                vscode.window.showInformationMessage(`Connected to DA.live (${trimmedOrg})`);

                return {
                    success: true,
                    email: validation.email,
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                context.logger.error(`[DA.live Auth] Authentication error: ${errorMessage}`);
                await vscode.window.showErrorMessage(`Authentication failed: ${errorMessage}`);
                return { success: false, error: errorMessage };
            }
        },
    );
}
