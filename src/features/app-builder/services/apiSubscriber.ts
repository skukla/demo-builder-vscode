/**
 * API subscriber (Step 07) — two-path-by-`platformList`, union reconcile.
 *
 * Ensures a demo's appBuilderComponents have their `requiredApis` subscribed on the one
 * shared App Builder project. Per the D1 spike (Q5 DEFINITIVE/CORRECTION):
 *
 * - `getServicesForOrg(orgId)` resolves API names → `{ sdkCode, platformList,
 *   domainMandatory }`.
 * - Branch by `platformList`: `apiKey`/AdobeID services (incl. API Mesh
 *   `GraphQLServiceSDK`) → `createAdobeIdCredential{platform:'apiKey',domain}` +
 *   `subscribeAdobeIdIntegrationToServices`; `oauth_server_to_server` services
 *   (e.g. `AdobeIOManagementAPISDK`) → `subscribeOAuthServerToServerIntegration
 *   ToServices`.
 * - Subscribe the UNION of all appBuilderComponents' `requiredApis` + the baseline
 *   `AdobeIOManagementAPISDK`; idempotent reconcile (PUT the full union — correct
 *   whether the endpoint replaces or merges). Mesh is NOT skipped.
 *
 * The credential id used to subscribe is `id_integration` (NOT `.id`). Free
 * services subscribe with `{ licenseConfigs:null, roles:null }`.
 */

import {
    partitionByPlatform,
    resolveServiceInfos,
    toServiceSubscriptionInfo,
    type ServiceInfo,
} from './apiServiceResolution';
import { BASELINE_API } from '@/core/constants';
import type {
    OrgServiceInfo,
    ServiceSubscriptionInfo,
} from '@/features/authentication/services/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

// Resolution moved to apiServiceResolution.ts; callers keep importing it from here.
export { partitionByPlatform, resolveServiceInfos, type ServiceInfo };

/** Default allowed-domain when a caller supplies none (matches setupInstructions). */
const DEFAULT_DOMAIN = 'localhost:3000';
/** apiKey credential metadata (a formality satisfying `domainMandatory`). */
const APIKEY_CREDENTIAL_NAME = 'demo-builder-api-mesh';
const APIKEY_CREDENTIAL_DESCRIPTION = 'API Mesh access (Demo Builder)';

/** A subscribed API as reported back to callers (code + display name when known). */
export interface SubscribedApi {
    code: string;
    name?: string;
}

/**
 * A per-service subscribe-progress tick, for a live status UI: `done:false` when
 * a code's subscribe starts, `done:true` when it lands (or immediately, when it
 * was already subscribed). The OAuth and apiKey groups run CONCURRENTLY, so ticks
 * from the two groups interleave — a listener keys off `code`, not arrival order.
 */
export interface SubscribeProgress {
    code: string;
    done: boolean;
}

/**
 * Optional listener the subscribe calls with each {@link SubscribeProgress} tick.
 * May return a promise; the subscribe AWAITS it, so a listener that ships the tick
 * over a channel (e.g. the webview) can guarantee delivery BEFORE the subscribe
 * proceeds — no dropped ticks racing a later response.
 */
export type SubscribeProgressListener = (event: SubscribeProgress) => void | Promise<void>;

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
    /** The sdk codes a credential is already subscribed to (skip-if-subscribed). */
    getSubscribedServiceCodes(orgId: string, idIntegration: string): Promise<string[]>;
    /**
     * Every credential id the workspace already has, read only. Optional: a
     * client without it skips the already-subscribed shortcut and takes the full
     * path, which is always correct, only slower.
     */
    listCredentialIds?(target: OrgTarget): Promise<string[]>;
    /** Ensure the shared S2S credential exists; return its `id_integration`. */
    ensureOAuthCredentialId(target: OrgTarget): Promise<string>;
    /** Create the apiKey credential; return its `id_integration`. */
    createAdobeIdCredential(
        orgId: string,
        projectId: string,
        workspaceId: string,
        input: {
            name: string;
            description: string;
            platform: 'apiKey';
            domain: string;
            /** Extra names that count as an existing match (e.g. a legacy fixed name). */
            reuseNames?: string[];
        }
    ): Promise<string>;
    subscribeOAuthServerToServerIntegrationToServices(
        orgId: string,
        idIntegration: string,
        serviceInfo: ServiceSubscriptionInfo[]
    ): Promise<void>;
    subscribeAdobeIdIntegrationToServices(
        orgId: string,
        idIntegration: string,
        serviceInfo: ServiceSubscriptionInfo[]
    ): Promise<void>;
}

