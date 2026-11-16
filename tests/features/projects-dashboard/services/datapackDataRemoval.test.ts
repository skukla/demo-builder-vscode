/**
 * Uninstall Datapack on a project delete (walk F96): offered only where Demo Builder installed
 * the project's datapack in a Commerce instance, and removed through the reset's own removal, whose reason, when the data did not all come out, is what stops
 * the delete. The store and the library are mocked; the removal's own suite is
 * `sampleDataRemovalChanges.test.ts`.
 */

jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({ installedByDemoBuilder: jest.fn() }));
jest.mock('@/features/eds/services/reset/edsResetDatapack', () => ({ removeProjectSampleDataOutcome: jest.fn() }));

import { LEFT_NOTE, REMOVAL_LEFT_IN_STORE, REMOVAL_NO_TARGET } from '../../../helpers/datapackRemovalFixtures';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { installedByDemoBuilder } from '@/features/data-installer/services/buildDatapackEngine';
import { removeProjectSampleDataOutcome } from '@/features/eds/services/reset/edsResetDatapack';
import { hasRemovableData, removeDataBeforeDelete } from '@/features/projects-dashboard/services/datapackDataRemoval';
import type { Project } from '@/types/base';

const mockedOurs = installedByDemoBuilder as jest.MockedFunction<typeof installedByDemoBuilder>;
const mockedRemove = removeProjectSampleDataOutcome as jest.MockedFunction<typeof removeProjectSampleDataOutcome>;

const PACK = { name: 'bodea', version: 'main', store: 'library' as const };
const withPack = (overrides: Partial<Project> = {}): Project =>
    createMockProject({ path: '/projects/acme', datapack: PACK, componentSelections: { backend: 'adobe-commerce-accs' }, ...overrides });

beforeEach(() => {
    jest.clearAllMocks();
    mockedOurs.mockResolvedValue(true);
});

describe('whether a delete may remove datapack data', () => {
    it('only with a datapack Demo Builder installed and a Commerce backend', async () => {
        await expect(hasRemovableData(withPack())).resolves.toBe(true);
        expect(mockedOurs).toHaveBeenCalledWith('/projects/acme', { name: 'bodea', version: 'main' });

        await expect(hasRemovableData(withPack({ datapack: undefined }))).resolves.toBe(false);
        await expect(hasRemovableData(withPack({ componentSelections: {} }))).resolves.toBe(false);
        mockedOurs.mockResolvedValue(false);
        await expect(hasRemovableData(withPack())).resolves.toBe(false);
    });
});

describe('removing it before the delete', () => {
    it("removes through the reset's removal with the answer it was handed, and lets the delete go on", async () => {
        mockedRemove.mockResolvedValue({});
        const context = createMockHandlerContext();
        const project = withPack();
        const report = jest.fn();
        const askName = jest.fn();

        await expect(removeDataBeforeDelete(context, project, report, askName)).resolves.toStrictEqual({});

        expect(mockedRemove).toHaveBeenCalledWith(project, context, report, askName);
    });

    it('says the project was kept, and why, when the data did not all come out', async () => {
        mockedRemove.mockResolvedValue({ kept: 'Commerce refused 2 products.' });

        await expect(removeDataBeforeDelete(createMockHandlerContext(), withPack(), jest.fn())).resolves.toStrictEqual({
            stopped: "Its datapack was not uninstalled, so the project was kept: Commerce refused 2 products.",
        });
    });

    // step-05 S7: a removal that stopped partway read "was not uninstalled" over its own reason
    // "The datapack was not all uninstalled.", which contradicted it.
    it('says part of it was uninstalled when the removal stopped partway', async () => {
        mockedRemove.mockResolvedValue({ kept: 'Categories could not be removed.', partly: true });

        await expect(removeDataBeforeDelete(createMockHandlerContext(), withPack(), jest.fn())).resolves.toStrictEqual({
            stopped: 'Part of its datapack was uninstalled, so the project was kept: Categories could not be removed.',
        });
    });

    // step-07 D1 (R1-a): a removal that left part in Commerce went on to delete the files, so the
    // data stayed in the store with no project naming it.
    it('keeps the project when the removal left part of the datapack in Commerce, naming what', async () => {
        mockedRemove.mockResolvedValue(REMOVAL_LEFT_IN_STORE);

        await expect(removeDataBeforeDelete(createMockHandlerContext(), withPack(), jest.fn())).resolves.toStrictEqual({
            stopped: `Part of its datapack was left in Commerce, so the project was kept: ${LEFT_NOTE}`,
        });
    });

    it('still keeps it when the engine gave no note', async () => {
        mockedRemove.mockResolvedValue({ leftInStore: true });

        await expect(removeDataBeforeDelete(createMockHandlerContext(), withPack(), jest.fn())).resolves.toStrictEqual({
            stopped: 'Part of its datapack was left in Commerce, so the project was kept.',
        });
    });

    // step-07 (owner, 2026-11-14): nothing was ever installed without a website and store view.
    it('lets the delete go on, with no line, saying nothing was installed, when no install target was ever recorded', async () => {
        mockedRemove.mockResolvedValue(REMOVAL_NO_TARGET);

        await expect(removeDataBeforeDelete(createMockHandlerContext(), withPack(), jest.fn())).resolves.toStrictEqual({ nothingInstalled: true });
    });

    // Owner 2026-11-14 (item 5): the delete's row says where the changes went.
    it("names the SC's own pack the changes were saved into, and lets the delete go on", async () => {
        mockedRemove.mockResolvedValue({ savedInto: 'My Luma' });

        await expect(removeDataBeforeDelete(createMockHandlerContext(), withPack(), jest.fn())).resolves.toStrictEqual({ saved: 'Saved to My Luma.' });
    });
});
