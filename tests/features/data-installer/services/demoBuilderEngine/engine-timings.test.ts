/**
 * Each kind's seconds are that kind's alone. On 2026-11-06 a Luma reinstall said coupons took
 * 20.1 s: the last kind's clock ran on through the settings layer and the install check, which
 * took 16 s of it, and later 39.2 s, reading back what the install made. Each is made to take a
 * minute here, and the last kind must show neither.
 */

import { demoBuilderEngine } from '@/features/data-installer/services/demoBuilderEngine/engine';
import { checkAfterInstall } from '@/features/data-installer/services/demoBuilderEngine/verifyInstall';
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
const SETS_PAGE = 'products/attribute-sets/sets/list?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100';
const ITEMS = { attribute_sets: [], categories: { categories: [{ category: { name: 'Sale', path: 'Default Category' } }] } };
const A_MINUTE = 60_000;

describe('the seconds each kind took', () => {
    let clock = 1_000_000;

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockImplementation(() => clock);
        jest.mocked(checkAfterInstall).mockImplementation(async () => ((clock += A_MINUTE), {}));
    });

    afterEach(() => jest.restoreAllMocks());

    it('leave out the reading back and the install check that run after the last kind', async () => {
        // Reading the category back to record it, once every kind is in, takes a minute too (on Luma,
        // reading back 2,046 products took 26 s and was charged to coupons).
        const readBack = () => ((clock += A_MINUTE), { id: 40, name: 'Sale', path: '1/2/40', is_active: true, children: '', custom_attributes: [] });
        const ctx = await fakeContext(
            { ...STORE, [SETS_PAGE]: { items: [], total_count: 0 }, ...noneUnder(2, { Sale: 'sale' }), 'categories/40': readBack },
            () => ({ id: 40 }),
        );
        const engine = demoBuilderEngine({
            commerce: async () => ({ get: ctx.get, send: ctx.send }),
            readPack: async () => ITEMS,
            projectPath: PROJECT,
            log: () => undefined,
            files: memoryFiles(),
            now: () => new Date('2026-11-06T18:00:00.000Z'),
        });

        const { activationId } = await engine.startImport({
            id: PACK,
            commerceInstance: 'ignored by this engine',
            dataTypes: ['attribute_sets', 'categories'],
            target: { websiteCode: 'base', storeCode: 'default' },
        });
        let status = await engine.getJobStatus(activationId);
        for (let i = 0; i < 100 && status.processingTimeMs === undefined; i += 1) {
            await new Promise((resolve) => setImmediate(resolve));
            status = await engine.getJobStatus(activationId);
        }

        // The control: the check and the read-back both ran, and the job's whole time holds their minutes.
        expect(checkAfterInstall).toHaveBeenCalledTimes(1);
        expect(status.processingTimeMs).toBeGreaterThanOrEqual(2 * A_MINUTE);
        expect(status.perType).toEqual({ attribute_sets: 'success', categories: 'success' });
        expect(status.timings).toEqual({ attribute_sets: 0, categories: 0 });
    });
});
