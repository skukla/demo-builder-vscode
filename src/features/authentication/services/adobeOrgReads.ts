/**
 * AdobeOrgReads — the organizations the token reaches, SDK-first.
 *
 * `getOrganizations` falls back to the CLI and owns the org-list cache and the
 * "no orgs left" reaction. `getOrganizationsSdkOnly` never touches the CLI: it is
 * for non-interactive on-open probes, where `aio console` can stall ~14.5s or
 * trigger interactive browser auth, and it is the TOKEN org source the project
 * and workspace reads fall back to.
 *
 * Split from `adobeEntityReads.ts` on 2026-10-08 (EDS-8).
 *
 * @module features/authentication/services/adobeOrgReads
 */

import type { AdobeCliFallback } from './adobeCliFallback';
import { mapOrganizations } from './adobeEntityMapper';
import { ensureSDKReady, type SdkEntityFetch } from './adobeEntityReads';
import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import { withTiming } from './performanceTracker';
import type { AdobeOrg, RawAdobeOrg, SDKResponse } from './types';
import { getLogger } from '@/core/logging/debugLogger';
import type { StepLogger } from '@/core/logging/stepLogger';
import { SingleFlight } from '@/core/utils/singleFlight';
import type { Logger } from '@/types/logger';

/** The slice of the entity-services config the org reads consult. */
export interface OrgReadsConfig {
    /**
     * Optional callback when no organizations are accessible.
     * Wired to the selector's `clearConsoleContext` to clear stale console context.
     */
    onNoOrgsAccessible?: () => Promise<void>;
}

/**
 * Lists the organizations the signed-in token reaches.
 */
export class AdobeOrgReads {
    private debugLogger = getLogger();
    /**
     * Shared in-flight org-list fetch. Distinct from the org-list CACHE, which can
     * only help callers arriving after a fetch has completed.
     */
    private readonly orgListFlight = new SingleFlight<AdobeOrg[] | undefined>();

    constructor(
        private sdkClient: AdobeSDKClient,
        private sdkFetch: SdkEntityFetch,
        private cacheManager: AuthCacheManager,
        private logger: Logger,
        private stepLogger: StepLogger,
        private cli: AdobeCliFallback,
        private config: OrgReadsConfig = {},
    ) {}

    /**
     * Get list of organizations (SDK with CLI fallback). Timed: a slow read is
     * reported on the debug channel (`performanceTracker`).
     */
    async getOrganizations(): Promise<AdobeOrg[]> {
        return withTiming('getOrganizations', () => this.readOrganizations());
    }

    private async readOrganizations(): Promise<AdobeOrg[]> {
        const startTime = Date.now();

        try {
            const cachedOrgs = this.cacheManager.getCachedOrgList();
            if (cachedOrgs) return cachedOrgs;

            this.stepLogger.logTemplate('adobe-auth', 'loading-organizations', {});
            await ensureSDKReady(this.sdkClient);

            const client = this.sdkClient.getClient() as {
                getOrganizations: () => Promise<SDKResponse<RawAdobeOrg[]>>;
            };
            let mappedOrgs =
                (await this.sdkFetch.trySDKFetch(
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
                this.logger.info('No organizations accessible. Clearing previous selections');
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

        await ensureSDKReady(this.sdkClient);
        if (!this.sdkClient.isInitialized()) return undefined;

        const client = this.sdkClient.getClient() as {
            getOrganizations: () => Promise<SDKResponse<RawAdobeOrg[]>>;
        };
        const mappedOrgs = await this.sdkFetch.trySDKFetch(
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
}
