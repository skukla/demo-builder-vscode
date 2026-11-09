/**
 * packReadCache (walk F82, 2026-11-09): every read of a pack's rows is kept a few minutes and
 * shared, in the house cache entry (`core/cache`). Reading Luma takes about 9 seconds, and one
 * re-import read it twice, Create Datapack once per kind listed.
 */

import { cachedPackRead, forgetPackRead, forgetPackReads } from '@/features/data-installer/services/packReadCache';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';

const LUMA = { name: 'luma', version: 'eds-compatible' };
const ROWS = { products: [{ product: { sku: 'MB01' } }] };
const AT = 1_000_000;

beforeEach(() => {
    forgetPackReads();
    jest.spyOn(Date, 'now').mockReturnValue(AT);
});

afterEach(() => jest.restoreAllMocks());

describe('cachedPackRead', () => {
    it('reads once, and the next caller within the keep gets the same rows', async () => {
        const read = jest.fn(async () => ROWS);

        await expect(cachedPackRead(LUMA, 'library', read)).resolves.toBe(ROWS);
        await expect(cachedPackRead(LUMA, 'library', read)).resolves.toBe(ROWS);

        expect(read).toHaveBeenCalledTimes(1);
    });

    it('shares a read still in progress: two callers at once, one read', async () => {
        let finish: (rows: typeof ROWS) => void = () => undefined;
        const read = jest.fn(() => new Promise<typeof ROWS>((resolve) => { finish = resolve; }));

        const first = cachedPackRead(LUMA, 'library', read);
        const second = cachedPackRead(LUMA, 'library', read);
        finish(ROWS);

        await expect(Promise.all([first, second])).resolves.toEqual([ROWS, ROWS]);
        expect(read).toHaveBeenCalledTimes(1);
    });

    it('reads again once the keep has run out', async () => {
        const read = jest.fn(async () => ROWS);
        await cachedPackRead(LUMA, 'library', read);

        jest.spyOn(Date, 'now').mockReturnValue(AT + CACHE_TTL.MEDIUM + 1);
        await cachedPackRead(LUMA, 'library', read);

        expect(read).toHaveBeenCalledTimes(2);
    });

    it('keeps each version and store apart', async () => {
        const read = jest.fn(async () => ROWS);
        await cachedPackRead(LUMA, 'library', read);

        await cachedPackRead({ ...LUMA, version: 'main' }, 'library', read);
        await cachedPackRead(LUMA, 'installer', read);

        expect(read).toHaveBeenCalledTimes(3);
    });

    it('keeps nothing from a read that failed, so the next caller reads again', async () => {
        const read = jest.fn().mockRejectedValueOnce(new Error('library down')).mockResolvedValue(ROWS);

        await expect(cachedPackRead(LUMA, 'library', read)).rejects.toThrow('library down');
        await expect(cachedPackRead(LUMA, 'library', read)).resolves.toBe(ROWS);
        expect(read).toHaveBeenCalledTimes(2);
    });

    it('forgets a version Demo Builder has written, from both stores', async () => {
        const read = jest.fn(async () => ROWS);
        await cachedPackRead(LUMA, 'library', read);
        await cachedPackRead(LUMA, 'installer', read);

        forgetPackRead(LUMA);
        await cachedPackRead(LUMA, 'library', read);
        await cachedPackRead(LUMA, 'installer', read);

        expect(read).toHaveBeenCalledTimes(4);
    });
});
