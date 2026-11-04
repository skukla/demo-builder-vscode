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
    engineThatInstalled: jest.fn(),
}));

import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';
import { contextForProject, settleChangesBeforeRemoval } from '@/features/data-installer/handlers/removalChanges';
import { engineThatInstalled } from '@/features/data-installer/services/buildDatapackEngine';
import { removeSampleData } from '@/features/data-installer/services/sampleDataInstall';
import { confirmSampleDataRemoval, removeProjectSampleData } from '@/features/eds/services/reset/edsResetSampleData';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

const mockedSettle = settleChangesBeforeRemoval as jest.MockedFunction<typeof settleChangesBeforeRemoval>;
const mockedRemove = removeSampleData as jest.MockedFunction<typeof removeSampleData>;
const mockedEngine = engineThatInstalled as jest.MockedFunction<typeof engineThatInstalled>;

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

    it('loses the changes only when Remove Without Saving is the answer, and still removes', async () => {
        mockedSettle.mockResolvedValueOnce(needsName).mockResolvedValueOnce({});

        await removeProjectSampleData(project(), createMockHandlerContext({ logger: createMockLogger() }), jest.fn(), jest.fn().mockResolvedValue('drop'));

        expect(mockedSettle.mock.calls[1][1]).toMatchObject({ answer: 'drop' });
        expect(mockedRemove).toHaveBeenCalledTimes(1);
    });

    it('keeps the data, removing nothing, when the question is closed unanswered', async () => {
        mockedSettle.mockResolvedValueOnce(needsName);

        await removeProjectSampleData(project(), createMockHandlerContext({ logger: createMockLogger() }), jest.fn(), jest.fn().mockResolvedValue(undefined));

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

    it('removes nothing when the changes could not be saved, says so, and does not throw', async () => {
        mockedSettle.mockResolvedValue({ response: { success: false, error: 'The library is not answering.', code: ErrorCode.CHANGES_NOT_SAVED } });
        const logger = createMockLogger();

        await expect(removeProjectSampleData(project(), createMockHandlerContext({ logger }), jest.fn())).resolves.toBeUndefined();

        expect(mockedRemove).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledTimes(1);
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
        mockedEngine.mockResolvedValue('demo-builder');
        const vscode = vscodeStub(undefined);

        await confirmSampleDataRemoval(project(), vscode, Promise.resolve(true));

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Anything you changed in it is saved first.'), expect.anything(), expect.anything(), expect.anything());
    });

    it('says nothing of it for a pack the service installed, which has no record of changes', async () => {
        mockedEngine.mockResolvedValue('service');
        const vscode = vscodeStub(undefined);

        await confirmSampleDataRemoval(project(), vscode, Promise.resolve(true));

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.not.stringContaining('own pack'), expect.anything(), expect.anything(), expect.anything());
    });
});
