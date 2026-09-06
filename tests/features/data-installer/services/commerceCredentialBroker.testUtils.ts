/**
 * Shared harness for the `commerceCredentialBroker` suite family.
 *
 * THIS FILE OWNS THE SERVICE-SELECTION MOCK AND THE SUT IMPORT — `jest.mock`
 * hoists above the imports of the module it appears in, not across modules, so a
 * spec that imported the broker itself could bind to the real settings reader.
 *
 * `resolveCommerceCredentials` is deliberately NOT mocked here: only the wiring
 * suite doubles it, and that suite imports the double directly, which a
 * registration in this file could not do for it.
 */

jest.mock('@/features/eds/services/accsDiscoveryConfig', () => ({
    selectCredentialService: jest.fn(),
}));

export {
    brokerForContext,
    clearSharedCredentialCache,
    createProjectCredentialBroker,
    fetchSharedCommerceCredentials,
    resolveProjectCredentials,
    type CredentialSourceProject,
} from '@/features/data-installer/services/commerceCredentialBroker';

export { selectCredentialService } from '@/features/eds/services/accsDiscoveryConfig';

export const SERVICE_URL =
    'https://example.adobeioruntime.net/api/v1/web/accs-discovery/get-commerce-credentials';
export const CLIENT_ID = 'shared-client-id';
export const CLIENT_SECRET = 'fake-test-secret-not-a-secret';

export const OK_BODY = {
    success: true,
    data: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
};

/** A fetch stand-in returning one canned response. */
export function respondWith(body: unknown, status = 200): jest.Mock {
    return jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    });
}

/**
 * A stand-in for the auth service.
 *
 * NO DEFAULT PARAMETER: written as `authWith(token = 'ims-token')`, calling it
 * with an explicit `undefined` re-triggers the default and hands back a token —
 * which is exactly how the no-token case first passed while asserting the
 * opposite.
 */
export const authWith = (token?: string) => ({
    getTokenManager: () => ({ inspectToken: jest.fn().mockResolvedValue({ token }) }),
});

export const auth = () => authWith('ims-token');
