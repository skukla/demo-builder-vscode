/**
 * Which org-catalog row a required API resolves to, which credential it goes on,
 * and what its subscription entry says. Split from `apiSubscriber.ts` (the
 * service size limit), which re-exports what callers already import from it.
 *
 * @module features/app-builder/services/apiServiceResolution
 */

import { BASELINE_API } from '@/core/constants';
import { PROFILE_MISSING_REASON } from '@/features/authentication/services/apiAccessCatalog';
import type { OrgServiceInfo, ServiceLicenseConfig } from '@/features/authentication/services/types';

/** A resolved service: its sdkCode plus the platform metadata that picks the path. */
export interface ServiceInfo {
    sdkCode: string;
    /** Human-readable service name from the org service list (e.g. "API Mesh"). */
    name?: string;
    platformList: string[];
    domainMandatory: boolean;
    /** The product profiles the org offers for it; one must be named when there are any. */
    licenseConfigs?: ServiceLicenseConfig[];
    /**
     * Adobe says this user has no product profile for the service — the row is
     * disabled with `USER_MISSING_PRODUCT_PROFILES`. The authoritative "you do not
     * have access" signal (26 services in the org carried it on 2026-09-21), and
     * worth distinguishing from profiles merely missing from a response, because
     * the SC's next step is different: ask an admin, versus try again.
     */
    profileAccessMissing?: boolean;
}

/**
 * Services whose org-catalog row declares NO platformList but are KNOWN to
 * subscribe onto OAuth S2S credentials. The live catalog declares platforms
 * for only 25 of 98 services (measured 2026-08-27), and `partitionByPlatform`
 * rightly refuses to guess for the rest — but that silence cost the BASELINE
 * its subscription on every S2S credential the spine ever created: the union
 * PUT skipped it, the credential kept `sdkList: []`, and an App Management
 * app's event calls answered "403 — Api Key is invalid" one feature away.
 * The evidence for the override is in this repo: `consoleProjectTeardown`'s
 * subscribe-on-403 PUTs exactly this service onto S2S credentials and works.
 */
const KNOWN_S2S_SERVICES: ReadonlySet<string> = new Set([
    BASELINE_API,
    // I/O Events + Adobe I/O Events for Adobe Commerce — the kit's eventing
    // step calls api.adobe.io/events, and without these subscriptions it
    // answers 403 with a valid key (measured live 2026-08-27). Both rows carry
    // platformList null in the org catalog; Console's own UI adds both to
    // OAuth S2S credentials.
    'CloudIntegrationSDK',
    'commerceeventing',
    // App Builder Data Services — the database's token needs the adobeio.abdata
    // scopes this subscription grants. The ERP spike subscribed it onto the S2S
    // credential and the database answered (2026-09-14).
    'AppBuilderDataServicesSDK',
]);

/** Whether a catalog row subscribes onto an OAuth server-to-server credential. */
function isS2SRow(service: OrgServiceInfo): boolean {
    return (
        service.oauthServerToServerOnly === true ||
        (service.platformList ?? []).includes('oauth_server_to_server')
    );
}

/**
 * The org catalog lists some codes more than once — one row per KIND of access,
 * and Adobe labels which is which in `type`. A server-to-server subscription wants
 * the `entp` row, because that is where the product profiles live.
 *
 * This used to break the tie on "the row that has `properties`", on the strength
 * of a 2026-09-16 measurement that only the server-to-server row carried it. That
 * stopped being true: on 2026-09-21 the catalog answered in three different shapes
 * within twenty minutes — neither ACCS row with `properties`, both with it (the
 * first holding no profiles), and only the right one — so the rule picked the
 * row with NO profiles whenever the wrong one happened to come first. `type` did
 * not move across any of it: 8 of 8 calls, `adobeid` never carried profiles and
 * `entp` always did, and the same held for every one of the 17 codes listed twice.
 *
 * When no row is labelled — a response without `type`, which is what the 2026-09-16
 * fixture recorded — the next best is the server-to-server row that actually
 * CARRIES profiles. Not merely "has `properties`": that was the fragile half of the
 * old rule. And not "the first server-to-server row" either, which is what the
 * first draft of this fell back to: both ACCS rows are marked
 * `oauthServerToServerOnly`, so that took the sign-in row and the existing pin in
 * apiSubscriber.test.ts caught it.
 *
 * A code with neither falls through unchanged. That includes API Mesh
 * (`GraphQLServiceSDK`), which has a single `adobeid`/`apiKey` row and rides the
 * other credential path.
 */
function pickServiceRow(servicesForOrg: OrgServiceInfo[], code: string): OrgServiceInfo | undefined {
    const rows = servicesForOrg.filter((s) => s.code === code);
    return (
        rows.find((row) => row.type === 'entp') ??
        rows.find((row) => isS2SRow(row) && hasProfiles(row)) ??
        rows.find(isS2SRow) ??
        rows[0]
    );
}

/** Whether a catalog row lists at least one product profile. */
function hasProfiles(row: OrgServiceInfo): boolean {
    return (row.properties?.licenseConfigs?.length ?? 0) > 0;
}

/** Resolve API names → ServiceInfo via the org service list. Throws on unknown. */
export function resolveServiceInfos(
    requiredApis: string[],
    servicesForOrg: OrgServiceInfo[],
): ServiceInfo[] {
    return requiredApis.map((api) => {
        const service = pickServiceRow(servicesForOrg, api);
        if (!service) {
            throw new Error(`Unknown Adobe API "${api}" — not entitled for this org.`);
        }
        const declared = service.platformList ?? [];
        // `oauthServerToServerOnly` is Adobe's own signal, and the one `platformList`
        // misses: ACCS-REST-API declares web-app platforms and was silently left out
        // of every subscribe until 2026-09-16, so Commerce refused the credential.
        const s2s =
            service.oauthServerToServerOnly === true ||
            (declared.length === 0 && KNOWN_S2S_SERVICES.has(service.code));
        const platformList =
            s2s && !declared.includes('oauth_server_to_server')
                ? [...declared, 'oauth_server_to_server']
                : declared;
        return {
            sdkCode: service.code,
            name: service.name,
            platformList,
            domainMandatory: Boolean(service.domainMandatory),
            licenseConfigs: service.properties?.licenseConfigs ?? undefined,
            profileAccessMissing:
                service.enabled === false &&
                (service.disabledReasons ?? []).includes(PROFILE_MISSING_REASON),
        };
    });
}

/**
 * Split services into apiKey vs oauth_server_to_server by `platformList`.
 *
 * `unmatched` is the third outcome and the reason this returns it: a service
 * listing NEITHER platform reaches neither subscribe endpoint, so no PUT ever
 * covers it. That used to pass silently — the service still came back in
 * {@link subscribeRequiredApis}'s result and still counted toward a successful
 * "extras set to N". Naming the bucket lets the caller drop it from what it
 * CLAIMS to have subscribed, which is what makes the silence audible.
 */
export function partitionByPlatform(services: ServiceInfo[]): {
    apiKey: ServiceInfo[];
    oauthS2S: ServiceInfo[];
    unmatched: ServiceInfo[];
} {
    const apiKey = services.filter((s) => s.platformList.includes('apiKey'));
    const oauthS2S = services.filter((s) => s.platformList.includes('oauth_server_to_server'));
    const unmatched = services.filter(
        (s) =>
            !s.platformList.includes('apiKey') && !s.platformList.includes('oauth_server_to_server'),
    );
    return { apiKey, oauthS2S, unmatched };
}
