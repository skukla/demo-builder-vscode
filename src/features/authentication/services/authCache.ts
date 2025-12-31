/**
 * AuthCache - Unified Authentication Cache
 *
 * Simplified cache for authentication-related data.
 * Replaces the more complex AuthCacheManager with cleaner API.
 *
 * Cache Strategy:
 * 1. List caches (organizations, projects, workspaces) - keyed and TTL-based
 * 2. Current selection caches (org, project, workspace) - in-memory session state
 * 3. Auth status cache - for quick auth checks
 * 4. Token inspection cache - prevents redundant CLI calls
 * 5. Validation cache - for org access validation
 *
 * SECURITY: Cache TTLs include optional jitter to prevent timing attacks
 */

import { getCacheTTLWithJitter } from '@/core/cache/cacheUtils';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';
import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    AdobeConsoleWhereResponse,
    AuthTokenValidation,
} from './types';

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

export interface AuthCacheConfig {
    ttlMs: number;
    jitterPercent?: number;
}

/**
 * Unified auth cache - simplified API, no unnecessary abstraction
 */
export class AuthCache {
    // List caches (TTL-based)
    private organizations: CacheEntry<AdobeOrg[]> | null = null;
    private projectsByOrg: Map<string, CacheEntry<AdobeProject[]>> = new Map();
    private workspacesByOrgProject: Map<string, CacheEntry<AdobeWorkspace[]>> = new Map();

    // Current selection caches (session state, no TTL)
    private currentOrg: AdobeOrg | undefined;
    private currentProject: AdobeProject | undefined;
    private currentWorkspace: AdobeWorkspace | undefined;

    // Auth status cache
    private authStatus: boolean | undefined;
    private authStatusExpiry = 0;

    // Console where cache
    private consoleWhere: CacheEntry<AdobeConsoleWhereResponse> | null = null;

    // Token inspection cache
    private tokenInspection: CacheEntry<{ valid: boolean; expiresIn: number; token?: string }> | null = null;

    // Validation cache
    private validation: CacheEntry<AuthTokenValidation> | null = null;

    // One-time flag for org rejection tracking
    private orgClearedDueToValidation = false;

    private readonly ttlMs: number;
    private readonly jitterPercent: number;

    constructor(config: AuthCacheConfig) {
        this.ttlMs = config.ttlMs;
        this.jitterPercent = config.jitterPercent ?? 0;
    }

    private getTTL(): number {
        if (this.jitterPercent === 0) return this.ttlMs;
        return getCacheTTLWithJitter(this.ttlMs, this.jitterPercent);
    }

    private isExpired<T>(entry: CacheEntry<T> | null): boolean {
        if (!entry) return true;
        return Date.now() > entry.expiresAt;
    }

    // =========================================================================
    // Organizations Cache
    // =========================================================================

    setOrganizations(orgs: AdobeOrg[]): void {
        this.organizations = {
            value: orgs,
            expiresAt: Date.now() + this.getTTL(),
        };
    }

    getOrganizations(): AdobeOrg[] | undefined {
        if (this.isExpired(this.organizations)) {
            this.organizations = null;
            return undefined;
        }
        return this.organizations!.value;
    }

    // =========================================================================
    // Current Organization (Session State)
    // =========================================================================

    setCurrentOrganization(org: AdobeOrg | undefined): void {
        this.currentOrg = org;
    }

    getCurrentOrganization(): AdobeOrg | undefined {
        return this.currentOrg;
    }

    // =========================================================================
    // Projects Cache (Keyed by Org ID)
    // =========================================================================

    setProjects(orgId: string, projects: AdobeProject[]): void {
        this.projectsByOrg.set(orgId, {
            value: projects,
            expiresAt: Date.now() + this.getTTL(),
        });
    }

    getProjects(orgId: string): AdobeProject[] | undefined {
        const entry = this.projectsByOrg.get(orgId);
        if (this.isExpired(entry || null)) {
            this.projectsByOrg.delete(orgId);
            return undefined;
        }
        return entry!.value;
    }

    // =========================================================================
    // Current Project (Session State)
    // =========================================================================

    setCurrentProject(project: AdobeProject | undefined): void {
        this.currentProject = project;
    }

    getCurrentProject(): AdobeProject | undefined {
        return this.currentProject;
    }

    // =========================================================================
    // Workspaces Cache (Keyed by Org:Project)
    // =========================================================================

    private getWorkspaceKey(orgId: string, projectId: string): string {
        return `${orgId}:${projectId}`;
    }

    setWorkspaces(orgId: string, projectId: string, workspaces: AdobeWorkspace[]): void {
        const key = this.getWorkspaceKey(orgId, projectId);
        this.workspacesByOrgProject.set(key, {
            value: workspaces,
            expiresAt: Date.now() + this.getTTL(),
        });
    }

    getWorkspaces(orgId: string, projectId: string): AdobeWorkspace[] | undefined {
        const key = this.getWorkspaceKey(orgId, projectId);
        const entry = this.workspacesByOrgProject.get(key);
        if (this.isExpired(entry || null)) {
            this.workspacesByOrgProject.delete(key);
            return undefined;
        }
        return entry!.value;
    }

    // =========================================================================
    // Current Workspace (Session State)
    // =========================================================================

    setCurrentWorkspace(workspace: AdobeWorkspace | undefined): void {
        this.currentWorkspace = workspace;
    }

