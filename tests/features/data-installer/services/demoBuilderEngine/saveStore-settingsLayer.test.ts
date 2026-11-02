/**
 * "Save store changes" and a settings layer (datapack-engine step 09): a pack that holds no settings
 * of its own keeps them out of the new version; they go to the layer beside it, named for the demo's
 * own pack, so the next install finds them. A pack that holds its own keeps them. Either way the
 * record keeps the settings, so one removal still puts them back.
 */

import { installRecordPath, openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { saveStoreChanges } from '@/features/data-installer/services/demoBuilderEngine/saveStore';
import { configListPath } from '@/features/app-builder/services/storePreparation/configFix';
import { GRID, LIST, foundLayer, settingRow } from '../../../../helpers/settingsLayerFixtures';
import { NOW, PACK, PROJECT } from './demoBuilderEngine.testUtils';
import { ITEMS, RACKS, SAVE_AS, deps } from './storeChanges.testUtils';

const stored = (values: Record<string, string>, paths = Object.keys(values)) => ({
    [configListPath(paths, 'default')]: { items: Object.entries(values).map(([path, value]) => ({ path, value, scope: 'default' })) },
});
const recordedGrid = { kind: 'store_config', id: `${GRID}@default`, key: `${GRID}@default`, previous: { path: GRID, scope: 'default', stored: '12', effective: '12', wrote: '24' } };
const kindsOf = (file: { items: Array<{ dataType: string }> }) => file.items.map((i) => i.dataType);

async function savedLayered(reads: Record<string, unknown>, rows: Record<string, unknown> = { categories: { categories: [RACKS] } }, findLayer: () => Promise<ReturnType<typeof foundLayer> | undefined> = async () => foundLayer()) {
    const made = await deps(true, reads, rows);
    await (await openInstallRecord(made.files, PROJECT, PACK, NOW)).record(recordedGrid);
    const result = await saveStoreChanges({ ...made.d, findLayer }, { pack: PACK, source: 'library', saveAs: SAVE_AS }, made.write);
    return { ...made, result };
}

describe('saving a pack that has a settings layer', () => {
    it('writes the data to the new version and the settings to its layer, data first, at the same version', async () => {
        const { written, result } = await savedLayered(stored({ [GRID]: '36' }));

        expect(written.map((file) => `${file.id.name}@${file.id.version}`)).toEqual(['acme-demo-1a2b3c@20261029-183000', 'acme-demo-1a2b3c-settings@20261029-183000']);
        expect(kindsOf(written[0])).toEqual(['categories']);
        expect(written[1].items).toEqual([{ dataType: 'store_config', records: [settingRow(GRID, '36')] }]);
        expect(written[1].displayName).toBe('Acme Demo settings');
        expect(result.counts).not.toHaveProperty('store_config');
        expect(result.settingsLayer).toEqual({ datapackName: 'acme-demo-1a2b3c-settings', version: '20261029-183000', settings: 1 });
        expect(result.sentence).toContain('Its 1 store setting is saved beside it, in acme-demo-1a2b3c-settings.');
    });

    it('takes a setting the layer names that the record does not list: it was already at its value', async () => {
        const { written } = await savedLayered(stored({ [LIST]: '10', [GRID]: '36' }, [GRID, LIST]), undefined, async () => foundLayer([settingRow(GRID, '24'), settingRow(LIST, '10')]));

        expect(written[1].items[0].records).toEqual([settingRow(GRID, '36'), settingRow(LIST, '10')]);
    });

    it('keeps the settings on the moved record, now against the value saved, so one removal still puts back what was there', async () => {
        const { files } = await savedLayered(stored({ [GRID]: '36' }));

        const record = await readInstallRecord(files, PROJECT, SAVE_AS.id);

        expect(record?.created.find((o) => o.kind === 'store_config')).toEqual({
            ...recordedGrid,
            previous: { path: GRID, scope: 'default', stored: '12', effective: '12', wrote: '36' },
        });
        expect(files.data.has(installRecordPath(PROJECT, PACK))).toBe(false);
    });

    it('stops, leaving the record where it was, when the library refuses the layer, and says what to delete', async () => {
        const made = await deps(true, stored({ [GRID]: '36' }), { categories: { categories: [RACKS] } });
        await (await openInstallRecord(made.files, PROJECT, PACK, NOW)).record(recordedGrid);
        const write = jest.fn(async (file: { id: { name: string }; items: Array<{ dataType: string }> }) =>
            file.id.name.endsWith('-settings')
                ? { pack: 'created' as const, stored: [], failed: [{ dataType: 'store_config', reason: 'too large' }] }
                : { pack: 'created' as const, stored: file.items.map((i) => i.dataType), failed: [] },
        );

        await expect(saveStoreChanges({ ...made.d, findLayer: async () => foundLayer() }, { pack: PACK, source: 'library', saveAs: SAVE_AS }, write)).rejects.toThrow('acme-demo-1a2b3c@20261029-183000');

        expect(made.files.data.has(installRecordPath(PROJECT, PACK))).toBe(true);
    });
});

describe('saving a pack with no layer', () => {
    it('writes one version, and no layer, as it always did', async () => {
        const { d, write, written } = await deps(true, {}, ITEMS);

        const result = await saveStoreChanges({ ...d, findLayer: async () => undefined }, { pack: PACK, source: 'library', saveAs: SAVE_AS }, write);

        expect(written).toHaveLength(1);
        expect(result).not.toHaveProperty('settingsLayer');
        expect(result.sentence).not.toContain('store setting');
    });

    it('does not look for a layer of a pack that holds settings of its own, and keeps them in the pack', async () => {
        const findLayer = jest.fn(async () => foundLayer());
        const { written } = await savedLayered(stored({ [GRID]: '36' }), { categories: { categories: [RACKS] }, store_config: [settingRow(GRID, '24')] }, findLayer);

        expect(findLayer).not.toHaveBeenCalled();
        expect(written).toHaveLength(1);
        expect(written[0].items.find((i) => i.dataType === 'store_config')?.records).toEqual([settingRow(GRID, '36')]);
    });

    it('saves what the record lists, beside the pack, when the library cannot be asked about the layer', async () => {
        const down = async () => {
            throw new Error('unreachable');
        };
        const { written } = await savedLayered(stored({ [GRID]: '36' }), undefined, down);

        expect(kindsOf(written[0])).toEqual(['categories']);
        expect(written[1].items[0].records).toEqual([settingRow(GRID, '36')]);
    });

    it('refuses to save settings the install would refuse, naming the path', async () => {
        const made = await deps(true, stored({ 'design/head/title': 'Hi' }), { categories: { categories: [RACKS] } });

        await expect(
            saveStoreChanges({ ...made.d, findLayer: async () => foundLayer([settingRow('design/head/title', 'Hello')]) }, { pack: PACK, source: 'library', saveAs: SAVE_AS }, made.write),
        ).rejects.toThrow('design/head/title');

        expect(made.written).toHaveLength(0);
    });
});
