/**
 * Authentication Handlers
 *
 * Handles Adobe authentication:
 * - check-auth: Quick authentication status check
 * - authenticate: Browser-based Adobe login flow
 */

import type { HandlerContext } from '@/commands/handlers/HandlerContext';
import { formatDuration, formatMinutes } from '@/core/utils';
import type { AdobeOrg, AdobeProject } from '@/features/authentication/services/types';
import { ErrorCode } from '@/types/errorCodes';
import { SimpleResult } from '@/types/results';

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
 * Get token expiry information for the current session
 */
async function getTokenExpiryInfo(
    context: HandlerContext,
): Promise<{ tokenExpiresIn: number | undefined; tokenExpiringSoon: boolean }> {
    try {
        const tokenManager = context.authManager?.getTokenManager();
        const tokenInspection = await tokenManager?.inspectToken();
        if (!tokenInspection) {
            return { tokenExpiresIn: undefined, tokenExpiringSoon: false };
        }

        const tokenExpiresIn = tokenInspection.expiresIn;
        const tokenExpiringSoon = tokenExpiresIn < 5;

        if (tokenExpiringSoon) {
            context.logger.warn(`[Auth] Token expires in ${formatMinutes(tokenExpiresIn)} - user should re-authenticate`);
        }

        return { tokenExpiresIn, tokenExpiringSoon };
    } catch {
        return { tokenExpiresIn: undefined, tokenExpiringSoon: false };
    }
}

/**
 * Get current org/project context from cache or CLI
 */
/**
 * Check if cached org is invalidated by validation cache
 */
function isCachedOrgInvalid(context: HandlerContext, org: AdobeOrg): boolean {
    const validation = context.authManager?.getValidationCache();
    if (!validation) return false;
    const orgIdentifier = org.code || org.name;
    return validation.org === orgIdentifier && !validation.isValid;
}

/**
 * Get current org/project context from cache or CLI
 */
