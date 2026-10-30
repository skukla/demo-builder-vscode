/**
 * The two actions behind "What would installing again change?" and "Save store changes to this
 * pack" (step 05): a preview that reads and writes nothing, and a save that writes a NEW version
 * into the library, keeps the old one, and moves the install record onto the new one.
 *
 * The store is the engine suites' fake; the pack rows are in the shapes the engine's parsers
 * take. The write into the library is a fake of `writePackToStore`'s answer (`PackWriteOutcome`),
 * asserted by the file it is handed.
 */

import type { PackWriteOutcome } from '@/features/data-installer/services/datapackTransfer';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import { fingerprintRow } from '@/features/data-installer/services/demoBuilderEngine/fingerprint';
import { installRecordPath, openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { type StoreChangesDeps, previewChanges, saveStoreChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import { packedFingerprint } from '@/features/data-installer/services/demoBuilderEngine/storeCopies';
import { configListPath } from '@/features/app-builder/services/storePreparation/configFix';
import { NOW, PACK, PROJECT, fakeContext, memoryFiles, page } from './demoBuilderEngine.testUtils';

/** The demo's own pack a save writes into (step 07). */
const SAVE_AS = { id: { name: 'acme-demo-1a2b3c', version: '20261029-183000' }, displayName: 'Acme Demo' };

const STORE = {
    'store/websites': [{ id: 1, code: 'base', name: 'Main Website', default_group_id: 1 }],
    'store/storeGroups': [{ id: 1, root_category_id: 2 }],
    'store/storeViews': [{ id: 1, code: 'default', website_id: 1, store_group_id: 1 }],
    'categories/2': { id: 2, name: 'Default Category', path: '1/2' },
    'categories/41': { id: 41, name: 'Server Racks', path: '1/2/41', is_active: true },
    [page('products/attribute-sets/sets/list')]: { items: [], total_count: 0 },
};
const RACKS = { category: { name: 'Racks', path: 'Default Category', is_active: true } };
const ITEMS = { categories: { categories: [RACKS, { category: { name: 'Cables', path: 'Default Category' } }] } };

async function deps(record = true, reads: Record<string, unknown> = {}, items: Record<string, unknown> = ITEMS) {
    const ctx = await fakeContext({ ...STORE, ...reads });
    const files = memoryFiles();
    if (record) {
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        await recorder.record({ kind: 'categories', id: '41', key: 'Racks', fingerprint: fingerprintRow(RACKS), wrote: packedFingerprint('categories', RACKS) });
    }
    const written: DatapackFile[] = [];
    const d: StoreChangesDeps = {
        commerce: async () => ({ get: ctx.get, send: ctx.send }),
        readPack: jest.fn(async () => items),
        describe: async () => ({ displayName: 'Bodea', description: 'Bodea main' }),
        projectPath: PROJECT,
        target: { websiteCode: 'base', storeCode: 'default' },
        files,
        log: () => undefined,
        now: () => new Date('2026-10-29T18:30:00Z'),
    };
    const write = async (file: DatapackFile): Promise<PackWriteOutcome> => {
        written.push(file);
        return { pack: 'created', stored: file.items.map((i) => i.dataType), failed: [] };
    };
    return { d, ctx, files, written, write };
}

describe('previewChanges', () => {
    it("counts a pack's store settings by what installing would do to each, writing nothing (step 09)", async () => {
        const GRID = 'catalog/frontend/grid_per_page';
        const LIST = 'catalog/frontend/list_per_page';
        const reads = { [configListPath([GRID, LIST], 'default')]: { items: [{ path: GRID, value: '12', scope: 'default' }, { path: LIST, value: '20', scope: 'default' }] } };
        const settings = [{ path: GRID, value: '24', scope: 'default' }, { path: LIST, value: '20', scope: 'default' }];
        const { d, ctx } = await deps(false, reads, { store_config: settings });

        const preview = await previewChanges(d, PACK, 'library');

        expect(ctx.sent).toStrictEqual([]);
        expect(preview.kinds).toContainEqual({
            kind: 'store_config',
            update: { count: 0, names: [] },
            add: { count: 1, names: [`${GRID}@default`] },
            inStore: { count: 1, names: [`${LIST}@default`] },
            remove: { count: 0, names: [] },
            keep: { count: 0, names: [] },
        });
    });

    it('counts what installing again would do, by kind, with a few names each, and writes nothing', async () => {
        const { d, ctx, files } = await deps();
        const before = files.data.get(installRecordPath(PROJECT, PACK));

        const preview = await previewChanges(d, PACK, 'installer');

        expect(preview).toEqual({
            installed: true,
            kinds: [
                {
                    kind: 'categories',
                    update: { count: 0, names: [] },
                    add: { count: 1, names: ['Cables'] },
                    inStore: { count: 0, names: [] },
                    remove: { count: 0, names: [] },
                    keep: { count: 1, names: ['Racks'] },
                },
            ],
            kept: 'Kept 1 thing you had changed in the Admin.',
        });
        expect(ctx.sent).toStrictEqual([]);
        expect(files.data.get(installRecordPath(PROJECT, PACK))).toBe(before);
    });

    it('says the pack is not installed here when there is no record, and counts every row as new', async () => {
        const { d } = await deps(false);

        const preview = await previewChanges(d, PACK, 'installer');

        expect(preview.installed).toBe(false);
        expect(preview.kinds[0]?.add.count).toBe(2);
    });
});

describe('saveStoreChanges', () => {
    // Step 07: a save goes into the demo's own pack, never a new version of the pack installed.
    it("writes the store's copy into the demo's own pack, saying what the installed pack says", async () => {
        const { d, written, write } = await deps();

        const result = await saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS }, write);

        expect(result.saved).toEqual(SAVE_AS.id);
        expect(written).toHaveLength(1);
        expect(written[0]).toMatchObject({
            id: SAVE_AS.id,
            displayName: 'Acme Demo',
            description: 'Bodea main',
            source: 'library',
            exportedAt: '2026-10-29T18:30:00.000Z',
        });
        expect(written[0].items).toEqual([
            { dataType: 'categories', records: { categories: [{ category: expect.objectContaining({ name: 'Server Racks', path: 'Default Category' }) }] } },
        ]);
        expect(result.sentence).toBe('Saved to the Acme Demo pack. Bodea is unchanged.');
    });

    it("says only where it saved when the pack installed is already the demo's own", async () => {
        const { d, write } = await deps();

        const result = await saveStoreChanges(d, { pack: PACK, saveAs: { id: { name: PACK.name, version: 'next' }, displayName: 'Acme Demo' } }, write);

        expect(result.sentence).toBe('Saved to the Acme Demo pack.');
    });

    it('moves the install record onto the new version, so the store and it start out the same', async () => {
        const { d, files, write } = await deps();

        await saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS }, write);

        expect(await readInstallRecord(files, PROJECT, PACK)).toBeUndefined();
        const moved = await readInstallRecord(files, PROJECT, SAVE_AS.id);
        expect(moved?.created).toEqual([expect.objectContaining({ kind: 'categories', id: '41', key: 'Server Racks' })]);
    });

    it('refuses, writing nothing, when Demo Builder did not install the pack here', async () => {
        const { d, written, write } = await deps(false);

        await expect(saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS }, write)).rejects.toThrow(/did not install bodea-main@1\.2\.0 in this project/);
        expect(written).toStrictEqual([]);
    });

    it('keeps the record where it was when the library refused part of the new version', async () => {
        const { d, files } = await deps();
        const refused = async (): Promise<PackWriteOutcome> => ({ pack: 'created', stored: [], failed: [{ dataType: 'categories', reason: 'too large' }] });

        await expect(saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS }, refused)).rejects.toThrow(/categories: too large/);
        expect(await readInstallRecord(files, PROJECT, PACK)).toBeDefined();
    });

    it('reports each stage as it starts, for the progress window', async () => {
        const { d, write } = await deps();
        const stages: string[] = [];

        await saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS }, write, (stage) => stages.push(stage));

        expect(stages).toEqual(['Reading the store', 'Saving to the library']);
    });
});

