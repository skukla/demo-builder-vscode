/**
 * Making an ACO pack from a Commerce store and saving it into the library, end to end over a fake
 * store that answers the reads the service makes (aco-export-spec.md §2) and a fake library write.
 * The rows themselves are each kind's own suite; this is what is read, through which store view,
 * what is saved, and what an SC is told.
 */

import {
    DatapackTransferError,
    type PackWriteOutcome,
} from '@/features/data-installer/services/datapackTransfer';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import {
    exportAcoPack,
    type AcoExportRequest,
} from '@/features/data-installer/services/acoExport/acoPackExport';
import {
    AcoExportError,
    type AcoCommerce,
} from '@/features/data-installer/services/acoExport/acoStoreReads';
import type { CommerceCatalogProduct } from '@/types/acoPack';
import {
    ACO_CATEGORIES,
    ACO_GROUPS,
    ACO_STORE_CONFIGS,
    ACO_STORE_VIEWS,
    ACO_WEBSITES,
    SUPER_ATTRIBUTES,
    SUPER_ATTRIBUTE_OPTIONS,
    attributeRow,
    catalogProduct,
    configurableTee,
} from '../../../../helpers/acoFixtures';

const PACK = { name: 'aco_acme', version: 'main' };

interface FakeStore {
    products: CommerceCatalogProduct[];
    details: Record<string, CommerceCatalogProduct>;
    storeConfigs: typeof ACO_STORE_CONFIGS;
    failing: string[];
    refuse?: string;
}

function store(overrides: Partial<FakeStore> = {}): FakeStore {
    return {
        products: [
            ...configurableTee(),
            catalogProduct('DL', { type_id: 'downloadable' }),
            catalogProduct('GRP', { type_id: 'grouped', price: undefined }),
        ],
        details: {},
        storeConfigs: ACO_STORE_CONFIGS,
        failing: [],
        ...overrides,
    };
}

const page = (items: unknown[]) => ({ items, total_count: items.length });

/** What the fake store answers for one path, read through one store view or store-wide. */
function answer(fake: FakeStore, path: string): unknown {
    const route = path.split('?')[0];
    if (fake.failing.includes(route)) throw new Error(`Commerce answered 500 for ${route}`);
    if (route === 'store/storeViews') return ACO_STORE_VIEWS;
    if (route === 'store/websites')
        return [{ id: 0, code: 'admin', name: 'Admin' }, ...ACO_WEBSITES];
    if (route === 'store/storeConfigs') return fake.storeConfigs;
    if (route === 'products/attributes')
        return page(
            path.includes('is_user_defined')
                ? [attributeRow({ attribute_code: 'material' })]
                : SUPER_ATTRIBUTES
        );
    if (route === 'categories/list') return page(ACO_CATEGORIES);
    if (route === 'customerGroups/search') return page(ACO_GROUPS);
    if (route === 'products') return page(fake.products);
    const options = /^products\/attributes\/(\w+)\/options$/u.exec(route);
    if (options) return SUPER_ATTRIBUTE_OPTIONS[options[1]];
    const sku = /^products\/(.+)$/u.exec(route)?.[1];
    if (sku && fake.details[sku]) return fake.details[sku];
    throw new Error(`the fake store has no ${path}`);
}

function harness(fake: FakeStore = store()) {
    const reads: Array<[string | undefined, string]> = [];
    const commerce: AcoCommerce = async (storeView) => {
        if (fake.refuse) return { refusal: fake.refuse };
        return async (path) => {
            reads.push([storeView, path.split('?')[0]]);
            return answer(fake, path);
        };
    };
    const written: DatapackFile[] = [];
    const outcome: PackWriteOutcome = { pack: 'created', stored: [], failed: [] };
    const write = jest.fn(async (file: DatapackFile) => {
        written.push(file);
        return outcome;
    });
    const run = (request: Partial<AcoExportRequest> = {}) =>
        exportAcoPack(
            { commerce, log: () => undefined, now: () => new Date('2026-10-30T12:00:00Z') },
            { id: PACK, ...request },
            write
        );
    return { reads, written, outcome, write, run };
}

