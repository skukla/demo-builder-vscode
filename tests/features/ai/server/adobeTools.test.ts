/**
 * Adobe tools tests — list + validated select, with auth pre-flight and the
 * validate-and-return-options behavior. The auth service is a stub.
 */

import { registerAdobeTools } from '@/features/ai/server/adobeTools';
import type { HandlerContext } from '@/types/handlers';

function fakeServer() {
     
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {
         
        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },
         
        async call(name: string, args?: unknown): Promise<any> {
            return JSON.parse((await tools.get(name)!(args)).content[0].text);
        },
        tools,
    };
}

function makeAuth(overrides: Record<string, unknown> = {}) {
    return {
        isAuthenticated: jest.fn(async () => true),
        getOrganizations: jest.fn(async () => [{ id: 'org-1', name: 'Org One' }, { id: 'org-2', name: 'Org Two' }]),
        getProjects: jest.fn(async () => [{ id: 'proj-1', name: 'Proj One', title: 'P1' }]),
        getWorkspaces: jest.fn(async () => [{ id: 'ws-1', name: 'Stage' }]),
        getCurrentOrganization: jest.fn(async () => ({ id: 'org-1', name: 'Org One' })),
        getCurrentProject: jest.fn(async () => ({ id: 'proj-1', name: 'Proj One' })),
        selectOrganization: jest.fn(async () => true),
        selectProject: jest.fn(async () => true),
        selectWorkspace: jest.fn(async () => true),
        ...overrides,
    };
}

function ctxFactoryWith(auth: unknown): () => HandlerContext {
    return () => ({ authManager: auth }) as unknown as HandlerContext;
}

describe('registerAdobeTools', () => {
    it('list_orgs returns lean orgs when authenticated', async () => {
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(makeAuth()));
        expect(await server.call('list_orgs')).toEqual([
            { id: 'org-1', name: 'Org One' },
            { id: 'org-2', name: 'Org Two' },
        ]);
    });

    it('returns a needsAuth handoff when not authenticated', async () => {
        const auth = makeAuth({ isAuthenticated: jest.fn(async () => false) });
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        expect(await server.call('list_orgs')).toMatchObject({ needsAuth: 'adobe' });
        expect(auth.getOrganizations).not.toHaveBeenCalled();
    });

    it('select_org validates the id and selects it', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        const res = await server.call('select_org', { orgId: 'org-2' });
        expect(auth.selectOrganization).toHaveBeenCalledWith('org-2');
        expect(res).toEqual({ selected: { org: 'org-2' }, success: true });
    });

    it('select_org rejects an unknown id and returns the valid options', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        const res = await server.call('select_org', { orgId: 'nope' });
        expect(auth.selectOrganization).not.toHaveBeenCalled();
        expect(res.error).toMatch(/Unknown orgId/);
        expect(res.validOptions.map((o: { id: string }) => o.id)).toEqual(['org-1', 'org-2']);
    });

    it('select_project uses the current org and selects within it', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        const res = await server.call('select_project', { projectId: 'proj-1' });
        expect(auth.selectProject).toHaveBeenCalledWith('proj-1', 'org-1');
        expect(res).toEqual({ selected: { org: 'org-1', project: 'proj-1' }, success: true });
    });

    it('select_workspace uses the current project and selects within it', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        const res = await server.call('select_workspace', { workspaceId: 'ws-1' });
        expect(auth.selectWorkspace).toHaveBeenCalledWith('ws-1', 'proj-1');
        expect(res).toEqual({ selected: { project: 'proj-1', workspace: 'ws-1' }, success: true });
    });

    it('select_project errors clearly when no org is selected', async () => {
        const auth = makeAuth({ getCurrentOrganization: jest.fn(async () => undefined) });
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        const res = await server.call('select_project', { projectId: 'proj-1' });
        expect(res.error).toMatch(/select_org first/);
        expect(auth.selectProject).not.toHaveBeenCalled();
    });
});
