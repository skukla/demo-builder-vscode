/**
 * decideRemovals on a Luma-sized removal (live, 2026-11-09: 2,046 products, 39 categories and 8
 * attribute sets; asked one container at a time, the decision took 134.8 s of a 3 min 5 s removal).
 *
 * The store here answers a read only when the test lets it, every read waiting at that moment
 * together: one "round" is one wait for Commerce. Asked one at a time, every read is its own round;
 * asked a few at once, a round answers several. The reads are `GET categories/{id}` and the product
 * searches `productsWhere` sends, typed to `StoreCategory` and the search page `readAllPages` reads.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { REQUESTS_AT_ONCE } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import type { StoreCategory } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import { decideRemovals } from '@/features/data-installer/services/demoBuilderEngine/removers';
import type { CommerceGet } from '@/types/commerceWire';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

interface LumaProduct {
    sku: string;
    setId: number;
    categories: number[];
}

/** Luma's shape: a root, 3 top categories, 12 under them, 23 under those; 8 sets; 2,046 products. */
function lumaShaped(): {
    categories: Map<number, StoreCategory>;
    products: LumaProduct[];
    sets: number[];
} {
    const categories = new Map<number, StoreCategory>();
    const add = (id: number, parent: number | undefined) => {
        const above = parent === undefined ? undefined : categories.get(parent);
        categories.set(id, {
            id,
            name: `Category ${id}`,
            path: above ? `${above.path}/${id}` : `1/${id}`,
            children: '',
        });
        if (above) above.children = [above.children, String(id)].filter(Boolean).join(',');
    };
    add(100, undefined);
    const tops = [101, 102, 103];
    tops.forEach((id) => add(id, 100));
    const mids = Array.from({ length: 12 }, (_, i) => 110 + i);
    mids.forEach((id, i) => add(id, tops[i % 3]));
    const leaves = Array.from({ length: 23 }, (_, i) => 130 + i);
    leaves.forEach((id, i) => add(id, mids[i % 12]));
    const sets = Array.from({ length: 8 }, (_, i) => 10 + i);
    const ancestors = (id: number) =>
        (categories.get(id)?.path ?? '').split('/').slice(1).map(Number);
    const products = Array.from({ length: 2046 }, (_, i) => ({
        sku: `luma-${i}`,
        setId: sets[i % 8],
        categories: ancestors(leaves[i % 23]),
    }));
    return { categories, products, sets };
}

const PAGE_SIZE = 100;

/** A store whose reads wait until the driver answers every read waiting at once. */
function steppedStore(categories: Map<number, StoreCategory>, products: LumaProduct[]) {
    const waiting: Array<() => void> = [];
    let inFlight = 0;
    const seen = { calls: 0, rounds: 0, mostAtOnce: 0 };
    const answer = (path: string): unknown => {
        const category = /^categories\/(\d+)$/u.exec(path);
        const found = category ? categories.get(Number(category[1])) : undefined;
        if (found) return found;
        const search =
            /^products\?searchCriteria\[currentPage\]=(\d+).*\[field\]=(category_id|attribute_set_id).*\[value\]=(\d+)/u.exec(
                path
            );
        if (!search) throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
        const id = Number(search[3]);
        const matching = products.filter((p) =>
            search[2] === 'category_id' ? p.categories.includes(id) : p.setId === id
        );
        const start = (Number(search[1]) - 1) * PAGE_SIZE;
        return {
            items: matching.slice(start, start + PAGE_SIZE).map((p) => ({ sku: p.sku })),
            total_count: matching.length,
        };
    };
    const get: CommerceGet = (path) =>
        new Promise((resolve, reject) => {
            seen.calls += 1;
            inFlight += 1;
            seen.mostAtOnce = Math.max(seen.mostAtOnce, inFlight);
            waiting.push(() => {
                inFlight -= 1;
                try {
                    resolve(answer(path));
                } catch (error) {
                    reject(error);
                }
            });
        });
    /** Run `work`, answering every read waiting once nothing else can move, until it settles. */
    async function drive<T>(work: Promise<T>): Promise<T> {
        let settled = false;
        work.then(
            () => (settled = true),
            () => (settled = true)
        );
        while (!settled) {
            await new Promise((resolve) => setImmediate(resolve));
            if (waiting.length === 0) continue;
            seen.rounds += 1;
            for (const release of waiting.splice(0)) release();
        }
        return work;
    }
    return { get, drive, seen };
}

const obj = (kind: string, id: string | number): CreatedObject => ({ kind, id: String(id) });

