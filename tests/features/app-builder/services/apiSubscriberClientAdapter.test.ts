import { createApiSubscriberClient } from '@/features/app-builder/services/apiSubscriberClientAdapter';
import type { ApiSubscriberClient } from '@/features/app-builder/services/apiSubscriber';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import {
    createMockEntityServices,
    type MockEntityServices,
} from '../../../helpers/adobeAuthUnitsFake';

/**
 * ApiSubscriberClientAdapter (D2 Track A, Step 02)
 *
 * A thin closure over AuthenticationService's entity services (org services and
 * credentials) that satisfies the ApiSubscriberClient interface. Forwards 3 methods verbatim, unwraps the
 * OrgTarget for ensureOAuthCredentialId, and throws on undefined for the
 * non-optional createAdobeIdCredential.
 */

describe('createApiSubscriberClient', () => {
    let entities: MockEntityServices;
    let adapter: ApiSubscriberClient;

    beforeEach(() => {
        entities = createMockEntityServices({
            orgServices: {
                getServicesForOrg: jest.fn().mockResolvedValue([{ code: 'X' }]),
                getSubscribedServiceCodes: jest.fn().mockResolvedValue(['AdobeAnalytics']),
                subscribeAdobeIdIntegrationToServices: jest.fn().mockResolvedValue(undefined),
                subscribeOAuthServerToServerIntegrationToServices: jest
                    .fn()
                    .mockResolvedValue(undefined),
            },
            credentials: {
                createAdobeIdCredential: jest.fn().mockResolvedValue('int-apikey'),
                ensureOAuthCredentialId: jest.fn().mockResolvedValue('int-oauth'),
            },
        });
        const service = {
            getEntityServices: jest.fn().mockResolvedValue(entities),
        } as unknown as AuthenticationService;

        adapter = createApiSubscriberClient(service);
    });

    it('should be instantiable and satisfy the ApiSubscriberClient interface', () => {
        const c: ApiSubscriberClient = adapter;
        expect(typeof c.getServicesForOrg).toBe('function');
        expect(typeof c.ensureOAuthCredentialId).toBe('function');
    });

    it('should forward getServicesForOrg', async () => {
        const result = await adapter.getServicesForOrg('org1');
        expect(entities.orgServices.getServicesForOrg).toHaveBeenCalledWith('org1', undefined);
        expect(result).toEqual([{ code: 'X' }]);
    });

    it('should forward getSubscribedServiceCodes with both arguments', async () => {
        // The skip-if-subscribed check reads this. An adapter that dropped
        // idIntegration, or answered nothing, would make every credential look
        // unsubscribed and re-PUT the whole union on each deploy.
        const codes = await adapter.getSubscribedServiceCodes('org1', 'int-1');

        expect(entities.orgServices.getSubscribedServiceCodes).toHaveBeenCalledWith(
            'org1',
            'int-1'
        );
        expect(codes).toStrictEqual(['AdobeAnalytics']);
    });

    it('should forward subscribeAdobeIdIntegrationToServices one-to-one', async () => {
        const services = [{ sdkCode: 'X', licenseConfigs: null, roles: null }];
        await adapter.subscribeAdobeIdIntegrationToServices('o', 'int-1', services);
        expect(entities.orgServices.subscribeAdobeIdIntegrationToServices).toHaveBeenCalledWith(
            'o',
            'int-1',
            services
        );
    });

    it('should forward subscribeOAuthServerToServerIntegrationToServices one-to-one', async () => {
        const services = [{ sdkCode: 'Y', licenseConfigs: null, roles: null }];
        await adapter.subscribeOAuthServerToServerIntegrationToServices('o', 'int-2', services);
        expect(
            entities.orgServices.subscribeOAuthServerToServerIntegrationToServices
        ).toHaveBeenCalledWith('o', 'int-2', services);
    });

    it('should unwrap OrgTarget for ensureOAuthCredentialId', async () => {
        const id = await adapter.ensureOAuthCredentialId({
            orgId: 'o',
            projectId: 'p',
            workspaceId: 'w',
        });
        expect(entities.credentials.ensureOAuthCredentialId).toHaveBeenCalledWith('o', 'p', 'w');
        expect(id).toBe('int-oauth');
    });

    it('should return the id from createAdobeIdCredential when the service yields a string', async () => {
        const input = {
            name: 'n',
            description: 'd',
            platform: 'apiKey' as const,
            domain: 'localhost:3000',
        };
        const id = await adapter.createAdobeIdCredential('o', 'p', 'w', input);
        expect(entities.credentials.createAdobeIdCredential).toHaveBeenCalledWith(
            'o',
            'p',
            'w',
            input
        );
        expect(id).toBe('int-apikey');
    });

    it('should throw when createAdobeIdCredential returns undefined (non-optional contract)', async () => {
        (entities.credentials.createAdobeIdCredential as jest.Mock).mockResolvedValue(undefined);
        const input = {
            name: 'n',
            description: 'd',
            platform: 'apiKey' as const,
            domain: 'localhost:3000',
        };
        await expect(adapter.createAdobeIdCredential('o', 'p', 'w', input)).rejects.toThrow();
    });
});
