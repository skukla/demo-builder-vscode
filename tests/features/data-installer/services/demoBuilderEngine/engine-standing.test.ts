/**
 * Where a job stands beyond each kind's state, for the import window's rows (owner, 2026-11-07):
 * the kind it stopped on and whether a retry could get past it (Retry, else Fix with AI), a refused
 * row on its kind's row, and what the engine is doing while no one kind is.
 */

import { demoBuilderEngine } from '@/features/data-installer/services/demoBuilderEngine/engine';
import { checkAfterInstall } from '@/features/data-installer/services/demoBuilderEngine/verifyInstall';
import type { JobStatusSnapshot } from '@/features/data-installer/types';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { PACK, PROJECT, fakeContext, memoryFiles, noneUnder } from './demoBuilderEngine.testUtils';

jest.mock('@/features/data-installer/services/demoBuilderEngine/verifyInstall', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/verifyInstall'),
    checkAfterInstall: jest.fn(),
}));

const STORE = {
    'store/websites': [{ id: 1, code: 'base', name: 'Main Website', default_group_id: 1 }],
    'store/storeGroups': [{ id: 1, root_category_id: 2 }],
    'store/storeViews': [{ id: 1, code: 'default', website_id: 1, store_group_id: 1 }],
};
const SETS_PAGE =
    'products/attribute-sets/sets/list?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100';
const ITEMS = {
    attribute_sets: [],
    categories: { categories: [{ category: { name: 'Sale', path: 'Default Category' } }] },
};
const SALE = {
    id: 40,
    name: 'Sale',
    path: '1/2/40',
    is_active: true,
    children: '',
    custom_attributes: [],
};

/**
 * Install ITEMS with Commerce answering a category write with `send`, and wait for the job to end.
 * `checkFails` makes the final check throw, after every kind's rows are in.
 */
async function installWith(
    send: () => unknown,
    checkFails?: Error
): Promise<{ status: JobStatusSnapshot; during: JobStatusSnapshot[] }> {
    const ctx = await fakeContext(
        {
            ...STORE,
            [SETS_PAGE]: { items: [], total_count: 0 },
            ...noneUnder(2, { Sale: 'sale' }),
            'categories/40': SALE,
        },
        send
    );
    const engine = demoBuilderEngine({
        commerce: async () => ({ get: ctx.get, send: ctx.send }),
        readPack: async () => ITEMS,
        projectPath: PROJECT,
        log: () => undefined,
        files: memoryFiles(),
        now: () => new Date('2026-11-07T18:00:00.000Z'),
    });
    const during: JobStatusSnapshot[] = [];
    let activationId = '';
    jest.mocked(checkAfterInstall).mockImplementation(async () => {
        during.push(await engine.getJobStatus(activationId));
        if (checkFails) throw checkFails;
        return {};
    });
    ({ activationId } = await engine.startImport({
        id: PACK,
        commerceInstance: 'ignored by this engine',
        dataTypes: ['attribute_sets', 'categories'],
        target: { websiteCode: 'base', storeCode: 'default' },
    }));
    let status = await engine.getJobStatus(activationId);
    for (let i = 0; i < 100 && status.processingTimeMs === undefined; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        status = await engine.getJobStatus(activationId);
    }
    return { status, during };
}

describe('a job that stopped', () => {
    it('names the kind it stopped on, and says a retry can get past Commerce failing', async () => {
        const { status } = await installWith(() => {
            throw new CommerceReadError('Commerce answered 503 for categories: down', 503);
        });

        expect(status.perType).toEqual({ attribute_sets: 'success', categories: 'error' });
        expect(status).toMatchObject({ stoppedAt: 'categories', retryable: true });
    });

    it('CONTROL: says no retry gets past Commerce refusing who we are', async () => {
        const { status } = await installWith(() => {
            throw new CommerceReadError('Commerce answered 403 for categories: no', 403);
        });

        expect(status.stoppedAt).toBe('categories');
        expect(status.retryable).toBeUndefined();
    });
});

describe('a job that stopped after every kind was in', () => {
    it('marks every kind done and names the finishing work as where it stopped', async () => {
        const { status } = await installWith(
            () => ({ id: 40 }),
            new CommerceReadError('Commerce answered 503 for products: down', 503)
        );

        expect(status.perType).toEqual({ attribute_sets: 'success', categories: 'success' });
        expect(status).toMatchObject({ stoppedAt: 'finishing', retryable: true });
        expect(status.phase).toBeUndefined();
    });

    it('CONTROL: the last kind is still in progress while the check runs, so the watch waits for it', async () => {
        const { during } = await installWith(
            () => ({ id: 40 }),
            new CommerceReadError('Commerce answered 503 for products: down', 503)
        );

        expect(during.map((s) => s.perType.categories)).toEqual(['processing']);
    });
});

describe('a job that ran to the end', () => {
    it('puts a row the store refused on its kind’s row, and does not stop', async () => {
        const { status } = await installWith(() => {
            throw new CommerceReadError(
                'Commerce answered 422 for categories: {"message":"URL key in use"}',
                422
            );
        });

        expect(status.perType).toEqual({ attribute_sets: 'success', categories: 'success' });
        expect(status.rowNotes).toEqual({ categories: 'Commerce refused 1.' });
        expect(status.stoppedAt).toBeUndefined();
    });

    it('says it is checking the products while the check runs, and nothing once it ends', async () => {
        const { status, during } = await installWith(() => ({ id: 40 }));

        expect(during.map((s) => s.phase)).toEqual(['Checking the products against the datapack']);
        expect(status.phase).toBeUndefined();
        expect(status.rowNotes).toBeUndefined();
    });

    it('CONTROL: a pack with no products says nothing about search', async () => {
        const { status } = await installWith(() => ({ id: 40 }));

        expect(status.searchDelay).toBeUndefined();
    });
});
