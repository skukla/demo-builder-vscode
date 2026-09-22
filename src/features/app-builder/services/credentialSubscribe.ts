/**
 * Sending a credential the list it should hold, for both credential kinds.
 *
 * `apiSubscriber.ts` decides WHAT a workspace needs; this sends it. Split out when
 * that file crossed its size limit (2026-09-22) — the two jobs are separable: the
 * decision reads the project and the catalog, this reads and writes one credential.
 *
 * The read before the write is the load-bearing part: the subscribe PUT REPLACES a
 * credential's list, so a list built from an unknown current one is a wipe
 * (`subscriptionList.ts`).
 *
 * @module features/app-builder/services/credentialSubscribe
 */

import type { ServiceInfo } from './apiServiceResolution';
import type { ApiSubscriberClient, OrgTarget, SubscribeProgressListener } from './apiSubscriber';
import {
    alreadySubscribed,
    buildSubscriptionList,
    type RememberedProfile,
    UNKNOWN_CURRENT,
} from './subscriptionList';
import type { ServiceSubscriptionInfo } from '@/features/authentication/services/types';

/** apiKey credential metadata (a formality satisfying `domainMandatory`). */
const APIKEY_CREDENTIAL_NAME = 'demo-builder-api-mesh';
const APIKEY_CREDENTIAL_DESCRIPTION = 'API Mesh access (Demo Builder)';

/**
 * Fire a `done` tick for every service in the group (no-op without a listener).
 * AWAITS each tick so it is flushed to the listener's channel before the subscribe
 * continues — the guarantee that makes a per-API progress stream race-proof.
 */
export async function emitProgress(
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
 * Send the credential its merged list, or nothing: read what it holds now, skip when
 * nothing is missing or leaving, and refuse rather than PUT from an unknown list —
 * the PUT REPLACES the credential's list (`subscriptionList.ts`). Shared by both
 * credential paths.
 */
async function reconcileCredential(
    services: ServiceInfo[],
    idIntegration: string,
    target: OrgTarget,
    client: ApiSubscriberClient,
    removing: ReadonlySet<string>,
    put: (serviceInfo: ServiceSubscriptionInfo[]) => Promise<void>,
    onProfileResolved?: (profile: RememberedProfile) => void,
): Promise<void> {
    const current = await client.getSubscribedServices(target.orgId, idIntegration);
    if (!current) throw new Error(UNKNOWN_CURRENT);
    if (alreadySubscribed(services, current, removing)) return;
    await put(
        buildSubscriptionList(services, current, removing, target.commerceTenant, {
            remembered: target.commerceProfile,
            onResolved: onProfileResolved,
        }),
    );
}

export async function subscribeOAuthServices(
    services: ServiceInfo[],
    target: OrgTarget,
    client: ApiSubscriberClient,
    removing: ReadonlySet<string>,
    onProgress?: SubscribeProgressListener,
    onProfileResolved?: (profile: RememberedProfile) => void,
): Promise<void> {
    if (services.length === 0) {
        return;
    }
    await emitProgress(services, false, onProgress);
    const idIntegration = await client.ensureOAuthCredentialId(target);
    await reconcileCredential(
        services,
        idIntegration,
        target,
        client,
        removing,
        (serviceInfo) =>
            client.subscribeOAuthServerToServerIntegrationToServices(target.orgId, idIntegration, serviceInfo),
        onProfileResolved,
    );
    await emitProgress(services, true, onProgress);
}

export async function subscribeApiKeyServices(
    services: ServiceInfo[],
    target: OrgTarget,
    client: ApiSubscriberClient,
    domain: string,
    removing: ReadonlySet<string>,
    onProgress?: SubscribeProgressListener,
    onProfileResolved?: (profile: RememberedProfile) => void,
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
    await reconcileCredential(
        services,
        idIntegration,
        target,
        client,
        removing,
        (serviceInfo) => client.subscribeAdobeIdIntegrationToServices(target.orgId, idIntegration, serviceInfo),
        onProfileResolved,
    );
    await emitProgress(services, true, onProgress);
}
