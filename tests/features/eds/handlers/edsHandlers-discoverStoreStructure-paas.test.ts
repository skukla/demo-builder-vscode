/**
 * `discover-store-structure` — the guards, the PaaS credential seam, and how the
 * handler answers.
 *
 * The credential seam is the part with history: admin credentials arrive in the
 * payload while the WIZARD is collecting them (no project exists yet to have
 * saved them), and are resolved host-side from the current project otherwise —
 * the change that let Configure stop sending a credential it only holds because
 * we sent it there. Both routes have to reach `discoverStoreStructure` in the
 * same params object, so these assert that object rather than the fact a call
 * happened.
 */

import {
    STORE_STRUCTURE,
    handleDiscoverStoreStructure,
    makeDiscoveryContext,
    mockDiscoverStoreStructure,
    mockResolvePaasAdminPair,
    resetDiscoveryMocks,
    resultMessage,
    type DiscoverPayload,
} from './edsHandlers-discoverStoreStructure.testUtils';
import { createMockProject } from '../../../helpers/projectFake';

beforeEach(() => {
    resetDiscoveryMocks();
});

const PAAS: DiscoverPayload = {
    backendType: 'paas',
    baseUrl: 'https://commerce.example.test',
};

const paramsPassedToDiscovery = (): unknown => mockDiscoverStoreStructure.mock.calls[0]?.[0];

describe('discover-store-structure — required parameters', () => {
    it.each<[string, DiscoverPayload | undefined]>([
        ['no payload at all', undefined],
        ['no base URL', { backendType: 'paas', baseUrl: '' }],
        ['no backend type', { backendType: '' as 'paas', baseUrl: 'https://commerce.example.test' }],
    ])('refuses with %s', async (_label, payload) => {
        const { context, sendMessage } = makeDiscoveryContext();

        const response = await handleDiscoverStoreStructure(context, payload);

        expect(response).toEqual({ success: false, error: 'Missing required parameters' });
        expect(resultMessage(sendMessage)).toEqual({
            success: false,
            error: 'Missing required parameters (baseUrl, backendType)',
        });
        expect(mockDiscoverStoreStructure).not.toHaveBeenCalled();
    });
});

describe('discover-store-structure — the Commerce base URL', () => {
    it('refuses a non-HTTPS base URL before any discovery call', async () => {
        const { context, sendMessage } = makeDiscoveryContext();

        const response = await handleDiscoverStoreStructure(context, {
            ...PAAS,
            baseUrl: 'http://commerce.example.test',
        });

        expect(response).toEqual({ success: false, error: 'Invalid base URL' });
        expect(resultMessage(sendMessage)).toEqual({
            success: false,
            error: 'Commerce base URL must be a valid HTTPS URL.',
        });
        expect(mockDiscoverStoreStructure).not.toHaveBeenCalled();
    });

    it('refuses a base URL pointing at the loopback interface', async () => {
        const { context } = makeDiscoveryContext();

        const response = await handleDiscoverStoreStructure(context, {
            ...PAAS,
            baseUrl: 'https://localhost:8080',
        });

        expect(response).toEqual({ success: false, error: 'Invalid base URL' });
    });
});

describe('discover-store-structure — PaaS credentials from the payload', () => {
    it('uses the pair the wizard typed and never touches the credential store', async () => {
        const { context } = makeDiscoveryContext();

        await handleDiscoverStoreStructure(context, {
            ...PAAS,
            username: 'admin',
            password: 'fake-test-pw-not-a-secret',
        });

        expect(paramsPassedToDiscovery()).toEqual({
            backendType: 'paas',
            baseUrl: 'https://commerce.example.test',
            username: 'admin',
            password: 'fake-test-pw-not-a-secret',
        });
        expect(mockResolvePaasAdminPair).not.toHaveBeenCalled();
    });

    it('falls back to the host when only half a pair was sent', async () => {
        const { context } = makeDiscoveryContext({ project: createMockProject() });
        mockResolvePaasAdminPair.mockResolvedValue({
            username: 'stored-admin',
            password: 'fake-test-pw-not-a-secret',
        });

        await handleDiscoverStoreStructure(context, { ...PAAS, username: 'admin' });

        expect(paramsPassedToDiscovery()).toEqual({
            backendType: 'paas',
            baseUrl: 'https://commerce.example.test',
            username: 'stored-admin',
            password: 'fake-test-pw-not-a-secret',
        });
    });
});

