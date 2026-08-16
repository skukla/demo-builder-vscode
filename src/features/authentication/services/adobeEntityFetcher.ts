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
import { deriveAdobeEntityName } from './adobeEntityName';
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
    WorkspaceS2SCredentialIds,
} from './types';
import { getLogger, StepLogger } from '@/core/logging';
import { withOrgContext, type CommandExecutor } from '@/core/shell';
import { CACHE_TTL, formatDuration, SingleFlight, TIMEOUTS } from '@/core/utils';
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
 * The subscribe response, only as deep as the refusal check reads.
 *
 * `error` is the list of sdkCodes that were refused; `errorDetails` carries the
 * reason for each. Both are absent on success.
 */
interface SubscribeResponseBody {
    error?: string[];
    errorDetails?: Array<{ sdkCode?: string; code?: number; message?: string }>;
}

/**
 * Throw when Adobe refused a subscription **inside an HTTP 200**.
 *
 * Adobe does not signal a refused subscribe with a status code or a rejected
 * promise. It answers 200 and puts the failure in the body:
 *
 * ```json
 * { "error": ["ACCS-REST-API"],
 *   "errorDetails": [{ "sdkCode": "ACCS-REST-API", "domain": "JIL", "code": 400,
 *                      "message": "Service ACCS-REST-API requires selection of a product" }] }
 * ```
 *
 * Both subscribe wrappers used to discard the response entirely, so this read as
 * success. That mattered because **the subscription IS the entitlement** — it is
 * what moves an S2S credential's scopes from `AdobeID,openid` to `commerce.accs`
 * — so `provisionAccsCredentials` went on to return a scope-less credential whose
 * only symptom was a Data Installer pre-flight 400 minutes later, in a different
 * feature, with nothing connecting the two. Measured 2026-08-16 against an org
 * holding no ACCS product (`.rptc/plans/data-installer-credential-broker/step-05.md`).
 *
 * **Only positive evidence fails.** The SDK does not always return a body, and an
 * absent one cannot be distinguished from a success — so a missing body, a missing
 * `error` key, and an empty `error` list all pass. Requiring a body would turn
 * every real success into a throw.
 *
 * The service's own message is carried through verbatim: "requires selection of a
 * product" names the missing entitlement, where "provisioning failed" would send
 * someone to look at the wrong thing.
 */
function assertSubscribeAccepted(response: SDKResponse<unknown> | undefined): void {
    const body = response?.body as SubscribeResponseBody | undefined;
    const refusedCodes = body?.error ?? [];
    const details = body?.errorDetails ?? [];
    if (refusedCodes.length === 0 && details.length === 0) {
        return;
    }

    const reasons = details
        .map((d) => (d.sdkCode ? `${d.sdkCode}: ${d.message ?? `HTTP ${d.code}`}` : d.message))
        .filter(Boolean);
    const named = reasons.length > 0 ? reasons.join('; ') : refusedCodes.join(', ');
    throw new Error(`Adobe refused the API subscription — ${named}`);
}

/**
 * Fetches Adobe entities with SDK-first strategy and CLI fallback
 */