/**
 * Union of every appBuilderComponent's `requiredApis` + the baseline + any
 * runtime-added extras (`Project.additionalConsoleApis`); deduped. Extras MUST
 * ride every reconcile — the subscribe PUTs the full union, so omitting them
 * once would strip an AI-added subscription.
 */
export function computeRequiredApis(
    appBuilderComponents: AppBuilderComponentCatalogEntry[],
    extraApis: string[] = [],
): string[] {
    const apis = new Set<string>([BASELINE_API, ...extraApis]);
    for (const appBuilderComponent of appBuilderComponents) {
        for (const api of appBuilderComponent.requiredApis ?? []) {
            apis.add(api);
        }
    }
    return [...apis];
}

/**
 * The catalog entries whose `requiredApis` this project's subscription carries:
 * the stack's API Mesh entries (unchanged), every integration or system the project
 * already has, and the entries being added before the project records them.
 *
 * Scoped because an integration's APIs belong to the projects that have it (owner,
 * 2026-09-15). Every compatible integration used to count, so any add subscribed the
 * ERP's database API on a project with no ERP. Safe to narrow: each reconcile still
 * names everything the project has, and the subscribe skips its update when the
 * credential already carries every code.
 *
 * @param catalog - the project's stack-filtered catalog
 * @param project - what the project has, keyed by component id
 * @param adding - entries mid-add, included even when the catalog does not list them
 */
export function entriesThatNeedApis(
    catalog: AppBuilderComponentCatalogEntry[],
    project: { appBuilderComponents?: Record<string, unknown> },
    adding: AppBuilderComponentCatalogEntry[] = [],
): AppBuilderComponentCatalogEntry[] {
    const has = new Set(Object.keys(project.appBuilderComponents ?? {}));
    const addingIds = new Set(adding.map((entry) => entry.id));
    const kept = catalog.filter(
        (entry) => entry.kind === 'mesh' || has.has(entry.id) || addingIds.has(entry.id),
    );
    const keptIds = new Set(kept.map((entry) => entry.id));
    return [...kept, ...adding.filter((entry) => !keptIds.has(entry.id))];
}

/**
 * Fire a `done` tick for every service in the group (no-op without a listener).
 * AWAITS each tick so it is flushed to the listener's channel before the subscribe
 * continues — the guarantee that makes a per-API progress stream race-proof.
 */
async function emitProgress(
    services: ServiceInfo[],
    done: boolean,
    onProgress?: SubscribeProgressListener,
): Promise<void> {
    if (!onProgress) return;
    for (const service of services) {
        await onProgress({ code: service.sdkCode, done });
    }
}

/**
 * True when the credential already carries every required sdk code AND none of
 * the codes being removed — letting the caller skip the slow subscribe PUT (~30s,
 * sometimes minutes). Best-effort: an unknown current set (`[]`) means "not
 * sure", so we do NOT skip.
 *
 * The removal half: a removal happens only through the full-list PUT, which drops
 * what the list omits. Skipping whenever every REQUIRED code was present meant a
 * removal never reached Adobe, since after a removal every remaining code always
 * is (found reading the code, 2026-09-18). A credential still holding a removed
 * code gets the PUT; every other one keeps skipping, which also spares APIs added
 * by hand in the Developer Console.
 */
async function alreadySubscribed(
    services: ServiceInfo[],
    orgId: string,
    idIntegration: string,
    client: ApiSubscriberClient,
    removing: ReadonlySet<string>,
): Promise<boolean> {
    const current = await client.getSubscribedServiceCodes(orgId, idIntegration);
    return services.every((s) => current.includes(s.sdkCode)) && !current.some((code) => removing.has(code));
}

async function subscribeOAuthServices(
    services: ServiceInfo[],
    target: OrgTarget,
    client: ApiSubscriberClient,
    removing: ReadonlySet<string>,
    onProgress?: SubscribeProgressListener,
): Promise<void> {
    if (services.length === 0) {
        return;
    }
    await emitProgress(services, false, onProgress);
    const idIntegration = await client.ensureOAuthCredentialId(target);
    if (await alreadySubscribed(services, target.orgId, idIntegration, client, removing)) {
        await emitProgress(services, true, onProgress);
        return;
    }
    await client.subscribeOAuthServerToServerIntegrationToServices(
        target.orgId,
        idIntegration,
        services.map(toServiceSubscriptionInfo),
    );
    await emitProgress(services, true, onProgress);
}