describe('exportAcoPack: what it saves', () => {
    it("saves the five kinds as one pack in the library, in the service's order", async () => {
        const h = harness();
        const result = await h.run({ storeViews: ['default'] });

        expect(h.written).toHaveLength(1);
        expect(h.written[0]).toMatchObject({
            id: PACK,
            displayName: 'aco_acme',
            source: 'library',
            exportedAt: '2026-10-30T12:00:00.000Z',
        });
        expect(h.written[0].items.map((i) => i.dataType)).toEqual([
            'aco_metadata',
            'aco_categories',
            'aco_products',
            'aco_price_books',
            'aco_prices',
        ]);
        expect(result).toMatchObject({ success: true, saved: PACK, storeViews: ['default'] });
    });

    it('counts what each kind made, and the products it left out', async () => {
        const { perType } = await harness().run({ storeViews: ['default'] });

        expect(perType).toEqual([
            { dataType: 'aco_metadata', success: true, exported: 1, excluded: 0 },
            { dataType: 'aco_categories', success: true, exported: 3, excluded: 0 },
            { dataType: 'aco_products', success: true, exported: 3, excluded: 2 },
            { dataType: 'aco_price_books', success: true, exported: 4, excluded: 0 },
            { dataType: 'aco_prices', success: true, exported: 3, excluded: 1 },
        ]);
    });

    it('says what it saved, where, and for which store views', async () => {
        const { sentence } = await harness().run({ storeViews: ['default', 'fr'] });
        expect(sentence).toBe(
            'Saved the ACO pack aco_acme@main to your datapack library: 5 kinds for default, fr.'
        );
    });

    it('makes only the kinds asked for', async () => {
        const h = harness();
        await h.run({ storeViews: ['default'], dataTypes: ['aco_prices', 'aco_metadata'] });
        expect(h.written[0].items.map((i) => i.dataType)).toEqual(['aco_metadata', 'aco_prices']);
    });

    it('refuses a kind it cannot make, product layers included, before reading anything', async () => {
        const h = harness();
        await expect(h.run({ dataTypes: ['aco_product_layers'] })).rejects.toThrow(
            /cannot be made from a Commerce store here/u
        );
        expect(h.reads).toStrictEqual([]);
    });
});

describe('exportAcoPack: store views', () => {
    it("makes every store view's rows, sorted, and every website's books, when none is picked", async () => {
        const h = harness();
        const result = await h.run();

        expect(result.storeViews).toEqual(['citisignal_us', 'default', 'fr']);
        const books = h.written[0].items.find((i) => i.dataType === 'aco_price_books')
            ?.records as Array<{ priceBookId: string; currency?: string }>;
        expect(books.filter((b) => b.currency).map((b) => [b.priceBookId, b.currency])).toEqual([
            ['base', 'USD'],
            ['citisignal', 'USD'],
        ]);
    });

    it('prices only the websites of the store views picked, in the currency of the one picked', async () => {
        const h = harness();
        await h.run({ storeViews: ['fr'] });

        const books = h.written[0].items.find((i) => i.dataType === 'aco_price_books')
            ?.records as Array<{ priceBookId: string; currency?: string }>;
        expect(books.filter((b) => b.currency)).toEqual([
            { priceBookId: 'base', name: 'Main Website', currency: 'EUR' },
        ]);
    });

    it('reads categories and products through each store view, and the lists store-wide', async () => {
        const h = harness();
        await h.run({ storeViews: ['default', 'fr'] });

        const through = (route: string) => [
            ...new Set(h.reads.filter(([, r]) => r === route).map(([view]) => view)),
        ];
        expect(through('products')).toEqual(['default', 'fr']);
        expect(through('categories/list')).toEqual(['default', 'fr']);
        expect(through('products/attributes')).toEqual([undefined]);
        expect(through('store/websites')).toEqual([undefined]);
    });

    it("reads each list once, and each super attribute's options once, however many views", async () => {
        const h = harness();
        await h.run({ storeViews: ['default', 'fr'] });

        const count = (route: string) => h.reads.filter(([, r]) => r === route).length;
        expect(count('store/storeViews')).toBe(1);
        expect(count('products/attributes/color/options')).toBe(1);
        expect(count('products')).toBe(2);
    });

    it('refuses a store view the store does not have, before saving anything', async () => {
        const h = harness();
        await expect(h.run({ storeViews: ['nl'] })).rejects.toThrow(
            'The store has no store view nl. It has default, citisignal_us, fr.'
        );
        expect(h.write).not.toHaveBeenCalled();
    });
});

