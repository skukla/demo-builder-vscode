/**
 * Event-provider lifecycle service (AB-6) — the generic (non-kit) lane.
 *
 * Pins the contracts the research doc distilled from the starter kit's own
 * model (.rptc/research/event-provider-lifecycle/research.md §4-5):
 * - deterministic provider instance_id (find-before-create key)
 * - provider_metadata PINNED to THIRD_PARTY_PROVIDER_METADATA on every create
 *   (teardown's ownership filter stays true by construction)
 * - credential detect-or-create + client wiring
 * - collect-don't-throw outcomes on the delete path, 404-as-success inherited
 *   from the client
 *
 * All auth values are obviously fake — this repo is public.
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    PROPAGATION_RETRY_DELAYS,
    createEventProvider,
    createEventRegistration,
    deleteEventEntities,
    listEventEntities,
    providerInstanceId,
    type EventLifecycleDeps,
    type EventWorkspaceTarget,
} from '@/features/authentication/services/eventProviderLifecycle';
import {
    IoEventsApiError,
    THIRD_PARTY_PROVIDER_METADATA,
} from '@/features/authentication/services/ioEventsClient';

const TARGET: EventWorkspaceTarget = {
    orgId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
};

const CRED = { clientId: 'fake-test-client-id-not-a-secret', idIntegration: 'int-1' };

type ClientMock = {
    listProviders: jest.Mock;
    listRegistrations: jest.Mock;
    createProvider: jest.Mock;
    createEventMetadata: jest.Mock;
    createRegistration: jest.Mock;
    deleteRegistration: jest.Mock;
    deleteEventMetadata: jest.Mock;
    deleteProvider: jest.Mock;
};

function makeClient(): ClientMock {
    return {
        listProviders: jest.fn().mockResolvedValue([]),
        listRegistrations: jest.fn().mockResolvedValue([]),
        createProvider: jest.fn().mockResolvedValue({ id: 'prov-new', label: 'L' }),
        createEventMetadata: jest.fn().mockResolvedValue(undefined),
        createRegistration: jest.fn().mockResolvedValue({ id: 'reg-new', name: 'n' }),
        deleteRegistration: jest.fn().mockResolvedValue(undefined),
        deleteEventMetadata: jest.fn().mockResolvedValue(undefined),
        deleteProvider: jest.fn().mockResolvedValue(undefined),
    };
}

function makeDeps(client: ClientMock): EventLifecycleDeps & { client: ClientMock } {
    return {
        client,
        getAccessToken: jest.fn().mockResolvedValue('fake-test-token-not-a-secret'),
        getWorkspaceS2SCredential: jest.fn().mockResolvedValue(CRED),
        createWorkspaceS2SCredentialFor: jest.fn().mockResolvedValue(CRED),
        subscribeManagementApi: jest.fn().mockResolvedValue(undefined),
        createEventsClient: jest.fn(() => client),
    };
}

describe('providerInstanceId', () => {
    it('is deterministic from project + workspace + key (the kit model)', () => {
        const a = providerInstanceId(TARGET, 'erp');
        const b = providerInstanceId(TARGET, 'erp');
        expect(a).toBe(b);
        expect(a).toContain('proj-1');
        expect(a).toContain('ws-1');
        expect(a).toContain('erp');
    });

    it('differs when any coordinate differs', () => {
        expect(providerInstanceId(TARGET, 'erp')).not.toBe(
            providerInstanceId({ ...TARGET, workspaceId: 'ws-2' }, 'erp')
        );
    });
});

describe('createEventProvider', () => {
    it('finds before creating: an existing instance_id short-circuits, created=false', async () => {
        const client = makeClient();
        client.listProviders.mockResolvedValue([{ id: 'prov-existing', label: 'ERP' }]);
        const deps = makeDeps(client);

        const result = await createEventProvider(deps, TARGET, {
            providerKey: 'erp',
            label: 'ERP',
            events: [],
        });

        expect(result.created).toBe(false);
        expect(result.providerId).toBe('prov-existing');
        expect(client.createProvider).not.toHaveBeenCalled();
        expect(client.listProviders).toHaveBeenCalledWith('org-1', {
            instanceId: providerInstanceId(TARGET, 'erp'),
        });
    });

    it('creates with provider_metadata PINNED and metadata per declared event', async () => {
        const client = makeClient();
        const deps = makeDeps(client);

        const result = await createEventProvider(deps, TARGET, {
            providerKey: 'erp',
            label: 'ERP events',
            description: 'ERP mock',
            events: [{ event_code: 'com.erp.order', label: 'Order', description: 'Order intake' }],
        });

        expect(result.created).toBe(true);
        expect(result.providerId).toBe('prov-new');
        expect(client.createProvider).toHaveBeenCalledWith('org-1', 'proj-1', 'ws-1', {
            label: 'ERP events',
            description: 'ERP mock',
            instance_id: providerInstanceId(TARGET, 'erp'),
            provider_metadata: THIRD_PARTY_PROVIDER_METADATA,
        });
        expect(client.createEventMetadata).toHaveBeenCalledWith(
            'org-1',
            'proj-1',
            'ws-1',
            'prov-new',
            { event_code: 'com.erp.order', label: 'Order', description: 'Order intake' }
        );
    });

    it('detect-or-creates the credential: falls back to create when none exists', async () => {
        const client = makeClient();
        const deps = makeDeps(client);
        (deps.getWorkspaceS2SCredential as jest.Mock).mockResolvedValue(undefined);

        await createEventProvider(deps, TARGET, { providerKey: 'erp', label: 'L', events: [] });

        expect(deps.createWorkspaceS2SCredentialFor).toHaveBeenCalledWith(
            'org-1',
            'proj-1',
            'ws-1'
        );
        expect(deps.createEventsClient).toHaveBeenCalledWith({
            accessToken: 'fake-test-token-not-a-secret',
            apiKey: CRED.clientId,
        });
    });
});

describe('createEventRegistration', () => {
    it('finds before creating by deterministic name, created=false on a match', async () => {
        const client = makeClient();
        client.listRegistrations.mockResolvedValue([{ id: 'reg-1', name: 'my-reg' }]);
        const deps = makeDeps(client);

        const result = await createEventRegistration(deps, TARGET, {
            name: 'my-reg',
            description: 'd',
            deliveryType: 'journal',
            events: [{ provider_id: 'prov-1', event_code: 'com.erp.order' }],
        });

        expect(result.created).toBe(false);
        expect(result.registrationId).toBe('reg-1');
        expect(client.createRegistration).not.toHaveBeenCalled();
    });

    it('a registration under another name is NOT a match: it creates', async () => {
        const client = makeClient();
        client.listRegistrations.mockResolvedValue([{ id: 'reg-other', name: 'other-reg' }]);
        const deps = makeDeps(client);

        const result = await createEventRegistration(deps, TARGET, {
            name: 'my-reg',
            description: 'd',
            deliveryType: 'journal',
            events: [{ provider_id: 'prov-1', event_code: 'com.erp.order' }],
        });

        expect(result).toEqual({ registrationId: 'reg-new', created: true });
        expect(client.createRegistration).toHaveBeenCalledWith(
            'org-1',
            'proj-1',
            'ws-1',
            expect.objectContaining({ name: 'my-reg' }),
        );
    });

    it('sends the webhook URL as webhook_url for webhook delivery', async () => {
        const client = makeClient();
        const deps = makeDeps(client);

        await createEventRegistration(deps, TARGET, {
            name: 'my-reg',
            description: 'd',
            deliveryType: 'webhook',
            webhookUrl: 'https://example.test/hook',
            events: [{ provider_id: 'prov-1', event_code: 'com.erp.order' }],
        });

        expect(client.createRegistration).toHaveBeenCalledWith('org-1', 'proj-1', 'ws-1', {
            client_id: CRED.clientId,
            name: 'my-reg',
            description: 'd',
            delivery_type: 'webhook',
            webhook_url: 'https://example.test/hook',
            events_of_interest: [{ provider_id: 'prov-1', event_code: 'com.erp.order' }],
        });
    });

    it('creates with the credential clientId as client_id', async () => {
        const client = makeClient();
        const deps = makeDeps(client);

        const result = await createEventRegistration(deps, TARGET, {
            name: 'my-reg',
            description: 'd',
            deliveryType: 'journal',
            events: [{ provider_id: 'prov-1', event_code: 'com.erp.order' }],
        });

        expect(result.created).toBe(true);
        expect(client.createRegistration).toHaveBeenCalledWith('org-1', 'proj-1', 'ws-1', {
            client_id: CRED.clientId,
            name: 'my-reg',
            description: 'd',
            delivery_type: 'journal',
            events_of_interest: [{ provider_id: 'prov-1', event_code: 'com.erp.order' }],
        });
    });
});

describe('listEventEntities', () => {
    it('returns only providers bound to THIS workspace, plus its registrations', async () => {
        const client = makeClient();
        client.listProviders.mockResolvedValue([
            {
                id: 'prov-ours',
                label: 'Ours',
                provider_metadata: THIRD_PARTY_PROVIDER_METADATA,
                _links: {
                    'rel:update': {
                        href: '/events/org-1/proj-1/ws-1/providers/prov-ours',
                    },
                },
            },
            {
                id: 'prov-other-ws',
                label: 'Other WS',
                provider_metadata: THIRD_PARTY_PROVIDER_METADATA,
                _links: {
                    'rel:update': {
                        href: '/events/org-1/proj-1/ws-OTHER/providers/prov-other-ws',
                    },
                },
            },
            { id: 'prov-system', label: 'System', provider_metadata: 'dx_commerce_events' },
            {
                // A system provider bound to THIS workspace: metadata is the first
                // gate, so the binding must never be what admits it.
                id: 'prov-system-here',
                label: 'System here',
                provider_metadata: 'dx_commerce_events',
                _links: {
                    'rel:update': {
                        href: '/events/org-1/proj-1/ws-1/providers/prov-system-here',
                    },
                },
            },
            {
                // Same workspace id under ANOTHER project: both coordinates must match.
                id: 'prov-other-project',
                label: 'Other project',
                provider_metadata: THIRD_PARTY_PROVIDER_METADATA,
                _links: {
                    'rel:update': {
                        href: '/events/org-1/proj-OTHER/ws-1/providers/prov-other-project',
                    },
                },
            },
            // Ours by metadata but with no binding at all, and with links that carry
            // no update rel: excluded without throwing (the teardown safety rule).
            { id: 'prov-no-links', label: 'No links', provider_metadata: THIRD_PARTY_PROVIDER_METADATA },
            {
                id: 'prov-no-update-rel',
                label: 'No update rel',
                provider_metadata: THIRD_PARTY_PROVIDER_METADATA,
                _links: {},
            },
        ]);
        client.listRegistrations.mockResolvedValue([{ id: 'reg-1', name: 'r' }]);
        const deps = makeDeps(client);

        const result = await listEventEntities(deps, TARGET);

        expect(result.providers.map((p) => p.id)).toEqual(['prov-ours']);
        expect(result.registrations).toEqual([{ id: 'reg-1', name: 'r' }]);
    });
});

describe('deleteEventEntities', () => {
    it('deletes registrations FIRST, then the provider; outcomes collected', async () => {
        const order: string[] = [];
        const client = makeClient();
        client.deleteRegistration.mockImplementation(async () => {
            order.push('registration');
        });
        client.deleteProvider.mockImplementation(async () => {
            order.push('provider');
        });
        const deps = makeDeps(client);

        const items = await deleteEventEntities(deps, TARGET, {
            registrationIds: ['reg-1'],
            providerId: 'prov-1',
        });

        expect(order).toEqual(['registration', 'provider']);
        expect(items).toEqual([
            { kind: 'registration', id: 'reg-1', outcome: 'deleted' },
            { kind: 'provider', id: 'prov-1', outcome: 'deleted' },
        ]);
    });

    it('collects a failure without throwing and still attempts the rest', async () => {
        const client = makeClient();
        client.deleteRegistration.mockRejectedValue(new Error('boom'));
        const deps = makeDeps(client);

        const items = await deleteEventEntities(deps, TARGET, {
            registrationIds: ['reg-1'],
            providerId: 'prov-1',
        });

        expect(items[0]).toEqual({
            kind: 'registration',
            id: 'reg-1',
            outcome: 'failed',
            error: 'boom',
        });
        expect(items[1].outcome).toBe('deleted');
    });

    it('collects a provider delete failure with its reason', async () => {
        const client = makeClient();
        client.deleteProvider.mockRejectedValue(new Error('provider boom'));
        const deps = makeDeps(client);

        const items = await deleteEventEntities(deps, TARGET, {
            registrationIds: ['reg-1'],
            providerId: 'prov-1',
        });

        expect(items).toEqual([
            { kind: 'registration', id: 'reg-1', outcome: 'deleted' },
            { kind: 'provider', id: 'prov-1', outcome: 'failed', error: 'provider boom' },
        ]);
    });

    it('does not touch the provider endpoint when no providerId is given', async () => {
        const client = makeClient();
        const deps = makeDeps(client);

        const items = await deleteEventEntities(deps, TARGET, { registrationIds: ['reg-1'] });

        expect(client.deleteProvider).not.toHaveBeenCalled();
        expect(items).toEqual([{ kind: 'registration', id: 'reg-1', outcome: 'deleted' }]);
    });
});

describe('access recovery', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('subscribes THIS credential to the Management API on 403, then retries', async () => {
        const client = makeClient();
        client.listProviders
            .mockRejectedValueOnce(new IoEventsApiError('denied', 403))
            .mockResolvedValueOnce([]);
        const deps = makeDeps(client);

        const pending = createEventProvider(deps, TARGET, {
            providerKey: 'erp',
            label: 'L',
            events: [],
        });
        await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAYS[0]);
        const result = await pending;

        expect(deps.subscribeManagementApi).toHaveBeenCalledWith('org-1', CRED.idIntegration);
        expect(client.listProviders).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ providerId: 'prov-new', created: true });
    });

    it('bounds the subscribe call at TIMEOUTS.LONG and not a moment sooner', async () => {
        const client = makeClient();
        client.listProviders.mockRejectedValue(new IoEventsApiError('denied', 403));
        const deps = makeDeps(client);
        (deps.subscribeManagementApi as jest.Mock).mockReturnValue(new Promise(() => undefined));

        let settled: unknown;
        const pending = createEventProvider(deps, TARGET, {
            providerKey: 'erp',
            label: 'L',
            events: [],
        }).catch((error: unknown) => {
            settled = error;
        });

        await jest.advanceTimersByTimeAsync(TIMEOUTS.LONG - 1);
        expect(settled).toBeUndefined();

        await jest.advanceTimersByTimeAsync(1);
        await pending;
        expect(settled).toBeInstanceOf(Error);
        expect((settled as Error).message).toContain(
            'Subscribing credential to the I/O Management API',
        );
        expect(client.listProviders).toHaveBeenCalledTimes(1);
    });
});
