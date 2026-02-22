/**
 * Organization Operations - Organization management for Adobe entities
 *
 * Handles organization listing, selection, current context, and auto-selection.
 * Extracted from AdobeEntityService for SOP compliance.
 */

import { getConsoleWhereContext, clearConsoleContext, type ContextOperationsDeps } from './contextOperations';
import { mapOrganizations } from './entityMappers';
import { getLogger, StepLogger } from '@/core/logging';
import { TIMEOUTS, formatDuration } from '@/core/utils';
import { validateOrgId } from '@/core/validation';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import type {
    AdobeOrg,
    RawAdobeOrg,
    SDKResponse,
} from '@/features/authentication/services/types';
import type { Logger } from '@/types/logger';
import { parseJSON } from '@/types/typeGuards';

/**
 * Dependencies required for organization operations
 */
export interface OrganizationOperationsDeps extends ContextOperationsDeps {
    sdkClient: AdobeSDKClient;
    organizationValidator: OrganizationValidator;
    logger: Logger;
    stepLogger: StepLogger;
}

/**
 * Try fetching orgs via SDK
 */
async function tryFetchOrgsViaSDK(
    deps: OrganizationOperationsDeps,
    startTime: number,
): Promise<AdobeOrg[]> {
    const debugLogger = getLogger();
    if (!deps.sdkClient.isInitialized()) return [];

    try {
        const client = deps.sdkClient.getClient() as { getOrganizations: () => Promise<SDKResponse<RawAdobeOrg[]>> };
        const sdkResult = await client.getOrganizations();
        if (!sdkResult.body || !Array.isArray(sdkResult.body)) {
            throw new Error('Invalid SDK response format');
        }
        const mapped = mapOrganizations(sdkResult.body);
        debugLogger.debug(`[Org Ops] Retrieved ${mapped.length} organizations via SDK in ${formatDuration(Date.now() - startTime)}`);
        return mapped;
    } catch (sdkError) {
        debugLogger.trace('[Org Ops] SDK failed, falling back to CLI:', sdkError);
        debugLogger.warn('[Org Ops] SDK unavailable, using slower CLI fallback for organizations');
        return [];
    }
}

/**
 * Fetch orgs via CLI
 */
async function fetchOrgsViaCLI(
    deps: OrganizationOperationsDeps,
    startTime: number,
): Promise<AdobeOrg[]> {
    const debugLogger = getLogger();
    const result = await deps.commandManager.execute('aio console org list --json', { encoding: 'utf8' });

    if (result.code !== 0) {
        throw new Error(`Failed to get organizations: ${result.stderr}`);
    }

    const orgs = parseJSON<RawAdobeOrg[]>(result.stdout);
    if (!orgs || !Array.isArray(orgs)) {
        throw new Error('Invalid organizations response format');
    }

    const mapped = mapOrganizations(orgs);
    debugLogger.debug(`[Org Ops] Retrieved ${mapped.length} organizations via CLI in ${formatDuration(Date.now() - startTime)}`);
    return mapped;
}

/**
 * Get list of organizations (SDK with CLI fallback)
 */
export async function getOrganizations(deps: OrganizationOperationsDeps): Promise<AdobeOrg[]> {
    const debugLogger = getLogger();
    const startTime = Date.now();

    try {
        const cachedOrgs = deps.cacheManager.getCachedOrgList();
        if (cachedOrgs) return cachedOrgs;

        deps.stepLogger.logTemplate('adobe-setup', 'loading-organizations', {});

        if (!deps.sdkClient.isInitialized()) {
            await deps.sdkClient.ensureInitialized();
        }

        let mappedOrgs = await tryFetchOrgsViaSDK(deps, startTime);
        if (mappedOrgs.length === 0) {
            mappedOrgs = await fetchOrgsViaCLI(deps, startTime);
        }

        if (mappedOrgs.length === 0) {
            deps.logger.info('No organizations accessible. Clearing previous selections...');
            await clearConsoleContext(deps);
        }

        deps.cacheManager.setCachedOrgList(mappedOrgs);
        deps.stepLogger.logTemplate('adobe-setup', 'found', {
            count: mappedOrgs.length,
            item: mappedOrgs.length === 1 ? 'organization' : 'organizations',
        });

        return mappedOrgs;
    } catch (error) {
        debugLogger.error('[Org Ops] Failed to get organizations', error as Error);
        throw error;
    }
}