export class AdobeEntityFetcher {
    private debugLogger = getLogger();
    /**
     * Shared in-flight org-list fetch. Distinct from the org-list CACHE, which can
     * only help callers arriving after a fetch has completed.
     */
    private readonly orgListFlight = new SingleFlight<AdobeOrg[] | undefined>();
    /** Cached credential from createWorkspaceCredential — avoids re-query issues */
    private cachedCredential: WorkspaceCredential | undefined;
    /**
     * Per-org cache of the entitled-services catalog (see getServicesForOrg).
     * Per-fetcher-instance: the fetcher is a session singleton (created once via
     * ServiceLocator/AuthenticationService), so this lives for the session.
     */
    private servicesCache = new Map<string, { services: OrgServiceInfo[]; expiresAt: number }>();
    /** In-flight catalog fetch per org — see getServicesForOrg. */
    private readonly servicesFlights = new Map<string, SingleFlight<OrgServiceInfo[]>>();

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
     * Try SDK fetch with automatic fallback.
     *
     * @returns the mapped results, or `undefined` when the SDK could not answer
     *   (not initialized, failed, timed out, or returned an invalid shape). An
     *   EMPTY ARRAY is a real answer — "the API says there are none" — and the
     *   two must stay distinguishable: conflating them is what made a token that
     *   reaches zero orgs read as "SDK unavailable" on the dashboard (2026-08-13).
     */
    private async trySDKFetch<TRaw, TMapped>(
        sdkCall: () => Promise<SDKResponse<TRaw[]>>,
        mapper: (raw: TRaw[]) => TMapped[],
        entityName: string,
        startTime: number,
    ): Promise<TMapped[] | undefined> {
        if (!this.sdkClient.isInitialized()) return undefined;

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
                `[Entity Fetcher] SDK ${entityName} fetch exceeded ` +
                    `${formatDuration(TIMEOUTS.SDK_ENTITY_FETCH)}, falling back to CLI`,
            );
            return undefined;
        }

        if (outcome.error || !outcome.result) {
            this.debugLogger.trace(
                `[Entity Fetcher] SDK failed for ${entityName}, falling back to CLI:`,
                outcome.error,
            );
            this.debugLogger.warn(
                `[Entity Fetcher] SDK unavailable, using slower CLI fallback for ${entityName}`,
            );
            return undefined;
        }

        const sdkResult = outcome.result;
        if (!sdkResult.body || !Array.isArray(sdkResult.body)) {
            this.debugLogger.warn(
                `[Entity Fetcher] SDK returned an invalid ${entityName} response, falling back to CLI`,
            );
            return undefined;
        }

        const mapped = mapper(sdkResult.body);
        this.debugLogger.debug(
            `[Entity Fetcher] Retrieved ${mapped.length} ${entityName} via SDK in ${formatDuration(Date.now() - startTime)}`,
        );
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
    private parseCLIResponse<TRaw>(stdout: string, stderr: string, entityName: string): TRaw[] {
        const parsed = parseJSON<TRaw[]>(stdout);
        if (parsed && Array.isArray(parsed)) return parsed;

        // Strip non-JSON lines from CLI output. The aio CLI mixes warnings, update
        // notices, and other noise into stdout alongside JSON. Keep only lines that
        // look like JSON content (start with [, ], {, }, or " after trimming).
        const cleaned = stdout
            .split('\n')
            .filter((line) => {
                const trimmed = line.trim();
                if (trimmed.length === 0) return false;
                const firstChar = trimmed[0];
                return (
                    firstChar === '[' ||
                    firstChar === ']' ||
                    firstChar === '{' ||
                    firstChar === '}' ||
                    firstChar === '"'
                );
            })
            .join('\n');
        const retryParsed = parseJSON<TRaw[]>(cleaned);
        if (retryParsed && Array.isArray(retryParsed)) return retryParsed;

        // Some CLI versions write JSON to stderr when exit code is 2
        if (stderr) {
            const stderrCleaned = stderr
                .split('\n')
                .filter((line) => {
                    const trimmed = line.trim();
                    if (trimmed.length === 0) return false;
                    const firstChar = trimmed[0];
                    return (
                        firstChar === '[' ||
                        firstChar === ']' ||
                        firstChar === '{' ||
                        firstChar === '}' ||
                        firstChar === '"'
                    );
                })
                .join('\n');
            const stderrParsed = parseJSON<TRaw[]>(stderrCleaned);
            if (stderrParsed && Array.isArray(stderrParsed)) return stderrParsed;

            if (stderr.includes('401') || stderr.toLowerCase().includes('unauthorized')) {
                throw new Error(
                    'AUTH_EXPIRED: Your Adobe I/O session has expired. Please sign in again.',
                );
            }
            if (stderr.includes('403') || stderr.toLowerCase().includes('forbidden')) {
                // Typed, in-app-recoverable error. NO terminal instruction — the UI
                // routes ORG_MISMATCH through ensureOrgContext + a forced sign-in
                // recovery, and agents treat it as non-retryable.
                throw new AuthError(
                    ErrorCode.ORG_MISMATCH,
                    'Adobe CLI is targeting a different organization than this operation needs.',
                    {
                        userMessage:
                            'This operation needs a different Adobe organization. ' +
                            'Select the correct organization to continue.',
                    },
                );
            }
        }

        // Log raw stdout and stderr for debugging when all parsing attempts fail
        this.debugLogger.error(
            `[Entity Fetcher] Raw ${entityName} stdout (${stdout.length} chars): ${stdout.substring(0, 500)}`,
        );
        this.debugLogger.error(
            `[Entity Fetcher] Raw ${entityName} stderr (${stderr.length} chars): ${stderr.substring(0, 500)}`,
        );
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
        this.debugLogger.debug(
            `[Entity Fetcher] Retrieved ${mapped.length} ${entityName} via CLI in ${formatDuration(cliDuration)}`,
        );
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

            const client = this.sdkClient.getClient() as {
                getOrganizations: () => Promise<SDKResponse<RawAdobeOrg[]>>;
            };
            let mappedOrgs =
                (await this.trySDKFetch(
                    () => client.getOrganizations(),
                    mapOrganizations,
                    'organizations',
                    startTime,
                )) ?? [];

            if (mappedOrgs.length === 0) {
                mappedOrgs = await this.executeCLIFallback<RawAdobeOrg, AdobeOrg>(
                    'aio console org list --json',
                    mapOrganizations,
                    'organizations',
                    startTime,
                );
            }

            if (mappedOrgs.length === 0 && this.config.onNoOrgsAccessible) {
                this.logger.info('No organizations accessible. Clearing previous selections...');
                await this.config.onNoOrgsAccessible();
            }

            // Cache only a non-empty result. executeCLIFallback returns [] for a
            // FAILED probe (bad exit, unparseable output) as well as a real empty
            // answer, and the SDK-only reader is cache-first — a cached failed-[]
            // would read as "the token reaches no orgs" and flip the dashboard to
            // the org-mismatch warning until the TTL expired. Same rule as
            // fetchOrganizationsSdkOnly below.
            if (mappedOrgs.length > 0) {
                this.cacheManager.setCachedOrgList(mappedOrgs);
            }
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
     * failed/timed-out SDK read returns `undefined` ("could not answer" — callers
     * show "sign in to check"); an EMPTY ARRAY is a real answer (the token
     * reaches no Console orgs) and callers surface the org-switch recovery. We
     * deliberately do NOT cache a degraded result (that would poison the shared
     * org-list cache for the real {@link getOrganizations}) or fire
     * `onNoOrgsAccessible` (a state mutation).
     */
    async getOrganizationsSdkOnly(): Promise<AdobeOrg[] | undefined> {
        const cachedOrgs = this.cacheManager.getCachedOrgList();
        if (cachedOrgs) return cachedOrgs;

        // The cache dedupes SEQUENTIAL callers; concurrent ones all check before any
        // has written, so each fired its own SDK round-trip. Opening the integrations
        // surface starts `orgContextCheck` and the API picker's handler at nearly the
        // same moment — the logs showed two overlapping fetches (2.5s + 1.4s) for one
        // piece of data.
        return this.orgListFlight.run(() => this.fetchOrganizationsSdkOnly());
    }

    /** The uncached fetch behind {@link getOrganizationsSdkOnly}'s single-flight. */
    private async fetchOrganizationsSdkOnly(): Promise<AdobeOrg[] | undefined> {
        const startTime = Date.now();

        await this.ensureSDKReady();
        if (!this.sdkClient.isInitialized()) return undefined;

        const client = this.sdkClient.getClient() as {
            getOrganizations: () => Promise<SDKResponse<RawAdobeOrg[]>>;
        };
        const mappedOrgs = await this.trySDKFetch(
            () => client.getOrganizations(),
            mapOrganizations,
            'organizations',
            startTime,
        );

        // Cache only a real (non-empty) result — never the degraded/empty cases.
        if (mappedOrgs && mappedOrgs.length > 0) {
            this.cacheManager.setCachedOrgList(mappedOrgs);
        }
        return mappedOrgs;
    }

    /**
     * Resolve the org id an SDK entity fetch should target.
     *
     * Prefers the caller-supplied id (the threaded selection, then the
     * cached/ambient org). When neither is present, falls back to the TOKEN org
     * (`getOrganizationsSdkOnly()[0]` — the canonical "token org is truth"
     * convention, same source `detectProjectOrgMismatch` uses) via the SDK, NOT
     * the CLI. That keeps an un-threaded, un-cached fetch on the SDK path instead
     * of dropping to the CLI fallback, which targets the STALE `aio console` org
     * and 403s -> ORG_MISMATCH (a slow, noisy failure).
     *
     * `getOrganizationsSdkOnly` is self-guarding: it returns undefined (→ this
     * returns undefined) when the SDK isn't initialized, so the caller then keeps
     * its existing return-[] → CLI path. Deliberately SDK-only to avoid a
     * circular CLI dependency.
     */
    private async resolveEffectiveOrgId(preferredOrgId?: string): Promise<string | undefined> {
        if (preferredOrgId && preferredOrgId.length > 0) return preferredOrgId;
        return (await this.getOrganizationsSdkOnly())?.[0]?.id;
    }

    /**
     * Try fetching projects via SDK (requires a resolvable org ID)
     */
    private async tryFetchProjectsViaSDK(
        cachedOrg: AdobeOrg | undefined,
        startTime: number,
        targetOrgId?: string,
    ): Promise<AdobeProject[]> {
        // Fetch for the EFFECTIVE target org: the explicitly threaded org id wins
        // (the caller's intent — e.g. the wizard's selected org), then the
        // cached/ambient org, then the TOKEN org (see resolveEffectiveOrgId). The
        // cached org can be stale after an org switch, so blindly using it returns
        // the wrong org's projects (or an empty list).
        const effectiveOrgId = await this.resolveEffectiveOrgId(targetOrgId ?? cachedOrg?.id);
        const hasValidOrgId = !!effectiveOrgId && effectiveOrgId.length > 0;
        if (!hasValidOrgId) {
            // Still no id (e.g. SDK not initialized, or the token has no orgs): use the CLI.
            if (this.sdkClient.isInitialized()) {
                this.debugLogger.debug(
                    '[Entity Fetcher] SDK available but org ID is missing, using CLI',
                );
            }
            return [];
        }

        const client = this.sdkClient.getClient() as {
            getProjectsForOrg: (orgId: string) => Promise<SDKResponse<RawAdobeProject[]>>;
        };
        return (
            (await this.trySDKFetch(
                () => client.getProjectsForOrg(effectiveOrgId),
                mapProjects,
                'projects',
                startTime,
            )) ?? []
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
            return withOrgContext({ orgId: options.orgId }, () => this.fetchProjects(options));
        }
        return this.fetchProjects(options);
    }

    /**
     * Get projects via the SDK ONLY — never the CLI fallback.
     *
     * The projects sibling of {@link getOrganizationsSdkOnly}, for reads the user
     * did not ask for. `aio console project list --json` triggers interactive
     * browser auth on a stale token, which must never happen for a background
     * fetch (P1). A failed or empty SDK read degrades to `[]`; the caller shows
     * nothing rather than prompting.
     *
     * @param options.orgId - target org (threaded, not the ambient CLI selection)
     * @returns the projects, or `[]` when the SDK cannot answer
     */
    async getProjectsSdkOnly(options?: { orgId?: string }): Promise<AdobeProject[]> {
        const params = { ...options, silent: true, sdkOnly: true };
        if (options?.orgId) {
            return withOrgContext({ orgId: options.orgId }, () => this.fetchProjects(params));
        }
        return this.fetchProjects(params);
    }

    /**
     * Core project-fetch logic (SDK-first with CLI fallback).
     * Wrapped by getProjects, which optionally applies org-context targeting.
     */
    private async fetchProjects(options?: {
        silent?: boolean;
        orgId?: string;
        /** P1: skip the `aio console` fallback entirely (see getProjectsSdkOnly). */
        sdkOnly?: boolean;
    }): Promise<AdobeProject[]> {
        const startTime = Date.now();
        const silent = options?.silent ?? false;

        try {
            if (!silent) {
                this.stepLogger.logTemplate('adobe-auth', 'operations.loading-projects', {});
            }

            await this.ensureSDKReady();
            const cachedOrg = this.cacheManager.getCachedOrganization();

            let mappedProjects = await this.tryFetchProjectsViaSDK(
                cachedOrg,
                startTime,
                options?.orgId,
            );

            if (mappedProjects.length === 0 && !options?.sdkOnly) {
                mappedProjects = await this.executeCLIFallback<RawAdobeProject, AdobeProject>(
                    'aio console project list --json',
                    mapProjects,
                    'projects',
                    startTime,
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
     * Get list of workspaces (SDK with CLI fallback).
     *
     * Targets the fetch (AIO_CONSOLE_* env via withOrgContext) at the THREADED org +
     * project (from webview state, passed by the handler) so both the SDK and the CLI
     * fallback hit the right project — NOT the stale in-memory cache. The selected project
     * is deliberately not cached (Phase 4a threads it per-op), so relying on the cache
     * targets a wrong or deleted project ("Invalid Project id") or the CLI's ambient org
     * ("Adobe CLI is targeting a different organization"). Falls back to the cache only when
     * nothing is threaded. Mirrors getProjects' org-context targeting.
     */
    async getWorkspaces(target?: {
        orgId?: string;
        projectId?: string;
    }): Promise<AdobeWorkspace[]> {
        const cachedOrg = this.cacheManager.getCachedOrganization();
        const cachedProject = this.cacheManager.getCachedProject();
        // Prefer the threaded selection, then the cache, then the TOKEN org via the
        // SDK (see resolveEffectiveOrgId). The token fallback keeps an un-threaded,
        // un-cached workspace fetch on the SDK path instead of the CLI (which targets
        // the stale `aio console` org -> ORG_MISMATCH). projectId threading is unchanged.
        const orgId = await this.resolveEffectiveOrgId(target?.orgId ?? cachedOrg?.id);
        const projectId = target?.projectId ?? cachedProject?.id;
        // Enrich org code/name only when the resolved org still matches the cached org.
        const orgMatches = !!cachedOrg && cachedOrg.id === orgId;

        if (orgId && projectId) {
            return withOrgContext(
                {
                    orgId,
                    orgCode: orgMatches ? cachedOrg?.code : undefined,
                    orgName: orgMatches ? cachedOrg?.name : undefined,
                    projectId,
                },
                () => this.fetchWorkspaces(orgId, projectId),
            );
        }
        return this.fetchWorkspaces(orgId, projectId);
    }

    /**
     * Get workspaces via the SDK ONLY — never the CLI fallback.
     *
     * The workspaces sibling of {@link getProjectsSdkOnly}; same P1 reasoning.
     *
     * @param target - threaded org + project to target
     * @returns the workspaces, or `[]` when the SDK cannot answer
     */
    async getWorkspacesSdkOnly(target?: {
        orgId?: string;
        projectId?: string;
    }): Promise<AdobeWorkspace[]> {
        const cachedOrg = this.cacheManager.getCachedOrganization();
        const cachedProject = this.cacheManager.getCachedProject();
        const orgId = await this.resolveEffectiveOrgId(target?.orgId ?? cachedOrg?.id);
        const projectId = target?.projectId ?? cachedProject?.id;
        return this.fetchWorkspaces(orgId, projectId, true);
    }

    /**
     * Core workspace-fetch (SDK-first with CLI fallback). Wrapped by getWorkspaces, which
     * applies org-context targeting.
     */
    private async fetchWorkspaces(
        orgId?: string,
        projectId?: string,
        sdkOnly = false,
    ): Promise<AdobeWorkspace[]> {
        const startTime = Date.now();

        try {
            this.stepLogger.logTemplate('adobe-auth', 'operations.retrieving-workspaces', {});
            await this.ensureSDKReady();

            const hasValidIds = !!orgId && orgId.length > 0 && !!projectId && projectId.length > 0;

            let mappedWorkspaces: AdobeWorkspace[] = [];

            if (hasValidIds) {
                const client = this.sdkClient.getClient() as {
                    getWorkspacesForProject: (
                        orgId: string,
                        projectId: string
                    ) => Promise<SDKResponse<RawAdobeWorkspace[]>>;
                };
                mappedWorkspaces =
                    (await this.trySDKFetch(
                        () => client.getWorkspacesForProject(orgId, projectId),
                        mapWorkspaces,
                        'workspaces',
                        startTime,
                    )) ?? [];
            } else if (this.sdkClient.isInitialized()) {
                this.debugLogger.debug(
                    '[Entity Fetcher] SDK available but org ID or project ID is missing, using CLI',
                );
            }

            if (mappedWorkspaces.length === 0 && !sdkOnly) {
                mappedWorkspaces = await this.executeCLIFallback<RawAdobeWorkspace, AdobeWorkspace>(
                    'aio console workspace list --json',
                    mapWorkspaces,
                    'workspaces',
                    startTime,
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
     * Create a new Adobe I/O App Builder project in the current organization.
     *
     * Uses the Console SDK's `createFireflyProject` (project type 'jaeger' =
     * App Builder). Needs only the cached org id. SDK-only (no CLI fallback).
     * Never throws — returns the mapped project, or `undefined` on validation
     * failure, missing org, unavailable SDK, or any SDK error (403 permission /
     * 409 name-taken / quota), which the handler surfaces to the user.
     */
    async createProject(title: string, description: string): Promise<AdobeProject | undefined> {
        // Input validation — enforce constraints regardless of caller.
        if (!title || title.length > 200) {
            this.debugLogger.error('[Entity Fetcher] Invalid project title (empty or >200 chars)');
            return undefined;
        }
        if (description.length > 500) {
            this.debugLogger.error('[Entity Fetcher] Invalid project description (>500 chars)');
            return undefined;
        }

        try {
            await this.ensureSDKReady();

            const orgId = this.cacheManager.getCachedOrganization()?.id;
            if (!orgId) {
                this.debugLogger.debug('[Entity Fetcher] Cannot create project: missing org ID');
                return undefined;
            }

            if (!this.sdkClient.isInitialized()) {
                this.debugLogger.debug('[Entity Fetcher] SDK not available for project creation');
                return undefined;
            }

            // `who_created` is deliberately NOT sent. Adobe stamps it with the calling
            // token's IMS user id and discards whatever we pass — which is what makes
            // `verifyProjectOwnership` work at all: it compares the field to the current
            // user id, so a literal like 'Demo Builder' would make every project we
            // create undeletable. Sending it only implies we control a delete gate we
            // do not. (`who_created` is optional in aio-lib-console's ProjectDetails.)
            const client = this.sdkClient.getClient() as {
                createFireflyProject: (
                    orgId: string,
                    details: {
                        name: string;
                        title: string;
                        description: string;
                    }
                ) => Promise<SDKResponse<RawAdobeProject>>;
            };

            // Adobe validates the machine `name` as alphanumeric-only; derive it from the
            // free-form title (the user's input). The title stays human-readable in the UI.
            const name = deriveAdobeEntityName(title);
            this.debugLogger.info(
                `[Entity Fetcher] Creating App Builder project "${title}" (name: ${name}) in org ${orgId}`,
            );

            const response = await client.createFireflyProject(orgId, {
                name,
                title,
                description,
            });

            // The create endpoint returns only the new id ({ projectId }), NOT a full
            // project — so construct the AdobeProject from that id + the details we sent.
            const raw = response?.body as { id?: string; projectId?: string } | undefined;
            const projectId = raw?.id ?? raw?.projectId;
            if (!projectId) {
                this.debugLogger.error(
                    '[Entity Fetcher] Project created but no projectId in response',
                );
                return undefined;
            }

            this.debugLogger.info('[Entity Fetcher] App Builder project created successfully');

            // createFireflyProject provisions ONLY the default Production workspace. The
            // Console's "Project from template → App Builder" flow also creates Stage, and
            // there is NO public API to provision both in one call (aio-lib-console exposes
            // createWorkspace only as a separate operation). Mirror the template so our
            // projects match. Best-effort: a Stage failure leaves the valid Production-only
            // project rather than failing the whole create.
            await this.createDefaultStageWorkspace(orgId, projectId);

            // Every workspace must ship a Runtime namespace so App Builder apps can
            // deploy to it (the added Stage workspace doesn't get one automatically).
            await this.ensureProjectWorkspacesHaveRuntime(orgId, projectId);

            return {
                id: projectId,
                name,
                title,
                description: description || undefined,
                org_id: orgId,
            };
        } catch (error) {
            const message = (error as Error).message || '';
            if (message.includes('409') || message.includes('Conflict')) {
                this.debugLogger.error('[Entity Fetcher] Project name already exists (409)');
            } else {
                this.debugLogger.error('[Entity Fetcher] Failed to create project', error as Error);
            }
            return undefined;
        }
    }

    /**
     * Create the "Stage" workspace to mirror the App Builder template.
     *
     * createFireflyProject provisions only the default Production workspace; the Console's
     * templated App Builder create additionally makes Stage. There is no public API to
     * provision both at once, so we add Stage explicitly. Named exactly "Stage" (NOT the
     * suffix-derived name) to match the convention the workspace picker auto-selects on and
     * downstream tooling expects. Best-effort — never throws; a failure just leaves the
     * project with Production only.
     */
    private async createDefaultStageWorkspace(orgId: string, projectId: string): Promise<void> {
        try {
            const client = this.sdkClient.getClient() as {
                createWorkspace: (
                    orgId: string,
                    projectId: string,
                    details: {
                        name: string;
                        title: string;
                        description: string;
                    }
                ) => Promise<SDKResponse<RawAdobeWorkspace>>;
            };
            await client.createWorkspace(orgId, projectId, {
                name: 'Stage',
                title: 'Stage',
                description: '',
            });
            this.debugLogger.info(
                '[Entity Fetcher] Created Stage workspace (App Builder template parity)',
            );
        } catch (error) {
            this.debugLogger.warn(
                '[Entity Fetcher] Could not create the Stage workspace; project has Production only: ' +
                    `${(error as Error).message}`,
            );
        }
    }

    /**
     * Ensure EVERY workspace in a freshly-created project has an Adobe I/O Runtime
     * namespace.
     *
     * The App Builder (jaeger) template provisions Runtime for the default
     * Production workspace, but a workspace added via `createWorkspace` (our Stage —
     * the one the picker auto-selects and deploys to) does NOT get one — so an App
     * Builder app deployed there fails with "no Runtime namespace" (a mesh doesn't,
     * masking it). Provision it explicitly. Best-effort: a failure logs and leaves
     * the deploy-time pre-flight as the safety net.
     *
     * @param orgId - Organization AMS id.
     * @param projectId - The just-created project's id.
     */
    private async ensureProjectWorkspacesHaveRuntime(
        orgId: string,
        projectId: string,
    ): Promise<void> {
        try {
            const workspaces = await this.fetchWorkspaces(orgId, projectId);
            for (const workspace of workspaces) {
                if (workspace.id) {
                    await this.ensureWorkspaceRuntimeNamespace(orgId, projectId, workspace.id);
                }
            }
        } catch (error) {
            // Best-effort: a listing failure must not fail the project create (the
            // deploy-time pre-flight still catches a missing namespace).
            this.debugLogger.warn(
                `[Entity Fetcher] Could not ensure Runtime namespaces for project ${projectId}: ` +
                    `${(error as Error).message}`,
            );
        }
    }

    /**
     * Provision an Adobe I/O Runtime namespace on one workspace, idempotently.
     *
     * `createRuntimeNamespace` POSTs the workspace's namespace endpoint. A workspace
     * that already has one (the template Production workspace, or a re-run) returns a
     * 409 — treated as success, not an error. Any other failure is logged, never
     * thrown (best-effort; the deploy-time pre-flight is the net).
     *
     * @param orgId - Organization AMS id.
     * @param projectId - Project id.
     * @param workspaceId - Workspace id to provision Runtime on.
     */
    async ensureWorkspaceRuntimeNamespace(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<void> {
        try {
            const client = this.sdkClient.getClient() as {
                createRuntimeNamespace: (
                    orgId: string,
                    projectId: string,
                    workspaceId: string
                ) => Promise<SDKResponse<unknown>>;
            };
            await client.createRuntimeNamespace(orgId, projectId, workspaceId);
            this.debugLogger.info(
                `[Entity Fetcher] Ensured Adobe I/O Runtime namespace for workspace ${workspaceId}`,
            );
        } catch (error) {
            const message = (error as Error).message || '';
            // Already provisioned (template Production ws, or a re-run) → not an error.
            if (/409|conflict|already\s*exist/i.test(message)) {
                this.debugLogger.debug(
                    `[Entity Fetcher] Runtime namespace already present for workspace ${workspaceId}`,
                );
                return;
            }
            this.debugLogger.warn(
                `[Entity Fetcher] Could not ensure Runtime namespace for workspace ${workspaceId}: ${message}`,
            );
        }
    }

    /**
     * Create a new workspace in the current organization's selected project.
     *
     * Uses the Console SDK's `createWorkspace`. Needs the cached org id AND
     * project id. SDK-only (no CLI fallback). Never throws — returns the mapped
     * workspace, or `undefined` on validation failure, missing org/project,
     * unavailable SDK, or any SDK error (403 permission / 409 name-taken /
     * quota), which the handler surfaces to the user.
     */
    async createWorkspace(title: string, description: string): Promise<AdobeWorkspace | undefined> {
        // Input validation — enforce constraints regardless of caller.
        if (!title || title.length > 200) {
            this.debugLogger.error(
                '[Entity Fetcher] Invalid workspace title (empty or >200 chars)',
            );
            return undefined;
        }
        if (description.length > 500) {
            this.debugLogger.error('[Entity Fetcher] Invalid workspace description (>500 chars)');
            return undefined;
        }

        try {
            await this.ensureSDKReady();

            const orgId = this.cacheManager.getCachedOrganization()?.id;
            const projectId = this.cacheManager.getCachedProject()?.id;
            if (!orgId || !projectId) {
                this.debugLogger.debug(
                    '[Entity Fetcher] Cannot create workspace: missing org or project ID',
                );
                return undefined;
            }

            if (!this.sdkClient.isInitialized()) {
                this.debugLogger.debug('[Entity Fetcher] SDK not available for workspace creation');
                return undefined;
            }

            const client = this.sdkClient.getClient() as {
                createWorkspace: (
                    orgId: string,
                    projectId: string,
                    details: {
                        name: string;
                        title: string;
                        description: string;
                    }
                ) => Promise<SDKResponse<RawAdobeWorkspace>>;
            };

            // Adobe validates the machine `name` as alphanumeric-only; derive it from the
            // free-form title (the user's input). The title stays human-readable in the UI.
            const name = deriveAdobeEntityName(title);
            this.debugLogger.info(
                `[Entity Fetcher] Creating workspace "${title}" (name: ${name}) in project ${projectId}`,
            );

            const response = await client.createWorkspace(orgId, projectId, {
                name,
                title,
                description,
            });

            // The create endpoint returns only the new id ({ workspaceId }), NOT a full
            // workspace — so construct the workspace from that id + the details we sent.
            const raw = response?.body as { id?: string; workspaceId?: string } | undefined;
            const workspaceId = raw?.id ?? raw?.workspaceId;
            if (!workspaceId) {
                this.debugLogger.error(
                    '[Entity Fetcher] Workspace created but no workspaceId in response',
                );
                return undefined;
            }

            this.debugLogger.info('[Entity Fetcher] Workspace created successfully');

            // A user-added workspace also needs a Runtime namespace for App Builder
            // app deploys — createWorkspace alone doesn't provision one.
            await this.ensureWorkspaceRuntimeNamespace(orgId, projectId, workspaceId);

            return { id: workspaceId, name, title };
        } catch (error) {
            const message = (error as Error).message || '';
            if (message.includes('409') || message.includes('Conflict')) {
                this.debugLogger.error('[Entity Fetcher] Workspace name already exists (409)');
            } else {
                this.debugLogger.error(
                    '[Entity Fetcher] Failed to create workspace',
                    error as Error,
                );
            }
            return undefined;
        }
    }

    /**
     * List the org's entitled services (the `getServicesForOrg` SDK call).
     * Resolves an App Builder component's `requiredApis` names → sdkCodes + platformList.
     * Each entry carries `{ code, platformList, domainMandatory?, ... }`.
     */
    async getServicesForOrg(orgId: string): Promise<OrgServiceInfo[]> {
        // Session-TTL cache: the org's service catalog is identical for every
        // workspace in the org and changes rarely, so avoid refetching it on every
        // workspace commit. Return the cached list while it is still fresh.
        const cached = this.servicesCache.get(orgId);
        if (cached && Date.now() < cached.expiresAt) {
            return cached.services;
        }

        // Single-flight PER ORG. The Add Integration modal PREFETCHES this on open
        // and the API picker fetches it again when the user reaches that stage —
        // a concurrent pair by construction, so without this both pulled the org's
        // full ~90-row catalog. Third instance of the stampede (org list, token
        // inspection, this).
        let flight = this.servicesFlights.get(orgId);
        if (!flight) {
            flight = new SingleFlight<OrgServiceInfo[]>();
            this.servicesFlights.set(orgId, flight);
        }
        return flight.run(() => this.fetchServicesForOrg(orgId));
    }

    /** The uncached catalog fetch behind {@link getServicesForOrg}'s single-flight. */
    private async fetchServicesForOrg(orgId: string): Promise<OrgServiceInfo[]> {
        const startTime = Date.now();
        await this.ensureSDKReady();
        const client = this.sdkClient.getClient() as {
            getServicesForOrg: (orgId: string) => Promise<SDKResponse<OrgServiceInfo[]>>;
        };

        // Bounded like every other SDK read (trySDKFetch's contract, which this
        // method predates): an unbounded call left the API picker spinning with no
        // log line and no ceiling when the endpoint stalled.
        const outcome = await tryWithTimeout(client.getServicesForOrg(orgId), {
            timeoutMs: TIMEOUTS.ORG_SERVICES_FETCH,
            timeoutMessage: 'SDK org services fetch',
        });

        if (outcome.timedOut || outcome.error || !outcome.result) {
            const elapsed = formatDuration(Date.now() - startTime);
            const reason = outcome.timedOut ? `timed out after ${elapsed}` : 'failed';
            this.debugLogger.warn(`[Entity Fetcher] Org services fetch ${reason}`);
            // THROW rather than return [] — an empty list is indistinguishable from
            // "this org entitles nothing", so the picker rendered a failed fetch as
            // `No APIs match ""`. Its caller turns a throw into a typed error and the
            // picker already has the matching "Couldn't load Adobe APIs" + Retry view.
            throw outcome.error instanceof Error
                ? outcome.error
                : new Error(`Adobe org services request ${reason}`);
        }

        const services = outcome.result.body ?? [];
        this.debugLogger.debug(
            `[Entity Fetcher] Retrieved ${services.length} org services via SDK in ` +
                `${formatDuration(Date.now() - startTime)}`,
        );

        // Cache only a successful, non-empty fetch — never a degraded empty result,
        // so a transient 500 → [] cannot poison the cache for the whole session.
        if (services.length > 0) {
            this.servicesCache.set(orgId, {
                services,
                expiresAt: Date.now() + CACHE_TTL.ORG_SERVICES,
            });
        }
        return services;
    }

    /**
     * The sdk codes a credential is CURRENTLY subscribed to (`getIntegration.sdkList`).
     * Lets the subscribe paths skip the slow subscribe PUT when the required APIs are
     * already present. Never throws — returns `[]` on any error so callers fall through
     * to subscribing (fail-safe).
     *
     * @param orgId - Adobe org id
     * @param idIntegration - the credential's integration id
     * @returns the subscribed sdk codes, or `[]` when unknown
     */
    async getSubscribedServiceCodes(orgId: string, idIntegration: string): Promise<string[]> {
        try {
            await this.ensureSDKReady();
            const client = this.sdkClient.getClient() as {
                getIntegration: (
                    orgId: string,
                    idIntegration: string
                ) => Promise<SDKResponse<{ sdkList?: string[] }>>;
            };
            const response = await client.getIntegration(orgId, idIntegration);
            return response?.body?.sdkList ?? [];
        } catch (error) {
            this.debugLogger.debug('[Entity Fetcher] getSubscribedServiceCodes failed', error);
            return [];
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
                orgId: string,
                idIntegration: string,
                serviceInfo: ServiceSubscriptionInfo[]
            ) => Promise<SDKResponse<unknown>>;
        };
        const response = await client.subscribeAdobeIdIntegrationToServices(
            orgId,
            idIntegration,
            serviceInfo,
        );
        assertSubscribeAccepted(response);
    }

    /**
     * Subscribe OAuth-S2S services onto an S2S credential. `idIntegration` is the
     * credential's `id_integration`. serviceInfo: `[{ sdkCode, licenseConfigs,
     * roles }]`.
     *
     * **Throws when the subscribe is refused** — see {@link assertSubscribeAccepted}.
     * A refusal is an HTTP 200, so this is the only thing standing between a
     * refused subscription and a caller believing it worked.
     */
    async subscribeOAuthServerToServerIntegrationToServices(
        orgId: string,
        idIntegration: string,
        serviceInfo: ServiceSubscriptionInfo[],
    ): Promise<void> {
        await this.ensureSDKReady();
        const client = this.sdkClient.getClient() as {
            subscribeOAuthServerToServerIntegrationToServices: (
                orgId: string,
                idIntegration: string,
                serviceInfo: ServiceSubscriptionInfo[]
            ) => Promise<SDKResponse<unknown>>;
        };
        const response = await client.subscribeOAuthServerToServerIntegrationToServices(
            orgId,
            idIntegration,
            serviceInfo,
        );
        assertSubscribeAccepted(response);
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
            OAUTH_CREDENTIAL_NAME,
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

    /**
     * Delete an Adobe Console project. SDK errors propagate UNCHANGED — the
     * teardown caller maps them (notably the 409 ERR_MSG_PROJECT_DELETE_FORBIDDEN
     * thrown while event providers are still attached to the project).
     */
    async deleteConsoleProject(orgId: string, projectId: string): Promise<void> {
        await this.ensureSDKReady();

        if (!orgId || !projectId) {
            throw new Error('deleteConsoleProject: orgId and projectId are required');
        }
        if (!this.sdkClient.isInitialized()) {
            throw new Error('deleteConsoleProject: Adobe Console SDK is not initialized');
        }

        const client = this.sdkClient.getClient() as {
            deleteProject: (orgId: string, projectId: string) => Promise<unknown>;
        };
        await client.deleteProject(orgId, projectId);
    }
}
