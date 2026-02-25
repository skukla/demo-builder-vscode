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

import { mapOrganizations, mapProjects, mapWorkspaces } from './adobeEntityMapper';
import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    RawAdobeOrg,
    RawAdobeProject,
    RawAdobeWorkspace,
    SDKResponse,
} from './types';
import { getLogger, StepLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { formatDuration } from '@/core/utils';
import type { Logger } from '@/types/logger';
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
     * Ensure SDK is initialized (lazy init pattern)
     */
    private async ensureSDKReady(): Promise<void> {
        if (!this.sdkClient.isInitialized()) {
            await this.sdkClient.ensureInitialized();
        }
    }

    /**
     * Try SDK fetch with automatic fallback
     * @returns Mapped results or empty array if SDK not available/failed
     */
    private async trySDKFetch<TRaw, TMapped>(
        sdkCall: () => Promise<SDKResponse<TRaw[]>>,
        mapper: (raw: TRaw[]) => TMapped[],
        entityName: string,
        startTime: number,
    ): Promise<TMapped[]> {
        if (!this.sdkClient.isInitialized()) return [];

        try {
            const sdkResult = await sdkCall();
            if (!sdkResult.body || !Array.isArray(sdkResult.body)) {
                throw new Error('Invalid SDK response format');
            }
            const mapped = mapper(sdkResult.body);
            const duration = Date.now() - startTime;
            this.debugLogger.debug(`[Entity Fetcher] Retrieved ${mapped.length} ${entityName} via SDK in ${formatDuration(duration)}`);
            return mapped;
        } catch (sdkError) {
            this.debugLogger.trace(`[Entity Fetcher] SDK failed for ${entityName}, falling back to CLI:`, sdkError);
            this.debugLogger.warn(`[Entity Fetcher] SDK unavailable, using slower CLI fallback for ${entityName}`);
            return [];
        }
    }

    /**
     * Validate CLI result exit code
     */
    private validateCLIResult(
        result: { code: number | null; stderr: string },
        entityName: string,
    ): boolean {
        if (result.code === 0 || result.code === 2) return true;
        if (result.stderr?.includes('does not have any projects')) return false;
        throw new Error(`Failed to get ${entityName}: ${result.stderr}`);
    }

    /**
     * Parse and validate CLI JSON response
     */
    private parseCLIResponse<TRaw>(
        stdout: string,
        stderr: string,
        entityName: string,
    ): TRaw[] {
        const parsed = parseJSON<TRaw[]>(stdout);
        if (parsed && Array.isArray(parsed)) return parsed;

        if (stderr?.includes('401') || stderr?.toLowerCase().includes('unauthorized')) {
            throw new Error('AUTH_EXPIRED: Your Adobe I/O session has expired. Please sign in again.');
        }
        throw new Error(`Invalid ${entityName} response format`);
    }

    /**
     * Execute CLI fallback and parse JSON response
     */
    private async executeCLIFallback<TRaw, TMapped>(
        command: string,
        mapper: (raw: TRaw[]) => TMapped[],
        entityName: string,
        startTime: number,
    ): Promise<TMapped[]> {
        const result = await this.commandManager.execute(command, { encoding: 'utf8' });
        const cliDuration = Date.now() - startTime;

        const isValid = this.validateCLIResult(result, entityName);
        if (!isValid) {
            this.debugLogger.debug(`[Entity Fetcher] No ${entityName} found for organization`);
            return [];
        }

        const parsed = this.parseCLIResponse<TRaw>(result.stdout, result.stderr, entityName);
        const mapped = mapper(parsed);
        this.debugLogger.debug(`[Entity Fetcher] Retrieved ${mapped.length} ${entityName} via CLI in ${formatDuration(cliDuration)}`);
        return mapped;
    }

    /**
     * Get list of organizations (SDK with CLI fallback)
     */
    async getOrganizations(): Promise<AdobeOrg[]> {
        const startTime = Date.now();

        try {
            const cachedOrgs = this.cacheManager.getCachedOrgList();
            if (cachedOrgs) return cachedOrgs;

            this.stepLogger.logTemplate('adobe-setup', 'loading-organizations', {});
            await this.ensureSDKReady();

            const client = this.sdkClient.getClient() as { getOrganizations: () => Promise<SDKResponse<RawAdobeOrg[]>> };
            let mappedOrgs = await this.trySDKFetch(
                () => client.getOrganizations(),
                mapOrganizations, 'organizations', startTime,
            );

            if (mappedOrgs.length === 0) {
                mappedOrgs = await this.executeCLIFallback<RawAdobeOrg, AdobeOrg>(
                    'aio console org list --json', mapOrganizations, 'organizations', startTime,
                );
            }

            if (mappedOrgs.length === 0 && this.config.onNoOrgsAccessible) {
                this.logger.info('No organizations accessible. Clearing previous selections...');
                await this.config.onNoOrgsAccessible();
            }

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
     * Try fetching projects via SDK (requires valid cached org ID)
     */
    private async tryFetchProjectsViaSDK(
        cachedOrg: AdobeOrg | undefined,
        startTime: number,
    ): Promise<AdobeProject[]> {
        const hasValidOrgId = cachedOrg?.id && cachedOrg.id.length > 0;
        if (!hasValidOrgId) {
            if (this.sdkClient.isInitialized()) {
                this.debugLogger.debug('[Entity Fetcher] SDK available but org ID is missing, using CLI');
            }
            return [];
        }

        const client = this.sdkClient.getClient() as { getProjectsForOrg: (orgId: string) => Promise<SDKResponse<RawAdobeProject[]>> };
        return this.trySDKFetch(
            () => client.getProjectsForOrg(cachedOrg.id),
            mapProjects, 'projects', startTime,
        );
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

            await this.ensureSDKReady();
            const cachedOrg = this.cacheManager.getCachedOrganization();

            let mappedProjects = await this.tryFetchProjectsViaSDK(cachedOrg, startTime);

            if (mappedProjects.length === 0) {
                mappedProjects = await this.executeCLIFallback<RawAdobeProject, AdobeProject>(
                    'aio console project list --json', mapProjects, 'projects', startTime,
                );
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
            await this.ensureSDKReady();

            const cachedOrg = this.cacheManager.getCachedOrganization();
            const cachedProject = this.cacheManager.getCachedProject();
            const orgId = cachedOrg?.id;
            const projectId = cachedProject?.id;
            const hasValidIds = !!orgId && orgId.length > 0 && !!projectId && projectId.length > 0;

            let mappedWorkspaces: AdobeWorkspace[] = [];

            if (hasValidIds) {
                const client = this.sdkClient.getClient() as { getWorkspacesForProject: (orgId: string, projectId: string) => Promise<SDKResponse<RawAdobeWorkspace[]>> };
                mappedWorkspaces = await this.trySDKFetch(
                    () => client.getWorkspacesForProject(orgId, projectId),
                    mapWorkspaces, 'workspaces', startTime,
                );
            } else if (this.sdkClient.isInitialized()) {
                this.debugLogger.debug('[Entity Fetcher] SDK available but org ID or project ID is missing, using CLI');
            }

            if (mappedWorkspaces.length === 0) {
                mappedWorkspaces = await this.executeCLIFallback<RawAdobeWorkspace, AdobeWorkspace>(
                    'aio console workspace list --json', mapWorkspaces, 'workspaces', startTime,
                );
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
