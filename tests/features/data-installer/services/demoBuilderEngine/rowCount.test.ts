/**
 * One kind's row count (walk F125, owner 2026-11-09): "0 of N" at once, then one more per row the kind
 * has finished with, each row once, and nothing at all for a kind with nothing to count. Every data type
 * that writes rows says it in this one form, so no row in the import window says only that it is
 * installing.
 *
 * The whole install is driven on the full cycle's store and pack (`packCycle.testUtils.ts`): a first
 * install counts each kind from "0 of N" to "N of N", one row at a time; installing again with nothing to
 * write counts nothing. The B2B kinds are proven in `runPack-b2b.test.ts`, on its store.
 */

import { GRID, configStore } from './storeConfig.testUtils';
import { memoryFiles } from './demoBuilderEngine.testUtils';
import { memoryStore } from './memoryStore.testUtils';
import { PACK_ROWS, commerce, opened } from './packCycle.testUtils';
import type { KindContext } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import {
    type PackItems,
    installPack,
} from '@/features/data-installer/services/demoBuilderEngine/runPack';
import {
    NO_COUNT,
    countLine,
    counted,
    startRowCount,
} from '@/features/data-installer/services/demoBuilderEngine/rowCount';

describe('startRowCount', () => {
    it('says "0 of N" at once, then one more for each row settled', () => {
        const lines: string[] = [];

        const count = startRowCount((line) => lines.push(line), 'stocks', ['East', 'West']);
        count.settled('stocks', 'West');
        count.settled('stocks', 'East');

        expect(lines).toEqual(['0 of 2', '1 of 2', '2 of 2']);
    });

    it('counts a row once, and ignores a row outside the total or of another kind', () => {
        const lines: string[] = [];

        const count = startRowCount((line) => lines.push(line), 'stocks', ['East', 'West']);
        count.settled('stocks', 'East');
        count.settled('stocks', 'East');
        count.settled('stocks', 'North');
        count.settled('sources', 'West');
        count.settled('stocks', undefined);

        expect(lines).toEqual(['0 of 2', '1 of 2']);
    });

    it('says nothing when there is nothing to count, or no window to tell', () => {
        const lines: string[] = [];

        expect(startRowCount((line) => lines.push(line), 'stocks', [])).toBe(NO_COUNT);
        expect(startRowCount(undefined, 'stocks', ['East'])).toBe(NO_COUNT);
        expect(lines).toStrictEqual([]);
    });

    it('counts a key named twice in the total once', () => {
        const lines: string[] = [];

        startRowCount((line) => lines.push(line), 'stocks', ['East', 'East']);

        expect(lines).toEqual(['0 of 1']);
    });
});

describe('countLine', () => {
    it('writes both numbers with thousands separators', () => {
        expect(countLine(1000, 1901)).toBe('1,000 of 1,901');
    });
});

describe('counted', () => {
    it("settles the work's rows once it has finished, and returns what it returned", async () => {
        const lines: string[] = [];
        const ctx = {
            count: startRowCount((line) => lines.push(line), 'stocks', ['East', 'West']),
        };

        const answer = await counted(ctx, 'stocks', ['East', 'West'], async () => {
            expect(lines).toEqual(['0 of 2']);
            return 'done';
        });

        expect(answer).toBe('done');
        expect(lines).toEqual(['0 of 2', '1 of 2', '2 of 2']);
    });

    it('settles a row whose work threw, and passes the error on', async () => {
        const lines: string[] = [];
        const ctx = { count: startRowCount((line) => lines.push(line), 'stocks', ['East']) };

        await expect(
            counted(ctx, 'stocks', 'East', () => Promise.reject(new Error('refused')))
        ).rejects.toThrow('refused');

        expect(lines).toEqual(['0 of 1', '1 of 1']);
    });

    it('does the work and counts nothing on a context with no count', async () => {
        await expect(counted({}, 'stocks', 'East', async () => 3)).resolves.toBe(3);
    });
});

