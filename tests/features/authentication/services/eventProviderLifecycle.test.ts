/**
 * Event-provider lifecycle (AB-6) — list one workspace's event entities, and tear
 * one provider down.
 *
 * Driven through the teardown harness on purpose: the service takes the SAME deps
 * adapter as Console teardown (`createTeardownDeps`), so a fake built for one is the
 * fake for the other and the two cannot drift.
 *
 * The assertions are on ARGUMENTS — which org/project/workspace each call carries,
 * which ids get deleted — because a mocked client answers the same whatever it is
 * handed.
 */

import {
    deleteWorkspaceEventProvider,
    listWorkspaceEventEntities,
    type EventWorkspaceTarget,
} from '@/features/authentication/services/eventProviderLifecycle';
import { IoEventsApiError, type RawProvider } from '@/features/authentication/services/ioEventsTransport';
import { CRED_WS1, boundProvider, makeHarness } from './consoleProjectTeardown.testUtils';

const TARGET: EventWorkspaceTarget = { orgId: 'org1', projectId: 'proj1', workspaceId: 'ws1' };

/** A provider bound to THIS workspace, one to a sibling workspace, one to another project. */
const PROVIDERS: RawProvider[] = [
    boundProvider('prov-mine', 'proj1', 'ws1', 'ERP events'),
    boundProvider('prov-sibling', 'proj1', 'ws2', 'Stage events'),
    boundProvider('prov-other-project', 'proj9', 'ws1', 'Not ours'),
    // Commerce's own provider kind — never ours to list or delete.
    { id: 'prov-commerce', label: 'Commerce', provider_metadata: 'dx_commerce_events' },
];

describe('listWorkspaceEventEntities', () => {
    it("lists only this workspace's providers, plus its registrations", async () => {
        const { deps, clientFor } = makeHarness({ providers: PROVIDERS });
        clientFor(CRED_WS1.clientId).listRegistrations.mockResolvedValue([
            { id: 'reg-1', name: 'erp-order-created' },
        ]);

        const result = await listWorkspaceEventEntities(deps, TARGET);

        expect(result).toEqual({
            available: true,
            providers: [{ id: 'prov-mine', label: 'ERP events' }],
            registrations: [{ id: 'reg-1', name: 'erp-order-created' }],
        });
        // The workspace's own credential, and the registrations of THIS workspace.
        expect(deps.createEventsClient).toHaveBeenCalledWith({
            accessToken: 'token-abc',
            apiKey: CRED_WS1.clientId,
        });
        expect(clientFor(CRED_WS1.clientId).listProviders).toHaveBeenCalledWith('org1');
        expect(clientFor(CRED_WS1.clientId).listRegistrations).toHaveBeenCalledWith(
            'org1',
            'proj1',
            'ws1',
        );
    });

    it('creates nothing when the workspace has no credential — a read never writes', async () => {
        const { deps } = makeHarness({ credentials: {} });

        const result = await listWorkspaceEventEntities(deps, TARGET);

        expect(result).toMatchObject({ available: false });
        expect((result as { reason: string }).reason).toMatch(/no server-to-server credential/i);
        expect(deps.createWorkspaceS2SCredentialFor).not.toHaveBeenCalled();
        expect(deps.createEventsClient).not.toHaveBeenCalled();
    });

    it('reports access denied instead of subscribing the credential', async () => {
        const { deps, clientFor } = makeHarness({ providers: PROVIDERS });
        clientFor(CRED_WS1.clientId).listProviders.mockRejectedValue(
            new IoEventsApiError('List providers failed (HTTP 403)', 403),
        );

        const result = await listWorkspaceEventEntities(deps, TARGET);

        expect(result).toMatchObject({ available: false });
        expect((result as { reason: string }).reason).toMatch(/I\/O Management API/);
        expect(deps.subscribeManagementApi).not.toHaveBeenCalled();
    });

    it('lets any other failure reach the caller', async () => {
        const { deps, clientFor } = makeHarness();
        clientFor(CRED_WS1.clientId).listProviders.mockRejectedValue(
            new IoEventsApiError('List providers failed (HTTP 500)', 500),
        );

        await expect(listWorkspaceEventEntities(deps, TARGET)).rejects.toThrow('HTTP 500');
    });
});

