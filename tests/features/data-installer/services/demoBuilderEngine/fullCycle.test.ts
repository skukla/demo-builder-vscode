/**
 * The full cycle, for every data type at once: install a pack into a store, install the same pack again
 * (nothing may be sent), then remove it (the store is back as it was, and the record is gone).
 *
 * Why it exists (2026-11-06, DI-8): a reinstall of an unchanged Luma took 40 attributes out of their
 * sets, saying the pack no longer had them, and Commerce blanked 271 product values with them. Each was
 * recorded by the set's id ("155/size") while the pack names it by the set's name ("Top/size"); a
 * stock's source links had the same mismatch. Both shipped on 2026-10-30 behind unit tests that asserted
 * what the code recorded, and "install again, nothing sent" was proven for 3 of the 22 data types. A
 * second install here sends a DELETE for either mismatch, so this fails for both.
 *
 * The store is `memoryStore`, whose reads show its writes, with `configStore` beside it for settings,
 * as the engine's own harness composes them (`buildDatapackEngine-ticks.testUtils.ts`). The context is
 * built as the engine builds it: `resolveEngineTarget`, then `sessionFor`.
 *
 * A data type the cycle does not install is in COVERED_ELSEWHERE, naming the test that proves the same
 * for it. A new data type in neither fails the build.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GRID, configStore, row } from './storeConfig.testUtils';
import { NOW, PACK, PROJECT, memoryFiles } from './demoBuilderEngine.testUtils';
import { type MemoryStore, memoryStore } from './memoryStore.testUtils';
import {
    openInstallRecord,
    readInstallRecord,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    resolveEngineTarget,
    sessionFor,
} from '@/features/data-installer/services/demoBuilderEngine/installTarget';
import type { KindContext } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import {
    INSTALLABLE_KINDS,
    type PackItems,
    installPack,
    removePack,
} from '@/features/data-installer/services/demoBuilderEngine/runPack';
import type {
    CommerceGet,
    CommerceProduct,
    CommerceSend,
    CommerceSystemConfigWrite,
} from '@/types/commerceWire';

const TARGET = { websiteCode: 'base', storeCode: 'default' };

const SIMPLE: CommerceProduct = {
    sku: 'cycle-tee',
    name: 'Cycle Tee',
    type_id: 'simple',
    attribute_set_id: 'Cycle Gear',
    price: 20,
    status: 1,
    visibility: 4,
    custom_attributes: [
        { attribute_code: 'url_key', value: 'cycle-tee' },
        { attribute_code: 'cycle_material', value: 'Wool' },
        { attribute_code: 'color', value: 'Blue' },
    ],
    extension_attributes: { category_links: [{ category_id: 'cycle-racks', position: 0 }] },
};

const GIFT_CARD: CommerceProduct = {
    sku: 'cycle-gift',
    name: 'Cycle Gift Card',
    type_id: 'giftcard',
    attribute_set_id: 'Default',
    extension_attributes: { giftcard_amounts: [{ value: 25 }] },
};

/** One pack holding every REST data type, each in the shape its parser takes. */
const PACK_ROWS: PackItems = {
    attribute_sets: [{ attributeSet: { attribute_set_name: 'Cycle Gear' } }],
    product_attributes: [
        {
            attribute: {
                attribute_code: 'cycle_material',
                frontend_input: 'select',
                options: [{ label: 'Cotton' }, { label: 'Wool' }],
            },
        },
        // The store's own attribute, gaining an option: recorded as an attribute_options row.
        {
            attribute: {
                attribute_code: 'color',
                frontend_input: 'select',
                options: [{ label: 'Red' }, { label: 'Blue' }],
            },
        },
    ],
    attribute_assign_to_set: [
        { attributeSetId: 'Cycle Gear', attributeCode: 'cycle_material' },
        // The store's own attribute into the store's own set: taken out on its own, as Luma's were.
        { attributeSetId: 'Default', attributeCode: 'color' },
    ],
    categories: {
        categories: [
            {
                category: {
                    name: 'Cycle Racks',
                    path: 'Default Category',
                    is_active: true,
                    custom_attributes: [{ attribute_code: 'url_key', value: 'cycle-racks' }],
                },
            },
        ],
    },
    customer_groups: [{ customer_group: { code: 'Cycle VIP', tax_class_id: 3 } }],
    stocks: { stocks: [{ stock: { name: 'Cycle Stock' } }] },
    sources: {
        sources: [
            {
                source: {
                    source_code: 'cycle_east',
                    name: 'Cycle East',
                    enabled: true,
                    country_id: 'US',
                    postcode: '10001',
                },
            },
        ],
    },
    stock_source_links: {
        stockSourceLinks: [
            {
                stockSourceLink: {
                    stock_id: 'Cycle Stock',
                    source_code: 'cycle_east',
                    priority: 1,
                },
            },
        ],
    },
    products: [{ product: SIMPLE }],
    giftcards: [{ product: GIFT_CARD }],
    source_items: {
        sourceItems: [{ sku: 'cycle-tee', source_code: 'cycle_east', quantity: 5, status: 1 }],
    },
    customers: [
        {
            customer: {
                email: 'rider@example.com',
                firstname: 'Ada',
                lastname: 'Rider',
                group_id: 'Cycle VIP',
            },
        },
    ],
    cart_rules: [
        {
            rule: {
                name: 'Cycle Ten',
                is_active: true,
                simple_action: 'by_percent',
                discount_amount: 10,
                customer_group_ids: ['Cycle VIP'],
            },
        },
    ],
    coupons: [{ coupon: { code: 'CYCLE10', rule_id: 'Cycle Ten' } }],
    store_config: [row(GRID, '24')],
};

