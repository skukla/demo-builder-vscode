/**
 * Authentication Handlers
 *
 * Handles Adobe authentication:
 * - check-auth: Quick authentication status check
 * - authenticate: Browser-based Adobe login flow
 */

import type { AdobeOrg, AdobeProject } from '../services/types';
import type { HandlerContext } from '../../../commands/handlers/HandlerContext';

/**
 * check-auth - Check Adobe authentication status
 *
 * Performs a quick check of authentication status and retrieves
 * current organization/project context.
 */
export async function handleCheckAuth(context: HandlerContext): Promise<{ success: boolean }> {
    const checkStartTime = Date.now();
    context.logger.debug('[Auth] Starting authentication check (quick mode for wizard)');
    context.logger.info('[Auth] User initiated authentication check');

    // Step 1: Initial check with user-friendly message
    await context.sendMessage('auth-status', {
        isChecking: true,
        message: 'Connecting to Adobe services...',
        subMessage: 'Verifying your credentials',
        // Don't set isAuthenticated here - leave it undefined while checking
    });

    try {
        // Use quick auth check for faster wizard experience (< 1 second vs 9+ seconds)
        const isAuthenticated = await context.authManager.isAuthenticatedQuick();
        const checkDuration = Date.now() - checkStartTime;

        context.logger.info(`[Auth] Quick authentication check completed in ${checkDuration}ms: ${isAuthenticated}`);

        // Get current organization if authenticated
        let currentOrg: AdobeOrg | undefined = undefined;
        let currentProject: AdobeProject | undefined = undefined;

        if (isAuthenticated) {
            // Initialize SDK for 30x faster org/project operations
            await context.authManager.ensureSDKInitialized();

            // Step 2: If authenticated, check organization (no intermediate messages)
            const orgCheckStart = Date.now();
            currentOrg = await context.authManager.getCurrentOrganization();

            if (currentOrg) {
                context.logger.info(`[Auth] Current organization: ${currentOrg.name} (took ${Date.now() - orgCheckStart}ms)`);

                // Step 3: Check project if org exists
                const projectCheckStart = Date.now();
                currentProject = await context.authManager.getCurrentProject();

                if (currentProject) {
                    context.logger.info(`[Auth] Current project: ${currentProject.name} (took ${Date.now() - projectCheckStart}ms)`);
                }
            } else {
                // Authenticated but no org - likely interrupted switch or cleared due to mismatch
                context.logger.warn('[Auth] Authenticated but no organization selected - likely interrupted switch or access issue');
            }
        }

        // Determine final status with user-friendly messaging
        let message: string;
        let subMessage: string | undefined;
        let requiresOrgSelection = false;
        let orgLacksAccess = false;

        if (isAuthenticated) {
            if (!currentOrg) {
                // Check if org was just cleared due to validation failure
                orgLacksAccess = context.authManager.wasOrgClearedDueToValidation();

                message = 'Action required';
                if (orgLacksAccess) {
                    subMessage = 'Organization no longer accessible or lacks App Builder access';
                } else {
                    subMessage = 'Your previous organization is no longer accessible';
                }
                requiresOrgSelection = true;
            } else if (!currentProject) {
                message = 'Ready to continue';
                subMessage = `Connected to ${currentOrg.name}`;
            } else {
                message = 'Ready to continue';
                subMessage = `Connected to ${currentOrg.name} - ${currentProject.name}`;
            }
        } else {
            message = 'Sign in required';
            subMessage = 'Connect your Adobe account to access App Builder services';
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
            message: 'Connection issue',
            subMessage: 'Unable to reach Adobe services. Please check your connection and try again.',
        });

        return { success: false };
    }
}

/**
 * authenticate - Perform Adobe authentication
 *
 * Initiates browser-based Adobe login flow and handles organization/project
 * context setup.
 */
