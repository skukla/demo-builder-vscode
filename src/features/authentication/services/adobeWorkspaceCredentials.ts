/**
 * AdobeWorkspaceCredentials — workspace credential reads and creates.
 *
 * Owns every credential operation on a Console workspace: the OAuth S2S
 * credential pair used as the ACCS x-api-key (`getWorkspaceCredential` /
 * `createWorkspaceCredential`, cache-backed), the explicit-args S2S pair the
 * subscribe spine targets (`getWorkspaceS2SCredential` /
 * `createWorkspaceS2SCredentialFor` / `ensureOAuthCredentialId`), and the
 * AdobeID/apiKey credential API Mesh needs (`createAdobeIdCredential`).
 * SDK-only — none of these have a CLI fallback.
 *
 * Extracted from `adobeEntityFetcher.ts` (god-file decomposition, 2026-08-23).
 *
 * @module features/authentication/services/adobeWorkspaceCredentials
 */

import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import type {
    AdobeIdCredentialInput,
    RawWorkspaceCredential,
    S2SDeployCredentials,
    SDKResponse,
    WorkspaceCredential,
    WorkspaceS2SCredentialIds,
} from './types';
import { getLogger } from '@/core/logging/debugLogger';

/**
 * Name/description for the shared S2S credential created by ensureOAuthCredentialId.
 *
 * The name is WORKSPACE-SUFFIXED because Console credential names are unique
 * across the whole ORG (measured 2026-08-27: creating plain `demo-builder-s2s`
 * on a second workspace answers 409 "Duplicate application name") — the fixed
 * name meant every workspace after the first could never get its credential.
 * Lookup is by `integration_type`, never by name, so credentials created under
 * the old fixed name keep being found.
 */
const OAUTH_CREDENTIAL_NAME_PREFIX = 'demo-builder-s2s';
const OAUTH_CREDENTIAL_DESCRIPTION = 'OAuth Server-to-Server access (Demo Builder)';

/** Workspace ids are sequentially allocated, so their tail is unique in practice. */
const CREDENTIAL_NAME_SUFFIX_LENGTH = 8;

function oauthCredentialNameFor(workspaceId: string): string {
    return `${OAUTH_CREDENTIAL_NAME_PREFIX}-${workspaceId.slice(-CREDENTIAL_NAME_SUFFIX_LENGTH)}`;
}

/**
 * Reads and creates credentials on Adobe Console workspaces.
 */
export class AdobeWorkspaceCredentials {
    private debugLogger = getLogger();
    /** Cached credential from createWorkspaceCredential — avoids re-query issues */
    private cachedCredential: WorkspaceCredential | undefined;

    constructor(
        private sdkClient: AdobeSDKClient,
        private cacheManager: AuthCacheManager,
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
            this.debugLogger.debug(
                `[Entity Fetcher] Using cached credential: ${this.cachedCredential.name || 'unnamed'}`,
            );
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
                this.debugLogger.debug(
                    '[Entity Fetcher] Cannot fetch credentials: missing org/project/workspace ID',
                );
                return undefined;
            }

            if (!this.sdkClient.isInitialized()) {
                this.debugLogger.debug('[Entity Fetcher] SDK not available for credential fetch');
                return undefined;
            }

            const client = this.sdkClient.getClient() as {
                getCredentials: (
                    orgId: string,
                    projectId: string,
                    workspaceId: string
                ) => Promise<SDKResponse<RawWorkspaceCredential[]>>;
            };

            const response = await client.getCredentials(orgId, projectId, workspaceId);
            const credentials = response?.body;

            if (!credentials || !Array.isArray(credentials)) {
                this.debugLogger.debug('[Entity Fetcher] No credentials returned from SDK');
                return undefined;
            }