/** The service's import-form kinds, each a pack of its own: a pack does not hold both forms of one thing. */
const IMPORT_FORM_PACKS: Record<string, PackItems> = {
    product_export: {
        product_export: {
            source: {
                entity: 'catalog_product',
                behavior: 'append',
                items: [
                    {
                        sku: 'cycle-cap',
                        product_type: 'simple',
                        attribute_set_code: 'Default',
                        name: 'Cycle Cap',
                        price: '12.000000',
                    },
                ],
            },
        },
    },
    customers_export: {
        customers_export: {
            source: {
                entity: 'customer_composite',
                behavior: 'add_update',
                items: [
                    {
                        email: 'coach@example.com',
                        _website: 'base',
                        _store: 'default',
                        firstname: 'Cy',
                        lastname: 'Coach',
                        group_id: 'General',
                    },
                ],
            },
        },
    },
};

/** Kinds proven elsewhere, by the file and the test that prove "install again, nothing sent". */
const COVERED_ELSEWHERE: Record<string, { file: string; test: string }> = {
    b2b_shared_catalogs: {
        file: 'runPack-b2b.test.ts',
        test: 'installing again changes nothing the SC left as it was',
    },
    b2b_companies: {
        file: 'runPack-b2b.test.ts',
        test: 'installing again changes nothing the SC left as it was',
    },
    b2b_shared_catalog_company_assignments: {
        file: 'runPack-b2b.test.ts',
        test: 'installing again changes nothing the SC left as it was',
    },
    b2b_shared_catalog_categories: {
        file: 'runPack-b2b.test.ts',
        test: 'installing again changes nothing the SC left as it was',
    },
    b2b_shared_catalog_products: {
        file: 'runPack-b2b.test.ts',
        test: 'installing again changes nothing the SC left as it was',
    },
};

/** Commerce with its settings beside it, as the engine's harness composes them. */
function commerce(
    store: MemoryStore,
    settings: ReturnType<typeof configStore>
): { get: CommerceGet; send: CommerceSend } {
    return {
        get: (route) =>
            route.startsWith('system/config') ? settings.get(route) : store.get(route),
        send: async (method, route, body, via) => {
            if (route !== 'system/config') return store.send(method, route, body, via);
            store.sent.push({ method, path: route, body });
            return settings.put(body as { items: CommerceSystemConfigWrite[] });
        },
    };
}

/** A fresh context on the same store and record, as each install opens one. */
async function opened(
    access: { get: CommerceGet; send: CommerceSend },
    files: ReturnType<typeof memoryFiles>,
    logged: string[]
): Promise<KindContext> {
    const session = sessionFor(await resolveEngineTarget(access.get, TARGET));
    const recorder = await openInstallRecord(files, PROJECT, PACK, NOW, TARGET);
    return { ...access, recorder, session, log: (line) => void logged.push(line) };
}

/** What the store holds now, every part of it, comparable with a fresh store's. */
function holdings(store: MemoryStore, settings: ReturnType<typeof configStore>) {
    return {
        categories: [...store.categories.values()],
        products: [...store.products.values()],
        attributes: [...store.attributes.values()],
        sets: [...store.sets.values()].map((s) => ({ ...s, members: [...s.members].sort() })),
        stocks: [...store.stocks.values()],
        links: [...store.links],
        sourceItems: [...store.sourceItems],
        groups: [...store.groups.values()],
        customers: [...store.customers.values()],
        rules: [...store.rules.values()],
        coupons: [...store.coupons.values()],
        settings: { ...settings.state.default },
    };
}

