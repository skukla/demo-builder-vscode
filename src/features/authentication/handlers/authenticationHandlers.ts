/**
 * Authentication Handlers
 *
 * Handles Adobe authentication:
 * - check-auth: Quick authentication status check
 * - authenticate: Browser-based Adobe login flow
 */

import { toError } from '@/types/typeGuards';
import { SimpleResult } from '@/types/results';
import type { AdobeOrg, AdobeProject } from '@/features/authentication/services/types';
import type { HandlerContext } from '@/features/project-creation/handlers/HandlerContext';
import { sanitizeErrorForLogging } from '@/core/validation/securityValidation';

/**
 * check-auth - Check Adobe authentication status
 *
 * Performs a quick check of authentication status and retrieves
 * current organization/project context.
 */
export async function handleCheckAuth(context: HandlerContext): Promise<SimpleResult> {
    const checkStartTime = Date.now();
    context.logger.debug('[Auth] Starting authentication check (quick mode for wizard)');
    context.logger.info('[Auth] User initiated authentication check');

    // Step 1: Initial check with user-friendly message
    await context.sendMessage('auth-status', {
        isChecking: true,
        message: 'Checking authentication status...',
        subMessage: 'Validating authorization token...',
        // Don't set isAuthenticated here - leave it undefined while checking
    });

    try {
        // Use quick auth check for faster wizard experience (< 1 second vs 9+ seconds)
        const isAuthenticated = await context.authManager.isAuthenticatedQuick();
        const checkDuration = Date.now() - checkStartTime;

        context.logger.info(`[Auth] Quick authentication check completed in ${checkDuration}ms: ${isAuthenticated}`);

        // Get cached org/project if available (fast - no fetch or CLI calls)
        let currentOrg: AdobeOrg | undefined;
        let currentProject: AdobeProject | undefined;

        if (isAuthenticated) {
            // Check cache only (no fetch, no CLI calls)
            currentOrg = context.authManager.getCachedOrganization();
            currentProject = context.authManager.getCachedProject();

            // Don't show cached org if validation failed
            if (currentOrg) {
                const validation = context.authManager.getValidationCache();

                if (validation) {
                    // Check if this is the same org that was validated
                    const orgIdentifier = currentOrg.code || currentOrg.name;

                    if (validation.org === orgIdentifier) {
                        if (!validation.isValid) {
                            // Cached org known to be invalid - don't show it
                            context.logger.debug(`[Auth] Cached org "${currentOrg.name}" failed validation, not showing`);
                            currentOrg = undefined;
                            currentProject = undefined; // Clear project too
                        } else {
                            context.logger.debug(`[Auth] Using cached organization: ${currentOrg.name} (validated)`);
                        }
                    } else {
                        // Different org than what was validated - show it from cache
                        context.logger.debug(`[Auth] Using cached organization: ${currentOrg.name}`);
                    }
                } else {
                    // No validation cache - show org from cache (validation deferred until org is used)
                    context.logger.debug(`[Auth] Using cached organization: ${currentOrg.name}`);
                }
            } else {
                context.logger.debug('[Auth] No cached organization available');
            }
        }

        // Determine final status with user-friendly messaging
        let message: string;
        let subMessage: string | undefined;
        let requiresOrgSelection = false;
        let orgLacksAccess = false;

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
        context.logger.info(`[Auth] ${message}${subMessage ? ' - ' + subMessage : ''}`);

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
        });

        return { success: true };
    } catch (error) {
        const checkDuration = Date.now() - checkStartTime;
        context.logger.error(`[Auth] Failed to check auth after ${checkDuration}ms:`, error as Error);

        await context.sendMessage('auth-status', {
            authenticated: false,
            isAuthenticated: false,
            isChecking: false,
            error: true,
            message: 'Connection problem',
            subMessage: 'Can\'t reach Adobe services. Check your internet connection and try again.',
        });

        return { success: false };
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
        return { success: false };
    }

    const authStartTime = Date.now();

    try {
        context.sharedState.isAuthenticating = true;

        // If not forcing, check if already authenticated
        if (!force) {
            context.logger.debug('[Auth] Checking for existing valid authentication (quick mode)...');
            // Use quick check to avoid 9+ second delay before showing browser
            const isAlreadyAuth = await context.authManager.isAuthenticatedQuick();

            if (isAlreadyAuth) {
                context.logger.info('[Auth] Already authenticated, skipping login');
                context.sharedState.isAuthenticating = false;

                // Initialize SDK for faster org/project operations
                await context.authManager.ensureSDKInitialized();

                // Get the current context
                const currentOrg = await context.authManager.getCurrentOrganization();
                const currentProject = await context.authManager.getCurrentProject();

                // Check if org was cleared due to validation failure
                const orgLacksAccess = !currentOrg ? context.authManager.wasOrgClearedDueToValidation() : false;

                await context.sendMessage('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: currentOrg,
                    project: currentProject,
                    message: orgLacksAccess ? 'Organization selection required' : 'Already signed in',
                    subMessage: orgLacksAccess
                        ? 'Organization no longer accessible or lacks App Builder access'
                        : currentOrg ? `Connected to ${currentOrg?.name || 'your organization'}` : 'Please complete authentication to continue',
                    requiresOrgSelection: !currentOrg,
                    orgLacksAccess,
                });
                return { success: true };
            }
        }

        context.logger.info(`[Auth] Starting Adobe authentication process${force ? ' (forced)' : ''} - opening browser...`);

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
        const loginSuccess = await context.authManager.login(force);

        const loginDuration = Date.now() - authStartTime;
        context.sharedState.isAuthenticating = false;

        if (loginSuccess) {
            context.logger.info(`[Auth] Authentication completed successfully after ${loginDuration}ms`);
            context.logger.info('[Auth] Fetching organizations after login');

            const setupStart = Date.now();
            let currentOrg: AdobeOrg | undefined;
            let currentProject: AdobeProject | undefined;
            let requiresOrgSelection = false;
            let orgLacksAccess = false;

            try {
                // Initialize SDK for faster operations (token stable after login)
                context.logger.debug('[Auth] Ensuring SDK is initialized for org fetching');
                await context.authManager.ensureSDKInitialized();
                await context.sendMessage('auth-status', {
                    isChecking: true,
                    message: AUTH_LOADING_MESSAGE,
                    subMessage: 'Loading organizations...',
                    isAuthenticated: true,
                });

                // Fetch organization list (uses SDK if available, falls back to CLI)
                context.logger.debug('[Auth] Fetching available organizations');
                const orgs = await context.authManager.getOrganizations();
                context.logger.info(`[Auth] Found ${orgs.length} organization(s) accessible to user`);

                if (orgs.length === 1) {
                    // Auto-select single org
                    context.logger.info(`[Auth] Single organization available: ${orgs[0].name}, auto-selecting`);
                    await context.sendMessage('auth-status', {
                        isChecking: true,
                        message: AUTH_LOADING_MESSAGE,
                        subMessage: 'Selecting organization...',
                        isAuthenticated: true,
                    });

                    const selected = await context.authManager.selectOrganization(orgs[0].id);

                    if (selected) {
                        currentOrg = orgs[0];
                        context.authManager.setCachedOrganization(currentOrg);
                        context.logger.info(`[Auth] Successfully auto-selected and cached organization: ${orgs[0].name}`);
                    } else {
                        context.logger.warn(`[Auth] Failed to auto-select organization: ${orgs[0].name}`);
                        requiresOrgSelection = true;
                    }
                } else if (orgs.length > 1) {
                    context.logger.info(`[Auth] ${orgs.length} organizations available, user must select`);
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
            context.logger.info(`[Auth] Post-login setup completed in ${totalSetupTime}ms`);

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
            context.logger.warn(`[Auth] Authentication timed out after ${loginDuration}ms`);

            await context.sendMessage('auth-status', {
                authenticated: false,
                isAuthenticated: false,
                isChecking: false,
                error: 'timeout',
                message: 'Sign-in timed out',
                subMessage: 'The browser window may have been closed. Please try again.',
            });

            return { success: false };
        }

    } catch (error) {
        const failDuration = Date.now() - authStartTime;
        context.sharedState.isAuthenticating = false;

        context.logger.error(`[Auth] Failed to start authentication after ${failDuration}ms:`, error as Error);

        // SECURITY: Sanitize error message before sending to UI to prevent information disclosure
        const sanitizedError = sanitizeErrorForLogging(toError(error));

        await context.sendMessage('authError', {
            error: sanitizedError,
        });

        return { success: false };
    }
}
