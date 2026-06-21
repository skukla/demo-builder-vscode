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
 * unwraps `.body`. Credential id field is `id_integration` (NOT `.id`).
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
    };

    beforeEach(() => {
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        });

        sdk = {
            getServicesForOrg: jest.fn(),
            createAdobeIdCredential: jest.fn(),
            subscribeAdobeIdIntegrationToServices: jest.fn(),
            subscribeOAuthServerToServerIntegrationToServices: jest.fn(),
        };

        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(true),
            getClient: jest.fn().mockReturnValue(sdk),
            ensureInitialized: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        fetcher = new AdobeEntityFetcher(
            { execute: jest.fn() } as unknown as jest.Mocked<CommandExecutor>,
            mockSDKClient,
            {} as unknown as jest.Mocked<AuthCacheManager>,
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
});
