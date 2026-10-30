/**
 * A round trip (step 14, item 16): install a pack into an empty store, save the store back, and the
 * saved version is the pack again. The service proves its own the same way (`compare-datapacks`:
 * `actions/utils/datapackComparator.js` with `config/compare_field_exclusions.json`), and this
 * compares the same way: each kind's rows sorted by what the pack calls them, with the fields a
 * store gives every row of its own taken out first.
 *
 * Taken out, as the service's `strip_paths` take them out: `id`, `entity_id`, `created_at`,
 * `updated_at`, `attribute_id`, `store_id`, `parent_id`. Unlike the service, a category's `path`
 * stays in: ours names its parents both ways, so it must come back the same. One difference is
 * ours alone and also taken out: an empty list the install sends where the pack had none (a
 * product's `tier_prices`). Nothing else may differ.
 *
 * The store is `memoryStore`: it keeps what it is sent, and gives a new product's custom options
 * their own ids, as Commerce does (item 12 is what keeps those out of the saved version).
 */

import { fingerprintRow } from '@/features/data-installer/services/demoBuilderEngine/fingerprint';
import { openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { newCatalogSession, type KindContext } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import { keyOf } from '@/features/data-installer/services/demoBuilderEngine/packForm';
import { installPack } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { saveStoreChanges } from '@/features/data-installer/services/demoBuilderEngine/saveStore';
import type { StoreChangesDeps } from '@/features/data-installer/services/demoBuilderEngine/storeAccess';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import type { CommerceProduct } from '@/types/commerceWire';
import { NOW, PACK, PROJECT, memoryFiles } from './demoBuilderEngine.testUtils';
import { type MemoryStore, memoryStore } from './memoryStore.testUtils';

const CATEGORY = (name: string, path: string, key: string) => ({
    category: { name, path, is_active: true, include_in_menu: true, custom_attributes: [{ attribute_code: 'url_key', value: key }] },
});

const VR_RACK: CommerceProduct = {
    sku: 'VR-Rack',
    name: 'VR Rack',
    type_id: 'simple',
    attribute_set_id: 'Default',
    price: 499,
    status: 1,
    visibility: 4,
    custom_attributes: [
        { attribute_code: 'url_key', value: 'vr-rack' },
        { attribute_code: 'description', value: 'A rack for the demo.' },
        { attribute_code: 'category_ids', value: ['server-racks'] },
    ],
    extension_attributes: { category_links: [{ category_id: 'server-racks', position: 0 }] },
    options: [{ product_sku: 'VR-Rack', title: 'Engraving', type: 'drop_down', is_require: false, sort_order: 1, values: [{ title: 'Gold', price: 5, price_type: 'fixed', sort_order: 1 }] }],
};

/** The pack under test, in the shapes the install's parsers take. */
const PACK_ROWS: Record<string, unknown> = {
    categories: { categories: [CATEGORY('Racks', 'Default Category', 'racks'), CATEGORY('Server Racks', 'Default Category/Racks', 'server-racks')] },
    products: [{ product: VR_RACK }],
    source_items: { sourceItems: [{ sku: 'VR-Rack', source_code: 'default', quantity: 12, status: 1 }] },
};

/** The service's `strip_paths`, and ours: what a store gives every row of its own. */
const STRIPPED = new Set(['id', 'entity_id', '_id', 'created_at', 'updated_at', 'created_in', 'attribute_id', 'store_id', 'parent_id']);

/** A row with the store's own fields taken out, and the install's empty lists. */
function normalized(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalized);
    if (typeof value !== 'object' || value === null) return value;
    const kept = Object.entries(value).filter(([key, v]) => !STRIPPED.has(key) && !(Array.isArray(v) && v.length === 0));
    return Object.fromEntries(kept.map(([key, v]) => [key, normalized(v)]));
}

/** One kind's rows, each normalized, in the order of what the pack calls them. */
function comparable(kind: string, records: unknown): unknown {
    const rows = (kind === 'categories' ? (records as { categories: unknown[] }).categories : Array.isArray(records) ? records : (records as { sourceItems: unknown[] }).sourceItems) ?? [];
    const key = (row: unknown) => keyOf(kind, row) ?? fingerprintRow(row);
    return [...rows].sort((a, b) => key(a).localeCompare(key(b))).map(normalized);
}

async function installed(): Promise<{ store: MemoryStore; files: ReturnType<typeof memoryFiles> }> {
    const store = memoryStore();
    const files = memoryFiles();
    const session = newCatalogSession(1);
    session.websiteId = 1;
    session.websiteCode = 'base';
    session.rootCategory = { id: 2, name: 'Default Category' };
    const ctx: KindContext = { get: store.get, send: store.send, recorder: await openInstallRecord(files, PROJECT, PACK, NOW), session, log: () => undefined };
    await installPack(ctx, PACK_ROWS);
    return { store, files };
}

async function savedBack(store: MemoryStore, files: ReturnType<typeof memoryFiles>): Promise<DatapackFile> {
    const deps: StoreChangesDeps = {
        commerce: async () => ({ get: store.get, send: store.send }),
        readPack: async () => PACK_ROWS,
        describe: async () => ({ displayName: 'Round trip' }),
        projectPath: PROJECT,
        target: { websiteCode: 'base', storeCode: 'default' },
        files,
        log: () => undefined,
    };
    const written: DatapackFile[] = [];
    await saveStoreChanges(deps, { pack: PACK, saveAs: { id: { name: 'round-trip', version: '2' }, displayName: 'Round trip' } }, async (file) => {
        written.push(file);
        return { pack: 'created', stored: file.items.map((i) => i.dataType), failed: [] };
    });
    return written[0];
}

describe('a pack installed and saved back is the pack again', () => {
    it('installs into the empty store, writing each kind', async () => {
        const { store } = await installed();

        expect([...store.categories.values()].map((c) => c.name)).toEqual(['Default Category', 'Racks', 'Server Racks']);
        expect([...store.products.keys()]).toEqual(['VR-Rack']);
        expect(store.sourceItems).toEqual([{ sku: 'VR-Rack', source_code: 'default', quantity: 12, status: 1 }]);
    });

    it('saves the same kinds back', async () => {
        const { store, files } = await installed();

        const saved = await savedBack(store, files);

        expect(saved.items.map((i) => i.dataType).sort()).toEqual(Object.keys(PACK_ROWS).sort());
    });

    it.each(Object.keys(PACK_ROWS))('saves the %s rows back as the pack holds them', async (kind) => {
        const { store, files } = await installed();

        const saved = await savedBack(store, files);

        expect(comparable(kind, saved.items.find((i) => i.dataType === kind)?.records)).toEqual(comparable(kind, PACK_ROWS[kind]));
    });

    it("carries none of this store's ids out with a product's custom options", async () => {
        const { store, files } = await installed();
        const made = store.products.get('VR-Rack');

        const saved = await savedBack(store, files);

        // The store gave them ids (the fake does, as Commerce does); the saved version has none.
        expect(made?.options?.[0]?.option_id).toEqual(expect.any(Number));
        const product = (saved.items.find((i) => i.dataType === 'products')?.records as Array<{ product: CommerceProduct }>)[0].product;
        expect(product.options).toEqual([expect.not.objectContaining({ option_id: expect.anything() })]);
        expect(product.options?.[0]?.values).toEqual([expect.not.objectContaining({ option_type_id: expect.anything() })]);
    });
});
