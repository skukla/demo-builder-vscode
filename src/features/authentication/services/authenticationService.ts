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
import type { AdobeOrg, AdobeProject, AdobeWorkspace, AdobeContext, AuthTokenValidation } from '@/features/authentication/services/types';
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
            this.cacheManager,
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
                    this.organizationValidator,
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
     * Full authentication check - validates token AND organization access
     * Includes org context validation via validateAndClearInvalidOrgContext()
     * Typical duration: 3-10 seconds (includes org API calls)
     *
     * For token-only checks without org validation, use isAuthenticated()
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
                stepLogger.logTemplate('adobe-setup', 'operations.checking', { item: 'authentication status' });

                const isValid = await this.tokenManager.isTokenValid();

                if (isValid) {
                    await this.organizationValidator.validateAndClearInvalidOrgContext();
                    stepLogger.logTemplate('adobe-setup', 'statuses.authentication-complete', {});
                    this.cacheManager.setCachedAuthStatus(true);
                    return true;
                } else {
                    this.logger.info('[Auth] Not authenticated with Adobe. Please click "Log in to Adobe" to authenticate.');
                    stepLogger.logTemplate('adobe-setup', 'statuses.not-authenticated', {});
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
                stepLogger.logTemplate('adobe-setup', 'error', { item: 'Authentication check', error: formatted.title });

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
                stepLogger.logTemplate('adobe-setup', 'operations.opening-browser', {});

                // If forced login, clear caches BEFORE login
                if (force) {
                    this.cacheManager.clearAll();
                    this.sdkClient.clear();
                    this.debugLogger.debug('[Auth] Cleared caches before forced login (Adobe CLI will clear console context)');
                }

                const loginCommand = force ? 'aio auth login -f' : 'aio auth login';

                this.debugLogger.debug('[Auth] Executing login command, browser should open');
                stepLogger.logTemplate('adobe-setup', 'statuses.browser-opened', {});
                stepLogger.logTemplate('adobe-setup', 'operations.waiting-authentication', {});

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
                    stepLogger.logTemplate('adobe-setup', 'error', {
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
                        stepLogger.logTemplate('adobe-setup', 'statuses.authentication-complete', {});

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
                        stepLogger.logTemplate('adobe-setup', 'operations.retrying', { item: 'authentication with fresh login' });
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
            stepLogger.logTemplate('adobe-setup', 'success', { item: 'Logout' });
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
     * Validate and clear invalid org context
     */
    async validateAndClearInvalidOrgContext(forceValidation = false): Promise<void> {
        return this.organizationValidator.validateAndClearInvalidOrgContext(forceValidation);
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
     * Get projects
     */
    async getProjects(): Promise<AdobeProject[]> {
        return withTiming('getProjects', async () => {
            const { fetcher } = await this.ensureEntities();
            return fetcher.getProjects();
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
     * Select organization
     * @param options.skipPermissionCheck - Skip Developer permission test (use during reset/restore when permissions are already verified)
     */
    async selectOrganization(orgId: string, options?: { skipPermissionCheck?: boolean }): Promise<boolean> {
        return withTiming('selectOrganization', async () => {
            const { selector } = await this.ensureEntities();
            return selector.selectOrganization(orgId, options);
        });
    }

    /**
     * Select project with org context guard.
     * @param projectId - The project ID to select
     * @param orgId - Org ID to ensure context (protects against context drift)
     */
    async selectProject(projectId: string, orgId: string): Promise<boolean> {
        return withTiming('selectProject', async () => {
            const { selector } = await this.ensureEntities();
            return selector.selectProject(projectId, orgId);
        });
    }

    /**
     * Select workspace with project context guard.
     * @param workspaceId - The workspace ID to select
     * @param projectId - Project ID to ensure context (protects against context drift)
     */
    async selectWorkspace(workspaceId: string, projectId: string): Promise<boolean> {
        return withTiming('selectWorkspace', async () => {
            const { selector } = await this.ensureEntities();
            return selector.selectWorkspace(workspaceId, projectId);
        });
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
    }): Promise<boolean> {
        return withTiming('loginAndRestoreProjectContext', async () => {
            const debugLogger = getLogger();

            try {
                debugLogger.debug('[Auth] Starting login and context restoration');
                const loginSuccess = await this.login();
                if (!loginSuccess) {
                    debugLogger.warn('[Auth] Login failed or was cancelled');
                    return false;
                }

                if (adobeContext.organization) {
                    debugLogger.debug(`[Auth] Restoring org context: ${adobeContext.organization}`);
                    const orgSuccess = await this.selectOrganization(adobeContext.organization);
                    if (!orgSuccess) {
                        debugLogger.warn('[Auth] Failed to restore organization context');
                    }
                }

                if (adobeContext.projectId && adobeContext.organization) {
                    debugLogger.debug(`[Auth] Restoring project context: ${adobeContext.projectId}`);
                    const projectSuccess = await this.selectProject(
                        adobeContext.projectId,
                        adobeContext.organization,
                    );
                    if (!projectSuccess) {
                        debugLogger.warn('[Auth] Failed to restore project context');
                    }
                }

                if (adobeContext.workspace && adobeContext.projectId) {
                    debugLogger.debug(`[Auth] Restoring workspace context: ${adobeContext.workspace}`);
                    const workspaceSuccess = await this.selectWorkspace(
                        adobeContext.workspace,
                        adobeContext.projectId,
                    );
                    if (!workspaceSuccess) {
                        debugLogger.warn('[Auth] Failed to restore workspace context');
                    }
                }

                debugLogger.debug('[Auth] Login and context restoration completed');
                return true;
            } catch (error) {
                debugLogger.error('[Auth] Login and context restoration failed', error as Error);
                return false;
            }
        });
    }

    /**
     * Auto-select organization if only one available
     */
    async autoSelectOrganizationIfNeeded(skipCurrentCheck = false): Promise<AdobeOrg | undefined> {
        const { selector } = await this.ensureEntities();
        return selector.autoSelectOrganizationIfNeeded(skipCurrentCheck);
    }
}
