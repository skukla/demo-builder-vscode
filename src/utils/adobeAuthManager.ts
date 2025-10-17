import { Logger } from './logger';
import { getLogger } from './debugLogger';
import { ExternalCommandManager } from './externalCommandManager';
import { StepLogger } from './stepLogger';
import { TIMEOUTS, CACHE_TTL } from './timeoutConfig';
import * as path from 'path';
// @ts-expect-error - Adobe SDK lacks TypeScript declarations
import * as sdk from '@adobe/aio-lib-console';
import { AuthState, AuthContext, AuthRequirements } from './adobeAuthTypes';
import { AdobeAuthError, AuthErrorCode } from './adobeAuthErrors';

export interface AdobeOrg {
    id: string;
    code: string;
    name: string;
}

export interface AdobeProject {
    id: string;
    name: string;
    title: string;
    description?: string;
    type?: string;
    org_id?: number;
}

export interface AdobeWorkspace {
    id: string;
    name: string;
    title?: string;
}

/**
 * Simplified Adobe Authentication Manager
 * Direct wrapper around Adobe CLI commands without complex state management
 * 
 * Performance Targets:
 * - Authentication check: < 3 seconds
 * - Config operations: < 3 seconds (read), < 5 seconds (write)
 * - API calls: < 5 seconds
 * - Total flow: 10-15 seconds
 */
export class AdobeAuthManager {
    private logger: Logger;
    private debugLogger = getLogger();
    private stepLogger: StepLogger;
    private commandManager: ExternalCommandManager;
    private performanceTiming: Map<string, number> = new Map();
    
    // Adobe Console SDK client for high-performance API operations
    // Initialized after successful authentication, provides 30x faster operations than CLI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private sdkClient: any | undefined = undefined;
    
    // Session caching for organization data
    // These cache the current selections to avoid redundant API calls
    private cachedOrganization: AdobeOrg | undefined = undefined;
    private cachedProject: AdobeProject | undefined = undefined;
    private cachedWorkspace: AdobeWorkspace | undefined = undefined;

    // Organization access validation caching (org-specific)
    // Prevents repeated validation of the same org within TTL window
    private validationCache: { org: string; isValid: boolean; expiry: number } | undefined;

    // Authentication status caching
    // Avoids repeated auth checks for short periods
    private cachedAuthStatus: boolean | undefined = undefined;
    private authCacheExpiry: number = 0;

    // Command result caching for performance optimization
    // These cache API responses to reduce Adobe CLI calls
    private orgListCache: { data: AdobeOrg[], expiry: number } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private consoleWhereCache: { data: any, expiry: number } | undefined;

    // Track when organization was just cleared due to validation failure
    // Used to show appropriate message: "Selected org lacks App Builder access"
    private orgClearedDueToValidation: boolean = false;

    /**
     * Cache Management Strategy:
     *
     * 1. Session caches (org/project/workspace) are cleared when selections change
     * 2. Validation cache is org-specific and cleared after login
     * 3. API result caches have short TTLs and are cleared on context changes
     * 4. All cache TTL values are centralized in timeoutConfig.ts
     *
     * This approach balances performance (fewer CLI calls) with data freshness.
     */
    
    /**
     * Clear Adobe CLI console context (org/project/workspace selections)
     */
    private async clearConsoleContext(): Promise<void> {
        try {
            // Run all three operations in parallel for better performance
            await Promise.all([
                this.commandManager.executeAdobeCLI('aio config delete console.org', { encoding: 'utf8' }),
                this.commandManager.executeAdobeCLI('aio config delete console.project', { encoding: 'utf8' }),
                this.commandManager.executeAdobeCLI('aio config delete console.workspace', { encoding: 'utf8' })
            ]);

            // Clear console.where cache since console context was cleared
            this.consoleWhereCache = undefined;

            this.debugLogger.debug('[Auth] Cleared Adobe CLI console context and invalidated cache');
        } catch (error) {
            this.debugLogger.debug('[Auth] Failed to clear console context:', error);
        }
    }

    /**
     * Validate if the current organization context is accessible
     */
    private async validateOrganizationAccess(): Promise<boolean> {
        try {
            // Try to list projects - this will fail with 403 if org is invalid
            // Use PROJECT_LIST timeout (30s) - validation needs time for slow networks
            const result = await this.commandManager.executeAdobeCLI(
                'aio console project list --json',
                { encoding: 'utf8', timeout: TIMEOUTS.PROJECT_LIST }
            );

            // If we get here without error, check the result
            // Success (code 0) or "no projects" message indicates valid org access
            if (result.code === 0) {
                return true;
            }

            // Check if it's just "no projects" vs access denied
            if (result.stderr && result.stderr.includes('no Project')) {
                return true; // Valid org, just no projects
            }

            // 403 Forbidden or other access errors indicate invalid org
            this.debugLogger.debug('[Auth] Organization access validation failed:', result.stderr);
            return false;
        } catch (error) {
            // Better timeout detection - check multiple indicators
            const errorString = error instanceof Error ? error.message : String(error);
            const errorObj = error as any;
            
            const isTimeout = 
                errorString.toLowerCase().includes('timeout') ||
                errorString.toLowerCase().includes('timed out') ||
                errorString.includes('ETIMEDOUT') ||
                errorObj?.code === 'ETIMEDOUT';
            
            if (isTimeout) {
                this.debugLogger.warn('[Auth] Organization validation timed out - assuming valid (network delay)');
                return true; // Fail-open: assume org is valid on timeout
            }
            
            this.debugLogger.debug('[Auth] Organization access validation error:', error);
            return false;
        }
    }

