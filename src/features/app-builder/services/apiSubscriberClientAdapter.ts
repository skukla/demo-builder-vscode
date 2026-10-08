/**
 * ApiSubscriberClient adapter (D2 Track A, Step 02)
 *
 * A thin closure over `AuthenticationService`'s entity services (its
 * `orgServices` and `credentials`) that satisfies the
 * `ApiSubscriberClient` interface the D1 subscriber (`apiSubscriber.ts`) expects.
 * It reconciles two signature mismatches:
 *   1. `ensureOAuthCredentialId(target: OrgTarget)` → the service takes explicit
 *      `(orgId, projectId, workspaceId)`; the adapter unwraps the OrgTarget.
 *   2. `createAdobeIdCredential(...)` is NON-optional `Promise<string>`; the
 *      service returns `Promise<string | undefined>`; the adapter throws on
 *      `undefined` to honor the contract.
 *
 * No new abstraction beyond this single object literal (Rule of Three: 1 use).
 */

import type { ApiSubscriberClient, OrgTarget } from '@/features/app-builder/services/apiSubscriber';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';

export function createApiSubscriberClient(service: AuthenticationService): ApiSubscriberClient {
    // Each call goes to the unit that owns it: org services or credentials.
    const orgServices = async () => (await service.getEntityServices()).orgServices;
    const credentials = async () => (await service.getEntityServices()).credentials;
    return {
        getServicesForOrg: async (orgId, sdkCodes) =>
            (await orgServices()).getServicesForOrg(orgId, sdkCodes),

        getSubscribedServiceCodes: async (orgId, idIntegration) =>
            (await orgServices()).getSubscribedServiceCodes(orgId, idIntegration),

        getSubscribedServices: async (orgId, idIntegration) =>
            (await orgServices()).getSubscribedServices(orgId, idIntegration),

        listCredentialIds: async (target: OrgTarget) =>
            (await credentials()).listCredentialIds(
                target.orgId,
                target.projectId,
                target.workspaceId,
            ),

        ensureOAuthCredentialId: async (target: OrgTarget) =>
            (await credentials()).ensureOAuthCredentialId(
                target.orgId,
                target.projectId,
                target.workspaceId,
            ),

        createAdobeIdCredential: async (orgId, projectId, workspaceId, input) => {
            const id = await (await credentials()).createAdobeIdCredential(
                orgId,
                projectId,
                workspaceId,
                input,
            );
            if (!id) {
                throw new Error('createAdobeIdCredential: no id_integration returned for the apiKey credential');
            }
            return id;
        },

        subscribeAdobeIdIntegrationToServices: async (orgId, idIntegration, serviceInfo) =>
            (await orgServices()).subscribeAdobeIdIntegrationToServices(
                orgId,
                idIntegration,
                serviceInfo,
            ),

        subscribeOAuthServerToServerIntegrationToServices: async (orgId, idIntegration, serviceInfo) =>
            (await orgServices()).subscribeOAuthServerToServerIntegrationToServices(
                orgId,
                idIntegration,
                serviceInfo,
            ),
    };
}