/**
 * Create a fallback org object from string
 */
function createFallbackOrg(orgString: string): AdobeOrg {
    return { id: orgString, code: orgString, name: orgString };
}

/**
 * Fetch org list safely (returns empty array on failure)
 */
async function fetchOrgListSafely(deps: OrganizationOperationsDeps): Promise<AdobeOrg[]> {
    const debugLogger = getLogger();
    try {
        return await getOrganizations(deps);
    } catch (error) {
        debugLogger.trace('[Org Ops] Failed to fetch org list for ID resolution:', error);
        return [];
    }
}

/**
 * Resolve org string to full org object using fetch or cache
 */
async function resolveOrgFromString(
    deps: OrganizationOperationsDeps,
    orgString: string,
): Promise<AdobeOrg> {
    const debugLogger = getLogger();
    const cachedOrgList = deps.cacheManager.getCachedOrgList();

    const orgList = (cachedOrgList && cachedOrgList.length > 0)
        ? cachedOrgList
        : await fetchOrgListSafely(deps);

    const matchedOrg = orgList.find(o => o.name === orgString || o.code === orgString);
    if (matchedOrg) return matchedOrg;

    debugLogger.warn('[Org Ops] Could not find org in list, using name as fallback');
    return createFallbackOrg(orgString);
}

/**
 * Parse org data from console context value
 */
async function parseOrgFromContext(
    deps: OrganizationOperationsDeps,
    orgValue: string | { id: string; code?: string; name?: string },
): Promise<AdobeOrg | undefined> {
    const debugLogger = getLogger();

    if (typeof orgValue === 'string') {
        if (!orgValue.trim()) {
            debugLogger.debug('[Org Ops] Organization name is empty string');
            return undefined;
        }
        return resolveOrgFromString(deps, orgValue);
    }

    if (typeof orgValue === 'object') {
        const orgName = orgValue.name || orgValue.id || 'Unknown';
        debugLogger.debug(`[Org Ops] Current organization: ${orgName}`);
        return {
            id: orgValue.id || orgName,
            code: orgValue.code || orgName,
            name: orgName,
        };
    }

    debugLogger.debug('[Org Ops] Organization data is not string or object');
    return undefined;
}

/**
 * Get current organization from CLI
 */
export async function getCurrentOrganization(
    deps: OrganizationOperationsDeps,
): Promise<AdobeOrg | undefined> {
    const debugLogger = getLogger();

    try {
        const cachedOrg = deps.cacheManager.getCachedOrganization();
        if (cachedOrg) return cachedOrg;

        const context = await getConsoleWhereContext(deps);
        if (!context?.org) {
            debugLogger.debug('[Org Ops] No organization currently selected');
            return undefined;
        }

        const orgData = await parseOrgFromContext(deps, context.org);
        if (orgData) {
            deps.cacheManager.setCachedOrganization(orgData);
        }
        return orgData;
    } catch (error) {
        debugLogger.debug('[Org Ops] Failed to get current organization:', error);
        return undefined;
    }
}

/**
 * Select organization
 */
