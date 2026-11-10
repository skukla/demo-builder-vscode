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
 * built as the engine builds it: `resolveEngineTarget`, then `sessionFor`. The pack and both of those
 * live in `packCycle.testUtils.ts`, shared with `recordReuse.test.ts`.
 *
 * A data type the cycle does not install is in COVERED_ELSEWHERE, naming the test that proves the same
 * for it. A new data type in neither fails the build.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GRID, configStore } from './storeConfig.testUtils';
import { PACK, PROJECT, memoryFiles } from './demoBuilderEngine.testUtils';
import { type MemoryStore, memoryStore } from './memoryStore.testUtils';
import { PACK_ROWS, commerce, opened } from './packCycle.testUtils';
import { readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    INSTALLABLE_KINDS,
    type PackItems,
    installPack,
    removePack,
} from '@/features/data-installer/services/demoBuilderEngine/runPack';

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
