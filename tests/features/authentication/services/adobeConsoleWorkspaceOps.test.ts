/**
 * AdobeConsoleWorkspaceOps — creating a workspace, and giving one its Runtime
 * namespace.
 *
 * The name a workspace is given and what a delete answers have suites of their
 * own (`.createWorkspace-name`, `.deleteWorkspace`). This one holds the rest: the
 * target each Console call is aimed at, the refusals made before Console is
 * called, and the namespace provisioning. Every Console call is asserted by its
 * ARGUMENTS — a mock answers the same whatever it is handed.
 */

import { AdobeConsoleWorkspaceOps } from '@/features/authentication/services/adobeConsoleWorkspaceOps';
import type { AdobeOrg, AdobeProject, AdobeWorkspace } from '@/features/authentication/services/types';
import { createMockAuthCacheManager, createMockSDKClient } from '../../../helpers/adobeAuthUnitsFake';

const CACHED_ORG: AdobeOrg = { id: 'org-cached', code: 'CACHED@AdobeOrg', name: 'Cached Org' };
const CACHED_PROJECT: AdobeProject = { id: 'proj-cached', name: 'Cached', title: 'Cached' };

/**
 * @param client - the Console client methods the test drives
 * @param opts - SDK readiness and what the UI cached
 * @returns the ops under test and the SDK fake it was built over
 */
function build(
    client: Record<string, jest.Mock>,
    opts: { initialized?: boolean; org?: AdobeOrg; project?: AdobeProject } = {},
) {
    const sdk = createMockSDKClient();
    sdk.isInitialized = jest.fn().mockReturnValue(opts.initialized ?? true);
    sdk.getClient = jest.fn().mockReturnValue(client);
    const cache = createMockAuthCacheManager({
        getCachedOrganization: jest.fn().mockReturnValue(opts.org),
        getCachedProject: jest.fn().mockReturnValue(opts.project),
    });
    const listWorkspaces = jest.fn<Promise<AdobeWorkspace[]>, [string, string]>()
        .mockResolvedValue([]);
    return { ops: new AdobeConsoleWorkspaceOps(sdk, cache, listWorkspaces), sdk, listWorkspaces };
}

describe('AdobeConsoleWorkspaceOps.ensureWorkspaceRuntimeNamespace', () => {
    it('provisions Runtime on exactly the workspace it was given', async () => {
        const createRuntimeNamespace = jest.fn().mockResolvedValue({ body: {} });
        const { ops } = build({ createRuntimeNamespace });

        await ops.ensureWorkspaceRuntimeNamespace('org-1', 'proj-1', 'ws-1');

        expect(createRuntimeNamespace.mock.calls).toStrictEqual([['org-1', 'proj-1', 'ws-1']]);
    });

    it.each(['409', 'Conflict', 'namespace already exists', 'ALREADYEXISTS'])(
        'treats "%s" as already provisioned, not a failure',
        async (message) => {
            const createRuntimeNamespace = jest.fn().mockRejectedValue(new Error(message));
            const { ops } = build({ createRuntimeNamespace });

            await expect(
                ops.ensureWorkspaceRuntimeNamespace('org-1', 'proj-1', 'ws-1'),
            ).resolves.toBeUndefined();
        },
    );

    it('never throws, whatever Console says', async () => {
        const createRuntimeNamespace = jest.fn().mockRejectedValue(new Error('500'));
        const { ops } = build({ createRuntimeNamespace });

        await expect(
            ops.ensureWorkspaceRuntimeNamespace('org-1', 'proj-1', 'ws-1'),
        ).resolves.toBeUndefined();
    });
});

