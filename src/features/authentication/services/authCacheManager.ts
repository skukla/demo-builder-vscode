import { getLogger } from '@/shared/logging';
import { CACHE_TTL } from '@/utils/timeoutConfig';
import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    ValidationResult,
    CacheEntry,
    AdobeConsoleWhereResponse,
} from './types';

/**
 * Manages caching strategies for authentication-related data
 *
 * Cache Strategy:
 * 1. Session caches (org/project/workspace) - cleared when selections change
 * 2. Validation cache - org-specific, cleared after login
 * 3. API result caches - short TTLs, cleared on context changes
 * 4. Auth status cache - prevents repeated auth checks
 *
 * SECURITY: Cache TTLs include random jitter (±10%) to prevent timing attacks
 */
export class AuthCacheManager {
    private logger = getLogger();

    /**
     * Add random jitter to TTL to prevent timing-based cache enumeration attacks
     * SECURITY: Randomizes cache expiry by ±10% to make timing attacks infeasible
     *
     * @param baseTTL - Base TTL in milliseconds
     * @returns TTL with random jitter applied
     */
    private getCacheTTLWithJitter(baseTTL: number): number {
        const jitter = 0.1; // ±10%
        const min = Math.floor(baseTTL * (1 - jitter));
        const max = Math.floor(baseTTL * (1 + jitter));
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Session caching for current selections
    private cachedOrganization: AdobeOrg | undefined;
    private cachedProject: AdobeProject | undefined;
    private cachedWorkspace: AdobeWorkspace | undefined;

    // Authentication status caching
    private cachedAuthStatus: boolean | undefined;
    private authCacheExpiry = 0;

    // Organization validation caching (org-specific)
    private validationCache: ValidationResult | undefined;

    // API result caching for performance
    private orgListCache: CacheEntry<AdobeOrg[]> | undefined;
    private consoleWhereCache: CacheEntry<AdobeConsoleWhereResponse> | undefined;

    // Organization validation failure tracking
    private orgClearedDueToValidation = false;

    /**
     * Get cached organization
     */
    getCachedOrganization(): AdobeOrg | undefined {
        return this.cachedOrganization;
    }

    /**
     * Set cached organization
     */
    setCachedOrganization(org: AdobeOrg | undefined): void {
        this.cachedOrganization = org;
        if (org) {
            this.logger.debug(`[Auth Cache] Cached organization: ${org.name}`);
        } else {
            this.logger.debug('[Auth Cache] Cleared cached organization');
        }
    }

    /**
     * Get cached project
     */
    getCachedProject(): AdobeProject | undefined {
        return this.cachedProject;
    }

    /**
     * Set cached project
     */
    setCachedProject(project: AdobeProject | undefined): void {
        this.cachedProject = project;
        if (project) {
            this.logger.debug(`[Auth Cache] Cached project: ${project.name}`);
        } else {
            this.logger.debug('[Auth Cache] Cleared cached project');
        }
    }

    /**
     * Get cached workspace
     */
    getCachedWorkspace(): AdobeWorkspace | undefined {
        return this.cachedWorkspace;
    }

    /**
     * Set cached workspace
     */
    setCachedWorkspace(workspace: AdobeWorkspace | undefined): void {
        this.cachedWorkspace = workspace;
        if (workspace) {
            this.logger.debug(`[Auth Cache] Cached workspace: ${workspace.name}`);
        } else {
            this.logger.debug('[Auth Cache] Cleared cached workspace');
        }
    }

    /**
     * Get cached authentication status
     */
    getCachedAuthStatus(): { isAuthenticated: boolean | undefined; isExpired: boolean } {
        const now = Date.now();
        const isExpired = now >= this.authCacheExpiry;

        if (isExpired && this.cachedAuthStatus !== undefined) {
            this.logger.debug('[Auth Cache] Auth status cache expired');
        }

        return {
            isAuthenticated: isExpired ? undefined : this.cachedAuthStatus,
            isExpired,
        };
    }

    /**
     * Set cached authentication status
     */
    setCachedAuthStatus(isAuthenticated: boolean, ttlMs: number = CACHE_TTL.AUTH_STATUS): void {
        this.cachedAuthStatus = isAuthenticated;
        const jitteredTTL = this.getCacheTTLWithJitter(ttlMs);
        this.authCacheExpiry = Date.now() + jitteredTTL;
        this.logger.debug(`[Auth Cache] Cached auth status: ${isAuthenticated} (TTL: ${jitteredTTL}ms)`);
    }

    /**
     * Clear authentication status cache
     */
    clearAuthStatusCache(): void {
        this.cachedAuthStatus = undefined;
        this.authCacheExpiry = 0;
        this.logger.debug('[Auth Cache] Cleared auth status cache');
    }

    /**
     * Get validation cache
     */
    getValidationCache(): ValidationResult | undefined {
        if (!this.validationCache) {
            return undefined;
        }

        const now = Date.now();
        if (now >= this.validationCache.expiry) {
            this.logger.debug('[Auth Cache] Validation cache expired');
            this.validationCache = undefined;
            return undefined;
        }

        return this.validationCache;
    }

    /**
     * Set validation cache
     */
    setValidationCache(org: string, isValid: boolean): void {
        const now = Date.now();
        const jitteredTTL = this.getCacheTTLWithJitter(CACHE_TTL.VALIDATION);
        this.validationCache = {
            org,
            isValid,
            expiry: now + jitteredTTL,
        };
        this.logger.debug(`[Auth Cache] Cached validation for ${org}: ${isValid} (TTL: ${jitteredTTL}ms)`);
    }

    /**
     * Clear validation cache
     */
    clearValidationCache(): void {
        this.validationCache = undefined;
        this.logger.debug('[Auth Cache] Cleared validation cache');
    }

    /**
     * Get cached organization list
     */
    getCachedOrgList(): AdobeOrg[] | undefined {
        if (!this.orgListCache) {
            return undefined;
        }

        const now = Date.now();
        if (now >= this.orgListCache.expiry) {
            this.logger.debug('[Auth Cache] Org list cache expired');
            this.orgListCache = undefined;
            return undefined;
        }

        this.logger.debug('[Auth Cache] Using cached organization list');
        return this.orgListCache.data;
    }

    /**
     * Set cached organization list
     */
    setCachedOrgList(orgs: AdobeOrg[]): void {
        const now = Date.now();
        const jitteredTTL = this.getCacheTTLWithJitter(CACHE_TTL.ORG_LIST);
        this.orgListCache = {
            data: orgs,
            expiry: now + jitteredTTL,
        };
        this.logger.debug(`[Auth Cache] Cached ${orgs.length} organizations (TTL: ${jitteredTTL}ms)`);
    }

    /**
     * Get cached console.where result
     */
    getCachedConsoleWhere(): AdobeConsoleWhereResponse | undefined {
        if (!this.consoleWhereCache) {
            return undefined;
        }

        const now = Date.now();
        if (now >= this.consoleWhereCache.expiry) {
            this.logger.debug('[Auth Cache] console.where cache expired');
            this.consoleWhereCache = undefined;
            return undefined;
        }

        this.logger.debug('[Auth Cache] Using cached console.where response');
        return this.consoleWhereCache.data;
    }

    /**
     * Set cached console.where result
     */
    setCachedConsoleWhere(context: AdobeConsoleWhereResponse): void {
        const now = Date.now();
        const jitteredTTL = this.getCacheTTLWithJitter(CACHE_TTL.CONSOLE_WHERE);
        this.consoleWhereCache = {
            data: context,
            expiry: now + jitteredTTL,
        };
        this.logger.debug(`[Auth Cache] Cached console.where result (TTL: ${jitteredTTL}ms)`);
    }

    /**
     * Clear console.where cache
     */
    clearConsoleWhereCache(): void {
        this.consoleWhereCache = undefined;
        this.logger.debug('[Auth Cache] Cleared console.where cache');
    }

    /**
     * Check if org was cleared due to validation failure
     */
    wasOrgClearedDueToValidation(): boolean {
        const result = this.orgClearedDueToValidation;
        this.logger.debug(`[Auth Cache] wasOrgClearedDueToValidation: ${result}`);
        // Clear flag after reading (one-time check)
        this.orgClearedDueToValidation = false;
        return result;
    }

    /**
     * Set org cleared flag
     */
    setOrgClearedDueToValidation(cleared: boolean): void {
        this.orgClearedDueToValidation = cleared;
        this.logger.debug(`[Auth Cache] Set orgClearedDueToValidation: ${cleared}`);
    }

    /**
     * Clear all session caches
     */
    clearSessionCaches(): void {
        this.cachedOrganization = undefined;
        this.cachedProject = undefined;
        this.cachedWorkspace = undefined;
        this.logger.debug('[Auth Cache] Cleared session caches');
    }

    /**
     * Clear all performance caches
     */
    clearPerformanceCaches(): void {
        this.orgListCache = undefined;
        this.consoleWhereCache = undefined;
        this.logger.debug('[Auth Cache] Cleared performance caches');
    }

    /**
     * Clear all caches
     */
    clearAll(): void {
        this.clearSessionCaches();
        this.clearPerformanceCaches();
        this.clearAuthStatusCache();
        this.clearValidationCache();
        this.orgClearedDueToValidation = false;
        this.logger.debug('[Auth Cache] Cleared all caches');
    }
}
