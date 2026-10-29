/**
 * AdobeConsoleProjectOps — create, rename and delete a Console project.
 *
 * Driven directly over a fake Console client, with the two jobs it does not own
 * handed in: listing a project's workspaces and giving one workspace its Runtime
 * namespace. Every Console call is asserted by its ARGUMENTS — a mock answers
 * the same whatever it is handed, so the outcome alone cannot see a wrong org,
 * project or payload.
 */

import { AdobeConsoleProjectOps } from '@/features/authentication/services/adobeConsoleProjectOps';
import type { AdobeOrg, AdobeProject, AdobeWorkspace } from '@/features/authentication/services/types';
import { createMockAuthCacheManager, createMockSDKClient } from '../../../helpers/adobeAuthUnitsFake';

const CACHED_ORG: AdobeOrg = { id: 'org-cached', code: 'CACHED@AdobeOrg', name: 'Cached Org' };
const PROJECT: AdobeProject = { id: 'proj-cached', name: 'Cached', title: 'Cached' };
const WS_PROD: AdobeWorkspace = { id: 'ws-prod', name: 'Production', title: 'Production' };
const WS_NO_ID: AdobeWorkspace = { id: '', name: 'Nameless', title: 'Nameless' };

interface Harness {
    ops: AdobeConsoleProjectOps;
    client: Record<string, jest.Mock>;
    sdk: ReturnType<typeof createMockSDKClient>;
    listWorkspaces: jest.Mock<Promise<AdobeWorkspace[]>, [string, string]>;
    ensureRuntimeNamespace: jest.Mock<Promise<void>, [string, string, string]>;
}

/**
 * @param client - the Console client methods the test drives
 * @param opts - SDK readiness and the cached org
 * @returns the ops under test and every fake it was built over
 */
function build(
    client: Record<string, jest.Mock>,
    opts: { initialized?: boolean; cachedOrg?: AdobeOrg } = {},
): Harness {
    const sdk = createMockSDKClient();
    sdk.isInitialized = jest.fn().mockReturnValue(opts.initialized ?? true);
    sdk.getClient = jest.fn().mockReturnValue(client);
    const cache = createMockAuthCacheManager({
        getCachedOrganization: jest.fn().mockReturnValue(opts.cachedOrg),
        getCachedProject: jest.fn().mockReturnValue(PROJECT),
    });
    const listWorkspaces = jest.fn<Promise<AdobeWorkspace[]>, [string, string]>()
        .mockResolvedValue([WS_PROD]);
    const ensureRuntimeNamespace = jest.fn<Promise<void>, [string, string, string]>()
        .mockResolvedValue(undefined);
    const ops = new AdobeConsoleProjectOps(sdk, cache, listWorkspaces, ensureRuntimeNamespace);
    return { ops, client, sdk, listWorkspaces, ensureRuntimeNamespace };
}

