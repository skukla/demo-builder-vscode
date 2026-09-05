/**
 * Event-provider tools (AB-6) — handler behaviour through the stub server.
 *
 * Registration against the real SDK is realSdkRegistration.test.ts's job and
 * the declared descriptors are eventProviderTools-descriptors.test.ts's; this
 * suite drives the handlers: project-scoped targeting, the auth pre-flight,
 * the confirm refusals on the destructive pair, and the service call shapes.
 */

import {
    COMPLETE_ADOBE,
    authService,
    fakeServer,
    eventToolsCtx,
    mockLifecycle,
    registerEventProviderTools,
} from './eventProviderTools.testUtils';

/** Arguments that reach the service layer, per tool, once every guard passes. */
const CASES = [
    { tool: 'list_event_providers', args: {}, mock: mockLifecycle.listEventEntities },
    {
        tool: 'create_event_provider',
        args: { providerKey: 'erp', label: 'ERP events', events: [] },
        mock: mockLifecycle.createEventProvider,
    },
    {
        tool: 'create_event_registration',
        args: { name: 'reg', events: [{ provider_id: 'p', event_code: 'e' }] },
        mock: mockLifecycle.createEventRegistration,
    },
    {
        tool: 'delete_event_registration',
        args: { registrationId: 'reg-9', confirm: true },
        mock: mockLifecycle.deleteEventEntities,
    },
    {
        tool: 'delete_event_provider',
        args: { providerId: 'prov-1', confirm: true },
        mock: mockLifecycle.deleteEventEntities,
    },
] as const;

const DESTRUCTIVE = ['delete_event_registration', 'delete_event_provider'] as const;

function serverWith(ctx: ReturnType<typeof eventToolsCtx>) {
    const server = fakeServer();
    registerEventProviderTools(server, ctx, authService);
    return server;
}