/** What the install recorded, newest first: the products, the categories deepest first, the sets. */
function newestFirst(
    categories: Map<number, StoreCategory>,
    products: LumaProduct[],
    sets: number[]
): CreatedObject[] {
    const deepestFirst = [...categories.values()].sort(
        (a, b) => (b.path ?? '').length - (a.path ?? '').length || b.id - a.id
    );
    return [
        ...products.map((p) => obj('products', p.sku)).reverse(),
        ...deepestFirst.map((c) => obj('categories', c.id)),
        ...sets.map((id) => obj('attribute_sets', id)),
    ];
}

describe('decideRemovals on a Luma-sized removal', () => {
    it('asks a few containers at once: far fewer waits for Commerce than reads, never more than five reads together', async () => {
        const luma = lumaShaped();
        const store = steppedStore(luma.categories, luma.products);
        const listed = newestFirst(luma.categories, luma.products, luma.sets);

        const decided = await store.drive(decideRemovals(store.get, listed));

        expect(decided).toEqual({ take: listed, kept: [] });
        // The same 153 reads as asking one container at a time, which waited once for each of them;
        // asked five at once they took 33 waits (2026-11-09), near the 31 five at a time allows.
        expect(store.seen.calls).toBe(readsOneAtATime(luma));
        expect(store.seen.rounds).toBeLessThanOrEqual(readsOneAtATime(luma) / 4);
        expect(store.seen.mostAtOnce).toBe(REQUESTS_AT_ONCE);
    });

    it("still keeps a category holding a product the removal does not take, the categories above it, and that product's set", async () => {
        const luma = lumaShaped();
        const theirs: LumaProduct = { sku: 'sc-own', setId: 13, categories: [100, 101, 110, 130] };
        const store = steppedStore(luma.categories, [...luma.products, theirs]);
        const listed = newestFirst(luma.categories, luma.products, luma.sets);

        const decided = await store.drive(decideRemovals(store.get, listed));

        const kept = (id: number, holds: 'category' | 'product') => ({
            object: obj('categories', id),
            kind: 'category',
            name: `Category ${id}`,
            count: 1,
            holds,
        });
        expect(decided.kept).toEqual([
            kept(130, 'product'),
            kept(110, 'category'),
            kept(101, 'category'),
            kept(100, 'category'),
            {
                object: obj('attribute_sets', 13),
                kind: 'set',
                name: '13',
                count: 1,
                holds: 'product',
            },
        ]);
        const keptIds = new Set([
            'categories/130',
            'categories/110',
            'categories/101',
            'categories/100',
            'attribute_sets/13',
        ]);
        expect(decided.take).toEqual(listed.filter((o) => !keptIds.has(`${o.kind}/${o.id}`)));
    });
});

describe('decideRemovals: what each decision sees of those before it', () => {
    const inCategory = (id: string) =>
        page('products', `&searchCriteria[filterGroups][0][filters][0][field]=category_id&searchCriteria[filterGroups][0][filters][0][value]=${id}&fields=total_count,items[sku]`);

    it('does not keep a category for a child decided after it, as deciding one at a time did not', async () => {
        const ctx = await fakeContext({
            'categories/41': { id: 41, name: 'Racks', path: '1/2/41', children: '42' },
            'categories/42': { id: 42, name: 'Wall Racks', path: '1/2/41/42', children: '' },
            [inCategory('41')]: { items: [], total_count: 0 },
            [inCategory('42')]: { items: [{ sku: 'sc-own' }], total_count: 1 },
        });

        const decided = await decideRemovals(ctx.get, [obj('categories', '41'), obj('categories', '42')]);

        expect(decided.take).toEqual([obj('categories', '41')]);
        expect(decided.kept).toEqual([{ object: obj('categories', '42'), kind: 'category', name: 'Wall Racks', count: 1, holds: 'product' }]);
    });
});

/**
 * The reads deciding one container at a time sends: each category read, a search of each category's
 * products and of each set's, a page per hundred products (Luma's root holds all 2,046: 21 pages).
 */
function readsOneAtATime(luma: ReturnType<typeof lumaShaped>): number {
    const pages = (count: number) => Math.max(1, Math.ceil(count / PAGE_SIZE));
    const inCategory = [...luma.categories.keys()].map((id) =>
        pages(luma.products.filter((p) => p.categories.includes(id)).length)
    );
    const inSet = luma.sets.map((id) => pages(luma.products.filter((p) => p.setId === id).length));
    return luma.categories.size + [...inCategory, ...inSet].reduce((a, b) => a + b, 0);
}
