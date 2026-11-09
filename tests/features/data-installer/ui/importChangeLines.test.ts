/**
 * What importing again would change, as one line per data type in the Import form (owner,
 * 2026-11-08): counts, from the preview's kinds.
 */

import type { KindChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import { changeLines, changesLine } from '@/features/data-installer/ui/importChangeLines';

const named = (count: number) => ({ count, names: [] });

/** A preview kind with these counts; inStore and keep are no change. */
function kind(name: string, update: number, add: number, remove: number, installsWith?: string): KindChanges {
    return {
        kind: name,
        update: named(update),
        add: named(add),
        inStore: named(9),
        remove: named(remove),
        keep: named(9),
        ...(installsWith ? { installsWith } : {}),
    };
}

describe('changesLine', () => {
    it('counts what is updated, added and removed, digits with separators, leaving out the zeros', () => {
        expect(changesLine({ updated: 1204, added: 3, removed: 2 })).toBe('1,204 updated, 3 added, 2 removed');
        expect(changesLine({ updated: 0, added: 1, removed: 0 })).toBe('1 added');
    });

    it('says No changes when nothing would change, or the type is not counted', () => {
        expect(changesLine({ updated: 0, added: 0, removed: 0 })).toBe('No changes');
        expect(changesLine(undefined)).toBe('No changes');
    });
});

describe('changeLines', () => {
    it('gives every offered data type a line, counting a kind that installs with another on that type', () => {
        const lines = changeLines(
            [kind('products', 12, 3, 0), kind('product_attributes', 0, 0, 2), kind('attribute_options', 4, 0, 0, 'product_attributes')],
            ['products', 'product_attributes', 'customers'],
        );

        expect(lines).toStrictEqual({
            products: '12 updated, 3 added',
            product_attributes: '4 updated, 2 removed',
            customers: 'No changes',
        });
    });

    it('leaves out what the store has that Demo Builder did not make, and kinds the form does not offer', () => {
        expect(changeLines([kind('products', 0, 0, 0), kind('store_config', 5, 0, 0)], ['products'])).toStrictEqual({
            products: 'No changes',
        });
    });
});
