/**
 * Finding a pack's settings layer in the library (datapack-engine step 09, decision 1): a library
 * pack named `<pack>-settings`, holding only `store_config`, its newest version.
 */

import { findSettingsLayer, myLayerVersions } from '@/features/data-installer/services/settingsLayer';
import type { DataItem } from '@/features/data-installer/types';
import type { DatapackId } from '@/types/datapack';
import { GRID, libraryRow, settingRow } from '../../../helpers/settingsLayerFixtures';

function reads(items: ReturnType<typeof libraryRow>[]) {
    return {
        findDatapacks: jest.fn(async () => ({ items, count: items.length })),
        getDataItem: jest.fn(async (_id: DatapackId, dataType: string): Promise<DataItem> => ({ dataType, records: [settingRow(GRID, '24')] })),
    };
}

describe('findSettingsLayer', () => {
    it('asks the library by name, and reads only store_config of the newest version', async () => {
        const library = reads([
            libraryRow('bodea-settings', 'old', { updatedAt: '2026-10-01T00:00:00Z' }),
            libraryRow('bodea-settings', 'new', { updatedAt: '2026-11-01T00:00:00Z' }),
        ]);

        const layer = await findSettingsLayer(library, 'bodea');

        expect(library.findDatapacks).toHaveBeenCalledWith({ datapackName: 'bodea-settings' });
        expect(library.getDataItem).toHaveBeenCalledTimes(1);
        expect(library.getDataItem).toHaveBeenCalledWith({ name: 'bodea-settings', version: 'new' }, 'store_config');
        expect(layer).toMatchObject({ id: { name: 'bodea-settings', version: 'new' }, records: [settingRow(GRID, '24')] });
    });

    it('takes a newer version over main: the newest is the newest', async () => {
        const library = reads([
            libraryRow('bodea-settings', 'main', { updatedAt: '2026-10-01T00:00:00Z' }),
            libraryRow('bodea-settings', '20261101-120000', { updatedAt: '2026-11-01T12:00:00Z' }),
        ]);

        expect((await findSettingsLayer(library, 'bodea'))?.id.version).toBe('20261101-120000');
    });

    it('passes over an archived version while a live one exists', async () => {
        const library = reads([
            libraryRow('bodea-settings', 'main-archived-20261102', { updatedAt: '2026-11-02T00:00:00Z' }),
            libraryRow('bodea-settings', 'v1', { updatedAt: '2026-10-01T00:00:00Z' }),
        ]);

        expect((await findSettingsLayer(library, 'bodea'))?.id.version).toBe('v1');
    });

    it.each([
        ['nothing by that name', []],
        ['a longer name the library matched loosely', [libraryRow('bodea-settings-old', 'v1')]],
        ['a pack of that name holding data too, which is a demo', [libraryRow('bodea-settings', 'v1', { dataTypes: ['products', 'store_config'] })]],
        ['a pack of that name holding nothing yet', [libraryRow('bodea-settings', 'v1', { dataTypes: [] })]],
    ])('finds no layer for %s, and reads no rows', async (_what, items) => {
        const library = reads(items);

        expect(await findSettingsLayer(library, 'bodea')).toBeUndefined();
        expect(library.getDataItem).not.toHaveBeenCalled();
    });

    it('throws when the stored rows cannot be read: "no layer" would put recorded settings back', async () => {
        const library = reads([libraryRow('bodea-settings', 'v1')]);
        library.getDataItem.mockResolvedValue({ dataType: 'store_config', rawData: '{' });

        await expect(findSettingsLayer(library, 'bodea')).rejects.toThrow('bodea-settings@v1');
    });
});

describe('myLayerVersions', () => {
    it("lists only the SC's own versions that are layers", async () => {
        const library = reads([
            libraryRow('bodea-settings', 'mine'),
            libraryRow('bodea-settings', 'theirs', { mine: undefined }),
            libraryRow('bodea-settings', 'data', { dataTypes: ['products'] }),
        ]);

        expect((await myLayerVersions(library, 'bodea')).map((row) => row.id.version)).toEqual(['mine']);
    });
});
