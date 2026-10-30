/**
 * The two handlers behind "check this demo's store data" and "clear it" (datapack-engine step 10),
 * driven against the sandbox fake with the real plan and clearing: the check writes nothing and
 * answers the stores to choose from, and the clearing refuses until it is named, confirmed and
 * handed the list that was shown.
 */

import { type DemoDataDeps, createDemoDataHandlers } from '@/features/data-installer/handlers/demoDataHandlers';
import { installRecordPath } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { WipeOutcome } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import type { DemoDataCheck } from '@/types/demoDataWipe';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { memoryFiles } from '../services/demoBuilderEngine/demoBuilderEngine.testUtils';
import { PROJECT_RECORDS, sandbox } from '../services/demoDataWipe/wipe.testUtils';
import { fakeErp } from '../services/demoDataWipe/wipeErp.testUtils';
import { RESET_RULE_CASES } from '../../../helpers/resetRuleOrders';

/** scratch-1028's shape: the project names JustRite's website and view; the test website is another. */
const PROJECT = createMockProject({
    name: 'scratch-1028',
    path: '/nonexistent/projects/scratch-1028',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'justrite', ACCS_STORE_VIEW_CODE: 'justrite_us' } },
});
const TEST_STORE = [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }];

function setUp(overrides: Partial<DemoDataDeps> = {}, store = sandbox()) {
    // The project's own record on disk: what it lists must be left to the pack's removal.
    const [record] = PROJECT_RECORDS;
    const files = memoryFiles({ [installRecordPath(PROJECT.path, record.pack)]: JSON.stringify(record) });
    const deps: DemoDataDeps = { commerce: async () => store, guard: async () => undefined, files, others: async () => [], erp: () => undefined, ...overrides };
    const handlers = createDemoDataHandlers(deps);
    const context = createMockHandlerContext({ stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(PROJECT) }) }) as HandlerContext;
    return { handlers, context, store, files };
}

/** JustRite's own project, which records the store `justrite_store` (through its view) as its own. */
const JUSTRITE = createMockProject({
    name: 'JustRite',
    path: '/nonexistent/projects/JustRite',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'justrite', ACCS_STORE_VIEW_CODE: 'justrite_us' } },
});
/** JustRite's project elsewhere on the machine, recording no store a test chooses. */
const JUSTRITE_ELSEWHERE = createMockProject({ name: 'justrite', path: '/nonexistent/projects/justrite', componentConfigs: {} });
const CLAIMED = "The store justrite_store (website justrite) is also JustRite's own store (project JustRite). Clear it from that project, if at all.";

const checked = (data: unknown) => data as DemoDataCheck;

