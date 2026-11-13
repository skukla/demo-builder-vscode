/**
 * Uninstall Datapack on a project delete (walk F96): offered only where Demo Builder installed
 * the project's datapack in a Commerce instance, and removed through the reset's own removal, whose reason, when the data did not all come out, is what stops
 * the delete. The store and the library are mocked; the removal's own suite is
 * `sampleDataRemovalChanges.test.ts`.
 */

jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({ installedByDemoBuilder: jest.fn() }));
jest.mock('@/features/eds/services/reset/edsResetSampleData', () => ({ removeProjectSampleDataOutcome: jest.fn() }));

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { installedByDemoBuilder } from '@/features/data-installer/services/buildDatapackEngine';
import { removeProjectSampleDataOutcome } from '@/features/eds/services/reset/edsResetSampleData';
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

        await expect(removeDataBeforeDelete(context, project, report, askName)).resolves.toBeUndefined();

        expect(mockedRemove).toHaveBeenCalledWith(project, context, report, askName);
    });

    it('says the project was kept, and why, when the data did not all come out', async () => {
        mockedRemove.mockResolvedValue({ kept: 'Commerce refused 2 products.' });

        await expect(removeDataBeforeDelete(createMockHandlerContext(), withPack(), jest.fn())).resolves.toBe(
            "Its datapack was not uninstalled, so the project was kept: Commerce refused 2 products.",
        );
    });

    // step-05 S7: a removal that stopped partway read "was not uninstalled" over its own reason
    // "The datapack was not all uninstalled.", which contradicted it.
    it('says part of it was uninstalled when the removal stopped partway', async () => {
        mockedRemove.mockResolvedValue({ kept: 'Categories could not be removed.', partly: true });

        await expect(removeDataBeforeDelete(createMockHandlerContext(), withPack(), jest.fn())).resolves.toBe(
            'Part of its datapack was uninstalled, so the project was kept: Categories could not be removed.',
        );
    });
});
