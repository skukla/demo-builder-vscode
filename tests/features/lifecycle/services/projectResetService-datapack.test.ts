/**
 * A headless reset's Uninstall Datapack (step-05 S6, owner 2026-11-13, P5-Q3: "Uninstall it"). The
 * batch offers the box for any project with a datapack and a Commerce backend; ticked, the reset
 * removes the pack's data as a storefront reset does: the changes settled with the batch's answer
 * (`{ given }`), then the removal, before the components are rebuilt. A removal that stops is said
 * on the row and the reset still runs.
 *
 * The removal is mocked at its module, so what it is HANDED is asserted: the same project object
 * the reset saves (R1 clears its datapack on that object), and the batch's answer as given.
 */

jest.mock('@/features/eds/services/reset/edsResetSampleData', () => ({
    ...jest.requireActual('@/features/eds/services/reset/edsResetSampleData'),
    removeProjectSampleDataOutcome: jest.fn(),
}));

import {
    mockGetDependencies,
    mockGetFrontends,
    mockGetStackById,
    authManager,
    commandManager,
    createResetHandlerContext,
    createResetProject,
    installResetDefaults,
    mockCloneAllComponents,
    progressReport,
    runProjectResetAnswered,
} from './projectResetService-answered.testUtils';
import { removeProjectSampleDataOutcome } from '@/features/eds/services/reset/edsResetSampleData';
import { FailedAfterDatapack } from '@/features/eds/services/reset/resetDatapackStep';
import type { Project } from '@/types/base';

const mockedRemove = removeProjectSampleDataOutcome as jest.MockedFunction<typeof removeProjectSampleDataOutcome>;

/** A headless project whose datapack sits in its Commerce backend. */
const withPack = (overrides: Partial<Project> = {}): Project =>
    createResetProject({
        datapack: { name: 'bodea', version: 'main', store: 'library' },
        componentSelections: { backend: 'adobe-commerce-paas', dependencies: [] },
        ...overrides,
    });

function run(project: Project, answered?: Parameters<typeof runProjectResetAnswered>[2]) {
    const context = createResetHandlerContext();
    const outcome = runProjectResetAnswered(
        { project, context, commandManager, authManager },
        progressReport,
        answered
    );
    return { context, outcome };
}

beforeEach(() => {
    installResetDefaults();
    mockedRemove.mockResolvedValue({});
});

describe('a headless reset with Uninstall Datapack ticked', () => {
    it("hands the removal this project, the batch's report and the save question's answer as given", async () => {
        const project = withPack();
        const { context, outcome } = run(project, {
            removeDatapack: true,
            changes: { saveAs: 'My Bodea' },
        });

        await expect(outcome).resolves.toEqual({ success: true });

        expect(mockedRemove).toHaveBeenCalledTimes(1);
        const [handed, handedContext, handedReport, answering] = mockedRemove.mock.calls[0];
        expect(handed).toBe(project);
        expect(handedContext).toBe(context);
        expect(handedReport).toBe(progressReport);
        expect(answering).toStrictEqual({ given: { saveAs: 'My Bodea' } });
    });

    it('gives no answer when the pack had no changes to answer for, so nothing is dropped unasked', async () => {
        const project = withPack();

        await run(project, { removeDatapack: true }).outcome;

        expect(mockedRemove.mock.calls[0][3]).toStrictEqual({ given: undefined });
    });

    it('removes the data before the components are downloaded again', async () => {
        const order: string[] = [];
        mockedRemove.mockImplementation(async () => {
            order.push('remove');
            return {};
        });
        mockCloneAllComponents.mockImplementation(async () => {
            order.push('clone');
        });

        await run(withPack(), { removeDatapack: true, changes: 'drop' }).outcome;

        expect(order).toStrictEqual(['remove', 'clone']);
    });

    it('says on the row why the datapack stayed, and the reset still runs', async () => {
        mockedRemove.mockResolvedValue({ kept: 'Its changes could not be saved.' });

        const { outcome } = run(withPack(), {
            removeDatapack: true,
            changes: { saveAs: 'My Bodea' },
        });

        await expect(outcome).resolves.toEqual({
            success: true,
            warnings: ['Its datapack was not uninstalled: Its changes could not be saved.'],
        });
        expect(mockCloneAllComponents).toHaveBeenCalledTimes(1);
    });
});

