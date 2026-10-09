/**
 * commerceBulk — one bulk call, followed to its end (AB-74). The send's ARGUMENTS are asserted
 * (method, path, bodies, the bulk route), since a fake answers the same whatever it is handed.
 * Answers are the typed fixtures in tests/helpers/commerceAssignFixtures.ts.
 */

import { bulkAccepted, bulkStatus } from '../../../helpers/commerceAssignFixtures';
import { followBulk, startBulk, type BulkFollowDeps } from '@/features/app-builder/services/commerceBulk';

function clock(step = 3000): Pick<BulkFollowDeps, 'now' | 'sleep'> & { slept: number[] } {
    let at = 0;
    const slept: number[] = [];
    return {
        slept,
        now: () => at,
        sleep: async (ms) => {
            slept.push(ms);
            at += step;
        },
    };
}

describe('startBulk', () => {
    it('sends every body in ONE call on the bulk route and answers the uuid', async () => {
        const send = jest.fn(async () => bulkAccepted(2, 'u-1'));
        const bodies = [{ product: { sku: 'A' } }, { product: { sku: 'B' } }];
        await expect(startBulk(send, 'PUT', 'products/bySku', bodies)).resolves.toBe('u-1');
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith('PUT', 'products/bySku', bodies, { bulk: true });
    });

    it('throws when Commerce answers no bulk id', async () => {
        const send = jest.fn(async () => ({ errors: true }));
        await expect(startBulk(send, 'PUT', 'products/bySku', [{}])).rejects.toThrow('no bulk id');
    });
});

describe('followBulk', () => {
    it('reads the status until no operation is open, reporting progress', async () => {
        const answers = [bulkStatus([1, 4, 4]), bulkStatus([1, 1, 4]), bulkStatus([1, 1, 1])];
        const get = jest.fn(async () => answers.shift());
        const time = clock();
        const progress: Array<[number, number]> = [];
        const outcome = await followBulk(get, 'u-1', 3, {
            ...time,
            intervalMs: 3000,
            deadlineMs: 60_000,
            onProgress: (done, total) => progress.push([done, total]),
        });
        expect(get).toHaveBeenCalledWith('bulk/u-1/status');
        expect(get).toHaveBeenCalledTimes(3);
        expect(time.slept).toEqual([3000, 3000]);
        expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
        expect(outcome).toStrictEqual({ uuid: 'u-1', total: 3, complete: 3, failed: [], open: 0, timedOut: false });
    });

    it('counts failed and rejected operations with Commerce\'s words', async () => {
        const get = jest.fn(async () => bulkStatus([1, 3, 5], { 1: 'The product was unable to be saved.' }));
        const outcome = await followBulk(get, 'u-2', 3, { ...clock(), intervalMs: 3000, deadlineMs: 60_000 });
        expect(outcome.complete).toBe(1);
        expect(outcome.failed).toEqual([
            { index: 1, message: 'The product was unable to be saved.' },
            { index: 2, message: 'status 5' },
        ]);
        expect(outcome.open).toBe(0);
    });

    it('treats operations not listed yet as still queued', async () => {
        const answers = [bulkStatus([1]), bulkStatus([1, 1])];
        const get = jest.fn(async () => answers.shift());
        const outcome = await followBulk(get, 'u-3', 2, { ...clock(), intervalMs: 3000, deadlineMs: 60_000 });
        expect(get).toHaveBeenCalledTimes(2);
        expect(outcome.complete).toBe(2);
    });

    it('stops at the deadline and says how many are still open', async () => {
        const get = jest.fn(async () => bulkStatus([1, 4]));
        const outcome = await followBulk(get, 'u-4', 2, { ...clock(5000), intervalMs: 5000, deadlineMs: 10_000 });
        expect(outcome).toMatchObject({ complete: 1, open: 1, timedOut: true });
    });
});