describe('AdobeConsoleWorkspaceOps.createWorkspace — where it is created', () => {
    it('creates in the cached project when told nothing, and provisions Runtime there', async () => {
        const createWorkspace = jest.fn().mockResolvedValue({ body: { workspaceId: 'ws-new' } });
        const createRuntimeNamespace = jest.fn().mockResolvedValue({ body: {} });
        const { ops, listWorkspaces } = build(
            { createWorkspace, createRuntimeNamespace },
            { org: CACHED_ORG, project: CACHED_PROJECT },
        );

        const result = await ops.createWorkspace('Stage', 'A workspace');

        expect(listWorkspaces.mock.calls).toStrictEqual([['org-cached', 'proj-cached']]);
        expect(createWorkspace.mock.calls).toStrictEqual([
            ['org-cached', 'proj-cached', { name: 'Stage', title: 'Stage', description: 'A workspace' }],
        ]);
        expect(createRuntimeNamespace.mock.calls).toStrictEqual([['org-cached', 'proj-cached', 'ws-new']]);
        expect(result).toStrictEqual({ id: 'ws-new', name: 'Stage', title: 'Stage' });
    });

    it('accepts a title of exactly 200 and a description of exactly 500', async () => {
        const createWorkspace = jest.fn().mockResolvedValue({ body: { id: 'ws-new' } });
        const { ops } = build({ createWorkspace, createRuntimeNamespace: jest.fn().mockResolvedValue({}) });

        const result = await ops.createWorkspace('x'.repeat(200), 'd'.repeat(500), {
            orgId: 'o',
            projectId: 'p',
        });

        expect(result).toHaveProperty('id', 'ws-new');
    });

    it('creates where it is TOLD, not where the UI cached', async () => {
        const createWorkspace = jest.fn().mockResolvedValue({ body: { id: 'ws-new' } });
        const { ops } = build(
            { createWorkspace, createRuntimeNamespace: jest.fn().mockResolvedValue({}) },
            { org: CACHED_ORG, project: CACHED_PROJECT },
        );

        await ops.createWorkspace('Stage', '', { orgId: 'org-agent', projectId: 'proj-agent' });

        expect(createWorkspace.mock.calls[0].slice(0, 2)).toStrictEqual(['org-agent', 'proj-agent']);
    });

    it('initialises the SDK before it reads the target', async () => {
        const createWorkspace = jest.fn();
        const { ops, sdk } = build({ createWorkspace }, { initialized: false });

        await ops.createWorkspace('Stage', '', { orgId: 'o', projectId: 'p' });

        expect(sdk.ensureInitialized).toHaveBeenCalledTimes(1);
        expect(createWorkspace).not.toHaveBeenCalled();
    });
});

