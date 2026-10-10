/**
 * subscribeRequiredApis — the observers a caller may or may not hand over (PL-70).
 *
 * `observe` is optional and so is each thing on it. A deploy passes a step line and
 * a profile keeper; an agent call may pass neither. These cases pin both halves:
 * what each observer is told, and that leaving one out changes nothing else.
 */

import { MGMT, SERVICES_FOR_ORG } from './apiSubscriber.testUtils';
import {
    subscribeRequiredApis,
    type ApiSubscriberClient,
    type OrgTarget,
} from '@/features/app-builder/services/apiSubscriber';

const TARGET: OrgTarget = { orgId: 'org1', projectId: 'proj1', workspaceId: 'ws1' };
const ACCS = 'ACCS-REST-API';

/** The Commerce service as a live org lists it, with two tenants' profiles. */
const ACCS_ROW = {
    code: ACCS,
    name: 'Adobe Commerce as a Cloud Service',
    platformList: null as unknown as string[],
    oauthServerToServerOnly: true,
    properties: {
        licenseConfigs: [
            { id: '1', productId: 'P', name: 'Tenant A' },
            { id: '2', productId: 'P', name: 'Tenant B' },
        ],
    },
};

/** A workspace whose one credential holds `held`; everything else is missing. */
function client(held: string[], overrides: Partial<ApiSubscriberClient> = {}) {
    return {
        getServicesForOrg: jest.fn().mockResolvedValue([...SERVICES_FOR_ORG, ACCS_ROW]),
        listCredentialIds: jest.fn().mockResolvedValue(['s2s']),
        getSubscribedServiceCodes: jest.fn().mockResolvedValue(held),
        getSubscribedServices: jest.fn().mockResolvedValue([]),
        ensureOAuthCredentialId: jest.fn().mockResolvedValue('s2s'),
        createAdobeIdCredential: jest.fn().mockResolvedValue('apikey'),
        subscribeOAuthServerToServerIntegrationToServices: jest.fn().mockResolvedValue(undefined),
        subscribeAdobeIdIntegrationToServices: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as jest.Mocked<ApiSubscriberClient>;
}

/** A client whose service list stays on its way until `answer` is called. */
function clientWithSlowCatalog() {
    let answer: () => void = () => undefined;
    const fake = client([], {
        getServicesForOrg: jest.fn(
            () => new Promise((resolve) => (answer = () => resolve(SERVICES_FOR_ORG))),
        ),
    });
    return { fake, answer: () => answer() };
}

/** Let the subscribe reach its wait on the service list. */
async function untilWaitingOnCatalog(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
}

describe('the step line', () => {
    it('says "service", not "services", when one is added', async () => {
        const steps: string[] = [];

        await subscribeRequiredApis([], TARGET, client([]), undefined, [], undefined, [], {
            onStep: (step) => steps.push(step),
        });

        expect(steps).toContain('Adding 1 service to your workspace');
    });

    // A list that has already FAILED is not on its way either: the failure is what
    // the caller hears next, and a step announcing the read would be the last line
    // the SC saw before it.
    it('does not announce a service list that has already failed', async () => {
        const steps: string[] = [];
        const fake = client([], {
            getServicesForOrg: jest.fn().mockRejectedValue(new Error('504')),
        });

        await expect(
            subscribeRequiredApis([], TARGET, fake, undefined, [], undefined, [], {
                onStep: (step) => steps.push(step),
            }),
        ).rejects.toThrow('504');

        expect(steps).toStrictEqual(['Checking what subscriptions the workspace already has']);
    });
});

describe('a caller that hands over no step line', () => {
    it('still skips the subscribe when everything is already there', async () => {
        const fake = client([MGMT]);
        const log: string[] = [];

        const result = await subscribeRequiredApis([], TARGET, fake, undefined, [], undefined, [], {
            log: (message) => log.push(message),
        });

        expect(result).toStrictEqual([{ code: MGMT }]);
        expect(fake.subscribeOAuthServerToServerIntegrationToServices).not.toHaveBeenCalled();
    });

    it('still subscribes after waiting on the service list, with observers but no step line', async () => {
        const { fake, answer } = clientWithSlowCatalog();

        const run = subscribeRequiredApis([], TARGET, fake, undefined, [], undefined, [], {});
        await untilWaitingOnCatalog();
        answer();

        await expect(run).resolves.toStrictEqual([{ code: MGMT, name: 'I/O Management API' }]);
    });

    it('still subscribes after waiting on the service list, with no observers at all', async () => {
        const { fake, answer } = clientWithSlowCatalog();

        const run = subscribeRequiredApis([], TARGET, fake);
        await untilWaitingOnCatalog();
        answer();

        await expect(run).resolves.toStrictEqual([{ code: MGMT, name: 'I/O Management API' }]);
    });
});

describe('the Commerce profile a subscribe chose', () => {
    const tenantB: OrgTarget = { ...TARGET, commerceTenant: 'tenant b' };

    it('is handed to the caller to keep, with the tenant it was chosen for', async () => {
        const onProfileResolved = jest.fn();

        await subscribeRequiredApis([], tenantB, client([]), undefined, [ACCS], undefined, [], {
            onProfileResolved,
        });

        expect(onProfileResolved).toHaveBeenCalledTimes(1);
        expect(onProfileResolved).toHaveBeenCalledWith({ tenant: 'tenant b', id: '2', productId: 'P' });
    });

    it('is not reported when the subscribe chose none', async () => {
        const onProfileResolved = jest.fn();

        await subscribeRequiredApis([], TARGET, client([]), undefined, [], undefined, [], {
            onProfileResolved,
        });

        expect(onProfileResolved).not.toHaveBeenCalled();
    });

    it('is still sent to Adobe when the caller keeps nothing', async () => {
        const fake = client([]);

        await subscribeRequiredApis([], tenantB, fake, undefined, [ACCS], undefined, [], {});

        const [, , sent] = fake.subscribeOAuthServerToServerIntegrationToServices.mock.calls[0];
        expect(sent).toContainEqual({
            sdkCode: ACCS,
            licenseConfigs: [{ op: 'add', id: '2', productId: 'P' }],
            roles: null,
        });
    });
});