/** Each kind's rows in `PACK_ROWS`, as the count's total. */
const ROWS: Record<string, number> = {
    attribute_sets: 1,
    product_attributes: 2,
    attribute_assign_to_set: 2,
    categories: 1,
    customer_groups: 1,
    stocks: 1,
    sources: 1,
    stock_source_links: 1,
    customers: 1,
    cart_rules: 1,
    coupons: 1,
    store_config: 1,
};

/** Kinds that said their own count before (`bulkProducts.ts`, `sourceItemsKind.ts`), with a noun after it. */
const OWN_LINES: Record<string, string> = {
    products: '1 of 1 products',
    giftcards: '1 of 1 gift cards',
    source_items: '1 of 1 stock quantities',
};

/** "0 of n" to "n of n", one at a time. */
const oneByOne = (n: number): string[] =>
    Array.from({ length: n + 1 }, (_, done) => `${done} of ${n}`);

/** A fresh store, and an install of `rows` on it that says each progress line under the kind it came from. */
function storeWith() {
    const access = commerce(memoryStore(), configStore({ default: { [GRID]: '12' } }));
    const files = memoryFiles();
    return async (rows: PackItems): Promise<Record<string, string[]>> => {
        const lines: Record<string, string[]> = {};
        let kind = '';
        const ctx: KindContext = {
            ...(await opened(access, files, [])),
            progress: (line) => void (lines[kind] ??= []).push(line),
        };
        await installPack(ctx, rows, (next) => void (kind = next ?? '(finishing)'));
        return lines;
    };
}

describe('the row count while a pack installs', () => {
    it.each(Object.entries(ROWS))(
        '%s counts from "0 of N" to "N of N", one row at a time',
        async (kind, n) => {
            const lines = await storeWith()(PACK_ROWS);

            expect(lines[kind]).toEqual(oneByOne(n));
        }
    );

    it('every kind that writes rows says "<done> of <total>", and nothing else does', async () => {
        const lines = await storeWith()(PACK_ROWS);

        expect(Object.keys(lines).sort()).toEqual(
            [...Object.keys(ROWS), ...Object.keys(OWN_LINES)].sort()
        );
        for (const [kind, line] of Object.entries(OWN_LINES))
            expect(lines[kind]?.at(-1)).toBe(line);
        for (const said of Object.values(lines).flat())
            expect(said).toMatch(/^\d[\d,]* of \d[\d,]*( |$)/u);
    });

    it('installing the same pack again writes nothing, so it counts nothing', async () => {
        const install = storeWith();
        // The control: the first install on the same store does count.
        expect(Object.keys(await install(PACK_ROWS)).length).toBeGreaterThan(0);

        expect(await install(PACK_ROWS)).toStrictEqual({});
    });

    it('counts a changed row it brings up to the pack, and none of the rows left as they were', async () => {
        const install = storeWith();
        await install(PACK_ROWS);

        const lines = await install({
            ...PACK_ROWS,
            customer_groups: [{ customer_group: { code: 'Cycle VIP', tax_class_id: 5 } }],
        });

        expect(lines).toEqual({ customer_groups: oneByOne(1) });
    });

    it('customers in the import form count each customer, and none on a second install', async () => {
        const install = storeWith();
        const pack: PackItems = {
            customers_export: {
                source: {
                    entity: 'customer_composite',
                    items: [
                        {
                            email: 'coach@example.com',
                            _website: 'base',
                            _store: 'default',
                            firstname: 'Cy',
                            lastname: 'Coach',
                            group_id: 'General',
                        },
                        // A further address of the same customer: one customer, one row of the count.
                        {
                            email: 'Coach@example.com',
                            _website: 'base',
                            firstname: 'Cy',
                            lastname: 'Coach',
                        },
                        {
                            email: 'rider@example.com',
                            _website: 'base',
                            _store: 'default',
                            firstname: 'Ada',
                            lastname: 'Rider',
                            group_id: 'General',
                        },
                    ],
                },
            },
        };

        expect(await install(pack)).toEqual({ customers_export: oneByOne(2) });
        expect(await install(pack)).toStrictEqual({});
    });
});
