/**
 * What a removal says about the changes it found (datapack-engine step 05): the one sentence both
 * surfaces read, built from the preview's `keep`, by the dialog design rule on naming kinds.
 */

import { changesFromPreview, changesSentence } from '@/features/data-installer/removalChanges';
import type { ChangePreview, KindChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';

const NONE = { count: 0, names: [] };

function kind(name: string, keep: string[], total = keep.length): KindChanges {
    return { kind: name, update: NONE, add: NONE, inStore: NONE, remove: NONE, keep: { count: total, names: keep.slice(0, 3) } };
}

function preview(kinds: KindChanges[], installed = true): ChangePreview {
    return { installed, kinds };
}

describe('changesFromPreview', () => {
    it('counts only what the SC changed, never what installing again would update or add', () => {
        const changes = changesFromPreview(
            preview([
                { ...kind('products', []), update: { count: 4, names: ['A'] }, add: { count: 2, names: ['B'] }, inStore: { count: 1, names: ['C'] }, remove: { count: 3, names: ['D'] } },
                kind('categories', ['Power/Critical Power']),
            ]),
        );

        expect(changes.count).toBe(1);
        expect(changes.kinds).toEqual([{ kind: 'categories', count: 1, names: ['Power/Critical Power'] }]);
    });

    it('answers nothing changed, with no sentence, when nothing was', () => {
        const changes = changesFromPreview(preview([kind('products', [])]));

        expect(changes).toEqual({ count: 0, kinds: [] });
    });

    it('keeps the real count when the preview shows only a few names', () => {
        const changes = changesFromPreview(preview([kind('products', ['A', 'B', 'C'], 9)]));

        expect(changes.count).toBe(9);
    });
});

describe('changesSentence', () => {
    it('reads as the owner wrote it: one named, the rest counted', () => {
        const sentence = changesSentence([
            { kind: 'categories', count: 1, names: ['Power/Critical Power'] },
            { kind: 'products', count: 2, names: ['A', 'B'] },
        ]);

        expect(sentence).toBe('You changed 3 things since it was installed: the category Critical Power, and 2 products.');
    });

    it('says one thing in the singular', () => {
        expect(changesSentence([{ kind: 'products', count: 1, names: ['VR-RACK'] }])).toBe(
            'You changed 1 thing since it was installed: the product VR-RACK.',
        );
    });

    it('keeps a slash in anything but a category: a SKU is not a path', () => {
        expect(changesSentence([{ kind: 'products', count: 1, names: ['VR/RACK'] }])).toContain('the product VR/RACK.');
    });

    it('names all seven kinds when there are seven', () => {
        const seven = ['products', 'categories', 'customers', 'coupons', 'sources', 'stocks', 'cart_rules'].map((k) => ({ kind: k, count: 2, names: ['x', 'y'] }));

        expect(changesSentence(seven)).toBe(
            'You changed 14 things since it was installed: 2 products, 2 categories, 2 customers, 2 coupons, 2 sources, 2 stocks, and 2 cart rules.',
        );
    });

    it('past seven kinds names three and counts the kinds left', () => {
        const eight = ['products', 'categories', 'customers', 'coupons', 'sources', 'stocks', 'cart_rules', 'giftcards'].map((k) => ({ kind: k, count: 2, names: ['x', 'y'] }));

        expect(changesSentence(eight)).toBe('You changed 16 things since it was installed: 2 products, 2 categories, 2 customers, and 5 more data types.');
    });

    it('still reads for a kind it has no word for', () => {
        expect(changesSentence([{ kind: 'new_things', count: 2, names: ['a', 'b'] }])).toContain('2 new things.');
    });
});
