/**
 * bulkProducts — products through Commerce's bulk queue, each row reported as a single create is.
 *
 * Commerce is a hand-held fake here, not the queue stand-in the other suites use, so each test says
 * how every row ends. The bulk call's ARGUMENTS are asserted (route, batch sizes), since a fake
 * answers the same whatever it is handed. Status answers come from `bulkStatus`, the builder of the
 * live Justrite answer's shape (tests/fixtures/commerce-rest/bulk-status-products.json).
 */

import { bulkAccepted, bulkStatus } from '../../../../helpers/commerceAssignFixtures';
import { memoryFiles, NOW, PACK, PROJECT } from './demoBuilderEngine.testUtils';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import {
    type BulkRun,
    type BulkWait,
    createProductsInBulk,
    productIdsInStore,
    type ProductToMake,
} from '@/features/data-installer/services/demoBuilderEngine/bulkProducts';
import { openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    type KindContext,
    newCatalogSession,
} from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import type { CommerceBulkStatus } from '@/types/commerceWire';

/** A follow that never waits: a batch still open is given up on at once. */
const NO_WAIT: BulkWait = {
    sleep: async () => undefined,
    now: () => 0,
    intervalMs: 1,
    deadlineMs: 0,
};

const products = (count: number): ProductToMake[] =>
    Array.from({ length: count }, (_, i) => ({
        sku: `s${i}`,
        body: { product: { sku: `s${i}` } },
    }));

interface Harness {
    ctx: KindContext;
    bulkSizes: number[];
    logged: string[];
    progressed: string[];
    reads: string[];
}

/**
 * A context whose bulk calls end as `statuses` says, per call (1 made, 2 retry, 3 refused, 4 open),
 * and whose search for SKUs finds `inStore`.
 */
async function harness(
    statuses: (call: number, size: number) => number[] = (_, size) => Array(size).fill(1),
    options: {
        messages?: Record<number, string>;
        refuseCall?: Error;
        inStore?: Record<string, number>;
    } = {}
): Promise<Harness> {
    const bulkSizes: number[] = [];
    const logged: string[] = [];
    const progressed: string[] = [];
    const reads: string[] = [];
    const answers = new Map<string, CommerceBulkStatus>();
    const ctx: KindContext = {
        recorder: await openInstallRecord(memoryFiles(), PROJECT, PACK, NOW),
        session: newCatalogSession(),
        log: (line) => void logged.push(line),
        progress: (line) => void progressed.push(line),
        send: async (_method, _path, body, route) => {
            if (!route?.bulk) throw new Error('only bulk calls are expected here');
            if (options.refuseCall) throw options.refuseCall;
            const size = (body as unknown[]).length;
            bulkSizes.push(size);
            const uuid = `u-${bulkSizes.length}`;
            answers.set(uuid, bulkStatus(statuses(bulkSizes.length, size), options.messages));
            return bulkAccepted(size, uuid);
        },
        get: async (path) => {
            reads.push(path);
            const status = /^bulk\/(.+)\/status$/u.exec(path);
            if (status) return answers.get(status[1]);
            const items = Object.entries(options.inStore ?? {}).map(([sku, id]) => ({ sku, id }));
            return { items, total_count: items.length };
        },
    };
    return { ctx, bulkSizes, logged, progressed, reads };
}

const runFor = (total: number, single: BulkRun['single'] = async () => undefined): BulkRun => ({
    kind: 'products',
    noun: 'products',
    total,
    done: 0,
    single,
});

