/**
 * A whole pack: kinds install in the store's order, a kind the engine cannot install is refused
 * before any write, and removal walks the record newest first, dropping each object as it goes
 * (DI-5).
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { installRecordPath, openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    INSTALLABLE_KINDS,
    PackRowsError,
    UnsupportedKindsError,
    installPack,
    packRowProblems,
    removePack,
} from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { NOW, PACK, PROJECT, type SentCall, fakeContext, memoryFiles, page } from './demoBuilderEngine.testUtils';
import { GRID, configStore, row, storeContext } from './storeConfig.testUtils';

describe('installPack', () => {
    it('runs the kinds the pack holds in the store\'s order, whatever order the pack lists them in', async () => {
        const ctx = await fakeContext({
            'products/attribute-sets/sets/list?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100': { items: [], total_count: 0 },
        });
        const seen: string[] = [];

        await installPack(ctx, { source_items: { sourceItems: [] }, attribute_sets: [] }, (kind) => seen.push(kind));

        expect(seen).toEqual(['attribute_sets', 'source_items']);
    });

    it('refuses a pack holding a kind it cannot install, before writing anything', async () => {
        const ctx = await fakeContext();

        await expect(installPack(ctx, { categories: { categories: [] }, customers_export: {}, product_export: [] })).rejects.toThrow(
            new UnsupportedKindsError(['customers_export', 'product_export']),
        );
        expect(ctx.sent).toStrictEqual([]);
    });

    // Step 14 item 2: the service checks every kind's shape before writing (`processDataPack.js` L394-398).
    it("checks every kind's rows before writing anything, and names each kind whose rows are wrong", async () => {
        const ctx = await fakeContext({ [page('products/attribute-sets/sets/list')]: { items: [], total_count: 0 } });
        const pack = {
            attribute_sets: [{ attributeSet: { attribute_set_name: 'Racks' } }],
            products: [{ product: { sku: 'vrrack' } }],
            coupons: [{ coupon: { rule_id: 'Spring' } }],
        };

        const refusal = installPack(ctx, pack);

        await expect(refusal).rejects.toThrow(PackRowsError);
        await expect(refusal).rejects.toThrow(/products are not in the shape.*coupons are not in the shape/su);
        expect(ctx.sent).toStrictEqual([]);
    });

    it('finds nothing wrong with rows every kind can read', () => {
        expect(packRowProblems({ attribute_sets: [], categories: { categories: [] }, b2b_shared_catalog_products: { catalogs: [] } })).toStrictEqual([]);
    });

    it('names a shared catalog assignment kind and a store settings kind whose rows are wrong', () => {
        const problems = packRowProblems({ b2b_shared_catalog_products: { catalogs: [{ name: 'Retail' }] }, store_config: [{ path: 'web/unsecure/base_url', value: 'x', scope: 'default' }] });

        expect(problems).toEqual([expect.stringMatching(/shared catalog products/u), expect.stringMatching(/store settings cannot be installed/u)]);
    });

    // Step 08: groups before the products whose tier prices name them; customers before the
    // companies that make them admins; catalogs and companies before what is assigned to them.
    it('names, in order, every kind it installs', () => {
        expect(INSTALLABLE_KINDS).toEqual([
            'attribute_sets',
            'product_attributes',
            'attribute_assign_to_set',
            'categories',
            'customer_groups',
            'stocks',
            'sources',
            'stock_source_links',
            'products',
            // Step 11: gift cards after the products, as the service makes them.
            'giftcards',
            'source_items',
            'customers',
            // Step 11: cart rules and their coupons, before a shared catalog renames a group they name.
            'cart_rules',
            'coupons',
            'b2b_shared_catalogs',
            'b2b_companies',
            'b2b_shared_catalog_company_assignments',
            'b2b_shared_catalog_categories',
            'b2b_shared_catalog_products',
            // Step 09: a pack's store settings, once its data is in.
            'store_config',
        ]);
    });

    it('installs every kind the five kept packs with cart rules, coupons or gift cards hold, but their bulk product form', () => {
        // Health & Beauty, Carvello and wknd main (read 2026-10-30); Luma and Venia eds-compatible (get_datapack).
        const kinds = ['cart_rules', 'coupons', 'giftcards', 'customer_groups', 'customers', 'categories', 'products', 'stocks', 'sources', 'stock_source_links', 'source_items'];

        expect(kinds.filter((kind) => !INSTALLABLE_KINDS.includes(kind))).toStrictEqual([]);
        expect(INSTALLABLE_KINDS).not.toContain('product_export');
    });

    it("installs every one of Bodea's fourteen kinds", () => {
        const bodea = ['product_attributes', 'attribute_sets', 'customer_groups', 'customers', 'categories', 'products', 'stock_source_links', 'source_items', 'b2b_companies', 'b2b_shared_catalogs', 'b2b_shared_catalog_company_assignments', 'b2b_shared_catalog_categories', 'b2b_shared_catalog_products', 'attribute_assign_to_set'];

        expect(bodea.filter((kind) => !INSTALLABLE_KINDS.includes(kind))).toStrictEqual([]);
    });
});

describe('removePack', () => {
    async function recorded(files: ReturnType<typeof memoryFiles>) {
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        await recorder.record({ kind: 'categories', id: '41' });
        await recorder.record({ kind: 'products', id: 'vrrack' });
    }

    it('takes back what the record lists, newest first, then deletes the record', async () => {
        const files = memoryFiles();
        await recorded(files);
        const ctx = await fakeContext();

        const result = await removePack(ctx, files, { projectPath: PROJECT, pack: PACK });

        expect(ctx.sent).toEqual<SentCall[]>([
            { method: 'DELETE', path: 'products/vrrack', body: undefined },
            { method: 'DELETE', path: 'categories/41', body: undefined },
        ]);
        expect(result).toEqual({ removed: 2, noRecord: false, kept: [] });
        expect(files.data.has(installRecordPath(PROJECT, PACK))).toBe(false);
    });

    it('keeps a set the pack made that holds products the SC added, taking out only what the pack put in', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        await recorder.record({ kind: 'attribute_sets', id: '12' });
        await recorder.record({ kind: 'products', id: 'vrrack' });
        const ctx = await fakeContext({
            [page('products', '&searchCriteria[filterGroups][0][filters][0][field]=attribute_set_id&searchCriteria[filterGroups][0][filters][0][value]=12')]: {
                items: [{ sku: 'vrrack' }, { sku: 'their-a' }, { sku: 'their-b' }],
                total_count: 3,
            },
            'products/attribute-sets/12': { attribute_set_id: 12, attribute_set_name: 'Racks' },
        });

        const result = await removePack(ctx, files, { projectPath: PROJECT, pack: PACK });

        expect(ctx.sent).toEqual<SentCall[]>([{ method: 'DELETE', path: 'products/vrrack', body: undefined }]);
        expect(result.removed).toBe(1);
        expect(result.kept).toEqual([expect.objectContaining({ kind: 'set', name: 'Racks', count: 2, holds: 'product' })]);
        // Still on the record, so a later removal takes it once the SC's products are gone.
        expect((await readInstallRecord(files, PROJECT, PACK))?.created).toEqual([{ kind: 'attribute_sets', id: '12' }]);
    });

    it('answers that there is no record when this engine never installed the pack', async () => {
        const ctx = await fakeContext();

        await expect(removePack(ctx, memoryFiles(), { projectPath: PROJECT, pack: PACK })).resolves.toEqual({ removed: 0, noRecord: true, kept: [] });
        expect(ctx.sent).toStrictEqual([]);
    });

    it('stops at an object Commerce refuses, keeping it and the older ones on the record', async () => {
        const files = memoryFiles();
        await recorded(files);
        const ctx = await fakeContext({}, (call) => {
            if (call.path === 'categories/41') throw new CommerceReadError('Commerce answered 500', 500);
            return true;
        });

        await expect(removePack(ctx, files, { projectPath: PROJECT, pack: PACK })).rejects.toThrow(
            'Could not take back categories 41: Commerce answered 500',
        );
        expect((await readInstallRecord(files, PROJECT, PACK))?.created).toEqual([{ kind: 'categories', id: '41' }]);
    });
});

describe("a pack's store settings (step 09)", () => {
    it('installs them through the whole-pack install, and says what it set and what it kept', async () => {
        const store = configStore({ default: { [GRID]: '12' } });
        const ctx = await storeContext(store);

        const first = await installPack(ctx, { store_config: [row(GRID, '24')] });
        store.state.default[GRID] = '48';
        ctx.session.settings = undefined;
        const again = await installPack(ctx, { store_config: [row(GRID, '24')] });

        expect(first.settings?.changes).toEqual([`${GRID}: 12 → 24`]);
        expect(again.kept).toEqual([{ kind: 'store_config', key: `${GRID}@default` }]);
    });

    it('puts them back on removal, says what it put back, and forgets the record', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        await recorder.record({ kind: 'store_config', id: `${GRID}@default`, key: `${GRID}@default`, previous: { path: GRID, scope: 'default', stored: '12', effective: '12', wrote: '24' } });
        const store = configStore({ default: { [GRID]: '24' } });
        const ctx = await storeContext(store);

        const result = await removePack(ctx, files, { projectPath: PROJECT, pack: PACK });

        expect(store.state.default[GRID]).toBe('12');
        expect(result.settings?.changes).toEqual([`${GRID}: 24 → 12`]);
        expect(files.data.has(installRecordPath(PROJECT, PACK))).toBe(false);
    });
});
