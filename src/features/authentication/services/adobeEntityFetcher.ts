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
    AdobeIdCredentialInput,
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    OrgServiceInfo,
    RawAdobeOrg,
    RawAdobeProject,
    RawAdobeWorkspace,
    RawWorkspaceCredential,
    SDKResponse,
    ServiceSubscriptionInfo,
    WorkspaceCredential,
} from './types';
import { getLogger, StepLogger } from '@/core/logging';
import { withOrgContext, type CommandExecutor } from '@/core/shell';
import { formatDuration, TIMEOUTS } from '@/core/utils';
import { tryWithTimeout } from '@/core/utils/promiseUtils';
import { ErrorCode } from '@/types/errorCodes';
import { AuthError } from '@/types/errors';
import type { Logger } from '@/types/logger';
import { parseJSON } from '@/types/typeGuards';

/** Name/description for the shared S2S credential created by ensureOAuthCredentialId. */
const OAUTH_CREDENTIAL_NAME = 'demo-builder-s2s';
const OAUTH_CREDENTIAL_DESCRIPTION = 'OAuth Server-to-Server access (Demo Builder)';

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
    /** Cached credential from createWorkspaceCredential — avoids re-query issues */
    private cachedCredential: WorkspaceCredential | undefined;

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

        // Bound the SDK attempt. SDK-first is justified only by "faster than the CLI, or
        // fail fast": without a deadline a stalled Adobe endpoint (observed: the org-list
        // gateway timing out ~60s) makes the "fast path" far slower than the ~3s CLI
        // fallback. Cap the call and fall back instead of riding the remote ceiling.
        const outcome = await tryWithTimeout(sdkCall(), {
            timeoutMs: TIMEOUTS.SDK_ENTITY_FETCH,
            timeoutMessage: `SDK ${entityName} fetch`,
        });

        if (outcome.timedOut) {
            this.debugLogger.warn(
                `[Entity Fetcher] SDK ${entityName} fetch exceeded `
                + `${formatDuration(TIMEOUTS.SDK_ENTITY_FETCH)}, falling back to CLI`,
            );
            return [];
        }

        if (outcome.error || !outcome.result) {
            this.debugLogger.trace(`[Entity Fetcher] SDK failed for ${entityName}, falling back to CLI:`, outcome.error);
            this.debugLogger.warn(`[Entity Fetcher] SDK unavailable, using slower CLI fallback for ${entityName}`);
            return [];
        }

        const sdkResult = outcome.result;
        if (!sdkResult.body || !Array.isArray(sdkResult.body)) {
            this.debugLogger.warn(`[Entity Fetcher] SDK returned an invalid ${entityName} response, falling back to CLI`);
            return [];
        }

        const mapped = mapper(sdkResult.body);
        this.debugLogger.debug(`[Entity Fetcher] Retrieved ${mapped.length} ${entityName} via SDK in ${formatDuration(Date.now() - startTime)}`);
        return mapped;
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
                // Typed, in-app-recoverable error. NO terminal instruction — the UI
                // routes ORG_MISMATCH through ensureOrgContext + a forced sign-in
                // recovery, and agents treat it as non-retryable.
                throw new AuthError(
                    ErrorCode.ORG_MISMATCH,
                    'Adobe CLI is targeting a different organization than this operation needs.',
                    {
                        userMessage: 'This operation needs a different Adobe organization. '
                            + 'Select the correct organization to continue.',
                    },
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

            this.stepLogger.logTemplate('adobe-auth', 'loading-organizations', {});
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
            this.stepLogger.logTemplate('adobe-auth', 'found', {
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
     * Get organizations via the SDK ONLY — never the CLI fallback.
     *
     * For non-interactive on-open probes (P1): the CLI path
     * (`aio console org list`) can stall ~14.5s and trigger interactive browser
     * auth, which must never happen automatically when a dashboard opens. A
     * failed/empty/timed-out SDK read returns `[]` (callers treat that as
     * "unknown / sign in to check"), and we deliberately do NOT cache an empty
     * result (that would poison the shared org-list cache for the real
     * {@link getOrganizations}) or fire `onNoOrgsAccessible` (a state mutation).
     */
    async getOrganizationsSdkOnly(): Promise<AdobeOrg[]> {
        const startTime = Date.now();

        const cachedOrgs = this.cacheManager.getCachedOrgList();
        if (cachedOrgs) return cachedOrgs;

        await this.ensureSDKReady();
        if (!this.sdkClient.isInitialized()) return [];

        const client = this.sdkClient.getClient() as { getOrganizations: () => Promise<SDKResponse<RawAdobeOrg[]>> };
        const mappedOrgs = await this.trySDKFetch(
            () => client.getOrganizations(),
            mapOrganizations, 'organizations', startTime,
        );

        // Cache only a real (non-empty) result — never the degraded empty case.
        if (mappedOrgs.length > 0) {
            this.cacheManager.setCachedOrgList(mappedOrgs);
        }
        return mappedOrgs;
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
     * Get list of projects (SDK with CLI fallback).
     *
     * @param options.silent - If true, suppress user-facing log messages (used for internal ID resolution)
     * @param options.orgId  - If supplied, run the fetch under org-context targeting
     *   (AIO_CONSOLE_* env) so the CLI/SDK target that org WITHOUT mutating the
     *   shared global store. Omitting it preserves the prior ambient-context behavior.
     */
    async getProjects(options?: { silent?: boolean; orgId?: string }): Promise<AdobeProject[]> {
        if (options?.orgId) {
            return withOrgContext(
                { orgId: options.orgId },
                () => this.fetchProjects(options),
            );
        }
        return this.fetchProjects(options);
    }

    /**
     * Core project-fetch logic (SDK-first with CLI fallback).
     * Wrapped by getProjects, which optionally applies org-context targeting.
     */
    private async fetchProjects(options?: { silent?: boolean; orgId?: string }): Promise<AdobeProject[]> {
        const startTime = Date.now();
        const silent = options?.silent ?? false;

        try {
            if (!silent) {
                this.stepLogger.logTemplate('adobe-auth', 'operations.loading-projects', {});
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
                this.stepLogger.logTemplate('adobe-auth', 'statuses.projects-loaded', {
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
            this.stepLogger.logTemplate('adobe-auth', 'operations.retrieving-workspaces', {});
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

            this.stepLogger.logTemplate('adobe-auth', 'statuses.workspaces-loaded', {
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
        // Check in-memory cache first (populated by createWorkspaceCredential)
        if (this.cachedCredential) {
            this.debugLogger.debug(`[Entity Fetcher] Using cached credential: ${this.cachedCredential.name || 'unnamed'}`);
            return this.cachedCredential;
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

            // Log credentials for debugging
            this.debugLogger.debug(`[Entity Fetcher] Workspace has ${credentials.length} credential(s):`);
            for (const c of credentials) {
                const hasClientId = c.client_id ? 'present' : 'absent';
                this.debugLogger.debug(`  - ${c.integration_name || 'unnamed'}: flow_type=${c.flow_type}, integration_type=${c.integration_type}, client_id=${hasClientId}`);
            }

            // Resolve client_id: prefer OAuth S2S (integration_type), fall back to any with client_id
            // Note: OAuth S2S credentials have integration_type='oauth_server_to_server' and flow_type='entp'
            const oauthS2S = credentials.find(
                (c: RawWorkspaceCredential) => c.client_id && c.integration_type === 'oauth_server_to_server',
            );
            if (oauthS2S?.client_id) {
                this.debugLogger.debug(`[Entity Fetcher] Using OAuth S2S credential: ${oauthS2S.integration_name || 'unnamed'}`);
                return { clientId: oauthS2S.client_id, name: oauthS2S.integration_name, source: 'oauth_server_to_server' };
            }

            // Fall back to any credential with a client_id
            const anyCred = credentials.find((c: RawWorkspaceCredential) => !!c.client_id);
            if (anyCred?.client_id) {
                this.debugLogger.debug(`[Entity Fetcher] Using ${anyCred.integration_type || 'unknown'} credential: ${anyCred.integration_name || 'unnamed'}`);
                return { clientId: anyCred.client_id, name: anyCred.integration_name, source: 'apiKey' };
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

            const credential: WorkspaceCredential = {
                clientId: apiKey,
                name,
                source: 'oauth_server_to_server',
            };

            // Cache for immediate use by getWorkspaceCredential (avoids re-query format issues)
            this.cachedCredential = credential;

            return credential;
        } catch (error) {
            const errorMessage = (error as Error).message || '';

            // 409 Conflict = credential already exists — fetch and return it
            if (errorMessage.includes('409') || errorMessage.includes('Conflict')) {
                this.debugLogger.info('[Entity Fetcher] Credential already exists, fetching existing one');
                return this.getWorkspaceCredential();
            }

            this.debugLogger.error('[Entity Fetcher] Failed to create workspace credential', error as Error);
            return undefined;
        }
    }

    /**
     * List the org's entitled services (the `getServicesForOrg` SDK call).
     * Resolves a deployable's `requiredApis` names → sdkCodes + platformList.
     * Each entry carries `{ code, platformList, domainMandatory?, ... }`.
     */
    async getServicesForOrg(orgId: string): Promise<OrgServiceInfo[]> {
        await this.ensureSDKReady();
        const client = this.sdkClient.getClient() as {
            getServicesForOrg: (orgId: string) => Promise<SDKResponse<OrgServiceInfo[]>>;
        };
        const response = await client.getServicesForOrg(orgId);
        return response?.body ?? [];
    }

    /**
     * Create an AdobeID/apiKey credential for apiKey-platform services (e.g. API
     * Mesh `GraphQLServiceSDK`). Returns the credential's `id_integration` (the
     * subscribe id — NOT `.id`). `domain` is MANDATORY for API Mesh.
     */
    async createAdobeIdCredential(
        orgId: string,
        projectId: string,
        workspaceId: string,
        input: AdobeIdCredentialInput,
    ): Promise<string | undefined> {
        await this.ensureSDKReady();
        const client = this.sdkClient.getClient() as {
            createAdobeIdCredential: (
                orgId: string, projectId: string, workspaceId: string, input: AdobeIdCredentialInput,
            ) => Promise<SDKResponse<{ id_integration: string }>>;
        };
        const response = await client.createAdobeIdCredential(orgId, projectId, workspaceId, input);
        return response?.body?.id_integration;
    }

    /**
     * Subscribe apiKey/AdobeID services onto an AdobeID credential. `idIntegration`
     * is the credential's `id_integration`. serviceInfo: `[{ sdkCode,
     * licenseConfigs, roles }]`.
     */
    async subscribeAdobeIdIntegrationToServices(
        orgId: string,
        idIntegration: string,
        serviceInfo: ServiceSubscriptionInfo[],
    ): Promise<void> {
        await this.ensureSDKReady();
        const client = this.sdkClient.getClient() as {
            subscribeAdobeIdIntegrationToServices: (
                orgId: string, idIntegration: string, serviceInfo: ServiceSubscriptionInfo[],
            ) => Promise<SDKResponse<unknown>>;
        };
        await client.subscribeAdobeIdIntegrationToServices(orgId, idIntegration, serviceInfo);
    }

    /**
     * Subscribe OAuth-S2S services onto an S2S credential. `idIntegration` is the
     * credential's `id_integration`. serviceInfo: `[{ sdkCode, licenseConfigs,
     * roles }]`.
     */
    async subscribeOAuthServerToServerIntegrationToServices(
        orgId: string,
        idIntegration: string,
        serviceInfo: ServiceSubscriptionInfo[],
    ): Promise<void> {
        await this.ensureSDKReady();
        const client = this.sdkClient.getClient() as {
            subscribeOAuthServerToServerIntegrationToServices: (
                orgId: string, idIntegration: string, serviceInfo: ServiceSubscriptionInfo[],
            ) => Promise<SDKResponse<unknown>>;
        };
        await client.subscribeOAuthServerToServerIntegrationToServices(orgId, idIntegration, serviceInfo);
    }

    /**
     * Ensure the shared OAuth Server-to-Server credential exists on the workspace
     * and return its `id_integration` (the id the subscribe calls require — NOT
     * the client_id). List-first: returns an existing S2S credential's
     * `id_integration` if present, else creates one and returns the create
     * response's `id`.
     *
     * Takes EXPLICIT args (does NOT read org/proj/ws from cacheManager) so the
     * runner/subscriber can target any workspace. Return is non-optional; throws
     * on missing SDK/args/id rather than returning a bogus value.
     */
    async ensureOAuthCredentialId(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<string> {
        await this.ensureSDKReady();

        if (!orgId || !projectId || !workspaceId) {
            throw new Error('ensureOAuthCredentialId: orgId, projectId, and workspaceId are required');
        }
        if (!this.sdkClient.isInitialized()) {
            throw new Error('ensureOAuthCredentialId: Adobe Console SDK is not initialized');
        }

        const client = this.sdkClient.getClient() as {
            getCredentials: (orgId: string, projectId: string, workspaceId: string) =>
                Promise<SDKResponse<RawWorkspaceCredential[]>>;
            createOAuthServerToServerCredential: (
                orgId: string, projectId: string, workspaceId: string,
                name: string, description: string,
            ) => Promise<SDKResponse<{ id: string; apiKey: string }>>;
        };

        const existing = (await client.getCredentials(orgId, projectId, workspaceId))?.body;
        const s2s = existing?.find(
            (c) => c.integration_type === 'oauth_server_to_server' && c.id_integration,
        );
        if (s2s?.id_integration) {
            return s2s.id_integration;
        }

        const created = await client.createOAuthServerToServerCredential(
            orgId, projectId, workspaceId, OAUTH_CREDENTIAL_NAME, OAUTH_CREDENTIAL_DESCRIPTION,
        );
        const idIntegration = created?.body?.id;
        if (!idIntegration) {
            throw new Error('ensureOAuthCredentialId: credential created but no id in response');
        }
        return idIntegration;
    }
}
