/**
 * The other doors to a pack's removal: a project reset and an Edit that drops the pack, which both
 * come through `removeProjectSampleData` with their own question already asked (datapack-engine
 * step 05). They go through the one path, and a save that fails removes nothing and fails nothing.
 */

jest.mock('@/features/data-installer/handlers/removalChanges', () => ({
    contextForProject: jest.fn((context: unknown) => context),
    settleChangesBeforeRemoval: jest.fn(),
}));
jest.mock('@/features/data-installer/services/sampleDataInstall', () => ({
    removeSampleData: jest.fn(),
}));
jest.mock('@/features/data-installer/services/sampleDataInstallDeps', () => ({
    buildSampleDataDeps: jest.fn(() => ({})),
}));
jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({
    installedByDemoBuilder: jest.fn(),
}));

import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';
import { contextForProject, settleChangesBeforeRemoval } from '@/features/data-installer/handlers/removalChanges';
import { installedByDemoBuilder } from '@/features/data-installer/services/buildDatapackEngine';
import { removeSampleData } from '@/features/data-installer/services/sampleDataInstall';
import type { NameMemory } from '@/features/data-installer/services/packNames';
import { confirmSampleDataRemoval, removeProjectSampleData } from '@/features/eds/services/reset/edsResetSampleData';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

const mockedSettle = settleChangesBeforeRemoval as jest.MockedFunction<typeof settleChangesBeforeRemoval>;
const mockedRemove = removeSampleData as jest.MockedFunction<typeof removeSampleData>;
const mockedOurs = installedByDemoBuilder as jest.MockedFunction<typeof installedByDemoBuilder>;

const project = (): Project =>
    createMockProject({ name: 'acme', path: '/nonexistent/acme', datapack: { name: 'bodea', version: 'main', store: 'library' } });

beforeEach(() => {
    jest.clearAllMocks();
    mockedSettle.mockResolvedValue({});
    mockedRemove.mockResolvedValue({ ran: true, outcome: 'success' });
});

