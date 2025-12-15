/**
 * Authentication Handlers
 *
 * Handles Adobe authentication:
 * - check-auth: Quick authentication status check
 * - authenticate: Browser-based Adobe login flow
 */

import { sanitizeErrorForLogging } from '@/core/validation';
import { formatDuration, formatMinutes } from '@/core/utils';
import type { AdobeOrg, AdobeProject } from '@/features/authentication/services/types';
import type { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ErrorCode } from '@/types/errorCodes';
import { SimpleResult } from '@/types/results';
import { toError } from '@/types/typeGuards';

/**
 * Generate user-friendly sub-message for authentication status
 */
function getAuthSubMessage(
    orgLacksAccess: boolean,
    currentOrg: AdobeOrg | undefined,
): string {
    if (orgLacksAccess) {
        return 'Organization no longer accessible or lacks App Builder access';
    }
    if (currentOrg) {
        return `Connected to ${currentOrg.name || 'your organization'}`;
    }
    return 'Please complete authentication to continue';
}

/**
 * Check if current token is valid
 * Returns true if valid, false if expired/invalid
 * Logs errors and continues gracefully if check fails
 */
async function checkTokenExpiry(context: HandlerContext): Promise<boolean> {
    try {
        const tokenManager = context.authManager?.getTokenManager();
        const tokenInspection = await tokenManager?.inspectToken();

        if (tokenInspection && !tokenInspection.valid) {
            context.logger.warn('[Auth] Token expired or invalid, user must re-authenticate');
            return false;
        }

        context.logger.debug(`[Auth] Token valid, expires in ${formatMinutes(tokenInspection?.expiresIn || 0)}`);
        return true;
    } catch (error) {
        // Token inspection failed - log warning but continue (graceful degradation)
        context.logger.warn('[Auth] Token inspection failed, assuming valid', error as Error);
        return true; // Graceful degradation
    }
}

/**
 * check-auth - Check Adobe authentication status
 *
 * Performs a quick check of authentication status and retrieves
 * current organization/project context.
 */
export async function handleCheckAuth(context: HandlerContext): Promise<SimpleResult> {
    const checkStartTime = Date.now();
    context.logger.debug('[Auth] Starting authentication check (quick mode for wizard)');
    context.logger.debug('[Auth] User initiated authentication check');

    // Step 1: Initial check with user-friendly message
    await context.sendMessage('auth-status', {
        isChecking: true,
        message: 'Checking authentication status...',
        subMessage: 'Validating authorization token...',
        // Don't set isAuthenticated here - leave it undefined while checking
    });

    try {
        // Use token-only auth check for faster wizard experience (2-3s vs 9+ seconds for full validation)
        const isAuthenticated = await context.authManager?.isAuthenticated();
        const checkDuration = Date.now() - checkStartTime;

        // Check token expiry to warn user if token is about to expire
        let tokenExpiresIn: number | undefined;
        let tokenExpiringSoon = false;
        if (isAuthenticated) {
            try {
                const tokenManager = context.authManager?.getTokenManager();
                if (tokenManager) {
                    const tokenInspection = await tokenManager.inspectToken();
                    if (tokenInspection) {
                        tokenExpiresIn = tokenInspection.expiresIn;
                        tokenExpiringSoon = tokenInspection.expiresIn < 5; // Less than 5 minutes

                        if (tokenExpiringSoon) {
                            context.logger.warn(`[Auth] Token expires in ${formatMinutes(tokenExpiresIn)} - user should re-authenticate`);
                        }
                    }
                }
            } catch {
                // Token inspection failed - non-critical, continue without expiry warning
            }
        }

        context.logger.debug(`[Auth] Check complete in ${formatDuration(checkDuration)}: authenticated=${isAuthenticated}${tokenExpiresIn ? `, expires in ${formatMinutes(tokenExpiresIn)}` : ''}`);

        // Get org/project context (check cache first, then Adobe CLI if cache miss)
        let currentOrg: AdobeOrg | undefined;
        let currentProject: AdobeProject | undefined;

        if (isAuthenticated) {
            // Check cache first (fast - no API calls)
            currentOrg = context.authManager?.getCachedOrganization();
            currentProject = context.authManager?.getCachedProject();

            // If cache is empty, read from Adobe CLI (persists across extension restarts)
            if (!currentOrg) {
                currentOrg = await context.authManager?.getCurrentOrganization();
                currentProject = await context.authManager?.getCurrentProject();
            } else {
                // Don't show cached org if validation failed
                const validation = context.authManager?.getValidationCache();

                if (validation) {
                    const orgIdentifier = currentOrg.code || currentOrg.name;

                    if (validation.org === orgIdentifier && !validation.isValid) {
                        // Cached org known to be invalid - don't show it
                        currentOrg = undefined;
                        currentProject = undefined;
                    }
                } else {
                    // No validation cache - show org from cache (validation deferred until org is used)
                    context.logger.debug(`[Auth] Using cached organization: ${currentOrg.name}`);
                }
            }
        }

        // Determine final status with user-friendly messaging
        let message: string;
        let subMessage: string | undefined;
        const requiresOrgSelection = false;
        const orgLacksAccess = false;

        if (isAuthenticated) {
            // Show cached org if available (good UX), otherwise generic message
            if (currentOrg) {
                message = 'Authentication verified';
                subMessage = `Signed in as ${currentOrg.name}`;
            } else {
                message = 'Authentication verified';
                subMessage = 'Organization selection required';
            }
        } else {
            message = 'Not signed in';
            subMessage = 'Sign in with your Adobe account to continue';
        }

        // Log the final status message
        context.logger.debug(`[Auth] ${message}${subMessage ? ' - ' + subMessage : ''}`);

        await context.sendMessage('auth-status', {
            authenticated: isAuthenticated,
            isAuthenticated: isAuthenticated,
            isChecking: false,
            organization: currentOrg,
            project: currentProject,
            message,
            subMessage,
            requiresOrgSelection,
            orgLacksAccess,
            tokenExpiresIn, // Minutes until token expires
            tokenExpiringSoon, // True if < 5 minutes remaining
        });

        return { success: true };
    } catch (error) {
        const checkDuration = Date.now() - checkStartTime;
        context.logger.error(`[Auth] Failed to check auth after ${formatDuration(checkDuration)}:`, error as Error);

        await context.sendMessage('auth-status', {
            authenticated: false,
            isAuthenticated: false,
            isChecking: false,
            error: true,
            code: ErrorCode.NETWORK,
            message: 'Connection problem',
            subMessage: 'Can\'t reach Adobe services. Check your internet connection and try again.',
        });

        return { success: false, code: ErrorCode.NETWORK };
    }
}

