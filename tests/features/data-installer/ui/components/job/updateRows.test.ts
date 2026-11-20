/**
 * An update's summary rows and spot-check records (step-07 U1, J9-2): bare counts of what it writes,
 * and the records behind Changed and Kept.
 */

import { updateRecords, updateRows } from '@/features/data-installer/ui/components/job/updateRows';
import type { UpdateTypeChange } from '@/types/webviewRequests';

const PRODUCTS: UpdateTypeChange = { type: 'products', added: 12, updated: 36, removed: 0, changed: ['MS-01', 'MH01'], kept: ['MJ09'] };
const ATTRIBUTES: UpdateTypeChange = { type: 'product_attributes', added: 0, updated: 3, removed: 0, changed: ['activity'], kept: [] };

describe('updateRows', () => {
    it('counts what the update writes, bare verbs, in the order checked', () => {
        expect(updateRows([ATTRIBUTES, PRODUCTS])).toEqual([
            { type: 'product_attributes', label: 'Product Attributes', count: 3, happens: '3 updated' },
            { type: 'products', label: 'Products', count: 48, happens: '12 added, 36 updated' },
        ]);
    });

    it('names a removal too, when the newer version dropped a record', () => {
        expect(updateRows([{ ...ATTRIBUTES, updated: 0, removed: 1 }])[0].happens).toBe('1 removed');
    });
});

describe('updateRecords', () => {
    it('splits each type into what it writes and what the SC edited and keeps', () => {
        expect(updateRecords([PRODUCTS, ATTRIBUTES])).toEqual({
            changed: { products: ['MS-01', 'MH01'], product_attributes: ['activity'] },
            kept: { products: ['MJ09'], product_attributes: [] },
        });
    });
});