describe("removeProjectSampleData, when the demo's pack is not the SC's (Save As, 2026-11-03)", () => {
    const sentence = 'You changed 2 things since it was installed.';
    const needsName = { response: { success: false, error: 'Name it.', code: ErrorCode.CHANGES_NEED_ANSWER, data: { sentence } } };

    it('asks for a name, with what changed, then saves under it and removes', async () => {
        mockedSettle.mockResolvedValueOnce(needsName).mockResolvedValueOnce({});
        const askName = jest.fn().mockResolvedValue({ saveAs: 'My Bodea' });

        await removeProjectSampleData(project(), createMockHandlerContext({ logger: createMockLogger() }), jest.fn(), askName);

        expect(askName).toHaveBeenCalledWith({ sentence });
        expect(mockedSettle.mock.calls[1][1]).toMatchObject({ answer: 'keep', saveAs: { displayName: 'My Bodea' } });
        expect(mockedRemove).toHaveBeenCalledTimes(1);
    });

    it('loses the changes only when Uninstall Without Saving is the answer, and still removes', async () => {
        mockedSettle.mockResolvedValueOnce(needsName).mockResolvedValueOnce({});

        await removeProjectSampleData(project(), createMockHandlerContext({ logger: createMockLogger() }), jest.fn(), jest.fn().mockResolvedValue('drop'));

        expect(mockedSettle.mock.calls[1][1]).toMatchObject({ answer: 'drop' });
        expect(mockedRemove).toHaveBeenCalledTimes(1);
    });

    it('keeps the data, removing nothing, when the question is closed unanswered, and says why', async () => {
        mockedSettle.mockResolvedValueOnce(needsName);

        const why = await removeProjectSampleData(project(), createMockHandlerContext({ logger: createMockLogger() }), jest.fn(), jest.fn().mockResolvedValue(undefined));

        // A project delete stops on this (walk F96), so it names what was not answered.
        expect(why).toBe(`${sentence} They were not answered.`);

        expect(mockedSettle).toHaveBeenCalledTimes(1);
        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('removes nothing with no way to ask, and says so', async () => {
        mockedSettle.mockResolvedValueOnce(needsName);
        const logger = createMockLogger();

        await removeProjectSampleData(project(), createMockHandlerContext({ logger }), jest.fn());

        expect(mockedRemove).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});

/**
 * A batch's answer is given before anything runs (step-05 S1, J7-2). It goes with the FIRST read:
 * asked only when a name is needed, a "drop" or a new name for the SC's own pack would never be
 * asked for, and the run would save into their pack whatever they pressed.
 */
describe('removeProjectSampleData, answered up front by a batch', () => {
    const base = { pack: { name: 'bodea', version: 'main' }, source: 'library', unanswered: 'keep' };
    const context = () => createMockHandlerContext({ logger: createMockLogger() });

    it("sends 'drop' with the first read, then removes", async () => {
        await expect(removeProjectSampleData(project(), context(), jest.fn(), { given: 'drop' })).resolves.toBeUndefined();

        expect(mockedSettle).toHaveBeenCalledTimes(1);
        expect(mockedSettle.mock.calls[0][1]).toStrictEqual({ ...base, answer: 'drop' });
        expect(mockedRemove).toHaveBeenCalledTimes(1);
    });

    it('sends a new name with the first read, as a save into a new datapack', async () => {
        await removeProjectSampleData(project(), context(), jest.fn(), { given: { saveAs: 'My Copy' } });

        expect(mockedSettle).toHaveBeenCalledTimes(1);
        expect(mockedSettle.mock.calls[0][1]).toStrictEqual({ ...base, answer: 'keep', saveAs: { displayName: 'My Copy' } });
    });

    it('removes nothing when that name is refused, and says why, asking nothing again', async () => {
        mockedSettle.mockResolvedValueOnce({ response: { success: false, error: 'You already have a datapack named My Copy.', code: ErrorCode.CHANGES_NEED_ANSWER } });

        const why = await removeProjectSampleData(project(), context(), jest.fn(), { given: { saveAs: 'My Copy' } });

        expect(why).toBe('You already have a datapack named My Copy.');
        expect(mockedSettle).toHaveBeenCalledTimes(1);
        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it("with no answer given, reads as today: the SC's own pack is saved into, another keeps its data", async () => {
        const sentence = 'You changed 2 things since it was installed.';
        mockedSettle.mockResolvedValueOnce({ response: { success: false, error: 'Name it.', code: ErrorCode.CHANGES_NEED_ANSWER, data: { sentence } } });

        const why = await removeProjectSampleData(project(), context(), jest.fn(), { given: undefined });

        expect(mockedSettle.mock.calls[0][1]).toStrictEqual(base);
        expect(why).toBe(`${sentence} They were not answered.`);
        expect(mockedRemove).not.toHaveBeenCalled();
    });
});

describe('removeProjectSampleData', () => {
    it('settles the changes first, with no answer needed, then removes', async () => {
        const order: string[] = [];
        mockedSettle.mockImplementation(async () => (order.push('settle'), {}));
        mockedRemove.mockImplementation(async () => (order.push('remove'), { ran: true, outcome: 'success' }));
        const context = createMockHandlerContext({ logger: createMockLogger() });
        const held = project();

        await removeProjectSampleData(held, context, jest.fn());

        expect(contextForProject).toHaveBeenCalledWith(context, held);
        expect(mockedSettle).toHaveBeenCalledWith(context, { pack: { name: 'bodea', version: 'main' }, source: 'library', unanswered: 'keep' }, expect.any(Function));
        expect(order).toEqual(['settle', 'remove']);
    });

    it('removes nothing when the changes could not be saved, says why, and does not throw', async () => {
        mockedSettle.mockResolvedValue({ response: { success: false, error: 'The library is not answering.', code: ErrorCode.CHANGES_NOT_SAVED } });
        const logger = createMockLogger();

        await expect(removeProjectSampleData(project(), createMockHandlerContext({ logger }), jest.fn())).resolves.toBe('The library is not answering.');

        expect(mockedRemove).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledTimes(1);
    });

    // What a project delete reads to decide whether the files may go (walk F96).
    it('answers nothing when the data all came out, and why when it did not', async () => {
        const context = createMockHandlerContext({ logger: createMockLogger() });

        await expect(removeProjectSampleData(project(), context, jest.fn())).resolves.toBeUndefined();

        mockedRemove.mockResolvedValueOnce({ ran: true, outcome: 'failed', reason: 'Commerce refused 2 products.' });
        await expect(removeProjectSampleData(project(), context, jest.fn())).resolves.toBe('Commerce refused 2 products.');

        mockedRemove.mockResolvedValueOnce({ ran: false });
        await expect(removeProjectSampleData(project(), context, jest.fn())).resolves.toBe('The datapack was not uninstalled.');

        mockedRemove.mockRejectedValueOnce(new Error('socket hang up'));
        await expect(removeProjectSampleData(project(), context, jest.fn())).resolves.toBe('socket hang up');
    });

    it('passes the save\'s stages on', async () => {
        mockedSettle.mockImplementation(async (_context, _request, report) => (report('Saving to the library'), {}));
        const report = jest.fn();

        await removeProjectSampleData(project(), createMockHandlerContext({ logger: createMockLogger() }), report);

        expect(report).toHaveBeenCalledWith('Saving to the library');
    });
});

/**
 * Reset, a batch reset, a delete that stops later and an Edit all remove through here, and the
 * project must stop naming a pack Commerce no longer holds (step-05 R1, the S7 b defect). The rule
 * is the Datapacks screen's Uninstall's (`importJobWatch`): only a removal that finished with
 * nothing left in the store clears it.
 */
describe('the project record after the removal', () => {
    const failedBefore = { name: 'bodea', version: 'main', reason: 'Products refused.', at: '2026-11-01T00:00:00.000Z', retries: 0 };
    const held = (): Project =>
        createMockProject({
            name: 'acme',
            path: '/nonexistent/acme',
            datapack: { name: 'bodea', version: 'main', store: 'library' },
            datapackInstallFailure: failedBefore,
        });

    it('clears the pack and its failed install on the project it was handed, and saves that project', async () => {
        const context = createMockHandlerContext({ logger: createMockLogger() });
        const project = held();

        await expect(removeProjectSampleData(project, context, jest.fn())).resolves.toBeUndefined();

        expect(project.datapack).toBeUndefined();
        expect(project.datapackInstallFailure).toBeUndefined();
        // Not the open project: written to disk without making it the open one (a batch's rows).
        expect(context.stateManager.saveProjectConfigOnly).toHaveBeenCalledWith(project);
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('saves the open project the ordinary way, so its screens see the change', async () => {
        const project = held();
        const stateManager = createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) });
        const context = createMockHandlerContext({ logger: createMockLogger(), stateManager });

        await removeProjectSampleData(project, context, jest.fn());

        expect(stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(stateManager.saveProject.mock.calls[0]?.[0]?.datapack).toBeUndefined();
        expect(stateManager.saveProjectConfigOnly).not.toHaveBeenCalled();
    });

    it.each<[string, () => void]>([
        ['finished but left part of the pack in the store', () => mockedRemove.mockResolvedValueOnce({ ran: true, outcome: 'success', leftInStore: true })],
        ['ran and did not succeed', () => mockedRemove.mockResolvedValueOnce({ ran: true, outcome: 'failed', reason: 'Commerce refused 2 products.' })],
        ['was skipped', () => mockedRemove.mockResolvedValueOnce({ ran: false, skipped: true, reason: 'The service holds no data for this datapack.' })],
        ['threw', () => mockedRemove.mockRejectedValueOnce(new Error('socket hang up'))],
        ['never started: the changes could not be saved', () => mockedSettle.mockResolvedValueOnce({ response: { success: false, error: 'The library is not answering.', code: ErrorCode.CHANGES_NOT_SAVED } })],
    ])('keeps the pack named when the removal %s', async (_case, arrange) => {
        arrange();
        const context = createMockHandlerContext({ logger: createMockLogger() });
        const project = held();

        await removeProjectSampleData(project, context, jest.fn());

        expect(project.datapack).toStrictEqual({ name: 'bodea', version: 'main', store: 'library' });
        expect(project.datapackInstallFailure).toStrictEqual(failedBefore);
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
        expect(context.stateManager.saveProjectConfigOnly).not.toHaveBeenCalled();
    });

    it('still answers that the data came out when the record could not be saved', async () => {
        const logger = createMockLogger();
        const stateManager = createMockStateManager({ saveProjectConfigOnly: jest.fn().mockRejectedValue(new Error('disk full')) });
        const context = createMockHandlerContext({ logger, stateManager });

        // A delete reads the answer to decide whether the files may go: the data is out of Commerce.
        await expect(removeProjectSampleData(held(), context, jest.fn())).resolves.toBeUndefined();

        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});

describe('the question these doors ask', () => {
    const vscodeStub = (answer: unknown) => ({ window: { showWarningMessage: jest.fn().mockResolvedValue(answer) } }) as unknown as typeof import('vscode');

    it('says where changes go, for a pack Demo Builder installed', async () => {
        mockedOurs.mockResolvedValue(true);
        const vscode = vscodeStub(undefined);

        const names = { [project().datapack?.name ?? '']: 'My Luma' };
        const memory: NameMemory = { get: <T,>() => names as T, update: jest.fn().mockResolvedValue(undefined) };
        await confirmSampleDataRemoval(project(), vscode, Promise.resolve(true), { memory });

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'Uninstall My Luma Too?',
            { modal: true, detail: 'Deletes what it installed in Commerce. Your changes are saved first. Can take several minutes.' },
            expect.anything(),
            expect.anything(),
        );
    });

    it('never names the pack by its id: one never read here is "the Datapack"', async () => {
        mockedOurs.mockResolvedValue(true);
        const vscode = vscodeStub(undefined);

        await confirmSampleDataRemoval(project(), vscode, Promise.resolve(true));

        const [title] = jest.mocked(vscode.window.showWarningMessage).mock.calls[0] ?? [];
        expect(title).toBe('Uninstall the Datapack Too?');
    });

    it('says nothing of it for a pack the service installed, which has no record of changes', async () => {
        mockedOurs.mockResolvedValue(false);
        const vscode = vscodeStub(undefined);

        await confirmSampleDataRemoval(project(), vscode, Promise.resolve(true));

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.any(String),
            { modal: true, detail: 'Deletes what it installed in Commerce. Can take several minutes.' },
            expect.anything(),
            expect.anything(),
        );
    });
});