describe('exportAcoPack: completing configurables and bundles', () => {
    it('reads a configurable the list gave without its options, through the same store view', async () => {
        const [tee, ...variants] = configurableTee();
        const listed = { ...tee, extension_attributes: {} };
        const h = harness(store({ products: [listed, ...variants], details: { TEE: tee } }));

        await h.run({ storeViews: ['fr'] });

        expect(h.reads).toContainEqual(['fr', 'products/TEE']);
        const products = h.written[0].items.find((i) => i.dataType === 'aco_products')
            ?.records as Array<{ sku: string; configurations?: unknown[] }>;
        expect(products.find((p) => p.sku === 'TEE')?.configurations).toHaveLength(2);
    });

    it('keeps the configurable as listed when its own read fails', async () => {
        const [tee, ...variants] = configurableTee();
        const h = harness(store({ products: [{ ...tee, extension_attributes: {} }, ...variants] }));

        const result = await h.run({ storeViews: ['default'] });

        expect(result.perType.find((t) => t.dataType === 'aco_products')).toMatchObject({
            success: true,
            exported: 3,
        });
    });
});

describe('exportAcoPack: what goes wrong', () => {
    it("reports a kind whose read fails, with Commerce's words, and still saves the rest", async () => {
        const h = harness(store({ failing: ['categories/list'] }));
        const result = await h.run({ storeViews: ['default'] });

        expect(result.perType.find((t) => t.dataType === 'aco_categories')).toEqual({
            dataType: 'aco_categories',
            success: false,
            exported: 0,
            excluded: 0,
            reason: 'Commerce answered 500 for categories/list',
        });
        expect(result.success).toBe(false);
        expect(h.written[0].items.map((i) => i.dataType)).toEqual([
            'aco_metadata',
            'aco_price_books',
            'aco_prices',
        ]);
        expect(result.sentence).toMatch(/2 of the kinds could not be made; each says why\.$/u);
    });

    it('fails the price books, naming the website, when its store view names no currency', async () => {
        const h = harness(store({ storeConfigs: [{ id: 1, code: 'default', website_id: 1 }] }));
        const result = await h.run({ storeViews: ['default'] });

        expect(result.perType.find((t) => t.dataType === 'aco_price_books')?.reason).toBe(
            'Could not tell the currency of website 1 (base): its store view default names none.'
        );
    });

    it("fails a kind the service's schema refuses, saying so", async () => {
        const long = catalogProduct('A', {}, { url_key: 'a' });
        const h = harness(store({ products: [long] }));
        const categories = ACO_CATEGORIES.map((c) =>
            c.id === 21 ? { ...c, name: 'x'.repeat(129) } : c
        );
        const result = await exportAcoPack(
            {
                commerce: async () => async (path) =>
                    path.startsWith('categories/list')
                        ? page(categories)
                        : answer(store({ products: [long] }), path),
                log: () => undefined,
            },
            { id: PACK, storeViews: ['default'] },
            h.write
        );

        expect(result.perType.find((t) => t.dataType === 'aco_categories')?.reason).toMatch(
            /^The Data Installer's schema refuses it: \/2\/name must NOT have more than 128 characters/u
        );
    });

    it("marks a kind the library refused, in the library's words", async () => {
        const h = harness();
        h.outcome.failed.push({ dataType: 'aco_products', reason: 'Data size exceeds 50MB limit' });

        const result = await h.run({ storeViews: ['default'] });

        expect(result.perType.find((t) => t.dataType === 'aco_products')).toMatchObject({
            success: false,
            reason: 'The library did not take it: Data size exceeds 50MB limit',
        });
    });

    it('refuses a name and version already in the library', async () => {
        const h = harness();
        h.write.mockRejectedValueOnce(new DatapackTransferError('exists'));

        await expect(h.run({ storeViews: ['default'] })).rejects.toThrow(
            'aco_acme@main is already in your datapack library. Choose another version, or delete that one first.'
        );
    });

    it("stops, in the store's words, when the project's Commerce cannot be opened", async () => {
        const h = harness(store({ refuse: 'Adobe sign-in is required.' }));
        await expect(h.run()).rejects.toThrow(new AcoExportError('Adobe sign-in is required.'));
    });

    it('saves nothing, and says so, when the store has nothing to put in the pack', async () => {
        const h = harness(store({ products: [] }));
        const result = await h.run({ storeViews: ['default'], dataTypes: ['aco_products'] });

        expect(h.write).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            success: true,
            sentence: 'The store had nothing to put in an ACO pack, so nothing was saved.',
        });
        expect(result).not.toHaveProperty('saved');
    });
});
