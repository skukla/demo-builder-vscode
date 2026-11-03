/**
 * An import honours the ticks, through the real engine and wiring (`buildDatapackEngine-ticks.testUtils`):
 * what is ticked, or needed by what is ticked, installs, and nothing else. Unticked means left alone:
 * not installed, not removed, and still on the record if it was. Reinstalling with fewer kinds is the
 * dangerous case, since installing again treats what a pack no longer has as something to undo.
 */

import { GRID, settingRow } from '../../../helpers/settingsLayerFixtures';
import { CATEGORIES_LESS_CABLES, PACK, ROWS, ROWS_WITH_SETTINGS, type TicksHarness, request, ticksHarness } from './buildDatapackEngine-ticks.testUtils';
import { nodeRecordFiles, readInstallRecord, writeInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { saveStoreChanges } from '@/features/data-installer/services/demoBuilderEngine/saveStore';
import { previewChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';

const ALL = Object.keys(ROWS);
const LAYER = [settingRow(GRID, '24')];
/** What an SC will wonder next when a job installed products (the engine's closing lines). */
const AFTER_PRODUCTS =
    "Products can take up to 20 minutes to appear in storefront search. This datapack doesn't include product images. Products show the images that are in AEM Assets.";

let h: TicksHarness;

beforeEach(() => {
    h = ticksHarness();
});

afterEach(() => h.cleanUp());

const categoryNames = () => [...h.store.categories.values()].map((c) => c.name);

describe('importing part of a pack', () => {
    it('writes no product when only categories are asked for', async () => {
        const status = await h.importTypes(['categories']);

        expect(h.writes('products')).toStrictEqual([]);
        expect(h.writes('inventory/source-items')).toStrictEqual([]);
        expect(status.perType).toEqual({ categories: 'success' });
        expect(categoryNames()).toEqual(['Default Category', 'Racks', 'Cables']);
        expect([...h.store.products.keys()]).toStrictEqual([]);
        expect((await h.onRecord()).map((o) => o.kind)).toEqual(['categories', 'categories']);
    });

    it('CONTROL: asking for every kind writes every kind', async () => {
        const status = await h.importTypes(ALL);

        expect(h.writes('products')).toEqual(['POST products']);
        expect(h.writes('inventory/source-items')).toEqual(['POST inventory/source-items']);
        expect(status.perType).toEqual({ categories: 'success', products: 'success', source_items: 'success' });
    });

    it('installs what a ticked kind needs, says so, and nothing it does not need', async () => {
        const status = await h.importTypes(['products']);

        expect(h.writes('categories')).toEqual(['POST categories', 'POST categories']);
        expect(h.writes('products')).toEqual(['POST products']);
        expect(h.writes('inventory/source-items')).toStrictEqual([]);
        expect(status.note).toBe(`Also installed categories: the data types asked for need them. ${AFTER_PRODUCTS}`);
    });

    it('says nothing about needs when what is needed was asked for, as the form asks', async () => {
        const status = await h.importTypes(['categories', 'products']);

        expect(status.note).toBe(AFTER_PRODUCTS);
    });

    it('says nothing about search or images when the job installed no products', async () => {
        const status = await h.importTypes(['categories']);

        expect(status.note).toBeUndefined();
    });

    it('says nothing about search or images when the pack holds an empty product list', async () => {
        const status = await h.importTypes(['categories', 'products'], { rows: { ...ROWS, products: [] } });

        expect(status.note).toBeUndefined();
    });

    it('does not refuse a kind this engine cannot install, or bad rows, when they are left out', async () => {
        const rows = { ...ROWS, product_export: [], source_items: 'not rows' };

        await expect(h.engine({ rows }).validateImport(request(['categories']))).resolves.toEqual({ valid: true });
        const status = await h.importTypes(['categories'], { rows });

        expect(status.perType).toEqual({ categories: 'success' });
    });

    it('CONTROL: refuses both when they are asked for', async () => {
        const rows = { ...ROWS, source_items: 'not rows' };

        const verdict = await h.engine({ rows }).validateImport(request(['categories', 'source_items']));

        expect(verdict.valid).toBe(false);
        expect(h.store.sent).toStrictEqual([]);
    });

    it('still refuses a kind the pack does not hold', async () => {
        const verdict = await h.engine({ rows: { categories: ROWS.categories } }).validateImport(request(['products']));

        expect(verdict).toEqual({ valid: false, reason: 'The pack holds no products.' });
    });
});

describe('installing again with fewer kinds ticked', () => {
    beforeEach(async () => {
        await h.importTypes(ALL);
        h.store.sent.length = 0;
    });

    it('changes nothing else: no write of any kind, and the record as it was', async () => {
        const before = await h.onRecord();

        const status = await h.importTypes(['categories']);

        expect(h.store.sent).toStrictEqual([]);
        expect([...h.store.products.keys()]).toEqual(['VR-Rack']);
        expect(await h.onRecord()).toEqual(before);
        expect(status.note).toBeUndefined();
    });

    it('leaves alone a kind the pack no longer holds at all, when it is not asked for', async () => {
        const status = await h.importTypes(['categories'], { rows: { categories: ROWS.categories } });

        expect(h.store.sent).toStrictEqual([]);
        expect([...h.store.products.keys()]).toEqual(['VR-Rack']);
        expect(status.perType).toEqual({ categories: 'success' });
    });

    it('CONTROL: a row dropped from a kind that IS asked for still comes out', async () => {
        await h.importTypes(['categories'], { rows: { ...ROWS, categories: CATEGORIES_LESS_CABLES } });

        expect(h.writes()).toEqual([expect.stringMatching(/^DELETE categories\/\d+$/u)]);
        expect(categoryNames()).toEqual(['Default Category', 'Racks']);
        expect([...h.store.products.keys()]).toEqual(['VR-Rack']);
    });

    it('then a removal takes everything, the kinds left out included', async () => {
        await h.importTypes(['categories']);

        await h.removeTypes(['categories']);

        expect(h.store.products.size).toBe(0);
        expect(categoryNames()).toEqual(['Default Category']);
        expect(await h.onRecord()).toStrictEqual([]);
    });
});

describe('a kind left out, that an earlier install stopped before hashing', () => {
    /** As a stopped install leaves it: on the record, with no store hash yet. */
    async function stoppedBeforeHashingProducts(): Promise<void> {
        await h.importTypes(ALL);
        const record = await readInstallRecord(nodeRecordFiles, h.dir, PACK);
        if (!record) throw new Error('no record');
        const created = record.created.map((o) => (o.kind === 'products' ? { kind: o.kind, id: o.id, key: o.key } : o));
        await writeInstallRecord(nodeRecordFiles, h.dir, { ...record, created });
    }
    const productHash = async () => (await h.onRecord()).find((o) => o.kind === 'products')?.fingerprint;

    // Hashing it now would make an edit made since look like what the pack wrote, and the next
    // whole install would overwrite the SC's edit.
    it('stays unhashed', async () => {
        await stoppedBeforeHashingProducts();

        await h.importTypes(['categories']);

        expect(await productHash()).toBeUndefined();
    });

    it('CONTROL: is hashed when its kind is asked for', async () => {
        await stoppedBeforeHashingProducts();

        await h.importTypes(['categories', 'products']);

        expect(await productHash()).toEqual(expect.any(String));
    });
});

describe("a pack's own store settings, left out of an install", () => {
    const stores = { rows: ROWS_WITH_SETTINGS };

    it('are not set on a first install of part of the pack', async () => {
        await h.importTypes(['categories'], stores);

        expect(h.writes('system/config')).toStrictEqual([]);
        expect(h.settings.state.default[GRID]).toBe('12');
    });

    it('are not put back, and stay on the record, when installing again with fewer', async () => {
        await h.importTypes(Object.keys(ROWS_WITH_SETTINGS), stores);
        expect(h.settings.state.default[GRID]).toBe('24');
        h.store.sent.length = 0;

        await h.importTypes(['categories'], stores);

        expect(h.store.sent).toStrictEqual([]);
        expect(h.settings.state.default[GRID]).toBe('24');
        expect((await h.onRecord()).map((o) => o.kind)).toContain('store_config');
    });

    it('then a removal puts them back', async () => {
        await h.importTypes(Object.keys(ROWS_WITH_SETTINGS), stores);
        await h.importTypes(['categories'], stores);

        await h.removeTypes(['categories'], stores);

        expect(h.settings.state.default[GRID]).toBe('12');
        expect(await h.onRecord()).toStrictEqual([]);
    });
});

describe('a settings layer, and an install of part of its pack', () => {
    it('applies to an install of the whole pack, with no box of its own', async () => {
        const status = await h.importTypes(ALL, { layer: LAYER });

        expect(h.settings.state.default[GRID]).toBe('24');
        expect(status.note).toContain('From racks-settings@2');
    });

    it('does not apply to part of the pack, and the note says so', async () => {
        const status = await h.importTypes(['categories'], { layer: LAYER });

        expect(h.writes('system/config')).toStrictEqual([]);
        expect(h.settings.state.default[GRID]).toBe('12');
        expect(status.note).toBe('The store settings in racks-settings@2 were left as they are: they go in when every data type is imported.');
    });

    it('applies with part of the pack when store_config is asked for by name', async () => {
        const status = await h.importTypes(['categories', 'store_config'], { layer: LAYER });

        expect(h.settings.state.default[GRID]).toBe('24');
        expect(status.perType).toEqual({ categories: 'success', store_config: 'success' });
    });

    it('a layer that was applied is neither changed nor put back by installing fewer', async () => {
        await h.importTypes(ALL, { layer: [settingRow(GRID, '24')] });
        h.store.sent.length = 0;

        await h.importTypes(['categories'], { layer: [settingRow(GRID, '36')] });

        expect(h.store.sent).toStrictEqual([]);
        expect(h.settings.state.default[GRID]).toBe('24');
    });

    it('is not put back when the library no longer has it and fewer are installed', async () => {
        await h.importTypes(ALL, { layer: LAYER });
        h.store.sent.length = 0;

        await h.importTypes(['categories']);

        expect(h.store.sent).toStrictEqual([]);
        expect(h.settings.state.default[GRID]).toBe('24');
        expect((await h.onRecord()).map((o) => o.kind)).toContain('store_config');
    });

    it('CONTROL: is put back when the library no longer has it and the whole pack is installed', async () => {
        await h.importTypes(ALL, { layer: LAYER });

        await h.importTypes(ALL);

        expect(h.settings.state.default[GRID]).toBe('12');
    });

    it('a removal takes it with the rest, whatever was installed since', async () => {
        await h.importTypes(ALL, { layer: LAYER });
        await h.importTypes(['categories'], { layer: LAYER });

        await h.removeTypes(['categories']);

        expect(h.settings.state.default[GRID]).toBe('12');
        expect(h.store.products.size).toBe(0);
    });
});

describe('the preview says what the install does', () => {
    const kindsOf = async (dataTypes: string[] | undefined, stores = {}) => {
        const preview = await previewChanges(h.previewDeps(stores), PACK, 'installer', dataTypes);
        return { preview, kinds: preview.kinds.map((k) => k.kind) };
    };

    it('looks only at the kinds asked for', async () => {
        const { kinds, preview } = await kindsOf(['categories']);

        expect(kinds).toEqual(['categories']);
        expect(preview.kinds[0].add.names).toEqual(['Racks', 'Cables']);
    });

    it('counts what a ticked kind needs, as the install does', async () => {
        const { kinds } = await kindsOf(['products']);

        expect(kinds).toEqual(expect.arrayContaining(['categories', 'products']));
        expect(kinds).not.toContain('source_items');
    });

    it('takes nothing out of a kind left out', async () => {
        await h.importTypes(ALL);

        const { preview } = await kindsOf(['categories'], { rows: { categories: ROWS.categories } });

        expect(preview.kinds.flatMap((k) => k.remove.names)).toStrictEqual([]);
        expect(preview.kinds.map((k) => k.kind)).toEqual(['categories']);
    });

    it('says a layer would not go in with part of the pack', async () => {
        const { preview } = await kindsOf(['categories'], { layer: LAYER });

        expect(preview.settings).toEqual({
            layer: { name: 'racks-settings', version: '2' },
            changes: [],
            note: 'The store settings in racks-settings@2 were left as they are: they go in when every data type is imported.',
        });
    });

    it('says a layer would go in with every kind named, as the install applies it', async () => {
        const { preview } = await kindsOf(ALL, { layer: LAYER });

        expect(preview.settings?.changes).toEqual([`${GRID}: 12 → 24`]);
    });

    it('does not count recorded settings as put back when part of the pack is asked for', async () => {
        await h.importTypes(ALL, { layer: LAYER });

        const { preview } = await kindsOf(['categories']);

        expect(preview.settings).toBeUndefined();
        expect(preview.kinds.map((k) => k.kind)).toEqual(['categories']);
    });

    it('wrote nothing', async () => {
        await kindsOf(ALL, { layer: LAYER });

        expect(h.store.sent).toStrictEqual([]);
    });
});

describe('saving the store after part of a pack went in', () => {
    it("saves what the store holds of it, and nothing it never installed", async () => {
        await h.importTypes(['categories']);
        const written: DatapackFile[] = [];

        await saveStoreChanges(h.previewDeps(), { pack: PACK, source: 'installer', saveAs: { id: { name: 'own', version: '2' }, displayName: 'Own' } }, async (file) => {
            written.push(file);
            return { pack: 'created', stored: file.items.map((i) => i.dataType), failed: [] };
        });

        expect(written[0].items.map((i) => i.dataType)).toEqual(['categories']);
    });
});