    /**
     * Check if we have an org context and validate it's accessible, clearing if invalid
     */
    public async validateAndClearInvalidOrgContext(forceValidation: boolean = false): Promise<void> {
        try {
            // Check if we have an organization context
            const result = await this.commandManager.executeAdobeCLI(
                'aio console where --json',
                { encoding: 'utf8', timeout: TIMEOUTS.API_CALL }
            );

            if (result.code === 0 && result.stdout) {
                const context = JSON.parse(result.stdout);
                
                // Cache the console.where result for subsequent calls
                // This prevents getCurrentOrganization/Project from re-querying CLI
                const now = Date.now();
                this.consoleWhereCache = {
                    data: context,
                    expiry: now + CACHE_TTL.CONSOLE_WHERE
                };
                this.debugLogger.debug('[Auth] Cached console.where result during validation');
                
                if (context.org) {
                    // Check if we've validated this org recently
                    if (!forceValidation && this.validationCache &&
                        this.validationCache.org === context.org &&
                        this.validationCache.expiry > now) {

                        this.debugLogger.debug(`[Auth] Using cached validation for ${context.org}: ${this.validationCache.isValid ? 'valid' : 'invalid'}`);

                        if (!this.validationCache.isValid) {
                            // Previously determined invalid, clear it
                            await this.clearConsoleContext();
                            this.clearCache();
                        }
                        return;
                    }

                    // Log user-friendly message only if actually validating
                    this.logger.info(`Verifying access to ${context.org}...`);
                    this.debugLogger.debug(`[Auth] Found organization context: ${context.org}, validating access...`);

                    // We have an org context, validate it's accessible
                    let isValid = await this.validateOrganizationAccess();
                    this.debugLogger.debug(`[Auth] First validation result for ${context.org}: ${isValid}`);

                    // If validation failed, retry once (network might be slow)
                    if (!isValid) {
                        this.logger.info('Retrying organization access validation...');
                        this.debugLogger.debug('[Auth] First validation failed, retrying once...');
                        isValid = await this.validateOrganizationAccess();
                        this.debugLogger.debug(`[Auth] Second validation result for ${context.org}: ${isValid}`);
                    }

                    // Cache the validation result (after retry if needed)
                    this.validationCache = {
                        org: context.org,
                        isValid,
                        expiry: now + CACHE_TTL.VALIDATION
                    };

                    if (!isValid) {
                        // Failed twice - now we clear
                        this.logger.info('Previous organization no longer accessible. Clearing selection...');
                        this.debugLogger.warn('[Auth] Organization context is invalid for current user - clearing');

                        await this.clearConsoleContext();
                        // Also clear our cache since the context changed
                        this.clearCache();

                        // Set flag to indicate org was cleared due to validation failure
                        // This helps distinguish "org lacks App Builder" from "no org selected yet"
                        this.orgClearedDueToValidation = true;
                        this.debugLogger.debug(`[Auth] Set orgClearedDueToValidation flag to true for ${context.org}`);

                        this.logger.info('Organization cleared. You will need to select a new organization.');
                    } else {
                        this.logger.info(`Successfully verified access to ${context.org}`);
                        this.debugLogger.debug('[Auth] Organization context is valid');
                    }
                } else {
                    this.debugLogger.debug('[Auth] No organization context found');
                }
            }
        } catch (error) {
            this.debugLogger.debug('[Auth] Failed to validate organization context:', error);
        }
    }

    /**
     * Check if organization was recently cleared due to validation failure
     * This flag is used to show appropriate message when org lacks App Builder access
     * @returns true if org was just cleared due to validation failure
     */
    public wasOrgClearedDueToValidation(): boolean {
        const result = this.orgClearedDueToValidation;
        this.debugLogger.debug(`[Auth] wasOrgClearedDueToValidation() called, returning: ${result}`);
        // Clear the flag after reading (one-time check)
        this.orgClearedDueToValidation = false;
        return result;
    }

    /**
     * Manually set the org rejected flag
     * Used when we detect a user selected an org that was rejected (e.g., no App Builder access)
     */
    public setOrgRejectedFlag(): void {
        this.orgClearedDueToValidation = true;
        this.debugLogger.debug('[Auth] Manually set orgClearedDueToValidation flag (org rejected during browser selection)');
    }

    /**
     * Auto-select organization if only one is available
     * Returns the selected organization or undefined
     */
    public async autoSelectOrganizationIfNeeded(skipCurrentCheck: boolean = false): Promise<AdobeOrg | undefined> {
        try {
            // Check if org already selected (unless explicitly skipped for performance)
            if (!skipCurrentCheck) {
                const currentOrg = await this.getCurrentOrganization();
                if (currentOrg) {
                    this.debugLogger.debug(`[Auth] Organization already selected: ${currentOrg.name}`);
                    return currentOrg;
                }
            } else {
                this.debugLogger.debug('[Auth] Skipping current org check - caller knows org is empty');
            }

            // Get available organizations
            this.debugLogger.debug('[Auth] No organization selected, fetching available organizations...');
            const orgs = await this.getOrganizations();

            if (orgs.length === 1) {
                // Auto-select single organization
                // DON'T call aio console org select (it times out / requires browser)
                // Just cache the org - Adobe CLI works fine without explicit select when authenticated
                this.logger.info(`Auto-selecting organization: ${orgs[0].name}`);
                this.cachedOrganization = orgs[0];
                return orgs[0];
            } else if (orgs.length > 1) {
                this.logger.info(`Found ${orgs.length} organizations - manual selection required`);
            } else {
                this.logger.warn('No organizations available for this user');
            }

            return undefined;
        } catch (error) {
            this.debugLogger.error('[Auth] Failed to auto-select organization:', error as Error);
            return undefined;
        }
    }

    public clearCache(): void {
        this.cachedOrganization = undefined;
        this.cachedProject = undefined;
        this.cachedWorkspace = undefined;
        this.cachedAuthStatus = undefined;
        this.authCacheExpiry = 0;
        this.validationCache = undefined;

        // Clear performance caches
        this.orgListCache = undefined;
        this.consoleWhereCache = undefined;

        this.debugLogger.debug('[Auth] Cleared session cache and performance caches');
    }

    /**
     * Ensure SDK is initialized and ready for use
     * Waits for SDK initialization if in progress
     * Returns true if SDK is available, false if fallback to CLI needed
     */
    public async ensureSDKInitialized(): Promise<boolean> {
        // Already initialized
        if (this.sdkClient) {
            this.debugLogger.debug('[Auth SDK] SDK already initialized');
            return true;
        }
        
        // Not initialized, do it now (blocking)
        this.debugLogger.debug('[Auth SDK] Ensuring SDK is initialized...');
        await this.initializeSDK();
        
        return this.sdkClient !== undefined;
    }

    /**
     * Initialize Adobe Console SDK client for high-performance operations
     * Called after successful authentication to enable SDK-based operations
     * Falls back to CLI if SDK initialization fails
     */
    private async initializeSDK(): Promise<void> {
        const sdkStartTime = Date.now();
        try {
            if (this.sdkClient) {
                return;
            }

            this.debugLogger.debug('[Auth SDK] Initializing SDK for faster operations');
            
            // Get CLI access token directly from CLI config (avoid Adobe's getToken which can open browser)
            const result = await this.commandManager.executeAdobeCLI(
                'aio config get ims.contexts.cli.access_token.token',
                { encoding: 'utf8', timeout: TIMEOUTS.SDK_INIT }
            );
            
            if (result.code !== 0 || !result.stdout) {
                return;
            }
            
            // Clean the token output
            const accessToken = result.stdout.trim().split('\n')
                .filter(line => !line.startsWith('Using Node') && !line.includes('fnm'))
                .join('\n').trim();
            
            if (!accessToken) {
                return;
            }

            // Initialize SDK with CLI token
            this.sdkClient = await sdk.init(accessToken, 'aio-cli-console-auth');
            
            const totalDuration = Date.now() - sdkStartTime;
            this.debugLogger.debug(`[Auth SDK] Initialized successfully in ${totalDuration}ms`);
            this.logger.info('[Auth] Enabled high-performance mode for Adobe operations');
            
        } catch (error) {
            const totalDuration = Date.now() - sdkStartTime;
            this.debugLogger.debug(`[Auth SDK] Initialization failed (${totalDuration}ms) - using CLI fallback`);
            this.sdkClient = undefined;
        }
    }

    constructor(
        extensionPath: string,
        logger: Logger,
        commandManager: ExternalCommandManager
    ) {
        this.logger = logger;
        this.commandManager = commandManager;
        
        // Initialize StepLogger with templates
        const templatesPath = path.join(extensionPath, 'templates', 'logging.json');
        this.stepLogger = new StepLogger(logger, undefined, templatesPath);
    }
    
    /**
     * Track performance timing for operations
     */
    private startTiming(operation: string): void {
        this.performanceTiming.set(operation, Date.now());
    }
    