describe('registerEventProviderTools', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('registers the five lifecycle tools', () => {
        expect(serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE })).names().sort()).toEqual([
            'create_event_provider',
            'create_event_registration',
            'delete_event_provider',
            'delete_event_registration',
            'list_event_providers',
        ]);
    });

    describe('project scoping — every tool targets the CURRENT project workspace', () => {
        it.each(CASES)('$tool refuses as data when the Console block is empty', async ({ tool, mock }) => {
            const server = serverWith(eventToolsCtx({ adobe: {} }));

            const text = await server.text(tool, CASES.find((c) => c.tool === tool)!.args);

            expect(text).toContain('no Adobe Console context');
            expect(mock).not.toHaveBeenCalled();
        });

        it.each(CASES)('$tool refuses as data when the project has no Adobe block', async ({ tool, args, mock }) => {
            const server = serverWith(eventToolsCtx({ adobe: undefined }));

            const text = await server.text(tool, args);

            expect(text).toContain('no Adobe Console context');
            expect(mock).not.toHaveBeenCalled();
        });

        it.each(CASES)('$tool refuses as data when no project is open', async ({ tool, args, mock }) => {
            const server = serverWith(eventToolsCtx({ noProject: true }));

            const text = await server.text(tool, args);

            expect(text).toContain('no Adobe Console context');
            expect(mock).not.toHaveBeenCalled();
        });

        it.each([
            ['organization', { projectId: 'proj-1', workspace: 'ws-1' }],
            ['projectId', { organization: 'org-1', workspace: 'ws-1' }],
            ['workspace', { organization: 'org-1', projectId: 'proj-1' }],
        ])('every coordinate is required — a project missing %s cannot list', async (_field, adobe) => {
            const server = serverWith(eventToolsCtx({ adobe }));

            const text = await server.text('list_event_providers', {});

            expect(text).toContain('no Adobe Console context');
            expect(mockLifecycle.listEventEntities).not.toHaveBeenCalled();
        });

        it('list targets the PROJECT workspace, not any selection chain', async () => {
            mockLifecycle.listEventEntities.mockResolvedValue({ providers: [], registrations: [] });
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE }));

            await server.text('list_event_providers', {});

            expect(mockLifecycle.listEventEntities).toHaveBeenCalledWith(expect.anything(), {
                orgId: 'org-1',
                projectId: 'proj-1',
                workspaceId: 'ws-1',
            });
        });
    });

    describe('auth pre-flight — a handoff, never a throw', () => {
        it.each(CASES)('$tool hands off when the user is signed out', async ({ tool, args, mock }) => {
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE, auth: 'signed-out' }));

            const text = await server.text(tool, args);

            expect(text).toContain('Adobe sign-in required');
            expect(mock).not.toHaveBeenCalled();
        });

        it.each(CASES)('$tool hands off when there is no auth manager at all', async ({ tool, args, mock }) => {
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE, auth: 'no-manager' }));

            const text = await server.text(tool, args);

            expect(text).toContain('Adobe sign-in required');
            expect(mock).not.toHaveBeenCalled();
        });

        it.each(CASES)('$tool hands off when the auth check throws', async ({ tool, args, mock }) => {
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE, auth: 'throws' }));

            const text = await server.text(tool, args);

            expect(text).toContain('Adobe sign-in required');
            expect(mock).not.toHaveBeenCalled();
        });
    });

    describe('list_event_providers', () => {
        it('answers with the service listing, not an empty envelope', async () => {
            mockLifecycle.listEventEntities.mockResolvedValue({
                providers: [{ id: 'prov-1' }],
                registrations: [{ id: 'reg-1' }],
            });
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE }));

            const answer = await server.json('list_event_providers', {});

            expect(answer).toMatchObject({
                providers: [{ id: 'prov-1' }],
                registrations: [{ id: 'reg-1' }],
            });
            expect(answer.note).toEqual(expect.any(String));
        });
    });

    describe('create_event_provider', () => {
        it('passes the declared events through and answers with the service result', async () => {
            mockLifecycle.createEventProvider.mockResolvedValue({ providerId: 'prov-9', created: true });
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE }));

            const answer = await server.json('create_event_provider', {
                providerKey: 'erp',
                label: 'ERP events',
                description: 'Orders and shipments',
                events: [{ event_code: 'com.erp.order', label: 'Order', description: 'd' }],
            });

            expect(answer).toMatchObject({ providerId: 'prov-9', created: true });
            expect(answer.verify).toEqual(expect.any(String));
            expect(mockLifecycle.createEventProvider).toHaveBeenCalledWith(
                expect.anything(),
                { orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-1' },
                {
                    providerKey: 'erp',
                    label: 'ERP events',
                    description: 'Orders and shipments',
                    events: [{ event_code: 'com.erp.order', label: 'Order', description: 'd' }],
                }
            );
        });

        it('sends no events and no description when the agent omitted them', async () => {
            mockLifecycle.createEventProvider.mockResolvedValue({ providerId: 'prov-9' });
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE }));

            await server.json('create_event_provider', { providerKey: 'erp', label: 'ERP' });

            expect(mockLifecycle.createEventProvider).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.objectContaining({ events: [], description: undefined })
            );
        });
    });

    describe('create_event_registration', () => {
        it('defaults delivery to the journal and answers with the service result', async () => {
            mockLifecycle.createEventRegistration.mockResolvedValue({ registrationId: 'reg-9' });
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE }));

            const answer = await server.json('create_event_registration', {
                name: 'orders',
                events: [{ provider_id: 'prov-1', event_code: 'com.erp.order' }],
            });

            expect(answer).toMatchObject({ registrationId: 'reg-9' });
            expect(answer.verify).toEqual(expect.any(String));
            expect(mockLifecycle.createEventRegistration).toHaveBeenCalledWith(
                expect.anything(),
                { orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-1' },
                {
                    name: 'orders',
                    description: '',
                    deliveryType: 'journal',
                    webhookUrl: undefined,
                    events: [{ provider_id: 'prov-1', event_code: 'com.erp.order' }],
                }
            );
        });

        it('passes an explicit webhook delivery through unchanged', async () => {
            mockLifecycle.createEventRegistration.mockResolvedValue({ registrationId: 'reg-9' });
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE }));

            await server.json('create_event_registration', {
                name: 'orders',
                description: 'Order events',
                deliveryType: 'webhook',
                webhookUrl: 'https://example.com/hook',
                events: [{ provider_id: 'prov-1', event_code: 'com.erp.order' }],
            });

            expect(mockLifecycle.createEventRegistration).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.objectContaining({
                    description: 'Order events',
                    deliveryType: 'webhook',
                    webhookUrl: 'https://example.com/hook',
                })
            );
        });
    });

    describe('the destructive pair', () => {
        it.each(DESTRUCTIVE)('%s refuses without confirm:true and calls nothing', async (tool) => {
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE }));

            const text = await server.text(tool, { providerId: 'p', registrationId: 'r' });

            expect(text).toBe(`${tool} requires confirm:true to proceed.`);
            expect(mockLifecycle.deleteEventEntities).not.toHaveBeenCalled();
        });

        it.each(DESTRUCTIVE)('%s refuses, rather than throwing, when called with no arguments', async (tool) => {
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE }));

            const text = await server.text(tool);

            expect(text).toBe(`${tool} requires confirm:true to proceed.`);
            expect(mockLifecycle.deleteEventEntities).not.toHaveBeenCalled();
        });

        it('delete_event_registration deletes exactly the named registration', async () => {
            mockLifecycle.deleteEventEntities.mockResolvedValue([{ id: 'reg-9', deleted: true }]);
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE }));

            const answer = await server.json('delete_event_registration', {
                registrationId: 'reg-9',
                confirm: true,
            });

            expect(mockLifecycle.deleteEventEntities).toHaveBeenCalledWith(
                expect.anything(),
                { orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-1' },
                { registrationIds: ['reg-9'] }
            );
            expect(answer).toEqual({ items: [{ id: 'reg-9', deleted: true }] });
        });

        it('delete_event_provider deletes the named registrations first (order lives in the service; the ARGUMENT shape is pinned here)', async () => {
            mockLifecycle.deleteEventEntities.mockResolvedValue([{ id: 'prov-1', deleted: true }]);
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE }));

            const answer = await server.json('delete_event_provider', {
                providerId: 'prov-1',
                registrationIds: ['reg-1', 'reg-2'],
                confirm: true,
            });

            expect(mockLifecycle.deleteEventEntities).toHaveBeenCalledWith(
                expect.anything(),
                { orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-1' },
                { registrationIds: ['reg-1', 'reg-2'], providerId: 'prov-1' }
            );
            expect(answer).toEqual({ items: [{ id: 'prov-1', deleted: true }] });
        });

        it('delete_event_provider names no registrations when the agent listed none', async () => {
            mockLifecycle.deleteEventEntities.mockResolvedValue([]);
            const server = serverWith(eventToolsCtx({ adobe: COMPLETE_ADOBE }));

            await server.json('delete_event_provider', { providerId: 'prov-1', confirm: true });

            expect(mockLifecycle.deleteEventEntities).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                { registrationIds: [], providerId: 'prov-1' }
            );
        });
    });
});
