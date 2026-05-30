/**
 * delete_project tests — extra-strict confirm gate (confirm + name echo), name
 * resolution via getAllProjects + loadProjectFromPath, and success/failure
 * passthrough. The deletion-service core is mocked.
 */

jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({
    deleteProjectFiles: jest.fn(),
}));

import { registerDeleteProjectTool } from '@/features/ai/server/deleteProjectTool';
import { deleteProjectFiles } from '@/features/projects-dashboard/services/projectDeletionService';
import type { HandlerContext } from '@/types/handlers';

const deleteProjectFilesMock = deleteProjectFiles as jest.Mock;

function fakeServer() {

    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {

        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },
        async call(args?: unknown): Promise<any> {
            return JSON.parse((await tools.get('delete_project')!(args)).content[0].text);
        },
    };
}

const getAllProjects = jest.fn();
const loadProjectFromPath = jest.fn();
const ctxFactory = () =>
    ({
        stateManager: { getAllProjects, loadProjectFromPath },
        context: {},
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }) as unknown as HandlerContext;

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

    it('requires a name', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        expect(await s.call({ name: '' })).toMatchObject({ error: expect.stringMatching(/name is required/) });
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
        expect(res).toMatchObject({ error: expect.stringMatching(/No project named "gamma"/), projects: ['alpha', 'beta'] });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('deletes the resolved project when confirm + confirmName echo exactly', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirm: true, confirmName: 'alpha' });
        expect(res).toEqual({ deleted: true, name: 'alpha' });
        expect(loadProjectFromPath).toHaveBeenCalledWith('/p/alpha', undefined, { persistAfterLoad: false });
        expect(deleteProjectFilesMock).toHaveBeenCalledWith(expect.anything(), { name: 'alpha', path: '/p/alpha' });
    });

    it('returns deleted:false with the error when deletion throws', async () => {
        deleteProjectFilesMock.mockRejectedValueOnce(new Error('EBUSY'));
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirm: true, confirmName: 'alpha' });
        expect(res).toMatchObject({ deleted: false, name: 'alpha', error: 'EBUSY' });
    });
});
