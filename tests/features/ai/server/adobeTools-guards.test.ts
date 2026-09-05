/**
 * The decisions the Adobe tools make before and after they reach Console — the
 * auth pre-flight on every tool, the search matcher, the stale-target diagnosis,
 * and the validate-then-refuse path of each `select_*`.
 *
 * Split from `adobeTools.test.ts`, which covers the happy paths and the response
 * ceilings. Assertions here are on the ARGUMENTS a collaborator receives and on
 * the refusal returned, not on a stub's answer.
 */

import { registerAdobeTools } from '@/features/ai/server/adobeTools';
import { clearAdobeTarget, setAdobeTarget } from '@/features/ai/server/adobeTargetStore';

import { ctxFactoryWith, fakeServer, makeAuth } from './adobeTools.testUtils';

/** Args that satisfy each tool's schema, so only the guard can refuse the call. */
const CALLS: Array<[string, Record<string, unknown>]> = [
    ['list_orgs', {}],
    ['list_adobe_projects', {}],
    ['list_workspaces', {}],
    ['select_org', { orgId: 'org-1' }],
    ['select_project', { projectId: 'proj-1' }],
    ['select_workspace', { workspaceId: 'ws-1' }],
];

describe('Adobe tools — auth pre-flight', () => {
    beforeEach(() => clearAdobeTarget());

    // A signed-out session must reach the handoff on EVERY tool, not just the
    // first one anybody tested: without the guard the null auth service is
    // dereferenced and the agent gets a TypeError instead of "call sign_in".
    it.each(CALLS)('%s hands back the sign-in handoff when not authenticated', async (name, args) => {
        const auth = makeAuth({ isAuthenticated: jest.fn(async () => false) });
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        // A stored target must not tempt the tool past the guard.
        setAdobeTarget({ orgId: 'org-1', projectId: 'proj-1' });

        expect(await server.call(name, args)).toMatchObject({ needsAuth: 'adobe' });
        expect(auth.getOrganizations).not.toHaveBeenCalled();
        expect(auth.getProjects).not.toHaveBeenCalled();
        expect(auth.getWorkspaces).not.toHaveBeenCalled();
    });

    // Headless contexts can be built without an auth service at all. That is the
    // same answer as signed-out, not a crash.
    it.each(CALLS)('%s hands back the sign-in handoff when the context has no auth service', async (name, args) => {
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(undefined));

        expect(await server.call(name, args)).toMatchObject({ needsAuth: 'adobe' });
    });
});

describe('list_adobe_projects — search matching', () => {
    beforeEach(() => clearAdobeTarget());

    const projects = [
        { id: 'aaa', name: 'alpha', title: 'First' },
        { id: 'zulu-id', name: 'beta', title: 'Second' },
        { id: 'ccc', name: 'gamma', title: 'Alpha Three' },
    ];

    function serverOver(rows: Array<Record<string, unknown>> = projects) {
        const server = fakeServer();
        registerAdobeTools(
            server,
            ctxFactoryWith(makeAuth({ getProjects: jest.fn(async () => rows) })),
        );
        return server;
    }

    // Case folding has to happen on BOTH sides. Each of these matches on exactly
    // one field, so a matcher that folds the term but not the row fails here and
    // nowhere else.
    it('matches a name case-insensitively', async () => {
        const res = await serverOver().call('list_adobe_projects', { search: 'ALPHA' });
        expect(res.items.map((p: { id: string }) => p.id)).toEqual(['aaa', 'ccc']);
    });

    it('matches an id case-insensitively', async () => {
        const res = await serverOver().call('list_adobe_projects', { search: 'ZULU' });
        expect(res.items.map((p: { id: string }) => p.id)).toEqual(['zulu-id']);
    });

    it('matches a title case-insensitively when the row has one', async () => {
        const res = await serverOver().call('list_adobe_projects', { search: 'SECOND' });
        expect(res.items.map((p: { id: string }) => p.id)).toEqual(['zulu-id']);
    });

    // A row with no title must not throw and must not match on the missing field.
    it('tolerates a row with no title', async () => {
        const res = await serverOver([{ id: 'no-title', name: 'solo' }]).call(
            'list_adobe_projects',
            { search: 'solo' },
        );
        expect(res.items.map((p: { id: string }) => p.id)).toEqual(['no-title']);
    });

    // Agents paste search terms with stray whitespace; an untrimmed term matches
    // nothing and the failure looks like "the project does not exist".
    it('trims the search term before matching', async () => {
        const res = await serverOver().call('list_adobe_projects', { search: '  alpha  ' });
        expect(res.items.map((p: { id: string }) => p.id)).toEqual(['aaa', 'ccc']);
        expect(res.search).toBe('alpha');
    });
});

