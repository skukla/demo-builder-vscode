/**
 * AdobeEntityReads — org / project / workspace listings, SDK-first.
 *
 * The read half of the entity fetcher: every listing goes SDK-first (bounded
 * by a deadline — a stalled Adobe endpoint must not make the "fast path"
 * slower than the CLI) and falls back to the injected {@link AdobeCliFallback}
 * when the SDK cannot answer. The `*SdkOnly` variants never touch the CLI:
 * they exist for non-interactive on-open probes, where `aio console` can stall
 * ~14.5s or trigger interactive browser auth.
 *
 * Extracted from `adobeEntityFetcher.ts` (god-file decomposition, 2026-08-23).
 * The facade delegates its read methods here unchanged.
 *
 * @module features/authentication/services/adobeEntityReads
 */

import type { AdobeCliFallback } from './adobeCliFallback';
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
import { withOrgContext } from '@/core/shell';
import { formatDuration, SingleFlight, TIMEOUTS } from '@/core/utils';
import { tryWithTimeout } from '@/core/utils/promiseUtils';
import type { Logger } from '@/types/logger';

/** The slice of the fetcher config the reads consult. */
export interface EntityReadsConfig {
    /**
     * Optional callback when no organizations are accessible.
     * Used by the facade to clear stale console context.
     */
    onNoOrgsAccessible?: () => Promise<void>;
}

/**
 * Fetches Adobe entity listings with SDK-first strategy and CLI fallback.
 */
export class AdobeEntityReads {
    private debugLogger = getLogger();
    /**
     * Shared in-flight org-list fetch. Distinct from the org-list CACHE, which can
     * only help callers arriving after a fetch has completed.
     */
    private readonly orgListFlight = new SingleFlight<AdobeOrg[] | undefined>();

    constructor(
        private sdkClient: AdobeSDKClient,
        private cacheManager: AuthCacheManager,
        private logger: Logger,
        private stepLogger: StepLogger,
        private cli: AdobeCliFallback,
        private config: EntityReadsConfig = {},
        /**
         * Where {@link resolveEffectiveOrgId} reads the token org from. Defaults
         * to this instance's own {@link getOrganizationsSdkOnly}; the facade wires
         * in ITS public method so the monolith's dynamic-dispatch contract holds —
         * overriding the facade's `getOrganizationsSdkOnly` (tests do) must still
         * steer the internal token-org fallback, exactly as it did when both
         * lived on one class.
         */
        private tokenOrgSource: () => Promise<AdobeOrg[] | undefined> = () =>
            this.getOrganizationsSdkOnly(),
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
            // The REASON rides in the warning, not in a trace line.
            //
            // `trace` is priority 4 and the default `demoBuilder.logLevel` is
            // `debug` (3), so it never emits on a default install. A user's log on
            // 2026-08-17 contained zero trace lines while showing "SDK initialized
            // successfully" followed 120ms later by "SDK unavailable" — every org
            // read for the whole session, with the cause written where nobody could
            // read it. That silence is what made the failure look like an auth
            // problem and cost three pointless sign-ins.
            const reason =
                outcome.error instanceof Error
                    ? `${outcome.error.name}: ${outcome.error.message}`
                    : String(outcome.error ?? 'no result returned');
            this.debugLogger.warn(
                `[Entity Fetcher] SDK unavailable, using slower CLI fallback for ${entityName} — ${reason}`,
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
                mappedOrgs = await this.cli.executeCLIFallback<RawAdobeOrg, AdobeOrg>(
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
        return (await this.tokenOrgSource())?.[0]?.id;
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
                mappedProjects = await this.cli.executeCLIFallback<RawAdobeProject, AdobeProject>(
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
     * applies org-context targeting. Public (not just the wrappers) because
     * `AdobeConsoleProjectOps.ensureProjectWorkspacesHaveRuntime` lists a
     * freshly-created project's workspaces with explicit ids — the facade wires
     * this method in as its `listWorkspaces` dependency.
     */
    async fetchWorkspaces(
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
                mappedWorkspaces = await this.cli.executeCLIFallback<
                    RawAdobeWorkspace,
                    AdobeWorkspace
                >('aio console workspace list --json', mapWorkspaces, 'workspaces', startTime);
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
}
