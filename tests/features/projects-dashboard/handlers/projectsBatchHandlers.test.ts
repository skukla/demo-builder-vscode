/**
 * `prepareProjectsBatch` and `runProjectsBatch` (owner, 2026-11-04): a refusal for a payload that
 * names no action or no project, one batch at a time, the run in the window under the batch's own
 * id, rows pushed as `projectsBatchRow`, and a success with a warning when some did not go through.
 * The work is `projectsBatch.ts`'s and faked here.
 */

jest.mock('@/features/projects-dashboard/services/projectsBatch', () => ({
    prepareDeleteBatch: jest.fn(),
    prepareResetBatch: jest.fn(),
    runDeleteBatch: jest.fn(),
    runResetBatch: jest.fn(),
    saveNamesOf: jest.fn(),
}));
jest.mock('@/features/eds/services/reset/edsResetUI', () => ({ resetEdsProjectWithUI: jest.fn() }));
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getCommandExecutor: jest.fn(), getAuthenticationService: jest.fn() },
}));
jest.mock('@/core/vscode/withOperationProgress', () => ({
    withOperationProgress: jest.fn(async (_options: unknown, work: (report: jest.Mock) => Promise<unknown>) => work(jest.fn())),
}));

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { resetEdsProjectWithUI } from '@/features/eds/services/reset/edsResetUI';
import type { RunReset } from '@/features/projects-dashboard/services/projectsBatch';
import { PROJECTS_BATCH_OPERATION_ID } from '@/core/utils/operationIds';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { handlePrepareProjectsBatch, handleRunProjectsBatch } from '@/features/projects-dashboard/handlers/projectsBatchHandlers';
import { prepareDeleteBatch, prepareResetBatch, runDeleteBatch, runResetBatch, saveNamesOf } from '@/features/projects-dashboard/services/projectsBatch';
import type { BatchDeleteAnswer } from '@/types/projectsBatch';

const ANSWER: BatchDeleteAnswer = { path: '/projects/a', deleteGitHubRepo: false, deleteDaLiveSite: false, removeDatapackData: false };

beforeEach(() => {
    jest.clearAllMocks();
    (saveNamesOf as jest.Mock).mockResolvedValue({ ownNames: [], alwaysSave: false });
});

describe('prepareProjectsBatch', () => {
    it('answers the rows for the projects picked', async () => {
        (prepareDeleteBatch as jest.Mock).mockResolvedValue([{ path: '/projects/a', name: 'a' }]);

        const result = await handlePrepareProjectsBatch(createMockHandlerContext(), { action: 'delete', projectPaths: ['/projects/a'] });

        expect(result).toStrictEqual({ success: true, data: { action: 'delete', rows: [{ path: '/projects/a', name: 'a' }], ownNames: [], alwaysSave: false } });
    });

    // The save question names a new datapack: it may not take one of the SC's (step-05 S1, J7-2).
    it("adds the SC's datapacks' names and the save setting, read for the rows it answers", async () => {
        const rows = [{ path: '/projects/a', name: 'a', datapack: { name: 'Bodea', changes: 'asks' } }];
        (prepareResetBatch as jest.Mock).mockResolvedValue(rows);
        (saveNamesOf as jest.Mock).mockResolvedValue({ ownNames: ['My Luma'], alwaysSave: true });
        const context = createMockHandlerContext();

        const result = await handlePrepareProjectsBatch(context, { action: 'reset', projectPaths: ['/projects/a'] });

        expect(saveNamesOf).toHaveBeenCalledWith(context, rows);
        expect(result).toStrictEqual({ success: true, data: { action: 'reset', rows, ownNames: ['My Luma'], alwaysSave: true } });
    });

    it('refuses a batch with no projects, reading nothing', async () => {
        const context = createMockHandlerContext();

        await expect(handlePrepareProjectsBatch(context, { action: 'reset', projectPaths: [] })).resolves.toStrictEqual({ success: false, error: 'Select at least one project.' });
        expect(prepareDeleteBatch).not.toHaveBeenCalled();
    });
});

