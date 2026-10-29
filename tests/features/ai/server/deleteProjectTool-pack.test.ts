/**
 * delete_project's `deletePack` (datapack-engine step 07): the agent's "Also delete its pack".
 * Off unless asked, never turned on by the cleanupBehavior setting, and run after the local
 * files, as the button runs it. The library call is mocked in the shared wall and asserted by
 * what it is handed; its own suite is `demoPackDeletion.test.ts`.
 */

// The shared wall first: it owns the subject import (webview-test-authoring §3).
import {
    cleanupBehavior,
    ctxFactory,
    fakeServer,
    getAllProjects,
    loadProjectFromPath,
    registerDeleteProjectTool,
} from './deleteProjectTool.testUtils';
import { z } from 'zod';
import { cleanUpProjectCloud } from '@/features/ai/server/agentProjectCleanup';
import { deleteProjectDemoPack } from '@/features/projects-dashboard/services/demoPackDeletion';
import { deleteProjectFiles } from '@/features/projects-dashboard/services/projectFilesDeletion';
import type { HandlerContext } from '@/types/handlers';
import { createMockProject } from '../../../helpers/projectFake';

const mockedPackDelete = deleteProjectDemoPack as jest.MockedFunction<typeof deleteProjectDemoPack>;
const mockedFiles = deleteProjectFiles as jest.MockedFunction<typeof deleteProjectFiles>;
const mockedCloud = cleanUpProjectCloud as jest.MockedFunction<typeof cleanUpProjectCloud>;

const OWN = { name: 'acme-demo-1a2b3c', displayName: 'Acme Demo' };
const CONFIRMED = { name: 'acme-demo', confirm: true, confirmName: 'acme-demo' };

/** The tool, built with a context the test can name in an assertion. */
function register() {
    const server = fakeServer();
    let ctx: HandlerContext | undefined;
    registerDeleteProjectTool(server, () => (ctx = ctxFactory()));
    return { server, ctx: () => ctx };
}

beforeEach(() => {
    jest.clearAllMocks();
    cleanupBehavior('ask');
    getAllProjects.mockResolvedValue([{ name: 'acme-demo', path: '/p/acme-demo' }]);
    loadProjectFromPath.mockResolvedValue(createMockProject({ name: 'acme-demo', path: '/p/acme-demo', ownDatapack: OWN }));
    mockedFiles.mockResolvedValue(undefined);
    mockedCloud.mockResolvedValue({});
    mockedPackDelete.mockResolvedValue({ type: 'datapack', name: 'Acme Demo', success: true });
});

describe("delete_project and the demo's own pack", () => {
    it('declares deletePack as an optional boolean', () => {
        const { server } = register();
        const shape = server.schema().inputSchema as Record<string, z.ZodTypeAny>;

        expect(z.object(shape).safeParse({ name: 'a', deletePack: true }).success).toBe(true);
        expect(z.object(shape).safeParse({ name: 'a', deletePack: 'yes' }).success).toBe(false);
    });

    it('keeps the pack when the call does not ask', async () => {
        const answer = await register().server.call(CONFIRMED);

        expect(answer.deleted).toBe(true);
        expect(mockedPackDelete).not.toHaveBeenCalled();
        expect(answer).not.toHaveProperty('datapack');
    });

    it('keeps the pack under deleteAll when the call does not ask', async () => {
        cleanupBehavior('deleteAll');

        await register().server.call(CONFIRMED);

        expect(mockedPackDelete).not.toHaveBeenCalled();
    });

    it('deletes the pack after the files when asked, and says what happened', async () => {
        const order: string[] = [];
        mockedFiles.mockImplementation(async () => {
            order.push('files');
        });
        mockedPackDelete.mockImplementation(async () => {
            order.push('pack');
            return { type: 'datapack', name: 'Acme Demo', success: false, error: 'Deleted 1 of 2 versions. Not deleted: 2 (no).' };
        });
        const tool = register();

        const answer = await tool.server.call({ ...CONFIRMED, deletePack: true });

        expect(mockedPackDelete).toHaveBeenCalledWith(tool.ctx(), OWN);
        expect(order).toEqual(['files', 'pack']);
        expect(answer).toMatchObject({
            deleted: true,
            datapack: { name: 'Acme Demo', deleted: false, error: 'Deleted 1 of 2 versions. Not deleted: 2 (no).' },
        });
    });

    it('says so when asked to delete a pack the project does not have', async () => {
        loadProjectFromPath.mockResolvedValue(createMockProject({ name: 'acme-demo', path: '/p/acme-demo' }));

        const answer = await register().server.call({ ...CONFIRMED, deletePack: true });

        expect(mockedPackDelete).not.toHaveBeenCalled();
        expect(answer.datapack).toEqual({ deleted: false, error: 'This project has no pack of its own.' });
    });

    it('refuses the pack under localOnly, and says why', async () => {
        cleanupBehavior('localOnly');

        const answer = await register().server.call({ ...CONFIRMED, deletePack: true });

        expect(mockedPackDelete).not.toHaveBeenCalled();
        expect(answer.note).toContain('localOnly');
    });
});
