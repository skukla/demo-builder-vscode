/**
 * The check's answer from a plan (datapack-simplification step 06): one row and one full record
 * list per type, in the summary's order, counting only what the plan writes; and a type a read
 * failed for marked by its kind.
 */

import { categoryTree, checkOf } from '@/features/data-installer/services/demoDataWipe/clearCheck';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { resolveWipeScope } from '@/features/data-installer/services/demoDataWipe/wipeScope';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { ClearRecords } from '@/types/demoDataWipe';
import { SANDBOX_CATEGORIES, SANDBOX_GROUPS, SANDBOX_VIEWS, SANDBOX_WEBSITES } from '../../../../helpers/commerceWipeFixtures';

const STRUCTURE: CommerceStoreStructure = { websites: SANDBOX_WEBSITES, storeGroups: SANDBOX_GROUPS, storeViews: SANDBOX_VIEWS };
const SCOPE = resolveWipeScope(STRUCTURE, ['bodea']);

const planned = (removed: string[], kept: string[] = []): ClearRecords => ({ removed, kept });

describe('checkOf', () => {
    it('answers a row per type with anything removed or kept, in the summary order, and totals what is removed', () => {
        const check = checkOf({
            scope: SCOPE,
            planned: { orders: planned(['000000701']), products: planned(['A', 'B'], ['C']), categories: planned([]), website_settings: planned(['x/y']) },
            failures: new Map(),
        });

        expect(check.rows).toEqual([
            { type: 'products', label: 'Products', count: 2, happens: '2 removed' },
            { type: 'website_settings', label: 'Website Settings', count: 1, happens: '1 set back to the default value' },
            { type: 'orders', label: 'Orders', count: 1, happens: '1 closed' },
        ]);
        expect(check.total).toBe(4);
        expect(check.websites).toEqual([{ code: 'bodea', name: 'Bodea' }]);
        expect(check.records.categories).toBeUndefined();
    });

    it.each([
        ['slow', new Error('ETIMEDOUT'), 'slow'],
        ['refused', new Error('401 Unauthorized'), 'refused'],
        ['strange', new Error('Commerce answered 500 for products'), 'strange'],
    ])('marks a type whose read failed as %s', (_label, error, kind) => {
        const check = checkOf({ scope: SCOPE, planned: { products: planned([]) }, failures: new Map([['products', error]]) });

        expect(check.unread).toEqual({ products: kind });
        expect(check.rows).toEqual([{ type: 'products', label: 'Products', count: 0, happens: "Couldn't be read" }]);
        expect(check.total).toBe(0);
    });

    it.each([403, 404, 401])('marks a type Commerce answered %i as refused (Open Commerce Admin), whatever its words', (status) => {
        const error = new CommerceReadError(`Commerce answered ${status} for products`, status);

        expect(checkOf({ scope: SCOPE, planned: {}, failures: new Map([['products', error]]) }).unread).toEqual({ products: 'refused' });
    });

    it('marks a 500 as strange, though the error carries a status', () => {
        const error = new CommerceReadError('Commerce answered 500 for products', 500);

        expect(checkOf({ scope: SCOPE, planned: {}, failures: new Map([['products', error]]) }).unread).toEqual({ products: 'strange' });
    });

    it('names only the slow types in the problem', () => {
        const failures = new Map<string, unknown>([
            ['customers', new Error('timed out')],
            ['b2b_companies', new Error('Commerce answered 500')],
            ['orders', new Error('fetch failed')],
        ]);

        const check = checkOf({ scope: SCOPE, planned: {}, failures });

        expect(check.problem).toBe("Commerce didn't answer for Customers and Orders.");
    });
});

describe('categoryTree', () => {
    it('nests each category going under the one above it when that goes too, in the store order', () => {
        const going = SANDBOX_CATEGORIES.filter((c) => ['151', '152', '155'].includes(String(c.id)));

        expect(categoryTree(SANDBOX_CATEGORIES, going)).toEqual([
            { name: 'Racks', id: '151', children: [{ name: 'Server Racks', id: '152' }] },
            { name: 'Pack Cables', id: '155' },
        ]);
    });
});
