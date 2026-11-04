/**
 * Deleting the pack a project uses: which pack may go with it (`deletablePackOf`: the SC's own,
 * used by no other local project), and every version of it the library lists as the SC's goes,
 * one delete per version, the result saying what went and what did not. Neither throws: the
 * project delete they ride on must finish whatever the library says.
 */

const mockOthers = jest.fn();
jest.mock('@/core/state/otherProjects', () => ({ loadOtherProjects: (...a: unknown[]) => mockOthers(...a) }));
const mockOpen = jest.fn();
jest.mock('@/features/data-installer/handlers/libraryWriter', () => ({ openLibraryWriter: (...a: unknown[]) => mockOpen(...a) }));
const mockFind = jest.fn();

// Below the mocks on purpose: they hoist above it.
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { deletablePackOf, deleteDemoPack, type DemoPackStore } from '@/features/projects-dashboard/services/demoPackDeletion';

const PACK = { name: 'acme-demo-1a2b3c', displayName: 'Acme Demo' };

function store(over: Partial<DemoPackStore> = {}): jest.Mocked<DemoPackStore> {
    return {
        list: jest.fn().mockResolvedValue([
            { name: PACK.name, version: '20261028-090000' },
            { name: PACK.name, version: '20261029-183005' },
        ]),
        remove: jest.fn().mockResolvedValue('deleted'),
        ...over,
    } as jest.Mocked<DemoPackStore>;
}

describe('deleteDemoPack', () => {
    it("deletes every version the library lists as the SC's, by name and version", async () => {
        const library = store();

        const result = await deleteDemoPack(library, PACK);

        expect(library.list).toHaveBeenCalledWith('acme-demo-1a2b3c');
        expect(library.remove.mock.calls).toEqual([
            [{ name: 'acme-demo-1a2b3c', version: '20261028-090000' }],
            [{ name: 'acme-demo-1a2b3c', version: '20261029-183005' }],
        ]);
        expect(result).toEqual({ type: 'datapack', name: 'Acme Demo', success: true });
    });

    it('carries on past a version that fails, and says which were not deleted', async () => {
        const library = store({
            remove: jest.fn().mockResolvedValueOnce('deleted').mockRejectedValueOnce(new Error('library said no')),
        });

        const result = await deleteDemoPack(library, PACK);

        expect(library.remove).toHaveBeenCalledTimes(2);
        expect(result).toEqual({
            type: 'datapack',
            name: 'Acme Demo',
            success: false,
            error: 'Deleted 1 of 2 versions. Not deleted: 20261029-183005 (library said no).',
        });
    });

    it('reports nothing to delete when the library lists no version of it', async () => {
        const result = await deleteDemoPack(store({ list: jest.fn().mockResolvedValue([]) }), PACK);

        expect(result).toEqual({ type: 'datapack', name: 'Acme Demo', success: true, skipped: true, error: 'No version of it was found.' });
    });

    it('fails, without throwing, when the library cannot list it', async () => {
        const result = await deleteDemoPack(store({ list: jest.fn().mockRejectedValue(new Error('down')) }), PACK);

        expect(result).toEqual({ type: 'datapack', name: 'Acme Demo', success: false, error: 'Its versions could not be listed: down' });
    });

});

describe('deletablePackOf', () => {
    const held = { name: PACK.name, version: '20261029-183005', store: 'library' as const };
    const row = (mine: boolean) => ({ id: { name: PACK.name, version: held.version }, displayName: 'Acme Demo', shared: false, dataTypes: [], art: {}, ...(mine ? { mine } : {}) });

    beforeEach(() => {
        jest.clearAllMocks();
        mockOthers.mockResolvedValue([]);
        mockFind.mockResolvedValue({ items: [row(true)], count: 1 });
        mockOpen.mockResolvedValue({ ok: true, client: { findDatapacks: mockFind } });
    });

    it("offers the pack the project uses when it is the SC's and no other project uses it", async () => {
        await expect(deletablePackOf(createMockHandlerContext(), createMockProject({ datapack: held }))).resolves.toEqual(PACK);
        expect(mockFind).toHaveBeenCalledWith({ datapackName: PACK.name });
    });

    it('offers nothing when another project on this machine uses it, without asking the library', async () => {
        mockOthers.mockResolvedValue([createMockProject({ name: 'other', datapack: { ...held, version: 'older' } })]);

        await expect(deletablePackOf(createMockHandlerContext(), createMockProject({ datapack: held }))).resolves.toBeUndefined();
        expect(mockFind).not.toHaveBeenCalled();
    });

    it("offers nothing for a pack that is not the SC's", async () => {
        mockFind.mockResolvedValue({ items: [row(false)], count: 1 });

        await expect(deletablePackOf(createMockHandlerContext(), createMockProject({ datapack: held }))).resolves.toBeUndefined();
    });

    it("offers nothing for a pack outside the library, or none, without asking anything", async () => {
        await expect(deletablePackOf(createMockHandlerContext(), createMockProject({ datapack: { name: 'bodea', version: 'main', store: 'installer' } }))).resolves.toBeUndefined();
        await expect(deletablePackOf(createMockHandlerContext(), createMockProject())).resolves.toBeUndefined();
        expect(mockOthers).not.toHaveBeenCalled();
    });

    it('offers nothing when the library cannot be asked: keeping a pack is the reversible answer', async () => {
        mockFind.mockRejectedValue(new Error('down'));

        await expect(deletablePackOf(createMockHandlerContext(), createMockProject({ datapack: held }))).resolves.toBeUndefined();
    });
});