            // Log credentials for debugging
            this.debugLogger.debug(
                `[Entity Fetcher] Workspace has ${credentials.length} credential(s):`,
            );
            for (const c of credentials) {
                const hasClientId = c.client_id ? 'present' : 'absent';
                this.debugLogger.debug(
                    `  - ${c.integration_name || 'unnamed'}: flow_type=${c.flow_type}, integration_type=${c.integration_type}, client_id=${hasClientId}`,
                );
            }

            // Resolve client_id: prefer OAuth S2S (integration_type), fall back to any with client_id
            // Note: OAuth S2S credentials have integration_type='oauth_server_to_server' and flow_type='entp'
            const oauthS2S = credentials.find(
                (c: RawWorkspaceCredential) =>
                    c.client_id && c.integration_type === 'oauth_server_to_server',
            );
            if (oauthS2S?.client_id) {
                this.debugLogger.debug(
                    `[Entity Fetcher] Using OAuth S2S credential: ${oauthS2S.integration_name || 'unnamed'}`,
                );
                return {
                    clientId: oauthS2S.client_id,
                    name: oauthS2S.integration_name,
                    source: 'oauth_server_to_server',
                };
            }

            // Fall back to any credential with a client_id
            const anyCred = credentials.find((c: RawWorkspaceCredential) => !!c.client_id);
            if (anyCred?.client_id) {
                this.debugLogger.debug(
                    `[Entity Fetcher] Using ${anyCred.integration_type || 'unknown'} credential: ${anyCred.integration_name || 'unnamed'}`,
                );
                return {
                    clientId: anyCred.client_id,
                    name: anyCred.integration_name,
                    source: 'apiKey',
                };
            }

