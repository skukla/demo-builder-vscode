/**
 * The install summary's rows (step 03, S4; decisions Phase 5, J2-1): one row per data type, its
 * count bare ("56") when every record is new, "53 added, 3 updated" only when some already exist.
 * A type with nothing to change is not listed (rule 7); a kind that installs with another counts on
 * that type, as the install asks for it.
 */

import type { KindChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import { installRows } from '@/features/data-installer/ui/components/job/installRows';

const named = (count: number) => ({ count, names: [] });
const kind = (
    code: string,
    add: number,
    update = 0,
    extra: Partial<KindChanges> = {}
): KindChanges => ({
    kind: code,
    add: named(add),
    update: named(update),
    inStore: named(0),
    remove: named(0),
    keep: named(0),
    ...extra,
});

describe('installRows', () => {
    it('says a bare count when every record is new', () => {
        expect(installRows([kind('products', 56)])).toEqual([
            { type: 'products', label: 'Products', count: 56, happens: '56' },
        ]);
    });

    it('says what is added and updated when some records already exist', () => {
        expect(installRows([kind('products', 53, 3)])[0].happens).toBe('53 added, 3 updated');
    });

    it('writes counts with separators', () => {
        expect(installRows([kind('products', 2046)])[0].happens).toBe('2,046');
    });

    it('lists no type with nothing to change', () => {
        expect(
            installRows([kind('products', 56), kind('coupons', 0)]).map((row) => row.type)
        ).toEqual(['products']);
    });

    it('counts a kind that installs with another on that type', () => {
        const rows = installRows([
            kind('product_attributes', 4),
            kind('attribute_options', 10, 0, { installsWith: 'product_attributes' }),
        ]);

        expect(rows).toEqual([
            { type: 'product_attributes', label: 'Product Attributes', count: 14, happens: '14' },
        ]);
    });
});