export async function selectOrganization(
    deps: OrganizationOperationsDeps,
    orgId: string,
): Promise<boolean> {
    const debugLogger = getLogger();

    try {
        // SECURITY: Validate orgId to prevent command injection
        validateOrgId(orgId);

        deps.stepLogger.logTemplate('adobe-setup', 'operations.selecting', { item: 'organization' });

        const result = await deps.commandManager.execute(
            `aio console org select ${orgId}`,
            {
                encoding: 'utf8',
                timeout: TIMEOUTS.NORMAL,
            },
        );

        if (result.code === 0) {
            // Clear validation failure flag since new org was successfully selected
            deps.cacheManager.setOrgClearedDueToValidation(false);

            // Smart caching: populate org cache directly and get name for logging
            let orgName = orgId; // Fallback to ID if name lookup fails
            try {
                const orgs = await getOrganizations(deps);
                const selectedOrg = orgs.find(o => o.id === orgId);

                if (selectedOrg) {
                    deps.cacheManager.setCachedOrganization(selectedOrg);
                    orgName = selectedOrg.name;
                } else {
                    deps.cacheManager.setCachedOrganization(undefined);
                    debugLogger.warn(`[Org Ops] Could not find org ${orgId} in list`);
                }
            } catch (error) {
                debugLogger.debug('[Org Ops] Failed to cache org after selection:', error);
                deps.cacheManager.setCachedOrganization(undefined);
            }

            // Log with org name (or ID as fallback)
            deps.stepLogger.logTemplate('adobe-setup', 'statuses.organization-selected', { name: orgName });

            // Clear downstream caches
            deps.cacheManager.setCachedProject(undefined);
            deps.cacheManager.setCachedWorkspace(undefined);
            deps.cacheManager.clearConsoleWhereCache();

            // Test Developer permissions after org selection
            debugLogger.debug('[Org Ops] Testing Developer permissions after org selection');
            const permissionCheck = await deps.organizationValidator.testDeveloperPermissions();

            if (!permissionCheck.hasPermissions) {
                debugLogger.error('[Org Ops] User lacks Developer permissions for this organization');
                const errorMessage = permissionCheck.error || 'Insufficient permissions for App Builder access';
                deps.logger.error(`[Org Ops] Developer permissions check failed: ${errorMessage}`);

                // Throw error with specific message to signal permission failure to UI
                throw new Error(errorMessage);
            }

            debugLogger.debug('[Org Ops] Developer permissions confirmed');

            return true;
        }

        debugLogger.debug(`[Org Ops] Organization select failed with code: ${result.code}`);
        return false;
    } catch (error) {
        debugLogger.error('[Org Ops] Failed to select organization', error as Error);
        return false;
    }
}

/**
 * Auto-select organization if only one is available
 */
export async function autoSelectOrganizationIfNeeded(
    deps: OrganizationOperationsDeps,
    skipCurrentCheck = false,
): Promise<AdobeOrg | undefined> {
    const debugLogger = getLogger();

    try {
        // Check if org already selected (unless explicitly skipped)
        if (!skipCurrentCheck) {
            const currentOrg = await getCurrentOrganization(deps);
            if (currentOrg) {
                debugLogger.debug(`[Org Ops] Organization already selected: ${currentOrg.name}`);
                return currentOrg;
            }
        } else {
            debugLogger.debug('[Org Ops] Skipping current org check - caller knows org is empty');
        }

        // Get available organizations
        debugLogger.debug('[Org Ops] No organization selected, fetching available organizations...');
        const orgs = await getOrganizations(deps);

        if (orgs.length === 1) {
            // Auto-select single organization
            debugLogger.debug(`[Org Ops] Auto-selecting single organization: ${orgs[0].name}`);
            deps.logger.info(`Auto-selecting organization: ${orgs[0].name}`);

            const selected = await selectOrganization(deps, orgs[0].id);

            if (selected) {
                deps.cacheManager.setCachedOrganization(orgs[0]);
                debugLogger.debug(`[Org Ops] Successfully auto-selected organization: ${orgs[0].name}`);
                return orgs[0];
            }
        } else if (orgs.length > 1) {
            debugLogger.debug(`[Org Ops] Multiple organizations available (${orgs.length}), manual selection required`);
            deps.logger.info(`Found ${orgs.length} organizations - manual selection required`);
        } else {
            debugLogger.warn('[Org Ops] No organizations available');
            deps.logger.warn('No organizations available for this user');
        }

        return undefined;
    } catch (error) {
        debugLogger.error('[Org Ops] Failed to auto-select organization:', error as Error);
        return undefined;
    }
}
