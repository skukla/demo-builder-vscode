/**
 * removalRuns — a removal's objects taken back in the record's order with as few calls as Commerce
 * allows: products through the Import API, list kinds one call per run, anything deleted with another
 * object not sent at all.
 */

import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { removalRuns, takeBackAll } from '@/features/data-installer/services/demoBuilderEngine/removalRuns';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { NOW, PACK, PROJECT, fakeContext, memoryFiles } from './demoBuilderEngine.testUtils';

describe('removalRuns', () => {
    it("splits the record's order where the kind of call changes: products, a list kind, and one at a time", () => {
        const objects: CreatedObject[] = [
            { kind: 'coupons', id: '1' },
            { kind: 'products', id: 'A' },
            { kind: 'giftcards', id: 'G' },
            { kind: 'stock_source_links', id: '7/east' },
            { kind: 'stock_source_links', id: '7/west' },
            { kind: 'categories', id: '9' },
            { kind: 'cart_rules', id: '3' },
        ];

        expect(removalRuns(objects).map((run) => run.map((o) => o.id))).toEqual([['1'], ['A', 'G'], ['7/east', '7/west'], ['9', '3']]);
    });
});

describe('takeBackAll', () => {
    async function recorderWith(objects: CreatedObject[]) {
        const recorder = await openInstallRecord(memoryFiles(), PROJECT, PACK, NOW);
        for (const object of objects) await recorder.record(object);
        return recorder;
    }

    it("takes a catalog's products back in one call per catalog, and a run of links in one call", async () => {
        const take: CreatedObject[] = [
            { kind: 'b2b_shared_catalog_products', id: '40/A' },
            { kind: 'b2b_shared_catalog_products', id: '40/B' },
            { kind: 'b2b_shared_catalog_products', id: '41/C' },
            { kind: 'stock_source_links', id: '7/east' },
            { kind: 'stock_source_links', id: '7/west' },
        ];
        const recorder = await recorderWith(take);
        const ctx = await fakeContext();

        await takeBackAll(ctx, recorder, take);

        expect(ctx.sent.map((c) => [c.path, c.body])).toEqual([
            ['sharedCatalog/40/unassignProducts', { products: [{ sku: 'A' }, { sku: 'B' }] }],
            ['sharedCatalog/41/unassignProducts', { products: [{ sku: 'C' }] }],
            ['inventory/stock-source-links-delete', { links: [{ stock_id: 7, source_code: 'east' }, { stock_id: 7, source_code: 'west' }] }],
        ]);
        expect(recorder.created).toStrictEqual([]);
    });

    it("sends nothing for a catalog's assignments when the catalog goes too, and drops them with it", async () => {
        const take: CreatedObject[] = [
            { kind: 'b2b_shared_catalog_products', id: '40/A' },
            { kind: 'b2b_shared_catalogs', id: '40' },
        ];
        const recorder = await recorderWith(take);
        const ctx = await fakeContext();
        const told: string[] = [];

        await takeBackAll(ctx, recorder, take, (objects) => objects.forEach((o) => told.push(o.id)));

        expect(ctx.sent.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE sharedCatalog/40']);
        expect(told).toEqual(['40', '40/A']);
        expect(recorder.created).toStrictEqual([]);
    });

    it('keeps a run of a list kind on the record when Commerce refuses its call, naming the kind', async () => {
        const take: CreatedObject[] = [
            { kind: 'stock_source_links', id: '7/east' },
            { kind: 'stock_source_links', id: '7/west' },
        ];
        const recorder = await recorderWith(take);
        const ctx = await fakeContext({}, () => {
            throw new CommerceReadError('Commerce answered 500', 500);
        });

        await expect(takeBackAll(ctx, recorder, take)).rejects.toThrow('Could not take back 2 stock_source_links: Commerce answered 500');
        expect(recorder.created.map((o) => o.id)).toEqual(['7/east', '7/west']);
    });
});
