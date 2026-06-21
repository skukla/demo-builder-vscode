import * as path from 'path';
import { isValidTokenResponse } from './authPredicates';
import { getLogger, StepLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS, CACHE_TTL } from '@/core/utils/timeoutConfig';
import { createEntityServices, type EntityServices } from '@/features/authentication/services/adobeEntityService';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import { AuthenticationErrorFormatter } from '@/features/authentication/services/authenticationErrorFormatter';
import { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import { withTiming } from '@/features/authentication/services/performanceTracker';
import { TokenManager } from '@/features/authentication/services/tokenManager';
import type { AdobeOrg, AdobeProject, AdobeWorkspace, AdobeContext, AuthTokenValidation, WorkspaceCredential, AdobeIdCredentialInput, OrgServiceInfo, ServiceSubscriptionInfo } from '@/features/authentication/services/types';
import type { Logger } from '@/types/logger';

/**
 * Main authentication service - orchestrates all authentication operations
 * Provides high-level authentication methods for the extension
 */
export class AuthenticationService {
    private logger: Logger;
    private debugLogger = getLogger();
    private stepLogger: StepLogger | null = null;
    private stepLoggerInitPromise: Promise<StepLogger> | null = null;
    private templatesPath: string;
    private cacheManager: AuthCacheManager;
    private tokenManager: TokenManager;
    private organizationValidator: OrganizationValidator;
    private sdkClient: AdobeSDKClient;
    private entities: EntityServices | null = null;

    constructor(
        extensionPath: string,
        logger: Logger,
        private commandManager: CommandExecutor,
    ) {
        this.logger = logger;

        // Store templates path for lazy initialization
        this.templatesPath = path.join(extensionPath, 'src', 'core', 'logging', 'config', 'logging.json');

        // Initialize all submodules
        this.cacheManager = new AuthCacheManager();
        this.tokenManager = new TokenManager(commandManager, this.cacheManager);
        this.sdkClient = new AdobeSDKClient(logger);
        this.organizationValidator = new OrganizationValidator(
            commandManager,
            logger,
        );
        // Note: entityService will be initialized lazily when first needed
        // because it depends on stepLogger which requires async initialization
    }

    /**
     * Lazy initialization of StepLogger with ConfigurationLoader
     * Uses promise caching to ensure only one initialization happens
     */
    private async ensureStepLogger(): Promise<StepLogger> {
        if (this.stepLogger) {
            return this.stepLogger;
        }

        // If already initializing, wait for that promise
        if (this.stepLoggerInitPromise) {
            return this.stepLoggerInitPromise;
        }

        // Start initialization
        this.stepLoggerInitPromise = StepLogger.create(
            this.logger,
            undefined,
            this.templatesPath,
        ).then(stepLogger => {
            this.stepLogger = stepLogger;

            // Initialize entity services now that stepLogger is ready
            if (!this.entities) {
                this.entities = createEntityServices(
                    this.commandManager,
                    this.sdkClient,
                    this.cacheManager,
                    this.logger,
                    stepLogger,
                );
            }

            return stepLogger;
        });

        return this.stepLoggerInitPromise;
    }

    /**
     * Ensure entity services are initialized (depends on stepLogger)
     */
    private async ensureEntities(): Promise<EntityServices> {
        await this.ensureStepLogger();
        if (!this.entities) {
            throw new Error('Entity services failed to initialize');
        }
        return this.entities;
    }

    /**
     * Get token status including expiry time
     * Returns whether authenticated and how many minutes until/since expiry
     *
     * @returns Object with isAuthenticated and expiresInMinutes (negative if expired)
     */
    async getTokenStatus(): Promise<{ isAuthenticated: boolean; expiresInMinutes: number }> {
        const inspection = await this.tokenManager.inspectToken();
        return {
            isAuthenticated: inspection.valid,
            expiresInMinutes: inspection.expiresIn,
        };
    }

    /**
     * Token-only authentication check - verifies token existence and expiry
     * Does NOT validate org access or call getCurrentOrganization()
     * Does NOT initialize SDK - SDK will be initialized on-demand when needed
     * Typical duration: 2-3 seconds (Adobe CLI config read overhead)
     *
     * Use this for dashboard loads and non-critical paths.
     * For full validation including org context, use isFullyAuthenticated()
     */
    async isAuthenticated(): Promise<boolean> {
        return withTiming('isAuthenticated', async () => {
            // Check cache first
            const { isAuthenticated, isExpired } = this.cacheManager.getCachedAuthStatus();
            if (!isExpired && isAuthenticated !== undefined) {
                return isAuthenticated;
            }

            try {
                const isValid = await this.tokenManager.isTokenValid();
                this.cacheManager.setCachedAuthStatus(isValid);
                return isValid;
            } catch (error) {
                this.debugLogger.error('[Auth] Quick authentication check failed', error as Error);
                this.cacheManager.setCachedAuthStatus(false, CACHE_TTL.SHORT);
                return false;
            }
        });
    }

    /**
     * Full authentication check - validates the token.
     * Phase 4a: no longer validates/clears an ambient org context (org context is
     * resolved per-op via ensureOrgContext, not policed as a mutated global).
     *
     * For token-only checks, use isAuthenticated()
     */
    async isFullyAuthenticated(): Promise<boolean> {
        return withTiming('isFullyAuthenticated', async () => {
            // Check cache first
            const { isAuthenticated, isExpired } = this.cacheManager.getCachedAuthStatus();
            if (!isExpired && isAuthenticated !== undefined) {
                return isAuthenticated;
            }

            try {
                this.debugLogger.debug('[Auth] Checking authentication status');
                const stepLogger = await this.ensureStepLogger();
                stepLogger.logTemplate('adobe-auth', 'operations.checking', { item: 'authentication status' });

                const isValid = await this.tokenManager.isTokenValid();

                if (isValid) {
                    // Phase 4a: no longer validate/clear an ambient org context here.
                    // Org context is not a mutated global to police; reachability is
                    // resolved per-op via ensureOrgContext + withOrgContext targeting.
                    stepLogger.logTemplate('adobe-auth', 'statuses.authentication-complete', {});
                    this.cacheManager.setCachedAuthStatus(true);
                    return true;
                } else {
                    this.logger.info('[Auth] Not authenticated with Adobe. Please click "Log in to Adobe" to authenticate.');
                    stepLogger.logTemplate('adobe-auth', 'statuses.not-authenticated', {});
                    this.cacheManager.setCachedAuthStatus(false);
                    return false;
                }
            } catch (error) {
                this.debugLogger.error('[Auth] Authentication check failed', error as Error);

                const formatted = AuthenticationErrorFormatter.formatError(error, {
                    operation: 'authentication-check',
                    timeout: TIMEOUTS.QUICK,
                });

                this.logger.error(`[Auth] ${formatted.message}`);
                this.debugLogger.debug(formatted.technical);

                const stepLogger = await this.ensureStepLogger();
                stepLogger.logTemplate('adobe-auth', 'error', { item: 'Authentication check', error: formatted.title });

                this.cacheManager.setCachedAuthStatus(false, CACHE_TTL.SHORT);
                return false;
            }
        });
    }

    /**
     * Login - opens browser and waits for completion
     */
    async login(force = false): Promise<boolean> {
        return withTiming('login', async () => {
            try {
                const stepLogger = await this.ensureStepLogger();
                stepLogger.logTemplate('adobe-auth', 'operations.opening-browser', {});

                // If forced login, clear caches BEFORE login
                if (force) {
                    this.cacheManager.clearAll();
                    this.sdkClient.clear();
                    this.debugLogger.debug('[Auth] Cleared caches before forced login (Adobe CLI will clear console context)');
                }

                const loginCommand = force ? 'aio auth login -f' : 'aio auth login';

                this.debugLogger.debug('[Auth] Executing login command, browser should open');
                stepLogger.logTemplate('adobe-auth', 'statuses.browser-opened', {});
                stepLogger.logTemplate('adobe-auth', 'operations.waiting-authentication', {});

                const result = await this.commandManager.execute(
                    loginCommand,
                    { encoding: 'utf8', timeout: TIMEOUTS.AUTH.BROWSER },
                ).catch(error => {
                    this.debugLogger.error('[Auth] Login command failed', error);
                    const formatted = AuthenticationErrorFormatter.formatError(error, {
                        operation: 'browser-auth',
                        timeout: TIMEOUTS.AUTH.BROWSER,
                    });
                    this.logger.error(`[Auth] ${formatted.message}`);
                    this.debugLogger.debug(formatted.technical);
                    stepLogger.logTemplate('adobe-auth', 'error', {
                        item: 'Authentication',
                        error: formatted.title,
                    });
                    return null;
                });

                if (result && result.code === 0) {
                    this.debugLogger.debug('[Auth] Login command completed successfully');
                    const token = result.stdout?.trim();

                    if (isValidTokenResponse(token)) {
                        this.debugLogger.debug('[Auth] Adobe CLI login successful (exit code 0)');
                        stepLogger.logTemplate('adobe-auth', 'statuses.authentication-complete', {});

                        this.sdkClient.clear();
                        this.debugLogger.debug('[Auth] Cleared SDK client to force re-init with new token');

                        if (!force) {
                            this.cacheManager.clearAuthStatusCache();
                            this.cacheManager.clearValidationCache();
                            this.cacheManager.clearTokenInspectionCache();
                            this.debugLogger.debug('[Auth] Cleared auth, validation, and token inspection caches after login');
                        }

                        return true;
                    } else {
                        this.debugLogger.warn('[Auth] Command succeeded but no valid token in output');
                        this.debugLogger.debug(`[Auth] Output length: ${result.stdout?.length}, first 100 chars: ${result.stdout?.substring(0, 100)}`);
                    }

                    if (!force) {
                        this.debugLogger.debug('[Auth] Retrying with force flag to ensure fresh authentication');
                        stepLogger.logTemplate('adobe-auth', 'operations.retrying', { item: 'authentication with fresh login' });
                        return await this.login(true);
                    }
                } else {
                    const exitCode = result?.code ?? 'unknown';
                    this.debugLogger.debug(`[Auth] Login command failed with exit code: ${exitCode}`);
                }

                return false;
            } catch (error) {
                this.debugLogger.error('[Auth] Login failed', error as Error);
                this.logger.error('[Auth] Adobe login failed', error as Error);
                return false;
            }
        });
    }

    /**
     * Logout
     */
    async logout(): Promise<void> {
        try {
            await this.commandManager.execute(
                'aio auth logout',
                { encoding: 'utf8' },
            );

            // Clear all caches after logout
            this.cacheManager.clearAll(); // Includes token inspection cache
            this.sdkClient.clear();

            const stepLogger = await this.ensureStepLogger();
            stepLogger.logTemplate('adobe-auth', 'success', { item: 'Logout' });
        } catch (error) {
            this.debugLogger.error('[Auth] Logout failed', error as Error);
            throw error;
        }
    }

    /**
     * Clear all caches
     */
    clearCache(): void {
        this.cacheManager.clearAll(); // Includes token inspection cache
    }

    /**
     * Get cache manager instance
     * Used by TokenManager instances to access shared cache
     */
    getCacheManager(): AuthCacheManager {
        return this.cacheManager;
    }

    /**
     * Get token manager instance
     * Used for token inspection in handlers
     */
    getTokenManager(): TokenManager {
        return this.tokenManager;
    }

    /**
     * Ensure SDK is initialized
     */
    async ensureSDKInitialized(): Promise<boolean> {
        return this.sdkClient.ensureInitialized();
    }

    /**
     * Check if organization was cleared due to validation failure
     */
    wasOrgClearedDueToValidation(): boolean {
        return this.cacheManager.wasOrgClearedDueToValidation();
    }

    /**
     * Set org rejected flag
     */
    setOrgRejectedFlag(): void {
        this.cacheManager.setOrgClearedDueToValidation(true);
    }

    /**
     * Test if the current user has Developer or System Admin permissions
     * These permissions are required to create and manage App Builder projects
     */
    async testDeveloperPermissions(): Promise<{ hasPermissions: boolean; error?: string }> {
        return this.organizationValidator.testDeveloperPermissions();
    }

    // Entity Service Methods - Delegating to EntityService

    /**
     * Get organizations
     */
    async getOrganizations(): Promise<AdobeOrg[]> {
        return withTiming('getOrganizations', async () => {
            const { fetcher } = await this.ensureEntities();
            return fetcher.getOrganizations();
        });
    }

    /**
     * Get organizations via the SDK ONLY — never the CLI fallback.
     *
     * Non-interactive org read for on-open probes (P1): unlike
     * {@link getOrganizations} it never runs `aio console org list` (which can
     * stall ~14.5s and launch a browser), degrading to `[]` instead. Used by the
     * dashboard org-context check so opening a project can't surprise the user.
     */
    async getOrganizationsSdkOnly(): Promise<AdobeOrg[]> {
        return withTiming('getOrganizationsSdkOnly', async () => {
            const { fetcher } = await this.ensureEntities();
            return fetcher.getOrganizationsSdkOnly();
        });
    }

    /**
     * Get projects.
     *
     * @param options.orgId - Optional target org. When supplied, the fetch runs
     *   under org-context targeting (AIO_CONSOLE_* env) so the API targets that
     *   org WITHOUT mutating the shared global store.
     */
    async getProjects(options?: { orgId?: string }): Promise<AdobeProject[]> {
        return withTiming('getProjects', async () => {
            const { fetcher } = await this.ensureEntities();
            return fetcher.getProjects(options);
        });
    }

    /**
     * Get workspaces
     */
    async getWorkspaces(): Promise<AdobeWorkspace[]> {
        return withTiming('getWorkspaces', async () => {
            const { fetcher } = await this.ensureEntities();
            return fetcher.getWorkspaces();
        });
    }

    /**
     * Get OAuth S2S credential for the current workspace.
     * Returns the client_id needed for ACCS REST API x-api-key header.
     * Returns undefined if credentials are unavailable (SDK not ready, no workspace selected, etc.)
     */
    async getWorkspaceCredential(): Promise<WorkspaceCredential | undefined> {
        const { fetcher } = await this.ensureEntities();
        return fetcher.getWorkspaceCredential();
    }

    /**
     * Create an OAuth S2S credential on the current workspace.
     * Returns the new credential with client_id, or undefined on failure.
     */
    async createWorkspaceCredential(name: string, description: string): Promise<WorkspaceCredential | undefined> {
        const { fetcher } = await this.ensureEntities();
        return fetcher.createWorkspaceCredential(name, description);
    }

    // --- ApiSubscriberClient passthroughs (D2 Track A) -------------------------
    // The 5 subscriber methods the API-mesh subscribe path needs, forwarded to
    // the fetcher via the existing ensureEntities() seam.

    /** List the org's entitled services (resolves requiredApis → sdkCodes). */
    async getServicesForOrg(orgId: string): Promise<OrgServiceInfo[]> {
        const { fetcher } = await this.ensureEntities();
        return fetcher.getServicesForOrg(orgId);
    }

    /** Create an apiKey/AdobeID credential; returns its `id_integration`. */
    async createAdobeIdCredential(
        orgId: string, projectId: string, workspaceId: string, input: AdobeIdCredentialInput,
    ): Promise<string | undefined> {
        const { fetcher } = await this.ensureEntities();
        return fetcher.createAdobeIdCredential(orgId, projectId, workspaceId, input);
    }

    /** Subscribe apiKey/AdobeID services onto an AdobeID credential. */
    async subscribeAdobeIdIntegrationToServices(
        orgId: string, idIntegration: string, serviceInfo: ServiceSubscriptionInfo[],
    ): Promise<void> {
        const { fetcher } = await this.ensureEntities();
        return fetcher.subscribeAdobeIdIntegrationToServices(orgId, idIntegration, serviceInfo);
    }

    /** Subscribe OAuth-S2S services onto an S2S credential. */
    async subscribeOAuthServerToServerIntegrationToServices(
        orgId: string, idIntegration: string, serviceInfo: ServiceSubscriptionInfo[],
    ): Promise<void> {
        const { fetcher } = await this.ensureEntities();
        return fetcher.subscribeOAuthServerToServerIntegrationToServices(orgId, idIntegration, serviceInfo);
    }

    /** Ensure the shared S2S credential exists; returns its `id_integration`. */
    async ensureOAuthCredentialId(orgId: string, projectId: string, workspaceId: string): Promise<string> {
        const { fetcher } = await this.ensureEntities();
        return fetcher.ensureOAuthCredentialId(orgId, projectId, workspaceId);
    }

    /**
     * Get cached organization (fast - no fetch, no CLI calls)
     * Returns cached org if available, undefined otherwise
     *
     * Use this for quick checks where you want to show cached data
     * without triggering expensive operations.
     *
     * Performance: < 1ms (memory read only)
     */
    getCachedOrganization(): AdobeOrg | undefined {
        return this.cacheManager.getCachedOrganization();
    }

    /**
     * Set cached organization (explicit cache control)
     * Use this to ensure organization is cached after selection
     *
     * Performance: < 1ms (memory write only)
     */
    setCachedOrganization(org: AdobeOrg | undefined): void {
        this.cacheManager.setCachedOrganization(org);
    }

    /**
     * Get cached project (fast - no fetch, no CLI calls)
     * Returns cached project if available, undefined otherwise
     *
     * Use this for quick checks where you want to show cached data
     * without triggering expensive operations.
     *
     * Performance: < 1ms (memory read only)
     */
    getCachedProject(): AdobeProject | undefined {
        return this.cacheManager.getCachedProject();
    }

    /**
     * Get cached validation result (fast - no fetch, no API calls)
     * Returns validation cache if available, undefined otherwise
     *
     * Use this to check if a cached org is known to be invalid without
     * triggering expensive validation operations.
     *
     * Performance: < 1ms (memory read only)
     */
    getValidationCache(): AuthTokenValidation | undefined {
        return this.cacheManager.getValidationCache();
    }

    /**
     * Get current organization
     */
    async getCurrentOrganization(): Promise<AdobeOrg | undefined> {
        return withTiming('getCurrentOrganization', async () => {
            const { resolver } = await this.ensureEntities();
            return resolver.getCurrentOrganization();
        });
    }

    /**
     * Get current project
     */
    async getCurrentProject(): Promise<AdobeProject | undefined> {
        return withTiming('getCurrentProject', async () => {
            const { resolver } = await this.ensureEntities();
            return resolver.getCurrentProject();
        });
    }

    /**
     * Get current workspace
     */
    async getCurrentWorkspace(): Promise<AdobeWorkspace | undefined> {
        return withTiming('getCurrentWorkspace', async () => {
            const { resolver } = await this.ensureEntities();
            return resolver.getCurrentWorkspace();
        });
    }

    /**
     * Get current context
     */
    async getCurrentContext(): Promise<AdobeContext> {
        const { resolver } = await this.ensureEntities();
        return resolver.getCurrentContext();
    }

    /**
     * Login and restore full Adobe project context (org/project/workspace).
     *
     * Canonical helper for inline authentication flows where we need to:
     * 1. Perform browser-based login
     * 2. Restore the user's project context after successful login
     *
     * Use this when a user action requires authentication and should continue
     * automatically after sign-in (e.g., Deploy Mesh, Apply Configuration).
     *
     * @param adobeContext - The Adobe context to restore after login
     * @param force - When true, perform a FORCED sign-in (`aio auth login -f`)
     *   so the browser presents the IMS account/org chooser. Required for org
     *   switching: IMS tokens are org-bound, and a non-forced login silently
     *   reuses the browser's existing SSO session — which can loop back to the
     *   wrong org if another tab is signed into it. Defaults to false (session
     *   restore / re-auth, which should keep the current account).
     * @returns true if login and context restoration succeeded, false otherwise
     *
     * @example
     * ```typescript
     * const success = await authManager.loginAndRestoreProjectContext({
     *     organization: project.adobe?.organization,
     *     projectId: project.adobe?.projectId,
     *     workspace: project.adobe?.workspace,
     * });
     * if (success) {
     *     // Continue with authenticated operation
     * }
     * ```
     */
    async loginAndRestoreProjectContext(adobeContext: {
        organization?: string;
        projectId?: string;
        workspace?: string;
    }, force = false): Promise<boolean> {
        return withTiming('loginAndRestoreProjectContext', async () => {
            const debugLogger = getLogger();

            try {
                debugLogger.debug(
                    `[Auth] Starting login and context restoration (force=${force})`,
                );
                const loginSuccess = await this.login(force);
                if (!loginSuccess) {
                    debugLogger.warn('[Auth] Login failed or was cancelled');
                    return false;
                }

                // Phase 4a: do NOT re-pin org/project/workspace via select* (which
                // mutates the shared `aio` global and races concurrent processes).
                // Each downstream `aio` operation targets the known context per
                // invocation via `withOrgContext` using `adobeContext`. The login
                // itself is all this method needs to perform.
                debugLogger.debug(
                    `[Auth] Login complete; context (${adobeContext.organization ?? '-'}/`
                    + `${adobeContext.projectId ?? '-'}/${adobeContext.workspace ?? '-'}) `
                    + 'will be targeted per-op via env, not pinned to the global',
                );
                return true;
            } catch (error) {
                debugLogger.error('[Auth] Login and context restoration failed', error as Error);
                return false;
            }
        });
    }

}