/** Install, install again, remove; what each step sent and left. */
async function cycle(rows: PackItems) {
    const store = memoryStore();
    const settings = configStore({ default: { [GRID]: '12' } });
    const before = holdings(memoryStore(), configStore({ default: { [GRID]: '12' } }));
    const access = commerce(store, settings);
    const files = memoryFiles();
    const logged: string[] = [];
    const first = await installPack(await opened(access, files, logged), rows);
    const made = (await readInstallRecord(files, PROJECT, PACK))?.created ?? [];
    store.sent.length = 0;
    const again = await installPack(await opened(access, files, logged), rows);
    const sentAgain = store.sent.map((c) => `${c.method} ${c.path}`);
    const removed = await removePack(access, files, { projectPath: PROJECT, pack: PACK });
    return { store, settings, before, first, made, again, sentAgain, removed, files };
}

describe('a pack installed, installed again, and removed', () => {
    it('installs every REST data type into an empty store, skipping nothing', async () => {
        const { first, made } = await cycle(PACK_ROWS);

        expect(first.skipped).toStrictEqual([]);
        // The control: every kind the cycle exists for really made something, so "nothing sent" below means something.
        expect([...new Set(made.map((o) => o.kind))].sort()).toEqual(
            [
                'attribute_assign_to_set',
                'attribute_options',
                'attribute_sets',
                'cart_rules',
                'categories',
                'coupons',
                'customer_groups',
                'customers',
                'giftcards',
                'product_attributes',
                'products',
                'sources',
                'stock_source_links',
                'stocks',
                'store_config',
            ].sort()
        );
    });

    it('records each object under the name the pack gives its row', async () => {
        const { made } = await cycle(PACK_ROWS);

        const keyOf = (kind: string) =>
            made
                .filter((o) => o.kind === kind)
                .map((o) => o.key)
                .sort();
        expect(keyOf('attribute_assign_to_set')).toEqual([
            'Cycle Gear/cycle_material',
            'Default/color',
        ]);
        expect(keyOf('stock_source_links')).toEqual(['Cycle Stock/cycle_east']);
        expect(keyOf('attribute_options')).toEqual(['color/Blue']);
    });

    it('sends nothing when the same pack is installed again, and takes nothing out', async () => {
        const { again, sentAgain } = await cycle(PACK_ROWS);

        expect(sentAgain).toStrictEqual([]);
        expect(again).toMatchObject({
            kept: [],
            containers: [],
            skipped: [],
            tookOut: [],
            notTakenOut: [],
        });
    });

    it('then removes it all: the store is as it was, bar the source Commerce can only switch off', async () => {
        const { store, settings, before, removed, files } = await cycle(PACK_ROWS);

        expect(removed).toMatchObject({ noRecord: false, kept: [], refused: [] });
        expect(holdings(store, settings)).toEqual(before);
        expect(store.sources.get('cycle_east')?.enabled).toBe(false);
        await expect(readInstallRecord(files, PROJECT, PACK)).resolves.toBeUndefined();
    });

    it.each(Object.keys(IMPORT_FORM_PACKS))('does the same for a %s pack', async (kind) => {
        const { first, made, again, sentAgain, store, settings, before, removed } = await cycle(
            IMPORT_FORM_PACKS[kind]
        );

        expect(first.skipped).toStrictEqual([]);
        expect(made).toHaveLength(1);
        expect(sentAgain).toStrictEqual([]);
        expect(again).toMatchObject({ tookOut: [], notTakenOut: [] });
        expect(removed).toMatchObject({ kept: [], refused: [] });
        expect(holdings(store, settings)).toEqual(before);
    });
});

describe('every data type proves "install again, nothing sent" somewhere', () => {
    const inCycle = new Set([...Object.keys(PACK_ROWS), ...Object.keys(IMPORT_FORM_PACKS)]);

    it('names, for each kind the engine installs, the cycle or another test', () => {
        const unproven = INSTALLABLE_KINDS.filter((kind) => !inCycle.has(kind) && !(kind in COVERED_ELSEWHERE));

        expect(unproven).toStrictEqual([]);
    });

    // A named test must install the kind, not merely exist: a test whose pack lacks the kind proves nothing for it.
    it('each test named elsewhere still exists, by its file and its name, and its file installs the kind', () => {
        const missing = Object.entries(COVERED_ELSEWHERE).filter(([kind, { file, test }]) => {
            const source = path.join(__dirname, file);
            if (!fs.existsSync(source)) return true;
            const text = fs.readFileSync(source, 'utf8');
            return !text.includes(test) || !text.includes(kind);
        });

        expect(missing).toStrictEqual([]);
    });
});
