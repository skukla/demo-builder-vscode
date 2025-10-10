import { Logger } from './logger';
import { getLogger } from './debugLogger';
import { ExternalCommandManager } from './externalCommandManager';
import { StepLogger } from './stepLogger';
import { TIMEOUTS, CACHE_TTL } from './timeoutConfig';
import * as path from 'path';
// @ts-expect-error - Adobe SDK lacks TypeScript declarations
import * as sdk from '@adobe/aio-lib-console';
// @ts-expect-error - Adobe SDK lacks TypeScript declarations
import { getToken } from '@adobe/aio-lib-ims';

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
                this.debugLogger.debug(`[Auth] Auto-selecting single organization: ${orgs[0].name}`);
                this.logger.info(`Auto-selecting organization: ${orgs[0].name}`);

                const selected = await this.selectOrganization(orgs[0].id);

                if (selected) {
                    // Cache and return the selected org
                    this.cachedOrganization = orgs[0];
                    this.debugLogger.debug(`[Auth] Successfully auto-selected organization: ${orgs[0].name}`);
                    return orgs[0];
                }
            } else if (orgs.length > 1) {
                this.debugLogger.debug(`[Auth] Multiple organizations available (${orgs.length}), manual selection required`);
                this.logger.info(`Found ${orgs.length} organizations - manual selection required`);
            } else {
                this.debugLogger.warn('[Auth] No organizations available');
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
     * Initialize Adobe Console SDK client for high-performance operations
     * Called after successful authentication to enable SDK-based operations
     * Falls back to CLI if SDK initialization fails
     */
    private async initializeSDK(): Promise<void> {
        try {
            if (this.sdkClient) {
                this.debugLogger.debug('[Auth SDK] SDK client already initialized');
                return;
            }

            this.debugLogger.debug('[Auth SDK] Initializing Adobe Console SDK...');
            
            // Get CLI access token with timeout protection
            const accessToken = await Promise.race([
                getToken('cli'),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('SDK token fetch timed out')), TIMEOUTS.SDK_INIT)
                )
            ]) as string;
            
            if (!accessToken) {
                this.debugLogger.debug('[Auth SDK] No access token available, skipping SDK initialization');
                return;
            }

            // Initialize SDK with CLI token
            this.sdkClient = await sdk.init(accessToken, 'aio-cli-console-auth');
            
            this.debugLogger.debug('[Auth SDK] SDK initialized successfully - enabling 30x faster operations');
            this.logger.info('[Auth] Enabled high-performance mode for Adobe operations');
            
        } catch (error) {
            // SDK initialization failure is not critical - we'll fall back to CLI
            this.debugLogger.debug('[Auth SDK] Failed to initialize SDK, will use CLI fallback:', error);
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
     * Check if authenticated - check for access token
     */
    public async isAuthenticated(): Promise<boolean> {
        this.startTiming('isAuthenticated');
        
        // Check cache first
        const now = Date.now();
        if (this.cachedAuthStatus !== undefined && now < this.authCacheExpiry) {
            this.debugLogger.debug(`[Auth] Using cached authentication status: ${this.cachedAuthStatus}`);
            this.endTiming('isAuthenticated');
            return this.cachedAuthStatus;
        }
        
        try {
            this.debugLogger.debug('[Auth] Checking authentication status');
            this.stepLogger.logTemplate('adobe-setup', 'operations.checking', { item: 'authentication status' });
            
            // Check for access token and expiry in parallel for better performance
            // Use CONFIG_READ timeout to account for fnm startup time + Adobe CLI
            this.debugLogger.debug('[Auth] Running token and expiry checks in parallel');
            const [result, expiryResult] = await Promise.all([
                this.commandManager.executeAdobeCLI(
                    'aio config get ims.contexts.cli.access_token.token',
                    { encoding: 'utf8', timeout: TIMEOUTS.TOKEN_READ }
                ),
                this.commandManager.executeAdobeCLI(
                    'aio config get ims.contexts.cli.access_token.expiry',
                    { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
                )
            ]);
            
            // Clean the token output to remove any fnm messages that might have leaked through
            const stdout = result.stdout?.trim() || '';
            const cleanOutput = stdout.split('\n').filter(line => 
                !line.startsWith('Using Node') && 
                !line.includes('fnm') &&
                line.trim().length > 0
            ).join('\n').trim();
            
            // Adobe access tokens are long JWT strings (>100 chars), check for that
            const hasToken = result.code === 0 && cleanOutput.length > 100 && 
                             cleanOutput.includes('eyJ'); // JWT tokens start with eyJ
            
            if (hasToken) {
                
                if (expiryResult.code === 0 && expiryResult.stdout) {
                    // Clean expiry output as well
                    const expiryOutput = expiryResult.stdout.trim().split('\n')
                        .filter(line => !line.startsWith('Using Node') && !line.includes('fnm'))
                        .join('\n').trim();
                    const expiry = parseInt(expiryOutput);
                    const now = Date.now();
                    
                    if (!isNaN(expiry) && expiry > now) {
                        this.debugLogger.debug(`[Auth] Authentication valid (expires in ${Math.floor((expiry - now) / 1000 / 60)} minutes)`);

                        // Check if we have an org context and validate it's accessible
                        await this.validateAndClearInvalidOrgContext();

                        // Initialize SDK in background (non-blocking) for future high-performance operations
                        this.initializeSDK().catch(error => {
                            // SDK initialization failure is not critical - operations will fall back to CLI
                            this.debugLogger.debug('[Auth SDK] Background SDK init failed, using CLI fallback:', error);
                        });

                        this.stepLogger.logTemplate('adobe-setup', 'statuses.authentication-complete', {});

                        // Cache the successful result
                        this.cachedAuthStatus = true;
                        this.authCacheExpiry = Date.now() + CACHE_TTL.AUTH_STATUS;

                        this.endTiming('isAuthenticated');
                        return true;
                    } else {
                        const expiredMinutesAgo = Math.floor((now - expiry) / 1000 / 60);
                        this.debugLogger.debug(`[Auth] Token expired ${expiredMinutesAgo} minutes ago`);
                        this.logger.warn('[Auth] Your Adobe authentication has expired. Please log in again.');
                        this.stepLogger.logTemplate('adobe-setup', 'statuses.not-authenticated', {});
                        
                        // Cache the failed result  
                        this.cachedAuthStatus = false;
                        this.authCacheExpiry = Date.now() + CACHE_TTL.AUTH_STATUS;
                        
                        this.endTiming('isAuthenticated');
                        return false;
                    }
                } else {
                    // No expiry info, but we have a token, assume valid
                    this.debugLogger.debug('[Auth] Authentication status: authenticated (no expiry info)');

                    // Check if we have an org context and validate it's accessible
                    await this.validateAndClearInvalidOrgContext();

                    // Initialize SDK in background (non-blocking) for future high-performance operations
                    this.initializeSDK().catch(error => {
                        // SDK initialization failure is not critical - operations will fall back to CLI
                        this.debugLogger.debug('[Auth SDK] Background SDK init failed, using CLI fallback:', error);
                    });

                    this.stepLogger.logTemplate('adobe-setup', 'statuses.authentication-complete', {});

                    // Cache the successful result
                    this.cachedAuthStatus = true;
                    this.authCacheExpiry = Date.now() + CACHE_TTL.AUTH_STATUS;

                    this.endTiming('isAuthenticated');
                    return true;
                }
            } else {
                // Be specific about why authentication failed
                if (result.code !== 0) {
                    this.debugLogger.debug(`[Auth] Config command failed with code ${result.code}`);
                    this.logger.info('[Auth] Unable to access Adobe configuration. You may need to log in.');
                } else {
                    this.debugLogger.debug('[Auth] No access token found in configuration');
                    this.logger.info('[Auth] Not authenticated with Adobe. Please click "Log in to Adobe" to authenticate.');
                }
                this.stepLogger.logTemplate('adobe-setup', 'statuses.not-authenticated', {});
                
                // Cache the failed result
                this.cachedAuthStatus = false;
                this.authCacheExpiry = Date.now() + CACHE_TTL.AUTH_STATUS;
                
                this.endTiming('isAuthenticated');
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
            
            // Cache the failed result (but with shorter TTL for errors to allow retry)
            this.cachedAuthStatus = false;
            this.authCacheExpiry = Date.now() + (CACHE_TTL.AUTH_STATUS / 5); // 1 minute for errors
            
            this.endTiming('isAuthenticated');
            return false;
        }
    }

    /**
     * Get current organization from CLI using 'aio console where'
     * Uses session caching for better performance
     */
    public async getCurrentOrganization(): Promise<AdobeOrg | undefined> {
        this.startTiming('getCurrentOrganization');
        
        // Check cache first
        if (this.cachedOrganization) {
            this.debugLogger.debug('[Auth] Using cached organization data');
            this.endTiming('getCurrentOrganization');
            return this.cachedOrganization;
        }
        
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let context: any;

            // Check console.where cache first
            const now = Date.now();
            if (this.consoleWhereCache && now < this.consoleWhereCache.expiry) {
                this.debugLogger.debug('[Auth] Using cached console.where response');
                context = this.consoleWhereCache.data;
            } else {
                this.debugLogger.debug('[Auth] Fetching organization data from Adobe CLI');
                const result = await this.commandManager.executeAdobeCLI(
                    'aio console where --json',
                    { encoding: 'utf8', timeout: TIMEOUTS.API_CALL }
                );

                if (result.code === 0 && result.stdout) {
                    context = JSON.parse(result.stdout);

                    // Cache the result
                    this.consoleWhereCache = {
                        data: context,
                        expiry: now + CACHE_TTL.CONSOLE_WHERE
                    };

                    this.debugLogger.debug('[Auth] Raw Adobe CLI response:', JSON.stringify(context));
                } else {
                    this.endTiming('getCurrentOrganization');
                    return undefined;
                }
            }

            if (context) {

                // Check if organization is present in the response
                if (context.org) {
                    // Handle both string and object formats for org data
                    let orgData;
                    if (typeof context.org === 'string') {
                        // Adobe CLI returns org name as string
                        // We need to look up the numeric ID from the org list for SDK compatibility
                        if (context.org.trim()) {
                            this.debugLogger.debug(`[Auth] Current organization name: ${context.org}, fetching numeric ID...`);
                            
                            try {
                                // Use cached org list if available, otherwise fetch
                                const orgs = await this.getOrganizations();
                                const matchedOrg = orgs.find(o => o.name === context.org || o.code === context.org);
                                
                                if (matchedOrg) {
                                    this.debugLogger.debug(`[Auth] Resolved org "${context.org}" to ID: ${matchedOrg.id}`);
                                    orgData = matchedOrg;
                                } else {
                                    this.debugLogger.warn(`[Auth] Could not find numeric ID for org "${context.org}", using name as fallback`);
                                    orgData = {
                                        id: context.org, // Fallback to name if lookup fails
                                        code: context.org,
                                        name: context.org
                                    };
                                }
                            } catch (error) {
                                this.debugLogger.debug('[Auth] Failed to fetch org list for ID lookup:', error);
                                // Fallback to using name as ID
                                orgData = {
                                    id: context.org,
                                    code: context.org,
                                    name: context.org
                                };
                            }
                        } else {
                            this.debugLogger.debug('[Auth] Organization name is empty string');
                            this.endTiming('getCurrentOrganization');
                            return undefined;
                        }
                    } else if (context.org && typeof context.org === 'object') {
                        // Adobe CLI returns org as object (older format)
                        const orgName = context.org.name || context.org.id || 'Unknown';
                        this.debugLogger.debug(`[Auth] Current organization: ${orgName}`);
                        orgData = {
                            id: context.org.id || orgName,
                            code: context.org.code || orgName,
                            name: orgName
                        };
                    } else {
                        this.debugLogger.debug('[Auth] Organization data is not string or object');
                        this.endTiming('getCurrentOrganization');
                        return undefined;
                    }

                    // Cache the result for future calls
                    this.cachedOrganization = orgData;
                    this.debugLogger.debug('[Auth] Organization data cached for session');

                    this.endTiming('getCurrentOrganization');
                    return orgData;
                }
            }
            
            this.debugLogger.debug('[Auth] No organization currently selected');
            this.endTiming('getCurrentOrganization');
            return undefined;
        } catch (error) {
            this.debugLogger.debug('[Auth] Failed to get current organization:', error);
            this.endTiming('getCurrentOrganization');
            return undefined;
        }
    }

    /**
     * Get current project from CLI using 'aio console where'
     * Uses session caching for better performance
     */
    public async getCurrentProject(): Promise<AdobeProject | undefined> {
        this.startTiming('getCurrentProject');
        
        // Check cache first
        if (this.cachedProject) {
            this.debugLogger.debug('[Auth] Using cached project data');
            this.endTiming('getCurrentProject');
            return this.cachedProject;
        }
        
        try {
            let context;

            // Check console.where cache first
            const now = Date.now();
            if (this.consoleWhereCache && now < this.consoleWhereCache.expiry) {
                this.debugLogger.debug('[Auth] Using cached console.where response');
                context = this.consoleWhereCache.data;
            } else {
                this.debugLogger.debug('[Auth] Fetching project data from Adobe CLI');
                const result = await this.commandManager.executeAdobeCLI(
                    'aio console where --json',
                    { encoding: 'utf8', timeout: TIMEOUTS.API_CALL }
                );

                if (result.code === 0 && result.stdout) {
                    context = JSON.parse(result.stdout);

                    // Cache the result
                    this.consoleWhereCache = {
                        data: context,
                        expiry: now + CACHE_TTL.CONSOLE_WHERE
                    };

                    this.debugLogger.debug('[Auth] Raw Adobe CLI response:', JSON.stringify(context));
                } else {
                    this.endTiming('getCurrentProject');
                    return undefined;
                }
            }

            if (context) {
                
                // Check if project is present in the response
                if (context.project) {
                    let projectData;
                    
                    if (typeof context.project === 'string') {
                        // Adobe CLI returns project name as string
                        // We need to look up the numeric ID from the project list for SDK compatibility
                        this.debugLogger.debug(`[Auth] Current project name: ${context.project}, fetching numeric ID...`);
                        
                        try {
                            // Use cached project list if available, otherwise fetch
                            const projects = await this.getProjects();
                            const matchedProject = projects.find(p => p.name === context.project || p.title === context.project);
                            
                            if (matchedProject) {
                                this.debugLogger.debug(`[Auth] Resolved project "${context.project}" to ID: ${matchedProject.id}`);
                                projectData = matchedProject;
                            } else {
                                this.debugLogger.warn(`[Auth] Could not find numeric ID for project "${context.project}", using name as fallback`);
                                projectData = {
                                    id: context.project,
                                    name: context.project,
                                    title: context.project
                                };
                            }
                        } catch (error) {
                            this.debugLogger.debug('[Auth] Failed to fetch project list for ID lookup:', error);
                            // Fallback to using name as ID
                            projectData = {
                                id: context.project,
                                name: context.project,
                                title: context.project
                            };
                        }
                    } else if (typeof context.project === 'object') {
                        // Adobe CLI returns project as object (older format or full details)
                        const projectName = context.project.name || context.project.id || 'Unknown';
                        this.debugLogger.debug(`[Auth] Current project: ${projectName}`);
                        projectData = {
                            id: context.project.id,
                            name: context.project.name,
                            title: context.project.title || context.project.name,
                            description: context.project.description,
                            type: context.project.type,
                            org_id: context.project.org_id
                        };
                    } else {
                        this.debugLogger.debug('[Auth] Project data is not string or object');
                        this.endTiming('getCurrentProject');
                        return undefined;
                    }
                    
                    // Cache the result for future calls
                    this.cachedProject = projectData;
                    this.debugLogger.debug('[Auth] Project data cached for session');
                    
                    this.endTiming('getCurrentProject');
                    return projectData;
                }
            }
            
            this.debugLogger.debug('[Auth] No project currently selected');
            this.endTiming('getCurrentProject');
            return undefined;
        } catch (error) {
            this.debugLogger.debug('[Auth] Failed to get current project:', error);
            this.endTiming('getCurrentProject');
            return undefined;
        }
    }

    /**
     * Get current workspace from CLI using 'aio console where'
     * Uses session caching for better performance
     */
    public async getCurrentWorkspace(): Promise<AdobeWorkspace | undefined> {
        this.startTiming('getCurrentWorkspace');
        
        // Check cache first
        if (this.cachedWorkspace) {
            this.debugLogger.debug('[Auth] Using cached workspace data');
            this.endTiming('getCurrentWorkspace');
            return this.cachedWorkspace;
        }
        
        try {
            let context;

            // Check console.where cache first
            const now = Date.now();
            if (this.consoleWhereCache && now < this.consoleWhereCache.expiry) {
                this.debugLogger.debug('[Auth] Using cached console.where response');
                context = this.consoleWhereCache.data;
            } else {
                this.debugLogger.debug('[Auth] Fetching workspace data from Adobe CLI');
                const result = await this.commandManager.executeAdobeCLI(
                    'aio console where --json',
                    { encoding: 'utf8', timeout: TIMEOUTS.API_CALL }
                );

                if (result.code === 0 && result.stdout) {
                    context = JSON.parse(result.stdout);

                    // Cache the result
                    this.consoleWhereCache = {
                        data: context,
                        expiry: now + CACHE_TTL.CONSOLE_WHERE
                    };
                } else {
                    this.endTiming('getCurrentWorkspace');
                    return undefined;
                }
            }

            if (context) {
                
                // Check if workspace is present in the response
                if (context.workspace) {
                    this.debugLogger.debug(`[Auth] Current workspace: ${context.workspace.name}`);
                    const result = {
                        id: context.workspace.id,
                        name: context.workspace.name,
                        title: context.workspace.title || context.workspace.name
                    };
                    
                    // Cache the result for future calls
                    this.cachedWorkspace = result;
                    this.debugLogger.debug('[Auth] Workspace data cached for session');
                    
                    this.endTiming('getCurrentWorkspace');
                    return result;
                }
            }
            
            this.debugLogger.debug('[Auth] No workspace currently selected');
            this.endTiming('getCurrentWorkspace');
            return undefined;
        } catch (error) {
            this.debugLogger.debug('[Auth] Failed to get current workspace:', error);
            this.endTiming('getCurrentWorkspace');
            return undefined;
        }
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
                    this.debugLogger.debug('[Auth] Login timed out - user may have closed browser');
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
                    
                    // Manually store the token in the config where we expect it
                    try {
                        // Calculate expiry (2 hours from now, typical for Adobe tokens)
                        const expiry = Date.now() + (2 * 60 * 60 * 1000);
                        
                        // Run both config operations in parallel for better performance
                        // Use shorter timeout (5s) for config operations as they should be quick
                        this.debugLogger.debug('[Auth] Storing token and expiry in config...');
                        
                        const [tokenResult, expiryResult] = await Promise.all([
                            this.commandManager.executeAdobeCLI(
                                `aio config set ims.contexts.cli.access_token.token "${token}"`,
                                { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_WRITE }
                            ),
                            this.commandManager.executeAdobeCLI(
                                `aio config set ims.contexts.cli.access_token.expiry ${expiry}`,
                                { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_WRITE }
                            )
                        ]);
                        
                        // Check if both operations succeeded
                        if (tokenResult.code === 0 && expiryResult.code === 0) {
                            this.debugLogger.debug('[Auth] Token stored in config successfully');
                            this.stepLogger.logTemplate('adobe-setup', 'statuses.authentication-complete', {});
                            
                            // Since we just successfully logged in and stored the token,
                            // we can trust it's valid without re-verification
                            this.debugLogger.debug('[Auth] Authentication completed successfully');
                            
                            // Clear auth cache to force fresh check next time
                            this.cachedAuthStatus = undefined;
                            this.authCacheExpiry = 0;

                            // Clear validation cache after login to ensure fresh validation for new user
                            this.validationCache = undefined;

                            // If this was a forced login, just clear cache (console context already cleared before login)
                            if (force) {
                                this.clearCache();
                                this.debugLogger.debug('[Auth] Cleared cache after forced login - preserving any org selection from browser');
                            }

                            return true;
                        } else {
                            this.debugLogger.warn('[Auth] Config storage returned non-zero exit code');
                            // Fall through to verification check below
                        }
                        
                    } catch (error) {
                        this.debugLogger.error('[Auth] Failed to store token in config', error as Error);
                        
                        // If storage failed, we might still be authenticated from a previous session
                        // Do a verification check as fallback
                        const isAuth = await this.isAuthenticated();
                        if (isAuth) {
                            this.debugLogger.info('[Auth] Token storage failed but existing authentication found');
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
                    return await this.login(true);
                }
            } else {
                const exitCode = result?.code ?? 'unknown';
                this.debugLogger.debug(`[Auth] Login command failed with exit code: ${exitCode}`);
            }
            
            // Command failed or token verification failed
            return false;
            
        } catch (error) {
            this.debugLogger.error('[Auth] Login failed', error as Error);
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
     * Get organizations (SDK with CLI fallback)
     */
    public async getOrganizations(): Promise<AdobeOrg[]> {
        const startTime = Date.now();
        
        try {
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
        } catch (error) {
            this.debugLogger.error('[Auth] Failed to get organizations', error as Error);
            throw error;
        }
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
        this.startTiming('getProjects');
        const startTime = Date.now();
        
        try {
            this.stepLogger.logTemplate('adobe-setup', 'operations.loading-projects', {});
            
            let mappedProjects: AdobeProject[] = [];

            // Try SDK first if available and we have an org ID
            if (this.sdkClient && this.cachedOrganization?.id) {
                try {
                    this.debugLogger.debug(`[Auth SDK] Fetching projects for org ${this.cachedOrganization.id} via SDK (fast path)`);
                    
                    const sdkResult = await this.sdkClient.getProjectsForOrg(this.cachedOrganization.id);
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
            } else if (this.sdkClient && !this.cachedOrganization?.id) {
                this.debugLogger.debug('[Auth SDK] SDK available but no cached org ID, using CLI');
            }

            // CLI fallback
            if (mappedProjects.length === 0) {
                this.debugLogger.debug('[Auth CLI] Fetching projects via CLI (fallback path)');
                
                const result = await this.commandManager.executeAdobeCLI(
                    'aio console project list --json',
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
        } catch (error) {
            this.debugLogger.error('[Auth] Failed to get projects', error as Error);
            throw error;
        }
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
            return false;
        } catch (error) {
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
        this.startTiming('getWorkspaces');
        const startTime = Date.now();
        
        try {
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
        } catch (error) {
            this.debugLogger.error('[Auth] Failed to get workspaces', error as Error);
            throw error;
        }
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