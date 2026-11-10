/**
 * Uninstall Datapack on a project delete (walk F96): offered only where Demo Builder installed
 * the project's datapack in a Commerce instance, named as the library names the pack, and removed
 * through the reset's own removal, whose reason, when the data did not all come out, is what stops
 * the delete. The store and the library are mocked; the removal's own suite is
 * `sampleDataRemovalChanges.test.ts`.
 */

jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({ installedByDemoBuilder: jest.fn() }));
jest.mock('@/features/data-installer/handlers/libraryWriter', () => ({ libraryDisplayName: jest.fn() }));
jest.mock('@/features/eds/services/reset/edsResetSampleData', () => ({ removeProjectSampleData: jest.fn() }));

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { libraryDisplayName } from '@/features/data-installer/handlers/libraryWriter';
import { installedByDemoBuilder } from '@/features/data-installer/services/buildDatapackEngine';
import { removeProjectSampleData } from '@/features/eds/services/reset/edsResetSampleData';
import { hasRemovableData, removableDataOf, removeDataBeforeDelete } from '@/features/projects-dashboard/services/datapackDataRemoval';
import type { Project } from '@/types/base';

const mockedOurs = installedByDemoBuilder as jest.MockedFunction<typeof installedByDemoBuilder>;
const mockedName = libraryDisplayName as jest.MockedFunction<typeof libraryDisplayName>;
const mockedRemove = removeProjectSampleData as jest.MockedFunction<typeof removeProjectSampleData>;

const PACK = { name: 'bodea', version: 'main', store: 'library' as const };
const withPack = (overrides: Partial<Project> = {}): Project =>
    createMockProject({ path: '/projects/acme', datapack: PACK, componentSelections: { backend: 'adobe-commerce-accs' }, ...overrides });

beforeEach(() => {
    jest.clearAllMocks();
    mockedOurs.mockResolvedValue(true);
    mockedName.mockResolvedValue('Bodea Demo');
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

    it("names the pack as the library does, its own name when the library has none", async () => {
        await expect(removableDataOf(createMockHandlerContext(), withPack())).resolves.toStrictEqual({ displayName: 'Bodea Demo' });
        mockedName.mockResolvedValue(undefined);
        await expect(removableDataOf(createMockHandlerContext(), withPack())).resolves.toStrictEqual({ displayName: 'bodea' });
        mockedOurs.mockResolvedValue(false);
        await expect(removableDataOf(createMockHandlerContext(), withPack())).resolves.toBeUndefined();
    });
});

describe('removing it before the delete', () => {
    it("removes through the reset's removal with the answer it was handed, and lets the delete go on", async () => {
        mockedRemove.mockResolvedValue(undefined);
        const context = createMockHandlerContext();
        const project = withPack();
        const report = jest.fn();
        const askName = jest.fn();

        await expect(removeDataBeforeDelete(context, project, report, askName)).resolves.toBeUndefined();

        expect(mockedRemove).toHaveBeenCalledWith(project, context, report, askName);
    });

    it('says the project was kept, and why, when the data did not all come out', async () => {
        mockedRemove.mockResolvedValue('Commerce refused 2 products.');

        await expect(removeDataBeforeDelete(createMockHandlerContext(), withPack(), jest.fn())).resolves.toBe(
            "Its datapack was not uninstalled, so the project was kept: Commerce refused 2 products.",
        );
    });
});
