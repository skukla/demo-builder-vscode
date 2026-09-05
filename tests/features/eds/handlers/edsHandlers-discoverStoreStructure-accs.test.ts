/**
 * `discover-store-structure` — the ACCS route.
 *
 * ACCS discovery goes through an App Builder action, so it has a guard chain the
 * PaaS route does not: pick a configured service, refuse without an auth
 * manager, sign the user in, get an IMS token, and validate a second URL. The
 * ORDER matters — the service is chosen BEFORE sign-in on purpose, because a
 * missing or malformed service is not something a login can fix and prompting
 * first would be a pointless interruption.
 */

import {
    handleDiscoverStoreStructure,
    makeDiscoveryContext,
    mockDiscoverStoreStructure,
    mockEnsureAdobeIOAuth,
    mockInspectToken,
    mockSelectDiscoveryService,
    resetDiscoveryMocks,
    resultMessage,
    type DiscoverPayload,
} from './edsHandlers-discoverStoreStructure.testUtils';

beforeEach(() => {
    resetDiscoveryMocks();
});

const SERVICE_URL = 'https://discovery.example.test/api/v1/web/store-discovery/discover-stores';

const ACCS: DiscoverPayload = {
    backendType: 'accs',
    baseUrl: 'https://na1.api.commerce.adobe.com/tenant',
    orgId: 'ABC123@AdobeOrg',
};

const paramsPassedToDiscovery = (): unknown => mockDiscoverStoreStructure.mock.calls[0]?.[0];

describe('discover-store-structure (ACCS) — choosing the discovery service', () => {
    it('picks the service for the org the wizard is in', async () => {
        const { context } = makeDiscoveryContext();

        await handleDiscoverStoreStructure(context, ACCS);

        expect(mockSelectDiscoveryService).toHaveBeenCalledWith('ABC123@AdobeOrg');
    });

    it('tells the user to enter store codes by hand when nothing is configured', async () => {
        const { context, sendMessage } = makeDiscoveryContext();
        mockSelectDiscoveryService.mockReturnValue({ ok: false, reason: 'none-configured' });

        const response = await handleDiscoverStoreStructure(context, ACCS);

        // Nothing failed — there is simply no service, and the wizard has a
        // manual path, so the handler reports success with an explanation.
        expect(response).toEqual({ success: true });
        expect(resultMessage(sendMessage)).toEqual({
            success: false,
            error: 'No discovery service configured. Enter store codes manually.',
        });
        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
        expect(mockDiscoverStoreStructure).not.toHaveBeenCalled();
    });

    it('refuses a malformed service URL without prompting for sign-in', async () => {
        const { context, sendMessage } = makeDiscoveryContext();
        mockSelectDiscoveryService.mockReturnValue({ ok: false, reason: 'invalid-url' });

        const response = await handleDiscoverStoreStructure(context, ACCS);

        expect(response).toEqual({ success: false, error: 'Invalid discovery service URL' });
        expect(resultMessage(sendMessage)).toEqual({
            success: false,
            error: 'Discovery service URL must be a valid HTTPS URL.',
        });
        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });
});

