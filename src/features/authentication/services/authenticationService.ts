import * as path from 'path';
import type { CommandExecutor } from '@/shared/command-execution';
import { getLogger, Logger, StepLogger } from '@/shared/logging';
import { TIMEOUTS, CACHE_TTL } from '@/utils/timeoutConfig';
import { AdobeEntityService } from './adobeEntityService';
import { AdobeSDKClient } from './adobeSDKClient';
import { AuthCacheManager } from './authCacheManager';
import { OrganizationValidator } from './organizationValidator';
import { PerformanceTracker } from './performanceTracker';
import { TokenManager } from './tokenManager';
import type { AdobeOrg, AdobeProject, AdobeWorkspace, AdobeContext } from './types';

/**
 * Main authentication service - orchestrates all authentication operations
 * Provides high-level authentication methods for the extension
 */
export class AuthenticationService {
    private logger: Logger;
    private debugLogger = getLogger();
    private stepLogger: StepLogger;
    private performanceTracker: PerformanceTracker;
    private cacheManager: AuthCacheManager;
    private tokenManager: TokenManager;
    private organizationValidator: OrganizationValidator;
    private sdkClient: AdobeSDKClient;
    private entityService: AdobeEntityService;

    constructor(
        extensionPath: string,
        logger: Logger,
        private commandManager: CommandExecutor,
    ) {
        this.logger = logger;

        // Initialize StepLogger with templates
        const templatesPath = path.join(extensionPath, 'templates', 'logging.json');
        this.stepLogger = new StepLogger(logger, undefined, templatesPath);

        // Initialize all submodules
        this.performanceTracker = new PerformanceTracker();
        this.cacheManager = new AuthCacheManager();
        this.tokenManager = new TokenManager(commandManager);
        this.sdkClient = new AdobeSDKClient(logger);
        this.organizationValidator = new OrganizationValidator(
            commandManager,
            this.cacheManager,
            logger,
        );
        this.entityService = new AdobeEntityService(
            commandManager,
            this.sdkClient,
            this.cacheManager,
            logger,
            this.stepLogger,
        );
    }

    /**
     * Quick authentication check - only verifies token existence and expiry
     * Does NOT validate org access or initialize SDK
     * Use this for dashboard loads and other performance-critical paths
     *
     * Performance: < 1 second (vs 9+ seconds for full isAuthenticated)
     */
    async isAuthenticatedQuick(): Promise<boolean> {
        this.performanceTracker.startTiming('isAuthenticatedQuick');

        // Check cache first
        const { isAuthenticated, isExpired } = this.cacheManager.getCachedAuthStatus();
        if (!isExpired && isAuthenticated !== undefined) {
            this.debugLogger.debug(`[Auth] Using cached authentication status: ${isAuthenticated}`);
            this.performanceTracker.endTiming('isAuthenticatedQuick');
            return isAuthenticated;
        }

        try {
            this.debugLogger.debug('[Auth] Quick authentication check (token only, no org validation)');

            const isValid = await this.tokenManager.isTokenValid();

            // Cache the result
            this.cacheManager.setCachedAuthStatus(isValid);

            this.performanceTracker.endTiming('isAuthenticatedQuick');
            return isValid;
        } catch (error) {
            this.debugLogger.error('[Auth] Quick authentication check failed', error as Error);

            // Cache the failed result (short TTL for errors)
            this.cacheManager.setCachedAuthStatus(false, CACHE_TTL.AUTH_STATUS_ERROR);

            this.performanceTracker.endTiming('isAuthenticatedQuick');
            return false;
        }
    }

    /**
     * Check if authenticated - validates token and organization access
     * ALSO initializes SDK for better performance
     * Use this when you need full authentication context
     *
     * Performance: 3-10 seconds (includes org validation)
     * For faster checks, use isAuthenticatedQuick()
     */
    async isAuthenticated(): Promise<boolean> {
        this.performanceTracker.startTiming('isAuthenticated');

        // Check cache first
        const { isAuthenticated, isExpired } = this.cacheManager.getCachedAuthStatus();
        if (!isExpired && isAuthenticated !== undefined) {
            this.debugLogger.debug(`[Auth] Using cached authentication status: ${isAuthenticated}`);
            this.performanceTracker.endTiming('isAuthenticated');
            return isAuthenticated;
        }

        try {
            this.debugLogger.debug('[Auth] Checking authentication status');
            this.stepLogger.logTemplate('adobe-setup', 'operations.checking', { item: 'authentication status' });

            const isValid = await this.tokenManager.isTokenValid();

            if (isValid) {
                // Check if we have an org context and validate it's accessible
                await this.organizationValidator.validateAndClearInvalidOrgContext();

                // Initialize SDK in background (non-blocking) for future high-performance operations
                this.sdkClient.initialize().catch(error => {
                    // SDK initialization failure is not critical - operations will fall back to CLI
                    this.debugLogger.debug('[Auth SDK] Background SDK init failed, using CLI fallback:', error);
                });

                this.stepLogger.logTemplate('adobe-setup', 'statuses.authentication-complete', {});

                // Cache the successful result
                this.cacheManager.setCachedAuthStatus(true);

                this.performanceTracker.endTiming('isAuthenticated');
                return true;
            } else {
                this.logger.info('[Auth] Not authenticated with Adobe. Please click "Log in to Adobe" to authenticate.');
                this.stepLogger.logTemplate('adobe-setup', 'statuses.not-authenticated', {});

                // Cache the failed result
                this.cacheManager.setCachedAuthStatus(false);

                this.performanceTracker.endTiming('isAuthenticated');
                return false;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.debugLogger.error('[Auth] Authentication check failed', error as Error);

            // Provide helpful error messages based on common issues
            if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
                this.logger.error('[Auth] Adobe CLI configuration not found. Please ensure Adobe CLI is properly installed.');
            } else if (errorMessage.includes('timeout')) {
                this.logger.error('[Auth] Authentication check timed out. Please check your network connection.');
            } else {
                this.logger.error(`[Auth] Failed to check authentication status: ${errorMessage}`);
            }

            this.stepLogger.logTemplate('adobe-setup', 'error', { item: 'Authentication check', error: errorMessage });

            // Cache the failed result (shorter TTL for errors to allow retry)
            this.cacheManager.setCachedAuthStatus(false, CACHE_TTL.AUTH_STATUS_ERROR);

            this.performanceTracker.endTiming('isAuthenticated');
            return false;
        }
    }

