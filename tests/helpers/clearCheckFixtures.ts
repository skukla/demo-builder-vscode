/**
 * `check-demo-data`'s answer (`ClearCheck`, datapack-simplification step 06), typed to the real
 * interface so a hand-written answer cannot keep an old shape: the webview suites build theirs from
 * these. The numbers and names are made up; the shape is `src/types/demoDataWipe.ts`'s.
 */

import type { ClearCheck } from '@/types/demoDataWipe';

/** Clearing the Bodea website: products, categories as a tree, customers with one kept, closed orders. */
export const BODEA_CHECK: ClearCheck = {
    websites: [{ code: 'bodea', name: 'Bodea' }],
    rows: [
        { type: 'products', label: 'Products', count: 2, happens: '2 removed' },
        { type: 'categories', label: 'Categories', count: 2, happens: '2 removed' },
        { type: 'customers', label: 'Customers', count: 1, happens: '1 removed' },
        { type: 'orders', label: 'Orders', count: 3, happens: '3 closed' },
    ],
    records: {
        products: { removed: ['BD-RACK', 'BD-CHAIR'], kept: [] },
        categories: { removed: ['Racks', 'Server Racks'], kept: ['Cables'], tree: [{ name: 'Racks', id: '151', children: [{ name: 'Server Racks', id: '152' }] }] },
        customers: { removed: ['bd.store@example.com'], kept: ['bd.other@example.com'] },
        orders: { removed: ['000000701', '000000702', '000000703'], kept: [] },
    },
    total: 8,
    token: 'tok-1',
};

/** The same, with nothing to clear. */
export const EMPTY_CHECK: ClearCheck = { websites: [{ code: 'bodea', name: 'Bodea' }], rows: [], records: {}, total: 0, token: 'tok-0' };
