/**
 * Website settings a wipe puts back: on wholly chosen websites only, a value that differs from the
 * Default scope's is set to it. Commerce cannot make a value inherited again, so nothing here claims
 * that. Commerce's answers are the live page's shape (`SYSTEM_CONFIG_PAGE_TEST_WEBSITE`).
 */

import { planWipeFor } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { decideSettings, putBackSettings } from '@/features/data-installer/services/demoDataWipe/wipeSettings';
import { resolveWipeScope } from '@/features/data-installer/services/demoDataWipe/wipeScope';
import { readWipeStructure } from '@/features/data-installer/services/demoDataWipe/wipeReads';
import { SYSTEM_CONFIG_PAGE_TEST_WEBSITE, settingsInstance } from '../../../../helpers/commerceWipeInstanceFixtures';
import { REFUSED_SETTING, sandbox } from './wipe.testUtils';

const TEST = 'justrite_test_website';
const TEST_STORE = [{ websiteCode: TEST, storeCode: 'justrite_test_store' }];
const NOTHING = { customers: [], products: [], orders: [] };

describe('decideSettings, through the plan', () => {
    it('sets back only a value that differs from the default, and says it, by path', async () => {
        const store = sandbox({ ...NOTHING, instance: settingsInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.settings).toEqual([
            { websiteCode: TEST, path: 'sales/totals_sort/tax', value: '40' },
            { websiteCode: TEST, path: 'payment/companycredit/active', value: '0' },
        ]);
        expect(plan.preview.settings).toEqual({ count: 2, names: ['sales/totals_sort/tax', 'payment/companycredit/active'] });
        expect(store.sent).toStrictEqual([]);
    });

    it('reads the default and the website in pages, by the scope and code', async () => {
        const store = sandbox({ ...NOTHING, instance: settingsInstance() });

        await planWipeFor(store.get, TEST_STORE, { records: [] });

        const reads = store.reads.filter((path) => path.startsWith('system/config?'));
        expect(reads).toEqual([
            'system/config?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100&scope=default',
            `system/config?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100&scope=website&scopeCode=${TEST}`,
        ]);
    });

    it('never changes a base URL or a credential, says so, and never copies a masked value', async () => {
        const plan = await planWipeFor(sandbox({ ...NOTHING, instance: settingsInstance() }).get, TEST_STORE, { records: [] });

        expect(plan.settings.map((s) => s.path)).not.toContain('web/secure/base_url');
        expect(plan.settings.map((s) => s.path)).not.toContain('carriers/ups/password');
        expect(plan.preview.left).toContainEqual({ kind: 'settings', count: 1, names: ['web/secure/base_url'], why: 'base URLs, cookies, Admin settings and credentials are never changed' });
    });

    it('never copies a value that reads as masked or encrypted under an ordinary path', async () => {
        const instance = settingsInstance();
        const rows = instance.settings?.websites[TEST] ?? [];
        rows.push({ path: 'carriers/fedex/account', value: '0:3:abc', scope: 'website', scope_code: TEST });
        instance.settings?.default.push({ path: 'carriers/fedex/account', value: '1:3:def', scope: 'default' });

        const plan = await planWipeFor(sandbox({ ...NOTHING, instance }).get, TEST_STORE, { records: [] });

        expect(plan.settings.map((s) => s.path)).not.toContain('carriers/fedex/account');
    });

    it('leaves a setting with no default value, and does not guess one', async () => {
        const plan = await planWipeFor(sandbox({ ...NOTHING, instance: settingsInstance() }).get, TEST_STORE, { records: [] });

        expect(plan.settings.map((s) => s.path)).not.toContain('general/store_information/name');
        expect(plan.preview.left).toContainEqual({ kind: 'settings', count: 1, names: ['general/store_information/name'], why: 'they have no default value to go back to' });
    });

    describe('a list setting, which answers as an array', () => {
        const REASONS = ['Changed my mind', 'Ordered by mistake'];
        const withList = (websiteValue: string | string[]) => {
            const instance = settingsInstance();
            instance.settings?.default.push({ path: 'sales/cancellation/reasons', value: REASONS, scope: 'default' });
            instance.settings?.websites[TEST].push({ path: 'sales/cancellation/reasons', value: websiteValue, scope: 'website', scope_code: TEST });
            return instance;
        };
        const LIST_WHY = 'Commerce cannot write a list back, so set them to Use Default Value in the Admin';

        it('needs nothing when its contents match the default, though each read is a new array', async () => {
            const plan = await planWipeFor(sandbox({ ...NOTHING, instance: withList([...REASONS]) }).get, TEST_STORE, { records: [] });

            expect(plan.settings.map((s) => s.path)).not.toContain('sales/cancellation/reasons');
            expect(plan.preview.left).not.toContainEqual(expect.objectContaining({ why: LIST_WHY }));
        });

        it('needs nothing when an earlier write joined it into the same text', async () => {
            const plan = await planWipeFor(sandbox({ ...NOTHING, instance: withList(REASONS.join(',')) }).get, TEST_STORE, { records: [] });

            expect(plan.settings.map((s) => s.path)).not.toContain('sales/cancellation/reasons');
            expect(plan.preview.left).not.toContainEqual(expect.objectContaining({ why: LIST_WHY }));
        });

        it.each<[string, string | string[]]>([
            ['an array', ['Changed my mind']],
            ['a string', 'Changed my mind'],
        ])('never writes one that differs, as %s, and says why it stays', async (_form, websiteValue) => {
            const plan = await planWipeFor(sandbox({ ...NOTHING, instance: withList(websiteValue) }).get, TEST_STORE, { records: [] });

            expect(plan.settings.map((s) => s.path)).not.toContain('sales/cancellation/reasons');
            expect(plan.preview.left).toContainEqual({ kind: 'settings', count: 1, names: ['sales/cancellation/reasons'], why: LIST_WHY });
        });
    });

    it('leaves a setting a datapack or the setup guide wrote, for its undo', async () => {
        const settingsKept = new Set([`${TEST}/payment/companycredit/active`]);

        const plan = await planWipeFor(sandbox({ ...NOTHING, instance: settingsInstance() }).get, TEST_STORE, { records: [], settingsKept });

        expect(plan.settings.map((s) => s.path)).toEqual(['sales/totals_sort/tax']);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'settings', names: ['payment/companycredit/active'], why: 'a datapack or the setup guide set them, and its removal or undo puts them back' }));
    });

    it('touches no setting of a website only partly chosen, nor reads one', async () => {
        const store = sandbox({ ...NOTHING, instance: settingsInstance() });

        const plan = await planWipeFor(store.get, [{ websiteCode: 'bodea', storeCode: 'bodea_store' }], { records: [] });

        expect(plan.settings).toStrictEqual([]);
        expect(store.reads.some((path) => path.startsWith('system/config'))).toBe(false);
    });

    it("sets back a wholly chosen website's, and never reads another website's", async () => {
        const store = sandbox({ ...NOTHING, instance: settingsInstance() });

        const plan = await planWipeFor(store.get, [{ websiteCode: 'bodea' }], { records: [] });

        expect(plan.settings).toEqual([{ websiteCode: 'bodea', path: 'sales/totals_sort/tax', value: '40' }]);
        expect(store.reads.some((path) => path.includes('scopeCode=justrite'))).toBe(false);
    });

    it('says so, by website, when the settings cannot be read', async () => {
        const store = sandbox({ ...NOTHING, instance: settingsInstance({ failing: [/scope=website/u] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.settings).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual({ kind: 'settings', count: 1, names: [`website ${TEST}`], why: "Commerce would not list the website's settings" });
    });

    it('wants nothing on a store without the API (404)', async () => {
        const plan = await planWipeFor(sandbox(NOTHING).get, TEST_STORE, { records: [] });

        expect(plan.settings).toStrictEqual([]);
    });

    it('reads the live answer: a website row with no value is not a setting to put back', async () => {
        const instance = settingsInstance();
        const live = SYSTEM_CONFIG_PAGE_TEST_WEBSITE.items ?? [];
        if (instance.settings) {
            instance.settings.websites[TEST] = live;
            instance.settings.default = live.map((row) => ({ ...row, scope: 'default' }));
        }
        const store = sandbox({ ...NOTHING, instance });
        const structure = await readWipeStructure(store.get);

        const decided = await decideSettings(store.get, resolveWipeScope(structure, TEST_STORE), new Set());

        expect(decided).toEqual({ reset: [], offLimits: [], installed: [], noDefault: [], lists: [], unread: [] });
    });
});

describe('putBackSettings', () => {
    const ONE = [{ websiteCode: TEST, path: 'sales/totals_sort/tax', value: '40' }];

    it('writes at website scope only, naming the website, through the settings fix', async () => {
        const store = sandbox({ instance: settingsInstance() });

        const outcome = await putBackSettings(store, ONE);

        expect(store.sent).toEqual([{ method: 'PUT', path: 'system/config', body: { items: [{ path: 'sales/totals_sort/tax', value: '40', scope: 'website', scope_code: TEST }] } }]);
        expect(outcome).toEqual({ count: 1, refused: [] });
    });

    it("reads Commerce's errors: a row refused under HTTP 200 is not counted, and is named without its value", async () => {
        const store = sandbox({ instance: settingsInstance() });

        const outcome = await putBackSettings(store, [{ websiteCode: TEST, path: REFUSED_SETTING, value: '0' }]);

        expect(outcome.count).toBe(0);
        expect(outcome.refused).toEqual([`${REFUSED_SETTING}: Configuration path "${REFUSED_SETTING}" was not found, is not visible for this scope, or is not allowed.`]);
    });

    it('asks about 50 settings at a time, website by website', async () => {
        const instance = settingsInstance();
        const many = Array.from({ length: 51 }, (_, i) => ({ websiteCode: TEST, path: `zz/test/field${i}`, value: 'x' }));
        if (instance.settings) instance.settings.websites[TEST].push(...many.map((m) => ({ path: m.path, value: 'y', scope: 'website', scope_code: TEST })));
        const store = sandbox({ instance });

        const outcome = await putBackSettings(store, many);

        expect(store.sent.map((w) => (w.body as { items: unknown[] }).items.length)).toEqual([50, 1]);
        expect(outcome.count).toBe(51);
    });

    it('writes nothing when the value already stands, so a second run changes nothing', async () => {
        const instance = settingsInstance();
        const store = sandbox({ instance });
        await putBackSettings(store, ONE);
        store.sent.length = 0;

        const outcome = await putBackSettings(store, ONE);

        expect(store.sent).toStrictEqual([]);
        expect(outcome.count).toBe(0);
    });
});
