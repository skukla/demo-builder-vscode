/**
 * Adobe tools tests — list + validated select, with auth pre-flight and the
 * validate-and-return-options behavior. The auth service is a stub.
 */

import {
    isOrgMismatchError,
    orgMismatchResult,
    registerAdobeTools,
} from '@/features/ai/server/adobeTools';
import {
    clearAdobeTarget,
    getAdobeTarget,
    setAdobeTarget,
} from '@/features/ai/server/adobeTargetStore';
import { getActiveOrgContext } from '@/core/shell';
import { ErrorCode } from '@/types/errorCodes';
import { AuthError } from '@/types/errors';
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
        getOrganizations: jest.fn(async () => [
            { id: 'org-1', code: 'C1@AdobeOrg', name: 'Org One' },
            { id: 'org-2', code: 'C2@AdobeOrg', name: 'Org Two' },
        ]),
        getProjects: jest.fn(async () => [{ id: 'proj-1', name: 'Proj One', title: 'P1' }]),
        getWorkspaces: jest.fn(async () => [{ id: 'ws-1', name: 'Stage' }]),
        getCurrentOrganization: jest.fn(async () => ({ id: 'org-1', name: 'Org One' })),
        getCurrentProject: jest.fn(async () => ({ id: 'proj-1', name: 'Proj One' })),
        ...overrides,
    };
}

function ctxFactoryWith(auth: unknown): () => HandlerContext {
    return () => ({ authManager: auth }) as unknown as HandlerContext;
}

describe('registerAdobeTools', () => {
    beforeEach(() => {
        clearAdobeTarget();
    });

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

    it('select_org validates the id and stores the target WITHOUT mutating the global', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        const res = await server.call('select_org', { orgId: 'org-2' });
        // persists the full {id, code, name} to the session store (no global mutation)
        expect(getAdobeTarget()).toEqual({ orgId: 'org-2', orgCode: 'C2@AdobeOrg', orgName: 'Org Two' });
        expect(res).toMatchObject({ selected: { org: 'org-2' } });
    });

    it('select_org rejects an unknown id and returns the valid options', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        const res = await server.call('select_org', { orgId: 'nope' });
        expect(getAdobeTarget()).toBeUndefined();
        expect(res.error).toMatch(/Unknown orgId/);
        expect(res.validOptions.map((o: { id: string }) => o.id)).toEqual(['org-1', 'org-2']);
    });

    it('select_org switching orgs drops the previously-stored project/workspace', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        setAdobeTarget({ orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-1' });
        await server.call('select_org', { orgId: 'org-2' });
        const stored = getAdobeTarget()!;
        expect(stored.orgId).toBe('org-2');
        expect(stored.projectId).toBeUndefined();
        expect(stored.workspaceId).toBeUndefined();
    });

    it('select_project validates within the stored org and stores the target WITHOUT mutating the global', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        // a prior select_org persisted the org target
        setAdobeTarget({ orgId: 'org-1', orgCode: 'C1@AdobeOrg', orgName: 'Org One' });
        const res = await server.call('select_project', { projectId: 'proj-1' });
        // the org context carries forward; project subkeys are merged in (no global mutation)
        expect(getAdobeTarget()).toMatchObject({
            orgId: 'org-1',
            projectId: 'proj-1',
            projectName: 'Proj One',
        });
        expect(res).toMatchObject({ selected: { org: 'org-1', project: 'proj-1' } });
    });

    it('select_project switching projects drops the previously-stored workspace', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        setAdobeTarget({ orgId: 'org-1', projectId: 'proj-old', workspaceId: 'ws-1' });
        await server.call('select_project', { projectId: 'proj-1' });
        const stored = getAdobeTarget()!;
        expect(stored.projectId).toBe('proj-1');
        expect(stored.workspaceId).toBeUndefined();
    });

    it('select_workspace validates within the stored project and stores the target WITHOUT mutating the global', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        setAdobeTarget({ orgId: 'org-1', projectId: 'proj-1', projectName: 'Proj One' });
        const res = await server.call('select_workspace', { workspaceId: 'ws-1' });
        expect(getAdobeTarget()).toMatchObject({
            orgId: 'org-1',
            projectId: 'proj-1',
            workspaceId: 'ws-1',
            workspaceName: 'Stage',
        });
        expect(res).toMatchObject({ selected: { project: 'proj-1', workspace: 'ws-1' } });
    });

    it('select_project errors clearly when no org has been selected into the store', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        const res = await server.call('select_project', { projectId: 'proj-1' });
        expect(res.error).toMatch(/select_org first/);
        expect(getAdobeTarget()).toBeUndefined();
    });

    it('select_workspace errors clearly when no project has been selected into the store', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        setAdobeTarget({ orgId: 'org-1' });
        const res = await server.call('select_workspace', { workspaceId: 'ws-1' });
        expect(res.error).toMatch(/select_project first/);
    });

    it('list_adobe_projects passes the stored org to getProjects when a target is set', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        setAdobeTarget({ orgId: 'org-2', orgCode: 'C2@AdobeOrg', orgName: 'Org Two' });

        await server.call('list_adobe_projects');

        expect(auth.getProjects).toHaveBeenCalledWith({ orgId: 'org-2' });
    });

    it('list_adobe_projects keeps untargeted behavior when no target is set', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));

        await server.call('list_adobe_projects');

        // No stored target → no org argument (ambient/global behavior preserved).
        const arg = auth.getProjects.mock.calls[0]?.[0];
        expect(arg).toBeUndefined();
    });

    it('list_workspaces runs getWorkspaces under the stored org/project target', async () => {
        let seenContext: unknown;
        const auth = makeAuth({
            getWorkspaces: jest.fn(async () => {
                seenContext = getActiveOrgContext();
                return [{ id: 'ws-1', name: 'Stage' }];
            }),
        });
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        setAdobeTarget({ orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-x' });

        await server.call('list_workspaces');

        expect(seenContext).toMatchObject({ orgId: 'org-1', projectId: 'proj-1' });
    });

    it('list_workspaces keeps untargeted behavior when no target is set', async () => {
        let seenContext: unknown = 'unset';
        const auth = makeAuth({
            getWorkspaces: jest.fn(async () => {
                seenContext = getActiveOrgContext();
                return [{ id: 'ws-1', name: 'Stage' }];
            }),
        });
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));

        await server.call('list_workspaces');

        expect(seenContext).toBeUndefined();
    });

    it('two sequential select_* calls accumulate into one shared stored target', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        await server.call('select_org', { orgId: 'org-1' });
        await server.call('select_project', { projectId: 'proj-1' });
        await server.call('select_workspace', { workspaceId: 'ws-1' });
        expect(getAdobeTarget()).toMatchObject({
            orgId: 'org-1',
            projectId: 'proj-1',
            workspaceId: 'ws-1',
        });
    });
});

