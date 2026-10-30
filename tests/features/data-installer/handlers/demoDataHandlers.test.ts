/**
 * The two handlers behind "check this demo's store data" and "clear it" (datapack-engine step 10),
 * driven against the sandbox fake with the real plan and clearing: the check writes nothing, and the
 * clearing refuses until it is named, confirmed and handed the list that was shown.
 */

import { type DemoDataDeps, createDemoDataHandlers } from '@/features/data-installer/handlers/demoDataHandlers';
import { installRecordPath } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { WipePreview } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import type { WipeOutcome } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { memoryFiles } from '../services/demoBuilderEngine/demoBuilderEngine.testUtils';
import { PROJECT_RECORDS, sandbox } from '../services/demoDataWipe/wipe.testUtils';

/** scratch-1028's shape: the project names JustRite's website; the test website is another. */
const PROJECT = createMockProject({
    name: 'scratch-1028',
    path: '/nonexistent/projects/scratch-1028',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'justrite', ACCS_STORE_VIEW_CODE: 'justrite_us' } },
});

function setUp(overrides: Partial<DemoDataDeps> = {}, store = sandbox()) {
    // The project's own record on disk: what it lists must be left to the pack's removal.
    const [record] = PROJECT_RECORDS;
    const files = memoryFiles({ [installRecordPath(PROJECT.path, record.pack)]: JSON.stringify(record) });
    const deps: DemoDataDeps = { commerce: async () => store, guard: async () => undefined, files, ...overrides };
    const handlers = createDemoDataHandlers(deps);
    const context = createMockHandlerContext({ stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(PROJECT) }) }) as HandlerContext;
    return { handlers, context, store };
}

describe('check-demo-data', () => {
    it('answers the list for the website named, writing nothing', async () => {
        const { handlers, context, store } = setUp();

        const res = await handlers['check-demo-data'](context, { websiteCode: 'justrite_test_website' });

        expect(res.success).toBe(true);
        expect((res.data as WipePreview).website.code).toBe('justrite_test_website');
        expect((res.data as WipePreview).total).toBe(5);
        expect(store.sent).toStrictEqual([]);
    });

    it("looks at the project's own website when none is named", async () => {
        const { handlers, context } = setUp();

        const res = await handlers['check-demo-data'](context, {});

        expect((res.data as WipePreview).website.code).toBe('justrite');
    });

    it('stops at an org mismatch before reading the store', async () => {
        const { handlers, context, store } = setUp({ guard: async () => 'Project uses a different Adobe organization.' });

        const res = await handlers['check-demo-data'](context, { websiteCode: 'justrite_test_website' });

        expect(res).toEqual({ success: false, error: 'Project uses a different Adobe organization.', code: ErrorCode.ORG_MISMATCH });
        expect(store.reads).toStrictEqual([]);
    });

    it('names a website the store does not have', async () => {
        const { handlers, context } = setUp();

        expect(await handlers['check-demo-data'](context, { websiteCode: 'nope' })).toEqual({ success: false, error: 'The store has no website nope.' });
    });
});

describe('clear-demo-data', () => {
    async function shown() {
        const made = setUp();
        const res = await made.handlers['check-demo-data'](made.context, { websiteCode: 'justrite_test_website' });
        return { ...made, token: (res.data as WipePreview).token };
    }

    it.each([
        ['no website', {}, /Name the website to clear/],
        ['no token', { websiteCode: 'justrite_test_website' }, /Check what would be removed first/],
        ['no confirm', { websiteCode: 'justrite_test_website', token: 'x' }, /website justrite_test_website .* cannot be undone/],
    ])('refuses, writing nothing, with %s', async (_label, payload, error) => {
        const { handlers, context, store } = setUp();

        const res = await handlers['clear-demo-data'](context, payload);

        expect(res.success).toBe(false);
        expect(res.error).toMatch(error);
        expect(store.sent).toStrictEqual([]);
    });

    it('refuses a token for another website, or one never shown', async () => {
        const { handlers, context, token, store } = await shown();

        expect((await handlers['clear-demo-data'](context, { websiteCode: 'justrite', token, confirm: true })).error).toBe(
            'That list is for the website justrite_test_website, not justrite.',
        );
        expect((await handlers['clear-demo-data'](context, { websiteCode: 'justrite_test_website', token: 'made-up', confirm: true })).error).toMatch(/no longer known/);
        expect(store.sent).toStrictEqual([]);
    });

    it('clears what was shown, once, and says what it did', async () => {
        const { handlers, context, token, store } = await shown();

        const res = await handlers['clear-demo-data'](context, { websiteCode: 'justrite_test_website', token, confirm: true });

        expect(res.success).toBe(true);
        expect((res.data as WipeOutcome).removed).toEqual({ customers: 1, products: 3, takenOff: 1, categories: 0 });
        expect(res.note).toMatch(/^Removed 3 products and 1 customer from justrite_test_website\./);
        expect(store.sent).toHaveLength(5);
        expect((await handlers['clear-demo-data'](context, { websiteCode: 'justrite_test_website', token, confirm: true })).error).toMatch(/no longer known/);
    });

    it('writes nothing and offers the new list when the store would now clear more', async () => {
        const { handlers, context, token, store } = await shown();
        store.data.customers.push({ id: 99, email: 'new@example.com', firstname: 'N', lastname: 'W', website_id: 5 });

        const res = await handlers['clear-demo-data'](context, { websiteCode: 'justrite_test_website', token, confirm: true });

        expect(res.success).toBe(false);
        expect(res.error).toMatch(/store changed since the list was made/);
        expect((res.data as { preview: WipePreview }).preview.remove.customers.count).toBe(2);
        expect(store.sent).toStrictEqual([]);
    });
});
