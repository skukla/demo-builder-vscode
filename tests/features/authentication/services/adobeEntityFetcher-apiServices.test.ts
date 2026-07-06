/**
 * AdobeEntityFetcher — API-service SDK wrappers (Step 07)
 *
 * The thin wrappers over @adobe/aio-lib-console used by the D1 API subscriber:
 * - getServicesForOrg(orgId)
 * - createAdobeIdCredential(orgId, projId, wsId, { name, description, platform, domain })
 * - subscribeAdobeIdIntegrationToServices(orgId, idIntegration, serviceInfo[])
 * - subscribeOAuthServerToServerIntegrationToServices(orgId, idIntegration, serviceInfo[])
 *
 * The SDK is MOCKED via the SDK client's getClient() — no live Adobe calls.
 * Asserts each wrapper calls the correct SDK method with the right arguments and
 * unwraps `.body`. The create response returns the id in `.id` (like the OAuth create);
 * `.id_integration` only appears on getCredentials LIST entries — so create reads
 * `id_integration ?? id`.
 */

import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { Logger, StepLogger } from '@/core/logging';

jest.mock('@/core/logging');

import { getLogger } from '@/core/logging';

const MESH = 'GraphQLServiceSDK';
const MGMT = 'AdobeIOManagementAPISDK';

