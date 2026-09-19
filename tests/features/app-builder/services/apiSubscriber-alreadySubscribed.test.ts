/**
 * subscribeRequiredApis — the already-subscribed shortcut.
 *
 * Before downloading the org's whole services catalog, the subscriber asks the
 * workspace's existing credentials what they already carry. On Bodea (2026-09-18)
 * that download timed out at 60s on two redeploys in a row while every API was
 * already subscribed. Any doubt falls through to the full path.
 *
 * The catalog download is no longer gated on the answer — it is started
 * alongside the question, since the full path always needs it and the question
 * can spend ten seconds saying "something is missing" (2026-09-19). So a covered
 * run is proved by the SUBSCRIBES that did not happen, not by the read.
 */

import { integrationAppBuilderComponent, meshAppBuilderComponent, MESH, MGMT, SERVICES_FOR_ORG } from './apiSubscriber.testUtils';
import {
    subscribeRequiredApis,
    type ApiSubscriberClient,
    type OrgTarget,
} from '@/features/app-builder/services/apiSubscriber';

const TARGET: OrgTarget = { orgId: 'org1', projectId: 'proj1', workspaceId: 'ws1' };
const ERP_APIS = ['SomeOtherSDK'];

function client(codesById: Record<string, string[]>, overrides: Partial<ApiSubscriberClient> = {}) {
    return {
        getServicesForOrg: jest.fn().mockResolvedValue(SERVICES_FOR_ORG),
        listCredentialIds: jest.fn().mockResolvedValue(Object.keys(codesById)),
        getSubscribedServiceCodes: jest.fn(async (_org: string, id: string) => codesById[id] ?? []),
        getSubscribedServices: jest.fn(async (_org: string, id: string) =>
            (codesById[id] ?? []).map((sdkCode) => ({ sdkCode, licenseConfigs: [] })),
        ),
        ensureOAuthCredentialId: jest.fn().mockResolvedValue('s2s'),
        createAdobeIdCredential: jest.fn().mockResolvedValue('apikey'),
        subscribeOAuthServerToServerIntegrationToServices: jest.fn().mockResolvedValue(undefined),
        subscribeAdobeIdIntegrationToServices: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as jest.Mocked<ApiSubscriberClient>;
}

const entries = () => [meshAppBuilderComponent(), integrationAppBuilderComponent(ERP_APIS)];

describe('subscribeRequiredApis — already subscribed', () => {
    it('skips every subscribe when the credentials already carry every API', async () => {
        // The mesh API on the apiKey credential, the rest on the server-to-server one.
        const fake = client({ s2s: [MGMT, 'SomeOtherSDK'], apikey: [MESH] });
        const ticks: unknown[] = [];

        const result = await subscribeRequiredApis(entries(), TARGET, fake, undefined, [], (tick) => {
            ticks.push(tick);
        });

        expect(fake.ensureOAuthCredentialId).not.toHaveBeenCalled();
        expect(fake.createAdobeIdCredential).not.toHaveBeenCalled();
        expect(fake.subscribeOAuthServerToServerIntegrationToServices).not.toHaveBeenCalled();
        expect(fake.subscribeAdobeIdIntegrationToServices).not.toHaveBeenCalled();
        expect(result.map((api) => api.code).sort()).toEqual([MGMT, MESH, 'SomeOtherSDK'].sort());
        expect(ticks).toContainEqual({ code: 'SomeOtherSDK', done: true });
    });

    it('takes the full path when one API is missing', async () => {
        const fake = client({ s2s: [MGMT], apikey: [MESH] });

        await subscribeRequiredApis(entries(), TARGET, fake);

        expect(fake.getServicesForOrg).toHaveBeenCalledTimes(1);
    });

    it('takes the full path when the workspace has no credentials yet', async () => {
        const fake = client({});

        await subscribeRequiredApis(entries(), TARGET, fake);

        expect(fake.getServicesForOrg).toHaveBeenCalledTimes(1);
    });

    it('takes the full path when listing the credentials fails', async () => {
        const fake = client({ s2s: [MGMT, 'SomeOtherSDK', MESH] }, {
            listCredentialIds: jest.fn().mockRejectedValue(new Error('500')),
        });

        await subscribeRequiredApis(entries(), TARGET, fake);

        expect(fake.getServicesForOrg).toHaveBeenCalledTimes(1);
    });

    it('takes the full path for a client that cannot list credentials', async () => {
        const fake = client({ s2s: [MGMT, 'SomeOtherSDK', MESH] });
        delete (fake as Partial<ApiSubscriberClient>).listCredentialIds;

        await subscribeRequiredApis(entries(), TARGET, fake);

        expect(fake.getServicesForOrg).toHaveBeenCalledTimes(1);
    });
});

describe('subscribeRequiredApis — a removal reaches Adobe', () => {
    // Manage APIs removes an API by sending the full list without it. Skipping that
    // PUT whenever every REQUIRED code was present meant a removal never reached
    // Adobe, since after a removal every remaining code always is (2026-09-18).
    it('sends the full list to the credential still holding a removed API, and only to it', async () => {
        const fake = client({ s2s: [MGMT, 'SomeOtherSDK', 'DroppedSDK'], apikey: [MESH] });
        fake.ensureOAuthCredentialId.mockResolvedValue('s2s');
        fake.createAdobeIdCredential.mockResolvedValue('apikey');
        fake.getServicesForOrg.mockResolvedValue([
            ...SERVICES_FOR_ORG,
            { code: 'DroppedSDK', platformList: ['oauth_server_to_server'] },
        ]);

        await subscribeRequiredApis(entries(), TARGET, fake, undefined, [], undefined, ['DroppedSDK']);

        expect(fake.getServicesForOrg).toHaveBeenCalledTimes(1);
        expect(fake.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledTimes(1);
        const sent = fake.subscribeOAuthServerToServerIntegrationToServices.mock.calls[0][2].map((s) => s.sdkCode);
        expect(sent).not.toContain('DroppedSDK');
        expect(fake.subscribeAdobeIdIntegrationToServices).not.toHaveBeenCalled();
    });

    it('a removed API that no credential holds any more changes nothing', async () => {
        const fake = client({ s2s: [MGMT, 'SomeOtherSDK'], apikey: [MESH] });

        await subscribeRequiredApis(entries(), TARGET, fake, undefined, [], undefined, ['DroppedSDK']);

        expect(fake.subscribeOAuthServerToServerIntegrationToServices).not.toHaveBeenCalled();
        expect(fake.subscribeAdobeIdIntegrationToServices).not.toHaveBeenCalled();
    });

    it('a code still required is never treated as removed', async () => {
        const fake = client({ s2s: [MGMT, 'SomeOtherSDK'], apikey: [MESH] });

        await subscribeRequiredApis(entries(), TARGET, fake, undefined, [], undefined, ['SomeOtherSDK']);

        // The shortcut still applies, which is visible in the subscribes it saved.
        expect(fake.subscribeOAuthServerToServerIntegrationToServices).not.toHaveBeenCalled();
        expect(fake.subscribeAdobeIdIntegrationToServices).not.toHaveBeenCalled();
    });
});

/**
 * The Bodea wipe, reproduced (2026-09-19): Kukla Bodea / Stage's credential held only
 * ACCS-REST-API with its one Commerce profile; an ERP deploy needing four free
 * services PUT just those, and Adobe's replace removed Commerce.
 */
describe('a subscribe keeps what the credential already has', () => {
    const PROFILE = { id: 'p-bodea', productId: 'prod-accs', description: 'Tenant123abc' };

    function wiped(current: Array<{ sdkCode: string; licenseConfigs: typeof PROFILE[] }> | undefined) {
        return client(
            {},
            {
                listCredentialIds: undefined,
                getSubscribedServices: jest.fn().mockResolvedValue(current),
                getServicesForOrg: jest.fn().mockResolvedValue([
                    { code: MGMT, platformList: null as unknown as string[] },
                    { code: 'CloudIntegrationSDK', platformList: null as unknown as string[] },
                ]),
            },
        );
    }

    it('carries Commerce and its profile through a deploy that does not need it', async () => {
        const fake = wiped([{ sdkCode: 'ACCS-REST-API', licenseConfigs: [PROFILE] }]);

        await subscribeRequiredApis([integrationAppBuilderComponent(['CloudIntegrationSDK'])], TARGET, fake);

        const [, , sent] = (fake.subscribeOAuthServerToServerIntegrationToServices as jest.Mock).mock.calls[0];
        expect(sent).toStrictEqual([
            {
                sdkCode: 'ACCS-REST-API',
                licenseConfigs: [{ op: 'add', id: 'p-bodea', productId: 'prod-accs' }],
                roles: null,
            },
            { sdkCode: MGMT, licenseConfigs: null, roles: null },
            { sdkCode: 'CloudIntegrationSDK', licenseConfigs: null, roles: null },
        ]);
    });

    it("sends nothing when the credential's current list cannot be read", async () => {
        const fake = wiped(undefined);

        await expect(
            subscribeRequiredApis([integrationAppBuilderComponent(['CloudIntegrationSDK'])], TARGET, fake),
        ).rejects.toThrow("Couldn't read which APIs the credential already has");
        expect(fake.subscribeOAuthServerToServerIntegrationToServices).not.toHaveBeenCalled();
    });
});