describe('AdobeConsoleProjectOps.createProject', () => {
    it('sends the org, a letters-and-digits name and the title — never who_created', async () => {
        const createFireflyProject = jest.fn().mockResolvedValue({ body: { projectId: 'p-new' } });
        const h = build({ createFireflyProject }, { cachedOrg: CACHED_ORG });

        const result = await h.ops.createProject('My Demo!', 'A demo');

        expect(createFireflyProject).toHaveBeenCalledTimes(1);
        const [orgId, details] = createFireflyProject.mock.calls[0];
        expect(orgId).toBe('org-cached');
        expect(details).toStrictEqual({
            name: expect.stringMatching(/^MyDemo[A-Za-z0-9]+$/),
            title: 'My Demo',
            description: 'A demo',
        });
        expect(result).toStrictEqual({
            id: 'p-new',
            name: details.name,
            title: 'My Demo',
            description: 'A demo',
            org_id: 'org-cached',
        });
    });

    it('creates in the org it is TOLD, not the one the UI cached', async () => {
        const createFireflyProject = jest.fn().mockResolvedValue({ body: { id: 'p-new' } });
        const h = build({ createFireflyProject }, { cachedOrg: CACHED_ORG });

        await h.ops.createProject('Demo', '', { orgId: 'org-agent' });

        expect(createFireflyProject.mock.calls[0][0]).toBe('org-agent');
    });

    it('leaves out an empty description from what it answers', async () => {
        const createFireflyProject = jest.fn().mockResolvedValue({ body: { id: 'p-new' } });
        const h = build({ createFireflyProject }, { cachedOrg: CACHED_ORG });

        const result = await h.ops.createProject('Demo', '');

        expect(result).toHaveProperty('description', undefined);
    });

    it('initialises the SDK before it reads the org', async () => {
        const createFireflyProject = jest.fn().mockResolvedValue({ body: { id: 'p-new' } });
        const h = build({ createFireflyProject }, { initialized: false, cachedOrg: CACHED_ORG });

        await h.ops.createProject('Demo', '');

        expect(h.sdk.ensureInitialized).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['an empty title', '', 'd', 'Project title must be 1–200 characters.'],
        ['a 201-character title', 'x'.repeat(201), 'd', 'Project title must be 1–200 characters.'],
        [
            'a 501-character description',
            'Demo',
            'd'.repeat(501),
            'Project description must be at most 500 characters.',
        ],
    ])('refuses %s without calling Console', async (_label, title, description, error) => {
        const createFireflyProject = jest.fn();
        const h = build({ createFireflyProject }, { cachedOrg: CACHED_ORG });

        expect(await h.ops.createProject(title, description)).toStrictEqual({ error });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('accepts a title of exactly 200 and a description of exactly 500', async () => {
        const createFireflyProject = jest.fn().mockResolvedValue({ body: { id: 'p-new' } });
        const h = build({ createFireflyProject }, { cachedOrg: CACHED_ORG });

        const result = await h.ops.createProject('x'.repeat(200), 'd'.repeat(500));

        expect(result).toHaveProperty('id', 'p-new');
    });

    it('says no organization is selected when neither a target nor the cache has one', async () => {
        const createFireflyProject = jest.fn();
        const h = build({ createFireflyProject });

        expect(await h.ops.createProject('Demo', '')).toStrictEqual({
            error: 'No organization selected.',
        });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('says to sign in when the SDK is still not ready', async () => {
        const createFireflyProject = jest.fn();
        const h = build({ createFireflyProject }, { initialized: false, cachedOrg: CACHED_ORG });

        expect(await h.ops.createProject('Demo', '')).toStrictEqual({
            error: 'Console SDK is not available — sign in to Adobe first.',
        });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it.each([
        ['an empty body', { body: {} }],
        ['no body at all', {}],
    ])('fails when Console accepts the create but returns %s', async (_label, response) => {
        const createFireflyProject = jest.fn().mockResolvedValue(response);
        const h = build({ createFireflyProject }, { cachedOrg: CACHED_ORG });

        expect(await h.ops.createProject('Demo', '')).toStrictEqual({
            error: 'Console accepted the create but returned no project id.',
        });
        expect(h.ensureRuntimeNamespace).not.toHaveBeenCalled();
    });

    it.each([
        ['409', 'HTTP 409'],
        ['Conflict', 'Conflict: duplicate'],
    ])('names a taken project name (%s)', async (_label, message) => {
        const createFireflyProject = jest.fn().mockRejectedValue(new Error(message));
        const h = build({ createFireflyProject }, { cachedOrg: CACHED_ORG });

        expect(await h.ops.createProject('Demo', '')).toStrictEqual({
            error: 'A project with this name already exists in the org (409).',
        });
    });

    it("passes Console's own reason through", async () => {
        const reason = 'Project name length must be less than 20';
        const createFireflyProject = jest.fn().mockRejectedValue(new Error(reason));
        const h = build({ createFireflyProject }, { cachedOrg: CACHED_ORG });

        expect(await h.ops.createProject('Demo', '')).toStrictEqual({ error: reason });
    });

    it('says Console gave no reason when the error has none', async () => {
        const createFireflyProject = jest.fn().mockRejectedValue(new Error(''));
        const h = build({ createFireflyProject }, { cachedOrg: CACHED_ORG });

        expect(await h.ops.createProject('Demo', '')).toStrictEqual({
            error: 'Console rejected the project with no error message.',
        });
    });
});

describe("AdobeConsoleProjectOps.createProject — the new project's Runtime sweep", () => {
    it("lists the new project's workspaces and gives each one with an id a namespace", async () => {
        const createFireflyProject = jest.fn().mockResolvedValue({ body: { id: 'p-new' } });
        const h = build({ createFireflyProject }, { cachedOrg: CACHED_ORG });
        h.listWorkspaces.mockResolvedValue([WS_PROD, WS_NO_ID]);

        await h.ops.createProject('Demo', '');

        expect(h.listWorkspaces).toHaveBeenCalledWith('org-cached', 'p-new');
        expect(h.ensureRuntimeNamespace.mock.calls).toStrictEqual([['org-cached', 'p-new', 'ws-prod']]);
    });

    it('still answers the created project when the listing fails', async () => {
        const createFireflyProject = jest.fn().mockResolvedValue({ body: { id: 'p-new' } });
        const h = build({ createFireflyProject }, { cachedOrg: CACHED_ORG });
        h.listWorkspaces.mockRejectedValue(new Error('list down'));

        const result = await h.ops.createProject('Demo', '');

        expect(result).toHaveProperty('id', 'p-new');
        expect(h.ensureRuntimeNamespace.mock.calls).toStrictEqual([]);
    });
});

describe('AdobeConsoleProjectOps.renameRemoteProject', () => {
    it('PATCHes only the cleaned title, at the ids it was given', async () => {
        const editProject = jest.fn().mockResolvedValue({});
        const h = build({ editProject });

        const result = await h.ops.renameRemoteProject('org-1', 'proj-1', '  New   Title ');

        expect(editProject.mock.calls).toStrictEqual([['org-1', 'proj-1', { title: 'New Title' }]]);
        expect(result).toStrictEqual({ ok: true });
    });

    it('refuses without calling Console when the SDK is not ready', async () => {
        const editProject = jest.fn();
        const h = build({ editProject }, { initialized: false });

        expect(await h.ops.renameRemoteProject('org-1', 'proj-1', 'T')).toStrictEqual({
            ok: false,
            error: 'The Adobe Console SDK is not available.',
        });
        expect(editProject).not.toHaveBeenCalled();
    });

    it("answers Adobe's own words when it refuses", async () => {
        const editProject = jest.fn().mockRejectedValue(new Error('403 Forbidden'));
        const h = build({ editProject });

        expect(await h.ops.renameRemoteProject('org-1', 'proj-1', 'T')).toStrictEqual({
            ok: false,
            error: '403 Forbidden',
        });
    });

    it('answers a thrown non-Error as text', async () => {
        const editProject = jest.fn().mockRejectedValue('socket hang up');
        const h = build({ editProject });

        expect(await h.ops.renameRemoteProject('org-1', 'proj-1', 'T')).toStrictEqual({
            ok: false,
            error: 'socket hang up',
        });
    });
});

describe('AdobeConsoleProjectOps.deleteConsoleProject', () => {
    it('deletes exactly the project it was given', async () => {
        const deleteProject = jest.fn().mockResolvedValue({});
        const h = build({ deleteProject });

        await h.ops.deleteConsoleProject('org-1', 'proj-1');

        expect(deleteProject.mock.calls).toStrictEqual([['org-1', 'proj-1']]);
    });

    it('initialises the SDK first', async () => {
        const deleteProject = jest.fn().mockResolvedValue({});
        const h = build({ deleteProject }, { initialized: false });

        await expect(h.ops.deleteConsoleProject('org-1', 'proj-1')).rejects.toThrow(
            'deleteConsoleProject: Adobe Console SDK is not initialized',
        );
        expect(h.sdk.ensureInitialized).toHaveBeenCalledTimes(1);
        expect(deleteProject).not.toHaveBeenCalled();
    });

    it.each([
        ['org', '', 'proj-1'],
        ['project', 'org-1', ''],
    ])('throws without calling Console when the %s id is missing', async (_label, org, proj) => {
        const deleteProject = jest.fn();
        const h = build({ deleteProject });

        await expect(h.ops.deleteConsoleProject(org, proj)).rejects.toThrow(
            'deleteConsoleProject: orgId and projectId are required',
        );
        expect(deleteProject).not.toHaveBeenCalled();
    });

    it("lets Console's error through unchanged, for the teardown to map", async () => {
        const refusal = new Error('ERR_MSG_PROJECT_DELETE_FORBIDDEN');
        const deleteProject = jest.fn().mockRejectedValue(refusal);
        const h = build({ deleteProject });

        await expect(h.ops.deleteConsoleProject('org-1', 'proj-1')).rejects.toBe(refusal);
    });
});
