/**
 * delete_project's `removeData`: the agent's Uninstall Datapack (walk F96), the data the
 * project's datapack put in Commerce, removed BEFORE anything else, as the button removes it. Off
 * unless asked, never turned on by the cleanupBehavior setting. When the pack is not the user's
 * and has changes, it refuses until `changes` answers (keep with `saveAs`, or drop), and a removal
 * that does not finish deletes nothing. An answer goes up front, as the window's Delete Without
 * Saving sends it (step-05 S1): `drop` loses the changes in any pack, the user's own included. The removal is mocked in the shared wall and asserted by
 * what it is handed; its own suite is `datapackDataRemoval.test.ts`.
 */

// The removal under the real `removeDataBeforeDelete`, for the door case that drives it through.
jest.mock('@/features/eds/services/reset/edsResetDatapack', () => ({
    ...jest.requireActual('@/features/eds/services/reset/edsResetDatapack'),
    removeProjectSampleDataOutcome: jest.fn(),
}));

// The shared wall first: it owns the subject import (webview-test-authoring §3).
import {
    cleanupBehavior,
    ctxFactory,
    fakeServer,
    getAllProjects,
    loadProjectFromPath,
    mockRunProjectDelete,
    registerDeleteProjectTool,
    useRealDelete,
} from './deleteProjectTool.testUtils';
import { z } from 'zod';
import { removeProjectSampleDataOutcome, type SaveAsAnswer, type SaveAsAnswering } from '@/features/eds/services/reset/edsResetDatapack';
import { LEFT_NOTE, REMOVAL_LEFT_IN_STORE, REMOVAL_NO_TARGET } from '../../../helpers/datapackRemovalFixtures';
import { hasRemovableData, removeDataBeforeDelete } from '@/features/projects-dashboard/services/datapackDataRemoval';
import { deleteProjectFiles } from '@/features/projects-dashboard/services/projectFilesDeletion';
import type { HandlerContext } from '@/types/handlers';
import { createMockProject } from '../../../helpers/projectFake';

const mockedHasData = hasRemovableData as jest.MockedFunction<typeof hasRemovableData>;
const mockedRemove = removeDataBeforeDelete as jest.MockedFunction<typeof removeDataBeforeDelete>;
const mockedFiles = deleteProjectFiles as jest.MockedFunction<typeof deleteProjectFiles>;

const CONFIRMED = { name: 'acme-demo', confirm: true, confirmName: 'acme-demo' };
const PROJECT = createMockProject({ name: 'acme-demo', path: '/p/acme-demo' });
const SENTENCE = 'You changed 2 products since it was installed.';

/** The tool, built with a context the test can name in an assertion. */
function register() {
    const server = fakeServer();
    let ctx: HandlerContext | undefined;
    registerDeleteProjectTool(server, () => (ctx = ctxFactory()));
    return { server, ctx: () => ctx };
}

/** The answer the removal ends up with: given up front, or asked as the real removal asks it. */
async function askedWith(askName: SaveAsAnswering | undefined): Promise<SaveAsAnswer> {
    if (askName === undefined) return undefined;
    if (typeof askName !== 'function') return askName.given;
    return askName({ sentence: SENTENCE });
}