export async function handleAuthenticate(
    context: HandlerContext,
    payload?: { force?: boolean },
): Promise<{ success: boolean }> {
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
                    message: orgLacksAccess ? 'Organization selection required' : 'Already authenticated',
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
        await context.sendMessage('auth-status', {
            isChecking: true,
            message: 'Opening browser for authentication...',
            subMessage: force ? 'Starting fresh login...' : 'If you\'re already logged in, the browser will complete automatically.',
            isAuthenticated: false,
        });

        // Start login process
        const loginSuccess = await context.authManager.login(force);

        const loginDuration = Date.now() - authStartTime;
        context.sharedState.isAuthenticating = false;

        if (loginSuccess) {
            context.logger.info(`[Auth] Authentication completed successfully after ${loginDuration}ms`);

            // Clear cache if this was a forced login (organization switch)
            if (force) {
                context.authManager.clearCache();
                // Note: Console context was cleared before login to preserve browser selection
                context.logger.info('[Auth] Cleared caches after forced login - checking for organization selection');
            }

            // After fresh authentication, check what org was selected (if any)
            // For forced login, user may have selected org in browser
            context.logger.info('[Auth] Checking for organization selection after login');

            // Start the overall post-login setup (no intermediate messages)
            const setupStart = Date.now();

            // First, check if user selected an org in the browser
            const orgCheckStart = Date.now();
            let currentOrg = await context.authManager.getCurrentOrganization();
            let availableOrgs: AdobeOrg[] = [];

            if (currentOrg) {
                context.logger.info(`[Auth] Organization found after browser login: ${currentOrg.name} (took ${Date.now() - orgCheckStart}ms)`);
            } else {
                // No org selected in browser
                // Check if user has orgs available (to distinguish "no access" from "rejected org")
                context.logger.debug('[Auth] No org in context, checking available organizations...');

                try {
                    availableOrgs = await context.authManager.getOrganizations();
                    context.logger.debug(`[Auth] User has access to ${availableOrgs.length} organization(s)`);
                } catch (error) {
                    context.logger.debug('[Auth] Failed to get organizations:', error as Error);
                }

                if (availableOrgs.length === 1) {
                    // Only one org available, auto-select it
                    context.logger.info('[Auth] Auto-selecting single available organization');
                    const autoSelectStart = Date.now();
                    currentOrg = await context.authManager.autoSelectOrganizationIfNeeded(true);

                    if (currentOrg) {
                        context.logger.info(`[Auth] Auto-selected organization: ${currentOrg.name} (took ${Date.now() - autoSelectStart}ms)`);
                    } else {
                        context.logger.warn(`[Auth] Failed to auto-select single org (took ${Date.now() - autoSelectStart}ms)`);
                    }
                } else if (availableOrgs.length > 1 && force) {
                    // Multiple orgs + forced login + no org set = user likely selected invalid org
                    context.logger.info('[Auth] Multiple orgs available but none selected after forced login - likely selected org without App Builder access');
                    context.authManager.setOrgRejectedFlag();
                } else if (availableOrgs.length === 0 && force) {
                    // Forced login + 0 orgs = could be token issue, no orgs, or rejected org
                    // Set flag to show honest message about the ambiguous situation
                    context.logger.warn('[Auth] No organizations returned after forced login - could be auth issue, no org access, or selected org lacks App Builder');
                    context.authManager.setOrgRejectedFlag();
                } else if (availableOrgs.length === 0) {
                    context.logger.warn('[Auth] No organizations accessible to this user');
                } else {
                    context.logger.info('[Auth] Multiple organizations available, manual selection required');
                }
            }

            // Validate the organization has App Builder access (critical for browser-selected orgs)
            if (currentOrg) {
                const validationStart = Date.now();
                context.logger.debug(`[Auth] Validating "${currentOrg.name}" has App Builder access...`);
                await context.authManager.validateAndClearInvalidOrgContext(true);

                // Re-check if org is still set after validation (it may have been cleared)
                const orgAfterValidation = await context.authManager.getCurrentOrganization();
                if (!orgAfterValidation) {
                    context.logger.info(`[Auth] Organization "${currentOrg.name}" was cleared - lacks App Builder access (took ${Date.now() - validationStart}ms)`);
                    currentOrg = undefined; // Update our local variable
                } else {
                    context.logger.debug(`[Auth] Organization "${currentOrg.name}" validation passed (took ${Date.now() - validationStart}ms)`);

                    // Test Developer permissions for the validated organization
                    const permCheckStart = Date.now();
                    context.logger.debug(`[Auth] Testing Developer permissions for "${currentOrg.name}"...`);
                    const permissionCheck = await context.authManager.testDeveloperPermissions();

                    if (!permissionCheck.hasPermissions) {
                        context.logger.error(`[Auth] User lacks Developer permissions for "${currentOrg.name}" (took ${Date.now() - permCheckStart}ms)`);
                        context.logger.error('[Auth] Permission check error:', permissionCheck.error || 'Unknown error');

                        // Clear the organization since permissions are insufficient
                        context.authManager.clearCache();
                        currentOrg = undefined;
                        context.authManager.setOrgRejectedFlag();

                        // Send permission error to UI
                        await context.sendMessage('auth-status', {
                            authenticated: true,
                            isAuthenticated: true,
                            isChecking: false,
                            organization: undefined,
                            project: undefined,
                            error: 'no_app_builder_access',
                            message: 'Insufficient Privileges',
                            subMessage: permissionCheck.error || 'You need Developer or System Admin role for this organization',
                            requiresOrgSelection: true,
                            orgLacksAccess: true,
                        });

                        return { success: false };
                    } else {
                        context.logger.debug(`[Auth] Developer permissions confirmed for "${currentOrg.name}" (took ${Date.now() - permCheckStart}ms)`);
                    }
                }
            }

            // Get current project (usually fast with SDK)
            const projectCheckStart = Date.now();
            const currentProject = await context.authManager.getCurrentProject();
            if (currentProject) {
                context.logger.info(`[Auth] Current project: ${currentProject.name} (took ${Date.now() - projectCheckStart}ms)`);
            } else {
                context.logger.debug(`[Auth] No current project (took ${Date.now() - projectCheckStart}ms)`);
            }

            // Log total post-login setup time
            const totalSetupTime = Date.now() - setupStart;
            context.logger.info(`[Auth] Post-login setup completed in ${totalSetupTime}ms`);

            // Handle the case where organization wasn't set during browser login (expected for forced login)
            if (!currentOrg && force) {
                // Check if org was cleared due to lack of App Builder access
                const orgLacksAccess = context.authManager.wasOrgClearedDueToValidation();

                context.logger.debug(`[Auth] orgLacksAccess flag value: ${orgLacksAccess}`);

                if (orgLacksAccess) {
                    context.logger.info('[Auth] No orgs accessible - could be rejected org or auth issue');
                } else {
                    context.logger.info('[Auth] No organization set after forced login - this is expected, user needs to select organization');
                }

                await context.sendMessage('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: undefined,
                    project: undefined,
                    message: orgLacksAccess ? 'Organization selection required' : 'Authentication successful',
                    subMessage: orgLacksAccess ? 'No organizations currently accessible' : 'Please select your organization to continue',
                    requiresOrgSelection: true,
                    orgLacksAccess,
                });
            } else {
                // Normal case - organization is available
                await context.sendMessage('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: currentOrg,
                    project: currentProject,
                    message: 'Ready to continue',
                    subMessage: currentOrg ? `Connected to ${currentOrg.name}` : 'Authentication verified',
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
                message: 'Authentication timed out',
                subMessage: 'The browser window may have been closed or the session expired',
            });

            return { success: false };
        }

    } catch (error) {
        const failDuration = Date.now() - authStartTime;
        context.sharedState.isAuthenticating = false;

        context.logger.error(`[Auth] Failed to start authentication after ${failDuration}ms:`, error as Error);
        await context.sendMessage('authError', {
            error: error instanceof Error ? error.message : String(error),
        });

        return { success: false };
    }
}