describe('discover-store-structure (ACCS) — Adobe sign-in', () => {
    it('refuses when the host has no auth manager to sign in with', async () => {
        const { context, sendMessage } = makeDiscoveryContext({ withoutAuthManager: true });

        const response = await handleDiscoverStoreStructure(context, ACCS);

        expect(response).toEqual({ success: false, error: 'AuthManager not available' });
        expect(resultMessage(sendMessage)).toEqual({
            success: false,
            error: 'Authentication not available.',
        });
        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });

    it('asks the shared guard with this flow’s own prefix and prompt', async () => {
        const { context } = makeDiscoveryContext();

        await handleDiscoverStoreStructure(context, ACCS);

        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith({
            authManager: context.authManager,
            logger: context.logger,
            logPrefix: '[Store Discovery]',
            warningMessage: 'Adobe sign-in required for store discovery.',
        });
    });

    it('says the sign-in was cancelled when the user dismissed it', async () => {
        const { context, sendMessage } = makeDiscoveryContext();
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        const response = await handleDiscoverStoreStructure(context, ACCS);

        expect(response).toEqual({ success: false, error: 'Adobe authentication required' });
        expect(resultMessage(sendMessage)).toEqual({
            success: false,
            error: 'Adobe sign-in was cancelled.',
        });
        expect(mockDiscoverStoreStructure).not.toHaveBeenCalled();
    });

    it('says the sign-in failed when it was attempted and did not work', async () => {
        const { context, sendMessage } = makeDiscoveryContext();
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: false });

        const response = await handleDiscoverStoreStructure(context, ACCS);

        expect(response).toEqual({ success: false, error: 'Adobe authentication required' });
        expect(resultMessage(sendMessage)).toEqual({
            success: false,
            error: 'Adobe sign-in failed. Please try again.',
        });
    });

    it('refuses when the session produced no IMS token', async () => {
        const { context, sendMessage } = makeDiscoveryContext();
        mockInspectToken.mockResolvedValue({ token: undefined, valid: false, expiresIn: 0 });

        const response = await handleDiscoverStoreStructure(context, ACCS);

        expect(response).toEqual({ success: false, error: 'IMS token not available' });
        expect(resultMessage(sendMessage)).toEqual({
            success: false,
            error: 'Failed to retrieve IMS token after sign-in.',
        });
        expect(mockDiscoverStoreStructure).not.toHaveBeenCalled();
    });
});

describe('discover-store-structure (ACCS) — the params it builds', () => {
    it('sends the token, the chosen service and the GraphQL endpoint', async () => {
        const { context } = makeDiscoveryContext();

        const response = await handleDiscoverStoreStructure(context, {
            ...ACCS,
            accsGraphqlEndpoint: 'https://na1.api.commerce.adobe.com/tenant/graphql',
        });

        expect(response).toEqual({ success: true });
        expect(paramsPassedToDiscovery()).toEqual({
            backendType: 'accs',
            baseUrl: 'https://na1.api.commerce.adobe.com/tenant',
            imsToken: 'ims-token',
            discoveryServiceUrl: SERVICE_URL,
            accsGraphqlEndpoint: 'https://na1.api.commerce.adobe.com/tenant/graphql',
        });
    });

    it('leaves the GraphQL endpoint unset when the payload carried none', async () => {
        const { context } = makeDiscoveryContext();

        await handleDiscoverStoreStructure(context, ACCS);

        expect(paramsPassedToDiscovery()).toEqual({
            backendType: 'accs',
            baseUrl: 'https://na1.api.commerce.adobe.com/tenant',
            imsToken: 'ims-token',
            discoveryServiceUrl: SERVICE_URL,
            accsGraphqlEndpoint: undefined,
        });
    });

    it('refuses a non-HTTPS GraphQL endpoint', async () => {
        const { context, sendMessage } = makeDiscoveryContext();

        const response = await handleDiscoverStoreStructure(context, {
            ...ACCS,
            accsGraphqlEndpoint: 'http://na1.api.commerce.adobe.com/tenant/graphql',
        });

        expect(response).toEqual({ success: false, error: 'Invalid ACCS GraphQL endpoint URL' });
        expect(resultMessage(sendMessage)).toEqual({
            success: false,
            error: 'ACCS GraphQL endpoint must be a valid HTTPS URL.',
        });
        expect(mockDiscoverStoreStructure).not.toHaveBeenCalled();
    });

    it('never resolves PaaS admin credentials for an ACCS backend', async () => {
        const { context, getCurrentProject } = makeDiscoveryContext();

        await handleDiscoverStoreStructure(context, ACCS);

        expect(getCurrentProject).not.toHaveBeenCalled();
    });
});