const skuIn = (skus: string) =>
    page('products', `&searchCriteria[filterGroups][0][filters][0][field]=sku&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(skus)}&searchCriteria[filterGroups][0][filters][0][conditionType]=in`);

/** A pack row for a product the store already had before the pack was installed. */
const THEIRS = { product: { sku: 'OldRack', name: 'Old Rack', attribute_set_id: 'Default', type_id: 'simple' } };
/** The store's copy of it, as `GET products` answers (the captured Bodea shape, trimmed). */
const THEIRS_IN_STORE = { id: 9, sku: 'OldRack', name: 'Old Rack (renamed)', type_id: 'simple' };

describe('previewChanges, counted the way a save counts', () => {
    it('counts a pack row the store already has as already in the store, not as new', async () => {
        const { d } = await deps(true, { [skuIn('OldRack,NewRack')]: { items: [THEIRS_IN_STORE], total_count: 1 } }, {
            products: [THEIRS, { product: { ...THEIRS.product, sku: 'NewRack' } }],
        });

        const preview = await previewChanges(d, PACK, 'installer');

        expect(preview.kinds.find((k) => k.kind === 'products')).toMatchObject({
            add: { count: 1, names: ['NewRack'] },
            inStore: { count: 1, names: ['OldRack'] },
        });
    });

    it('counts a category the pack dropped but the SC has put a category of their own in as kept, not removed', async () => {
        const { d } = await deps(true, { 'categories/41': { id: 41, name: 'Racks', path: '1/2/41', is_active: true, children: '77' } }, { categories: { categories: [] } });

        const preview = await previewChanges(d, PACK, 'installer');

        expect(preview.kinds[0]).toMatchObject({ remove: { count: 0, names: [] }, keep: { count: 1, names: ['Racks'] } });
        expect(preview.kept).toBe('Kept the category Racks: it holds 1 category you added.');
    });
});

