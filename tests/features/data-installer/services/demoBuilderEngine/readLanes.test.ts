/**
 * inLanes — a read-back's data types in two lanes (walk F160, owner yes 2026-11-16).
 *
 * The check before an action ("Preparing to restore", once "Checking for your changes") read each type after the last: Luma's products took 53 s and the rest
 * about 20 more, one after another. Products and gift cards now read in a lane of their own beside
 * the others, which still go one at a time, so Commerce is never asked for more at once than two
 * types' reads.
 */

import { inLanes } from '@/features/data-installer/services/demoBuilderEngine/readLanes';

/** A promise and the hand that settles it. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
}

const settle = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('inLanes', () => {
    it('reads the other types while products are still being read, one other type at a time', async () => {
        const products = deferred<string>();
        const categories = deferred<string>();
        const started: string[] = [];
        const read = (kind: string): Promise<string> => {
            started.push(kind);
            if (kind === 'products') return products.promise;
            if (kind === 'categories') return categories.promise;
            return Promise.resolve(kind);
        };

        const all = inLanes(['products', 'categories', 'product_attributes'], read);
        await settle();

        // Categories started beside products; attributes wait for categories, not for products.
        expect(started).toEqual(['products', 'categories']);
        categories.resolve('categories');
        await settle();
        expect(started).toEqual(['products', 'categories', 'product_attributes']);

        products.resolve('products');
        await expect(all).resolves.toEqual(
            new Map([
                ['products', 'products'],
                ['categories', 'categories'],
                ['product_attributes', 'product_attributes'],
            ])
        );
    });

    it('answers in the order the types were asked for, whatever finished first', async () => {
        const answer = await inLanes(
            ['categories', 'giftcards', 'products'],
            async (kind) => kind.length
        );

        expect([...answer.keys()]).toEqual(['categories', 'giftcards', 'products']);
    });

    it('reads gift cards in the product lane, after products', async () => {
        const started: string[] = [];
        const products = deferred<void>();
        const all = inLanes(['products', 'giftcards'], (kind) => {
            started.push(kind);
            return kind === 'products' ? products.promise : Promise.resolve();
        });
        await settle();

        expect(started).toEqual(['products']);
        products.resolve();
        await all;
        expect(started).toEqual(['products', 'giftcards']);
    });
});