describe('orgMismatchResult', () => {
    it('serializes a structured, non-retryable ORG_MISMATCH result via asText', () => {
        const parsed = JSON.parse(orgMismatchResult().content[0].text);
        expect(parsed).toMatchObject({
            error_type: 'ORG_MISMATCH',
            non_retryable: true,
        });
        expect(typeof parsed.action_required).toBe('string');
        expect(parsed.action_required.length).toBeGreaterThan(0);
    });

    it('includes target_org when a target is supplied', () => {
        const parsed = JSON.parse(
            orgMismatchResult({ id: 'org-9', name: 'Target Org' }).content[0].text,
        );
        expect(parsed.target_org).toEqual({ id: 'org-9', name: 'Target Org' });
    });

    it('omits target_org when none is supplied', () => {
        const parsed = JSON.parse(orgMismatchResult().content[0].text);
        expect(parsed.target_org).toBeUndefined();
    });

    it('marks the result non_retryable so agents stop instead of re-403ing', () => {
        const parsed = JSON.parse(orgMismatchResult().content[0].text);
        expect(parsed.non_retryable).toBe(true);
    });
});

describe('isOrgMismatchError', () => {
    it('detects an AuthError carrying ErrorCode.ORG_MISMATCH', () => {
        const err = new AuthError(ErrorCode.ORG_MISMATCH, 'wrong org');
        expect(isOrgMismatchError(err)).toBe(true);
    });

    it('returns false for a different AuthError code', () => {
        const err = new AuthError(ErrorCode.AUTH_EXPIRED, 'expired');
        expect(isOrgMismatchError(err)).toBe(false);
    });

    it('returns false for a plain Error', () => {
        expect(isOrgMismatchError(new Error('boom'))).toBe(false);
    });

    it('returns false for a non-error value', () => {
        expect(isOrgMismatchError('ORG_MISMATCH')).toBe(false);
        expect(isOrgMismatchError(undefined)).toBe(false);
    });
});