async function getAuthContext(
    context: HandlerContext,
): Promise<{ currentOrg?: AdobeOrg; currentProject?: AdobeProject }> {
    // Check cache first (fast - no API calls)
    const cachedOrg = context.authManager?.getCachedOrganization();
    const cachedProject = context.authManager?.getCachedProject();

    // If cache is empty, read from Adobe CLI (persists across extension restarts)
    if (!cachedOrg) {
        const currentOrg = await context.authManager?.getCurrentOrganization();
        const currentProject = await context.authManager?.getCurrentProject();
        return { currentOrg, currentProject };
    }

    // Don't show cached org if validation failed
    if (isCachedOrgInvalid(context, cachedOrg)) {
        return { currentOrg: undefined, currentProject: undefined };
    }

    context.logger.debug(`[Auth] Using cached organization: ${cachedOrg.name}`);
    return { currentOrg: cachedOrg, currentProject: cachedProject };
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
        const { tokenExpiresIn, tokenExpiringSoon } = isAuthenticated
            ? await getTokenExpiryInfo(context)
            : { tokenExpiresIn: undefined, tokenExpiringSoon: false };

        context.logger.debug(`[Auth] Check complete in ${formatDuration(checkDuration)}: authenticated=${isAuthenticated}${tokenExpiresIn ? `, expires in ${formatMinutes(tokenExpiresIn)}` : ''}`);

        // Get org/project context (check cache first, then Adobe CLI if cache miss)
        const { currentOrg, currentProject } = isAuthenticated
            ? await getAuthContext(context)
            : { currentOrg: undefined, currentProject: undefined };

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
 * Post-login org resolution result
 */
interface PostLoginOrgResult {
    currentOrg?: AdobeOrg;
    currentProject?: AdobeProject;
    requiresOrgSelection: boolean;
    orgLacksAccess: boolean;
}

/**
 * Resolve organization after successful login
 */
async function resolvePostLoginOrg(context: HandlerContext): Promise<PostLoginOrgResult | null> {
    // Check token expiry BEFORE fetching organizations
    const tokenValid = await checkTokenExpiry(context);
    if (!tokenValid) return null;

    context.logger.debug('[Auth] Fetching organizations after login');
    await context.authManager?.ensureSDKInitialized();
    await context.sendMessage('auth-status', {
        isChecking: true,
        message: 'Signing in...',
        subMessage: 'Loading organizations...',
        isAuthenticated: true,
    });

    const orgs = await context.authManager?.getOrganizations();
    context.logger.debug(`[Auth] Found ${orgs?.length ?? 0} organization(s) accessible to user`);

    if (orgs?.length === 1) {
        return autoSelectSingleOrg(context, orgs[0]);
    }

    if (orgs && orgs.length > 1) {
        context.logger.debug(`[Auth] ${orgs.length} organizations available, user must select`);
        return { requiresOrgSelection: true, orgLacksAccess: false };
    }

    context.logger.warn('[Auth] No organizations accessible for this user');
    return { requiresOrgSelection: true, orgLacksAccess: true };
}

/**
 * Auto-select a single available organization
 */
async function autoSelectSingleOrg(
    context: HandlerContext,
    org: AdobeOrg,
): Promise<PostLoginOrgResult> {
    context.logger.debug(`[Auth] Single organization available: ${org.name}, auto-selecting`);
    await context.sendMessage('auth-status', {
        isChecking: true,
        message: 'Signing in...',
        subMessage: 'Selecting organization...',
        isAuthenticated: true,
    });

    const selected = await context.authManager?.selectOrganization(org.id);
    if (selected) {
        context.authManager?.setCachedOrganization(org);
        context.logger.debug(`[Auth] Successfully auto-selected and cached organization: ${org.name}`);
        return { currentOrg: org, requiresOrgSelection: false, orgLacksAccess: false };
    }

    context.logger.warn(`[Auth] Failed to auto-select organization: ${org.name}`);
    return { requiresOrgSelection: true, orgLacksAccess: false };
}

/**
 * Send post-login auth status message based on org resolution result
 */
async function sendPostLoginStatus(
    context: HandlerContext,
    result: PostLoginOrgResult,
): Promise<void> {
    if (result.orgLacksAccess) {
        await context.sendMessage('auth-status', {
            authenticated: true, isAuthenticated: true, isChecking: false,
            organization: undefined, project: undefined,
            message: 'No organizations found',
            subMessage: 'Your Adobe account doesn\'t have access to any organizations with App Builder',
            requiresOrgSelection: true, orgLacksAccess: true,
        });
    } else if (result.requiresOrgSelection) {
        await context.sendMessage('auth-status', {
            authenticated: true, isAuthenticated: true, isChecking: false,
            organization: undefined, project: undefined,
            message: 'Sign-in complete',
            subMessage: 'Choose your organization to continue',
            requiresOrgSelection: true, orgLacksAccess: false,
        });
    } else {
        await context.sendMessage('auth-status', {
            authenticated: true, isAuthenticated: true, isChecking: false,
            organization: result.currentOrg, project: result.currentProject,
            message: 'All set!',
            subMessage: result.currentOrg ? `Connected to ${result.currentOrg.name}` : 'Authentication verified',
            requiresOrgSelection: false, orgLacksAccess: false,
        });
    }
}

/**
 * authenticate - Perform Adobe authentication
 *
 * Initiates browser-based Adobe login flow. Uses constant message during loading
 * (only subMessage changes) to prevent LoadingDisplay flickering.
 */
const AUTH_LOADING_MESSAGE = 'Signing in...';

/**
 * Handle successful login - resolve orgs and send status
 */
async function handleLoginSuccess(
    context: HandlerContext,
    loginDuration: number,
): Promise<SimpleResult> {
    context.logger.info(`[Auth] Authentication completed successfully after ${formatDuration(loginDuration)}`);

    const setupStart = Date.now();
    let orgResult: PostLoginOrgResult = { requiresOrgSelection: true, orgLacksAccess: false };

    try {
        const resolved = await resolvePostLoginOrg(context);
        if (!resolved) {
            context.sharedState.isAuthenticating = false;
            await context.sendMessage('auth-status', {
                authenticated: false, isAuthenticated: false, isChecking: false,
                code: ErrorCode.AUTH_REQUIRED,
                message: 'Session expired',
                subMessage: 'Please sign in again to continue',
                requiresOrgSelection: true, orgLacksAccess: false,
            });
            return { success: false, code: ErrorCode.AUTH_REQUIRED };
        }
        orgResult = resolved;
    } catch (error) {
        context.logger.error('[Auth] Failed to fetch organizations:', error as Error);
    }

    const totalSetupTime = Date.now() - setupStart;
    context.logger.debug(`[Auth] Post-login setup completed in ${formatDuration(totalSetupTime)}`);

    await sendPostLoginStatus(context, orgResult);
    return { success: true };
}

/**
 * Handle case where user is already authenticated (skip login)
 */
async function handleAlreadyAuthenticated(context: HandlerContext): Promise<SimpleResult> {
    context.logger.debug('[Auth] Already authenticated, skipping login');

    await context.sendMessage('auth-status', {
        isChecking: true,
        message: 'Verifying authentication...',
        subMessage: 'Checking Adobe credentials...',
        isAuthenticated: true,
    });

    await context.authManager?.ensureSDKInitialized();

    const currentOrg = await context.authManager?.getCurrentOrganization();
    const currentProject = await context.authManager?.getCurrentProject();
    context.sharedState.isAuthenticating = false;

    const orgLacksAccess = !currentOrg ? context.authManager?.wasOrgClearedDueToValidation() : false;

    await context.sendMessage('auth-status', {
        authenticated: true, isAuthenticated: true, isChecking: false,
        organization: currentOrg, project: currentProject,
        message: orgLacksAccess ? 'Organization selection required' : 'Already signed in',
        subMessage: getAuthSubMessage(!!orgLacksAccess, currentOrg),
        requiresOrgSelection: !currentOrg, orgLacksAccess,
    });
    return { success: true };
}

/**
 * Attempt to skip login if already authenticated
 * Returns SimpleResult if already auth'd, undefined if login is needed
 */
async function trySkipLogin(
    context: HandlerContext,
    force: boolean,
): Promise<SimpleResult | undefined> {
    if (force) return undefined;

    context.logger.debug('[Auth] Checking for existing valid authentication (token-only)...');
    const isAlreadyAuth = await context.authManager?.isAuthenticated();
    if (!isAlreadyAuth) return undefined;

    return handleAlreadyAuthenticated(context);
}

/**
 * Execute the browser-based login flow
 */
async function executeBrowserLogin(
    context: HandlerContext,
    force: boolean,
    authStartTime: number,
): Promise<SimpleResult> {
    context.logger.debug(`[Auth] Starting Adobe authentication process${force ? ' (forced)' : ''} - opening browser...`);
    context.logger.debug(`[Auth] Initiating browser-based login${force ? ' with force flag' : ''}`);

    await context.sendMessage('auth-status', {
        isChecking: true,
        message: AUTH_LOADING_MESSAGE,
        subMessage: force ? 'Starting fresh login...' : 'Opening browser...',
        isAuthenticated: false,
    });

    const loginSuccess = await context.authManager?.login(force);
    const loginDuration = Date.now() - authStartTime;
    context.sharedState.isAuthenticating = false;

    if (!loginSuccess) {
        context.logger.warn(`[Auth] Authentication timed out after ${formatDuration(loginDuration)}`);
        await context.sendMessage('auth-status', {
            authenticated: false, isAuthenticated: false, isChecking: false,
            error: 'timeout', code: ErrorCode.TIMEOUT,
            message: 'Sign-in timed out',
            subMessage: 'The browser window may have been closed. Please try again.',
        });
        return { success: false, code: ErrorCode.TIMEOUT };
    }

    return handleLoginSuccess(context, loginDuration);
}

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

        const skipResult = await trySkipLogin(context, force);
        if (skipResult) return skipResult;

        return await executeBrowserLogin(context, force, authStartTime);
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