    /**
     * Login - opens browser and waits for completion
     */
    async login(force = false): Promise<boolean> {
        this.performanceTracker.startTiming('login');

        try {
            this.stepLogger.logTemplate('adobe-setup', 'operations.opening-browser', {});
            this.debugLogger.debug(`[Auth] Initiating Adobe login${force ? ' (forced)' : ''}`);

            // If forced login, clear console context and cache BEFORE login
            if (force) {
                this.debugLogger.debug('[Auth] Clearing console context before forced login');
                await this.clearConsoleContext();
                this.cacheManager.clearAll();
            }

            // Execute login command
            const loginCommand = force ? 'aio auth login -f' : 'aio auth login';

            this.debugLogger.debug('[Auth] Executing login command, browser should open');
            this.stepLogger.logTemplate('adobe-setup', 'statuses.browser-opened', {});
            this.stepLogger.logTemplate('adobe-setup', 'operations.waiting-authentication', {});

            // Add timeout to the command execution (2 minutes)
            const result = await this.commandManager.executeAdobeCLI(
                loginCommand,
                {
                    encoding: 'utf8',
                    timeout: TIMEOUTS.BROWSER_AUTH,
                },
            ).catch(error => {
                // Check if it's a timeout
                if (error.message?.includes('timeout')) {
                    this.debugLogger.debug('[Auth] Login timed out - user may have closed browser');
                    this.logger.warn('[Auth] Authentication timed out. The browser window may have been closed or the session expired.');
                    this.stepLogger.logTemplate('adobe-setup', 'error', {
                        item: 'Authentication',
                        error: 'Timed out waiting for browser authentication',
                    });
                    return null;
                }

                // Provide specific error messages for common issues
                const errorMsg = error.message || '';
                if (errorMsg.includes('EACCES') || errorMsg.includes('permission')) {
                    this.logger.error('[Auth] Permission denied. Please ensure you have proper access rights.');
                } else if (errorMsg.includes('ENETUNREACH') || errorMsg.includes('ETIMEDOUT')) {
                    this.logger.error('[Auth] Network error. Please check your internet connection and try again.');
                } else {
                    this.logger.error(`[Auth] Login failed: ${errorMsg}`);
                }

                this.debugLogger.error('[Auth] Login command failed', error);
                return null;
            });

            // Check if command succeeded
            if (result && result.code === 0) {
                this.debugLogger.debug('[Auth] Login command completed successfully');

                // The token is returned in stdout
                const token = result.stdout?.trim();

                // Check if we got a valid token (JWT tokens are typically >100 chars)
                if (token && token.length > 50 && !token.includes('Error') && !token.includes('error')) {
                    this.debugLogger.debug('[Auth] Received access token from login command');

                    // Store the token
                    const stored = await this.tokenManager.storeAccessToken(token);

                    if (stored) {
                        this.stepLogger.logTemplate('adobe-setup', 'statuses.authentication-complete', {});

                        // Clear auth cache to force fresh check next time
                        this.cacheManager.clearAuthStatusCache();

                        // Clear validation cache after login
                        this.cacheManager.clearValidationCache();

                        // If this was a forced login, clear session caches
                        if (force) {
                            this.cacheManager.clearSessionCaches();
                            this.debugLogger.debug('[Auth] Cleared cache after forced login');
                        }

                        this.performanceTracker.endTiming('login');
                        return true;
                    } else {
                        this.debugLogger.warn('[Auth] Failed to store token');

                        // Verify if we're still authenticated from previous session
                        const isAuth = await this.isAuthenticated();
                        if (isAuth) {
                            this.debugLogger.info('[Auth] Token storage failed but existing authentication found');
                            this.performanceTracker.endTiming('login');
                            return true;
                        }
                    }
                } else {
                    this.debugLogger.warn('[Auth] Command succeeded but no valid token in output');
                    this.debugLogger.debug(`[Auth] Output length: ${result.stdout?.length}, first 100 chars: ${result.stdout?.substring(0, 100)}`);
                }

                // If we didn't get a valid token and force wasn't used, retry with force
                if (!force) {
                    this.debugLogger.info('[Auth] Retrying with force flag to ensure fresh authentication');
                    this.stepLogger.logTemplate('adobe-setup', 'operations.retrying', { item: 'authentication with fresh login' });
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
            await this.commandManager.executeAdobeCLI(
                'aio auth logout',
                { encoding: 'utf8' },
            );

            // Clear all caches after logout
            this.cacheManager.clearAll();
            this.sdkClient.clear();

            this.stepLogger.logTemplate('adobe-setup', 'success', { item: 'Logout' });
        } catch (error) {
            this.debugLogger.error('[Auth] Logout failed', error as Error);
            throw error;
        }
    }

    /**
     * Clear console context
     */
    private async clearConsoleContext(): Promise<void> {
        try {
            await Promise.all([
                this.commandManager.executeAdobeCLI('aio config delete console.org', { encoding: 'utf8' }),
                this.commandManager.executeAdobeCLI('aio config delete console.project', { encoding: 'utf8' }),
                this.commandManager.executeAdobeCLI('aio config delete console.workspace', { encoding: 'utf8' }),
            ]);

            this.cacheManager.clearConsoleWhereCache();
            this.debugLogger.debug('[Auth] Cleared Adobe CLI console context');
        } catch (error) {
            this.debugLogger.debug('[Auth] Failed to clear console context:', error);
        }
    }

    /**
     * Clear all caches
     */
    clearCache(): void {
        this.cacheManager.clearAll();
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

    // Entity Service Methods - Delegating to EntityService

    /**
     * Get organizations
     */
    async getOrganizations(): Promise<AdobeOrg[]> {
        this.performanceTracker.startTiming('getOrganizations');
        const result = await this.entityService.getOrganizations();
        this.performanceTracker.endTiming('getOrganizations');
        return result;
    }

    /**
     * Get projects
     */
    async getProjects(): Promise<AdobeProject[]> {
        this.performanceTracker.startTiming('getProjects');
        const result = await this.entityService.getProjects();
        this.performanceTracker.endTiming('getProjects');
        return result;
    }

    /**
     * Get workspaces
     */
    async getWorkspaces(): Promise<AdobeWorkspace[]> {
        this.performanceTracker.startTiming('getWorkspaces');
        const result = await this.entityService.getWorkspaces();
        this.performanceTracker.endTiming('getWorkspaces');
        return result;
    }

    /**
     * Get current organization
     */
    async getCurrentOrganization(): Promise<AdobeOrg | undefined> {
        this.performanceTracker.startTiming('getCurrentOrganization');
        const result = await this.entityService.getCurrentOrganization();
        this.performanceTracker.endTiming('getCurrentOrganization');
        return result;
    }

    /**
     * Get current project
     */
    async getCurrentProject(): Promise<AdobeProject | undefined> {
        this.performanceTracker.startTiming('getCurrentProject');
        const result = await this.entityService.getCurrentProject();
        this.performanceTracker.endTiming('getCurrentProject');
        return result;
    }

    /**
     * Get current workspace
     */
    async getCurrentWorkspace(): Promise<AdobeWorkspace | undefined> {
        this.performanceTracker.startTiming('getCurrentWorkspace');
        const result = await this.entityService.getCurrentWorkspace();
        this.performanceTracker.endTiming('getCurrentWorkspace');
        return result;
    }

    /**
     * Get current context
     */
    async getCurrentContext(): Promise<AdobeContext> {
        return this.entityService.getCurrentContext();
    }

    /**
     * Select organization
     */
    async selectOrganization(orgId: string): Promise<boolean> {
        this.performanceTracker.startTiming('selectOrganization');
        const result = await this.entityService.selectOrganization(orgId);
        this.performanceTracker.endTiming('selectOrganization');
        return result;
    }

    /**
     * Select project
     */
    async selectProject(projectId: string): Promise<boolean> {
        this.performanceTracker.startTiming('selectProject');
        const result = await this.entityService.selectProject(projectId);
        this.performanceTracker.endTiming('selectProject');
        return result;
    }

    /**
     * Select workspace
     */
    async selectWorkspace(workspaceId: string): Promise<boolean> {
        this.performanceTracker.startTiming('selectWorkspace');
        const result = await this.entityService.selectWorkspace(workspaceId);
        this.performanceTracker.endTiming('selectWorkspace');
        return result;
    }

    /**
     * Auto-select organization if only one available
     */
    async autoSelectOrganizationIfNeeded(skipCurrentCheck = false): Promise<AdobeOrg | undefined> {
        return this.entityService.autoSelectOrganizationIfNeeded(skipCurrentCheck);
    }
}
