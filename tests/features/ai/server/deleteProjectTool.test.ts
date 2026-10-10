/**
 * delete_project tests — extra-strict confirm gate (confirm + name echo), name
 * resolution via getAllProjects + loadProjectFromPath, success/failure
 * passthrough, and what it SAYS while it runs. The deletion-service core is
 * mocked.
 */

jest.mock('@/features/projects-dashboard/services/projectFilesDeletion', () => ({
    deleteProjectFiles: jest.fn(),
}));

// The real resolver decides; only the step that would touch the cloud is held
// back, so what it is HANDED can be read.
jest.mock('@/features/ai/server/agentProjectCleanup', () => ({
    ...jest.requireActual('@/features/ai/server/agentProjectCleanup'),
    cleanUpProjectCloud: jest.fn(),
}));

import * as vscode from 'vscode';
import { z } from 'zod';

import { registerDeleteProjectTool } from '@/features/ai/server/deleteProjectTool';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { cleanUpProjectCloud } from '@/features/ai/server/agentProjectCleanup';
import { deleteProjectFiles } from '@/features/projects-dashboard/services/projectFilesDeletion';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const deleteProjectFilesMock = deleteProjectFiles as jest.Mock;
const cleanUpProjectCloudMock = cleanUpProjectCloud as jest.Mock;
const getConfiguration = vscode.workspace.getConfiguration as jest.Mock;

/** Put the SC's `cleanupBehavior` setting where the resolver reads it. */
function cleanupBehavior(value: string): void {
    getConfiguration.mockReturnValue({ get: () => value });
}

/**
 * The schema is KEPT, not discarded: `readOnlyHint`/`destructiveHint`, `needsAuth`
 * and the input shape are what a client reads before it decides whether this tool
 * may run unattended, and a stub that throws its second argument away can see none
 * of them (see mcpToolServer.ts's own note on that gap).
 */
function fakeServer() {
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    const schemas = new Map<string, McpToolSchema>();
    return {
        registerTool(
            name: string,
            def: McpToolSchema,
            handler: (args: any) => Promise<{ content: Array<{ text: string }> }>
        ) {
            tools.set(name, handler);
            schemas.set(name, def);
        },
        schema(): McpToolSchema {
            return schemas.get('delete_project')!;
        },
        async call(args?: unknown): Promise<any> {
            return JSON.parse((await tools.get('delete_project')!(args)).content[0].text);
        },
    };
}

const getAllProjects = jest.fn();
const loadProjectFromPath = jest.fn();
const ctxFactory = () =>
    createMockHandlerContext({
        stateManager: createMockStateManager({ getAllProjects, loadProjectFromPath }),
        context: createMockExtensionContext(),
        logger: createMockLogger(),
    });

