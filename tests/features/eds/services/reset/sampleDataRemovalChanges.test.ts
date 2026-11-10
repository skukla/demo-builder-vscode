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
