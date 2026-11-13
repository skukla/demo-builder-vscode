/**
 * The two handlers behind "check this demo's store data" and "clear it" (datapack-engine step 10;
 * datapack-simplification step 06), driven against the sandbox fake with the real plan and clearing:
 * the check covers every website the project uses and writes nothing, and the clearing refuses until
 * it is confirmed and handed the list that was shown. The project's datapack is uninstalled first,
 * through the removal it is handed (step 06 C3); here a fake of the engine's removal on the sandbox.
 */

import { type InstallRecord, installRecordPath } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { shownClearFor } from '@/features/data-installer/services/demoDataWipe/shownClears';
import type { WipeOutcome } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import { ErrorCode } from '@/types/errorCodes';
import { createMockProject } from '../../../helpers/projectFake';
import { memoryFiles } from '../services/demoBuilderEngine/demoBuilderEngine.testUtils';
import { PROJECT_RECORDS, sandbox } from '../services/demoDataWipe/wipe.testUtils';
import { fakeErp } from '../services/demoDataWipe/wipeErp.testUtils';
import { RESET_RULE_CASES } from '../../../helpers/resetRuleOrders';
import { ADMIN_64, BUYER_65, CATALOG_20, COMPANY_28, b2bInstance } from '../../../helpers/commerceWipeInstanceFixtures';
import { PROJECT, setUp, NEIGHBOUR, JUSTRITE_ELSEWHERE, checked } from './demoDataHandlers.testUtils';

