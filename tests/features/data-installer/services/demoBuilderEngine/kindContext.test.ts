/**
 * The two Commerce answers every kind reads the same way: "no such thing" on a read, and
 * "already gone" on a delete (DI-5).
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import {
    ATTRIBUTE_CODE,
    CREATES_AT_ONCE,
    SOURCE_CODE,
    deleteIfPresent,
    eachFewAtOnce,
    firstOfEach,
    isAlreadyGone,
    readOrNull,
    segment,
} from '@/features/data-installer/services/demoBuilderEngine/kindContext';

describe('readOrNull', () => {
    it('answers what Commerce answered', async () => {
        const get = jest.fn().mockResolvedValue({ attribute_code: 'color' });

        await expect(readOrNull(get, 'products/attributes/color')).resolves.toEqual({ attribute_code: 'color' });
        expect(get).toHaveBeenCalledWith('products/attributes/color');
    });

    it('answers null for a 404', async () => {
        const get = jest.fn().mockRejectedValue(new CommerceReadError('not found', 404));

        await expect(readOrNull(get, 'products/attributes/color')).resolves.toBeNull();
    });

    it('passes any other refusal on', async () => {
        const get = jest.fn().mockRejectedValue(new CommerceReadError('denied', 401));

        await expect(readOrNull(get, 'products/attributes/color')).rejects.toThrow('denied');
    });
});

describe('isAlreadyGone', () => {
    it.each([
        ['a 404', new CommerceReadError('x', 404), true],
        ['a 410', new CommerceReadError('x', 410), true],
        ['a 400 saying no such entity', new CommerceReadError('No such entity with id = 5', 400), true],
        ['a 400 saying it does not exist', new CommerceReadError('The attribute doesn\'t exist', 400), true],
        ['another 400', new CommerceReadError('Invalid value', 400), false],
        ['a 500', new CommerceReadError('boom', 500), false],
        ['an error with no status', new Error('network'), false],
    ])('%s → %s', (_label, error, expected) => {
        expect(isAlreadyGone(error)).toBe(expected);
    });
});

describe('deleteIfPresent', () => {
    it('sends the DELETE', async () => {
        const send = jest.fn().mockResolvedValue(true);

        await deleteIfPresent(send, 'categories/41');

        expect(send).toHaveBeenCalledWith('DELETE', 'categories/41', undefined);
    });

    it('counts already gone as done', async () => {
        const send = jest.fn().mockRejectedValue(new CommerceReadError('gone', 404));

        await expect(deleteIfPresent(send, 'categories/41')).resolves.toBeUndefined();
    });

    it('passes a real refusal on', async () => {
        const send = jest.fn().mockRejectedValue(new CommerceReadError('boom', 500));

        await expect(deleteIfPresent(send, 'categories/41')).rejects.toThrow('boom');
    });
});

/**
 * A pack is untrusted input (DI-5): a crafted code must not reach a Commerce address, so the
 * rules refuse it when the pack is read and `segment` escapes whatever is placed in an address.
 */
describe('untrusted pack codes', () => {
    it.each(['../../customers/5', 'color/../x', 'with space', '', '9starts_with_digit', 'a'.repeat(61)])(
        'refuses the attribute code %j',
        (code) => {
            expect(ATTRIBUTE_CODE.test(code)).toBe(false);
        },
    );

    it.each(['color', 'bodea_fabric', 'cs_unlimited_talk_text', 'A1'])('accepts the attribute code %j', (code) => {
        expect(ATTRIBUTE_CODE.test(code)).toBe(true);
    });

    it.each(['../x', 'a/b', 'a b'])('refuses the source code %j', (code) => {
        expect(SOURCE_CODE.test(code)).toBe(false);
    });

    it.each(['default', 'carvelo_long_island', 'ac-us-store'])('accepts the source code %j', (code) => {
        expect(SOURCE_CODE.test(code)).toBe(true);
    });

    it('escapes a value into one path segment, so a slash cannot climb', () => {
        expect(segment('../../customers/5')).toBe('..%2F..%2Fcustomers%2F5');
        expect(segment(41)).toBe('41');
    });
});

describe('eachFewAtOnce', () => {
    /** Work that waits until released, counting how many are in flight at once. */
    function heldWork() {
        const started: number[] = [];
        const release: Array<() => void> = [];
        let inFlight = 0;
        let most = 0;
        const work = (n: number) => {
            started.push(n);
            inFlight += 1;
            most = Math.max(most, inFlight);
            return new Promise<void>((resolve, reject) => {
                release[n] = () => {
                    inFlight -= 1;
                    if (n === 1) reject(new Error('refused 1'));
                    else resolve();
                };
            });
        };
        return { started, release, work, most: () => most };
    }

    const ticks = async () => {
        for (let i = 0; i < 5; i += 1) await Promise.resolve();
    };

    it(`sends ${CREATES_AT_ONCE} at a time, starting the next group once the last has finished`, async () => {
        const h = heldWork();
        const items = Array.from({ length: 7 }, (_, i) => i + 2);
        const done = eachFewAtOnce(items, h.work);

        await ticks();
        expect(h.started).toEqual([2, 3, 4, 5, 6]);
        for (const n of [2, 3, 4, 5, 6]) h.release[n]();
        await ticks();
        expect(h.started).toEqual([2, 3, 4, 5, 6, 7, 8]);
        h.release[7]();
        h.release[8]();
        await done;
        expect(h.most()).toBe(CREATES_AT_ONCE);
    });

    it('lets a failing group finish, then throws its failure and starts no more', async () => {
        const h = heldWork();
        const done = eachFewAtOnce([0, 1, 2, 3, 4, 5], h.work);
        const settled = jest.fn();
        void done.catch(settled);

        await ticks();
        h.release[1]();
        await ticks();
        // Still waiting on the rest of the group: none of it is on its way when the failure is told.
        expect(settled).not.toHaveBeenCalled();
        for (const n of [0, 2, 3, 4]) h.release[n]();

        await expect(done).rejects.toThrow('refused 1');
        expect(h.started).not.toContain(5);
    });
});

describe('firstOfEach', () => {
    it('keeps the first item of each key, in order', () => {
        const rows = [{ k: 'a', n: 1 }, { k: 'b', n: 2 }, { k: 'a', n: 3 }];

        expect(firstOfEach(rows, (r) => r.k)).toEqual([{ k: 'a', n: 1 }, { k: 'b', n: 2 }]);
    });
});
