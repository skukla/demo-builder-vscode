/**
 * What the preview says about a settings layer (datapack-engine step 09): each setting by path,
 * with old and new value, writing nothing, as `preview_datapack_changes` answers it.
 */

import { configListPath } from '@/features/app-builder/services/storePreparation/configFix';
import { StoreChangesError } from '@/features/data-installer/services/demoBuilderEngine/storeAccess';
import { previewChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import { GRID, LIST, foundLayer, settingRow } from '../../../../helpers/settingsLayerFixtures';
import { PACK } from './demoBuilderEngine.testUtils';
import { ITEMS, deps } from './storeChanges.testUtils';

const stored = (values: Record<string, string>, paths = Object.keys(values)) => ({
    [configListPath(paths, 'default')]: { items: Object.entries(values).map(([path, value]) => ({ path, value, scope: 'default' })) },
});

describe('previewing a pack with a settings layer', () => {
    it("names each setting by path, old and new, says whose they are, counts them, and writes nothing", async () => {
        const { d, ctx } = await deps(false, { ...stored({ [GRID]: '12', [LIST]: '20' }), ...stored({ [GRID]: '12' }) }, ITEMS);
        const findLayer = jest.fn(async () => foundLayer([settingRow(GRID, '24'), settingRow(LIST, '20')]));

        const preview = await previewChanges({ ...d, findLayer }, PACK, 'installer');

        expect(findLayer).toHaveBeenCalledWith(PACK);
        expect(ctx.sent).toStrictEqual([]);
        expect(preview.settings).toEqual({ layer: { name: 'bodea-main-settings', version: '2' }, changes: [`${GRID}: 12 → 24`] });
        expect(preview.kinds.find((k) => k.kind === 'store_config')).toMatchObject({ add: { count: 1, names: [`${GRID}@default`] }, inStore: { count: 1 } });
    });

    it('counts no setting when part of the pack is asked about, and says the layer is left out', async () => {
        const { d } = await deps(false, {}, { ...ITEMS, products: [] });

        const preview = await previewChanges({ ...d, findLayer: async () => foundLayer() }, PACK, 'installer', ['categories']);

        expect(preview.settings).toEqual({ layer: foundLayer().id, changes: [], note: expect.stringContaining('left as it is') });
        expect(preview.kinds.map((k) => k.kind)).not.toContain('store_config');
    });

    it('applies the rule to the kinds the pack holds: naming all of them is the whole pack', async () => {
        const { d } = await deps(false, stored({ [GRID]: '12' }), ITEMS);

        const preview = await previewChanges({ ...d, findLayer: async () => foundLayer() }, PACK, 'installer', ['categories']);

        expect(preview.settings?.changes).toEqual([`${GRID}: 12 → 24`]);
    });

    it('says the setting it cannot put back would not be set', async () => {
        const { d } = await deps(false, stored({}, [GRID]), ITEMS);

        const preview = await previewChanges({ ...d, findLayer: async () => foundLayer() }, PACK, 'installer');

        expect(preview.settings?.changes).toStrictEqual([]);
        expect(preview.settings?.note).toContain(`${GRID}@default`);
    });

    it('refuses in plain words, by path, a layer the install would refuse', async () => {
        const { d } = await deps(false, {}, ITEMS);

        const preview = previewChanges({ ...d, findLayer: async () => foundLayer([settingRow('web/secure/base_url', 'x')]) }, PACK, 'installer');

        await expect(preview).rejects.toThrow(StoreChangesError);
        await expect(preview).rejects.toThrow('web/secure/base_url');
    });

    it('says when the library cannot be asked', async () => {
        const { d } = await deps(false, {}, ITEMS);
        const down = async () => {
            throw new Error('unreachable');
        };

        const preview = await previewChanges({ ...d, findLayer: down }, PACK, 'installer');

        expect(preview.settings).toEqual({ changes: [], note: "My Datapacks couldn't be read, so this datapack's store configuration, if any, is not counted here." });
    });
});

describe('previewing a pack with no layer', () => {
    it('answers as it always did', async () => {
        const { d } = await deps(false, {}, ITEMS);
        const before = await previewChanges(d, PACK, 'installer');

        const after = await previewChanges({ ...d, findLayer: async () => undefined }, PACK, 'installer');

        expect(after).toEqual(before);
        expect(after).not.toHaveProperty('settings');
    });
});