/**
 * authenticate - Perform Adobe authentication
 *
 * Initiates browser-based Adobe login flow. Uses constant message during loading
 * (only subMessage changes) to prevent LoadingDisplay flickering.
 */
const AUTH_LOADING_MESSAGE = 'Signing in...';

export async function handleAuthenticate(
    context: HandlerContext,
    payload?: { force?: boolean },
): Promise<SimpleResult> {
    const force = payload?.force || false;

    if (context.sharedState.isAuthenticating) {
        context.logger.warn('[Auth] Authentication already in progress, ignoring duplicate request');
        return { success: false, code: ErrorCode.CANCELLED };
    }

    const authStartTime = Date.now();

    try {
        context.sharedState.isAuthenticating = true;

        // If not forcing, check if already authenticated
        if (!force) {
            context.logger.debug('[Auth] Checking for existing valid authentication (token-only)...');
            // Use token-only check to avoid 9+ second delay before showing browser
            const isAlreadyAuth = await context.authManager?.isAuthenticated();

            if (isAlreadyAuth) {
                context.logger.debug('[Auth] Already authenticated, skipping login');

                // Send loading message while we verify credentials and initialize SDK
                await context.sendMessage('auth-status', {
                    isChecking: true,
                    message: 'Verifying authentication...',
                    subMessage: 'Checking Adobe credentials...',
                    isAuthenticated: true, // Shows authenticated during check
                });

                // Initialize SDK for faster org/project operations
                await context.authManager?.ensureSDKInitialized();

                // Get the current context
                const currentOrg = await context.authManager?.getCurrentOrganization();
                const currentProject = await context.authManager?.getCurrentProject();

                // Now done checking
                context.sharedState.isAuthenticating = false;

                // Check if org was cleared due to validation failure
                const orgLacksAccess = !currentOrg ? context.authManager?.wasOrgClearedDueToValidation() : false;

                await context.sendMessage('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: currentOrg,
                    project: currentProject,
                    message: orgLacksAccess ? 'Organization selection required' : 'Already signed in',
                    subMessage: getAuthSubMessage(!!orgLacksAccess, currentOrg),
                    requiresOrgSelection: !currentOrg,
                    orgLacksAccess,
                });
                return { success: true };
            }
        }

        context.logger.debug(`[Auth] Starting Adobe authentication process${force ? ' (forced)' : ''} - opening browser...`);

        // Start authentication - pass force flag to authManager
        context.logger.debug(`[Auth] Initiating browser-based login${force ? ' with force flag' : ''}`);

        // Show "opening browser" message immediately to inform user
        // Use constant message, vary only subMessage
        await context.sendMessage('auth-status', {
            isChecking: true,
            message: AUTH_LOADING_MESSAGE,
            subMessage: force ? 'Starting fresh login...' : 'Opening browser...',
            isAuthenticated: false,
        });

        // Start login process
        const loginSuccess = await context.authManager?.login(force);

        const loginDuration = Date.now() - authStartTime;
        context.sharedState.isAuthenticating = false;

        if (loginSuccess) {
            context.logger.info(`[Auth] Authentication completed successfully after ${formatDuration(loginDuration)}`);

            const setupStart = Date.now();
            let currentOrg: AdobeOrg | undefined;
            let currentProject: AdobeProject | undefined;
            let requiresOrgSelection = false;
            let orgLacksAccess = false;

            try {
                // STEP 2 FIX: Check token expiry BEFORE fetching organizations
                const tokenValid = await checkTokenExpiry(context);

                if (!tokenValid) {
                    // Token expired or invalid - send clear message
                    context.sharedState.isAuthenticating = false;

                    await context.sendMessage('auth-status', {
                        authenticated: false,
                        isAuthenticated: false,
                        isChecking: false,
                        code: ErrorCode.AUTH_REQUIRED,
                        message: 'Session expired',
                        subMessage: 'Please sign in again to continue',
                        requiresOrgSelection: true,
                        orgLacksAccess: false,
                    });

                    return { success: false, code: ErrorCode.AUTH_REQUIRED };
                }

                // Token is valid (or inspection failed but we continue) - proceed with org fetch
                context.logger.debug('[Auth] Fetching organizations after login');

                // Initialize SDK for faster operations (token stable after login)
                await context.authManager?.ensureSDKInitialized();
                await context.sendMessage('auth-status', {
                    isChecking: true,
                    message: AUTH_LOADING_MESSAGE,
                    subMessage: 'Loading organizations...',
                    isAuthenticated: true,
                });

                // Fetch organization list (uses SDK if available, falls back to CLI)
                const orgs = await context.authManager?.getOrganizations();
                context.logger.debug(`[Auth] Found ${orgs?.length ?? 0} organization(s) accessible to user`);

                if (orgs?.length === 1) {
                    // Auto-select single org
                    context.logger.debug(`[Auth] Single organization available: ${orgs?.[0].name}, auto-selecting`);
                    await context.sendMessage('auth-status', {
                        isChecking: true,
                        message: AUTH_LOADING_MESSAGE,
                        subMessage: 'Selecting organization...',
                        isAuthenticated: true,
                    });

                    const selected = await context.authManager?.selectOrganization(orgs?.[0].id);

                    if (selected) {
                        currentOrg = orgs?.[0];
                        context.authManager?.setCachedOrganization(currentOrg);
                        context.logger.info(`[Auth] Successfully auto-selected and cached organization: ${orgs?.[0].name}`);
                    } else {
                        context.logger.warn(`[Auth] Failed to auto-select organization: ${orgs?.[0].name}`);
                        requiresOrgSelection = true;
                    }
                } else if (orgs && orgs.length > 1) {
                    context.logger.debug(`[Auth] ${orgs?.length} organizations available, user must select`);
                    requiresOrgSelection = true;
                } else {
                    context.logger.warn('[Auth] No organizations accessible for this user');
                    requiresOrgSelection = true;
                    orgLacksAccess = true;
                }
            } catch (error) {
                context.logger.error('[Auth] Failed to fetch organizations:', error as Error);
                requiresOrgSelection = true;
            }

            // Log total post-login setup time
            const totalSetupTime = Date.now() - setupStart;
            context.logger.debug(`[Auth] Post-login setup completed in ${formatDuration(totalSetupTime)}`);

            // Send appropriate status message based on org selection outcome
            if (orgLacksAccess) {
                await context.sendMessage('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: undefined,
                    project: undefined,
                    message: 'No organizations found',
                    subMessage: 'Your Adobe account doesn\'t have access to any organizations with App Builder',
                    requiresOrgSelection: true,
                    orgLacksAccess: true,
                });
            } else if (requiresOrgSelection) {
                await context.sendMessage('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: undefined,
                    project: undefined,
                    message: 'Sign-in complete',
                    subMessage: 'Choose your organization to continue',
                    requiresOrgSelection: true,
                    orgLacksAccess: false,
                });
            } else {
                // Successfully auto-selected org
                await context.sendMessage('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: currentOrg,
                    project: currentProject,
                    message: 'All set!',
                    subMessage: currentOrg ? `Connected to ${currentOrg.name}` : 'Authentication verified',
                    requiresOrgSelection: false,
                    orgLacksAccess: false,
                });
            }

            return { success: true };
        } else {
            context.logger.warn(`[Auth] Authentication timed out after ${formatDuration(loginDuration)}`);

            await context.sendMessage('auth-status', {
                authenticated: false,
                isAuthenticated: false,
                isChecking: false,
                error: 'timeout',
                code: ErrorCode.TIMEOUT,
                message: 'Sign-in timed out',
                subMessage: 'The browser window may have been closed. Please try again.',
            });

            return { success: false, code: ErrorCode.TIMEOUT };
        }

    } catch (error) {
        const failDuration = Date.now() - authStartTime;
        context.sharedState.isAuthenticating = false;

        context.logger.error(`[Auth] Failed to start authentication after ${formatDuration(failDuration)}:`, error as Error);

        // SECURITY: Never expose internal state details to UI - use generic message
        await context.sendMessage('authError', {
            error: 'Authentication failed',
            code: ErrorCode.UNKNOWN,
        });

        return { success: false, code: ErrorCode.UNKNOWN };
    }
}