describe('check-demo-data', () => {
    it("answers what clearing the project's websites would do, type by type, as if its datapack were already uninstalled, writing nothing (C3)", async () => {
        const { handlers, context, store } = setUp();

        const res = await handlers['check-demo-data'](context);

        expect(res.success).toBe(true);
        const check = checked(res.data);
        expect(check.websites).toEqual([{ code: 'justrite_test_website', name: 'JustRite Test' }]);
        // The clearing uninstalls the datapack first, so what its record lists is counted as removed.
        expect(check.records.products).toEqual({ removed: ['ZZ-ONLY-HERE', 'ZZ-JACKET', 'ZZ-JACKET-RED', 'ZZ-MADE-BY-DEMO-BUILDER', 'ZZ-SHARED-WITH-JUSTRITE'], kept: ['ZZ-LONE-VARIANT'] });
        expect(check.records.customers).toEqual({ removed: ['zz.shopper@example.com', 'zz.made@example.com'], kept: ['zz.admin@example.com'] });
        expect(check.rows.map((r) => [r.label, r.happens])).toEqual([
            ['Products', '5 removed'],
            ['Categories', '0 removed'],
            ['Customers', '2 removed'],
        ]);
        expect(check.total).toBe(7);
        expect(check.datapack).toEqual({ name: 'zz-test', changes: 'unchecked', pack: { name: 'zz-test', version: '1' } });
        expect(check.warning).toBeUndefined();
        expect(store.sent).toStrictEqual([]);
    });

    it('names no datapack, and plans with every record, when the pack the project names has no record here (one the service installed)', async () => {
        const servicePack = createMockProject({ ...PROJECT, datapack: { name: 'service-pack', version: '1' } });
        const { handlers, context } = setUp({}, sandbox(), servicePack);

        const check = checked((await handlers['check-demo-data'](context)).data);

        expect(check.datapack).toBeUndefined();
        expect(check.records.products.kept).toContain('ZZ-MADE-BY-DEMO-BUILDER');
    });

    it('names the project as the SC knows it, for the window title', async () => {
        const titled = createMockProject({ ...PROJECT, title: 'Kukla Bodea' });
        const { handlers, context } = setUp({}, sandbox(), titled);

        expect(checked((await handlers['check-demo-data'](context)).data).project).toBe('Kukla Bodea');
    });

    it("notes what its answer covers by the token, so clear_demo_data's consent can name the websites and the warning (S3)", async () => {
        const { handlers, context } = setUp({ others: async () => [NEIGHBOUR] });

        const check = checked((await handlers['check-demo-data'](context)).data);

        expect(shownClearFor(check.token)).toEqual({ websites: ['justrite_test_website'], warning: check.warning, datapack: 'zz-test' });
    });

    it('stops at an org mismatch before reading the store', async () => {
        const { handlers, context, store } = setUp({ guard: async () => 'Project uses a different Adobe organization.' });

        const res = await handlers['check-demo-data'](context);

        expect(res).toEqual({ success: false, error: 'Project uses a different Adobe organization.', code: ErrorCode.ORG_MISMATCH });
        expect(store.reads).toStrictEqual([]);
    });

    it('warns, naming it, when another project uses the same website, and still answers the list (P6-Q2)', async () => {
        const others = jest.fn().mockResolvedValue([NEIGHBOUR]);
        const { handlers, context } = setUp({ others });

        const res = await handlers['check-demo-data'](context);

        const check = checked(res.data);
        expect(check.warning).toBe('The project Neighbour Demo also uses the website justrite_test_website. Clearing it also removes what was added there by hand for that project.');
        expect(check.total).toBe(7);
        expect(others).toHaveBeenCalledWith(context, PROJECT);
    });

    it("keeps what another project's install records list on these websites, without a reason", async () => {
        const other = createMockProject({ name: 'bodea-demo', path: '/nonexistent/projects/bodea-demo', componentConfigs: {} });
        const theirs = { ...PROJECT_RECORDS[0], pack: { name: 'theirs', version: '1' }, created: [{ kind: 'products', id: 'ZZ-ONLY-HERE' }] };
        const { handlers, context, files } = setUp({ others: async () => [other] });
        files.data.set(installRecordPath(other.path, theirs.pack), JSON.stringify(theirs));

        const check = checked((await handlers['check-demo-data'](context)).data);

        expect(check.records.products.kept).toContain('ZZ-ONLY-HERE');
        expect(check.records.products.removed).not.toContain('ZZ-ONLY-HERE');
    });

    it("keeps a record both this project's and another project's install records list (S2)", async () => {
        const other = createMockProject({ name: 'bodea-demo', path: '/nonexistent/projects/bodea-demo', componentConfigs: {} });
        const theirs = { ...PROJECT_RECORDS[0], pack: { name: 'theirs', version: '1' }, created: [{ kind: 'products', id: 'ZZ-MADE-BY-DEMO-BUILDER' }] };
        const { handlers, context, files } = setUp({ others: async () => [other] });
        files.data.set(installRecordPath(other.path, theirs.pack), JSON.stringify(theirs));

        const check = checked((await handlers['check-demo-data'](context)).data);

        expect(check.records.products.kept).toContain('ZZ-MADE-BY-DEMO-BUILDER');
        expect(check.records.products.removed).not.toContain('ZZ-MADE-BY-DEMO-BUILDER');
    });

    it('asks the ERP integration serving the instance, found among every local project, which of these websites it routes', async () => {
        const { erp, client } = fakeErp();
        const find = jest.fn().mockReturnValue(erp);
        const store = sandbox({ orders: [RESET_RULE_CASES[0].order] });
        const { handlers, context } = setUp({ erp: find, others: async () => [JUSTRITE_ELSEWHERE] }, store);

        const check = checked((await handlers['check-demo-data'](context)).data);

        expect(find).toHaveBeenCalledWith(context, PROJECT, [JUSTRITE_ELSEWHERE]);
        expect(client.resolvedSettings).toHaveBeenCalledWith(['justrite_test_website']);
        expect(check.erp?.line).toBe('The ERP integration (JustRite) serves these websites: its ERP is brought in line with Commerce after the clearing.');
        expect(check.records.orders.removed).toEqual(['000000701']);
    });

    it('names a website the project uses that the store does not have', async () => {
        const gone = createMockProject({ ...PROJECT, name: 'gone', path: '/nonexistent/projects/gone', componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'nope', ACCS_STORE_VIEW_CODE: 'nope_view' } } });
        const { handlers, context } = setUp({}, sandbox(), gone);

        expect(await handlers['check-demo-data'](context)).toEqual({ success: false, error: 'Commerce has no website nope.' });
    });

    it('marks a type Commerce answers strangely as not read, and plans the rest', async () => {
        const store = sandbox();
        const get = (path: string) => (path.startsWith('products?') ? Promise.reject(new Error('Commerce answered 500 for products')) : store.get(path));
        const { handlers, context } = setUp({ commerce: async () => ({ ...store, get }) }, store);

        const check = checked((await handlers['check-demo-data'](context)).data);

        expect(check.unread).toEqual({ products: 'strange', categories: 'strange' });
        expect(check.rows[0]).toMatchObject({ label: 'Products', happens: "Couldn't be read" });
        expect(check.records.customers.removed).toHaveLength(2);
        expect((context.logger.warn as jest.Mock).mock.calls.flat().join(' ')).toContain('Products could not be read: Commerce answered 500 for products');
    });

    it("notes each type it could not read, its kind and Commerce's words, for Fix with AI's prompt", async () => {
        const store = sandbox();
        const get = (path: string) => (path.startsWith('products?') ? Promise.reject(new Error('Commerce answered 500 for products')) : store.get(path));
        const { handlers, context } = setUp({ commerce: async () => ({ ...store, get }) }, store);

        const check = checked((await handlers['check-demo-data'](context)).data);

        expect(shownClearFor(check.token)?.unread?.products).toEqual({ kind: 'strange', detail: 'Commerce answered 500 for products' });
    });

    it.each([
        ['signed out', new Error('Unauthorized: authentication required'), ErrorCode.AUTH_REQUIRED],
        ['offline', new Error('getaddrinfo ENOTFOUND example.com'), ErrorCode.NETWORK],
    ])('answers the Datapacks failure code when the whole check fails (%s)', async (_label, error, code) => {
        const store = sandbox();
        const { handlers, context } = setUp({ commerce: async () => ({ ...store, get: () => Promise.reject(error) }) }, store);

        const res = await handlers['check-demo-data'](context);

        expect(res).toMatchObject({ success: false, code });
    });

    it("answers Sign In's code when the project's store access is refused for a sign-in", async () => {
        const { handlers, context } = setUp({ commerce: async () => ({ refusal: 'Adobe authentication is required.' }) });

        expect(await handlers['check-demo-data'](context)).toEqual({ success: false, error: 'Adobe authentication is required.', code: ErrorCode.AUTH_REQUIRED });
    });
});

