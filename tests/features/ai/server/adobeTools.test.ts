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
import { AuthError } from '@/core/errors';
import type { HandlerContext } from '@/types/handlers';
import { expectWithinCeiling } from './responseCeilings';

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


/**
 * A token the REAL `decodeImsUserId` accepts — header.payload.signature with a
 * base64url payload carrying `user_id`. Built rather than mocked so the
 * ownership path under test is the production one.
 */
function tokenFor(userId: string): string {
    const payload = Buffer.from(JSON.stringify({ user_id: userId }), 'utf8').toString('base64url');
    return `hdr.${payload}.sig`;
}

/** Auth stub whose token names `userId`; omit for the no-token (fail-closed) case. */
function withToken(userId?: string) {
    return {
        getTokenManager: () => ({
            inspectToken: async () => ({ valid: Boolean(userId), expiresIn: 3600, token: userId ? tokenFor(userId) : undefined }),
        }),
    };
}

function makeAuth(overrides: Record<string, unknown> = {}) {
    return {
        isAuthenticated: jest.fn(async () => true),
        getOrganizations: jest.fn(async () => [
            { id: 'org-1', code: 'C1@AdobeOrg', name: 'Org One' },
            { id: 'org-2', code: 'C2@AdobeOrg', name: 'Org Two' },
        ]),
        getProjects: jest.fn(async () => [
            { id: 'proj-1', name: 'Proj One', title: 'P1', who_created: 'ABC123@AdobeID.e' },
        ]),
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

    /**
     * An agent must be able to tell WHY a project offers no delete affordance —
     * that question came from a real user with two projects they had created and
     * could not delete, and nothing (picker, diagnostic, agent) could answer it.
     *
     * The first fix shipped the raw `who_created` to the agent. Measured live
     * 2026-08-16 that was wrong twice over: a real org returns 725 projects /
     * 111,748 bytes and `who_created` was 46% of it — 35KB of other people's
     * technical-account addresses — and the agent could not act on it anyway,
     * because the comparison is against the token's `user_id` claim, which only
     * the extension can read.
     *
     * So the row now carries the ANSWER. Same question served, ~40x cheaper, and
     * no third-party account ids in the transcript.
     */
    it('reports deletable=true for a project the signed-in user created', async () => {
        const server = fakeServer();
        registerAdobeTools(
            server,
            ctxFactoryWith(makeAuth(withToken('ABC123@AdobeID.e'))),
        );

        const res = await server.call('list_adobe_projects');

        expect(res.items).toEqual([
            { id: 'proj-1', name: 'Proj One', title: 'P1', deletable: true },
        ]);
        // The creator id itself must NOT travel.
        expect(JSON.stringify(res)).not.toContain('@AdobeID');
    });

    it('reports deletable=false when another user created the project', async () => {
        const auth = makeAuth({
            getProjects: jest.fn(async () => [
                { id: 'p', name: 'N', title: 'T', who_created: 'SOMEONE-ELSE@AdobeID.e' },
            ]),
            ...withToken('ABC123@AdobeID.e'),
        });
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));

        const res = await server.call('list_adobe_projects');

        expect(res.items[0]).toEqual({ id: 'p', name: 'N', title: 'T', deletable: false });
    });

    // Fail closed: `isProjectOwnedBy` treats a missing creator as NOT owned, and
    // the agent-facing answer has to inherit that rather than blur it.
    it('reports deletable=false when the Console recorded no creator', async () => {
        const auth = makeAuth({
            getProjects: jest.fn(async () => [{ id: 'p', name: 'N', title: 'T' }]),
        });
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));

        expect((await server.call('list_adobe_projects')).items[0].deletable).toBe(false);
    });

    // 725 projects in one response is not a list an agent reads; it is one it
    // must search.
    it('pages by default and reports the true total', async () => {
        const many = Array.from({ length: 50 }, (_, i) => ({
            id: `id-${i}`,
            name: `name-${i}`,
            title: `Title ${i}`,
        }));
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(makeAuth({ getProjects: jest.fn(async () => many) })));

        const res = await server.call('list_adobe_projects', {});

        expect(res.count).toBe(20);
        expect(res.total).toBe(50);
        expect(res.items).toHaveLength(20);
    });

    it('honours skip for paging', async () => {
        const many = Array.from({ length: 50 }, (_, i) => ({ id: `id-${i}`, name: `n-${i}` }));
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(makeAuth({ getProjects: jest.fn(async () => many) })));

        const res = await server.call('list_adobe_projects', { limit: 5, skip: 10 });

        expect(res.items.map((p: { id: string }) => p.id)).toEqual([
            'id-10', 'id-11', 'id-12', 'id-13', 'id-14',
        ]);
        expect(res.total).toBe(50);
    });

    it('searches by name, title or id and reports the unfiltered total', async () => {
        const projects = [
            { id: 'aaa', name: 'alpha', title: 'Alpha One' },
            { id: 'bbb', name: 'beta', title: 'Beta Two' },
            { id: 'ccc', name: 'gamma', title: 'Alpha Three' },
        ];
        const server = fakeServer();
        registerAdobeTools(
            server,
            ctxFactoryWith(makeAuth({ getProjects: jest.fn(async () => projects) })),
        );

        const res = await server.call('list_adobe_projects', { search: 'alpha' });

        expect(res.items.map((p: { id: string }) => p.id)).toEqual(['aaa', 'ccc']);
        expect(res.total).toBe(2);
        expect(res.totalUnfiltered).toBe(3);
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
        const arg = (auth.getProjects.mock.calls[0] as unknown[] | undefined)?.[0];
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

    it('list_workspaces answers a diagnosis, not a bare 404, when the selected project is gone', async () => {
        // Watched live 2026-08-27: the persisted Console project had been
        // deleted, getWorkspaces threw a raw 404, and the agent had to diagnose
        // the stale pointer itself with the aio CLI. The tool now names the
        // situation and the way out (list_adobe_projects → select_project).
        const auth = makeAuth({
            getWorkspaces: jest.fn(async () => {
                throw new Error('404 - Project not found');
            }),
        });
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        setAdobeTarget({ orgId: 'org-1', projectId: 'proj-gone', projectName: 'Kukla Mesh Test' });

        const out = await server.call('list_workspaces');

        expect(String(out.error)).toMatch(/not found.*deleted/i);
        expect(out.selected).toBe('Kukla Mesh Test');
        expect(String(out.recovery)).toMatch(/list_adobe_projects/);
    });

    it('list_workspaces still throws a NON-404 error unchanged', async () => {
        // Only the stale-pointer case gets the friendly answer. A 500 or a
        // network failure must keep failing loudly — rewriting every error into
        // prose is how failures start scoring as answers.
        const auth = makeAuth({
            getWorkspaces: jest.fn(async () => {
                throw new Error('503 upstream unavailable');
            }),
        });
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));

        await expect(server.call('list_workspaces')).rejects.toThrow(/503/);
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

// ─── response-size ceilings (phase 2 audit) ──────────────────────────────────
//
// list_adobe_projects is the reason this whole audit widened: a real org
// returned 725 projects / 111,748 bytes, 46% of it creator ids the agent could
// not act on. Driven here with 800 projects so the paging, not the fixture, is
// what keeps it small.
describe('response-size ceilings', () => {
    const many = Array.from({ length: 800 }, (_, i) => ({
        id: `456620608834451${i}`,
        name: `ProjectName${i}`,
        title: `Demo System Project Number ${i}`,
        who_created: `DBDD297D5EA98C090A495FA${i}@techacct.adobe.com`,
    }));

    it('list_adobe_projects — 800 projects', async () => {
        const s = fakeServer();
        registerAdobeTools(s, ctxFactoryWith(makeAuth({ getProjects: jest.fn(async () => many) })));

        const out = JSON.stringify(await s.call('list_adobe_projects', {}));

        expectWithinCeiling('list_adobe_projects', out);
        // The creator ids must not ride along at any scale.
        expect(out).not.toContain('@techacct');
    });

    it('select_project — a bad id reports a count, never the catalog', async () => {
        const s = fakeServer();
        registerAdobeTools(s, ctxFactoryWith(makeAuth({ getProjects: jest.fn(async () => many) })));
        setAdobeTarget({ orgId: 'org-1', orgCode: 'C@AdobeOrg', orgName: 'Org' });

        const out = JSON.stringify(await s.call('select_project', { projectId: 'nope' }));

        expectWithinCeiling('select_project', out);
        expect(out).not.toContain('ProjectName1');
    });

    it.each(['list_orgs', 'list_workspaces'])('%s stays within its ceiling', async (tool) => {
        const s = fakeServer();
        registerAdobeTools(s, ctxFactoryWith(makeAuth()));
        expectWithinCeiling(tool, JSON.stringify(await s.call(tool)));
    });
});
