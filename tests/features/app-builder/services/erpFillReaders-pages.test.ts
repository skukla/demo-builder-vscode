/**
 * readAllPages: the first page says how many there are, then the rest are read together.
 * Commerce took 7.7 s for Justrite's four pages in turn and 2.6 s at once (2026-10-18), and
 * Add another ERP waited on every one of them.
 */

import { readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceGet } from '@/types/commerceWire';

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * A store of `total` items answering pages of 100. Every request is held until released, so a
 * test can see which pages are in flight at the same time.
 */
function store(total: number) {
    const asked: number[] = [];
    const held: Array<() => void> = [];
    const get: CommerceGet = (path) => {
        const page = Number(/currentPage\]=(\d+)/u.exec(path)?.[1]);
        asked.push(page);
        const count = Math.max(0, Math.min(100, total - (page - 1) * 100));
        const items = Array.from({ length: count }, (_, i) => ({ sku: `S${(page - 1) * 100 + i + 1}` }));
        return new Promise((resolve) => held.push(() => resolve({ items, total_count: total })));
    };
    /** Answer the requests in flight now, and let the reader ask for its next ones. */
    const answerInFlight = async (): Promise<number> => {
        const now = held.splice(0);
        now.forEach((answer) => answer());
        await flush();
        return now.length;
    };
    const answerAll = async (): Promise<void> => {
        while ((await answerInFlight()) > 0);
    };
    return { get, asked, held, answerInFlight, answerAll };
}

it('asks for pages 2 to 4 together once the first has said how many there are', async () => {
    const { get, asked, held, answerInFlight, answerAll } = store(321);

    const reading = readAllPages<{ sku: string }>(get, 'products');
    await flush();
    expect(asked).toStrictEqual([1]);

    await answerInFlight();
    expect(asked).toStrictEqual([1, 2, 3, 4]);
    expect(held).toHaveLength(3);

    await answerAll();
    const items = await reading;
    expect(items).toHaveLength(321);
    expect(items[0].sku).toBe('S1');
    expect(items[320].sku).toBe('S321');
});

it('has no more than four pages in flight on a big catalog, and keeps page order', async () => {
    const { get, asked, held, answerInFlight, answerAll } = store(1000);

    const reading = readAllPages<{ sku: string }>(get, 'products');
    await flush();
    await answerInFlight();
    expect(held).toHaveLength(4);
    expect(asked).toStrictEqual([1, 2, 3, 4, 5]);

    await answerAll();
    const items = await reading;
    expect(items.map((item) => item.sku)).toStrictEqual(Array.from({ length: 1000 }, (_, i) => `S${i + 1}`));
    expect(asked).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

it('reads one page when everything fits on it', async () => {
    const { get, asked, answerAll } = store(40);

    const reading = readAllPages(get, 'products');
    await flush();
    await answerAll();

    expect(await reading).toHaveLength(40);
    expect(asked).toStrictEqual([1]);
});