describe('deleteWorkspaceEventProvider', () => {
    it('deletes the named registrations FIRST, then the provider, in this workspace', async () => {
        const { deps, clientFor } = makeHarness({ providers: PROVIDERS });
        const client = clientFor(CRED_WS1.clientId);
        client.listRegistrations.mockResolvedValue([
            { id: 'reg-1', name: 'a' },
            { id: 'reg-2', name: 'b' },
        ]);
        const order: string[] = [];
        client.deleteRegistration.mockImplementation(async (...a: string[]) => {
            order.push(`registration:${a[3]}`);
        });
        client.deleteProvider.mockImplementation(async (...a: string[]) => {
            order.push(`provider:${a[3]}`);
        });

        const result = await deleteWorkspaceEventProvider(deps, TARGET, {
            providerId: 'prov-mine',
            providerLabel: 'ERP events',
            registrationIds: ['reg-2'],
        });

        expect(order).toEqual(['registration:reg-2', 'provider:prov-mine']);
        expect(client.deleteRegistration).toHaveBeenCalledWith('org1', 'proj1', 'ws1', 'reg-2');
        expect(client.deleteProvider).toHaveBeenCalledWith('org1', 'proj1', 'ws1', 'prov-mine');
        expect(result).toEqual({
            refused: undefined,
            items: [
                { kind: 'registration', id: 'reg-2', outcome: 'deleted' },
                { kind: 'provider', id: 'prov-mine', label: 'ERP events', outcome: 'deleted' },
            ],
        });
    });

    it.each([
        ['a provider bound to a sibling workspace', 'prov-sibling', 'Stage events'],
        ['a provider bound to another project', 'prov-other-project', 'Not ours'],
        ["Commerce's own provider", 'prov-commerce', 'Commerce'],
        ['an id nobody has', 'prov-nope', 'x'],
    ])('refuses %s and deletes nothing', async (_case, providerId, providerLabel) => {
        const { deps, clientFor } = makeHarness({ providers: PROVIDERS });
        const client = clientFor(CRED_WS1.clientId);

        const result = await deleteWorkspaceEventProvider(deps, TARGET, {
            providerId,
            providerLabel,
            registrationIds: [],
        });

        expect(result.refused).toMatch(/not an event provider of this workspace/i);
        expect(result.items).toStrictEqual([]);
        expect(client.deleteProvider).not.toHaveBeenCalled();
        expect(client.deleteRegistration).not.toHaveBeenCalled();
    });

    it('refuses when the label does not match the provider — the dialog showed the label', async () => {
        const { deps, clientFor } = makeHarness({ providers: PROVIDERS });

        const result = await deleteWorkspaceEventProvider(deps, TARGET, {
            providerId: 'prov-mine',
            providerLabel: 'Something else',
            registrationIds: [],
        });

        expect(result.refused).toMatch(/is labelled "ERP events"/);
        expect(clientFor(CRED_WS1.clientId).deleteProvider).not.toHaveBeenCalled();
    });

    it("refuses a registration id that is not this workspace's, before deleting anything", async () => {
        const { deps, clientFor } = makeHarness({ providers: PROVIDERS });
        const client = clientFor(CRED_WS1.clientId);
        client.listRegistrations.mockResolvedValue([{ id: 'reg-1', name: 'a' }]);

        const result = await deleteWorkspaceEventProvider(deps, TARGET, {
            providerId: 'prov-mine',
            providerLabel: 'ERP events',
            registrationIds: ['reg-1', 'reg-elsewhere'],
        });

        expect(result.refused).toMatch(/reg-elsewhere/);
        expect(client.deleteRegistration).not.toHaveBeenCalled();
        expect(client.deleteProvider).not.toHaveBeenCalled();
    });

    it('collects a failed delete instead of throwing, and still reports the provider', async () => {
        const { deps, clientFor } = makeHarness({ providers: PROVIDERS });
        const client = clientFor(CRED_WS1.clientId);
        client.listRegistrations.mockResolvedValue([{ id: 'reg-1', name: 'a' }]);
        client.deleteRegistration.mockRejectedValue(
            new IoEventsApiError('Delete registration failed (HTTP 500)', 500),
        );

        const result = await deleteWorkspaceEventProvider(deps, TARGET, {
            providerId: 'prov-mine',
            providerLabel: 'ERP events',
            registrationIds: ['reg-1'],
        });

        expect(result.items).toEqual([
            {
                kind: 'registration',
                id: 'reg-1',
                outcome: 'failed',
                error: 'Delete registration failed (HTTP 500)',
            },
            { kind: 'provider', id: 'prov-mine', label: 'ERP events', outcome: 'deleted' },
        ]);
    });

    it('creates the workspace credential when there is none — a delete may write to get access', async () => {
        const { deps, clientFor } = makeHarness({
            credentials: {},
            providers: PROVIDERS,
        });

        const result = await deleteWorkspaceEventProvider(deps, TARGET, {
            providerId: 'prov-mine',
            providerLabel: 'ERP events',
            registrationIds: [],
        });

        expect(deps.createWorkspaceS2SCredentialFor).toHaveBeenCalledWith('org1', 'proj1', 'ws1');
        expect(clientFor('client-ws1-new').deleteProvider).toHaveBeenCalledWith(
            'org1',
            'proj1',
            'ws1',
            'prov-mine',
        );
        expect(result.items).toHaveLength(1);
    });
});
