/**
 * AdobeEntityFetcher
 *
 * Handles fetching Adobe entities (organizations, projects, workspaces) with
 * SDK-first strategy and CLI fallback. Part of the AdobeEntityService decomposition
 * for SOP §10 compliance (god file reduction).
 *
 * Responsibilities:
 * - SDK-first fetching with automatic CLI fallback
 * - Caching of fetched results
 * - Performance logging
 *
 * Dependencies:
 * - CommandExecutor for CLI operations
 * - AdobeSDKClient for SDK operations
 * - AuthCacheManager for caching
 * - Logger/StepLogger for logging
 */

import { getLogger, StepLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';
import type { CommandExecutor } from '@/core/shell';
import { formatDuration } from '@/core/utils';
import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import { mapOrganizations, mapProjects, mapWorkspaces } from './adobeEntityMapper';
import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    RawAdobeOrg,
    RawAdobeProject,
    RawAdobeWorkspace,
    SDKResponse,
} from './types';
import { parseJSON } from '@/types/typeGuards';

/**
 * Configuration for AdobeEntityFetcher
 */
export interface AdobeEntityFetcherConfig {
    /**
     * Optional callback when no organizations are accessible.
     * Used by the facade to clear stale console context.
     */
    onNoOrgsAccessible?: () => Promise<void>;
}

/**
 * Fetches Adobe entities with SDK-first strategy and CLI fallback
 */
export class AdobeEntityFetcher {
    private debugLogger = getLogger();

    constructor(
        private commandManager: CommandExecutor,
        private sdkClient: AdobeSDKClient,
        private cacheManager: AuthCacheManager,
        private logger: Logger,
        private stepLogger: StepLogger,
        private config: AdobeEntityFetcherConfig = {},
    ) {}

    /**
     * Get list of organizations (SDK with CLI fallback)
     */
    async getOrganizations(): Promise<AdobeOrg[]> {
        const startTime = Date.now();

        try {
            // Check cache first
            const cachedOrgs = this.cacheManager.getCachedOrgList();
            if (cachedOrgs) {
                return cachedOrgs;
            }

            this.stepLogger.logTemplate('adobe-setup', 'loading-organizations', {});

            let mappedOrgs: AdobeOrg[] = [];

            // Auto-initialize SDK if not ready (lazy init pattern)
            if (!this.sdkClient.isInitialized()) {
                await this.sdkClient.ensureInitialized();
            }

            // Try SDK first for 30x performance improvement
            if (this.sdkClient.isInitialized()) {
                try {
                    const client = this.sdkClient.getClient() as { getOrganizations: () => Promise<SDKResponse<RawAdobeOrg[]>> };
                    const sdkResult = await client.getOrganizations();
                    const sdkDuration = Date.now() - startTime;

                    if (sdkResult.body && Array.isArray(sdkResult.body)) {
                        mappedOrgs = mapOrganizations(sdkResult.body);

                        this.debugLogger.debug(`[Entity Fetcher] Retrieved ${mappedOrgs.length} organizations via SDK in ${formatDuration(sdkDuration)}`);
                    } else {
                        throw new Error('Invalid SDK response format');
                    }
                } catch (sdkError) {
                    this.debugLogger.trace('[Entity Fetcher] SDK failed, falling back to CLI:', sdkError);
                    this.debugLogger.warn('[Entity Fetcher] SDK unavailable, using slower CLI fallback for organizations');
                }
            }

            // CLI fallback (if SDK not available or failed)
            if (mappedOrgs.length === 0) {
                const result = await this.commandManager.execute(
                    'aio console org list --json',
                    { encoding: 'utf8' },
                );

                const cliDuration = Date.now() - startTime;

                // Accept exit code 0 or 2 - Adobe CLI uses exit code 2 for warnings
                if (result.code !== 0 && result.code !== 2) {
                    throw new Error(`Failed to get organizations: ${result.stderr}`);
                }

                // SECURITY: Use parseJSON for type-safe parsing
                const orgs = parseJSON<RawAdobeOrg[]>(result.stdout);

                if (!orgs || !Array.isArray(orgs)) {
                    // Check if this is an auth error (401 in stderr)
                    if (result.stderr?.includes('401') || result.stderr?.toLowerCase().includes('unauthorized')) {
                        throw new Error('AUTH_EXPIRED: Your Adobe I/O session has expired. Please sign in again.');
                    }
                    throw new Error('Invalid organizations response format');
                }

                mappedOrgs = mapOrganizations(orgs);

                this.debugLogger.debug(`[Entity Fetcher] Retrieved ${mappedOrgs.length} organizations via CLI in ${formatDuration(cliDuration)}`);
            }

            // Clear stale CLI context if no orgs accessible
            if (mappedOrgs.length === 0) {
                this.logger.info('No organizations accessible. Clearing previous selections...');
                this.debugLogger.debug('[Entity Fetcher] No organizations accessible - clearing stale CLI context');
                if (this.config.onNoOrgsAccessible) {
                    await this.config.onNoOrgsAccessible();
                }
            }

            // Cache the result
            this.cacheManager.setCachedOrgList(mappedOrgs);

            this.stepLogger.logTemplate('adobe-setup', 'found', {
                count: mappedOrgs.length,
                item: mappedOrgs.length === 1 ? 'organization' : 'organizations',
            });

            return mappedOrgs;
        } catch (error) {
            this.debugLogger.error('[Entity Fetcher] Failed to get organizations', error as Error);
            throw error;
        }
    }