/**
 * The inventory as the three list reads answer it. Every ACCS store has the `default` source,
 * `Default Stock` and the link between them; the live step 05 test (2026-10-29) showed that link
 * under "add" on every preview, even right after an install.
 */
const INVENTORY = {
    'inventory/sources?searchCriteria[pageSize]=200': {
        items: [
            { source_code: 'default', name: 'Default Source', enabled: true },
            { source_code: 'carvelo_off', name: 'Carvelo - Closed', enabled: false },
        ],
    },
    'inventory/stocks?searchCriteria[pageSize]=200': { items: [{ stock_id: 1, name: 'Default Stock', extension_attributes: { sales_channels: [{ type: 'website', code: 'base' }] } }] },
    'inventory/stock-source-links?searchCriteria[pageSize]=200': { items: [{ stock_id: 1, source_code: 'default', priority: 1 }] },
};
const INVENTORY_PACK = {
    sources: {
        sources: [
            { source: { source_code: 'default', name: 'Default Source' } },
            { source: { source_code: 'carvelo_off', name: 'Carvelo - Closed' } },
            { source: { source_code: 'carvelo_broadway', name: 'Carvelo - Broadway' } },
        ],
    },
    stocks: { stocks: [{ stock: { name: 'Default Stock' } }, { stock: { name: 'Carvelo' } }] },
    stock_source_links: {
        stockSourceLinks: [
            { stockSourceLink: { stock_id: 'Default Stock', source_code: 'default' } },
            { stockSourceLink: { stock_id: 'Carvelo', source_code: 'carvelo_broadway' } },
        ],
    },
};

describe('previewChanges, inventory counted the way install treats it', () => {
    it('counts a source, stock or link the store already has as already in the store, as install leaves it alone', async () => {
        const { d, ctx } = await deps(true, INVENTORY, INVENTORY_PACK);

        const preview = await previewChanges(d, PACK, 'installer');
        const kind = (name: string) => preview.kinds.find((k) => k.kind === name);

        // A switched-off source is switched on by install, and recorded: a change, so it is not "in the store".
        expect(kind('sources')).toMatchObject({ add: { count: 2, names: ['carvelo_off', 'carvelo_broadway'] }, inStore: { count: 1, names: ['default'] } });
        expect(kind('stocks')).toMatchObject({ add: { count: 1, names: ['Carvelo'] }, inStore: { count: 1, names: ['Default Stock'] } });
        expect(kind('stock_source_links')).toMatchObject({
            add: { count: 1, names: ['Carvelo/carvelo_broadway'] },
            inStore: { count: 1, names: ['Default Stock/default'] },
        });
        expect(ctx.sent).toStrictEqual([]);
    });
});

describe('saveStoreChanges, with the installed version\'s own rows', () => {
    it('saves a pack product the store already had, read from the store with its SKU exact', async () => {
        const { d, written, write } = await deps(
            true,
            { [skuIn('OldRack')]: { items: [THEIRS_IN_STORE], total_count: 1 }, [skuIn('OldRack').replace('products?', 'inventory/source-items?')]: { items: [], total_count: 0 } },
            { ...ITEMS, products: [THEIRS] },
        );

        await saveStoreChanges(d, { pack: PACK, source: 'library', saveAs: SAVE_AS }, write);

        expect(d.readPack).toHaveBeenCalledWith(PACK, 'library');
        const products = written[0].items.find((i) => i.dataType === 'products')?.records as Array<{ product: { sku: string; name: string } }>;
        expect(products.map((r) => [r.product.sku, r.product.name])).toEqual([['OldRack', 'Old Rack (renamed)']]);
    });

    it('reads the installed version from the library first, then the Data Installer, when no store is named', async () => {
        const { d, write } = await deps();
        (d.readPack as jest.Mock).mockRejectedValueOnce(new Error('not in the library'));

        await saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS }, write);

        expect((d.readPack as jest.Mock).mock.calls.map((c) => c[1])).toEqual(['library', 'installer']);
    });

    it('saves nothing when the installed version cannot be read from either store', async () => {
        const { d, written, write } = await deps();
        (d.readPack as jest.Mock).mockRejectedValue(new Error('gone'));

        await expect(saveStoreChanges(d, { pack: PACK, saveAs: SAVE_AS }, write)).rejects.toThrow(/cannot be read from the library or the Data Installer/);
        expect(written).toStrictEqual([]);
    });
});
