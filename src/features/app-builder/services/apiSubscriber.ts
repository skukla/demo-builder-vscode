/**
 * API subscriber (Step 07) — two-path-by-`platformList`, union reconcile.
 *
 * Ensures a demo's deployables have their `requiredApis` subscribed on the one
 * shared App Builder project. Per the D1 spike (Q5 DEFINITIVE/CORRECTION):
 *
 * - `getServicesForOrg(orgId)` resolves API names → `{ sdkCode, platformList,
 *   domainMandatory }`.
 * - Branch by `platformList`: `apiKey`/AdobeID services (incl. API Mesh
 *   `GraphQLServiceSDK`) → `createAdobeIdCredential{platform:'apiKey',domain}` +
 *   `subscribeAdobeIdIntegrationToServices`; `oauth_server_to_server` services
 *   (e.g. `AdobeIOManagementAPISDK`) → `subscribeOAuthServerToServerIntegration
 *   ToServices`.
 * - Subscribe the UNION of all deployables' `requiredApis` + the baseline
 *   `AdobeIOManagementAPISDK`; idempotent reconcile (PUT the full union — correct
 *   whether the endpoint replaces or merges). Mesh is NOT skipped.
 *
 * The credential id used to subscribe is `id_integration` (NOT `.id`). Free
 * services subscribe with `{ licenseConfigs:null, roles:null }`.
 */

import type { OrgServiceInfo, ServiceSubscriptionInfo } from '@/features/authentication/services/types';
import type { DeployableCatalogEntry } from '@/types/deployables';

/** Baseline API always subscribed (free; needed for `aio app` operations). */
export const BASELINE_API = 'AdobeIOManagementAPISDK';
/** Default allowed-domain when a caller supplies none (matches setupInstructions). */
const DEFAULT_DOMAIN = 'localhost:3000';
/** apiKey credential metadata (a formality satisfying `domainMandatory`). */
const APIKEY_CREDENTIAL_NAME = 'demo-builder-api-mesh';
const APIKEY_CREDENTIAL_DESCRIPTION = 'API Mesh access (Demo Builder)';

/** A resolved service: its sdkCode plus the platform metadata that picks the path. */
export interface ServiceInfo {
    sdkCode: string;
    platformList: string[];
    domainMandatory: boolean;
}

/** The org/project/workspace the subscribe targets. */
export interface OrgTarget {
    orgId: string;
    projectId: string;
    workspaceId: string;
}

/**
 * The credential + subscribe operations the orchestrator needs. Implemented by
 * an adapter over `AdobeEntityFetcher` (step 08 wiring); mocked in unit tests.
 */
export interface ApiSubscriberClient {
    getServicesForOrg(orgId: string): Promise<OrgServiceInfo[]>;
    /** Ensure the shared S2S credential exists; return its `id_integration`. */
    ensureOAuthCredentialId(target: OrgTarget): Promise<string>;
    /** Create the apiKey credential; return its `id_integration`. */
    createAdobeIdCredential(
        orgId: string, projectId: string, workspaceId: string,
        input: { name: string; description: string; platform: 'apiKey'; domain: string },
    ): Promise<string>;
    subscribeOAuthServerToServerIntegrationToServices(
        orgId: string, idIntegration: string, serviceInfo: ServiceSubscriptionInfo[],
    ): Promise<void>;
    subscribeAdobeIdIntegrationToServices(
        orgId: string, idIntegration: string, serviceInfo: ServiceSubscriptionInfo[],
    ): Promise<void>;
}

/** Union of every deployable's `requiredApis` + the baseline; deduped. */
export function computeRequiredApis(deployables: DeployableCatalogEntry[]): string[] {
    const apis = new Set<string>([BASELINE_API]);
    for (const deployable of deployables) {
        for (const api of deployable.requiredApis ?? []) {
            apis.add(api);
        }
    }
    return [...apis];
}

/** Resolve API names → ServiceInfo via the org service list. Throws on unknown. */
export function resolveServiceInfos(
    requiredApis: string[],
    servicesForOrg: OrgServiceInfo[],
): ServiceInfo[] {
    return requiredApis.map((api) => {
        const service = servicesForOrg.find((s) => s.code === api);
        if (!service) {
            throw new Error(`Unknown Adobe API "${api}" — not entitled for this org.`);
        }
        return {
            sdkCode: service.code,
            platformList: service.platformList ?? [],
            domainMandatory: Boolean(service.domainMandatory),
        };
    });
}

/** Split services into apiKey vs oauth_server_to_server by `platformList`. */
export function partitionByPlatform(services: ServiceInfo[]): {
    apiKey: ServiceInfo[];
    oauthS2S: ServiceInfo[];
} {
    const apiKey = services.filter((s) => s.platformList.includes('apiKey'));
    const oauthS2S = services.filter((s) => s.platformList.includes('oauth_server_to_server'));
    return { apiKey, oauthS2S };
}

/** Free-service subscription shape: `{ sdkCode, licenseConfigs:null, roles:null }`. */
function toServiceSubscriptionInfo(service: ServiceInfo): ServiceSubscriptionInfo {
    return { sdkCode: service.sdkCode, licenseConfigs: null, roles: null };
}

async function subscribeOAuthServices(
    services: ServiceInfo[],
    target: OrgTarget,
    client: ApiSubscriberClient,
): Promise<void> {
    if (services.length === 0) {
        return;
    }
    const idIntegration = await client.ensureOAuthCredentialId(target);
    await client.subscribeOAuthServerToServerIntegrationToServices(
        target.orgId, idIntegration, services.map(toServiceSubscriptionInfo),
    );
}

async function subscribeApiKeyServices(
    services: ServiceInfo[],
    target: OrgTarget,
    client: ApiSubscriberClient,
    domain: string,
): Promise<void> {
    if (services.length === 0) {
        return;
    }
    const idIntegration = await client.createAdobeIdCredential(
        target.orgId, target.projectId, target.workspaceId,
        {
            name: APIKEY_CREDENTIAL_NAME,
            description: APIKEY_CREDENTIAL_DESCRIPTION,
            platform: 'apiKey',
            domain,
        },
    );
    await client.subscribeAdobeIdIntegrationToServices(
        target.orgId, idIntegration, services.map(toServiceSubscriptionInfo),
    );
}

/**
 * Reconcile the UNION of all deployables' `requiredApis` (+ baseline) onto the
 * shared project, branching each service by its platform. Idempotent: it always
 * subscribes the full union (not a delta). Mesh is included via the apiKey path.
 */
export async function subscribeRequiredApis(
    deployables: DeployableCatalogEntry[],
    target: OrgTarget,
    client: ApiSubscriberClient,
    domain: string = DEFAULT_DOMAIN,
): Promise<void> {
    const requiredApis = computeRequiredApis(deployables);
    const servicesForOrg = await client.getServicesForOrg(target.orgId);
    const services = resolveServiceInfos(requiredApis, servicesForOrg);
    const { apiKey, oauthS2S } = partitionByPlatform(services);

    await subscribeOAuthServices(oauthS2S, target, client);
    await subscribeApiKeyServices(apiKey, target, client, domain);
}
