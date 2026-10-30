/**
 * Project reset's second data question (datapack-engine step 10): asked only when the demo's
 * store holds things Demo Builder did not install, naming the store, opt in, and its clearing
 * never fails the reset.
 */

import * as vscode from 'vscode';
import { installRecordPath } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    type OtherDataDeps,
    beginOtherDataCheck,
    clearProjectOtherData,
    confirmClearOtherData,
} from '@/features/eds/services/reset/edsResetOtherData';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../../helpers/projectFake';
import { memoryFiles } from '../../../data-installer/services/demoBuilderEngine/demoBuilderEngine.testUtils';
import { PROJECT_RECORDS, sandbox } from '../../../data-installer/services/demoDataWipe/wipe.testUtils';

/** A project whose own store is the test website's, so the reset's question is about it. */
const PROJECT = createMockProject({
    name: 'zz-test',
    path: '/nonexistent/projects/zz-test',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'justrite_test_website', ACCS_STORE_VIEW_CODE: 'justrite_test_view' } },
});

function setUp(store = sandbox(), overrides: Partial<OtherDataDeps> = {}) {
    const deps: OtherDataDeps = { commerce: async () => store, files: memoryFiles(), others: async () => [], ...overrides };
    const context = createMockHandlerContext() as HandlerContext;
    return { deps, context, store };
}

/** Another local project that records the same store as its own. */
const CLAIMANT = createMockProject({
    name: 'test-site-demo',
    title: 'Test Site Demo',
    path: '/nonexistent/projects/test-site-demo',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'justrite_test_website', ACCS_STORE_VIEW_CODE: 'justrite_test_view' } },
});
const CLAIMED =
    "The store justrite_test_store (website justrite_test_website) is also Test Site Demo's own store (project test-site-demo). Clear it from that project, if at all.";

const ask = vscode.window.showWarningMessage as jest.Mock;

beforeEach(() => ask.mockReset());

describe('beginOtherDataCheck', () => {
    it("lists what the project's own store holds, writing nothing", async () => {
        const { deps, context, store } = setUp();

        const plan = await beginOtherDataCheck(PROJECT, context, deps);

        expect(plan?.preview.stores.map((st) => st.storeCode)).toEqual(['justrite_test_store']);
        expect(store.sent).toStrictEqual([]);
    });

    it('answers nothing, never rejecting, when the store cannot be read', async () => {
        const { deps, context } = setUp(sandbox(), { commerce: async () => ({ refusal: 'Sign in to Adobe first.' }) });
        const failing = setUp(sandbox(), { commerce: async () => Promise.reject(new Error('down')) });

        expect(await beginOtherDataCheck(PROJECT, context, deps)).toBeUndefined();
        expect(await beginOtherDataCheck(PROJECT, failing.context, failing.deps)).toBeUndefined();
    });

    it('answers nothing, reading only the store structure, when another project records the store as its own', async () => {
        const others = jest.fn().mockResolvedValue([CLAIMANT]);
        const { deps, context, store } = setUp(sandbox(), { others });

        expect(await beginOtherDataCheck(PROJECT, context, deps)).toBeUndefined();
        expect(others).toHaveBeenCalledWith(PROJECT, context);
        expect(store.reads).toStrictEqual(['store/websites', 'store/storeGroups', 'store/storeViews']);
    });

    it("leaves what another project's install records list on the website", async () => {
        const other = createMockProject({ name: 'other', path: '/nonexistent/projects/other', componentConfigs: {} });
        const theirs = { ...PROJECT_RECORDS[0], created: [{ kind: 'products', id: 'ZZ-ONLY-HERE' }] };
        const files = memoryFiles({ [installRecordPath(other.path, theirs.pack)]: JSON.stringify(theirs) });
        const { deps, context } = setUp(sandbox(), { files, others: async () => [other] });

        const plan = await beginOtherDataCheck(PROJECT, context, deps);

        expect(plan?.preview.remove.products.count).toBe(3);
        expect(plan?.preview.installed).toEqual({ products: 1 });
    });

    it('answers nothing for a project that names no store', async () => {
        const { deps, context, store } = setUp();

        expect(await beginOtherDataCheck(createMockProject({ componentConfigs: {} }), context, deps)).toBeUndefined();
        expect(store.reads).toStrictEqual([]);
    });
});

describe('confirmClearOtherData', () => {
    it('names the store, what it holds, what is only taken off, and that it cannot be undone', async () => {
        const { deps, context } = setUp();
        const plan = await beginOtherDataCheck(PROJECT, context, deps);
        ask.mockResolvedValue({ title: 'Remove Those Too' });

        expect(await confirmClearOtherData(vscode, plan)).toBe(true);
        const [message, options, clear, keep] = ask.mock.calls[0];
        expect(message).toMatch(/^This demo's store, JustRite Test Store \(justrite_test_store, website justrite_test_website\), also holds 5 products and 2 customers Demo Builder didn't install\./);
        expect(message).toContain('1 product another website also sells will only be taken off this one.');
        expect(message).toMatch(/This can't be undone\.$/);
        expect(options).toEqual({ modal: true });
        expect([clear.title, keep]).toEqual(['Remove Those Too', { title: 'Keep Them', isCloseAffordance: true }]);
    });

    it('keeps everything on Esc', async () => {
        const { deps, context } = setUp();
        ask.mockResolvedValue(undefined);

        expect(await confirmClearOtherData(vscode, await beginOtherDataCheck(PROJECT, context, deps))).toBe(false);
    });

    it('is not asked when there is nothing to clear', async () => {
        const { deps, context } = setUp(sandbox({ products: [], customers: [] }));

        expect(await confirmClearOtherData(vscode, await beginOtherDataCheck(PROJECT, context, deps))).toBe(false);
        expect(ask).not.toHaveBeenCalled();
    });
});

describe('clearProjectOtherData', () => {
    it('clears what was shown and logs what it did', async () => {
        const { deps, context, store } = setUp();
        const plan = await beginOtherDataCheck(PROJECT, context, deps);

        const done = await clearProjectOtherData(PROJECT, context, jest.fn(), plan!, deps);

        expect(store.sent).toHaveLength(7);
        expect(done).toEqual({
            cleared: true,
            sentence: 'Removed 4 products and 2 customers from the store justrite_test_store. Took 1 product other websites also sell off the chosen websites.',
        });
    });

    it('writes nothing when another project has claimed the store since the list was shown', async () => {
        const others = jest.fn().mockResolvedValue([]);
        const { deps, context, store } = setUp(sandbox(), { others });
        const plan = await beginOtherDataCheck(PROJECT, context, deps);
        others.mockResolvedValue([CLAIMANT]);

        const done = await clearProjectOtherData(PROJECT, context, jest.fn(), plan!, deps);

        expect(others).toHaveBeenLastCalledWith(PROJECT, context);
        expect(store.sent).toStrictEqual([]);
        expect(done).toEqual({ cleared: false, sentence: `The store was not cleared: ${CLAIMED}` });
    });

    it('never throws, and writes nothing, when the store would now clear more than was shown', async () => {
        const { deps, context, store } = setUp();
        const plan = await beginOtherDataCheck(PROJECT, context, deps);
        store.data.customers.push({ id: 99, email: 'new@example.com', firstname: 'N', lastname: 'W', website_id: 5 });

        const done = await clearProjectOtherData(PROJECT, context, jest.fn(), plan!, deps);

        expect(store.sent).toStrictEqual([]);
        expect(done.cleared).toBe(false);
        expect(done.sentence).toMatch(/reset stands: The store changed since the list was made/);
    });
});
