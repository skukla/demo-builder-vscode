/**
 * ApiSubscriberClient adapter (D2 Track A, Step 02)
 *
 * A thin closure over `AuthenticationService` that satisfies the
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
    return {
        getServicesForOrg: (orgId) => service.getServicesForOrg(orgId),

        ensureOAuthCredentialId: (target: OrgTarget) =>
            service.ensureOAuthCredentialId(target.orgId, target.projectId, target.workspaceId),

        createAdobeIdCredential: async (orgId, projectId, workspaceId, input) => {
            const id = await service.createAdobeIdCredential(orgId, projectId, workspaceId, input);
            if (!id) {
                throw new Error('createAdobeIdCredential: no id_integration returned for the apiKey credential');
            }
            return id;
        },

        subscribeAdobeIdIntegrationToServices: (orgId, idIntegration, serviceInfo) =>
            service.subscribeAdobeIdIntegrationToServices(orgId, idIntegration, serviceInfo),

        subscribeOAuthServerToServerIntegrationToServices: (orgId, idIntegration, serviceInfo) =>
            service.subscribeOAuthServerToServerIntegrationToServices(orgId, idIntegration, serviceInfo),
    };
}