describe('check-demo-data', () => {
    it('answers the list for the stores named, with every store to choose from, writing nothing', async () => {
        const { handlers, context, store } = setUp();

        const res = await handlers['check-demo-data'](context, { stores: TEST_STORE });

        expect(res.success).toBe(true);
        const { preview, choices } = checked(res.data);
        expect(preview?.stores.map((s) => s.storeCode)).toEqual(['justrite_test_store']);
        expect(preview?.total).toBe(5);
        expect(choices.find((w) => w.code === 'justrite_test_website')?.stores).toEqual([
            { code: 'justrite_test_store', name: 'JustRite Test Store', views: ['JustRite Test View'], ticked: true },
        ]);
        expect(store.sent).toStrictEqual([]);
    });

    it("looks at the project's own store when none is named", async () => {
        const { handlers, context } = setUp();

        const res = await handlers['check-demo-data'](context, {});

        expect(checked(res.data).preview?.stores).toEqual([{ websiteCode: 'justrite', websiteName: 'JustRite', storeCode: 'justrite_store', storeName: 'JustRite Store' }]);
    });

    it('answers the choices alone, reading nothing but the structure, when no stores are chosen', async () => {
        const { handlers, context, store } = setUp();

        const res = await handlers['check-demo-data'](context, { stores: [] });

        expect(checked(res.data)).toEqual({ choices: expect.any(Array) });
        expect(store.reads).toStrictEqual(['store/websites', 'store/storeGroups', 'store/storeViews']);
    });

    it('stops at an org mismatch before reading the store', async () => {
        const { handlers, context, store } = setUp({ guard: async () => 'Project uses a different Adobe organization.' });

        const res = await handlers['check-demo-data'](context, { stores: TEST_STORE });

        expect(res).toEqual({ success: false, error: 'Project uses a different Adobe organization.', code: ErrorCode.ORG_MISMATCH });
        expect(store.reads).toStrictEqual([]);
    });

    it('answers, as a normal answer, that another project records the store as its own, and locks it in the choices', async () => {
        const others = jest.fn().mockResolvedValue([JUSTRITE]);
        const { handlers, context, store } = setUp({ others });

        const res = await handlers['check-demo-data'](context, {});

        const { refused, preview, choices } = checked(res.data);
        expect(refused).toBe(CLAIMED);
        expect(preview).toBeUndefined();
        expect(choices.find((w) => w.code === 'justrite')?.stores[0]).toMatchObject({ code: 'justrite_store', ticked: true, claimedBy: CLAIMED });
        expect(others).toHaveBeenCalledWith(context, PROJECT);
        expect(store.reads).toStrictEqual(['store/websites', 'store/storeGroups', 'store/storeViews']);
    });

    it("leaves what another project's install records list on the chosen websites", async () => {
        const other = createMockProject({ name: 'bodea-demo', path: '/nonexistent/projects/bodea-demo', componentConfigs: {} });
        const theirs = { ...PROJECT_RECORDS[0], pack: { name: 'theirs', version: '1' }, created: [{ kind: 'products', id: 'ZZ-ONLY-HERE' }] };
        const { handlers, context, files } = setUp({ others: async () => [other] });
        files.data.set(installRecordPath(other.path, theirs.pack), JSON.stringify(theirs));

        const { preview } = checked((await handlers['check-demo-data'](context, { stores: TEST_STORE })).data);

        expect(preview?.total).toBe(4);
        expect(preview?.installed).toEqual({ products: 2, customers: 1, categories: 1 });
    });

    it("never offers Commerce's own Admin website, nor takes it", async () => {
        const { handlers, context } = setUp();

        const { choices } = checked((await handlers['check-demo-data'](context, { stores: [] })).data);

        expect(choices.map((w) => w.code)).toEqual(['base', 'justrite', 'bodea', 'justrite_test_website']);
        expect(await handlers['check-demo-data'](context, { stores: [{ websiteCode: 'admin' }] })).toEqual({ success: false, error: 'The store has no website admin.' });
    });

    it('asks the ERP integration serving the instance, found among every local project, which chosen websites it routes', async () => {
        const { erp, client } = fakeErp();
        const find = jest.fn().mockReturnValue(erp);
        const store = sandbox({ orders: [RESET_RULE_CASES[0].order] });
        const { handlers, context } = setUp({ erp: find, others: async () => [JUSTRITE_ELSEWHERE] }, store);

        const { preview } = checked((await handlers['check-demo-data'](context, { stores: TEST_STORE })).data);

        expect(find).toHaveBeenCalledWith(context, PROJECT, [JUSTRITE_ELSEWHERE]);
        expect(client.resolvedSettings).toHaveBeenCalledWith(['justrite_test_website']);
        expect(preview?.erp?.line).toBe('1 order is handled by the ERP integration (JustRite): it will be closed there, removed from its ERP, and the ERP refreshed.');
        expect(preview?.orders.cancel.count).toBe(0);
    });

    it('names a website the store does not have', async () => {
        const { handlers, context } = setUp();

        expect(await handlers['check-demo-data'](context, { stores: [{ websiteCode: 'nope' }] })).toEqual({ success: false, error: 'The store has no website nope.' });
    });
});

