/**
 * AdobeOrgServices — the org's service catalog and credential subscriptions.
 *
 * Owns the entitled-services catalog (session-cached, single-flight per org),
 * the "what is this credential already subscribed to" read, and the two
 * subscribe calls — including {@link assertSubscribeAccepted}, the check that
 * catches Adobe refusing a subscription INSIDE an HTTP 200. SDK-only.
 *
 * Extracted from `adobeEntityFetcher.ts` (god-file decomposition, 2026-08-23).
 *
 * @module features/authentication/services/adobeOrgServices
 */

import type { AdobeSDKClient } from './adobeSDKClient';
import type { OrgServiceInfo, SDKResponse, ServiceSubscriptionInfo } from './types';
import { getLogger } from '@/core/logging';
import { SingleFlight } from '@/core/utils/singleFlight';
import { formatDuration } from '@/core/utils/timeFormatting';
import { CACHE_TTL, TIMEOUTS } from '@/core/utils/timeoutConfig';
import { tryWithTimeout } from '@/core/utils/promiseUtils';
import { sleep } from '@/core/utils/sleep';

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
 * Reads the org service catalog and subscribes credentials to services.
 */
export class AdobeOrgServices {
    private debugLogger = getLogger();
    /**
     * Per-org cache of the entitled-services catalog (see getServicesForOrg).
     * Per-instance: the owning fetcher is a session singleton (created once via
     * ServiceLocator/AuthenticationService), so this lives for the session.
     */
    private servicesCache = new Map<string, { services: OrgServiceInfo[]; expiresAt: number }>();
    /** In-flight catalog fetch per org — see getServicesForOrg. */
    private readonly servicesFlights = new Map<string, SingleFlight<OrgServiceInfo[]>>();

    constructor(private sdkClient: AdobeSDKClient) {}

    /**
     * Ensure SDK is initialized (lazy init pattern)
     */
    private async ensureSDKReady(): Promise<void> {
        if (!this.sdkClient.isInitialized()) {
            await this.sdkClient.ensureInitialized();
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
        let outcome = await tryWithTimeout(client.getServicesForOrg(orgId), {
            timeoutMs: TIMEOUTS.ORG_SERVICES_FETCH,
            timeoutMessage: 'SDK org services fetch',
        });

        // ONE retry, and only for a FAST failure (owner-approved hardening,
        // 2026-08-28). The endpoint intermittently answers sub-second 500s whose
        // own template says retry-on-internal-error, and a retry was measured to
        // succeed — three add attempts died on single 500s that day. A TIMEOUT is
        // never retried: it already spent the full 60s budget, and doubling that
        // wait is worse than the picker's fast-fail + Retry affordance.
        const failedFast = !outcome.timedOut && (outcome.error || !outcome.result);
        if (failedFast) {
            this.debugLogger.warn(
                '[Entity Fetcher] Org services fetch failed fast — retrying once',
            );
            await sleep(TIMEOUTS.ORG_SERVICES_RETRY_DELAY);
            outcome = await tryWithTimeout(client.getServicesForOrg(orgId), {
                timeoutMs: TIMEOUTS.ORG_SERVICES_FETCH,
                timeoutMessage: 'SDK org services fetch (retry)',
            });
        }

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
}