/** The removal asks about changes in a pack that is not the user's, as the real one does. */
function removalAsks() {
    mockedRemove.mockImplementation(async (_ctx, _project, _report, askName?: SaveAsAnswering) => {
        const answer = await askedWith(askName);
        return answer === undefined ? { stopped: `Its datapack's data was not removed, so the project was kept: ${SENTENCE} They were not answered.` } : {};
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    cleanupBehavior('ask');
    getAllProjects.mockResolvedValue([{ name: 'acme-demo', path: '/p/acme-demo' }]);
    loadProjectFromPath.mockResolvedValue(PROJECT);
    mockedHasData.mockResolvedValue(true);
    mockedRemove.mockResolvedValue({});
    mockedFiles.mockResolvedValue(undefined);
    useRealDelete();
});

describe("delete_project and the datapack's data", () => {
    it('declares removeData, changes and saveAs', () => {
        const shape = register().server.schema().inputSchema as Record<string, z.ZodTypeAny>;

        expect(z.object(shape).safeParse({ name: 'a', removeData: true, changes: 'keep', saveAs: { displayName: 'Mine' } }).success).toBe(true);
        expect(z.object(shape).safeParse({ name: 'a', removeData: 'yes' }).success).toBe(false);
        expect(z.object(shape).safeParse({ name: 'a', changes: 'maybe' }).success).toBe(false);
        expect(z.object(shape).safeParse({ name: 'a', saveAs: { displayName: '' } }).success).toBe(false);
    });

    it('leaves the data when the call does not ask, under deleteAll too', async () => {
        cleanupBehavior('deleteAll');

        const answer = await register().server.call(CONFIRMED);

        expect(answer.deleted).toBe(true);
        expect(mockedRemove).not.toHaveBeenCalled();
        expect(answer).not.toHaveProperty('datapackData');
    });

    // Through the button's own delete (PL-104 fix 6), whose order puts the data first.
    it('removes the data before the files when asked, through the button delete, and says so', async () => {
        const order: string[] = [];
        mockedRemove.mockImplementation(async () => {
            order.push('data');
            return {};
        });
        mockedFiles.mockImplementation(async () => void order.push('files'));
        const tool = register();

        const answer = await tool.server.call({ ...CONFIRMED, removeData: true });

        expect(mockRunProjectDelete.mock.calls[0][2].cleanupOptions).toMatchObject({ removeDatapackData: true, nobodyToAsk: true });
        expect(mockedRemove).toHaveBeenCalledWith(tool.ctx(), PROJECT, expect.any(Function), expect.any(Function));
        expect(order).toEqual(['data', 'files']);
        expect(answer).toMatchObject({ deleted: true, datapackData: { removed: true } });
    });

    it('deletes nothing when the data does not all come out, and says why', async () => {
        const why = "Its datapack's data was not removed, so the project was kept: Commerce refused 2 products.";
        mockedRemove.mockResolvedValue({ stopped: why });

        const answer = await register().server.call({ ...CONFIRMED, removeData: true });

        expect(mockedFiles).not.toHaveBeenCalled();
        expect(answer).toEqual({ deleted: false, name: 'acme-demo', error: why });
    });

    it("refuses until the changes in a pack that is not the user's are answered, deleting nothing", async () => {
        removalAsks();

        const answer = await register().server.call({ ...CONFIRMED, removeData: true, changes: 'keep' });

        expect(mockedFiles).not.toHaveBeenCalled();
        expect(answer).toMatchObject({ deleted: false, code: 'CHANGES_NEED_ANSWER' });
        expect(answer.error).toContain(SENTENCE);
        expect(answer.error).toContain('changes:"keep" with saveAs');
    });

    // Up front, as the window's answers go (step-05 S1, Phase 8: agents match the screen), so a
    // drop reaches the user's own pack too, as Delete Without Saving does.
    it.each([
        [{ changes: 'keep', saveAs: { displayName: ' My Copy ' } }, { given: { saveAs: 'My Copy' } }],
        [{ changes: 'drop' }, { given: 'drop' }],
    ])('hands the removal the answer %j as given, then deletes', async (args, expected) => {
        const answer = await register().server.call({ ...CONFIRMED, removeData: true, ...args });

        expect(mockedRemove.mock.calls[0][3]).toStrictEqual(expected);
        expect(answer.deleted).toBe(true);
    });

    it("drops nothing on keep without a name: the removal asks, and the user's own pack is saved into", async () => {
        await register().server.call({ ...CONFIRMED, removeData: true, changes: 'keep' });

        const answering = mockedRemove.mock.calls[0][3];
        expect(typeof answering).toBe('function');
        expect(answering).not.toStrictEqual({ given: 'drop' });
    });

    it('deletes, saying there was no data, when the project has none', async () => {
        mockedHasData.mockResolvedValue(false);

        const answer = await register().server.call({ ...CONFIRMED, removeData: true });

        expect(mockedRemove).not.toHaveBeenCalled();
        expect(answer).toMatchObject({ deleted: true, datapackData: { removed: false } });
    });

    it('refuses the data under localOnly, and says why', async () => {
        cleanupBehavior('localOnly');

        const answer = await register().server.call({ ...CONFIRMED, removeData: true });

        expect(mockedRemove).not.toHaveBeenCalled();
        expect(answer.note).toContain('localOnly');
    });

    // Review 2026-11-14 (item 10): the door, through the real removeDataBeforeDelete. A removal that
    // left part of the datapack in Commerce keeps the project, and the agent reads what was left.
    it('deletes nothing when the removal left part in Commerce, answering with what was left', async () => {
        const real = jest.requireActual<typeof import('@/features/projects-dashboard/services/datapackDataRemoval')>(
            '@/features/projects-dashboard/services/datapackDataRemoval',
        );
        mockedRemove.mockImplementation(real.removeDataBeforeDelete);
        (removeProjectSampleDataOutcome as jest.MockedFunction<typeof removeProjectSampleDataOutcome>).mockResolvedValue(REMOVAL_LEFT_IN_STORE);

        const answer = await register().server.call({ ...CONFIRMED, removeData: true, changes: 'drop' });

        expect(mockedFiles).not.toHaveBeenCalled();
        expect(answer).toEqual({ deleted: false, name: 'acme-demo', error: `Part of its datapack was left in Commerce, so the project was kept: ${LEFT_NOTE}` });
    });

    // step-07 (owner, 2026-11-14): no install record and no install target, so nothing was ever
    // installed: nothing to remove. Never "removed: true" when nothing ran (review, 2026-11-14).
    it('deletes when nothing was ever installed, saying there was none to remove', async () => {
        const real = jest.requireActual<typeof import('@/features/projects-dashboard/services/datapackDataRemoval')>(
            '@/features/projects-dashboard/services/datapackDataRemoval',
        );
        mockedRemove.mockImplementation(real.removeDataBeforeDelete);
        (removeProjectSampleDataOutcome as jest.MockedFunction<typeof removeProjectSampleDataOutcome>).mockResolvedValue(REMOVAL_NO_TARGET);

        const answer = await register().server.call({ ...CONFIRMED, removeData: true, changes: 'drop' });

        expect(mockedFiles).toHaveBeenCalledTimes(1);
        expect(answer).toEqual({
            deleted: true,
            name: 'acme-demo',
            datapackData: {
                removed: false,
                note: "No website and store view were ever recorded for this project's datapack, so nothing of it was installed in Commerce and there was none to remove.",
            },
        });
    });
});
