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
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { GitHubTokenService } from '../services/githubTokenService';
import { GitHubRepoOperations } from '../services/githubRepoOperations';
import { GitHubFileOperations } from '../services/githubFileOperations';
import { GitHubOAuthService } from '../services/githubOAuthService';
import { DaLiveOrgOperations, type TokenProvider } from '../services/daLiveOrgOperations';
import { DaLiveContentOperations } from '../services/daLiveContentOperations';
import { DaLiveAuthService } from '../services/daLiveAuthService';
import { DaLiveConfigService } from '../services/daLiveConfigService';
import { HelixService } from '../services/helixService';
import { getLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';

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
    // Initialize Helix key persistence alongside DA.live auth (idempotent)
    HelixService.initKeyStore(context.context.globalState);
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
// DA.live Default Org Tip
// ==========================================================

/**
 * Show a one-time tip offering to save the org name as a default setting.
 *
 * Only shown when:
 * - The config setting is not already set
 * - The tip has not been shown before (tracked via globalState)
 *
 * Non-blocking: uses fire-and-forget `.then()` so it never delays the caller.
 *
 * @param context - Handler context for globalState access
 * @param orgName - The verified org name to offer saving
 */
export function offerSaveDefaultOrg(
    context: HandlerContext,
    orgName: string,
): void {
    const config = vscode.workspace.getConfiguration('demoBuilder');
    const existingDefault = config.get<string>('daLive.defaultOrg', '');

    // Already configured — nothing to do
    if (existingDefault) {
        return;
    }

    const tipShown = context.context.globalState.get<boolean>('daLive.defaultOrgTipShown', false);
    if (tipShown) {
        return;
    }

    // Mark as shown immediately so concurrent calls don't double-fire
    context.context.globalState.update('daLive.defaultOrgTipShown', true);

    vscode.window.showInformationMessage(
        `Tip: Save "${orgName}" as your default DA.live org so it auto-fills next time.`,
        `Save "${orgName}"`,
        'Open Settings',
    ).then(selection => {
        if (selection === `Save "${orgName}"`) {
            config.update('daLive.defaultOrg', orgName, vscode.ConfigurationTarget.Global);
        } else if (selection === 'Open Settings') {
            vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'demoBuilder.daLive.defaultOrg',
            );
        }
    });
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
    const storedOrgName = context.context.globalState.get<string>('daLive.orgName')
        || vscode.workspace.getConfiguration('demoBuilder').get<string>('daLive.defaultOrg', '')
        || '';

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

                // Success! Store via service (handles all keys including setupComplete)
                const tokenExpiry = validation.expiresAt || (Date.now() + 24 * 60 * 60 * 1000);
                const authService = getDaLiveAuthService(context);
                await authService.storeToken(trimmedToken, {
                    expiresAt: tokenExpiry,
                    email: validation.email,
                    orgName: trimmedOrg,
                });

                context.logger.info(`[DA.live Auth] Successfully authenticated to org: ${trimmedOrg}`);
                // Auto-dismissing notification for non-blocking feedback
                vscode.window.setStatusBarMessage(`✅ Connected to DA.live (${trimmedOrg})`, TIMEOUTS.STATUS_BAR_INFO);

                // Offer to save org as default (one-time, non-blocking)
                offerSaveDefaultOrg(context, trimmedOrg);

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

// ==========================================================
// Bulk Publish Helpers
// ==========================================================

/**
 * Bulk preview and publish paths via Helix Admin API
 *
 * Use this for publishing multiple paths efficiently instead of looping
 * through individual previewAndPublishPage calls.
 *
 * Note: Cache purging should be done BEFORE calling this function via
 * helixService.purgeCacheAll() for reset/republish scenarios.
 *
 * @param helixService - HelixService instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param paths - Array of paths to preview and publish
 * @param logger - Logger instance
 */
export async function bulkPreviewAndPublish(
    helixService: HelixService,
    owner: string,
    repo: string,
    paths: string[],
    logger: Logger,
): Promise<void> {
    if (paths.length === 0) return;

    logger.debug(`[EDS] Bulk publishing ${paths.length} paths`);
    try {
        await helixService.previewAllContent(owner, repo, 'main', undefined, paths);
        await helixService.publishAllContent(owner, repo, 'main', undefined, paths);
    } catch (error) {
        logger.debug(`[EDS] Bulk publish failed: ${(error as Error).message}`);
        throw error;
    }
}

/**
 * Apply DA.live org config settings from extension settings.
 *
 * Reads the AEM Author URL and IMS Org ID from VS Code settings
 * (demoBuilder.daLive.aemAuthorUrl and demoBuilder.daLive.IMSOrgId)
 * and applies them to the DA.live site config sheet.
 *
 * This should be called from all EDS flows: creation, reset, edit, import, copy.
 * Non-fatal: logs warnings on failure but does not throw.
 */
export async function applyDaLiveOrgConfigSettings(
    daLiveContentOps: DaLiveContentOperations,
    daLiveOrg: string,
    daLiveSite: string,
    logger: Logger,
): Promise<void> {
    try {
        const edsSettings = vscode.workspace.getConfiguration('demoBuilder.daLive');
        const aemAuthorUrl = edsSettings.get<string>('aemAuthorUrl');
        const imsOrgId = edsSettings.get<string>('IMSOrgId');
        const editorPathPrefix = edsSettings.get<string>('editorPathPrefix') || 'site/to/path/content';

        // Nothing configured - skip silently
        if (!aemAuthorUrl && !imsOrgId) {
            return;
        }

        const configUpdates: Record<string, string> = {};

        if (aemAuthorUrl) {
            configUpdates['aem.repositoryId'] = aemAuthorUrl;
        }

        if (imsOrgId) {
            // Dummy path prefix prevents auto-redirect to UE (no real content matches it)
            // Full UE URL enables punch-out option from doc-based editing
            const editorPath = `${editorPathPrefix}=https://experience.adobe.com/#/@${imsOrgId}/aem/editor/canvas/main--${daLiveSite}--${daLiveOrg}.ue.da.live`;
            configUpdates['editor.path'] = editorPath;
        }

        const result = await daLiveContentOps.applyOrgConfig(daLiveOrg, configUpdates);

        if (result.success) {
            logger.info(`[EDS Config] Applied: ${Object.keys(configUpdates).join(', ')}`);
        } else {
            logger.warn(`[EDS Config] Failed to apply settings: ${result.error}`);
        }
    } catch (error) {
        logger.warn(`[EDS Config] Error: ${(error as Error).message}`);
    }
}

/**
 * Configure DA.live site permissions for the user.
 *
 * Grants the user CONFIG and content write permissions via DA.live Config API.
 * This enables Universal Editor access and site management capabilities.
 *
 * This should be called from all EDS flows: creation, reset, republish.
 * Non-fatal: logs warnings on failure but does not throw.
 *
 * @param tokenProvider - Token provider for DA.live API authentication
 * @param daLiveOrg - DA.live organization name
 * @param daLiveSite - DA.live site name
 * @param userEmail - User email to grant permissions to
 * @param logger - Logger instance
 * @returns Result with success status and optional error message
 */
export async function configureDaLivePermissions(
    tokenProvider: TokenProvider,
    daLiveOrg: string,
    daLiveSite: string,
    userEmail: string,
    logger: Logger,
): Promise<{ success: boolean; error?: string }> {
    try {
        const daLiveConfigService = new DaLiveConfigService(tokenProvider, logger);
        const result = await daLiveConfigService.grantUserAccess(
            daLiveOrg,
            daLiveSite,
            userEmail,
        );
        if (result.success) {
            logger.info(`[DaLivePermissions] Configured for ${userEmail}`);
        } else {
            logger.warn(`[DaLivePermissions] Warning: ${result.error}`);
        }
        return result;
    } catch (error) {
        const errorMessage = (error as Error).message;
        logger.warn(`[DaLivePermissions] Error: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