async function subscribeApiKeyServices(
    services: ServiceInfo[],
    target: OrgTarget,
    client: ApiSubscriberClient,
    domain: string,
    removing: ReadonlySet<string>,
    onProgress?: SubscribeProgressListener,
): Promise<void> {
    if (services.length === 0) {
        return;
    }
    await emitProgress(services, false, onProgress);
    const idIntegration = await client.createAdobeIdCredential(
        target.orgId,
        target.projectId,
        target.workspaceId,
        {
            // AdobeID credential names are unique per PROJECT, so a fixed name
            // collides on the 2nd workspace (409 duplicate). Scope it to the
            // workspace; still reuse the legacy fixed-name credential where it
            // already exists so nothing provisioned earlier is duplicated.
            name: `${APIKEY_CREDENTIAL_NAME}-${target.workspaceId}`,
            reuseNames: [APIKEY_CREDENTIAL_NAME],
            description: APIKEY_CREDENTIAL_DESCRIPTION,
            platform: 'apiKey',
            domain,
        },
    );
    if (await alreadySubscribed(services, target.orgId, idIntegration, client, removing)) {
        await emitProgress(services, true, onProgress);
        return;
    }
    await client.subscribeAdobeIdIntegrationToServices(
        target.orgId,
        idIntegration,
        services.map(toServiceSubscriptionInfo),
    );
    await emitProgress(services, true, onProgress);
}

/**
 * Whether the workspace's existing credentials, between them, already carry every
 * required API. Read only, and a cheap pair of calls, where the full path first
 * downloads the org's whole services catalog: slow in a large org, and measured
 * timing out at 60s twice in a row on Bodea's redeploys (2026-09-18) while every
 * API was already subscribed. Any doubt (no lister, no credentials, a failed
 * call) answers false, and the full path runs. So does a removal: only the full
 * path reaches the PUT that drops a code.
 */
async function coveredAlready(
    required: string[],
    target: OrgTarget,
    client: ApiSubscriberClient,
    removing: ReadonlySet<string>,
): Promise<boolean> {
    if (!client.listCredentialIds || removing.size > 0) return false;
    try {
        const ids = await client.listCredentialIds(target);
        if (ids.length === 0) return false;
        const lists = await Promise.all(ids.map((id) => client.getSubscribedServiceCodes(target.orgId, id)));
        const have = new Set(lists.flat());
        return required.every((code) => have.has(code));
    } catch {
        return false;
    }
}

/**
 * Reconcile the UNION of all appBuilderComponents' `requiredApis` (+ baseline) onto the
 * shared project, branching each service by its platform. Idempotent: it always
 * subscribes the full union (not a delta). Mesh is included via the apiKey path.
 *
 * @returns the full resolved+ensured API set (union incl. the baseline), each
 *   with the org service's display name when known — for status UIs.
 * @param removing - codes this reconcile takes away (Manage APIs unchecking one).
 *   A credential still holding one is sent the full list even when nothing is
 *   missing, because that PUT is the only way a removal reaches Adobe.
 */
export async function subscribeRequiredApis(
    appBuilderComponents: AppBuilderComponentCatalogEntry[],
    target: OrgTarget,
    client: ApiSubscriberClient,
    domain: string = DEFAULT_DOMAIN,
    extraApis: string[] = [],
    onProgress?: SubscribeProgressListener,
    removing: string[] = [],
): Promise<SubscribedApi[]> {
    const requiredApis = computeRequiredApis(appBuilderComponents, extraApis);
    const removed = new Set(removing.filter((code) => !requiredApis.includes(code)));
    if (await coveredAlready(requiredApis, target, client, removed)) {
        for (const code of requiredApis) {
            await onProgress?.({ code, done: true });
        }
        return requiredApis.map((code) => ({ code }));
    }
    const servicesForOrg = await client.getServicesForOrg(target.orgId);
    const services = resolveServiceInfos(requiredApis, servicesForOrg);
    const { apiKey, oauthS2S, unmatched } = partitionByPlatform(services);

    // The two groups use INDEPENDENT credentials and subscribe endpoints, so run
    // them CONCURRENTLY. The subscribe PUTs are the slow part (~30s each, Adobe-
    // side); serial execution doubled the wall-clock on a fresh enable. Each group
    // still awaits its own progress ticks, and Promise.all is awaited here — so
    // every tick is still delivered before this function (and the handler) returns.
    await Promise.all([
        subscribeOAuthServices(oauthS2S, target, client, removed, onProgress),
        subscribeApiKeyServices(apiKey, target, client, domain, removed, onProgress),
    ]);

    // Report only what a subscribe endpoint actually took. An unmatched service
    // was never PUT anywhere, so including it here would let the caller log it as
    // subscribed — the exact silent success this return value exists to prevent.
    return services
        .filter((service) => !unmatched.includes(service))
        .map((service) => ({ code: service.sdkCode, name: service.name }));
}
