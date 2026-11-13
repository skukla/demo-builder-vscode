/**
 * delete_project's `removeData`: the agent's Uninstall Datapack (walk F96), the data the
 * project's datapack put in Commerce, removed BEFORE anything else, as the button removes it. Off
 * unless asked, never turned on by the cleanupBehavior setting. When the pack is not the user's
 * and has changes, it refuses until `changes` answers (keep with `saveAs`, or drop), and a removal
 * that does not finish deletes nothing. The removal is mocked in the shared wall and asserted by
 * what it is handed; its own suite is `datapackDataRemoval.test.ts`.
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
import type { SaveAsAnswer, SaveAsAnswering } from '@/features/eds/services/reset/edsResetSampleData';
import { hasRemovableData, removeDataBeforeDelete } from '@/features/projects-dashboard/services/datapackDataRemoval';
import { deleteProjectFiles } from '@/features/projects-dashboard/services/projectFilesDeletion';
import type { HandlerContext } from '@/types/handlers';
import { createMockProject } from '../../../helpers/projectFake';

const mockedHasData = hasRemovableData as jest.MockedFunction<typeof hasRemovableData>;
const mockedRemove = removeDataBeforeDelete as jest.MockedFunction<typeof removeDataBeforeDelete>;
const mockedFiles = deleteProjectFiles as jest.MockedFunction<typeof deleteProjectFiles>;
const mockedCloud = cleanUpProjectCloud as jest.MockedFunction<typeof cleanUpProjectCloud>;

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

/** The question asked, as the real removal asks it; the agent's delete always asks, never gives. */
async function askedWith(askName: SaveAsAnswering | undefined): Promise<SaveAsAnswer> {
    if (askName === undefined) return undefined;
    if (typeof askName !== 'function') throw new Error('The agent\'s delete gave an answer up front; it asks.');
    return askName({ sentence: SENTENCE });
}

/** The removal asks about changes in a pack that is not the user's, as the real one does. */
function removalAsks() {
    mockedRemove.mockImplementation(async (_ctx, _project, _report, askName?: SaveAsAnswering) => {
        const answer = await askedWith(askName);
        return answer === undefined ? `Its datapack's data was not removed, so the project was kept: ${SENTENCE} They were not answered.` : undefined;
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    cleanupBehavior('ask');
    getAllProjects.mockResolvedValue([{ name: 'acme-demo', path: '/p/acme-demo' }]);
    loadProjectFromPath.mockResolvedValue(PROJECT);
    mockedHasData.mockResolvedValue(true);
    mockedRemove.mockResolvedValue(undefined);
    mockedFiles.mockResolvedValue(undefined);
    mockedCloud.mockResolvedValue({});
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

    it('removes the data before the cloud and the files when asked, and says so', async () => {
        const order: string[] = [];
        mockedRemove.mockImplementation(async () => void order.push('data'));
        mockedCloud.mockImplementation(async () => (order.push('cloud'), {}));
        mockedFiles.mockImplementation(async () => void order.push('files'));
        const tool = register();

        const answer = await tool.server.call({ ...CONFIRMED, removeData: true });

        expect(mockedRemove).toHaveBeenCalledWith(tool.ctx(), PROJECT, expect.any(Function), expect.any(Function));
        expect(order).toEqual(['data', 'cloud', 'files']);
        expect(answer).toMatchObject({ deleted: true, datapackData: { removed: true } });
    });

    it('deletes nothing when the data does not all come out, and says why', async () => {
        const why = "Its datapack's data was not removed, so the project was kept: Commerce refused 2 products.";
        mockedRemove.mockResolvedValue(why);

        const answer = await register().server.call({ ...CONFIRMED, removeData: true });

        expect(mockedCloud).not.toHaveBeenCalled();
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

    it.each([
        [{ changes: 'keep', saveAs: { displayName: ' My Copy ' } }, { saveAs: 'My Copy' }],
        [{ changes: 'drop' }, 'drop'],
    ])('answers the changes question with %j, then deletes', async (given, expected) => {
        removalAsks();
        let handed: unknown;
        mockedRemove.mockImplementation(async (_c, _p, _r, askName?: SaveAsAnswering) => void (handed = await askedWith(askName)));

        const answer = await register().server.call({ ...CONFIRMED, removeData: true, ...given });

        expect(handed).toStrictEqual(expected);
        expect(answer.deleted).toBe(true);
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
});
