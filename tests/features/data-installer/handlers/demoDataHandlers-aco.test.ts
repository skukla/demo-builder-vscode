/**
 * Clear demo data, ACO half (PL-60, owner 2026-10-31: needed): `check-demo-data` and
 * `clear-demo-data` with `aco: true`, through the real routing. The safety rules are the stores'
 * own: the clear deletes only the plan the check showed, by its token, and only confirmed; a plan
 * is used once; nothing an installed pack holds is planned (this project's or another local one's).
 */

import { type DemoDataDeps, createDemoDataHandlers } from '@/features/data-installer/handlers/demoDataHandlers';
import type { AcoAccess } from '@/features/data-installer/services/aco/acoJobs';
import type { AcoSearch } from '@/features/data-installer/services/aco/acoWipe';
import { type InstallRecord, installRecordPath } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { AcoClearCheck } from '@/types/demoDataWipe';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { memoryFiles } from '../services/demoBuilderEngine/demoBuilderEngine.testUtils';
import { ACO_INSTANCE, ACO_SETTINGS, fakeAco } from '../services/aco/acoFakes.testUtils';

const PROJECT = createMockProject({ name: 'citisignal-aco', path: '/nonexistent/projects/citisignal-aco' });
const OTHER = createMockProject({ name: 'citisignal-two', path: '/nonexistent/projects/citisignal-two' });

/** An ACO pack's record on the project's instance, holding these SKUs. */
function packRecord(name: string, skus: string[]): InstallRecord {
    return {
        format: 1,
        pack: { name, version: 'v1' },
        engine: 'demo-builder',
        startedAt: '2026-10-31T10:00:00.000Z',
        aco: ACO_INSTANCE,
        created: skus.map((sku) => ({ kind: 'aco_products', id: JSON.stringify({ sku, source: { locale: 'en-US' } }), key: sku })),
    };
}

function setUp(shown: { skus: string[]; slugs?: string[] }, overrides: Partial<DemoDataDeps> = {}) {
    const own = packRecord('aco_citisignal_new', ['PACK-OWN']);
    const theirs = packRecord('aco_citisignal_original', ['PACK-THEIRS']);
    const files = memoryFiles({
        [installRecordPath(PROJECT.path, own.pack)]: JSON.stringify(own),
        [installRecordPath(OTHER.path, theirs.pack)]: JSON.stringify(theirs),
    });
    const aco = fakeAco();
    const search: AcoSearch = { productSkus: async () => shown.skus, categorySlugs: async () => shown.slugs ?? [] };
    const access: AcoAccess = { settings: ACO_SETTINGS, clientFor: () => aco };
    const deps: DemoDataDeps = {
        commerce: async () => ({ refusal: 'the Commerce path is not used here' }),
        guard: async () => undefined,
        files,
        others: async () => [OTHER],
        erp: () => undefined,
        // The website path's deps: the ACO path never reaches them.
        openAdmin: async () => ({ outcome: 'opened' }),
        remove: async () => {
            throw new Error('the website path is not used here');
        },
        changes: async () => undefined,
        ownNames: async () => [],
        aco: async () => access,
        acoSearch: () => search,
        ...overrides,
    };
    const handlers = createDemoDataHandlers(deps);
    const context = createMockHandlerContext({ stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(PROJECT) }) }) as HandlerContext;
    return { handlers, context, aco };
}

const preview = (data: unknown) => (data as AcoClearCheck).aco;

describe('check-demo-data with aco', () => {
    it('names what the view shows less every local project\'s pack keys, writing nothing', async () => {
        const { handlers, context, aco } = setUp({ skus: ['S1', 'PACK-OWN', 'PACK-THEIRS'], slugs: ['phones'] });

        const res = await handlers['check-demo-data'](context, { aco: true });

        expect(res.success).toBe(true);
        expect(preview(res.data)).toMatchObject({ products: { count: 1, names: ['S1'] }, categories: { count: 1 }, installed: 2, total: 2 });
        expect(aco.calls).toStrictEqual([]);
    });

    it("says why there is nothing to check when the project's ACO cannot be reached", async () => {
        const { handlers, context } = setUp({ skus: [] }, { aco: async () => ({ refusal: 'Turn ACO on for the project first.' }) });

        await expect(handlers['check-demo-data'](context, { aco: true })).resolves.toMatchObject({ success: false, error: 'Turn ACO on for the project first.' });
    });

    it("refuses to list anything when Adobe's connector owns the catalog, since its next sync would undo a clear", async () => {
        const { handlers, context } = setUp(
            { skus: ['S1'] },
            { aco: async () => ({ settings: ACO_SETTINGS, clientFor: () => fakeAco(), connector: async () => 'on' }) },
        );
        const res = await handlers['check-demo-data'](context, { aco: true });
        expect(res).toMatchObject({ success: false, error: expect.stringMatching(/connector feeds this ACO instance/u) });
    });
});

describe('clear-demo-data with aco', () => {
    async function checked(shown = { skus: ['S1', 'S2'], slugs: ['phones'] }) {
        const ctx = setUp(shown);
        const res = await ctx.handlers['check-demo-data'](ctx.context, { aco: true });
        return { ...ctx, token: preview(res.data)?.token ?? '' };
    }

    it('deletes exactly the plan shown, confirmed, and says what it removed', async () => {
        const { handlers, context, aco, token } = await checked();

        const res = await handlers['clear-demo-data'](context, { aco: true, token, confirm: true });

        expect(res).toMatchObject({ success: true, note: 'Removed 2 products and 1 category from the ACO catalog.' });
        expect(aco.calls.map((c) => c.path)).toStrictEqual([
            '/v1/catalog/products/delete',
            '/v1/catalog/categories/delete',
        ]);
        expect(aco.calls[0].rows).toStrictEqual([
            { sku: 'S1', source: { locale: 'en-US' } },
            { sku: 'S2', source: { locale: 'en-US' } },
        ]);
    });

    it('refuses without confirm, deleting nothing', async () => {
        const { handlers, context, aco, token } = await checked();

        const res = await handlers['clear-demo-data'](context, { aco: true, token });

        expect(res).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(res.error).toMatch(/cannot be undone/i);
        expect(aco.calls).toStrictEqual([]);
    });

    it('refuses a token it never showed, and a token already used', async () => {
        const { handlers, context, aco, token } = await checked();

        await expect(handlers['clear-demo-data'](context, { aco: true, token: 'made-up', confirm: true })).resolves.toMatchObject({ success: false });
        await handlers['clear-demo-data'](context, { aco: true, token, confirm: true });
        const calls = aco.calls.length;
        await expect(handlers['clear-demo-data'](context, { aco: true, token, confirm: true })).resolves.toMatchObject({ success: false });
        expect(aco.calls).toHaveLength(calls);
    });

    it("keeps the two lists apart: the websites' clear does not know an ACO token, and the ACO clear takes it", async () => {
        const { handlers, context, token } = await checked();

        // Control: without `aco`, the same token reaches the websites' clear, which never showed it.
        const commerce = await handlers['clear-demo-data'](context, { token, confirm: true });
        expect(commerce).toMatchObject({ success: false, error: expect.stringMatching(/no longer known here/) });

        await expect(handlers['clear-demo-data'](context, { aco: true, token, confirm: true })).resolves.toMatchObject({ success: true });
    });
});
