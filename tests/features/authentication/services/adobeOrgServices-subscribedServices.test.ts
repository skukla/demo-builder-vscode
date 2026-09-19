/**
 * getSubscribedServices — every service a credential holds WITH its product profiles,
 * the list a subscribe must carry forward. Profile shape read live from
 * getSDKProperties on 2026-09-19 (id, name, productId, description); ids replaced.
 */
import { makeService } from './adobeOrgServices.testUtils';

const PROFILE = { id: 'p-1', name: 'Default - abc', productId: 'prod-1', description: 'Tenant123abc' };

describe('AdobeOrgServices.getSubscribedServices', () => {
    it("pairs each subscribed code with that service's profiles", async () => {
        const { service, client } = makeService(true);
        client.getIntegration.mockResolvedValue({ body: { sdkList: ['ACCS-REST-API', 'AdobeIOManagementAPISDK'] } });
        client.getSDKProperties.mockImplementation(async (_org: string, _id: string, code: string) => ({
            body: { licenseConfigs: code === 'ACCS-REST-API' ? [PROFILE] : null },
        }));

        await expect(service.getSubscribedServices('org-1', 'int-1')).resolves.toStrictEqual([
            { sdkCode: 'ACCS-REST-API', licenseConfigs: [PROFILE] },
            { sdkCode: 'AdobeIOManagementAPISDK', licenseConfigs: [] },
        ]);
        expect(client.getSDKProperties).toHaveBeenCalledWith('org-1', 'int-1', 'ACCS-REST-API');
    });

    it('answers unknown, not a partial list, when any read fails', async () => {
        const { service, client } = makeService(true);
        client.getIntegration.mockResolvedValue({ body: { sdkList: ['ACCS-REST-API', 'Other'] } });
        client.getSDKProperties
            .mockResolvedValueOnce({ body: { licenseConfigs: [PROFILE] } })
            .mockRejectedValueOnce(new Error('504'));

        await expect(service.getSubscribedServices('org-1', 'int-1')).resolves.toBeUndefined();
    });

    it('answers unknown when the credential itself cannot be read', async () => {
        const { service, client } = makeService(true);
        client.getIntegration.mockRejectedValue(new Error('403'));

        await expect(service.getSubscribedServices('org-1', 'int-1')).resolves.toBeUndefined();
    });

    // Live 2026-09-19: the API Mesh (API-key) credential answers getSDKProperties
    // with this exact error for GraphQLServiceSDK.
    it('reads an API-key credential, whose services have no profile properties, as holding none', async () => {
        const { service, client } = makeService(true);
        client.getIntegration.mockResolvedValue({ body: { sdkList: ['GraphQLServiceSDK'] } });
        client.getSDKProperties.mockRejectedValue(
            new Error('[CoreConsoleAPISDK:ERROR_GET_SDK_PROPERTIES] 404 - Not Found ({"id":"x"})'),
        );

        await expect(service.getSubscribedServices('org-1', 'int-1')).resolves.toStrictEqual([
            { sdkCode: 'GraphQLServiceSDK', licenseConfigs: [] },
        ]);
    });
});
