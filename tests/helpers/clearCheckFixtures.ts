/**
 * `check-demo-data`'s answer (`ClearCheck`, datapack-simplification step 06), typed to the real
 * interface so a hand-written answer cannot keep an old shape: the webview suites build theirs from
 * these. The numbers and names are made up; the shape is `src/types/demoDataWipe.ts`'s.
 */

import type { ClearCheck, InstanceChoices } from '@/types/demoDataWipe';

/** Clearing the Bodea website: products, categories as a tree, customers with one kept, closed orders. */
export const BODEA_CHECK: ClearCheck = {
    project: 'Bodea',
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
export const EMPTY_CHECK: ClearCheck = { project: 'Bodea', websites: [{ code: 'bodea', name: 'Bodea' }], rows: [], records: {}, total: 0, token: 'tok-0' };

/** Bodea with its datapack, which the clearing uninstalls first (C3): the window reads its changes before Clear. */
export const BODEA_PACK_CHECK: ClearCheck = {
    ...BODEA_CHECK,
    datapack: { name: 'Bodea B2B', changes: 'unchecked', pack: { name: 'bodea-b2b', version: '1', store: 'library' } },
};

/** Clear Commerce Instance's websites (C4): two used by projects, one by four, one by none. */
export const INSTANCE_CHOICES: InstanceChoices = {
    websites: [
        { code: 'base', name: 'Main Website', projects: ['Kukla Luma', 'Luma Test'] },
        { code: 'bodea', name: 'Bodea', projects: ['Bodea', 'Bodea EU', 'Bodea Test', 'Bodea Old'] },
        { code: 'spare', name: 'Spare', projects: [] },
    ],
};

/** Clearing Main Website: two projects lose their data, one's datapack with changes in a pack not the SC's. */
export const INSTANCE_CHECK: ClearCheck = {
    ...BODEA_CHECK,
    project: 'Kukla Luma',
    websites: [{ code: 'base', name: 'Main Website' }],
    token: 'instance-tok-1',
    instance: {
        projects: [
            { path: '/p/kukla-luma', name: 'Kukla Luma', datapack: { name: 'Luma', changes: 'asks' } },
            { path: '/p/luma-test', name: 'Luma Test', datapack: { name: 'Luma Test Pack' } },
        ],
        ownNames: ['My Luma'],
        alwaysSave: false,
    },
};

/** The same, with nothing changed in either datapack. */
export const INSTANCE_CHECK_NO_CHANGES: ClearCheck = {
    ...INSTANCE_CHECK,
    instance: { projects: [{ path: '/p/luma-test', name: 'Luma Test', datapack: { name: 'Luma Test Pack' } }], ownNames: [], alwaysSave: false },
};