    /**
     * Get list of projects for current org (SDK with CLI fallback)
     * @param options.silent - If true, suppress user-facing log messages (used for internal ID resolution)
     */
    async getProjects(options?: { silent?: boolean }): Promise<AdobeProject[]> {
        const startTime = Date.now();
        const silent = options?.silent ?? false;

        try {
            if (!silent) {
                this.stepLogger.logTemplate('adobe-setup', 'operations.loading-projects', {});
            }

            let mappedProjects: AdobeProject[] = [];
            const cachedOrg = this.cacheManager.getCachedOrganization();

            // Try SDK first if available and we have a VALID numeric org ID
            // PERFORMANCE FIX: SDK requires numeric org ID (e.g., "3397333")
            // The 'id' field contains the numeric org ID, while 'code' is the IMS org ID (e.g., "E94E1E3766FBA7DC0A495FFA@AdobeOrg")
            // Passing IMS org code or org name causes 400 Bad Request and forces slow CLI fallback
            const hasValidOrgId = cachedOrg?.id && cachedOrg.id.length > 0;

            // Auto-initialize SDK if not ready (lazy init pattern)
            if (!this.sdkClient.isInitialized()) {
                await this.sdkClient.ensureInitialized();
            }

            if (this.sdkClient.isInitialized() && hasValidOrgId) {
                try {
                    const client = this.sdkClient.getClient() as { getProjectsForOrg: (orgId: string) => Promise<SDKResponse<RawAdobeProject[]>> };
                    const sdkResult = await client.getProjectsForOrg(cachedOrg.id);
                    const sdkDuration = Date.now() - startTime;

                    if (sdkResult.body && Array.isArray(sdkResult.body)) {
                        mappedProjects = mapProjects(sdkResult.body);

                        this.debugLogger.debug(`[Entity Fetcher] Retrieved ${mappedProjects.length} projects via SDK in ${formatDuration(sdkDuration)}`);
                    } else {
                        throw new Error('Invalid SDK response format');
                    }
                } catch (sdkError) {
                    this.debugLogger.trace('[Entity Fetcher] SDK failed, falling back to CLI:', sdkError);
                    this.debugLogger.warn('[Entity Fetcher] SDK unavailable, using slower CLI fallback for projects');
                }
            } else if (this.sdkClient.isInitialized() && !hasValidOrgId) {
                this.debugLogger.debug('[Entity Fetcher] SDK available but org ID is missing (expected numeric ID like "3397333"), using CLI');
            }

            // CLI fallback
            if (mappedProjects.length === 0) {
                const result = await this.commandManager.execute(
                    'aio console project list --json',
                    { encoding: 'utf8' },
                );

                const cliDuration = Date.now() - startTime;

                // Accept exit code 0 or 2 - Adobe CLI uses exit code 2 for warnings
                if (result.code !== 0 && result.code !== 2) {
                    // Check if it's just no projects
                    if (result.stderr?.includes('does not have any projects')) {
                        this.debugLogger.debug('[Entity Fetcher] No projects found for organization');
                        return [];
                    }
                    throw new Error(`Failed to get projects: ${result.stderr}`);
                }

                // SECURITY: Use parseJSON for type-safe parsing
                const projects = parseJSON<RawAdobeProject[]>(result.stdout);

                if (!projects || !Array.isArray(projects)) {
                    // Check if this is an auth error (401 in stderr)
                    if (result.stderr?.includes('401') || result.stderr?.toLowerCase().includes('unauthorized')) {
                        throw new Error('AUTH_EXPIRED: Your Adobe I/O session has expired. Please sign in again.');
                    }
                    throw new Error('Invalid projects response format');
                }

                mappedProjects = mapProjects(projects);

                this.debugLogger.debug(`[Entity Fetcher] Retrieved ${mappedProjects.length} projects via CLI in ${formatDuration(cliDuration)}`);
            }

            if (!silent) {
                this.stepLogger.logTemplate('adobe-setup', 'statuses.projects-loaded', {
                    count: mappedProjects.length,
                    plural: mappedProjects.length === 1 ? '' : 's',
                });
            }

            return mappedProjects;
        } catch (error) {
            this.debugLogger.error('[Entity Fetcher] Failed to get projects', error as Error);
            throw error;
        }
    }