describe('clear-demo-data', () => {
    async function shown(made = setUp()) {
        const res = await made.handlers['check-demo-data'](made.context, { stores: TEST_STORE });
        return { ...made, token: checked(res.data).preview?.token ?? '' };
    }

    it.each([
        ['no stores', {}, /Name the stores to clear/],
        ['no token', { stores: TEST_STORE }, /Check what would be removed first/],
        ['no confirm', { stores: TEST_STORE, token: 'x' }, /stores justrite_test_store \(justrite_test_website\) .*cancels or refunds their orders.* cannot be undone/],
    ])('refuses, writing nothing, with %s', async (_label, payload, error) => {
        const { handlers, context, store } = setUp();

        const res = await handlers['clear-demo-data'](context, payload);

        expect(res.success).toBe(false);
        expect(res.error).toMatch(error);
        expect(store.sent).toStrictEqual([]);
    });

    it('refuses a token for other stores, or one never shown', async () => {
        const { handlers, context, token, store } = await shown();

        expect((await handlers['clear-demo-data'](context, { stores: [{ websiteCode: 'justrite' }], token, confirm: true })).error).toBe(
            'That list is for the store justrite_test_store, not the stores named.',
        );
        expect((await handlers['clear-demo-data'](context, { stores: TEST_STORE, token: 'made-up', confirm: true })).error).toMatch(/no longer known/);
        expect(store.sent).toStrictEqual([]);
    });

    it('takes the website named alone as all its stores, the same list', async () => {
        const { handlers, context, token } = await shown();

        const res = await handlers['clear-demo-data'](context, { stores: [{ websiteCode: 'justrite_test_website' }], token, confirm: true });

        expect(res.success).toBe(true);
    });

    it('clears what was shown, once, and says what it did', async () => {
        const { handlers, context, token, store } = await shown();

        const res = await handlers['clear-demo-data'](context, { stores: TEST_STORE, token, confirm: true });

        expect(res.success).toBe(true);
        expect((res.data as WipeOutcome).removed).toEqual({ customers: 1, products: 3, takenOff: 1, categories: 0 });
        expect(res.note).toMatch(/^Removed 3 products and 1 customer from the store justrite_test_store\./);
        expect(store.sent).toHaveLength(5);
        expect((await handlers['clear-demo-data'](context, { stores: TEST_STORE, token, confirm: true })).error).toMatch(/no longer known/);
    });

    it("tells the screen's progress window each stage, and ends it on the one sentence", async () => {
        const { handlers, context, token } = await shown();

        await handlers['clear-demo-data'](context, { stores: TEST_STORE, token, confirm: true, progress: 'modal' });

        const pushed = (context.sendMessage as jest.Mock).mock.calls.filter(([type]) => type === 'operationProgress').map(([, payload]) => payload);
        expect(pushed).toContainEqual(expect.objectContaining({ id: 'demo-data-clear', state: 'running', stage: 'Removing customers' }));
        expect(pushed).toContainEqual(expect.objectContaining({ id: 'demo-data-clear', state: 'succeeded', note: expect.stringMatching(/^Removed 3 products/) }));
    });

    it('refuses, writing nothing, once another project records the store as its own', async () => {
        const others = jest.fn().mockResolvedValue([]);
        const { handlers, context, store } = setUp({ others });
        const res = await handlers['check-demo-data'](context, {});
        others.mockResolvedValue([JUSTRITE]);

        const cleared = await handlers['clear-demo-data'](context, { stores: [{ websiteCode: 'justrite', storeCode: 'justrite_store' }], token: checked(res.data).preview?.token, confirm: true });

        expect(cleared).toEqual({ success: false, error: CLAIMED, code: ErrorCode.INVALID_OPERATION });
        expect(others).toHaveBeenLastCalledWith(context, PROJECT);
        expect(store.sent).toStrictEqual([]);
    });

    it('has the ERP integration close its stores and refreshes its ERP, in the one clearing', async () => {
        const { erp, client, refill } = fakeErp();
        const store = sandbox({ orders: [RESET_RULE_CASES[0].order] });
        const { handlers, context, token } = await shown(setUp({ erp: () => erp }, store));

        const res = await handlers['clear-demo-data'](context, { stores: TEST_STORE, token, confirm: true });

        expect(res.success).toBe(true);
        expect(client.closeOrders).toHaveBeenCalledWith(['justrite_test_store'], expect.any(Function));
        expect(refill).toHaveBeenCalledTimes(1);
        expect(res.note).toContain("closed through the ERP integration (JustRite), and removed from Justrite ERP. JustRite's ERP was refreshed from Commerce.");
    });

    it('writes nothing and offers the new list when the store would now clear more', async () => {
        const { handlers, context, token, store } = await shown();
        store.data.customers.push({ id: 99, email: 'new@example.com', firstname: 'N', lastname: 'W', website_id: 5 });

        const res = await handlers['clear-demo-data'](context, { stores: TEST_STORE, token, confirm: true });

        expect(res.success).toBe(false);
        expect(res.error).toMatch(/store changed since the list was made/);
        expect((res.data as { preview: { remove: { customers: { count: number } } } }).preview.remove.customers.count).toBe(2);
        expect(store.sent).toStrictEqual([]);
    });
});
