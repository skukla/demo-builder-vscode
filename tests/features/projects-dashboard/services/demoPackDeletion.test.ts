/**
 * Deleting a project's own pack (datapack-engine step 07): every version of it the library
 * lists as the SC's goes, one delete per version, and the result says what went and what did
 * not. It never throws: the project delete it rides on must finish whatever the library says.
 */

import { deleteDemoPack, type DemoPackStore } from '@/features/projects-dashboard/services/demoPackDeletion';

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

        expect(result).toEqual({ type: 'datapack', name: 'Acme Demo', success: true, skipped: true, error: 'The datapack library holds no version of it.' });
    });

    it('fails, without throwing, when the library cannot list it', async () => {
        const result = await deleteDemoPack(store({ list: jest.fn().mockRejectedValue(new Error('down')) }), PACK);

        expect(result).toEqual({ type: 'datapack', name: 'Acme Demo', success: false, error: 'The datapack library could not list it: down' });
    });

    it('names the pack by its library name when it has no display name', async () => {
        const result = await deleteDemoPack(store(), { name: PACK.name });

        expect(result.name).toBe('acme-demo-1a2b3c');
    });
});
