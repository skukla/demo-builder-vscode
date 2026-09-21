/**
 * AdobeOrgServices — the org's service catalog and credential subscriptions.
 *
 * Owns the entitled-services catalog (cached, saved across reloads, single-flight per org),
 * the "what is this credential already subscribed to" read, and the two
 * subscribe calls — including {@link assertSubscribeAccepted}, the check that
 * catches Adobe refusing a subscription INSIDE an HTTP 200. SDK-only.
 *
 * Extracted from `adobeEntityFetcher.ts` (god-file decomposition, 2026-08-23).
 *
 * @module features/authentication/services/adobeOrgServices
 */

import type { AdobeSDKClient } from './adobeSDKClient';
import { readSavedCatalog, saveCatalog, type OrgServicesStore } from './orgServicesSavedCatalog';
import type {
    OrgServiceInfo,
    SDKResponse,
    ServiceLicenseConfig,
    ServiceSubscriptionInfo,
    SubscribedService,
} from './types';
import { classifyTransience } from '@/core/errors';
import { getLogger } from '@/core/logging/debugLogger';
import { tryWithTimeout , firstSuccess } from '@/core/utils/promiseUtils';
import { SingleFlight } from '@/core/utils/singleFlight';
import { sleep } from '@/core/utils/sleep';
import { formatDuration } from '@/core/utils/timeFormatting';
import { CACHE_TTL, TIMEOUTS } from '@/core/utils/timeoutConfig';

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
/** Whether an SDK error is Adobe's 404 — the SDK carries the status only in its message. */
function isNotFound(error: unknown): boolean {
    return / 404 - Not Found/.test(error instanceof Error ? error.message : String(error));
}

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

    /**
     * @param store - keeps the API list across window reloads. Without one the
     *   list lives for the session only, and every reload waits on Adobe again.
     */
    constructor(
        private sdkClient: AdobeSDKClient,
        private readonly store?: OrgServicesStore,
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
     * List the org's entitled services (the `getServicesForOrg` SDK call).
     * Resolves an App Builder component's `requiredApis` names → sdkCodes + platformList.
     * Each entry carries `{ code, platformList, domainMandatory?, ... }`.
     */
    async getServicesForOrg(orgId: string, sdkCodes?: readonly string[]): Promise<OrgServiceInfo[]> {
        // Once loaded, ALWAYS answered from memory (Developer Console's pattern): the list is
        // the same for every workspace and barely changes, and a cold fetch takes about a minute.
        // An old copy starts one background refresh; only the session's first ask waits. On
        // 2026-09-21 a 30-minute expiry made Manage APIs a 60s timeout 40 minutes in. The copy
        // is also SAVED, so a reload keeps it: that day the first open after one hit 60s twice.
        const cached = this.servicesCache.get(orgId) ?? this.restoreSaved(orgId);
        const flight = this.servicesFlights.get(orgId) ?? new SingleFlight<OrgServiceInfo[]>();
        this.servicesFlights.set(orgId, flight);
        if (cached) {
            if (Date.now() >= cached.expiresAt) {
                flight.run(() => this.fetchServicesForOrg(orgId)).catch(() => {
                    this.debugLogger.debug('[Entity Fetcher] Background org services refresh failed');
                });
            }
            return sdkCodes ? cached.services.filter((s) => sdkCodes.includes(s.code)) : cached.services;
        }
        // Only the named codes: warm, three took 1.3s where the full catalog hit Adobe's 60s
        // limit. Never cached as the full list (the picker would show 4 APIs). A full load
        // already running races it rather than queuing it: cold, three codes took 54s too.
        if (sdkCodes) {
            const narrowed = this.fetchServicesForOrg(orgId, sdkCodes);
            if (!flight.isInFlight) return narrowed;
            const running = flight.run(() => this.fetchServicesForOrg(orgId));
            return firstSuccess(narrowed, running.then((all) => all.filter((s) => sdkCodes.includes(s.code))));
        }
        // Single-flight PER ORG: the picker and the dashboard's warm-up ask at once.
        return flight.run(() => this.fetchServicesForOrg(orgId));
    }

    /** Load the org's saved list into memory, keeping its age. */
    private restoreSaved(orgId: string): { services: OrgServiceInfo[]; expiresAt: number } | undefined {
        const saved = readSavedCatalog(this.store, orgId);
        if (!saved) {
            return undefined;
        }
        const entry = { services: saved.services, expiresAt: saved.fetchedAt + CACHE_TTL.ORG_SERVICES };
        this.servicesCache.set(orgId, entry);
        return entry;
    }

    /**
     * Run a Developer Console call, retrying ONCE when it fails transiently.
     *
     * Console answers 504 Gateway Timeout when its own licence service times out —
     * nothing the SC did, and nothing they can fix. On 2026-09-20 one of those
     * aborted an add three minutes in and sent the SC away to "try again in a few
     * minutes", which is exactly what a retry does without asking them.
     *
     * The classifier decides what counts (`classifyTransience`): a timeout or a
     * network failure retries, an auth failure never does, because repeating the
     * same call with the same credentials does the same thing.
     *
     * ONE retry, like the org-services fetch above. A second adds delay to a case
     * that is already unlucky, and the surfaces this serves all carry a Retry.
     *
     * Safe for the subscribe PUT as well as the reads: that call REPLACES the
     * credential's whole service list with what it was given, so sending the same
     * list again converges on the same state whether or not the first one landed —
     * which is the thing a 504 leaves unknown.
     *
     * @param label - what to call it in the logs
     * @param run - the call, re-invoked on a transient failure
     * @returns whatever the call answers
     */
    private async withOneTransientRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
        try {
            return await run();
        } catch (error) {
            if (!classifyTransience(error).retryable) throw error;
            this.debugLogger.warn(
                `[Entity Fetcher] ${label} failed transiently — retrying once`,
            );
            await sleep(TIMEOUTS.ORG_SERVICES_RETRY_DELAY);
            return run();
        }
    }

    /** The uncached catalog fetch behind {@link getServicesForOrg}'s single-flight. */
    private async fetchServicesForOrg(
        orgId: string,
        sdkCodes?: readonly string[],
    ): Promise<OrgServiceInfo[]> {
        const startTime = Date.now();
        await this.ensureSDKReady();
        type ListServices = (orgId: string, codes?: string) => Promise<SDKResponse<OrgServiceInfo[]>>;
        const client = this.sdkClient.getClient() as { getServicesForOrg: ListServices };
        const codes = sdkCodes?.join(',');

        // Bounded like every other SDK read (trySDKFetch's contract, which this
        // method predates): an unbounded call left the API picker spinning with no
        // log line and no ceiling when the endpoint stalled.
        let outcome = await tryWithTimeout(client.getServicesForOrg(orgId, codes), {
            timeoutMs: TIMEOUTS.ORG_SERVICES_FETCH,
            timeoutMessage: 'SDK org services fetch',
        });

        // ONE retry, and only for a FAST failure (owner-approved hardening,
        // 2026-08-28). The endpoint intermittently answers sub-second 500s whose
        // own template says retry-on-internal-error, and a retry was measured to
        // succeed — three add attempts died on single 500s that day. A TIMEOUT is
        // never retried here: it already spent the whole budget, and a person waits
        // on the picker. warmOrgServicesCatalog retries once — nobody waits on it.
        const failedFast = !outcome.timedOut && (outcome.error || !outcome.result);
        if (failedFast) {
            this.debugLogger.warn(
                '[Entity Fetcher] Org services fetch failed fast — retrying once',
            );
            await sleep(TIMEOUTS.ORG_SERVICES_RETRY_DELAY);
            outcome = await tryWithTimeout(client.getServicesForOrg(orgId, codes), {
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

        // Cache only a successful, non-empty, FULL fetch: a transient 500 → [] must not
        // poison the session, and a narrowed answer is a subset by construction.
        if (services.length > 0 && !sdkCodes) {
            this.servicesCache.set(orgId, {
                services,
                expiresAt: Date.now() + CACHE_TTL.ORG_SERVICES,
            });
            saveCatalog(this.store, orgId, services);
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
            const response = await this.withOneTransientRetry('getSubscribedServiceCodes', () =>
                client.getIntegration(orgId, idIntegration),
            );
            return response?.body?.sdkList ?? [];
        } catch (error) {
            this.debugLogger.debug('[Entity Fetcher] getSubscribedServiceCodes failed', error);
            return [];
        }
    }

    /**
     * Every service a credential is subscribed to, WITH the product profiles each
     * holds — what a subscribe must carry forward, because Adobe's subscribe call
     * REPLACES a credential's whole list (a deploy that sent only what it needed
     * removed ACCS-REST-API and its profile from Kukla Bodea / Stage, 2026-09-19).
     *
     * `sdkList` from `getIntegration`, then `getSDKProperties` per service for its
     * `licenseConfigs`. Never throws: ANY failed read answers `undefined` — unknown —
     * because a subscribe built from a partial list is the removal this prevents.
     *
     * @param orgId - Adobe org id
     * @param idIntegration - the credential's integration id
     * @returns the subscribed services with their profiles, or `undefined` when unknown
     */
    async getSubscribedServices(
        orgId: string,
        idIntegration: string,
    ): Promise<SubscribedService[] | undefined> {
        try {
            await this.ensureSDKReady();
            const client = this.sdkClient.getClient() as {
                getIntegration: (
                    orgId: string,
                    idIntegration: string,
                ) => Promise<SDKResponse<{ sdkList?: string[] }>>;
                getSDKProperties: (
                    orgId: string,
                    idIntegration: string,
                    sdkCode: string,
                ) => Promise<SDKResponse<{ licenseConfigs?: ServiceLicenseConfig[] | null }>>;
            };
            const codes =
                (
                    await this.withOneTransientRetry('getSubscribedServices', () =>
                        client.getIntegration(orgId, idIntegration),
                    )
                )?.body?.sdkList ?? [];
            return await Promise.all(
                codes.map(async (sdkCode) => {
                    // An API-key credential has no profile properties at all: Adobe
                    // answers 404 for them (the API Mesh credential, measured live
                    // 2026-09-19). That is "no profiles", not "unknown" — every other
                    // failure still makes the whole answer unknown.
                    const props = await this.withOneTransientRetry(
                        `getSDKProperties(${sdkCode})`,
                        () => client.getSDKProperties(orgId, idIntegration, sdkCode),
                    ).catch((error: unknown) => {
                        if (isNotFound(error)) return undefined;
                        throw error;
                    });
                    return { sdkCode, licenseConfigs: props?.body?.licenseConfigs ?? [] };
                }),
            );
        } catch (error) {
            this.debugLogger.debug('[Entity Fetcher] getSubscribedServices failed', error);
            return undefined;
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
        // Retried once on a transient failure, and safe to: the call REPLACES the
        // credential's whole list, so re-sending the same list converges whether or
        // not the first attempt landed — which is what a 504 leaves unknown.
        const response = await this.withOneTransientRetry('subscribeAdobeIdIntegrationToServices', () =>
            client.subscribeAdobeIdIntegrationToServices(orgId, idIntegration, serviceInfo),
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
        // Retried once on a transient failure, and safe to: the call REPLACES the
        // credential's whole list, so re-sending the same list converges whether or
        // not the first attempt landed — which is what a 504 leaves unknown.
        const response = await this.withOneTransientRetry('subscribeOAuthServerToServerIntegrationToServices', () =>
            client.subscribeOAuthServerToServerIntegrationToServices(orgId, idIntegration, serviceInfo),
        );
        assertSubscribeAccepted(response);
    }
}
