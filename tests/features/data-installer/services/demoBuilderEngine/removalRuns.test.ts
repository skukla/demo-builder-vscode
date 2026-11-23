/**
 * removalRuns — a removal's objects taken back in the record's order with as few calls as Commerce
 * allows: products through the Import API, list kinds one call per run, anything deleted with another
 * object not sent at all.
 */

import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { refusedRemovalsLine, removalRuns, takeBackAll } from '@/features/data-installer/services/demoBuilderEngine/removalRuns';
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

    // 2026-11-06, live: one locked attribute stopped a reinstall part-way, with the rest not taken out.
    it('leaves in the store and on the record one object Commerce refuses, names why, and takes the rest', async () => {
        const take: CreatedObject[] = [
            { kind: 'attribute_assign_to_set', id: '155/size', key: 'Top/size' },
            { kind: 'attribute_assign_to_set', id: '155/new', key: 'Top/new' },
        ];
        const recorder = await recorderWith(take);
        const locked = '{"message":"Attribute \'%1\' is locked. %2","parameters":["size","This attribute is used in configurable products."]}';
        const ctx = await fakeContext({}, (call) => {
            if (call.path.endsWith('/size')) throw new CommerceReadError(`Commerce answered 400 for ${call.path}: ${locked}`, 400);
            return true;
        });

        const refused = await takeBackAll(ctx, recorder, take);

        expect(refused).toEqual([
            { kind: 'attribute_assign_to_set', key: 'Top/size', reason: "Attribute 'size' is locked. This attribute is used in configurable products." },
        ]);
        expect(ctx.sent.map((c) => `${c.method} ${c.path}`)).toEqual([
            'DELETE products/attribute-sets/155/attributes/size',
            'DELETE products/attribute-sets/155/attributes/new',
        ]);
        expect(recorder.created.map((o) => o.id)).toEqual(['155/size']);
    });

    it('CONTROL: still stops when Commerce fails rather than refuses, as when it is down', async () => {
        const take: CreatedObject[] = [{ kind: 'attribute_assign_to_set', id: '155/size', key: 'Top/size' }];
        const recorder = await recorderWith(take);
        const ctx = await fakeContext({}, () => {
            throw new CommerceReadError('Commerce answered 503', 503);
        });

        await expect(takeBackAll(ctx, recorder, take)).rejects.toThrow('Could not take back attribute_assign_to_set 155/size: Commerce answered 503');
    });

    // Live, 2026-11-09: a run of products and gift cards logged "took back 2048 giftcards".
    it('names every kind in each run with its count in Debug Logs', async () => {
        const take: CreatedObject[] = [
            { kind: 'products', id: 'A' },
            { kind: 'products', id: 'B' },
            { kind: 'giftcards', id: 'G' },
            { kind: 'categories', id: '9' },
            { kind: 'cart_rules', id: '3' },
        ];
        const recorder = await recorderWith(take);
        const ctx = await fakeContext();

        await takeBackAll(ctx, recorder, take);

        const runs = ctx.logged.filter((line) => line.startsWith('took back')).map((line) => line.replace(/ in [\d.]+ s$/u, ''));
        expect(runs).toEqual(['took back 2 products and 1 giftcards', 'took back 1 categories and 1 cart_rules']);
    });
});

describe('refusedRemovalsLine', () => {
    it('names what was left, why, and what tries again; nothing when nothing was', () => {
        const row = { kind: 'attribute_assign_to_set', key: 'Top/size', reason: 'Attribute size is locked.' };

        expect(refusedRemovalsLine([], 'Installing')).toBeUndefined();
        expect(refusedRemovalsLine([row], 'Uninstalling')).toBe(
            'Commerce would not take out 1 item: attribute assign to set Top/size (Attribute size is locked). Uninstalling the datapack again tries again.',
        );
    });
});
