/**
 * Project reset's second data question (datapack-engine step 10): asked only when the demo's
 * website holds things Demo Builder did not install, naming the website, opt in, and its clearing
 * never fails the reset.
 */

import * as vscode from 'vscode';
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
import { sandbox } from '../../../data-installer/services/demoDataWipe/wipe.testUtils';

/** A project whose own website is the test website, so the reset's question is about it. */
const PROJECT = createMockProject({
    name: 'zz-test',
    path: '/nonexistent/projects/zz-test',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'justrite_test_website', ACCS_STORE_VIEW_CODE: 'justrite_test_view' } },
});

function setUp(store = sandbox(), overrides: Partial<OtherDataDeps> = {}) {
    const deps: OtherDataDeps = { commerce: async () => store, files: memoryFiles(), ...overrides };
    const context = createMockHandlerContext() as HandlerContext;
    return { deps, context, store };
}

const ask = vscode.window.showWarningMessage as jest.Mock;

beforeEach(() => ask.mockReset());

describe('beginOtherDataCheck', () => {
    it("lists what the project's website holds, writing nothing", async () => {
        const { deps, context, store } = setUp();

        const plan = await beginOtherDataCheck(PROJECT, context, deps);

        expect(plan?.preview.website.code).toBe('justrite_test_website');
        expect(store.sent).toStrictEqual([]);
    });

    it('answers nothing, never rejecting, when the store cannot be read', async () => {
        const { deps, context } = setUp(sandbox(), { commerce: async () => ({ refusal: 'Sign in to Adobe first.' }) });
        const failing = setUp(sandbox(), { commerce: async () => Promise.reject(new Error('down')) });

        expect(await beginOtherDataCheck(PROJECT, context, deps)).toBeUndefined();
        expect(await beginOtherDataCheck(PROJECT, failing.context, failing.deps)).toBeUndefined();
    });

    it('answers nothing for a project that names no website', async () => {
        const { deps, context, store } = setUp();

        expect(await beginOtherDataCheck(createMockProject({ componentConfigs: {} }), context, deps)).toBeUndefined();
        expect(store.reads).toStrictEqual([]);
    });
});

describe('confirmClearOtherData', () => {
    it('names the website, what it holds, what is only taken off, and that it cannot be undone', async () => {
        const { deps, context } = setUp();
        const plan = await beginOtherDataCheck(PROJECT, context, deps);
        ask.mockResolvedValue({ title: 'Remove Those Too' });

        expect(await confirmClearOtherData(vscode, plan)).toBe(true);
        const [message, options, clear, keep] = ask.mock.calls[0];
        expect(message).toMatch(/^This demo's store, the website JustRite Test \(justrite_test_website\), also holds 5 products and 2 customers Demo Builder didn't install\./);
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
            sentence: 'Removed 4 products and 2 customers from justrite_test_website. Took 1 product another website also sells off justrite_test_website.',
        });
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
