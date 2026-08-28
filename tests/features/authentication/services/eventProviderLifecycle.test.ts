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

import {
    createEventProvider,
    createEventRegistration,
    deleteEventEntities,
    listEventEntities,
    providerInstanceId,
    type EventLifecycleDeps,
    type EventWorkspaceTarget,
} from '@/features/authentication/services/eventProviderLifecycle';
import { THIRD_PARTY_PROVIDER_METADATA } from '@/features/authentication/services/ioEventsClient';

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
});
