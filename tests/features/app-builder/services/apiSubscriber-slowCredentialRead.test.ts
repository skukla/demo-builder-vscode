/**
 * subscribeRequiredApis — when Adobe is slow to say what a credential holds.
 *
 * The read that skips the subscribe exists only to SAVE time, so it is bounded and
 * the catalog download does not wait on its answer. Measured on Bodea, 2026-09-19:
 * three deploys in four spent ~60s on that read before it 504'd, then took the full
 * path anyway; a fourth got an answer and finished the whole step in 11.7s.
 *
 * The hanging-read tests drive a FAKE clock: the budget is ten seconds and a suite
 * that actually waits it out is ten seconds slower for every run, forever.
 */

import { integrationAppBuilderComponent, meshAppBuilderComponent, MESH, MGMT, SERVICES_FOR_ORG } from './apiSubscriber.testUtils';
import {
    subscribeRequiredApis,
    type ApiSubscriberClient,
    type OrgTarget,
} from '@/features/app-builder/services/apiSubscriber';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const TARGET: OrgTarget = { orgId: 'org1', projectId: 'proj1', workspaceId: 'ws1' };
const ERP_APIS = ['SomeOtherSDK'];
const EVERY_CODE = [MGMT, MESH, ...ERP_APIS];

/** A client whose credential read never settles until the test lets it. */
function clientWithHangingRead(overrides: Partial<ApiSubscriberClient> = {}) {
    return {
        getServicesForOrg: jest.fn().mockResolvedValue(SERVICES_FOR_ORG),
        listCredentialIds: jest.fn(() => new Promise<string[]>(() => undefined)),
        getSubscribedServiceCodes: jest.fn().mockResolvedValue(EVERY_CODE),
        getSubscribedServices: jest.fn().mockResolvedValue([]),
        ensureOAuthCredentialId: jest.fn().mockResolvedValue('s2s'),
        createAdobeIdCredential: jest.fn().mockResolvedValue('apikey'),
        subscribeOAuthServerToServerIntegrationToServices: jest.fn().mockResolvedValue(undefined),
        subscribeAdobeIdIntegrationToServices: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as jest.Mocked<ApiSubscriberClient>;
}

const entries = () => [meshAppBuilderComponent(), integrationAppBuilderComponent(ERP_APIS)];

describe('a credential read that never answers', () => {
    it('is abandoned at the budget, and the subscribe goes ahead without it', async () => {
        jest.useFakeTimers();
        const fake = clientWithHangingRead();
        const log: string[] = [];

        const run = subscribeRequiredApis(entries(), TARGET, fake, undefined, [], undefined, [], {
            log: (message) => log.push(message),
        });
        await Promise.resolve();
        // Nothing yet: the subscribe is still waiting on Adobe's answer.
        expect(fake.subscribeOAuthServerToServerIntegrationToServices).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(TIMEOUTS.CREDENTIAL_PROBE);
        await run;

        expect(fake.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalled();
        expect(log.join(' ')).toContain('gave up');
        jest.useRealTimers();
    });

    // The whole point of the cap: the catalog is what the full path needs next, and
    // waiting for the read first makes the SC pay for both.
    it('does not hold up the catalog download behind it', async () => {
        jest.useFakeTimers();
        const fake = clientWithHangingRead();

        const run = subscribeRequiredApis(entries(), TARGET, fake, undefined, [], undefined, [], {});
        await Promise.resolve();

        // Asked for while the read is still hanging, not after it gives up.
        expect(fake.getServicesForOrg).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(TIMEOUTS.CREDENTIAL_PROBE);
        await run;
        jest.useRealTimers();
    });
});

describe('what the subscribe says while it runs', () => {
    it('names each phase, so the step line moves through the wait', async () => {
        const fake = clientWithHangingRead({
            listCredentialIds: jest.fn().mockResolvedValue(['s2s']),
            getSubscribedServiceCodes: jest.fn().mockResolvedValue([MGMT]),
        });
        const steps: string[] = [];

        await subscribeRequiredApis(entries(), TARGET, fake, undefined, [], undefined, [], {
            onStep: (step) => steps.push(step),
        });

        expect(steps).toEqual([
            'Checking what subscriptions the workspace already has',
            'Reading the Adobe service list',
            'Adding 3 services to your workspace',
        ]);
    });

    it('says so when there was nothing to do', async () => {
        const fake = clientWithHangingRead({
            listCredentialIds: jest.fn().mockResolvedValue(['s2s']),
            getSubscribedServiceCodes: jest.fn().mockResolvedValue(EVERY_CODE),
        });
        const steps: string[] = [];
        const log: string[] = [];

        await subscribeRequiredApis(entries(), TARGET, fake, undefined, [], undefined, [], {
            onStep: (step) => steps.push(step),
            log: (message) => log.push(message),
        });

        expect(steps).toEqual(['Checking what subscriptions the workspace already has', 'Everything needed is already there']);
        expect(log.join(' ')).toContain('skipping the subscribe');
    });
});