describe('delete_project', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getAllProjects.mockResolvedValue([
            { name: 'alpha', path: '/p/alpha' },
            { name: 'beta', path: '/p/beta' },
        ]);
        loadProjectFromPath.mockResolvedValue({ name: 'alpha', path: '/p/alpha' });
        deleteProjectFilesMock.mockResolvedValue(undefined);
        cleanUpProjectCloudMock.mockResolvedValue({});
        cleanupBehavior('ask');
    });

    describe('what the tool declares to a client', () => {
        it('is announced as a destructive, non-read-only, unauthenticated tool', () => {
            const s = fakeServer();
            registerDeleteProjectTool(s, ctxFactory);

            expect(s.schema()).toMatchObject({
                needsAuth: false,
                annotations: { readOnlyHint: false, destructiveHint: true },
            });
        });

        // The gate the handler enforces has to be REACHABLE: an agent can only
        // send confirm/confirmName if the declared input shape accepts them.
        it('declares the name, both confirmation fields and the two cloud choices', () => {
            const s = fakeServer();
            registerDeleteProjectTool(s, ctxFactory);
            const shape = s.schema().inputSchema as Record<string, z.ZodTypeAny>;

            // The two cloud choices mirror the checkboxes the button shows, and
            // like them they default to unticked (AI-9).
            expect(Object.keys(shape)).toEqual([
                'name',
                'confirm',
                'confirmName',
                'deleteGithubRepo',
                'deleteDaLiveSite',
            ]);
            expect(z.object(shape).safeParse({ name: 'alpha' }).success).toBe(true);
            expect(z.object(shape).safeParse({}).success).toBe(false);
            expect(
                z.object(shape).safeParse({ name: 'alpha', confirm: 'yes' }).success
            ).toBe(false);
        });

        it('warns in its description that the deletion is local and irreversible', () => {
            const s = fakeServer();
            registerDeleteProjectTool(s, ctxFactory);

            expect(s.schema().description).toMatch(/Irreversible/);
        });
    });

    it('requires a name', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        expect(await s.call({ name: '' })).toMatchObject({
            error: expect.stringMatching(/name is required/),
        });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('refuses without confirm + confirmName echo (irreversible)', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha' });
        expect(res).toMatchObject({ irreversible: true });
        expect(res.error).toMatch(/confirmName:"alpha"/);
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('refuses when confirmName does not echo the name exactly', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirm: true, confirmName: 'beta' });
        expect(res).toMatchObject({ irreversible: true });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('errors with the available names when the project is not found', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'gamma', confirm: true, confirmName: 'gamma' });
        expect(res).toMatchObject({
            error: expect.stringMatching(/No project named "gamma"/),
            projects: ['alpha', 'beta'],
        });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('deletes the resolved project when confirm + confirmName echo exactly', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirm: true, confirmName: 'alpha' });
        expect(res).toEqual({ deleted: true, name: 'alpha' });
        expect(loadProjectFromPath).toHaveBeenCalledWith('/p/alpha', undefined, {
            persistAfterLoad: false,
        });
        expect(deleteProjectFilesMock).toHaveBeenCalledWith(expect.anything(), {
            name: 'alpha',
            path: '/p/alpha',
        });
    });

    it('requires a name when called with no arguments at all', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        expect(await s.call()).toMatchObject({
            error: expect.stringMatching(/name is required/),
        });
        expect(getAllProjects).not.toHaveBeenCalled();
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only name as missing', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        expect(await s.call({ name: '   ' })).toMatchObject({
            error: expect.stringMatching(/name is required/),
        });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    // Each half of the gate on its own: an echoed confirmName with no confirm is
    // the case where a condition that only reads the second half still looks
    // correct on every other test in this file.
    it('refuses when confirmName echoes but confirm is absent', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirmName: 'alpha' });
        expect(res).toMatchObject({ irreversible: true });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('refuses a truthy-but-not-true confirm', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirm: 'yes', confirmName: 'alpha' });
        expect(res).toMatchObject({ irreversible: true });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('errors without deleting when the project record cannot be loaded', async () => {
        loadProjectFromPath.mockResolvedValueOnce(null);
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirm: true, confirmName: 'alpha' });
        expect(res).toEqual({ error: 'Failed to load project "alpha"' });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('returns deleted:false with the error when deletion throws', async () => {
        deleteProjectFilesMock.mockRejectedValueOnce(new Error('EBUSY'));
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirm: true, confirmName: 'alpha' });
        expect(res).toMatchObject({ deleted: false, name: 'alpha', error: 'EBUSY' });
    });
});

/**
 * The steps an agent is shown (PL-59 slice 7, plan row 5b). The tool ran them
 * and reported none, so a delete that spends a minute unpublishing pages
 * announced itself once and went quiet.
 */
describe('what it says while it runs', () => {
    it('names the step it runs, so an agent notification has something to show', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const seen: string[] = [];

        await withPhaseSinks([(message) => seen.push(message)], () =>
            s.call({ name: 'alpha', confirm: true, confirmName: 'alpha' })
        );

        expect(seen).toEqual(['Removing the project files']);
        expect(deleteProjectFilesMock).toHaveBeenCalled();
    });
});

/**
 * The two cloud choices (AI-9). What the tool hands the cleanup step is the
 * decision: the step itself is tested where it lives.
 */
