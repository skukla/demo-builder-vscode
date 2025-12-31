/**
 * OrganizationService - Simplified Organization Management
 *
 * Replaces the multi-layered approach of:
 * - adobeEntityFetcher (getOrganizations)
 * - adobeEntitySelector (selectOrganization, autoSelectOrganizationIfNeeded)
 * - adobeContextResolver (getCurrentOrganization)
 * - organizationOperations (all org operations)
 *
 * Design Principle: Direct CLI calls with caching, minimal indirection.
 */

import { getLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateOrgId } from '@/core/validation';
import { parseJSON } from '@/types/typeGuards';
import type { AuthCache } from './authCache';
import type { AdobeOrg, RawAdobeOrg, AdobeConsoleWhereResponse } from './types';

export interface OrganizationValidationResult {
    valid: boolean;
    organization?: AdobeOrg;
    error?: string;
}

/**
 * Maps raw CLI org data to AdobeOrg type
 */
function mapOrganization(raw: RawAdobeOrg): AdobeOrg {
    return {
        id: raw.id,
        code: raw.code,
        name: raw.name,
    };
}

/**
 * Simplified organization service with direct CLI calls
 */
export class OrganizationService {
    private logger = getLogger();

    constructor(
        private commandExecutor: CommandExecutor,
        private cache: AuthCache,
    ) {}

    /**
     * Get list of organizations
     * Uses cache if available, otherwise fetches from CLI
     */
    async getOrganizations(): Promise<AdobeOrg[]> {
        // Check cache first
        const cached = this.cache.getOrganizations();
        if (cached) {
            return cached;
        }

        // Fetch from CLI
        const result = await this.commandExecutor.execute(
            'aio console org list --json',
            { encoding: 'utf8', timeout: TIMEOUTS.NORMAL },
        );

        if (result.code !== 0) {
            throw new Error(`Failed to get organizations: ${result.stderr || 'Unknown error'}`);
        }

        // Parse response
        const rawOrgs = parseJSON<RawAdobeOrg[]>(result.stdout);
        if (!rawOrgs || !Array.isArray(rawOrgs)) {
            throw new Error('Invalid organizations response format');
        }

        const orgs = rawOrgs.map(mapOrganization);

        // Cache the result
        this.cache.setOrganizations(orgs);

        this.logger.debug(`[OrgService] Retrieved ${orgs.length} organizations`);
        return orgs;
    }

    /**
     * Select an organization
     * Invalidates downstream caches (projects, workspaces)
     */
    async selectOrganization(orgId: string): Promise<boolean> {
        // SECURITY: Validate orgId to prevent command injection
        validateOrgId(orgId);

        const result = await this.commandExecutor.execute(
            `aio console org select ${orgId}`,
            { encoding: 'utf8', timeout: TIMEOUTS.NORMAL },
        );

        if (result.code !== 0) {
            this.logger.debug(`[OrgService] Failed to select org ${orgId}: ${result.stderr}`);
            return false;
        }

        // Update current org in cache
        const orgs = await this.getOrganizations();
        const selectedOrg = orgs.find(o => o.id === orgId);
        if (selectedOrg) {
            this.cache.setCurrentOrganization(selectedOrg);
        }

        // Invalidate downstream caches
        this.cache.invalidateForOrg(orgId);

        this.logger.debug(`[OrgService] Selected organization: ${orgId}`);
        return true;
    }

    /**
     * Get current organization from CLI context
     */
    async getCurrentOrganization(): Promise<AdobeOrg | undefined> {
        // Check cache first
        const cached = this.cache.getCurrentOrganization();
        if (cached) {
            return cached;
        }

        // Fetch from CLI
        const context = await this.getConsoleWhereContext();
        if (!context?.org) {
            return undefined;
        }

        // Handle string or object format
        let org: AdobeOrg | undefined;
        if (typeof context.org === 'string') {
            // Try to resolve full org object from list
            const orgs = await this.getOrganizations();
            org = orgs.find(o => o.name === context.org || o.code === context.org);
            if (!org) {
                // Fallback to name-only object
                org = { id: context.org, code: context.org, name: context.org };
            }
        } else {
            org = {
                id: context.org.id || context.org.name,
                code: context.org.code || context.org.name,
                name: context.org.name,
            };
        }

        // Cache the result
        this.cache.setCurrentOrganization(org);
        return org;
    }

    /**
     * Validate that an organization exists and is accessible
     */
    async validateOrganization(orgId: string): Promise<OrganizationValidationResult> {
        const orgs = await this.getOrganizations();
        const org = orgs.find(o => o.id === orgId);

        if (!org) {
            return { valid: false, error: `Organization ${orgId} not found` };
        }

        return { valid: true, organization: org };
    }

    /**
     * Auto-select organization if only one is available
     */
    async autoSelectOrganizationIfNeeded(): Promise<AdobeOrg | undefined> {
        // Check if already selected
        const current = await this.getCurrentOrganization();
        if (current) {
            return current;
        }

        // Get available organizations
        const orgs = await this.getOrganizations();

        if (orgs.length === 1) {
            // Auto-select single org
            const selected = await this.selectOrganization(orgs[0].id);
            if (selected) {
                this.cache.setCurrentOrganization(orgs[0]);
                this.logger.debug(`[OrgService] Auto-selected organization: ${orgs[0].name}`);
                return orgs[0];
            }
        }

        // Multiple orgs or selection failed
        return undefined;
    }

    /**
     * Get console.where context (shared helper)
     */
    private async getConsoleWhereContext(): Promise<AdobeConsoleWhereResponse | undefined> {
        // Check cache first
        const cached = this.cache.getConsoleWhere();
        if (cached) {
            return cached;
        }

        // Fetch from CLI
        const result = await this.commandExecutor.execute(
            'aio console where --json',
            { encoding: 'utf8', timeout: TIMEOUTS.NORMAL },
        );

        if (result.code !== 0 || !result.stdout) {
            return undefined;
        }

        const context = parseJSON<AdobeConsoleWhereResponse>(result.stdout);
        if (!context) {
            return undefined;
        }

        // Cache the result
        this.cache.setConsoleWhere(context);
        return context;
    }
}