describe('runProjectsBatch', () => {
    it("runs in the window under the batch's id, and pushes each row as projectsBatchRow", async () => {
        const context = createMockHandlerContext({ sendMessage: jest.fn().mockResolvedValue(undefined) });
        (runDeleteBatch as jest.Mock).mockImplementation(async (_ctx, _answers, tell) => {
            tell({ path: '/projects/a', state: 'done' });
            return 0;
        });

        const result = await handleRunProjectsBatch(context, { action: 'delete', answers: [ANSWER] });

        expect(withOperationProgress).toHaveBeenCalledWith({ id: PROJECTS_BATCH_OPERATION_ID, title: 'Deleting Projects', inModal: true }, expect.any(Function));
        expect(context.sendMessage).toHaveBeenCalledWith('projectsBatchRow', { path: '/projects/a', state: 'done' });
        expect(result).toMatchObject({ success: true });
        expect(result).not.toHaveProperty('warning');
    });

    it('ends on a warning naming how many did not go through', async () => {
        (runResetBatch as jest.Mock).mockResolvedValue(2);

        const result = await handleRunProjectsBatch(createMockHandlerContext(), {
            action: 'reset',
            answers: [1, 2, 3].map((n) => ({ path: `/projects/${n}`, removeDatapack: false })),
        });

        expect(withOperationProgress).toHaveBeenCalledWith(expect.objectContaining({ title: 'Resetting Projects' }), expect.any(Function));
        expect(result).toMatchObject({ success: true, warning: '2 projects not reset.' });
    });

    it('runs one batch at a time', async () => {
        let finish: (failed: number) => void = () => undefined;
        (runDeleteBatch as jest.Mock).mockImplementationOnce(() => new Promise<number>((resolve) => (finish = resolve)));
        const context = createMockHandlerContext();

        const first = handleRunProjectsBatch(context, { action: 'delete', answers: [ANSWER] });
        await Promise.resolve();
        const second = await handleRunProjectsBatch(context, { action: 'delete', answers: [ANSWER] });
        finish(0);
        await first;

        expect(second).toStrictEqual({ success: false, error: 'Projects are already being reset or deleted.' });
        expect(runDeleteBatch).toHaveBeenCalledTimes(1);
    });

    it("never moves the open project: the run's state manager does not switch", async () => {
        const context = createMockHandlerContext();
        (runDeleteBatch as jest.Mock).mockResolvedValue(0);

        await handleRunProjectsBatch(context, { action: 'delete', answers: [ANSWER] });

        expect((runDeleteBatch as jest.Mock).mock.calls[0][0].stateManager).not.toBe(context.stateManager);
    });
});

/**
 * The reset each project gets, the list's and, since step-05 S4, the project dashboard's: one
 * reset whichever door. Ported from the dashboard's own reset handler suite, which pinned the same
 * whole-object call because these flags default to false, and the dashboard once did a lighter
 * reset than the list for two years (EDS-12, fixed 2026-09-02).
 */
describe("runProjectsBatch's reset of a storefront project", () => {
    it('includes the block library and the CDN check, inside the window, with the answers given', async () => {
        let runReset: RunReset | undefined;
        (runResetBatch as jest.Mock).mockImplementation(async (_ctx, _answers, run: { runReset: RunReset }) => {
            runReset = run.runReset;
            return 0;
        });
        (resetEdsProjectWithUI as jest.Mock).mockResolvedValue({ success: true });
        await handleRunProjectsBatch(createMockHandlerContext(), { action: 'reset', answers: [{ path: '/projects/a', removeDatapack: true }] });
        const project = createMockProject({ path: '/projects/a', selectedStack: 'eds-paas' });
        const context = createMockHandlerContext();
        const report = jest.fn();

        await runReset?.(context, project, { path: '/projects/a', removeDatapack: true, changes: 'drop' }, report);

        expect(resetEdsProjectWithUI).toHaveBeenCalledWith({
            meshDeps: { commandManager: undefined, authManager: undefined },
            project,
            context,
            logPrefix: '[ProjectsBatch]',
            includeBlockLibrary: true,
            verifyCdn: true,
            withinEdit: { report },
            answered: { removeDatapack: true, changes: 'drop' },
        });
    });
});
