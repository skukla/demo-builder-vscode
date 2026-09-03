/**
 * Event-provider tools (AB-6) — behaviour through the stub server.
 *
 * Registration against the real SDK is realSdkRegistration.test.ts's job;
 * this suite drives the handlers: project-scoped targeting, the confirm
 * refusals on the destructive pair, and the service call shapes.
 */

const mockLifecycle = {
    listEventEntities: jest.fn(),
    createEventProvider: jest.fn(),
    createEventRegistration: jest.fn(),
    deleteEventEntities: jest.fn(),
};
jest.mock('@/features/authentication/services/eventProviderLifecycle', () => ({
    listEventEntities: (...a: unknown[]) => mockLifecycle.listEventEntities(...a),
    createEventProvider: (...a: unknown[]) => mockLifecycle.createEventProvider(...a),
    createEventRegistration: (...a: unknown[]) => mockLifecycle.createEventRegistration(...a),
    deleteEventEntities: (...a: unknown[]) => mockLifecycle.deleteEventEntities(...a),
}));

jest.mock('@/features/authentication/handlers/deleteAdobeProjectHandler', () => ({
    createTeardownDeps: jest.fn(() => ({
        getAccessToken: jest.fn(),
        getWorkspaceS2SCredential: jest.fn(),
        createWorkspaceS2SCredentialFor: jest.fn(),
        subscribeManagementApi: jest.fn(),
    })),
}));

import { registerEventProviderTools } from '@/features/ai/server/eventProviderTools';
import type { HandlerContext } from '@/types/handlers';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

const PROJECT_WITH_ADOBE = {
    name: 'bodea',
    adobe: { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-1' },
};

function fakeServer() {
    const tools = new Map<
        string,
        (args: unknown) => Promise<{ content: Array<{ text: string }> }>
    >();
    return {
        registerTool(
            name: string,
            _def: unknown,
            handler: (args: unknown) => Promise<{ content: Array<{ text: string }> }>
        ) {
            tools.set(name, handler);
        },
        async call(name: string, args?: unknown): Promise<string> {
            const result = await tools.get(name)!(args);
            return result.content[0].text;
        },
        tools,
    };
}

function makeCtx(project: unknown, authenticated = true): () => HandlerContext {
    return () =>
        ({
            stateManager: { getCurrentProject: jest.fn(async () => project) },
            authManager: { isAuthenticated: jest.fn(async () => authenticated) },
        }) as unknown as HandlerContext;
}

const authService = () => createMockAuthenticationService();

describe('registerEventProviderTools', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('registers the five lifecycle tools', () => {
        const server = fakeServer();
        registerEventProviderTools(server, makeCtx(PROJECT_WITH_ADOBE), authService);
        expect([...server.tools.keys()].sort()).toEqual([
            'create_event_provider',
            'create_event_registration',
            'delete_event_provider',
            'delete_event_registration',
            'list_event_providers',
        ]);
    });

    it('answers the missing-Console-context case as data, for every tool', async () => {
        const server = fakeServer();
        registerEventProviderTools(server, makeCtx({ name: 'bare', adobe: {} }), authService);

        const text = await server.call('list_event_providers', {});
        expect(text).toContain('no Adobe Console context');
        expect(mockLifecycle.listEventEntities).not.toHaveBeenCalled();
    });

    it('list targets the PROJECT workspace, not any selection chain', async () => {
        mockLifecycle.listEventEntities.mockResolvedValue({ providers: [], registrations: [] });
        const server = fakeServer();
        registerEventProviderTools(server, makeCtx(PROJECT_WITH_ADOBE), authService);

        await server.call('list_event_providers', {});

        expect(mockLifecycle.listEventEntities).toHaveBeenCalledWith(expect.anything(), {
            orgId: 'org-1',
            projectId: 'proj-1',
            workspaceId: 'ws-1',
        });
    });

    it.each(['delete_event_provider', 'delete_event_registration'])(
        '%s refuses without confirm:true and calls nothing',
        async (tool) => {
            const server = fakeServer();
            registerEventProviderTools(server, makeCtx(PROJECT_WITH_ADOBE), authService);

            const text = await server.call(tool, { providerId: 'p', registrationId: 'r' });

            expect(text).toBe(`${tool} requires confirm:true to proceed.`);
            expect(mockLifecycle.deleteEventEntities).not.toHaveBeenCalled();
        }
    );

    it('delete_event_provider deletes the named registrations first (order lives in the service; the ARGUMENT shape is pinned here)', async () => {
        mockLifecycle.deleteEventEntities.mockResolvedValue([]);
        const server = fakeServer();
        registerEventProviderTools(server, makeCtx(PROJECT_WITH_ADOBE), authService);

        await server.call('delete_event_provider', {
            providerId: 'prov-1',
            registrationIds: ['reg-1', 'reg-2'],
            confirm: true,
        });

        expect(mockLifecycle.deleteEventEntities).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            { registrationIds: ['reg-1', 'reg-2'], providerId: 'prov-1' }
        );
    });

    it('create_event_provider passes the declared events through and reports created', async () => {
        mockLifecycle.createEventProvider.mockResolvedValue({
            providerId: 'prov-9',
            created: true,
        });
        const server = fakeServer();
        registerEventProviderTools(server, makeCtx(PROJECT_WITH_ADOBE), authService);

        const text = await server.call('create_event_provider', {
            providerKey: 'erp',
            label: 'ERP events',
            events: [{ event_code: 'com.erp.order', label: 'Order', description: 'd' }],
        });

        expect(JSON.parse(text)).toMatchObject({ providerId: 'prov-9', created: true });
        expect(mockLifecycle.createEventProvider).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({
                providerKey: 'erp',
                events: [{ event_code: 'com.erp.order', label: 'Order', description: 'd' }],
            })
        );
    });

    it('answers signed-out as a needsAuth handoff, never a throw', async () => {
        const server = fakeServer();
        registerEventProviderTools(server, makeCtx(PROJECT_WITH_ADOBE, false), authService);

        const text = await server.call('create_event_registration', {
            name: 'n',
            events: [{ provider_id: 'p', event_code: 'e' }],
        });

        expect(text).toContain('Adobe sign-in required');
        expect(mockLifecycle.createEventRegistration).not.toHaveBeenCalled();
    });
});
