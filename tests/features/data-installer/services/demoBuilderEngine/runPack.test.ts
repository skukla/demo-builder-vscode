/**
 * A whole pack: kinds install in the store's order, a kind the engine cannot install is refused
 * before any write, and removal walks the record newest first, dropping each object as it goes
 * (DI-5).
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { installRecordPath, openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    INSTALLABLE_KINDS,
    UnsupportedKindsError,
    installPack,
    removePack,
} from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { NOW, PACK, PROJECT, type SentCall, fakeContext, memoryFiles, page } from './demoBuilderEngine.testUtils';

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

        await expect(installPack(ctx, { categories: { categories: [] }, customers_export: {}, cart_rules: [] })).rejects.toThrow(
            new UnsupportedKindsError(['customers_export', 'cart_rules']),
        );
        expect(ctx.sent).toStrictEqual([]);
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
            'source_items',
            'customers',
            'b2b_shared_catalogs',
            'b2b_companies',
            'b2b_shared_catalog_company_assignments',
            'b2b_shared_catalog_categories',
            'b2b_shared_catalog_products',
        ]);
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