describe('the two cloud choices', () => {
    const CONFIRMED = { name: 'alpha', confirm: true, confirmName: 'alpha' };
    const PROJECT = { name: 'alpha', path: '/p/alpha' };

    beforeEach(() => {
        jest.clearAllMocks();
        getAllProjects.mockResolvedValue([{ name: 'alpha', path: '/p/alpha' }]);
        loadProjectFromPath.mockResolvedValue(PROJECT);
        deleteProjectFilesMock.mockResolvedValue(undefined);
        cleanUpProjectCloudMock.mockResolvedValue({});
        cleanupBehavior('ask');
    });

    it('asks for neither when the call names neither', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        await s.call(CONFIRMED);

        expect(cleanUpProjectCloudMock).toHaveBeenCalledTimes(1);
        expect(cleanUpProjectCloudMock).toHaveBeenCalledWith(expect.anything(), PROJECT, {
            deleteGithubRepo: false,
            deleteDaLiveSite: false,
        });
    });

    it('asks for the repository alone when only that is ticked', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        await s.call({ ...CONFIRMED, deleteGithubRepo: true });

        expect(cleanUpProjectCloudMock).toHaveBeenCalledWith(expect.anything(), PROJECT, {
            deleteGithubRepo: true,
            deleteDaLiveSite: false,
        });
    });

    it('asks for the site alone when only that is ticked', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        await s.call({ ...CONFIRMED, deleteDaLiveSite: true });

        expect(cleanUpProjectCloudMock).toHaveBeenCalledWith(expect.anything(), PROJECT, {
            deleteGithubRepo: false,
            deleteDaLiveSite: true,
        });
    });

    // Same bar as `confirm`: a word is not a tick.
    it('does not read a truthy word as a tick', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        await s.call({ ...CONFIRMED, deleteGithubRepo: 'yes', deleteDaLiveSite: 1 });

        expect(cleanUpProjectCloudMock).toHaveBeenCalledWith(expect.anything(), PROJECT, {
            deleteGithubRepo: false,
            deleteDaLiveSite: false,
        });
    });

    it('reports what the cloud step did alongside the local delete', async () => {
        cleanUpProjectCloudMock.mockResolvedValue({
            githubRepo: { name: 'jen/alpha', deleted: true },
        });
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        expect(await s.call({ ...CONFIRMED, deleteGithubRepo: true })).toEqual({
            deleted: true,
            name: 'alpha',
            githubRepo: { name: 'jen/alpha', deleted: true },
        });
    });

    it('still reports what the cloud step did when the local delete then fails', async () => {
        cleanUpProjectCloudMock.mockResolvedValue({
            githubRepo: { name: 'jen/alpha', deleted: true },
        });
        deleteProjectFilesMock.mockRejectedValueOnce('EBUSY');
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        expect(await s.call({ ...CONFIRMED, deleteGithubRepo: true })).toEqual({
            deleted: false,
            name: 'alpha',
            githubRepo: { name: 'jen/alpha', deleted: true },
            error: 'EBUSY',
        });
    });

    it('says the setting refused when "localOnly" overrode a tick', async () => {
        cleanupBehavior('localOnly');
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        const res = await s.call({ ...CONFIRMED, deleteDaLiveSite: true });

        expect(cleanUpProjectCloudMock).toHaveBeenCalledWith(
            expect.anything(),
            PROJECT,
            expect.objectContaining({ deleteGithubRepo: false, deleteDaLiveSite: false }),
        );
        expect(res).toEqual({
            deleted: true,
            name: 'alpha',
            note: 'demoBuilder.cleanupBehavior is "localOnly", so cloud resources are never deleted. Change the setting to delete them.',
        });
    });

    it('adds no note when nothing was refused', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        const res = await s.call({ ...CONFIRMED, deleteDaLiveSite: true });

        expect(res).toEqual({ deleted: true, name: 'alpha' });
    });

    it('cleans up the cloud before the local files, which are how it is found', async () => {
        const order: string[] = [];
        cleanUpProjectCloudMock.mockImplementation(async () => {
            order.push('cloud');
            return {};
        });
        deleteProjectFilesMock.mockImplementation(async () => {
            order.push('local');
        });
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        await s.call(CONFIRMED);

        expect(order).toEqual(['cloud', 'local']);
    });
});

describe('what each input is described as', () => {
    it('tells the agent what every field is for', () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const shape = s.schema().inputSchema as Record<string, z.ZodTypeAny>;

        expect(Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v.description]))).toEqual({
            name: 'Name of the project to delete',
            confirm: 'Must be true to proceed',
            confirmName: 'Must equal the project name exactly — guards this irreversible deletion',
            deleteGithubRepo: "Also delete the project's GitHub repository (default: false)",
            deleteDaLiveSite:
                "Also delete the project's DA.live site and take its pages off the CDN (default: false)",
        });
    });
});