    private endTiming(operation: string): number {
        const start = this.performanceTiming.get(operation);
        if (!start) return 0;
        
        const duration = Date.now() - start;
        this.performanceTiming.delete(operation);
        
        // Log performance metrics to debug channel
        this.debugLogger.debug(`Performance: ${operation} took ${duration}ms`);
        
        // Warn if operation exceeded expected time
        const expectedTimes: Record<string, number> = {
            'isAuthenticated': 3000,
            'getOrganizations': 5000,
            'getProjects': 5000,
            'getWorkspaces': 5000,
            'selectOrganization': 5000,
            'selectProject': 5000,
            'getCurrentOrganization': 3000,
            'getCurrentProject': 3000,
            'login': 30000
        };
        
        const expected = expectedTimes[operation];
        if (expected && duration > expected) {
            this.debugLogger.debug(`⚠️ Performance warning: ${operation} took ${duration}ms (expected <${expected}ms)`);
        }
        
        return duration;
    }

    /**
     * Inspect Adobe CLI token without making API calls
     * Returns token validity, expiration time, and optionally the token itself
     */
    private async inspectToken(): Promise<{ valid: boolean; expiresIn: number; token?: string }> {
        try {
            const [tokenResult, expiryResult] = await Promise.all([
                this.commandManager.executeAdobeCLI(
                    'aio config get ims.contexts.cli.access_token.token',
                    { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
                ),
                this.commandManager.executeAdobeCLI(
                    'aio config get ims.contexts.cli.access_token.expiry',
                    { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
                )
            ]);
            
            const token = tokenResult.stdout?.trim().split('\n')
                .filter(line => !line.startsWith('Using Node') && !line.includes('fnm'))
                .join('').trim();
            const expiryStr = expiryResult.stdout?.trim() || '0';
            const expiry = parseInt(expiryStr);
            const now = Date.now();
            
            // Debug logging for token inspection
            this.debugLogger.debug(`[Auth Token] Expiry string from CLI: ${expiryStr}`);
            this.debugLogger.debug(`[Auth Token] Expiry timestamp: ${expiry}`);
            this.debugLogger.debug(`[Auth Token] Current timestamp: ${now}`);
            this.debugLogger.debug(`[Auth Token] Difference (ms): ${expiry - now}`);
            this.debugLogger.debug(`[Auth Token] Difference (min): ${Math.floor((expiry - now) / 1000 / 60)}`);
            this.debugLogger.debug(`[Auth Token] Token length: ${token?.length || 0}`);
            
            if (!token || token.length < 100) {
                this.debugLogger.warn(`[Auth Token] Invalid token: length=${token?.length || 0}`);
                return { valid: false, expiresIn: 0 };
            }
            
            if (!expiry || expiry <= now) {
                const expiresIn = expiry > 0 ? Math.floor((expiry - now) / 1000 / 60) : 0;
                this.debugLogger.warn(`[Auth Token] Token expired or invalid: expiry=${expiry}, now=${now}, expiresIn=${expiresIn} min`);
                return { valid: false, expiresIn, token };
            }
            
            const expiresIn = Math.floor((expiry - now) / 1000 / 60);
            this.debugLogger.debug(`[Auth Token] Token valid, expires in ${expiresIn} minutes`);
            return { valid: true, expiresIn, token };
        } catch (error) {
            return { valid: false, expiresIn: 0 };
        }
    }

    /**
     * Inspect Adobe CLI context (org/project/workspace) without making API calls
     * Returns currently selected context from CLI config
     */
    private async inspectContext(): Promise<{ org?: string; project?: string; workspace?: string } | null> {
        try {
            const result = await this.commandManager.executeAdobeCLI(
                'aio console where --json',
                { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
            );
            
            if (result.code === 0 && result.stdout) {
                const cleanOutput = result.stdout.trim().split('\n')
                    .filter(line => !line.startsWith('Using Node') && !line.includes('fnm'))
                    .join('\n').trim();
                const context = JSON.parse(cleanOutput);
                return context.org ? context : null;
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Sync in-memory cache from CLI context
     * Reads org/project/workspace from CLI and populates cache with full details
     * SAFE: getOrganizations/getProjects/getWorkspaces use withAuthCheck without recursive calls
     */
    private async syncContextFromCLI(): Promise<void> {
        const context = await this.inspectContext();
        
        if (!context || !context.org) {
            this.cachedOrganization = undefined;
            this.cachedProject = undefined;
            this.cachedWorkspace = undefined;
            return;
        }
        
        // Sync org - fetch full details including numeric ID
        if (!this.cachedOrganization || this.cachedOrganization.name !== context.org) {
            try {
                // SAFE: getOrganizations() uses withAuthCheck({ needsOrg: false })
                // so it won't recursively call getCurrentOrganization()
                const orgs = await this.getOrganizations();
                this.cachedOrganization = orgs.find(o => o.name === context.org);
                if (this.cachedOrganization) {
                    this.debugLogger.debug(`[Auth] Synced org from CLI: ${this.cachedOrganization.name} (ID: ${this.cachedOrganization.id})`);
                }
            } catch (error) {
                this.debugLogger.debug('[Auth] Failed to sync org:', error);
            }
        }
        
        // Sync project - only if org is available
        if (this.cachedOrganization && context.project && (!this.cachedProject || this.cachedProject.name !== context.project)) {
            try {
                // SAFE: getProjects() needs org but we just set it above
                const projects = await this.getProjects();
                this.cachedProject = projects.find(p => p.name === context.project);
                if (this.cachedProject) {
                    this.debugLogger.debug(`[Auth] Synced project from CLI: ${this.cachedProject.name}`);
                }
            } catch (error) {
                this.debugLogger.debug('[Auth] Failed to sync project:', error);
            }
        }
        
        // Sync workspace - only if org and project are available
        if (this.cachedOrganization && this.cachedProject && context.workspace && 
            (!this.cachedWorkspace || this.cachedWorkspace.name !== context.workspace)) {
            try {
                // SAFE: getWorkspaces() needs org+project but we have both above
                const workspaces = await this.getWorkspaces();
                this.cachedWorkspace = workspaces.find(w => w.name === context.workspace);
                if (this.cachedWorkspace) {
                    this.debugLogger.debug(`[Auth] Synced workspace from CLI: ${this.cachedWorkspace.name}`);
                }
            } catch (error) {
                this.debugLogger.debug('[Auth] Failed to sync workspace:', error);
            }
        }
    }

    /**
     * Execute operation with auth check wrapper
     * Automatically validates token and context before operation
     */
    private async withAuthCheck<T>(
        requirements: AuthRequirements,
        operation: () => Promise<T>
    ): Promise<T> {
        // Check token - use cached status if available (refreshed every 30s)
        if (requirements.needsToken) {
            const now = Date.now();
            const hasCachedStatus = this.cachedAuthStatus !== undefined && now < this.authCacheExpiry;
            
            if (hasCachedStatus) {
                // Use cached status - avoid redundant CLI calls
                if (!this.cachedAuthStatus) {
                    throw AdobeAuthError.tokenExpired(0);
                }
            } else {
                // Cache expired or empty - inspect token
                const { valid, expiresIn } = await this.inspectToken();
                if (!valid) {
                    throw AdobeAuthError.tokenExpired(expiresIn);
                }
                
                // Update cache
                this.cachedAuthStatus = true;
                this.authCacheExpiry = now + CACHE_TTL.AUTH_STATUS;
            }
        }
        
        // Check org
        if (requirements.needsOrg) {
            const org = await this.getCurrentOrganization();
            if (!org) {
                throw AdobeAuthError.noOrganization();
            }
        }
        
        // Check project
        if (requirements.needsProject) {
            const project = await this.getCurrentProject();
            if (!project) {
                throw AdobeAuthError.noProject();
            }
        }
        
        // Check workspace
        if (requirements.needsWorkspace) {
            const workspace = await this.getCurrentWorkspace();
            if (!workspace) {
                throw AdobeAuthError.noWorkspace();
            }
        }
        
        // Execute operation with proper error wrapping
        try {
            return await operation();
        } catch (error) {
            // Convert CLI/API errors to AdobeAuthError
            if (error instanceof AdobeAuthError) {
                throw error;
            }
            
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
                throw AdobeAuthError.tokenExpired(0);
            }
            
            if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
                throw AdobeAuthError.permissionDenied(errorMsg);
            }
            
            throw AdobeAuthError.apiError(errorMsg);
        }
    }

    /**
     * Get current auth context (state + all cached data)
     * Central method for checking authentication state
     */
    public async getAuthContext(): Promise<AuthContext> {
        // Use cached token status if available (30s cache)
        const now = Date.now();
        let valid: boolean;
        let expiresIn: number;
        
        if (this.cachedAuthStatus !== undefined && now < this.authCacheExpiry) {
            // Use cached status
            valid = this.cachedAuthStatus;
            expiresIn = 0; // We don't cache the expiresIn, just validity
            
            // If cached as invalid, we can return early
            if (!valid) {
                return {
                    state: AuthState.TOKEN_EXPIRED
                };
            }
        } else {
            // Cache expired or empty - inspect token
            const inspection = await this.inspectToken();
            valid = inspection.valid;
            expiresIn = inspection.expiresIn;
            
            // Update cache
            this.cachedAuthStatus = valid;
            this.authCacheExpiry = now + CACHE_TTL.AUTH_STATUS;
        }
        
        if (!valid) {
            return {
                state: expiresIn < 0 ? AuthState.TOKEN_EXPIRED : AuthState.UNAUTHENTICATED
            };
        }
        
        // Initialize SDK for 30x faster operations (non-blocking)
        if (!this.sdkClient) {
            this.debugLogger.debug('[Auth] Attempting SDK initialization...');
            this.initializeSDK().catch((error) => {
                // SDK failure is not critical - will use CLI fallback
                this.debugLogger.debug('[Auth] SDK initialization promise rejected:', error);
            });
        } else {
            this.debugLogger.debug('[Auth] SDK already initialized');
        }
        
        // Sync from CLI if cache is empty (e.g., after browser login)
        if (!this.cachedOrganization) {
            await this.syncContextFromCLI();
        }
        
        const org = this.cachedOrganization;
        
        if (!org) {
            return {
                state: AuthState.AUTHENTICATED_NO_ORG,
                token: { valid, expiresIn }
            };
        }
        
        if (expiresIn < 30) {
            return {
                state: AuthState.TOKEN_EXPIRING_SOON,
                token: { valid, expiresIn },
                org,
                project: this.cachedProject,
                workspace: this.cachedWorkspace
            };
        }
        
        return {
            state: AuthState.AUTHENTICATED_WITH_ORG,
            token: { valid, expiresIn },
            org,
            project: this.cachedProject,
            workspace: this.cachedWorkspace
        };
    }

    /**
     * Quick authentication check - only verifies token existence and expiry
     * Does NOT validate org access or initialize SDK
     * Use this for dashboard loads and other performance-critical paths
     * 
     * Performance: < 1 second (vs 9+ seconds for full isAuthenticated)
     */
    public async isAuthenticatedQuick(): Promise<boolean> {
        const now = Date.now();
        if (this.cachedAuthStatus !== undefined && now < this.authCacheExpiry) {
            return this.cachedAuthStatus;
        }
        
        const { valid } = await this.inspectToken();
        
        this.cachedAuthStatus = valid;
        this.authCacheExpiry = now + CACHE_TTL.AUTH_STATUS;
        
        return valid;
    }

    /**
     * Check if authenticated - check for access token
     * ALSO validates org access and initializes SDK
     * Use this when you need full authentication context
     * 
     * Performance: 3-10 seconds (includes org validation)
     * For faster checks, use isAuthenticatedQuick()
     */
    public async isAuthenticated(bypassCache: boolean = false): Promise<boolean> {
        const now = Date.now();
        if (!bypassCache && this.cachedAuthStatus !== undefined && now < this.authCacheExpiry) {
            return this.cachedAuthStatus;
        }
        
        const { valid, expiresIn } = await this.inspectToken();
        
        if (!valid) {
            this.cachedAuthStatus = false;
            this.authCacheExpiry = now + CACHE_TTL.AUTH_STATUS;
            return false;
        }
        
        this.debugLogger.debug(`[Auth] Token valid, expires in ${expiresIn} minutes`);
        
        if (!this.sdkClient) {
            this.initializeSDK().catch(() => {
                // SDK failure is not critical
            });
        }
        
        this.cachedAuthStatus = true;
        this.authCacheExpiry = now + CACHE_TTL.AUTH_STATUS;
        
        return true;
    }

    /**
     * Get current organization from CLI using 'aio console where'
     * Uses session caching for better performance
     */
    public async getCurrentOrganization(): Promise<AdobeOrg | undefined> {
        if (this.cachedOrganization) {
            return this.cachedOrganization;
        }
        await this.syncContextFromCLI();
        return this.cachedOrganization;
    }

    /**
     * Get current project from CLI using 'aio console where'
     * Uses session caching for better performance
     */
    public async getCurrentProject(): Promise<AdobeProject | undefined> {
        if (this.cachedProject) {
            return this.cachedProject;
        }
        await this.syncContextFromCLI();
        return this.cachedProject;
    }

    /**
     * Get current workspace from CLI using 'aio console where'
     * Uses session caching for better performance
     */
    public async getCurrentWorkspace(): Promise<AdobeWorkspace | undefined> {
        if (this.cachedWorkspace) {
            return this.cachedWorkspace;
        }
        await this.syncContextFromCLI();
        return this.cachedWorkspace;
    }

    /**
     * Get current context (org, project, workspace) using cached data when available
     * Falls back to CLI call only when cache is empty
     */
    public async getCurrentContext(): Promise<{
        organization?: AdobeOrg;
        project?: AdobeProject;
        workspace?: AdobeWorkspace;
    }> {
        // Check if all data is cached - if so, return immediately
        if (this.cachedOrganization && this.cachedProject && this.cachedWorkspace) {
            this.debugLogger.debug('[Auth] Using fully cached context data');
            return {
                organization: this.cachedOrganization,
                project: this.cachedProject,
                workspace: this.cachedWorkspace
            };
        }
        
        // Use individual cached methods which will fetch only missing data
        this.debugLogger.debug('[Auth] Fetching context using cached methods');
        const [organization, project, workspace] = await Promise.all([
            this.getCurrentOrganization(),
            this.getCurrentProject(),
            this.getCurrentWorkspace()
        ]);
        
        return {
            organization,
            project,
            workspace
        };
    }

    /**
     * Login - opens browser and waits for completion
     */
    public async login(force: boolean = false): Promise<boolean> {
        this.startTiming('login');
        try {
            this.stepLogger.logTemplate('adobe-setup', 'operations.opening-browser', {});
            this.debugLogger.debug(`[Auth] Initiating Adobe login${force ? ' (forced)' : ''}`);

            // CRITICAL: Check for corrupted token (exists but expiry = 0)
            // This happens when Adobe CLI has a token but no expiry timestamp
            // aio auth login will see the token and return immediately without opening browser
            const tokenCheck = await this.inspectToken();
            if (tokenCheck.token && tokenCheck.expiresIn === 0) {
                this.debugLogger.warn('[Auth] Detected corrupted token (expiry = 0), forcing logout to clear it');
                try {
                    await this.logout();
                } catch (logoutError) {
                    this.debugLogger.debug('[Auth] Logout failed (non-critical):', logoutError);
                }
            }

            // If forced login, clear console context BEFORE login to ensure clean state
            if (force) {
                this.debugLogger.debug('[Auth] Clearing console context before forced login');
                await this.clearConsoleContext();
                this.clearCache();
            }

            // Execute login command WITHOUT -b flag so token is stored properly
            const loginCommand = force ? 'aio auth login -f' : 'aio auth login';
            
            this.debugLogger.debug('[Auth] Executing login command, browser should open');
            this.stepLogger.logTemplate('adobe-setup', 'statuses.browser-opened', {});
            this.stepLogger.logTemplate('adobe-setup', 'operations.waiting-authentication', {});
            
            // Add timeout to the command execution (2 minutes)
            const result = await this.commandManager.executeAdobeCLI(
                loginCommand,
                { 
                    encoding: 'utf8',
                    timeout: TIMEOUTS.BROWSER_AUTH
                }
            ).catch(error => {
                // Check if it's a timeout
                if (error.message?.includes('timeout')) {
                    this.logger.warn('[Auth] Authentication timed out. The browser window may have been closed or the session expired.');
                    this.stepLogger.logTemplate('adobe-setup', 'error', { 
                        item: 'Authentication', 
                        error: 'Timed out waiting for browser authentication' 
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
                
                return null;
            });
            
            // Check if command succeeded
            if (result && result.code === 0) {
                this.debugLogger.debug('[Auth] Login command completed successfully');
                
                // CRITICAL: Don't manually extract/store token from stdout!
                // Modern Adobe CLI versions store the token automatically in their own format.
                // Manually overwriting it can corrupt the token or make it invalid for API calls.
                // Instead, trust that Adobe CLI has stored the token correctly and verify it works.
                
                this.debugLogger.debug('[Auth] Waiting for CLI to complete token storage...');
                
                // Wait for CLI config files to be fully written
                // The browser login writes org context + token asynchronously
                await new Promise(resolve => setTimeout(resolve, TIMEOUTS.POST_LOGIN_DELAY));
                
                // CRITICAL: Verify token has valid expiry after login
                this.debugLogger.debug('[Auth] Checking if token has valid expiry...');
                const postLoginToken = await this.inspectToken();
                
                // DEBUG: Log what we got back from inspectToken
                this.debugLogger.debug(`[Auth] Post-login token inspection result:`);
                this.debugLogger.debug(`[Auth]   - valid: ${postLoginToken.valid}`);
                this.debugLogger.debug(`[Auth]   - expiresIn: ${postLoginToken.expiresIn}`);
                this.debugLogger.debug(`[Auth]   - token exists: ${!!postLoginToken.token}`);
                this.debugLogger.debug(`[Auth]   - token length: ${postLoginToken.token?.length || 0}`);
                this.debugLogger.debug(`[Auth] Checking corruption condition: token=${!!postLoginToken.token}, expiresIn=${postLoginToken.expiresIn}, condition=${postLoginToken.token && postLoginToken.expiresIn === 0}`);
                
                if (postLoginToken.token && postLoginToken.expiresIn === 0) {
                    this.debugLogger.debug('[Auth] CORRUPTION DETECTED - entering error path');
                    this.logger.error('[Auth] Login completed but token still has expiry = 0 (corrupted)');
                    this.logger.error('[Auth] This indicates Adobe CLI is not storing the token correctly');
                    this.logger.error('[Auth] Try running: aio auth logout && aio auth login in a terminal');
                    
                    // Throw specific error so UI can show proper message
                    throw new Error('ADOBE_CLI_TOKEN_CORRUPTION: Adobe CLI failed to store authentication token correctly. Please run "aio auth logout && aio auth login" in your terminal to fix this issue.');
                }
                this.debugLogger.debug(`[Auth] Token expiry verified: ${postLoginToken.expiresIn} minutes remaining`);
                
                // Verify that we can actually fetch organizations before declaring success
                this.debugLogger.debug('[Auth] Verifying org access after login...');
                try {
                    const orgs = await this.getOrganizations();
                    
                    if (orgs.length === 0) {
                        this.debugLogger.warn('[Auth] Login succeeded but no organizations found - CLI context may not be ready yet');
                        
                        // Wait a bit longer and retry once
                        this.debugLogger.debug('[Auth] Waiting additional time for org context...');
                        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.POST_LOGIN_RETRY_DELAY));
                        
                        const retryOrgs = await this.getOrganizations();
                        if (retryOrgs.length === 0) {
                            this.logger.error('[Auth] No organizations accessible even after retry. This could mean:');
                            this.logger.error('[Auth]   - Your Adobe account has no organizations');
                            this.logger.error('[Auth]   - The authentication scope is incorrect');
                            this.logger.error('[Auth]   - There is a permissions issue with your account');
                            return false;
                        }
                        
                        this.debugLogger.debug(`[Auth] Found ${retryOrgs.length} organizations after retry`);
                    } else {
                        this.debugLogger.debug(`[Auth] Successfully verified access to ${orgs.length} organizations`);
                    }
                    
                    this.stepLogger.logTemplate('adobe-setup', 'statuses.authentication-complete', {});
                    
                    // Clear auth cache to force fresh check next time
                    this.cachedAuthStatus = undefined;
                    this.authCacheExpiry = 0;

                    // Clear validation cache after login to ensure fresh validation for new user
                    this.validationCache = undefined;

                    // If this was a forced login, just clear cache (console context already cleared before login)
                    if (force) {
                        this.clearCache();
                    }

                    return true;
                    
                } catch (orgError) {
                    this.debugLogger.error('[Auth] Failed to verify org access after login', orgError as Error);
                    this.logger.error('[Auth] Login succeeded but could not access organizations. Please try again.');
                    this.logger.error('[Auth] If this persists, try: aio auth logout && aio auth login');
                    return false;
                }
            } else {
                const exitCode = result?.code ?? 'unknown';
                const stderr = result?.stderr?.trim() || '';
                const stdout = result?.stdout?.trim() || '';
                this.debugLogger.debug(`[Auth] Login command failed with exit code: ${exitCode}`);
                if (stderr) {
                    this.debugLogger.debug(`[Auth] Error output: ${stderr}`);
                    this.logger.error(`Adobe login failed: ${stderr}`);
                }
                if (stdout && stdout.length < 500) {
                    this.debugLogger.debug(`[Auth] Command output: ${stdout}`);
                }
            }
            
            // Command failed or token verification failed
            return false;
            
        } catch (error) {
            this.logger.error('[Auth] Adobe login failed', error as Error);
            return false;
        }
    }

    /**
     * Logout
     */
    public async logout(): Promise<void> {
        try {
            await this.commandManager.executeAdobeCLI(
                'aio auth logout',
                { encoding: 'utf8' }
            );
            
            this.stepLogger.logTemplate('adobe-setup', 'success', { item: 'Logout' });
        } catch (error) {
            this.debugLogger.error('[Auth] Logout failed', error as Error);
            throw error;
        }
    }

    /**
     * Resolve numeric org ID for current organization if not already cached
     * This is called lazily when numeric ID is needed (e.g., for listing projects)
     * Returns true if org cache was updated with numeric ID, false otherwise
     */
    private async resolveOrgNumericId(): Promise<boolean> {
        try {
            // Check if we already have a cached org with numeric ID
            if (this.cachedOrganization && this.cachedOrganization.id !== this.cachedOrganization.name) {
                this.debugLogger.debug('[Auth] Org already has numeric ID, no resolution needed');
                return true;
            }
            
            if (!this.cachedOrganization) {
                this.debugLogger.debug('[Auth] No cached org to resolve ID for');
                return false;
            }
            
            this.debugLogger.debug(`[Auth] Resolving numeric ID for org: ${this.cachedOrganization.name}`);
            
            // Try to get org list (this may trigger re-auth if needed)
            const orgs = await this.getOrganizations();
            const matchedOrg = orgs.find(o => 
                o.name === this.cachedOrganization!.name || 
                o.code === this.cachedOrganization!.code
            );
            
            if (matchedOrg) {
                this.debugLogger.debug(`[Auth] Resolved org "${this.cachedOrganization.name}" to ID: ${matchedOrg.id}`);
                this.cachedOrganization = matchedOrg;
                return true;
            } else {
                this.debugLogger.warn(`[Auth] Could not find numeric ID for org "${this.cachedOrganization.name}"`);
                return false;
            }
        } catch (error) {
            this.debugLogger.debug('[Auth] Failed to resolve org numeric ID:', error);
            return false;
        }
    }

    /**
     * Get organizations (SDK with CLI fallback)
     */
    public async getOrganizations(): Promise<AdobeOrg[]> {
        return this.withAuthCheck(
            { needsToken: true, needsOrg: false, needsProject: false, needsWorkspace: false },
            async () => {
                const startTime = Date.now();
                
                // Check cache first
                const now = Date.now();
                if (this.orgListCache && now < this.orgListCache.expiry) {
                    this.debugLogger.debug('[Auth] Using cached organization list');
                    return this.orgListCache.data;
                }

                this.stepLogger.logTemplate('adobe-setup', 'loading-organizations', {});

                let mappedOrgs: AdobeOrg[] = [];

                // Try SDK first for 30x performance improvement
                if (this.sdkClient) {
                    try {
                        this.debugLogger.debug('[Auth SDK] Fetching organizations via SDK (fast path)');
                        
                        const sdkResult = await this.sdkClient.getOrganizations();
                        const sdkDuration = Date.now() - startTime;
                        
                        if (sdkResult.body && Array.isArray(sdkResult.body)) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            mappedOrgs = sdkResult.body.map((org: any) => ({
                                id: org.id,
                                code: org.code,
                                name: org.name
                            }));
                            
                            this.debugLogger.debug(`[Auth SDK] Retrieved ${mappedOrgs.length} organizations via SDK in ${sdkDuration}ms`);
                        } else {
                            throw new Error('Invalid SDK response format');
                        }
                    } catch (sdkError) {
                        // SDK failed, fall back to CLI
                        this.debugLogger.debug('[Auth SDK] SDK failed, falling back to CLI:', sdkError);
                        this.debugLogger.warn('[Auth] SDK unavailable, using slower CLI fallback for organizations');
                    }
                }

                // CLI fallback (if SDK not available or failed)
                if (mappedOrgs.length === 0) {
                    this.debugLogger.debug('[Auth CLI] Fetching organizations via CLI (fallback path)');
                    
                    const result = await this.commandManager.executeAdobeCLI(
                        'aio console org list --json',
                        { encoding: 'utf8' }
                    );
                    
                    const cliDuration = Date.now() - startTime;

                    if (result.code !== 0) {
                        throw new Error(`Failed to get organizations: ${result.stderr}`);
                    }

                    const orgs = JSON.parse(result.stdout);

                    if (!Array.isArray(orgs)) {
                        throw new Error('Invalid organizations response format');
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    mappedOrgs = orgs.map((org: any) => ({
                        id: org.id,
                        code: org.code,
                        name: org.name
                    }));
                    
                    this.debugLogger.debug(`[Auth CLI] Retrieved ${mappedOrgs.length} organizations via CLI in ${cliDuration}ms`);
                }

                // Cache the result
                this.orgListCache = {
                    data: mappedOrgs,
                    expiry: now + CACHE_TTL.ORG_LIST
                };

                this.stepLogger.logTemplate('adobe-setup', 'found', {
                    count: mappedOrgs.length,
                    item: mappedOrgs.length === 1 ? 'organization' : 'organizations'
                });

                return mappedOrgs;
            }
        );
    }

    /**
     * Select organization
     */
    public async selectOrganization(orgId: string): Promise<boolean> {
        this.startTiming('selectOrganization');
        try {
            this.stepLogger.logTemplate('adobe-setup', 'operations.selecting', { item: 'organization' });
            this.debugLogger.debug(`[Auth] Selecting organization ${orgId} with explicit timeout`);

            // Use the org ID directly
            const result = await this.commandManager.executeAdobeCLI(
                `aio console org select ${orgId}`,
                {
                    encoding: 'utf8',
                    timeout: TIMEOUTS.CONFIG_WRITE // Use shorter timeout for config operations
                }
            );

            this.debugLogger.debug(`[Auth] Organization select command completed with code: ${result.code}`);

            if (result.code === 0) {
                this.stepLogger.logTemplate('adobe-setup', 'statuses.organization-selected', { name: orgId });

                // Clear validation failure flag since new org was successfully selected
                this.orgClearedDueToValidation = false;

                // Smart caching: populate org cache directly instead of clearing
                // This prevents the next getCurrentOrganization() from querying CLI
                try {
                    const orgs = await this.getOrganizations();
                    const selectedOrg = orgs.find(o => o.id === orgId);
                    
                    if (selectedOrg) {
                        this.cachedOrganization = selectedOrg;
                        this.debugLogger.debug(`[Auth] Cached selected organization: ${selectedOrg.name}`);
                    } else {
                        this.cachedOrganization = undefined;
                        this.debugLogger.warn(`[Auth] Could not find org ${orgId} in list, cleared cache`);
                    }
                } catch (error) {
                    this.debugLogger.debug('[Auth] Failed to cache org after selection:', error);
                    this.cachedOrganization = undefined;
                }

                // Clear downstream caches since org changed
                this.cachedProject = undefined;
                this.cachedWorkspace = undefined;
                this.consoleWhereCache = undefined;

                this.debugLogger.debug('[Auth] Cleared project, workspace, and console.where cache after org selection');

                return true;
            }

            this.debugLogger.debug(`[Auth] Organization select failed with code: ${result.code}, stderr: ${result.stderr}`);
            return false;
        } catch (error) {
            this.debugLogger.error('[Auth] Failed to select organization', error as Error);
            return false;
        } finally {
            this.endTiming('selectOrganization');
        }
    }

    /**
     * Get projects (SDK with CLI fallback)
     */
    public async getProjects(): Promise<AdobeProject[]> {
        return this.withAuthCheck(
            { needsToken: true, needsOrg: true, needsProject: false, needsWorkspace: false },
            async () => {
                this.startTiming('getProjects');
                const startTime = Date.now();
                
                this.stepLogger.logTemplate('adobe-setup', 'operations.loading-projects', {});
                
                // Note: We deliberately do NOT resolve numeric org ID here to avoid triggering browser auth
                // The CLI command `aio console project list` works with org name, not numeric ID
                // Only resolve numeric ID if SDK is available and we want to use it
                
                let mappedProjects: AdobeProject[] = [];

                // Try SDK first if available and we have a NUMERIC org ID
                // (SDK requires numeric ID, won't work with org name)
                const hasNumericOrgId = this.cachedOrganization?.id && 
                                       this.cachedOrganization.id !== this.cachedOrganization.name &&
                                       !isNaN(Number(this.cachedOrganization.id));
                
                if (this.sdkClient && hasNumericOrgId) {
                    try {
                        this.debugLogger.debug(`[Auth SDK] Fetching projects for org ${this.cachedOrganization!.id} via SDK (fast path)`);
                        
                        const sdkResult = await this.sdkClient.getProjectsForOrg(this.cachedOrganization!.id);
                        const sdkDuration = Date.now() - startTime;
                        
                        if (sdkResult.body && Array.isArray(sdkResult.body)) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            mappedProjects = sdkResult.body.map((proj: any) => ({
                                id: proj.id,
                                name: proj.name,
                                title: proj.title || proj.name,
                                description: proj.description,
                                type: proj.type,
                                org_id: proj.org_id
                            }));
                            
                            this.debugLogger.debug(`[Auth SDK] Retrieved ${mappedProjects.length} projects via SDK in ${sdkDuration}ms`);
                        } else {
                            throw new Error('Invalid SDK response format');
                        }
                    } catch (sdkError) {
                        this.debugLogger.debug('[Auth SDK] SDK failed, falling back to CLI:', sdkError);
                        this.debugLogger.warn('[Auth] SDK unavailable, using slower CLI fallback for projects');
                    }
                } else {
                    if (this.sdkClient) {
                        this.debugLogger.debug('[Auth CLI] Using CLI for projects (cached org ID is name, not numeric)');
                    } else {
                        this.debugLogger.debug('[Auth CLI] Using CLI for projects (SDK not available)');
                    }
                }

                // CLI fallback
                if (mappedProjects.length === 0) {
                    this.debugLogger.debug('[Auth CLI] Fetching projects via CLI (fallback path)');
                    
                    // Get current org to pass as parameter (Adobe CLI requires org context)
                    const currentOrg = await this.getCurrentOrganization();
                    if (!currentOrg) {
                        throw new Error('No organization selected. Please select an organization first.');
                    }
                    
                    // Pass org ID to the command (Adobe CLI needs to know which org to list projects for)
                    // Note: Parameter is --orgId (camelCase), not --org-id
                    const orgIdParam = currentOrg.id ? ` --orgId=${currentOrg.id}` : '';
                    this.debugLogger.debug(`[Auth CLI] Listing projects for org ${currentOrg.name} (ID: ${currentOrg.id})`);
                    
                    const result = await this.commandManager.executeAdobeCLI(
                        `aio console project list --json${orgIdParam}`,
                        { encoding: 'utf8' }
                    );
                    
                    const cliDuration = Date.now() - startTime;
                    
                    if (result.code !== 0) {
                        // Check if it's just no projects
                        if (result.stderr?.includes('does not have any projects')) {
                            this.debugLogger.debug('[Auth CLI] No projects found for organization');
                            return [];
                        }
                        throw new Error(`Failed to get projects: ${result.stderr}`);
                    }
                    
                    const projects = JSON.parse(result.stdout);
                    
                    if (!Array.isArray(projects)) {
                        throw new Error('Invalid projects response format');
                    }
                    
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    mappedProjects = projects.map((proj: any) => ({
                        id: proj.id,
                        name: proj.name,
                        title: proj.title || proj.name,
                        description: proj.description,
                        type: proj.type,
                        org_id: proj.org_id
                    }));
                    
                    this.debugLogger.debug(`[Auth CLI] Retrieved ${mappedProjects.length} projects via CLI in ${cliDuration}ms`);
                }
                
                this.stepLogger.logTemplate('adobe-setup', 'statuses.projects-loaded', { 
                    count: mappedProjects.length, 
                    plural: mappedProjects.length === 1 ? '' : 's' 
                });
                
                return mappedProjects;
            }
        );
    }

    /**
     * Select project
     */
    public async selectProject(projectId: string): Promise<boolean> {
        this.startTiming('selectProject');
        try {
            this.stepLogger.logTemplate('adobe-setup', 'operations.selecting', { item: 'project' });
            this.debugLogger.debug(`[Auth] Selecting project ${projectId} with explicit timeout`);

            const result = await this.commandManager.executeAdobeCLI(
                `aio console project select ${projectId}`,
                {
                    encoding: 'utf8',
                    timeout: TIMEOUTS.CONFIG_WRITE // Use shorter timeout for config operations
                }
            );

            this.debugLogger.debug(`[Auth] Project select command completed with code: ${result.code}`);

            if (result.code === 0) {
                this.stepLogger.logTemplate('adobe-setup', 'statuses.project-selected', { name: projectId });

                // Smart caching: populate project cache directly instead of clearing
                // This prevents the next getCurrentProject() from querying CLI + SDK
                try {
                    const projects = await this.getProjects();
                    const selectedProject = projects.find(p => p.id === projectId);
                    
                    if (selectedProject) {
                        this.cachedProject = selectedProject;
                        this.debugLogger.debug(`[Auth] Cached selected project: ${selectedProject.name}`);
                    } else {
                        this.cachedProject = undefined;
                        this.debugLogger.warn(`[Auth] Could not find project ${projectId} in list, cleared cache`);
                    }
                } catch (error) {
                    this.debugLogger.debug('[Auth] Failed to cache project after selection:', error);
                    this.cachedProject = undefined;
                }

                // Clear downstream caches since project changed
                this.cachedWorkspace = undefined;
                this.consoleWhereCache = undefined;

                this.debugLogger.debug('[Auth] Cleared workspace and console.where cache after project selection');

                return true;
            }

            this.debugLogger.debug(`[Auth] Project select failed with code: ${result.code}, stderr: ${result.stderr}`);
            
            // Check for 403 Forbidden - wrong org or expired token
            if (result.stderr?.includes('403') || result.stderr?.includes('Forbidden') || 
                result.stderr?.includes('not allowed to access')) {
                this.logger.warn('[Auth] Project selection denied - token may be for wrong organization');
                throw AdobeAuthError.permissionDenied(
                    'Your Adobe session may be for a different organization. Please sign in again.'
                );
            }
            
            return false;
        } catch (error) {
            // Check if it's already an AdobeAuthError
            if (error instanceof AdobeAuthError) {
                throw error;
            }
            
            // Check if command succeeded despite timeout
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const err = error as any;
            if (err.stdout && err.stdout.includes('Project selected :')) {
                this.debugLogger.debug('[Auth] Project selection succeeded despite timeout');
                this.stepLogger.logTemplate('adobe-setup', 'statuses.project-selected', { name: projectId });

                // Smart caching even on timeout success
                try {
                    const projects = await this.getProjects();
                    const selectedProject = projects.find(p => p.id === projectId);
                    
                    if (selectedProject) {
                        this.cachedProject = selectedProject;
                        this.debugLogger.debug(`[Auth] Cached selected project: ${selectedProject.name}`);
                    }
                } catch (cacheError) {
                    this.debugLogger.debug('[Auth] Failed to cache project after timeout success:', cacheError);
                    this.cachedProject = undefined;
                }

                // Clear downstream caches
                this.cachedWorkspace = undefined;
                this.consoleWhereCache = undefined;

                this.debugLogger.debug('[Auth] Cleared workspace and console.where cache after project selection');
                return true;
            }

            this.debugLogger.error('[Auth] Failed to select project', error as Error);
            return false;
        } finally {
            this.endTiming('selectProject');
        }
    }

    /**
     * Get workspaces (SDK with CLI fallback)
     */
    public async getWorkspaces(): Promise<AdobeWorkspace[]> {
        return this.withAuthCheck(
            { needsToken: true, needsOrg: true, needsProject: true, needsWorkspace: false },
            async () => {
                this.startTiming('getWorkspaces');
                const startTime = Date.now();
                
                this.stepLogger.logTemplate('adobe-setup', 'operations.retrieving-workspaces', {});
                
                let mappedWorkspaces: AdobeWorkspace[] = [];

                // Try SDK first if available and we have both org ID and project ID
                if (this.sdkClient && this.cachedOrganization?.id && this.cachedProject?.id) {
                    try {
                        this.debugLogger.debug(`[Auth SDK] Fetching workspaces for project ${this.cachedProject.id} via SDK (fast path)`);
                        
                        const sdkResult = await this.sdkClient.getWorkspacesForProject(
                            this.cachedOrganization.id,
                            this.cachedProject.id
                        );
                        const sdkDuration = Date.now() - startTime;
                        
                        if (sdkResult.body && Array.isArray(sdkResult.body)) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            mappedWorkspaces = sdkResult.body.map((ws: any) => ({
                                id: ws.id,
                                name: ws.name,
                                title: ws.title || ws.name
                            }));
                            
                            this.debugLogger.debug(`[Auth SDK] Retrieved ${mappedWorkspaces.length} workspaces via SDK in ${sdkDuration}ms`);
                        } else {
                            throw new Error('Invalid SDK response format');
                        }
                    } catch (sdkError) {
                        this.debugLogger.debug('[Auth SDK] SDK failed, falling back to CLI:', sdkError);
                        this.debugLogger.warn('[Auth] SDK unavailable, using slower CLI fallback for workspaces');
                    }
                } else if (this.sdkClient && (!this.cachedOrganization?.id || !this.cachedProject?.id)) {
                    this.debugLogger.debug('[Auth SDK] SDK available but missing org/project ID, using CLI');
                }

                // CLI fallback
                if (mappedWorkspaces.length === 0) {
                    this.debugLogger.debug('[Auth CLI] Fetching workspaces via CLI (fallback path)');
                    
                    const result = await this.commandManager.executeAdobeCLI(
                        'aio console workspace list --json',
                        { encoding: 'utf8' }
                    );
                    
                    const cliDuration = Date.now() - startTime;
                    
                    if (result.code !== 0) {
                        throw new Error(`Failed to get workspaces: ${result.stderr}`);
                    }
                    
                    const workspaces = JSON.parse(result.stdout);
                    
                    if (!Array.isArray(workspaces)) {
                        throw new Error('Invalid workspaces response format');
                    }
                    
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    mappedWorkspaces = workspaces.map((ws: any) => ({
                        id: ws.id,
                        name: ws.name,
                        title: ws.title || ws.name
                    }));
                    
                    this.debugLogger.debug(`[Auth CLI] Retrieved ${mappedWorkspaces.length} workspaces via CLI in ${cliDuration}ms`);
                }
                
                this.stepLogger.logTemplate('adobe-setup', 'statuses.workspaces-loaded', { 
                    count: mappedWorkspaces.length, 
                    plural: mappedWorkspaces.length === 1 ? '' : 's' 
                });
                
                return mappedWorkspaces;
            }
        );
    }

    /**
     * Select workspace
     */
    public async selectWorkspace(workspaceId: string): Promise<boolean> {
        this.startTiming('selectWorkspace');
        try {
            this.stepLogger.logTemplate('adobe-setup', 'operations.selecting', { item: 'workspace' });
            this.debugLogger.debug(`[Auth] Selecting workspace ${workspaceId} with explicit timeout`);

            const result = await this.commandManager.executeAdobeCLI(
                `aio console workspace select ${workspaceId}`,
                {
                    encoding: 'utf8',
                    timeout: TIMEOUTS.CONFIG_WRITE // Use shorter timeout for config operations
                }
            );

            this.debugLogger.debug(`[Auth] Workspace select command completed with code: ${result.code}`);

            if (result.code === 0) {
                this.stepLogger.logTemplate('adobe-setup', 'statuses.workspace-selected', { name: workspaceId });

                // Smart caching: populate workspace cache directly instead of clearing
                // This prevents the next getCurrentWorkspace() from querying CLI
                try {
                    const workspaces = await this.getWorkspaces();
                    const selectedWorkspace = workspaces.find(w => w.id === workspaceId);
                    
                    if (selectedWorkspace) {
                        this.cachedWorkspace = selectedWorkspace;
                        this.debugLogger.debug(`[Auth] Cached selected workspace: ${selectedWorkspace.name}`);
                    } else {
                        this.cachedWorkspace = undefined;
                        this.debugLogger.warn(`[Auth] Could not find workspace ${workspaceId} in list, cleared cache`);
                    }
                } catch (error) {
                    this.debugLogger.debug('[Auth] Failed to cache workspace after selection:', error);
                    this.cachedWorkspace = undefined;
                }

                // Invalidate console.where cache since CLI state changed
                this.consoleWhereCache = undefined;

                this.debugLogger.debug('[Auth] Updated workspace cache and cleared console.where cache after workspace selection');

                return true;
            }

            this.debugLogger.debug(`[Auth] Workspace select failed with code: ${result.code}, stderr: ${result.stderr}`);
            return false;
        } catch (error) {
            this.debugLogger.error('[Auth] Failed to select workspace', error as Error);
            return false;
        } finally {
            this.endTiming('selectWorkspace');
        }
    }
}