describe('AdobeConsoleWorkspaceOps.createWorkspace — refused before Console is called', () => {
    it.each([
        ['an empty title', '', 'd', 'Workspace title must be 1–200 characters.'],
        ['a 201-character title', 'x'.repeat(201), 'd', 'Workspace title must be 1–200 characters.'],
        [
            'a 501-character description',
            'Stage',
            'd'.repeat(501),
            'Workspace description must be at most 500 characters.',
        ],
    ])('refuses %s', async (_label, title, description, error) => {
        const createWorkspace = jest.fn();
        const { ops } = build({ createWorkspace }, { org: CACHED_ORG, project: CACHED_PROJECT });

        expect(await ops.createWorkspace(title, description)).toStrictEqual({ error });
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it.each([
        ['no organization', undefined, CACHED_PROJECT],
        ['no project', CACHED_ORG, undefined],
    ])('says nothing is selected when there is %s', async (_label, org, project) => {
        const createWorkspace = jest.fn();
        const { ops } = build({ createWorkspace }, { org, project });

        expect(await ops.createWorkspace('Stage', '')).toStrictEqual({
            error: 'No organization or project selected.',
        });
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('says to sign in when the SDK is still not ready', async () => {
        const { ops } = build({ createWorkspace: jest.fn() }, { initialized: false });

        expect(await ops.createWorkspace('Stage', '', { orgId: 'o', projectId: 'p' })).toStrictEqual({
            error: 'Console SDK is not available — sign in to Adobe first.',
        });
    });
});

describe('AdobeConsoleWorkspaceOps.createWorkspace — what a failure says', () => {
    const TARGET = { orgId: 'o', projectId: 'p' };

    it.each([
        ['an empty body', { body: {} }],
        ['no body at all', {}],
    ])('fails when Console accepts the create but returns %s', async (_label, response) => {
        const { ops } = build({ createWorkspace: jest.fn().mockResolvedValue(response) });

        expect(await ops.createWorkspace('Stage', '', TARGET)).toStrictEqual({
            error: 'Console accepted the create but returned no workspace id.',
        });
    });

    it('answers the name-taken reason when a 409 cannot be retried (names in use unreadable)', async () => {
        const createWorkspace = jest.fn().mockRejectedValue(new Error('HTTP 409'));
        const { ops, listWorkspaces } = build({ createWorkspace });
        listWorkspaces.mockRejectedValue(new Error('503'));

        expect(await ops.createWorkspace('Stage', '', TARGET)).toStrictEqual({
            error: 'A workspace with this name already exists in the project (409).',
        });
        expect(createWorkspace).toHaveBeenCalledTimes(1);
    });

    it('provisions nothing when Console returns no id', async () => {
        const createRuntimeNamespace = jest.fn();
        const { ops } = build({ createWorkspace: jest.fn().mockResolvedValue({ body: {} }), createRuntimeNamespace });

        expect(await ops.createWorkspace('Stage', '', TARGET)).toStrictEqual({
            error: 'Console accepted the create but returned no workspace id.',
        });
        expect(createRuntimeNamespace).not.toHaveBeenCalled();
    });

    it("passes Console's own reason through", async () => {
        const { ops } = build({ createWorkspace: jest.fn().mockRejectedValue(new Error('403 Forbidden')) });

        expect(await ops.createWorkspace('Stage', '', TARGET)).toStrictEqual({ error: '403 Forbidden' });
    });

    it('says Console gave no reason when the error has none', async () => {
        const { ops } = build({ createWorkspace: jest.fn().mockRejectedValue(new Error('')) });

        expect(await ops.createWorkspace('Stage', '', TARGET)).toStrictEqual({
            error: 'Console rejected the workspace with no error message.',
        });
    });
});

describe('AdobeConsoleWorkspaceOps.deleteWorkspace — where it deletes, and what it refuses', () => {
    it('deletes in the cached project when told nothing', async () => {
        const deleteWorkspace = jest.fn().mockResolvedValue({});
        const { ops, listWorkspaces } = build({ deleteWorkspace }, { org: CACHED_ORG, project: CACHED_PROJECT });

        expect(await ops.deleteWorkspace('ws-1')).toStrictEqual({ deleted: true });
        expect(deleteWorkspace.mock.calls).toStrictEqual([['org-cached', 'proj-cached', 'ws-1']]);
        expect(listWorkspaces).not.toHaveBeenCalled();
    });

    it('deletes where it is TOLD, not where the UI cached', async () => {
        const deleteWorkspace = jest.fn().mockResolvedValue({});
        const { ops } = build({ deleteWorkspace }, { org: CACHED_ORG, project: CACHED_PROJECT });

        await ops.deleteWorkspace('ws-1', { orgId: 'org-agent', projectId: 'proj-agent' });

        expect(deleteWorkspace.mock.calls).toStrictEqual([['org-agent', 'proj-agent', 'ws-1']]);
    });

    it('refuses an empty workspace id without calling Console', async () => {
        const deleteWorkspace = jest.fn();
        const { ops } = build({ deleteWorkspace }, { org: CACHED_ORG, project: CACHED_PROJECT });

        expect(await ops.deleteWorkspace('')).toStrictEqual({ error: 'A workspace id is required.' });
        expect(deleteWorkspace).not.toHaveBeenCalled();
    });

    it.each([
        ['no organization', undefined, CACHED_PROJECT],
        ['no project', CACHED_ORG, undefined],
        ['neither', undefined, undefined],
    ])('says nothing is selected when there is %s', async (_label, org, project) => {
        const deleteWorkspace = jest.fn();
        const { ops } = build({ deleteWorkspace }, { org, project });

        expect(await ops.deleteWorkspace('ws-1')).toStrictEqual({
            error: 'No organization or project selected.',
        });
        expect(deleteWorkspace).not.toHaveBeenCalled();
    });

    it('says to sign in when the SDK is still not ready', async () => {
        const deleteWorkspace = jest.fn();
        const { ops } = build({ deleteWorkspace }, { initialized: false });

        expect(await ops.deleteWorkspace('ws-1', { orgId: 'o', projectId: 'p' })).toStrictEqual({
            error: 'Console SDK is not available — sign in to Adobe first.',
        });
        expect(deleteWorkspace).not.toHaveBeenCalled();
    });

    it('does not look for the workspace when it never knew which project to look in', async () => {
        const { ops, sdk, listWorkspaces } = build({ deleteWorkspace: jest.fn() }, { initialized: false });
        sdk.ensureInitialized = jest.fn().mockRejectedValue(new Error('sign-in failed'));

        expect(await ops.deleteWorkspace('ws-1')).toStrictEqual({ error: 'sign-in failed' });
        expect(listWorkspaces).not.toHaveBeenCalled();
    });

    it('does not look when it knew the org but not the project', async () => {
        const { ops, sdk, listWorkspaces } = build(
            { deleteWorkspace: jest.fn() },
            { org: CACHED_ORG, initialized: false },
        );
        sdk.ensureInitialized = jest.fn().mockRejectedValue(new Error('sign-in failed'));

        expect(await ops.deleteWorkspace('ws-1')).toStrictEqual({ error: 'sign-in failed' });
        expect(listWorkspaces).not.toHaveBeenCalled();
    });

    it('reports a delete gone despite an error in the cached project, when told nothing', async () => {
        const deleteWorkspace = jest.fn().mockRejectedValue(new Error('504'));
        const { ops, listWorkspaces } = build({ deleteWorkspace }, { org: CACHED_ORG, project: CACHED_PROJECT });

        expect(await ops.deleteWorkspace('ws-1')).toStrictEqual({
            deleted: true,
            note: 'Adobe answered with an error, but the workspace is no longer in the project.',
        });
        expect(listWorkspaces.mock.calls).toStrictEqual([['org-cached', 'proj-cached']]);
    });

    it('says Console gave no reason when the error has none and the workspace is still there', async () => {
        const deleteWorkspace = jest.fn().mockRejectedValue(new Error(''));
        const { ops, listWorkspaces } = build({ deleteWorkspace });
        listWorkspaces.mockRejectedValue(new Error('503'));

        expect(await ops.deleteWorkspace('ws-1', { orgId: 'o', projectId: 'p' })).toStrictEqual({
            error: 'Console rejected the delete with no error message.',
        });
    });
});
