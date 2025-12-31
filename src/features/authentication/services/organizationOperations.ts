/**
 * Organization Operations - Organization management for Adobe entities
 *
 * Handles organization listing, selection, current context, and auto-selection.
 * Extracted from AdobeEntityService for SOP compliance.
 */

import { getConsoleWhereContext, clearConsoleContext, type ContextOperationsDeps } from './contextOperations';
import { mapOrganizations } from './entityMappers';
import { getLogger, StepLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';
import { TIMEOUTS, formatDuration } from '@/core/utils';
import { validateOrgId } from '@/core/validation';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import type {
    AdobeOrg,
    RawAdobeOrg,
    SDKResponse,
} from '@/features/authentication/services/types';
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
 * Get list of organizations (SDK with CLI fallback)
 */
export async function getOrganizations(deps: OrganizationOperationsDeps): Promise<AdobeOrg[]> {
    const debugLogger = getLogger();
    const startTime = Date.now();

    try {
        // Check cache first
        const cachedOrgs = deps.cacheManager.getCachedOrgList();
        if (cachedOrgs) {
            return cachedOrgs;
        }

        deps.stepLogger.logTemplate('adobe-setup', 'loading-organizations', {});

        let mappedOrgs: AdobeOrg[] = [];

        // Auto-initialize SDK if not ready (lazy init pattern)
        if (!deps.sdkClient.isInitialized()) {
            await deps.sdkClient.ensureInitialized();
        }

        // Try SDK first for 30x performance improvement
        if (deps.sdkClient.isInitialized()) {
            try {
                const client = deps.sdkClient.getClient() as { getOrganizations: () => Promise<SDKResponse<RawAdobeOrg[]>> };
                const sdkResult = await client.getOrganizations();
                const sdkDuration = Date.now() - startTime;

                if (sdkResult.body && Array.isArray(sdkResult.body)) {
                    mappedOrgs = mapOrganizations(sdkResult.body);

                    debugLogger.debug(`[Org Ops] Retrieved ${mappedOrgs.length} organizations via SDK in ${formatDuration(sdkDuration)}`);
                } else {
                    throw new Error('Invalid SDK response format');
                }
            } catch (sdkError) {
                debugLogger.trace('[Org Ops] SDK failed, falling back to CLI:', sdkError);
                debugLogger.warn('[Org Ops] SDK unavailable, using slower CLI fallback for organizations');
            }
        }

        // CLI fallback (if SDK not available or failed)
        if (mappedOrgs.length === 0) {
            const result = await deps.commandManager.execute(
                'aio console org list --json',
                { encoding: 'utf8' },
            );

            const cliDuration = Date.now() - startTime;

            if (result.code !== 0) {
                throw new Error(`Failed to get organizations: ${result.stderr}`);
            }

            // SECURITY: Use parseJSON for type-safe parsing
            const orgs = parseJSON<RawAdobeOrg[]>(result.stdout);

            if (!orgs || !Array.isArray(orgs)) {
                throw new Error('Invalid organizations response format');
            }

            mappedOrgs = mapOrganizations(orgs);

            debugLogger.debug(`[Org Ops] Retrieved ${mappedOrgs.length} organizations via CLI in ${formatDuration(cliDuration)}`);
        }

        // Clear stale CLI context if no orgs accessible
        if (mappedOrgs.length === 0) {
            deps.logger.info('No organizations accessible. Clearing previous selections...');
            debugLogger.debug('[Org Ops] No organizations accessible - clearing stale CLI context');
            await clearConsoleContext(deps);
        }

        // Cache the result
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
 * Get current organization from CLI
 */
export async function getCurrentOrganization(
    deps: OrganizationOperationsDeps,
): Promise<AdobeOrg | undefined> {
    const debugLogger = getLogger();

    try {
        // Check cache first
        const cachedOrg = deps.cacheManager.getCachedOrganization();
        if (cachedOrg) {
            return cachedOrg;
        }

        const context = await getConsoleWhereContext(deps);
        if (!context) {
            return undefined;
        }

        if (context.org) {
            // Handle both string and object formats
            let orgData;
            if (typeof context.org === 'string') {
                if (context.org.trim()) {
                    // PERFORMANCE FIX: Always resolve full org object for SDK compatibility
                    // The SDK requires numeric org ID (e.g., "3397333"), not names or IMS org codes
                    // Passing name or IMS org code causes 400 Bad Request and forces slow CLI fallback

                    // Check if we're in post-login phase (no cached org list)
                    const cachedOrgList = deps.cacheManager.getCachedOrgList();

                    if (!cachedOrgList || cachedOrgList.length === 0) {
                        // No cached org list = likely post-login, fetch it now to resolve full org object
                        try {
                            // Fetch org list to get full org object with code (required for SDK operations)
                            const orgs = await getOrganizations(deps);
                            const matchedOrg = orgs.find(o => o.name === context.org || o.code === context.org);

                            if (matchedOrg) {
                                orgData = matchedOrg;
                            } else {
                                debugLogger.warn('[Org Ops] Could not find org in list, using name as fallback');
                                orgData = {
                                    id: context.org,
                                    code: context.org,
                                    name: context.org,
                                };
                            }
                        } catch (error) {
                            debugLogger.trace('[Org Ops] Failed to fetch org list for ID resolution:', error);
                            // Fallback to name-only (SDK operations will fail, CLI fallback will be used)
                            orgData = {
                                id: context.org,
                                code: context.org,
                                name: context.org,
                            };
                        }
                    } else {
                        // We have cached org list, safe to resolve full org object without API calls
                        try {
                            // Try to resolve ID from cache
                            const matchedOrg = cachedOrgList.find(o => o.name === context.org || o.code === context.org);

                            if (matchedOrg) {
                                orgData = matchedOrg;
                            } else {
                                debugLogger.warn('[Org Ops] Could not find org in cached list, using name as fallback');
                                orgData = {
                                    id: context.org,
                                    code: context.org,
                                    name: context.org,
                                };
                            }
                        } catch (error) {
                            debugLogger.trace('[Org Ops] Failed to resolve from cache:', error);
                            orgData = {
                                id: context.org,
                                code: context.org,
                                name: context.org,
                            };
                        }
                    }
                } else {
                    debugLogger.debug('[Org Ops] Organization name is empty string');
                    return undefined;
                }
            } else if (context.org && typeof context.org === 'object') {
                const orgName = context.org.name || context.org.id || 'Unknown';
                debugLogger.debug(`[Org Ops] Current organization: ${orgName}`);
                orgData = {
                    id: context.org.id || orgName,
                    code: context.org.code || orgName,
                    name: orgName,
                };
            } else {
                debugLogger.debug('[Org Ops] Organization data is not string or object');
                return undefined;
            }

            // Cache the result
            deps.cacheManager.setCachedOrganization(orgData);
            return orgData;
        }

        debugLogger.debug('[Org Ops] No organization currently selected');
        return undefined;
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