            this.debugLogger.debug(
                '[Entity Fetcher] No credential with client_id found in workspace',
            );
            return undefined;
        } catch (error) {
            this.debugLogger.error(
                '[Entity Fetcher] Failed to get workspace credentials',
                error as Error,
            );
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
            this.debugLogger.error(
                '[Entity Fetcher] Invalid credential name (empty or >200 chars)',
            );
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
                this.debugLogger.debug(
                    '[Entity Fetcher] Cannot create credential: missing org/project/workspace ID',
                );
                return undefined;
            }

            if (!this.sdkClient.isInitialized()) {
                this.debugLogger.debug(
                    '[Entity Fetcher] SDK not available for credential creation',
                );
                return undefined;
            }

            const client = this.sdkClient.getClient() as {
                createOAuthServerToServerCredential: (
                    orgId: string,
                    projectId: string,
                    workspaceId: string,
                    name: string,
                    description: string
                ) => Promise<SDKResponse<{ id: string; apiKey: string; orgId: string }>>;
            };

            this.debugLogger.info(
                `[Entity Fetcher] Creating OAuth S2S credential "${name}" on workspace ${workspaceId}`,
            );

            const response = await client.createOAuthServerToServerCredential(
                orgId,
                projectId,
                workspaceId,
                name,
                description,
            );

            const apiKey = response?.body?.apiKey;
            if (!apiKey) {
                this.debugLogger.error(
                    '[Entity Fetcher] Credential created but no apiKey in response',
                );
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
                this.debugLogger.info(
                    '[Entity Fetcher] Credential already exists, fetching existing one',
                );
                return this.getWorkspaceCredential();
            }

            this.debugLogger.error(
                '[Entity Fetcher] Failed to create workspace credential',
                error as Error,
            );
            return undefined;
        }
    }

    /**
     * Create an AdobeID/apiKey credential for apiKey-platform services (e.g. API
     * Mesh `GraphQLServiceSDK`). Returns the credential's `id_integration` (the
     * subscribe id — NOT `.id`). `domain` is MANDATORY for API Mesh.
     *
     * List-first (mirrors {@link ensureOAuthCredentialId}): returns an existing
     * apiKey credential's `id_integration` when one already matches `input.name`
     * (e.g. `demo-builder-api-mesh`), so running the subscribe twice never leaves
     * a duplicate credential. Creates only when none matches.
     */
    async createAdobeIdCredential(
        orgId: string,
        projectId: string,
        workspaceId: string,
        input: AdobeIdCredentialInput,
    ): Promise<string | undefined> {
        await this.ensureSDKReady();
        const client = this.sdkClient.getClient() as {
            getCredentials: (
                orgId: string,
                projectId: string,
                workspaceId: string
            ) => Promise<SDKResponse<RawWorkspaceCredential[]>>;
            createAdobeIdCredential: (
                orgId: string,
                projectId: string,
                workspaceId: string,
                input: AdobeIdCredentialInput
            ) => Promise<SDKResponse<{ id_integration?: string; id?: string }>>;
        };

        // Reuse an existing apiKey credential whose name is the requested one OR any
        // legacy `reuseNames` alias — so a workspace that already has the old fixed-name
        // credential is reused instead of colliding on a duplicate create.
        const acceptableNames = new Set([input.name, ...(input.reuseNames ?? [])]);
        const existing = (await client.getCredentials(orgId, projectId, workspaceId))?.body;
        const match = existing?.find(
            (c) =>
                (c.integration_type === 'apikey' || c.flow_type === 'adobeid') &&
                !!c.integration_name &&
                acceptableNames.has(c.integration_name) &&
                c.id_integration,
        );
        if (match?.id_integration) {
            return match.id_integration;
        }

        // The create response returns the integration id in `.id` (like the OAuth create),
        // NOT `.id_integration` — that field only appears on getCredentials LIST entries.
        // Prefer id_integration when present, else fall back to id. `reuseNames` is a
        // local hint, not an Adobe field — strip it from the create payload.
        const { reuseNames: _reuseNames, ...sdkInput } = input;
        const response = await client.createAdobeIdCredential(
            orgId,
            projectId,
            workspaceId,
            sdkInput,
        );
        return response?.body?.id_integration ?? response?.body?.id;
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
        const existing = await this.getWorkspaceS2SCredential(orgId, projectId, workspaceId);
        return (
            existing?.idIntegration ??
            (await this.createWorkspaceS2SCredentialFor(orgId, projectId, workspaceId))
                .idIntegration
        );
    }

    /**
     * The workspace S2S credential's FULL identity for IMS server-to-server
     * auth — what an App Management app's actions need at deploy time
     * (`AIO_COMMERCE_AUTH_IMS_*` inputs). Ensures the credential exists, then
     * reads its detail (`getIntegration`) and secret (`getIntegrationSecrets`).
     *
     * Shapes verified live 2026-08-27 against a freshly created credential:
     * detail carries `technicalAccountId`/`technicalAccountEmail`/`orgCode`
     * (the IMS org id); secrets carry `client_secrets: [{ client_secret }]`.
     *
     * SECRET HYGIENE: callers inject the secret into a per-invocation env and
     * never persist or log it.
     */
    async getS2SDeployCredentials(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<S2SDeployCredentials> {
        const idIntegration = await this.ensureOAuthCredentialId(orgId, projectId, workspaceId);

        const client = this.sdkClient.getClient() as {
            getIntegration: (
                orgId: string,
                intId: string
            ) => Promise<
                SDKResponse<{
                    apiKey?: string;
                    technicalAccountId?: string;
                    technicalAccountEmail?: string;
                    orgCode?: string;
                }>
            >;
            getIntegrationSecrets: (
                orgId: string,
                intId: string
            ) => Promise<SDKResponse<{ client_secrets?: Array<{ client_secret?: string }> }>>;
        };

        const detail = (await client.getIntegration(orgId, idIntegration))?.body;
        const secrets = (await client.getIntegrationSecrets(orgId, idIntegration))?.body;

        // Validated field-by-field into a fully typed candidate — the
        // error names the first gap, and no non-null assertion is needed.
        const candidate: S2SDeployCredentials = {
            clientId: detail?.apiKey ?? '',
            clientSecret: secrets?.client_secrets?.[0]?.client_secret ?? '',
            technicalAccountId: detail?.technicalAccountId ?? '',
            technicalAccountEmail: detail?.technicalAccountEmail ?? '',
            imsOrgCode: detail?.orgCode ?? '',
        };
        const missing = Object.entries(candidate).find(([, value]) => value === '');
        if (missing) {
            throw new Error(
                `Workspace S2S credential is missing ${missing[0]} — cannot build IMS auth env.`,
            );
        }
        return candidate;
    }

    /**
     * Get the workspace's existing OAuth Server-to-Server credential ids, or
     * `undefined` when the workspace has none. Matches ONLY
     * `integration_type === 'oauth_server_to_server'` list entries — an
     * apiKey/AdobeID credential never matches. Returns both ids teardown needs:
     * `clientId` (list entry `client_id`) and `idIntegration` (the id the
     * Console subscribe calls take).
     *
     * Takes EXPLICIT args (does NOT read org/proj/ws from cacheManager). Throws
     * on missing SDK/args; SDK errors propagate unchanged.
     */
    async getWorkspaceS2SCredential(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<WorkspaceS2SCredentialIds | undefined> {
        await this.ensureSDKReady();

        if (!orgId || !projectId || !workspaceId) {
            throw new Error(
                'getWorkspaceS2SCredential: orgId, projectId, and workspaceId are required',
            );
        }
        if (!this.sdkClient.isInitialized()) {
            throw new Error('getWorkspaceS2SCredential: Adobe Console SDK is not initialized');
        }

        const client = this.sdkClient.getClient() as {
            getCredentials: (
                orgId: string,
                projectId: string,
                workspaceId: string
            ) => Promise<SDKResponse<RawWorkspaceCredential[]>>;
        };

        const credentials = (await client.getCredentials(orgId, projectId, workspaceId))?.body;
        const s2s = credentials?.find(
            (c) => c.integration_type === 'oauth_server_to_server' && c.id_integration,
        );
        if (!s2s?.id_integration) {
            return undefined;
        }
        // client_id is always present on list entries (see RawWorkspaceCredential);
        // fall back defensively rather than dropping the credential, so
        // ensureOAuthCredentialId keeps its original list-phase semantics.
        return { clientId: s2s.client_id ?? '', idIntegration: s2s.id_integration };
    }

    /**
     * Create the shared OAuth Server-to-Server credential on the workspace and
     * return its ids: `clientId` (create response `apiKey`) and `idIntegration`
     * (create response `id` — `id_integration` only appears on LIST entries).
     *
     * Takes EXPLICIT args (does NOT read org/proj/ws from cacheManager). Throws
     * on missing SDK/args or when the create response lacks either id; SDK
     * errors propagate unchanged.
     */
    async createWorkspaceS2SCredentialFor(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<WorkspaceS2SCredentialIds> {
        await this.ensureSDKReady();

        if (!orgId || !projectId || !workspaceId) {
            throw new Error(
                'createWorkspaceS2SCredentialFor: orgId, projectId, and workspaceId are required',
            );
        }
        if (!this.sdkClient.isInitialized()) {
            throw new Error(
                'createWorkspaceS2SCredentialFor: Adobe Console SDK is not initialized',
            );
        }

        const client = this.sdkClient.getClient() as {
            createOAuthServerToServerCredential: (
                orgId: string,
                projectId: string,
                workspaceId: string,
                name: string,
                description: string
            ) => Promise<SDKResponse<{ id: string; apiKey: string }>>;
        };

        const created = await client.createOAuthServerToServerCredential(
            orgId,
            projectId,
            workspaceId,
            oauthCredentialNameFor(workspaceId),
            OAUTH_CREDENTIAL_DESCRIPTION,
        );
        const idIntegration = created?.body?.id;
        const clientId = created?.body?.apiKey;
        if (!idIntegration || !clientId) {
            throw new Error(
                'createWorkspaceS2SCredentialFor: credential created but response is missing id or apiKey',
            );
        }
        return { clientId, idIntegration };
    }
}
