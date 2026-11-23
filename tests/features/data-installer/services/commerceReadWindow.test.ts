/**
 * What the changes check read from Commerce, kept for the save and the uninstall that follow it
 * (owner, 2026-11-10, walk F128): Luma's import over the demo's pack read Commerce three times,
 * 45 s, 40 s and 34 s, with nothing written to Commerce in between.
 */

import { forgetReadWindows, throughReadWindow } from '@/features/data-installer/services/commerceReadWindow';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';

const PROJECT = '/projects/luma';

/** A Commerce client that answers each path with its own name and counts its calls. */
function commerce() {
    const get = jest.fn(async (path: string): Promise<{ path: string; name?: string }> => ({ path }));
    const send = jest.fn(async () => ({}));
    return { get, send };
}

beforeEach(() => forgetReadWindows());
afterEach(() => jest.useRealTimers());

describe('a save or an uninstall after the changes check', () => {
    it('answers a read the check made from what the check read, and reads Commerce for the rest', async () => {
        const store = commerce();
        await throughReadWindow(PROJECT, 'remember', store).get('categories/12');

        const reuse = throughReadWindow(PROJECT, 'reuse', store);

        await expect(reuse.get('categories/12')).resolves.toEqual({ path: 'categories/12' });
        await expect(reuse.get('products/24-MB01')).resolves.toEqual({ path: 'products/24-MB01' });
        expect(store.get.mock.calls.map(([path]) => path)).toEqual(['categories/12', 'products/24-MB01']);
    });

    it('says once in Debug Logs that it reused the check, and how long ago', async () => {
        const store = commerce();
        const log = jest.fn();
        const check = throughReadWindow(PROJECT, 'remember', store);
        await check.get('a');
        await check.get('b');

        const reuse = throughReadWindow(PROJECT, 'reuse', store, log);
        await reuse.get('a');
        await reuse.get('b');

        expect(log.mock.calls).toEqual([['reusing what the changes check read from Commerce 0 s ago']]);
    });

    it('CONTROL: with no check before it, reads Commerce for everything and says nothing', async () => {
        const store = commerce();
        const log = jest.fn();

        await throughReadWindow(PROJECT, 'reuse', store, log).get('categories/12');

        expect(store.get).toHaveBeenCalledTimes(1);
        expect(log).not.toHaveBeenCalled();
    });
});

describe('when Commerce may have changed, it reads Commerce again', () => {
    it('after any write through a client of the same project', async () => {
        const store = commerce();
        await throughReadWindow(PROJECT, 'remember', store).get('categories/12');
        const reuse = throughReadWindow(PROJECT, 'reuse', store);

        await reuse.send('DELETE', 'categories/12', undefined);
        await reuse.get('categories/12');

        expect(store.get).toHaveBeenCalledTimes(2);
    });

    it('once the window has passed', async () => {
        jest.useFakeTimers();
        const store = commerce();
        await throughReadWindow(PROJECT, 'remember', store).get('categories/12');

        jest.advanceTimersByTime(CACHE_TTL.MEDIUM);
        await throughReadWindow(PROJECT, 'reuse', store).get('categories/12');

        expect(store.get).toHaveBeenCalledTimes(2);
    });

    it('for a read the check could not make', async () => {
        const store = commerce();
        store.get.mockRejectedValueOnce(new Error('Commerce answered 503'));
        await expect(throughReadWindow(PROJECT, 'remember', store).get('categories/12')).rejects.toThrow('503');

        await expect(throughReadWindow(PROJECT, 'reuse', store).get('categories/12')).resolves.toEqual({ path: 'categories/12' });
        expect(store.get).toHaveBeenCalledTimes(2);
    });
});

describe('the check itself', () => {
    // An edit the SC makes in the Admin between two checks must be seen by the second.
    it('always reads Commerce, never an earlier check, and replaces what that check kept', async () => {
        const store = commerce();
        await throughReadWindow(PROJECT, 'remember', store).get('categories/12');
        store.get.mockResolvedValueOnce({ path: 'categories/12', name: 'Edited' });

        await throughReadWindow(PROJECT, 'remember', store).get('categories/12');
        const reused = await throughReadWindow(PROJECT, 'reuse', store).get('categories/12');

        expect(store.get).toHaveBeenCalledTimes(2);
        expect(reused).toEqual({ path: 'categories/12', name: 'Edited' });
    });

    it("keeps one project's reads from another's", async () => {
        const store = commerce();
        await throughReadWindow(PROJECT, 'remember', store).get('categories/12');

        await throughReadWindow('/projects/bodea', 'reuse', store).get('categories/12');

        expect(store.get).toHaveBeenCalledTimes(2);
    });
});