describe('discover-store-structure — PaaS credentials resolved from the project', () => {
    it('asks the credential store with the project it found', async () => {
        const project = createMockProject({
            path: '/projects/citisignal',
            componentConfigs: { 'adobe-commerce-paas': { COMMERCE_ADMIN_USERNAME: 'x' } },
        });
        const { context, secrets } = makeDiscoveryContext({ project });
        mockResolvePaasAdminPair.mockResolvedValue({
            username: 'stored-admin',
            password: 'fake-test-pw-not-a-secret',
        });

        await handleDiscoverStoreStructure(context, PAAS);

        expect(mockResolvePaasAdminPair).toHaveBeenCalledWith(
            { secrets, projectId: '/projects/citisignal' },
            { 'adobe-commerce-paas': { COMMERCE_ADMIN_USERNAME: 'x' } },
        );
        expect(paramsPassedToDiscovery()).toEqual({
            backendType: 'paas',
            baseUrl: 'https://commerce.example.test',
            username: 'stored-admin',
            password: 'fake-test-pw-not-a-secret',
        });
    });

    it('omits SecretStorage from the lookup when the extension context has none', async () => {
        const project = createMockProject({ path: '/projects/citisignal' });
        const { context } = makeDiscoveryContext({ project, withoutSecrets: true });

        await handleDiscoverStoreStructure(context, PAAS);

        expect(mockResolvePaasAdminPair).toHaveBeenCalledWith(
            { projectId: '/projects/citisignal' },
            expect.anything(),
        );
    });

    it('survives a caller with no extension context to read SecretStorage from', async () => {
        const project = createMockProject({ path: '/projects/citisignal' });
        const { context } = makeDiscoveryContext({ project, withoutExtensionContext: true });

        const response = await handleDiscoverStoreStructure(context, PAAS);

        expect(response).toEqual({ success: true });
        expect(mockResolvePaasAdminPair).toHaveBeenCalledWith(
            { projectId: '/projects/citisignal' },
            expect.anything(),
        );
    });

    it('omits the project id when the project has not been saved anywhere', async () => {
        const project = createMockProject();
        project.path = '';
        const { context, secrets } = makeDiscoveryContext({ project });

        await handleDiscoverStoreStructure(context, PAAS);

        expect(mockResolvePaasAdminPair).toHaveBeenCalledWith({ secrets }, expect.anything());
    });

    it('leaves the credentials unset when no project is open', async () => {
        const { context } = makeDiscoveryContext({ project: null });

        await handleDiscoverStoreStructure(context, PAAS);

        expect(mockResolvePaasAdminPair).not.toHaveBeenCalled();
        expect(paramsPassedToDiscovery()).toEqual({
            backendType: 'paas',
            baseUrl: 'https://commerce.example.test',
            username: undefined,
            password: undefined,
        });
    });

    it('survives a caller with no project store at all', async () => {
        const { context } = makeDiscoveryContext({ withoutStateManager: true });

        const response = await handleDiscoverStoreStructure(context, PAAS);

        expect(response).toEqual({ success: true });
        expect(mockResolvePaasAdminPair).not.toHaveBeenCalled();
        expect(paramsPassedToDiscovery()).toEqual({
            backendType: 'paas',
            baseUrl: 'https://commerce.example.test',
            username: undefined,
            password: undefined,
        });
    });

    it('treats a blank stored pair as no credentials rather than empty strings', async () => {
        const { context } = makeDiscoveryContext({ project: createMockProject() });
        mockResolvePaasAdminPair.mockResolvedValue({ username: '', password: '' });

        await handleDiscoverStoreStructure(context, PAAS);

        expect(paramsPassedToDiscovery()).toEqual({
            backendType: 'paas',
            baseUrl: 'https://commerce.example.test',
            username: undefined,
            password: undefined,
        });
    });
});

describe('discover-store-structure — answering', () => {
    it('forwards a successful structure to the webview verbatim', async () => {
        const { context, sendMessage } = makeDiscoveryContext();

        const response = await handleDiscoverStoreStructure(context, {
            ...PAAS,
            username: 'admin',
            password: 'fake-test-pw-not-a-secret',
        });

        expect(response).toEqual({ success: true });
        expect(resultMessage(sendMessage)).toBe(STORE_STRUCTURE);
    });

    it("forwards discovery's own failure instead of a generic one", async () => {
        const { context, sendMessage } = makeDiscoveryContext();
        mockDiscoverStoreStructure.mockResolvedValue({
            success: false,
            error: 'Fill in the Admin Username and Admin Password fields above, then try again.',
        });

        const response = await handleDiscoverStoreStructure(context, PAAS);

        // The handler did its job; discovery is the thing that failed.
        expect(response).toEqual({ success: true });
        expect(resultMessage(sendMessage)).toEqual({
            success: false,
            error: 'Fill in the Admin Username and Admin Password fields above, then try again.',
        });
    });

    it('turns a thrown discovery error into a retryable message', async () => {
        const { context, sendMessage } = makeDiscoveryContext();
        mockDiscoverStoreStructure.mockRejectedValue(new Error('socket hang up'));

        const response = await handleDiscoverStoreStructure(context, {
            ...PAAS,
            username: 'admin',
            password: 'fake-test-pw-not-a-secret',
        });

        expect(response).toEqual({ success: true });
        expect(resultMessage(sendMessage)).toEqual({
            success: false,
            error: 'Store discovery failed. Please try again.',
        });
    });
});
