import { getCacheTTLWithJitter } from '@/core/cache/AbstractCacheManager';
import { getLogger } from '@/core/logging';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';
import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    AuthTokenValidation,
    CacheEntry,
    AdobeConsoleWhereResponse,
} from '@/features/authentication/services/types';

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

    // Session caching for current selections
    private cachedOrganization: AdobeOrg | undefined;
    private cachedProject: AdobeProject | undefined;
    private cachedWorkspace: AdobeWorkspace | undefined;

    // Authentication status caching
    private cachedAuthStatus: boolean | undefined;
    private authCacheExpiry = 0;

    // Organization validation caching (org-specific)
    private validationCache: AuthTokenValidation | undefined;

    // API result caching for performance
    private orgListCache: CacheEntry<AdobeOrg[]> | undefined;
    private consoleWhereCache: CacheEntry<AdobeConsoleWhereResponse> | undefined;

    // Token inspection caching (prevents redundant 4s CLI calls)
    private tokenInspectionCache: CacheEntry<{ valid: boolean; expiresIn: number; token?: string }> | undefined;

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
    }

    /**
     * Get cached authentication status
     */
    getCachedAuthStatus(): { isAuthenticated: boolean | undefined; isExpired: boolean } {
        const now = Date.now();
        const isExpired = now >= this.authCacheExpiry;

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
        const jitteredTTL = getCacheTTLWithJitter(ttlMs);
        this.authCacheExpiry = Date.now() + jitteredTTL;
    }

    /**
     * Clear authentication status cache
     */
    clearAuthStatusCache(): void {
        this.cachedAuthStatus = undefined;
        this.authCacheExpiry = 0;
    }

    /**
     * Get validation cache
     */
    getValidationCache(): AuthTokenValidation | undefined {
        if (!this.validationCache) {
            return undefined;
        }

        const now = Date.now();
        if (now >= this.validationCache.expiry) {
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
        const jitteredTTL = getCacheTTLWithJitter(CACHE_TTL.VALIDATION);
        this.validationCache = {
            org,
            isValid,
            expiry: now + jitteredTTL,
        };
    }

    /**
     * Clear validation cache
     */
    clearValidationCache(): void {
        this.validationCache = undefined;
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
            this.orgListCache = undefined;
            return undefined;
        }

        return this.orgListCache.data;
    }

    /**
     * Set cached organization list
     */
    setCachedOrgList(orgs: AdobeOrg[]): void {
        const now = Date.now();
        const jitteredTTL = getCacheTTLWithJitter(CACHE_TTL.ORG_LIST);
        this.orgListCache = {
            data: orgs,
            expiry: now + jitteredTTL,
        };
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
            this.consoleWhereCache = undefined;
            return undefined;
        }

        return this.consoleWhereCache.data;
    }

    /**
     * Set cached console.where result
     */
    setCachedConsoleWhere(context: AdobeConsoleWhereResponse): void {
        const now = Date.now();
        const jitteredTTL = getCacheTTLWithJitter(CACHE_TTL.CONSOLE_WHERE);
        this.consoleWhereCache = {
            data: context,
            expiry: now + jitteredTTL,
        };
    }

    /**
     * Clear console.where cache
     */
    clearConsoleWhereCache(): void {
        this.consoleWhereCache = undefined;
    }

    /**
     * Get cached token inspection result
     * PERFORMANCE FIX: Prevents redundant 4-second Adobe CLI calls
     */
    getCachedTokenInspection(): { valid: boolean; expiresIn: number; token?: string } | undefined {
        if (!this.tokenInspectionCache) {
            return undefined;
        }

        const now = Date.now();
        if (now >= this.tokenInspectionCache.expiry) {
            this.tokenInspectionCache = undefined;
            return undefined;
        }

        return this.tokenInspectionCache.data;
    }

    /**
     * Set cached token inspection result
     * PERFORMANCE FIX: Cache valid token inspections to prevent redundant CLI calls
     */
    setCachedTokenInspection(result: { valid: boolean; expiresIn: number; token?: string }): void {
        const now = Date.now();
        const jitteredTTL = getCacheTTLWithJitter(CACHE_TTL.TOKEN_INSPECTION);
        this.tokenInspectionCache = {
            data: result,
            expiry: now + jitteredTTL,
        };
    }

    /**
     * Clear token inspection cache
     */
    clearTokenInspectionCache(): void {
        this.tokenInspectionCache = undefined;
    }

    /**
     * Check if org was cleared due to validation failure
     */
    wasOrgClearedDueToValidation(): boolean {
        const result = this.orgClearedDueToValidation;
        // Clear flag after reading (one-time check)
        this.orgClearedDueToValidation = false;
        return result;
    }

    /**
     * Set org cleared flag
     */
    setOrgClearedDueToValidation(cleared: boolean): void {
        this.orgClearedDueToValidation = cleared;
    }

    /**
     * Clear all session caches
     */
    clearSessionCaches(): void {
        this.cachedOrganization = undefined;
        this.cachedProject = undefined;
        this.cachedWorkspace = undefined;
    }

    /**
     * Clear all performance caches
     */
    clearPerformanceCaches(): void {
        this.orgListCache = undefined;
        this.consoleWhereCache = undefined;
        this.tokenInspectionCache = undefined;
    }

    /**
     * Clear all caches
     */
    clearAll(): void {
        this.clearSessionCaches();
        this.clearPerformanceCaches();
        this.clearAuthStatusCache();
        this.clearValidationCache();
        this.clearTokenInspectionCache();
        this.orgClearedDueToValidation = false;
    }
}
