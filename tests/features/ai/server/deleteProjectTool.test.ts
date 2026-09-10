/**
 * delete_project tests — extra-strict confirm gate (confirm + name echo), name
 * resolution via getAllProjects + loadProjectFromPath, and success/failure
 * passthrough. The deletion-service core is mocked.
 */

jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({
    deleteProjectFiles: jest.fn(),
}));

import { z } from 'zod';

import { registerDeleteProjectTool } from '@/features/ai/server/deleteProjectTool';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { deleteProjectFiles } from '@/features/projects-dashboard/services/projectDeletionService';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const deleteProjectFilesMock = deleteProjectFiles as jest.Mock;

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
        it('declares the name and both confirmation fields, with only name required', () => {
            const s = fakeServer();
            registerDeleteProjectTool(s, ctxFactory);
            const shape = s.schema().inputSchema as Record<string, z.ZodTypeAny>;

            expect(Object.keys(shape)).toEqual(['name', 'confirm', 'confirmName']);
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