    getCurrentWorkspace(): AdobeWorkspace | undefined {
        return this.currentWorkspace;
    }

    // =========================================================================
    // Auth Status Cache
    // =========================================================================

    setAuthStatus(isAuthenticated: boolean, ttlMs?: number): void {
        this.authStatus = isAuthenticated;
        const effectiveTtl = ttlMs ?? CACHE_TTL.MEDIUM;
        const jitteredTtl = this.jitterPercent > 0
            ? getCacheTTLWithJitter(effectiveTtl, this.jitterPercent)
            : effectiveTtl;
        this.authStatusExpiry = Date.now() + jitteredTtl;
    }

    getAuthStatus(): { isAuthenticated: boolean | undefined; isExpired: boolean } {
        const now = Date.now();
        const isExpired = now >= this.authStatusExpiry;
        return {
            isAuthenticated: isExpired ? undefined : this.authStatus,
            isExpired,
        };
    }

    clearAuthStatus(): void {
        this.authStatus = undefined;
        this.authStatusExpiry = 0;
    }

    // =========================================================================
    // Console Where Cache
    // =========================================================================

    setConsoleWhere(context: AdobeConsoleWhereResponse): void {
        this.consoleWhere = {
            value: context,
            expiresAt: Date.now() + getCacheTTLWithJitter(CACHE_TTL.MEDIUM, this.jitterPercent),
        };
    }

    getConsoleWhere(): AdobeConsoleWhereResponse | undefined {
        if (this.isExpired(this.consoleWhere)) {
            this.consoleWhere = null;
            return undefined;
        }
        return this.consoleWhere!.value;
    }

    clearConsoleWhere(): void {
        this.consoleWhere = null;
    }

    // =========================================================================
    // Token Inspection Cache
    // =========================================================================

    setTokenInspection(result: { valid: boolean; expiresIn: number; token?: string }): void {
        this.tokenInspection = {
            value: result,
            expiresAt: Date.now() + getCacheTTLWithJitter(CACHE_TTL.MEDIUM, this.jitterPercent),
        };
    }

    getTokenInspection(): { valid: boolean; expiresIn: number; token?: string } | undefined {
        if (this.isExpired(this.tokenInspection)) {
            this.tokenInspection = null;
            return undefined;
        }
        return this.tokenInspection!.value;
    }

    clearTokenInspection(): void {
        this.tokenInspection = null;
    }

    // =========================================================================
    // Validation Cache
    // =========================================================================

    setValidation(org: string, isValid: boolean): void {
        this.validation = {
            value: {
                org,
                isValid,
                expiry: Date.now() + getCacheTTLWithJitter(CACHE_TTL.MEDIUM, this.jitterPercent),
            },
            expiresAt: Date.now() + getCacheTTLWithJitter(CACHE_TTL.MEDIUM, this.jitterPercent),
        };
    }

    getValidation(): AuthTokenValidation | undefined {
        if (this.isExpired(this.validation)) {
            this.validation = null;
            return undefined;
        }
        return this.validation!.value;
    }

    clearValidation(): void {
        this.validation = null;
    }

    // =========================================================================
    // Org Rejection Flag (One-Time Read)
    // =========================================================================

    setOrgClearedDueToValidation(cleared: boolean): void {
        this.orgClearedDueToValidation = cleared;
    }

    wasOrgClearedDueToValidation(): boolean {
        const result = this.orgClearedDueToValidation;
        // Clear flag after reading (one-time check)
        this.orgClearedDueToValidation = false;
        return result;
    }

    // =========================================================================
    // Invalidation Methods
    // =========================================================================

    /**
     * Invalidate all caches for an organization.
     * Called when org is switched - clears projects and workspaces for that org.
     * Does NOT clear the organizations list (user might switch orgs).
     */
    invalidateForOrg(orgId: string): void {
        // Clear projects for this org
        this.projectsByOrg.delete(orgId);

        // Clear all workspaces for this org
        for (const key of this.workspacesByOrgProject.keys()) {
            if (key.startsWith(`${orgId}:`)) {
                this.workspacesByOrgProject.delete(key);
            }
        }

        // Clear current selections if they belong to this org
        if (this.currentOrg?.id === orgId) {
            this.currentProject = undefined;
            this.currentWorkspace = undefined;
        }

        // Clear console where cache (context changed)
        this.clearConsoleWhere();
    }

    /**
     * Invalidate caches for a project.
     * Called when project is switched - clears workspaces for that project.
     * Does NOT clear the projects list.
     */
    invalidateForProject(orgId: string, projectId: string): void {
        const key = this.getWorkspaceKey(orgId, projectId);
        this.workspacesByOrgProject.delete(key);

        // Clear current workspace if it belongs to this project
        if (this.currentProject?.id === projectId) {
            this.currentWorkspace = undefined;
        }

        // Clear console where cache (context changed)
        this.clearConsoleWhere();
    }

    /**
     * Clear all caches - used on logout or major state changes.
     */
    clear(): void {
        // List caches
        this.organizations = null;
        this.projectsByOrg.clear();
        this.workspacesByOrgProject.clear();

        // Session state
        this.currentOrg = undefined;
        this.currentProject = undefined;
        this.currentWorkspace = undefined;

        // Other caches
        this.clearAuthStatus();
        this.clearConsoleWhere();
        this.clearTokenInspection();
        this.clearValidation();

        // Flags
        this.orgClearedDueToValidation = false;
    }
}
