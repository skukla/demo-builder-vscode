import * as path from 'path';
import { isValidTokenResponse } from './authPredicates';
import { getLogger, StepLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS, CACHE_TTL } from '@/core/utils/timeoutConfig';
import { AdobeEntityService } from '@/features/authentication/services/adobeEntityService';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import { AuthenticationErrorFormatter } from '@/features/authentication/services/authenticationErrorFormatter';
import { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import { PerformanceTracker } from '@/features/authentication/services/performanceTracker';
import { TokenManager } from '@/features/authentication/services/tokenManager';
import type { AdobeOrg, AdobeProject, AdobeWorkspace, AdobeContext, AuthTokenValidation } from '@/features/authentication/services/types';

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
    private performanceTracker: PerformanceTracker;
    private cacheManager: AuthCacheManager;
    private tokenManager: TokenManager;
    private organizationValidator: OrganizationValidator;
    private sdkClient: AdobeSDKClient;
    private entityService: AdobeEntityService | null = null;

    constructor(
        extensionPath: string,
        logger: Logger,
        private commandManager: CommandExecutor,
    ) {
        this.logger = logger;

        // Store templates path for lazy initialization
        this.templatesPath = path.join(extensionPath, 'templates', 'logging.json');

        // Initialize all submodules
        this.performanceTracker = new PerformanceTracker();
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

            // Initialize entityService now that stepLogger is ready
            if (!this.entityService) {
                this.entityService = new AdobeEntityService(
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
     * Ensure entityService is initialized (depends on stepLogger)
     */
    private async ensureEntityService(): Promise<AdobeEntityService> {
        await this.ensureStepLogger();
        if (!this.entityService) {
            throw new Error('EntityService failed to initialize');
        }
        return this.entityService;
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
        this.performanceTracker.startTiming('isAuthenticated');

        // Check cache first
        const { isAuthenticated, isExpired } = this.cacheManager.getCachedAuthStatus();
        if (!isExpired && isAuthenticated !== undefined) {
            this.performanceTracker.endTiming('isAuthenticated');
            return isAuthenticated;
        }

        try {
            const isValid = await this.tokenManager.isTokenValid();

            // Cache the result
            this.cacheManager.setCachedAuthStatus(isValid);

            this.performanceTracker.endTiming('isAuthenticated');
            return isValid;
        } catch (error) {
            this.debugLogger.error('[Auth] Quick authentication check failed', error as Error);

            // Cache the failed result (short TTL for errors)
            this.cacheManager.setCachedAuthStatus(false, CACHE_TTL.AUTH_STATUS_ERROR);

            this.performanceTracker.endTiming('isAuthenticated');
            return false;
        }
    }

    /**
     * Full authentication check - validates token AND organization access
     * Includes org context validation via validateAndClearInvalidOrgContext()
     * Typical duration: 3-10 seconds (includes org API calls)
     *
     * For token-only checks without org validation, use isAuthenticated()
     */
    async isFullyAuthenticated(): Promise<boolean> {
        this.performanceTracker.startTiming('isFullyAuthenticated');

        // Check cache first
        const { isAuthenticated, isExpired } = this.cacheManager.getCachedAuthStatus();
        if (!isExpired && isAuthenticated !== undefined) {
            this.performanceTracker.endTiming('isFullyAuthenticated');
            return isAuthenticated;
        }

        try {
            this.debugLogger.debug('[Auth] Checking authentication status');
            const stepLogger = await this.ensureStepLogger();
            stepLogger.logTemplate('adobe-setup', 'operations.checking', { item: 'authentication status' });

            const isValid = await this.tokenManager.isTokenValid();

            if (isValid) {
                // Check if we have an org context and validate it's accessible
                await this.organizationValidator.validateAndClearInvalidOrgContext();

                stepLogger.logTemplate('adobe-setup', 'statuses.authentication-complete', {});

                // Cache the successful result
                this.cacheManager.setCachedAuthStatus(true);

                this.performanceTracker.endTiming('isFullyAuthenticated');
                return true;
            } else {
                this.logger.info('[Auth] Not authenticated with Adobe. Please click "Log in to Adobe" to authenticate.');
                stepLogger.logTemplate('adobe-setup', 'statuses.not-authenticated', {});

                // Cache the failed result
                this.cacheManager.setCachedAuthStatus(false);

                this.performanceTracker.endTiming('isFullyAuthenticated');
                return false;
            }
        } catch (error) {
            this.debugLogger.error('[Auth] Authentication check failed', error as Error);

            // Format error with user-friendly message
            const formatted = AuthenticationErrorFormatter.formatError(error, {
                operation: 'authentication-check',
                timeout: TIMEOUTS.CONFIG_READ,
            });

            // Log formatted error to user
            this.logger.error(`[Auth] ${formatted.message}`);

            // Log technical details to debug
            this.debugLogger.debug(formatted.technical);

            const stepLogger = await this.ensureStepLogger();
            stepLogger.logTemplate('adobe-setup', 'error', { item: 'Authentication check', error: formatted.title });

            // Cache the failed result (shorter TTL for errors to allow retry)
            this.cacheManager.setCachedAuthStatus(false, CACHE_TTL.AUTH_STATUS_ERROR);

            this.performanceTracker.endTiming('isFullyAuthenticated');
            return false;
        }
    }

    /**
     * Login - opens browser and waits for completion
     */
    async login(force = false): Promise<boolean> {
        this.performanceTracker.startTiming('login');

        try {
            const stepLogger = await this.ensureStepLogger();
            stepLogger.logTemplate('adobe-setup', 'operations.opening-browser', {});

            // If forced login, clear caches BEFORE login
            if (force) {
                // PERFORMANCE FIX: Removed redundant clearConsoleContext() call (4.3s savings)
                // Reason: 'aio auth login -f' already performs forced logout which clears console context
                // Plus, post-login flow explicitly sets console.org via selectOrganization()
                // See authenticationHandlers.ts:220-222 for confirmation
                this.cacheManager.clearAll(); // Includes token inspection cache
                this.sdkClient.clear();
                this.debugLogger.debug('[Auth] Cleared caches before forced login (Adobe CLI will clear console context)');
            }

            // Execute login command
            const loginCommand = force ? 'aio auth login -f' : 'aio auth login';

            this.debugLogger.debug('[Auth] Executing login command, browser should open');
            stepLogger.logTemplate('adobe-setup', 'statuses.browser-opened', {});
            stepLogger.logTemplate('adobe-setup', 'operations.waiting-authentication', {});

            // Add timeout to the command execution (2 minutes)
            const result = await this.commandManager.execute(
                loginCommand,
                {
                    encoding: 'utf8',
                    timeout: TIMEOUTS.BROWSER_AUTH,
                },
            ).catch(error => {
                this.debugLogger.error('[Auth] Login command failed', error);

                // Format error with user-friendly message
                const formatted = AuthenticationErrorFormatter.formatError(error, {
                    operation: 'browser-auth',
                    timeout: TIMEOUTS.BROWSER_AUTH,
                });

                // Log formatted error to user
                this.logger.error(`[Auth] ${formatted.message}`);

                // Log technical details to debug
                this.debugLogger.debug(formatted.technical);

                // Log to step logger
                stepLogger.logTemplate('adobe-setup', 'error', {
                    item: 'Authentication',
                    error: formatted.title,
                });

                return null;
            });

            // Check if command succeeded
            if (result && result.code === 0) {
                this.debugLogger.debug('[Auth] Login command completed successfully');

                // The token is returned in stdout
                const token = result.stdout?.trim();

                // Check if we got a valid token (JWT tokens are typically >100 chars)
                if (isValidTokenResponse(token)) {
                    this.debugLogger.debug('[Auth] Received access token from login command');

                    // TRUST ADOBE CLI: If 'aio auth login' returns exit code 0 with valid token,
                    // the CLI has already stored it. No verification needed.
                    // This aligns with commit 29c0876 "Prevent second browser window during login"
                    // which defers post-login validation to avoid Adobe IMS timing issues.
                    this.debugLogger.debug('[Auth] Adobe CLI login successful (exit code 0)');
                    stepLogger.logTemplate('adobe-setup', 'statuses.authentication-complete', {});

                    // CRITICAL FIX: Clear SDK after login to force re-initialization with new token
                    // Old token was cached in SDK instance, new token requires SDK reset
                    this.sdkClient.clear();
                    this.debugLogger.debug('[Auth] Cleared SDK client to force re-init with new token');

                    // Clear auth cache to force fresh check next time
                    // If forced login, clearAll() already cleared everything at line 233
                    // For non-forced login, clear specific caches including token inspection
                    if (!force) {
                        this.cacheManager.clearAuthStatusCache();
                        this.cacheManager.clearValidationCache();
                        this.cacheManager.clearTokenInspectionCache(); // FIX: Clear token inspection cache to prevent stale cached tokens
                        this.debugLogger.debug('[Auth] Cleared auth, validation, and token inspection caches after login');
                    } else {
                        this.debugLogger.debug('[Auth] Skipping cache clear - already cleared before forced login');
                    }

                    this.performanceTracker.endTiming('login');
                    return true;
                } else {
                    this.debugLogger.warn('[Auth] Command succeeded but no valid token in output');
                    this.debugLogger.debug(`[Auth] Output length: ${result.stdout?.length}, first 100 chars: ${result.stdout?.substring(0, 100)}`);
                }

                // If we didn't get a valid token and force wasn't used, retry with force
                if (!force) {
                    this.debugLogger.debug('[Auth] Retrying with force flag to ensure fresh authentication');
                    stepLogger.logTemplate('adobe-setup', 'operations.retrying', { item: 'authentication with fresh login' });
                    this.performanceTracker.endTiming('login');
                    return await this.login(true);
                }
            } else {
                const exitCode = result?.code ?? 'unknown';
                this.debugLogger.debug(`[Auth] Login command failed with exit code: ${exitCode}`);
            }

            // Command failed or token verification failed
            this.performanceTracker.endTiming('login');
            return false;

        } catch (error) {
            this.debugLogger.error('[Auth] Login failed', error as Error);
            this.logger.error('[Auth] Adobe login failed', error as Error);
            this.performanceTracker.endTiming('login');
            return false;
        }
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
        this.performanceTracker.startTiming('getOrganizations');
        const entityService = await this.ensureEntityService();
        const result = await entityService.getOrganizations();
        this.performanceTracker.endTiming('getOrganizations');
        return result;
    }

    /**
     * Get projects
     */
    async getProjects(): Promise<AdobeProject[]> {
        this.performanceTracker.startTiming('getProjects');
        const entityService = await this.ensureEntityService();
        const result = await entityService.getProjects();
        this.performanceTracker.endTiming('getProjects');
        return result;
    }

    /**
     * Get workspaces
     */
    async getWorkspaces(): Promise<AdobeWorkspace[]> {
        this.performanceTracker.startTiming('getWorkspaces');
        const entityService = await this.ensureEntityService();
        const result = await entityService.getWorkspaces();
        this.performanceTracker.endTiming('getWorkspaces');
        return result;
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
        this.performanceTracker.startTiming('getCurrentOrganization');
        const entityService = await this.ensureEntityService();
        const result = await entityService.getCurrentOrganization();
        this.performanceTracker.endTiming('getCurrentOrganization');
        return result;
    }

    /**
     * Get current project
     */
    async getCurrentProject(): Promise<AdobeProject | undefined> {
        this.performanceTracker.startTiming('getCurrentProject');
        const entityService = await this.ensureEntityService();
        const result = await entityService.getCurrentProject();
        this.performanceTracker.endTiming('getCurrentProject');
        return result;
    }

    /**
     * Get current workspace
     */
    async getCurrentWorkspace(): Promise<AdobeWorkspace | undefined> {
        this.performanceTracker.startTiming('getCurrentWorkspace');
        const entityService = await this.ensureEntityService();
        const result = await entityService.getCurrentWorkspace();
        this.performanceTracker.endTiming('getCurrentWorkspace');
        return result;
    }

    /**
     * Get current context
     */
    async getCurrentContext(): Promise<AdobeContext> {
        const entityService = await this.ensureEntityService();
        return entityService.getCurrentContext();
    }

    /**
     * Select organization
     */
    async selectOrganization(orgId: string): Promise<boolean> {
        this.performanceTracker.startTiming('selectOrganization');
        const entityService = await this.ensureEntityService();
        const result = await entityService.selectOrganization(orgId);
        this.performanceTracker.endTiming('selectOrganization');
        return result;
    }

    /**
     * Select project with org context guard.
     * @param projectId - The project ID to select
     * @param orgId - Org ID to ensure context (protects against context drift)
     */
    async selectProject(projectId: string, orgId: string): Promise<boolean> {
        this.performanceTracker.startTiming('selectProject');
        const entityService = await this.ensureEntityService();
        const result = await entityService.selectProject(projectId, orgId);
        this.performanceTracker.endTiming('selectProject');
        return result;
    }

    /**
     * Select workspace with project context guard.
     * @param workspaceId - The workspace ID to select
     * @param projectId - Project ID to ensure context (protects against context drift)
     */
    async selectWorkspace(workspaceId: string, projectId: string): Promise<boolean> {
        this.performanceTracker.startTiming('selectWorkspace');
        const entityService = await this.ensureEntityService();
        const result = await entityService.selectWorkspace(workspaceId, projectId);
        this.performanceTracker.endTiming('selectWorkspace');
        return result;
    }

    /**
     * Auto-select organization if only one available
     */
    async autoSelectOrganizationIfNeeded(skipCurrentCheck = false): Promise<AdobeOrg | undefined> {
        const entityService = await this.ensureEntityService();
        return entityService.autoSelectOrganizationIfNeeded(skipCurrentCheck);
    }
}