describe('a headless reset that removes nothing', () => {
    it('leaves the data when the box was not ticked', async () => {
        await run(withPack(), { removeDatapack: false, changes: 'drop' }).outcome;

        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('leaves the data when no answer came with the run', async () => {
        await run(withPack()).outcome;

        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('removes nothing from a project with no Commerce backend, whatever the answer', async () => {
        await run(withPack({ componentSelections: { dependencies: [] } }), { removeDatapack: true })
            .outcome;

        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('removes nothing from a project with no datapack', async () => {
        await run(withPack({ datapack: undefined }), { removeDatapack: true }).outcome;

        expect(mockedRemove).not.toHaveBeenCalled();
    });
});

// Review, 2026-11-13: the removal ran before the components were read, so a project whose stack had
// gone emptied Commerce and then failed. The definitions are read first; the store is touched only
// once the reset can go on.
describe('a headless reset that cannot read what to rebuild', () => {
    it('removes nothing when its stack is no longer known, and the reset says why', async () => {
        mockGetStackById.mockReturnValue(undefined);

        await expect(run(withPack(), { removeDatapack: true, changes: 'drop' }).outcome).rejects.toThrow(/not found in stacks\.json/u);

        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('removes nothing when no component resolves, and the reset says why', async () => {
        mockGetFrontends.mockResolvedValue([]);
        mockGetDependencies.mockResolvedValue([]);

        await expect(run(withPack(), { removeDatapack: true, changes: 'drop' }).outcome).resolves.toEqual({
            success: false,
            error: 'No components found for this project stack',
        });
        expect(mockedRemove).not.toHaveBeenCalled();
    });
});

// A reset that fails after the store was touched still says what happened to the store.
describe('a headless reset that fails after the datapack step', () => {
    it('throws the same failure carrying that the datapack was uninstalled', async () => {
        mockCloneAllComponents.mockRejectedValue(new Error('git clone failed'));

        const thrown = await run(withPack(), { removeDatapack: true, changes: 'drop' }).outcome.catch((e: unknown) => e);

        expect(thrown).toBeInstanceOf(FailedAfterDatapack);
        expect(thrown).toMatchObject({ message: 'git clone failed', removal: {} });
    });

    it('carries that only part of it came out when the removal stopped partway', async () => {
        mockCloneAllComponents.mockRejectedValue(new Error('git clone failed'));
        mockedRemove.mockResolvedValue({ kept: 'Categories could not be removed.', partly: true });

        const thrown = await run(withPack(), { removeDatapack: true }).outcome.catch((e: unknown) => e);

        expect(thrown).toMatchObject({ message: 'git clone failed', removal: { kept: 'Categories could not be removed.', partly: true } });
    });

    it('CONTROL: with no datapack step, a failure mid-rebuild reaches the batch as it always did', async () => {
        mockCloneAllComponents.mockRejectedValue(new Error('git clone failed'));

        await expect(run(withPack(), { removeDatapack: false }).outcome).rejects.toThrow('git clone failed');
    });
});

// R1: a removal that took everything clears the project's datapack on the object it was handed; the
// reset's later saves write that same object, so the clear is what lands on disk.
describe("R1's clear through the reset's saves", () => {
    it('saves the project with no datapack after a removal that took everything', async () => {
        mockedRemove.mockImplementation(async (handed) => {
            handed.datapack = undefined;
            return {};
        });
        const { context, outcome } = run(withPack(), { removeDatapack: true, changes: 'drop' });

        await outcome;

        const saves = (context.stateManager.saveProject as jest.Mock).mock.calls;
        expect(saves.length).toBeGreaterThan(0);
        expect((saves.at(-1)?.[0] as Project).datapack).toBeUndefined();
    });
});
