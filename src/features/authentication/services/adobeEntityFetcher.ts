/**
 * AdobeEntityFetcher
 *
 * Handles fetching Adobe entities (organizations, projects, workspaces) with
 * SDK-first strategy and CLI fallback. Part of the EntityServices decomposition
 * (created via createEntityServices).
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
    RawWorkspaceCredential,
    SDKResponse,
    WorkspaceCredential,
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
     * Parse and validate CLI JSON response.
     * Strips CLI warning lines (prefixed with ›) that the aio CLI writes to stdout
     * alongside JSON output, which would otherwise break JSON.parse.
     */
    private parseCLIResponse<TRaw>(
        stdout: string,
        stderr: string,
        entityName: string,
    ): TRaw[] {
        const parsed = parseJSON<TRaw[]>(stdout);
        if (parsed && Array.isArray(parsed)) return parsed;

        // Strip non-JSON lines from CLI output. The aio CLI mixes warnings, update
        // notices, and other noise into stdout alongside JSON. Keep only lines that
        // look like JSON content (start with [, ], {, }, or " after trimming).
        const cleaned = stdout.split('\n')
            .filter(line => {
                const trimmed = line.trim();
                if (trimmed.length === 0) return false;
                const firstChar = trimmed[0];
                return firstChar === '[' || firstChar === ']'
                    || firstChar === '{' || firstChar === '}'
                    || firstChar === '"';
            })
            .join('\n');
        const retryParsed = parseJSON<TRaw[]>(cleaned);
        if (retryParsed && Array.isArray(retryParsed)) return retryParsed;

        // Some CLI versions write JSON to stderr when exit code is 2
        if (stderr) {
            const stderrCleaned = stderr.split('\n')
                .filter(line => {
                    const trimmed = line.trim();
                    if (trimmed.length === 0) return false;
                    const firstChar = trimmed[0];
                    return firstChar === '[' || firstChar === ']'
                        || firstChar === '{' || firstChar === '}'
                        || firstChar === '"';
                })
                .join('\n');
            const stderrParsed = parseJSON<TRaw[]>(stderrCleaned);
            if (stderrParsed && Array.isArray(stderrParsed)) return stderrParsed;

            if (stderr.includes('401') || stderr.toLowerCase().includes('unauthorized')) {
                throw new Error('AUTH_EXPIRED: Your Adobe I/O session has expired. Please sign in again.');
            }
            if (stderr.includes('403') || stderr.toLowerCase().includes('forbidden')) {
                throw new Error(
                    'Your Adobe CLI is configured for a different organization than you are signed into. '
                    + 'Run "aio console org select" in your terminal to switch to the correct organization.',
                );
            }
        }

        // Log raw stdout and stderr for debugging when all parsing attempts fail
        this.debugLogger.error(`[Entity Fetcher] Raw ${entityName} stdout (${stdout.length} chars): ${stdout.substring(0, 500)}`);
        this.debugLogger.error(`[Entity Fetcher] Raw ${entityName} stderr (${stderr.length} chars): ${stderr.substring(0, 500)}`);
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

    /**
     * Get OAuth S2S credential for the current workspace.
     *
     * Returns the first OAuth Server-to-Server credential's client_id,
     * which is used as the x-api-key header for ACCS REST API calls.
     *
     * Uses SDK only (no CLI fallback) — requires org, project, and workspace IDs.
     */
    async getWorkspaceCredential(): Promise<WorkspaceCredential | undefined> {
        try {
            await this.ensureSDKReady();

            const cachedOrg = this.cacheManager.getCachedOrganization();
            const cachedProject = this.cacheManager.getCachedProject();
            const cachedWorkspace = this.cacheManager.getCachedWorkspace();

            const orgId = cachedOrg?.id;
            const projectId = cachedProject?.id;
            const workspaceId = cachedWorkspace?.id;

            if (!orgId || !projectId || !workspaceId) {
                this.debugLogger.debug('[Entity Fetcher] Cannot fetch credentials: missing org/project/workspace ID');
                return undefined;
            }

            if (!this.sdkClient.isInitialized()) {
                this.debugLogger.debug('[Entity Fetcher] SDK not available for credential fetch');
                return undefined;
            }

            const client = this.sdkClient.getClient() as {
                getCredentials: (orgId: string, projectId: string, workspaceId: string) =>
                    Promise<SDKResponse<RawWorkspaceCredential[]>>;
            };

            const response = await client.getCredentials(orgId, projectId, workspaceId);
            const credentials = response?.body;

            if (!credentials || !Array.isArray(credentials)) {
                this.debugLogger.debug('[Entity Fetcher] No credentials returned from SDK');
                return undefined;
            }

            // Log all credentials for debugging
            this.debugLogger.debug(`[Entity Fetcher] Workspace has ${credentials.length} credential(s):`);
            for (const c of credentials) {
                const apiKeyStatus = c.apiKey ? 'present' : 'absent';
                const oauthStatus = c.oauth_server_to_server ? 'present' : 'absent';
                this.debugLogger.debug(`  - ${c.name || 'unnamed'}: integration_type=${c.integration_type}, apiKey=${apiKeyStatus}, oauth_s2s=${oauthStatus}`);
            }

            // Resolve client_id: prefer OAuth S2S > top-level apiKey > JWT > OAuth2
            for (const cred of credentials) {
                if (cred.oauth_server_to_server?.client_id) {
                    this.debugLogger.debug(`[Entity Fetcher] Using OAuth S2S client_id from: ${cred.name || 'unnamed'}`);
                    return { clientId: cred.oauth_server_to_server.client_id, name: cred.name, source: 'oauth_server_to_server' };
                }
            }
            for (const cred of credentials) {
                if (cred.apiKey) {
                    this.debugLogger.debug(`[Entity Fetcher] Using top-level apiKey from: ${cred.name || 'unnamed'}`);
                    return { clientId: cred.apiKey, name: cred.name, source: 'apiKey' };
                }
            }
            for (const cred of credentials) {
                if (cred.jwt?.client_id) {
                    this.debugLogger.debug(`[Entity Fetcher] Using JWT client_id from: ${cred.name || 'unnamed'}`);
                    return { clientId: cred.jwt.client_id, name: cred.name, source: 'jwt' };
                }
            }

            this.debugLogger.debug('[Entity Fetcher] No credential with client_id found in workspace');
            return undefined;
        } catch (error) {
            this.debugLogger.error('[Entity Fetcher] Failed to get workspace credentials', error as Error);
            return undefined;
        }
    }

    /**
     * Create an OAuth Server-to-Server credential on the current workspace.
     *
     * Uses the Adobe Console SDK's createOAuthServerToServerCredential method.
     * The response includes `apiKey` which is the client_id we need for ACCS REST API.
     */
    async createWorkspaceCredential(
        name: string,
        description: string,
    ): Promise<WorkspaceCredential | undefined> {
        // Input validation — enforce constraints regardless of caller
        if (!name || name.length > 200) {
            this.debugLogger.error('[Entity Fetcher] Invalid credential name (empty or >200 chars)');
            return undefined;
        }
        if (description.length > 500) {
            this.debugLogger.error('[Entity Fetcher] Invalid credential description (>500 chars)');
            return undefined;
        }

        try {
            await this.ensureSDKReady();

            const cachedOrg = this.cacheManager.getCachedOrganization();
            const cachedProject = this.cacheManager.getCachedProject();
            const cachedWorkspace = this.cacheManager.getCachedWorkspace();

            const orgId = cachedOrg?.id;
            const projectId = cachedProject?.id;
            const workspaceId = cachedWorkspace?.id;

            if (!orgId || !projectId || !workspaceId) {
                this.debugLogger.debug('[Entity Fetcher] Cannot create credential: missing org/project/workspace ID');
                return undefined;
            }

            if (!this.sdkClient.isInitialized()) {
                this.debugLogger.debug('[Entity Fetcher] SDK not available for credential creation');
                return undefined;
            }

            const client = this.sdkClient.getClient() as {
                createOAuthServerToServerCredential: (
                    orgId: string, projectId: string, workspaceId: string,
                    name: string, description: string,
                ) => Promise<SDKResponse<{ id: string; apiKey: string; orgId: string }>>;
            };

            this.debugLogger.info(`[Entity Fetcher] Creating OAuth S2S credential "${name}" on workspace ${workspaceId}`);

            const response = await client.createOAuthServerToServerCredential(
                orgId, projectId, workspaceId, name, description,
            );

            const apiKey = response?.body?.apiKey;
            if (!apiKey) {
                this.debugLogger.error('[Entity Fetcher] Credential created but no apiKey in response');
                return undefined;
            }

            this.debugLogger.info(`[Entity Fetcher] OAuth S2S credential created successfully`);

            return {
                clientId: apiKey,
                name,
                source: 'oauth_server_to_server',
            };
        } catch (error) {
            this.debugLogger.error('[Entity Fetcher] Failed to create workspace credential', error as Error);
            return undefined;
        }
    }
}