describe('createProductsInBulk', () => {
    it('sends 120 products as three bulk calls of 50, 50 and 20, and records and logs each', async () => {
        const h = await harness();

        await createProductsInBulk(h.ctx, runFor(120), products(120), NO_WAIT);

        expect(h.bulkSizes).toEqual([50, 50, 20]);
        expect(h.ctx.recorder.created).toHaveLength(120);
        expect(h.ctx.recorder.pending).toStrictEqual([]);
        expect(h.logged).toContain('created product s119');
        expect(h.progressed.at(-1)).toBe('120 of 120 products');
    });

    it("records a made row, skips a refused one in Commerce's words, and sends a retried or open one again on its own", async () => {
        const h = await harness(() => [1, 3, 2, 4], {
            messages: { 1: 'URL key for specified store already exists.' },
        });
        const single = jest.fn(async (_product: ProductToMake) => undefined);

        await createProductsInBulk(h.ctx, runFor(4, single), products(4), NO_WAIT);

        expect(h.ctx.recorder.created.map((o) => o.id)).toEqual(['s0']);
        expect(h.ctx.session.skipped).toEqual([
            { kind: 'products', key: 's1', reason: 'URL key for specified store already exists.' },
        ]);
        expect(single.mock.calls.map(([p]) => p.sku)).toEqual(['s2', 's3']);
        // Handed to the single route still pending: it records them once Commerce answers.
        expect(h.ctx.recorder.pending.map((p) => p.key)).toEqual(['s2', 's3']);
        expect(h.logged).toContain('product s2 did not finish in the bulk queue (failed, worth trying again); sending it on its own');
        expect(h.logged).toContain('product s3 did not finish in the bulk queue (still queued); sending it on its own');
    });

    it('sends a batch one at a time when Commerce refuses the call itself for its size (400), saying so', async () => {
        const tooMany = new CommerceReadError(
            'Commerce answered 400 for products: {"message":"Too many entities"}',
            400
        );
        const h = await harness(undefined, { refuseCall: tooMany });
        const single = jest.fn(async (_product: ProductToMake) => undefined);

        await createProductsInBulk(h.ctx, runFor(3, single), products(3), NO_WAIT);

        expect(single).toHaveBeenCalledTimes(3);
        expect(h.ctx.recorder.pending).toStrictEqual([]);
        expect(h.logged).toContain(
            'Commerce refused 3 products sent together (Too many entities); sending them one at a time'
        );
    });

    it('stops when Commerce refuses who we are, leaving nothing pending, and sends nothing on its own', async () => {
        const notSignedIn = new CommerceReadError(
            'Commerce answered 401 for products: denied',
            401
        );
        const h = await harness(undefined, { refuseCall: notSignedIn });
        const single = jest.fn(async (_product: ProductToMake) => undefined);

        await expect(
            createProductsInBulk(h.ctx, runFor(2, single), products(2), NO_WAIT)
        ).rejects.toBe(notSignedIn);

        expect(single).not.toHaveBeenCalled();
        expect(h.ctx.recorder.pending).toStrictEqual([]);
    });

    it('stops when the bulk call gets no answer, leaving the batch pending for the next run to settle', async () => {
        const noAnswer = new CommerceReadError('Commerce did not respond to products: timed out');
        const h = await harness(undefined, { refuseCall: noAnswer });

        await expect(createProductsInBulk(h.ctx, runFor(2), products(2), NO_WAIT)).rejects.toBe(
            noAnswer
        );

        expect(h.ctx.recorder.pending.map((p) => p.key)).toEqual(['s0', 's1']);
    });

    it("learns the new products' ids for the parents that link them", async () => {
        const h = await harness(undefined, { inStore: { S0: 41, s1: 42 } });

        await createProductsInBulk(h.ctx, runFor(2), products(2), NO_WAIT);

        expect([...(h.ctx.session.productIds ?? [])]).toEqual([
            ['s0', 41],
            ['s1', 42],
        ]);
    });
});

describe('productIdsInStore', () => {
    it('asks for a hundred SKUs at a time, and reads a SKU holding a comma on its own', async () => {
        const reads: string[] = [];
        const get = async (path: string) => {
            reads.push(path);
            return path.startsWith('products?')
                ? { items: [{ sku: 'A-1', id: 7 }], total_count: 1 }
                : { id: 9 };
        };
        const skus = [...Array.from({ length: 150 }, (_, i) => `p${i}`), 'odd,sku'];

        const found = await productIdsInStore(get, skus);

        expect(reads.filter((r) => r.startsWith('products?'))).toHaveLength(2);
        expect(reads[0]).toContain('[conditionType]=in');
        expect(reads[0]).toContain('[value]=p0,p1,');
        expect(reads.at(-1)).toBe('products/odd%2Csku');
        expect(found.get('a-1')).toBe(7);
        expect(found.get('odd,sku')).toBe(9);
    });
});
