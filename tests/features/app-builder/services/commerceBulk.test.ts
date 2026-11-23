/**
 * commerceBulk — one bulk call, followed to its end (AB-74). The send's ARGUMENTS are asserted
 * (method, path, bodies, the bulk route), since a fake answers the same whatever it is handed.
 * Answers are the typed fixtures in tests/helpers/commerceAssignFixtures.ts.
 */

import recordedStatus from '../../../fixtures/commerce-rest/bulk-status-products.json';
import { bulkAccepted, bulkStatus } from '../../../helpers/commerceAssignFixtures';
import { followBulk, readBulkRows, startBulk, type BulkFollowDeps } from '@/features/app-builder/services/commerceBulk';
import type { CommerceBulkStatus } from '@/types/commerceWire';

/** Typed, so a recorded answer the wire type no longer describes fails typecheck:tests. */
const RECORDED: CommerceBulkStatus = recordedStatus;

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
    it('reads the answer Commerce really gave for three saved products (recorded 2026-10-09)', async () => {
        const get = jest.fn(async () => RECORDED);
        const outcome = await followBulk(get, RECORDED.bulk_id ?? '', 3, { ...clock(), intervalMs: 3000, deadlineMs: 60_000 });
        expect(get).toHaveBeenCalledWith(`bulk/${RECORDED.bulk_id}/status`);
        expect(outcome).toMatchObject({ total: 3, complete: 3, open: 0, timedOut: false });
        expect(outcome.failed).toStrictEqual([]);
    });

    it('the builder makes the recorded shape', () => {
        expect(bulkStatus([1, 1, 1])).toStrictEqual(RECORDED);
    });

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

describe('readBulkRows', () => {
    it('reads the recorded answer as three made rows, by index', async () => {
        const get = jest.fn(async () => RECORDED);
        const rows = await readBulkRows(get, 'u-1', 3);
        expect(get).toHaveBeenCalledWith('bulk/u-1/status');
        expect(rows.map((r) => [r.index, r.state])).toEqual([[0, 'done'], [1, 'done'], [2, 'done']]);
    });

    it('says how each request ended, with Commerce\'s words, and a request not listed yet is open', async () => {
        const status = bulkStatus([1, 2, 3, 5], { 2: 'URL key for specified store already exists.', 3: 'rejected' });
        const rows = await readBulkRows(async () => status, 'u-1', 5);
        expect(rows.map((r) => r.state)).toEqual(['done', 'retry', 'refused', 'refused', 'open']);
        expect(rows[2].message).toBe('URL key for specified store already exists.');
    });

    it('ignores an operation whose id is not a position in the call', async () => {
        const status: CommerceBulkStatus = { operations_list: [{ id: 7, status: 1 }, { id: 0, status: 3, result_message: 'no' }] };
        const rows = await readBulkRows(async () => status, 'u-1', 2);
        expect(rows.map((r) => r.state)).toEqual(['refused', 'open']);
    });
});

// Live, 2026-11-06: one 401 on a status read stopped a 7-minute install; the same read answered a minute later.
describe('a failed status read', () => {
    const refused = () => Promise.reject(new Error('Commerce answered 401 for bulk/u-1/status'));

    it('is read again, so one glitch does not stop the follow', async () => {
        const get = jest.fn().mockImplementationOnce(refused).mockImplementationOnce(refused).mockResolvedValue(bulkStatus([1]));
        const time = clock();

        const outcome = await followBulk(get, 'u-1', 1, { ...time, intervalMs: 3000, deadlineMs: 60_000 });
        const rows = await readBulkRows(jest.fn().mockImplementationOnce(refused).mockResolvedValue(bulkStatus([1])), 'u-1', 1, { sleep: time.sleep, intervalMs: 1 });

        expect(outcome).toMatchObject({ complete: 1, open: 0 });
        // Two pauses for the follow's two failed reads, then one for the rows' failed read.
        expect(time.slept).toEqual([3000, 3000, 1]);
        expect(rows[0].state).toBe('done');
    });

    it('still stops the follow when it keeps failing', async () => {
        const get = jest.fn().mockImplementation(refused);

        await expect(followBulk(get, 'u-1', 1, { ...clock(), intervalMs: 3000, deadlineMs: 60_000 })).rejects.toThrow('401');
        expect(get).toHaveBeenCalledTimes(3);
    });
});
