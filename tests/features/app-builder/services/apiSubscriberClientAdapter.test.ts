import { createApiSubscriberClient } from '@/features/app-builder/services/apiSubscriberClientAdapter';
import type { ApiSubscriberClient } from '@/features/app-builder/services/apiSubscriber';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';

/**
 * ApiSubscriberClientAdapter (D2 Track A, Step 02)
 *
 * A thin closure over AuthenticationService that satisfies the
 * ApiSubscriberClient interface. Forwards 3 methods verbatim, unwraps the
 * OrgTarget for ensureOAuthCredentialId, and throws on undefined for the
 * non-optional createAdobeIdCredential.
 */

describe('createApiSubscriberClient', () => {
    let service: jest.Mocked<Pick<AuthenticationService,
        | 'getServicesForOrg'
        | 'createAdobeIdCredential'
        | 'subscribeAdobeIdIntegrationToServices'
        | 'subscribeOAuthServerToServerIntegrationToServices'
        | 'ensureOAuthCredentialId'
    >>;
    let adapter: ApiSubscriberClient;

    beforeEach(() => {
        service = {
            getServicesForOrg: jest.fn().mockResolvedValue([{ code: 'X' }]),
            createAdobeIdCredential: jest.fn().mockResolvedValue('int-apikey'),
            subscribeAdobeIdIntegrationToServices: jest.fn().mockResolvedValue(undefined),
            subscribeOAuthServerToServerIntegrationToServices: jest.fn().mockResolvedValue(undefined),
            ensureOAuthCredentialId: jest.fn().mockResolvedValue('int-oauth'),
        } as any;

        adapter = createApiSubscriberClient(service as unknown as AuthenticationService);
    });

    it('should be instantiable and satisfy the ApiSubscriberClient interface', () => {
        const c: ApiSubscriberClient = adapter;
        expect(typeof c.getServicesForOrg).toBe('function');
        expect(typeof c.ensureOAuthCredentialId).toBe('function');
    });

    it('should forward getServicesForOrg', async () => {
        const result = await adapter.getServicesForOrg('org1');
        expect(service.getServicesForOrg).toHaveBeenCalledWith('org1');
        expect(result).toEqual([{ code: 'X' }]);
    });

    it('should forward subscribeAdobeIdIntegrationToServices one-to-one', async () => {
        const services = [{ sdkCode: 'X', licenseConfigs: null, roles: null }];
        await adapter.subscribeAdobeIdIntegrationToServices('o', 'int-1', services);
        expect(service.subscribeAdobeIdIntegrationToServices).toHaveBeenCalledWith('o', 'int-1', services);
    });

    it('should forward subscribeOAuthServerToServerIntegrationToServices one-to-one', async () => {
        const services = [{ sdkCode: 'Y', licenseConfigs: null, roles: null }];
        await adapter.subscribeOAuthServerToServerIntegrationToServices('o', 'int-2', services);
        expect(service.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith('o', 'int-2', services);
    });

    it('should unwrap OrgTarget for ensureOAuthCredentialId', async () => {
        const id = await adapter.ensureOAuthCredentialId({
            orgId: 'o', projectId: 'p', workspaceId: 'w',
        });
        expect(service.ensureOAuthCredentialId).toHaveBeenCalledWith('o', 'p', 'w');
        expect(id).toBe('int-oauth');
    });

    it('should return the id from createAdobeIdCredential when the service yields a string', async () => {
        const input = { name: 'n', description: 'd', platform: 'apiKey' as const, domain: 'localhost:3000' };
        const id = await adapter.createAdobeIdCredential('o', 'p', 'w', input);
        expect(service.createAdobeIdCredential).toHaveBeenCalledWith('o', 'p', 'w', input);
        expect(id).toBe('int-apikey');
    });

    it('should throw when createAdobeIdCredential returns undefined (non-optional contract)', async () => {
        (service.createAdobeIdCredential as jest.Mock).mockResolvedValue(undefined);
        const input = { name: 'n', description: 'd', platform: 'apiKey' as const, domain: 'localhost:3000' };
        await expect(adapter.createAdobeIdCredential('o', 'p', 'w', input)).rejects.toThrow();
    });
});