describe('clear-demo-data', () => {
    async function shown(made = setUp()) {
        const res = await made.handlers['check-demo-data'](made.context);
        return { ...made, token: checked(res.data).token };
    }

    it('refuses, writing nothing, with no token', async () => {
        const { handlers, context, store } = setUp();

        const res = await handlers['clear-demo-data'](context, {});

        expect(res).toMatchObject({ success: false, error: expect.stringMatching(/Check what would be removed first/), code: ErrorCode.INVALID_OPERATION });
        expect(store.sent).toStrictEqual([]);
    });

    it('refuses a token never shown', async () => {
        const { handlers, context, store } = await shown();

        expect((await handlers['clear-demo-data'](context, { token: 'made-up', confirm: true })).error).toMatch(/no longer known/);
        expect(store.sent).toStrictEqual([]);
    });

    it('names the websites and every kind it removes in the sentence an unconfirmed clearing answers', async () => {
        const { handlers, context, token, store } = await shown();

        const res = await handlers['clear-demo-data'](context, { token });

        expect(res.error).toMatch(/everything on the website justrite_test_website/);
        expect(res.error).toMatch(/companies, shared catalogs, customer groups, attribute sets and attributes/);
        expect(res.error).toMatch(/settings to the default's value/);
        expect(res.error).toMatch(/It cannot be undone/);
        expect(store.sent).toStrictEqual([]);
    });

    it('waits, writing nothing, while the list it was shown has a type Commerce was too slow to answer', async () => {
        const store = sandbox();
        const get = (path: string) => (path.startsWith('customers/search?') ? Promise.reject(new Error('The request timed out')) : store.get(path));
        const { handlers, context, token } = await shown(setUp({ commerce: async () => ({ ...store, get }) }, store));

        const res = await handlers['clear-demo-data'](context, { token, confirm: true });

        expect(res).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION, error: expect.stringMatching(/^Commerce didn't answer for Customers, so nothing was cleared/) });
        expect(store.sent).toStrictEqual([]);
    });

    it('runs for the rest when a type could not be read, leaving that type alone', async () => {
        const store = sandbox();
        const get = (path: string) => (path.startsWith('customers/search?') ? Promise.reject(new Error('Commerce answered 500 for customers')) : store.get(path));
        const { handlers, context, token } = await shown(setUp({ commerce: async () => ({ ...store, get }) }, store));

        const res = await handlers['clear-demo-data'](context, { token, confirm: true });

        expect(res.success).toBe(true);
        expect(store.sent.some((w) => w.path.startsWith('customers/'))).toBe(false);
        expect(store.sent.some((w) => w.path.startsWith('products/'))).toBe(true);
    });

    it('clears a company, its customers, its catalog and group through the same handlers', async () => {
        const store = sandbox({ products: [], orders: [], customers: [ADMIN_64, BUYER_65], instance: b2bInstance() });
        const { handlers, context, token } = await shown(setUp({}, store));

        const res = await handlers['clear-demo-data'](context, { token, confirm: true });

        expect(res.success).toBe(true);
        expect(store.sent.map((w) => w.path)).toEqual(['company/28', 'customers/64', 'customers/65', 'sharedCatalog/20', 'customerGroups/25']);
        expect(store.data.instance?.movedToGeneral).toStrictEqual([]);
    });

    it("keeps a company another project's record lists, whatever website that record is for", async () => {
        const store = sandbox({ products: [], orders: [], customers: [ADMIN_64, BUYER_65], instance: b2bInstance() });
        const theirs: InstallRecord = { format: 1, pack: { name: 'theirs', version: '1' }, engine: 'demo-builder', startedAt: '2026-10-30T10:00:00.000Z', target: { websiteCode: 'bodea', storeCode: 'bodea_en' }, created: [{ kind: 'b2b_companies', id: '28' }] };
        const files = memoryFiles({ [installRecordPath(JUSTRITE_ELSEWHERE.path, theirs.pack)]: JSON.stringify(theirs) });
        const { handlers, context } = setUp({ files, others: async () => [JUSTRITE_ELSEWHERE] }, store);

        const check = checked((await handlers['check-demo-data'](context)).data);

        expect(check.records.b2b_companies).toEqual({ removed: [], kept: [COMPANY_28.company_name] });
    });

    it('notes what a refused catalog delete left, so the next check of the same websites finds it again', async () => {
        const store = sandbox({ products: [], orders: [], customers: [ADMIN_64, BUYER_65], instance: b2bInstance() }, (path) => path === 'sharedCatalog/20');
        const { handlers, context, token } = await shown(setUp({}, store));

        const res = await handlers['clear-demo-data'](context, { token, confirm: true });

        expect(res.success).toBe(true);
        expect(res.note).toContain('Could not remove 1 of the shared catalogs');
        const again = await handlers['check-demo-data'](context);
        expect(checked(again.data).records.b2b_shared_catalogs.removed).toEqual([CATALOG_20.name]);
    });

    it("uninstalls the datapack first, then clears what was shown, once, and says both", async () => {
        const { handlers, context, token, store, seen } = await shown();

        const res = await handlers['clear-demo-data'](context, { token, confirm: true });

        expect(res.success).toBe(true);
        expect(seen.writesBefore).toEqual([0]);
        expect((res.data as WipeOutcome).removed).toMatchObject({ customers: 1, products: 3, takenOff: 1, cartRules: 0, rulesTakenOff: 0, categories: 0 });
        expect(res.note).toMatch(/^Uninstalled the datapack zz-test first\. Removed 3 products and 1 customer from the website justrite_test_website\./);
        expect(res.note).not.toMatch(/left for its uninstall/);
        expect(store.sent).toHaveLength(5);
        expect((await handlers['clear-demo-data'](context, { token, confirm: true })).error).toMatch(/no longer known/);
    });

    it("tells the screen's progress window each stage, and ends it on the one sentence", async () => {
        const { handlers, context, token } = await shown();

        await handlers['clear-demo-data'](context, { token, confirm: true, progress: 'modal' });

        const pushed = (context.sendMessage as jest.Mock).mock.calls.filter(([type]) => type === 'operationProgress').map(([, payload]) => payload);
        expect(pushed).toContainEqual(expect.objectContaining({ id: 'demo-data-clear', state: 'running', stage: 'Deleting customers' }));
        // The check counts through the data types it re-reads, as an install does (owner, 2026-11-04).
        expect(pushed).toContainEqual(expect.objectContaining({ stage: 'Verifying demo data', step: '0 of 11 data types: Categories' }));
        expect(pushed).toContainEqual(expect.objectContaining({ stage: 'Verifying demo data', step: '10 of 11 data types: Orders' }));
        // Each removal step counts its items the same way.
        expect(pushed).toContainEqual(expect.objectContaining({ stage: 'Deleting products', step: '3 of 3 products' }));
        expect(pushed).toContainEqual(expect.objectContaining({ id: 'demo-data-clear', state: 'succeeded', note: expect.stringMatching(/^Uninstalled the datapack zz-test first\. Removed 3 products/) }));
    });

    it('clears, with the warning given, though another project uses the same website (P6-Q2)', async () => {
        const others = jest.fn().mockResolvedValue([NEIGHBOUR]);
        const { handlers, context, token, store } = await shown(setUp({ others }));

        const cleared = await handlers['clear-demo-data'](context, { token, confirm: true });

        expect(cleared.success).toBe(true);
        expect(store.sent.length).toBeGreaterThan(0);
    });

    it('closes the orders itself, then has the ERP integration bring its ERP in line, in the one clearing', async () => {
        const { erp, client, refill } = fakeErp();
        const store = sandbox({ orders: [RESET_RULE_CASES[0].order] });
        const { handlers, context, token } = await shown(setUp({ erp: () => erp }, store));

        const res = await handlers['clear-demo-data'](context, { token, confirm: true });

        expect(res.success).toBe(true);
        expect(client.closeOrders).toHaveBeenCalledWith(['justrite_test_store'], expect.any(Function));
        expect(refill).toHaveBeenCalledTimes(1);
        expect(store.sent.map((w) => w.path)).toContain('orders/701/cancel');
        expect(res.note).toContain(' Canceled 1 order.');
        expect(res.note).toContain(" JustRite's ERP was brought in line with Commerce. These websites' orders were removed from Justrite ERP.");
    });

    it('writes nothing and offers the new list when the store would now clear more', async () => {
        const { handlers, context, token, store } = await shown();
        store.data.customers.push({ id: 99, email: 'new@example.com', firstname: 'N', lastname: 'W', website_id: 5 });

        const res = await handlers['clear-demo-data'](context, { token, confirm: true });

        expect(res.success).toBe(false);
        expect(res.error).toMatch(/Commerce changed since the list was made/);
        expect(checked(res.data).records.customers.removed).toContain('new@example.com');
        expect(store.sent).toStrictEqual([]);
    });
});

describe('open-commerce-admin', () => {
    it("opens the project's Commerce Admin through the house opener", async () => {
        const openAdmin = jest.fn().mockResolvedValue({ outcome: 'opened' });
        const { handlers, context } = setUp({ openAdmin });

        const res = await handlers['open-commerce-admin'](context);

        expect(res).toEqual({ success: true });
        expect(openAdmin).toHaveBeenCalledWith(PROJECT);
    });

    it('says so when the project has no Admin address', async () => {
        const { handlers, context } = setUp({ openAdmin: async () => ({ outcome: 'no-url' as const }) });

        expect(await handlers['open-commerce-admin'](context)).toEqual({ success: false, error: 'No Admin Panel URL is set for this project.' });
    });

    it("says so when the project's Admin address is not valid", async () => {
        const { handlers, context } = setUp({ openAdmin: async () => ({ outcome: 'invalid' as const, error: new Error('bad') }) });

        expect(await handlers['open-commerce-admin'](context)).toEqual({ success: false, error: "This project's Admin Panel URL is not valid." });
    });
});