describe('AdobeEntityFetcher — API-service wrappers', () => {
    let fetcher: AdobeEntityFetcher;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let sdk: {
        getServicesForOrg: jest.Mock;
        createAdobeIdCredential: jest.Mock;
        subscribeAdobeIdIntegrationToServices: jest.Mock;
        subscribeOAuthServerToServerIntegrationToServices: jest.Mock;
        getCredentials: jest.Mock;
        createOAuthServerToServerCredential: jest.Mock;
        getIntegration: jest.Mock;
    };
    let mockCacheManager: jest.Mocked<AuthCacheManager>;

    beforeEach(() => {
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        });

        sdk = {
            getServicesForOrg: jest.fn(),
            createAdobeIdCredential: jest.fn(),
            subscribeAdobeIdIntegrationToServices: jest.fn(),
            subscribeOAuthServerToServerIntegrationToServices: jest.fn(),
            getCredentials: jest.fn(),
            createOAuthServerToServerCredential: jest.fn(),
            getIntegration: jest.fn(),
        };

        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(true),
            getClient: jest.fn().mockReturnValue(sdk),
            ensureInitialized: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        // A cacheManager that would return DIFFERENT ids than the explicit args,
        // to prove ensureOAuthCredentialId uses the args passed in, not the cache.
        mockCacheManager = {
            getCachedOrganization: jest.fn().mockReturnValue({ id: 'cache-org' }),
            getCachedProject: jest.fn().mockReturnValue({ id: 'cache-proj' }),
            getCachedWorkspace: jest.fn().mockReturnValue({ id: 'cache-ws' }),
        } as unknown as jest.Mocked<AuthCacheManager>;

        fetcher = new AdobeEntityFetcher(
            { execute: jest.fn() } as unknown as jest.Mocked<CommandExecutor>,
            mockSDKClient,
            mockCacheManager,
            { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as jest.Mocked<Logger>,
            { logTemplate: jest.fn() } as unknown as jest.Mocked<StepLogger>,
        );
    });

    describe('getServicesForOrg', () => {
        it('should call the SDK and return the unwrapped service list body', async () => {
            sdk.getServicesForOrg.mockResolvedValue({
                body: [{ code: MESH, platformList: ['apiKey'] }],
            });

            const result = await fetcher.getServicesForOrg('org1');

            expect(sdk.getServicesForOrg).toHaveBeenCalledWith('org1');
            expect(result).toEqual([{ code: MESH, platformList: ['apiKey'] }]);
        });
    });

    describe('createAdobeIdCredential', () => {
        it('should call the SDK and return the credential id_integration (NOT .id)', async () => {
            sdk.createAdobeIdCredential.mockResolvedValue({
                body: { id_integration: 'int-123', id: 'should-not-be-used' },
            });

            const id = await fetcher.createAdobeIdCredential('org1', 'proj1', 'ws1', {
                name: 'demo', description: 'demo cred', platform: 'apiKey', domain: 'localhost:3000',
            });

            expect(sdk.createAdobeIdCredential).toHaveBeenCalledWith(
                'org1', 'proj1', 'ws1',
                expect.objectContaining({ platform: 'apiKey', domain: 'localhost:3000' }),
            );
            expect(id).toBe('int-123');
        });

        it('should fall back to the create response .id when id_integration is absent (real Console shape)', async () => {
            // The adobeId create endpoint returns the integration id in `.id` (like the
            // OAuth create), not `.id_integration`. Regression for the empty-id_integration bug.
            sdk.createAdobeIdCredential.mockResolvedValue({
                body: { id: 'cred-id-789' },
            });

            const id = await fetcher.createAdobeIdCredential('org1', 'proj1', 'ws1', {
                name: 'demo-builder-api-mesh', description: 'demo cred', platform: 'apiKey', domain: 'localhost:3000',
            });

            expect(id).toBe('cred-id-789');
        });

        it('should return an existing apiKey credential id_integration without creating one', async () => {
            sdk.getCredentials.mockResolvedValue({
                body: [
                    { integration_type: 'oauth_server_to_server', id_integration: 's2s-cred' },
                    { integration_type: 'apikey', integration_name: 'demo-builder-api-mesh', id_integration: 'existing-int' },
                ],
            });

            const id = await fetcher.createAdobeIdCredential('org1', 'proj1', 'ws1', {
                name: 'demo-builder-api-mesh', description: 'demo cred', platform: 'apiKey', domain: 'localhost:3000',
            });

            expect(id).toBe('existing-int');
            expect(sdk.getCredentials).toHaveBeenCalledWith('org1', 'proj1', 'ws1');
            expect(sdk.createAdobeIdCredential).not.toHaveBeenCalled();
        });

        it('should create when no apiKey credential matches by name', async () => {
            sdk.getCredentials.mockResolvedValue({
                body: [
                    { integration_type: 'apikey', integration_name: 'some-other-cred', id_integration: 'other-int' },
                ],
            });
            sdk.createAdobeIdCredential.mockResolvedValue({
                body: { id_integration: 'new-int' },
            });

            const id = await fetcher.createAdobeIdCredential('org1', 'proj1', 'ws1', {
                name: 'demo-builder-api-mesh', description: 'demo cred', platform: 'apiKey', domain: 'localhost:3000',
            });

            expect(id).toBe('new-int');
            expect(sdk.createAdobeIdCredential).toHaveBeenCalledWith(
                'org1', 'proj1', 'ws1',
                expect.objectContaining({ name: 'demo-builder-api-mesh', platform: 'apiKey' }),
            );
        });

        it('reuses a credential matching a legacy reuseNames alias (no duplicate create)', async () => {
            sdk.getCredentials.mockResolvedValue({
                body: [
                    // The workspace already has the OLD fixed-name credential.
                    { integration_type: 'apikey', integration_name: 'demo-builder-api-mesh', id_integration: 'legacy-int' },
                ],
            });

            const id = await fetcher.createAdobeIdCredential('org1', 'proj1', 'ws1', {
                name: 'demo-builder-api-mesh-ws1',
                reuseNames: ['demo-builder-api-mesh'],
                description: 'demo cred', platform: 'apiKey', domain: 'localhost:3000',
            });

            expect(id).toBe('legacy-int');
            expect(sdk.createAdobeIdCredential).not.toHaveBeenCalled();
        });

        it('strips reuseNames from the create payload (not an Adobe field)', async () => {
            sdk.getCredentials.mockResolvedValue({ body: [] });
            sdk.createAdobeIdCredential.mockResolvedValue({ body: { id: 'new-int' } });

            await fetcher.createAdobeIdCredential('org1', 'proj1', 'ws1', {
                name: 'demo-builder-api-mesh-ws1',
                reuseNames: ['demo-builder-api-mesh'],
                description: 'demo cred', platform: 'apiKey', domain: 'localhost:3000',
            });

            const sentInput = sdk.createAdobeIdCredential.mock.calls[0][3];
            expect(sentInput).toEqual(
                expect.objectContaining({ name: 'demo-builder-api-mesh-ws1', platform: 'apiKey' }),
            );
            expect(sentInput).not.toHaveProperty('reuseNames');
        });
    });

    describe('getSubscribedServiceCodes', () => {
        it('returns the credential sdkList from getIntegration', async () => {
            sdk.getIntegration.mockResolvedValue({ body: { sdkList: ['GraphQLServiceSDK', 'AdobeIOManagementAPISDK'] } });

            const codes = await fetcher.getSubscribedServiceCodes('org1', 'int-1');

            expect(codes).toEqual(['GraphQLServiceSDK', 'AdobeIOManagementAPISDK']);
            expect(sdk.getIntegration).toHaveBeenCalledWith('org1', 'int-1');
        });

        it('returns [] when sdkList is absent', async () => {
            sdk.getIntegration.mockResolvedValue({ body: {} });
            expect(await fetcher.getSubscribedServiceCodes('org1', 'int-1')).toEqual([]);
        });

        it('returns [] (never throws) when the SDK call fails', async () => {
            sdk.getIntegration.mockRejectedValue(new Error('boom'));
            expect(await fetcher.getSubscribedServiceCodes('org1', 'int-1')).toEqual([]);
        });
    });

    describe('subscribeAdobeIdIntegrationToServices', () => {
        it('should call the SDK with orgId, id_integration, and the serviceInfo list', async () => {
            sdk.subscribeAdobeIdIntegrationToServices.mockResolvedValue({ body: { sdkList: [MESH] } });

            await fetcher.subscribeAdobeIdIntegrationToServices('org1', 'int-123', [
                { sdkCode: MESH, licenseConfigs: null, roles: null },
            ]);

            expect(sdk.subscribeAdobeIdIntegrationToServices).toHaveBeenCalledWith(
                'org1', 'int-123', [{ sdkCode: MESH, licenseConfigs: null, roles: null }],
            );
        });
    });

    describe('subscribeOAuthServerToServerIntegrationToServices', () => {
        it('should call the SDK with orgId, id_integration, and the serviceInfo list', async () => {
            sdk.subscribeOAuthServerToServerIntegrationToServices.mockResolvedValue({ body: { sdkList: [MGMT] } });

            await fetcher.subscribeOAuthServerToServerIntegrationToServices('org1', 'int-456', [
                { sdkCode: MGMT, licenseConfigs: null, roles: null },
            ]);

            expect(sdk.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith(
                'org1', 'int-456', [{ sdkCode: MGMT, licenseConfigs: null, roles: null }],
            );
        });
    });

    describe('ensureOAuthCredentialId', () => {
        it('should return an existing S2S credential id_integration without creating one', async () => {
            sdk.getCredentials.mockResolvedValue({
                body: [
                    { integration_type: 'apikey', id_integration: 'apikey-cred' },
                    { integration_type: 'oauth_server_to_server', id_integration: 'cred-123' },
                ],
            });

            const id = await fetcher.ensureOAuthCredentialId('o', 'p', 'w');

            expect(id).toBe('cred-123');
            expect(sdk.getCredentials).toHaveBeenCalledWith('o', 'p', 'w');
            expect(sdk.createOAuthServerToServerCredential).not.toHaveBeenCalled();
        });

        it('should create a credential and return its body.id when none exists', async () => {
            sdk.getCredentials.mockResolvedValue({ body: [] });
            sdk.createOAuthServerToServerCredential.mockResolvedValue({
                body: { id: 'new-cred-456', apiKey: 'key' },
            });

            const id = await fetcher.ensureOAuthCredentialId('o', 'p', 'w');

            expect(sdk.createOAuthServerToServerCredential).toHaveBeenCalledWith(
                'o', 'p', 'w', expect.any(String), expect.any(String),
            );
            expect(id).toBe('new-cred-456');
        });

        it('should use the explicit args, not cacheManager values', async () => {
            sdk.getCredentials.mockResolvedValue({ body: [] });
            sdk.createOAuthServerToServerCredential.mockResolvedValue({ body: { id: 'x' } });

            await fetcher.ensureOAuthCredentialId('arg-org', 'arg-proj', 'arg-ws');

            expect(sdk.getCredentials).toHaveBeenCalledWith('arg-org', 'arg-proj', 'arg-ws');
            expect(sdk.createOAuthServerToServerCredential).toHaveBeenCalledWith(
                'arg-org', 'arg-proj', 'arg-ws', expect.any(String), expect.any(String),
            );
        });

        it('should skip non-S2S credentials and fall through to create', async () => {
            sdk.getCredentials.mockResolvedValue({
                body: [{ integration_type: 'apikey', id_integration: 'apikey-cred' }],
            });
            sdk.createOAuthServerToServerCredential.mockResolvedValue({ body: { id: 'created' } });

            const id = await fetcher.ensureOAuthCredentialId('o', 'p', 'w');

            expect(id).toBe('created');
            expect(sdk.createOAuthServerToServerCredential).toHaveBeenCalled();
        });

        it('should throw when SDK is not initialized', async () => {
            (mockSDKClient.isInitialized as jest.Mock).mockReturnValue(false);

            await expect(fetcher.ensureOAuthCredentialId('o', 'p', 'w')).rejects.toThrow();
        });

        it('should throw when required args are missing', async () => {
            await expect(fetcher.ensureOAuthCredentialId('', 'p', 'w')).rejects.toThrow();
        });

        it('should throw when create yields no id', async () => {
            sdk.getCredentials.mockResolvedValue({ body: [] });
            sdk.createOAuthServerToServerCredential.mockResolvedValue({ body: {} });

            await expect(fetcher.ensureOAuthCredentialId('o', 'p', 'w')).rejects.toThrow();
        });
    });
});
