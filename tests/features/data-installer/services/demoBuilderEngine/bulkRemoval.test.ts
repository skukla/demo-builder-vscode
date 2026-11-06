/**
 * bulkRemoval — a pack's products taken back through the bulk queue, and one at a time whenever the
 * queue does not finish one. The bulk call's ARGUMENTS are asserted (route, method, bodies), since a
 * fake answers the same whatever it is handed. Status answers come from `bulkStatus`, the builder of
 * the live Justrite answer's shape (tests/fixtures/commerce-rest/bulk-status-products.json).
 */

import { bulkAccepted, bulkStatus } from '../../../../helpers/commerceAssignFixtures';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import type { BulkWait } from '@/features/data-installer/services/demoBuilderEngine/bulkProducts';
import { removeProductsInBulk } from '@/features/data-installer/services/demoBuilderEngine/bulkRemoval';
import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { CommerceBulkStatus } from '@/types/commerceWire';

const NO_WAIT: BulkWait = {
    sleep: async () => undefined,
    now: () => 0,
    intervalMs: 1,
    deadlineMs: 0,
};

const recorded = (count: number): CreatedObject[] =>
    Array.from({ length: count }, (_, i) => ({ kind: 'products', id: `s${i}` }));

interface Call {
    method: string;
    path: string;
    body: unknown;
    bulk: boolean;
}

function commerce(
    statuses: (size: number) => number[] = (size) => Array(size).fill(1),
    refuseCall?: Error
) {
    const calls: Call[] = [];
    const answers = new Map<string, CommerceBulkStatus>();
    return {
        calls,
        send: async (
            method: 'POST' | 'PUT' | 'DELETE',
            path: string,
            body: unknown,
            route?: { bulk?: boolean }
        ) => {
            calls.push({ method, path, body, bulk: route?.bulk === true });
            if (refuseCall) throw refuseCall;
            const size = (body as unknown[]).length;
            const uuid = `u-${calls.length}`;
            answers.set(uuid, bulkStatus(statuses(size)));
            return bulkAccepted(size, uuid);
        },
        get: async (path: string) => answers.get(/^bulk\/(.+)\/status$/u.exec(path)?.[1] ?? ''),
    };
}

function recorder() {
    const dropped: string[][] = [];
    return {
        dropped,
        drop: async (...objects: Pick<CreatedObject, 'id'>[]) =>
            void dropped.push(objects.map((o) => o.id)),
    };
}

describe('removeProductsInBulk', () => {
    it('deletes 120 products in three bulk calls by SKU, dropping each batch from the record in one write', async () => {
        const store = commerce();
        const record = recorder();
        const one = jest.fn(async (_object: CreatedObject) => undefined);

        await removeProductsInBulk(store, record, recorded(120), one, NO_WAIT);

        expect(
            store.calls.map((c) => [c.method, c.path, c.bulk, (c.body as unknown[]).length])
        ).toEqual([
            ['DELETE', 'products/bySku', true, 50],
            ['DELETE', 'products/bySku', true, 50],
            ['DELETE', 'products/bySku', true, 20],
        ]);
        expect((store.calls[0].body as unknown[])[0]).toEqual({ sku: 's0' });
        expect(record.dropped.map((batch) => batch.length)).toEqual([50, 50, 20]);
        expect(one).not.toHaveBeenCalled();
    });

    it('takes back on its own each product the queue did not finish, whatever the reason', async () => {
        const store = commerce(() => [1, 2, 3, 4]);
        const record = recorder();
        const one = jest.fn(async (_object: CreatedObject) => undefined);

        const logged: string[] = [];

        await removeProductsInBulk({ ...store, log: (line) => logged.push(line) }, record, recorded(4), one, NO_WAIT);

        expect(record.dropped).toEqual([['s0']]);
        expect(one.mock.calls.map(([o]) => o.id)).toEqual(['s1', 's2', 's3']);
        // Debug Logs says which way each went, so a live run shows whether the bulk route worked.
        expect(logged[0]).toBe('took back 1 of 4 products in one bulk call');
        expect(logged[3]).toBe('product s3 did not finish in the bulk queue (still queued); taking it back on its own');
    });

    it('takes every product back on its own when the store refuses the bulk delete route', async () => {
        const store = commerce(
            undefined,
            new CommerceReadError('Commerce answered 404 for products/bySku: ', 404)
        );
        const one = jest.fn(async (_object: CreatedObject) => undefined);

        const logged: string[] = [];

        await removeProductsInBulk({ ...store, log: (line) => logged.push(line) }, recorder(), recorded(3), one, NO_WAIT);

        expect(one).toHaveBeenCalledTimes(3);
        expect(logged).toEqual(['Commerce refused taking 3 products back together (HTTP 404); taking them back one at a time']);
    });

    it('stops when Commerce refuses who we are, taking nothing back', async () => {
        const denied = new CommerceReadError(
            'Commerce answered 403 for products/bySku: denied',
            403
        );
        const one = jest.fn(async (_object: CreatedObject) => undefined);

        await expect(
            removeProductsInBulk(commerce(undefined, denied), recorder(), recorded(2), one, NO_WAIT)
        ).rejects.toBe(denied);

        expect(one).not.toHaveBeenCalled();
    });
});