    /**
     * Get list of workspaces for current project (SDK with CLI fallback)
     */
    async getWorkspaces(): Promise<AdobeWorkspace[]> {
        const startTime = Date.now();

        try {
            this.stepLogger.logTemplate('adobe-setup', 'operations.retrieving-workspaces', {});

            let mappedWorkspaces: AdobeWorkspace[] = [];
            const cachedOrg = this.cacheManager.getCachedOrganization();
            const cachedProject = this.cacheManager.getCachedProject();

            // Try SDK first if available and we have VALID numeric org ID and project ID
            // PERFORMANCE FIX: SDK requires numeric org ID (e.g., "3397333")
            // The 'id' field contains the numeric org ID, while 'code' is the IMS org ID (e.g., "E94E1E3766FBA7DC0A495FFA@AdobeOrg")
            const hasValidOrgId = cachedOrg?.id && cachedOrg.id.length > 0;
            const hasValidProjectId = cachedProject?.id && cachedProject.id.length > 0;

            // Auto-initialize SDK if not ready (lazy init pattern)
            if (!this.sdkClient.isInitialized()) {
                await this.sdkClient.ensureInitialized();
            }

            if (this.sdkClient.isInitialized() && hasValidOrgId && hasValidProjectId) {
                try {
                    const client = this.sdkClient.getClient() as { getWorkspacesForProject: (orgId: string, projectId: string) => Promise<SDKResponse<RawAdobeWorkspace[]>> };
                    const sdkResult = await client.getWorkspacesForProject(
                        cachedOrg.id,
                        cachedProject.id,
                    );
                    const sdkDuration = Date.now() - startTime;

                    if (sdkResult.body && Array.isArray(sdkResult.body)) {
                        mappedWorkspaces = mapWorkspaces(sdkResult.body);

                        this.debugLogger.debug(`[Entity Fetcher] Retrieved ${mappedWorkspaces.length} workspaces via SDK in ${formatDuration(sdkDuration)}`);
                    } else {
                        throw new Error('Invalid SDK response format');
                    }
                } catch (sdkError) {
                    this.debugLogger.trace('[Entity Fetcher] SDK failed, falling back to CLI:', sdkError);
                    this.debugLogger.warn('[Entity Fetcher] SDK unavailable, using slower CLI fallback for workspaces');
                }
            } else if (this.sdkClient.isInitialized() && (!hasValidOrgId || !hasValidProjectId)) {
                this.debugLogger.debug('[Entity Fetcher] SDK available but org ID or project ID is missing, using CLI');
            }

            // CLI fallback
            if (mappedWorkspaces.length === 0) {
                const result = await this.commandManager.execute(
                    'aio console workspace list --json',
                    { encoding: 'utf8' },
                );

                const cliDuration = Date.now() - startTime;

                // Accept exit code 0 or 2 - Adobe CLI uses exit code 2 for warnings
                if (result.code !== 0 && result.code !== 2) {
                    throw new Error(`Failed to get workspaces: ${result.stderr}`);
                }

                // SECURITY: Use parseJSON for type-safe parsing
                const workspaces = parseJSON<RawAdobeWorkspace[]>(result.stdout);

                if (!workspaces || !Array.isArray(workspaces)) {
                    // Check if this is an auth error (401 in stderr)
                    if (result.stderr?.includes('401') || result.stderr?.toLowerCase().includes('unauthorized')) {
                        throw new Error('AUTH_EXPIRED: Your Adobe I/O session has expired. Please sign in again.');
                    }
                    throw new Error('Invalid workspaces response format');
                }

                mappedWorkspaces = mapWorkspaces(workspaces);

                this.debugLogger.debug(`[Entity Fetcher] Retrieved ${mappedWorkspaces.length} workspaces via CLI in ${formatDuration(cliDuration)}`);
            }

            this.stepLogger.logTemplate('adobe-setup', 'statuses.workspaces-loaded', {
                count: mappedWorkspaces.length,
                plural: mappedWorkspaces.length === 1 ? '' : 's',
            });

            return mappedWorkspaces;
        } catch (error) {
            this.debugLogger.error('[Entity Fetcher] Failed to get workspaces', error as Error);
            throw error;
        }
    }
}
