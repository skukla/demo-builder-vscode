/**
 * bulkRemoval — products deleted through Commerce's Import API in delete mode, read back, and any
 * left deleted on their own a few at a time. The import call's ARGUMENTS are asserted (route, mode,
 * SKU-only rows, batch sizes), since a fake answers the same whatever it is handed.
 *
 * The bulk queue's delete was replaced after it failed every row live (2026-11-06); the Import API
 * in delete mode is the Data Installer service's own route for a pack's bulk products.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import {
    afterImportDelete,
    productRuns,
    removeProductsInBulk,
    SINGLE_DELETES_AT_ONCE,
} from '@/features/data-installer/services/demoBuilderEngine/bulkRemoval';
import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';

const recorded = (count: number): CreatedObject[] =>
    Array.from({ length: count }, (_, i) => ({ kind: 'products', id: `S${i}` }));

type Import = { source: { entity: string; behavior: string; items: Array<{ sku: string }> } };

/** A store holding `stays` after any import, refusing the import call itself with `refuse`. */
function commerce(options: { stays?: string[]; refuse?: Error } = {}) {
    const imports: Import[] = [];
    const logged: string[] = [];
    const stays = new Set((options.stays ?? []).map((s) => s.toLowerCase()));
    return {
        imports,
        logged,
        log: (line: string) => void logged.push(line),
        send: async (method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown) => {
            if (method !== 'POST' || path !== 'import/json')
                throw new Error(`unexpected ${method} ${path}`);
            if (options.refuse) throw options.refuse;
            imports.push(body as Import);
            return ['Entities Processed: 1'];
        },
        get: async (path: string) => {
            const listed = decodeURIComponent(/\[value\]=([^&]*)/u.exec(path)?.[1] ?? '').split(
                ','
            );
            const items = listed
                .filter((sku) => stays.has(sku.toLowerCase()))
                .map((sku, id) => ({ sku, id }));
            return { items, total_count: items.length };
        },
    };
}

function recorder() {
    const dropped: string[] = [];
    return {
        dropped,
        drop: async (...objects: Array<Pick<CreatedObject, 'id'>>) =>
            void dropped.push(...objects.map((o) => o.id)),
    };
}

describe('removeProductsInBulk', () => {
    it('deletes 450 products in three delete-mode imports of 200, 200 and 50, SKU-only, and drops each once gone', async () => {
        const store = commerce();
        const record = recorder();
        const one = jest.fn(async (_object: CreatedObject) => undefined);

        await removeProductsInBulk(store, record, recorded(450), one);

        expect(store.imports.map((b) => b.source.items.length)).toEqual([200, 200, 50]);
        expect(store.imports[0].source).toMatchObject({
            entity: 'catalog_product',
            behavior: 'delete',
        });
        expect(store.imports[0].source.items[0]).toStrictEqual({ sku: 'S0' });
        expect(record.dropped).toHaveLength(450);
        expect(one).not.toHaveBeenCalled();
        expect(store.logged[0]).toBe('deleted 200 of 200 products in one import');
    });

    it('takes back on its own a product still in the store after the import, and only then drops it', async () => {
        const store = commerce({ stays: ['S1'] });
        const record = recorder();
        const one = jest.fn(async (_object: CreatedObject) => undefined);

        await removeProductsInBulk(store, record, recorded(3), one);

        expect(one.mock.calls.map(([o]) => o.id)).toEqual(['S1']);
        expect(record.dropped).toEqual(['S0', 'S2', 'S1']);
        expect(store.logged).toContain(
            '1 still in the store after the import (S1); deleting them on their own'
        );
    });

    it('takes every product back on its own, a few at a time, when the store refuses the import', async () => {
        const store = commerce({
            refuse: new CommerceReadError('Commerce answered 404 for import/json: ', 404),
        });
        let inFlight = 0;
        let most = 0;
        const one = jest.fn(async (_object: CreatedObject) => {
            inFlight += 1;
            most = Math.max(most, inFlight);
            await Promise.resolve();
            inFlight -= 1;
        });

        await removeProductsInBulk(store, recorder(), recorded(12), one);

        expect(one).toHaveBeenCalledTimes(12);
        expect(most).toBe(SINGLE_DELETES_AT_ONCE);
        expect(store.logged[0]).toBe(
            'Commerce refused deleting 12 products in one import (HTTP 404); deleting them on their own'
        );
    });

    it('stops when Commerce refuses who we are, taking nothing back and dropping nothing', async () => {
        const denied = new CommerceReadError('Commerce answered 403 for import/json: denied', 403);
        const record = recorder();
        const one = jest.fn(async (_object: CreatedObject) => undefined);

        await expect(
            removeProductsInBulk(commerce({ refuse: denied }), record, recorded(2), one)
        ).rejects.toBe(denied);

        expect(one).not.toHaveBeenCalled();
        expect(record.dropped).toStrictEqual([]);
    });

    it('drops the products taken back before a failure, then stops with it', async () => {
        const store = commerce({ stays: ['S0', 'S1', 'S2'] });
        const record = recorder();
        const failure = new Error('Could not take back products S1: 500');
        const one = jest.fn(async (object: CreatedObject) => {
            if (object.id === 'S1') throw failure;
        });

        await expect(removeProductsInBulk(store, record, recorded(3), one)).rejects.toBe(failure);

        expect(record.dropped).toEqual(['S0', 'S2']);
    });
});

describe('afterImportDelete', () => {
    it('sends one import for every SKU on the first call, then deletes on its own only what it left', async () => {
        const store = commerce({ stays: ['b'] });
        const single = jest.fn(async (_sku: string) => undefined);
        const remove = afterImportDelete(store, ['a', 'b', 'c'], single);

        for (const sku of ['a', 'b', 'c']) await remove(sku);

        expect(store.imports).toHaveLength(1);
        expect(single.mock.calls).toEqual([['b']]);
    });
});

describe('productRuns', () => {
    it("splits the record's order where it changes between products and everything else", () => {
        const objects: CreatedObject[] = [
            { kind: 'coupons', id: '1' },
            { kind: 'products', id: 'A' },
            { kind: 'giftcards', id: 'G' },
            { kind: 'categories', id: '9' },
        ];
        expect(productRuns(objects).map((run) => run.map((o) => o.id))).toEqual([
            ['1'],
            ['A', 'G'],
            ['9'],
        ]);
    });
});