describe('list_workspaces — stale target diagnosis', () => {
    beforeEach(() => clearAdobeTarget());

    function serverThrowing(message: string) {
        const server = fakeServer();
        registerAdobeTools(
            server,
            ctxFactoryWith(
                makeAuth({
                    getWorkspaces: jest.fn(async () => {
                        throw new Error(message);
                    }),
                }),
            ),
        );
        return server;
    }

    // Adobe's 404 prose is not one string. "not found", "not-found" and
    // "notfound" are all the same dead end and all must reach the diagnosis.
    it.each(['404 - Project not found', 'Project not-found', 'notfound'])(
        'diagnoses %p as the deleted-project case',
        async (message) => {
            setAdobeTarget({ orgId: 'org-1', projectId: 'proj-gone', projectName: 'Gone' });
            const res = await serverThrowing(message).call('list_workspaces');
            expect(String(res.error)).toMatch(/deleted/i);
        },
    );

    it('names the stored project id when no display name was recorded', async () => {
        setAdobeTarget({ orgId: 'org-1', projectId: 'proj-gone' });
        const res = await serverThrowing('404 not found').call('list_workspaces');
        expect(res.selected).toBe('proj-gone');
    });

    // Nothing stored at all: the diagnosis must still answer, not dereference
    // an absent target.
    it('says so plainly when nothing was ever selected', async () => {
        const res = await serverThrowing('404 not found').call('list_workspaces');
        expect(res.selected).toBe('(none recorded)');
    });
});

describe('select_project — validation within the stored org', () => {
    beforeEach(() => clearAdobeTarget());

    it('scopes the lookup to the stored org rather than the ambient one', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        setAdobeTarget({ orgId: 'org-2', orgCode: 'C2@AdobeOrg', orgName: 'Org Two' });

        await server.call('select_project', { projectId: 'proj-1' });

        expect(auth.getProjects).toHaveBeenCalledWith({ orgId: 'org-2' });
    });

    // An id that matches nothing must refuse. The count is the whole answer —
    // enumerating the org here cost 111,748 bytes in a real one.
    it('refuses an unknown id with a count, not a selection', async () => {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        setAdobeTarget({ orgId: 'org-1', orgCode: 'C1@AdobeOrg', orgName: 'Org One' });

        const res = await server.call('select_project', { projectId: 'not-a-project' });

        expect(String(res.error)).toMatch(/Unknown projectId: not-a-project/);
        expect(res.projectsInOrg).toBe(1);
        expect(res.selected).toBeUndefined();
    });
});

describe('select_workspace — validation within the stored project', () => {
    beforeEach(() => clearAdobeTarget());

    function serverWith() {
        const auth = makeAuth();
        const server = fakeServer();
        registerAdobeTools(server, ctxFactoryWith(auth));
        return server;
    }

    // Nothing selected at all is the same refusal as an org-only target — the
    // guard has to read through an absent store, not assume one.
    it('refuses when nothing has been selected into the store', async () => {
        const res = await serverWith().call('select_workspace', { workspaceId: 'ws-1' });
        expect(String(res.error)).toMatch(/select_project first/);
    });

    it('refuses an unknown id and returns the workspaces that do exist', async () => {
        setAdobeTarget({ orgId: 'org-1', projectId: 'proj-1', projectName: 'Proj One' });

        const res = await serverWith().call('select_workspace', { workspaceId: 'nope' });

        expect(String(res.error)).toMatch(/Unknown workspaceId: nope/);
        expect(res.validOptions).toEqual([{ id: 'ws-1', name: 'Stage' }]);
        expect(res.selected).toBeUndefined();
    });
});
