/**
 * clear-demo-data with the datapack uninstalled first (datapack-simplification step 06 C3), and the
 * fixes from its two reviews: the removal runs before any wipe write, a failed one keeps the token
 * for Retry, a service-installed pack is forgotten only when nothing of it can be left. Split from
 * demoDataHandlers.test.ts at the 750-line limit; setup in demoDataHandlers.testUtils.ts.
 */

import { createDemoDataHandlers } from '@/features/data-installer/handlers/demoDataHandlers';
import { type InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { SaveAsAnswer } from '@/features/eds/services/reset/edsResetSampleData';
import type { DatapackRemoval } from '@/features/eds/services/reset/resetDatapackStep';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import type { OperationProgressPayload } from '@/types/webviewPayloads';
import { createMockProject } from '../../../helpers/projectFake';
import { PROJECT_RECORDS, sandbox } from '../services/demoDataWipe/wipe.testUtils';
import { RESET_RULE_CASES } from '../../../helpers/resetRuleOrders';
import { ADMIN_64, BUYER_65, CATALOG_20, b2bInstance, settingsInstance } from '../../../helpers/commerceWipeInstanceFixtures';
import { PROJECT, packRemoval, setUp, TEST_SITE_SHOPPER, cleanStore, checked, type Store } from './demoDataHandlers.testUtils';

describe('clear-demo-data, the datapack uninstalled first (step 06 C3)', () => {
    async function shownWith(made = setUp()) {
        const res = await made.handlers['check-demo-data'](made.context);
        return { ...made, token: checked(res.data).token };
    }
    const pushedOf = (context: HandlerContext): OperationProgressPayload[] =>
        (context.sendMessage as jest.Mock).mock.calls.filter(([type]) => type === 'operationProgress').map(([, payload]) => payload as OperationProgressPayload);

    it.each<[string, Record<string, unknown>, SaveAsAnswer]>([
        ['a name to save the changes as', { changes: 'keep', saveAs: { displayName: 'My ZZ' } }, { saveAs: 'My ZZ' }],
        ['Clear Without Saving', { changes: 'drop' }, 'drop'],
        ['no answer (nothing changed, or the SC\'s own pack, saved into)', {}, undefined],
    ])('hands the removal the open project and the answer given: %s', async (_what, answer, given) => {
        const { handlers, context, token, seen, current } = await shownWith();

        await handlers['clear-demo-data'](context, { token, confirm: true, ...answer });

        expect(seen.given).toEqual([given]);
        expect(seen.projects[0]).toBe(current);
        // Re-review item 3: the products the shown list deletes, so the uninstall keeps what the check removes.
        expect(seen.leaving).toEqual([['ZZ-ONLY-HERE', 'ZZ-JACKET', 'ZZ-JACKET-RED', 'ZZ-MADE-BY-DEMO-BUILDER']]);
    });

    it('stops before any wipe write when the removal fails, says why, keeps the pack named, and Retry runs it again', async () => {
        const made = setUp();
        const outcome: DatapackRemoval = { kept: 'Commerce refused the product delete.' };
        made.deps.remove = packRemoval(made.store, made.files, made.seen, { outcome });
        const handlers = createDemoDataHandlers(made.deps);
        const { token } = await shownWith({ ...made, handlers });

        const res = await handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(res).toMatchObject({ success: false, error: "The datapack zz-test wasn't uninstalled, so nothing was cleared: Commerce refused the product delete." });
        expect(made.store.sent).toStrictEqual([]);
        expect(made.current.datapack).toEqual({ name: 'zz-test', version: '1' });
        await handlers['clear-demo-data'](made.context, { token, confirm: true });
        expect(made.seen.given).toHaveLength(2);
    });

    it('says part of it came out when a removal stopped part-way, and still writes nothing', async () => {
        const made = setUp();
        made.deps.remove = packRemoval(made.store, made.files, made.seen, { outcome: { kept: 'The job stopped.', partly: true } });
        const handlers = createDemoDataHandlers(made.deps);
        const { token } = await shownWith({ ...made, handlers });

        const res = await handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(res.error).toBe('Part of the datapack zz-test was uninstalled before it stopped, so nothing was cleared: The job stopped.');
        expect(made.store.sent).toStrictEqual([]);
    });

    it('refuses with CHANGES_NEED_ANSWER, clearing nothing, when the changes in a pack not the user\'s had no answer', async () => {
        const made = setUp();
        made.deps.remove = packRemoval(made.store, made.files, made.seen, { outcome: { kept: 'You changed 2 things since it was installed. They were not answered.', unanswered: true } });
        const handlers = createDemoDataHandlers(made.deps);
        const { token } = await shownWith({ ...made, handlers });

        const res = await handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(res).toMatchObject({ success: false, code: ErrorCode.CHANGES_NEED_ANSWER });
        expect(res.error).toMatch(/^You changed 2 things since it was installed\. They were not answered\. Nothing was cleared\. Tell the user, then call again with changes:"keep" with saveAs/);
        expect(made.store.sent).toStrictEqual([]);
    });

    it('runs the wipe alone for a pack with no record here (one the service installed)', async () => {
        const servicePack = createMockProject({ ...PROJECT, datapack: { name: 'service-pack', version: '1' } });
        const { handlers, context, token, seen } = await shownWith(setUp({}, sandbox(), servicePack));

        const res = await handlers['clear-demo-data'](context, { token, confirm: true });

        expect(res.success).toBe(true);
        expect(seen.given).toStrictEqual([]);
        expect(res.note).not.toMatch(/Uninstalled/);
    });

    it('respects what the removal left in the store on purpose, and says so', async () => {
        const made = setUp();
        made.deps.remove = packRemoval(made.store, made.files, made.seen, { keep: [{ kind: 'customers', id: '72' }] });
        const handlers = createDemoDataHandlers(made.deps);
        const { token } = await shownWith({ ...made, handlers });

        const res = await handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(res.success).toBe(true);
        expect(made.store.sent.map((w) => w.path)).not.toContain('customers/72');
        expect(res.note).toMatch(/^Uninstalled the datapack zz-test first, leaving part of it in Commerce on purpose: the project still names it\. /);
        expect(made.current.datapack).toEqual({ name: 'zz-test', version: '1' });
    });

    it('clears after a removal that put a website setting back to a value the list saw as the default (withinPlan)', async () => {
        // The pack wrote the default's value (40) over the website's own (41); its removal puts 41 back.
        const instance = settingsInstance();
        const tax = instance.settings?.websites.justrite_test_website.find((r) => r.path === 'sales/totals_sort/tax');
        if (tax) tax.value = '40';
        const layer: InstallRecord = { ...PROJECT_RECORDS[0], created: [...PROJECT_RECORDS[0].created, { kind: 'store_config', id: 'sales/totals_sort/tax@website', key: 'sales/totals_sort/tax@website' }] };
        const store = sandbox({ instance });
        const made = setUp({}, store, PROJECT, layer);
        const putBack = (s: Store): void => {
            const row = s.data.instance?.settings?.websites.justrite_test_website.find((r) => r.path === 'sales/totals_sort/tax');
            if (row) row.value = '41';
        };
        made.deps.remove = packRemoval(store, made.files, made.seen, { settings: putBack });
        const handlers = createDemoDataHandlers(made.deps);
        const { token } = await shownWith({ ...made, handlers });

        const res = await handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(res.success).toBe(true);
        const settingWrites = store.sent.filter((w) => w.path === 'system/config').flatMap((w) => (w.body as { items: Array<{ path: string; value: string }> }).items);
        expect(settingWrites).toContainEqual(expect.objectContaining({ path: 'sales/totals_sort/tax', value: '40' }));
        // C3 review: said, since the list showed no such setting (it read the default's value then).
        expect(res.note).toContain("1 website setting the datapack's uninstall had put back was then set to the default's value.");
    });

    it('a stopped run: the removal done, what the wipe could not finish noted after it, and a second Clear picks it up without uninstalling again', async () => {
        const store = sandbox({ products: [], orders: [], customers: [ADMIN_64, BUYER_65], instance: b2bInstance() }, (path) => path === 'sharedCatalog/20');
        const made = setUp({}, store);
        const { token } = await shownWith(made);

        const first = await made.handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(first.success).toBe(true);
        expect(made.seen.writesBefore).toEqual([0]);
        expect([...made.files.data.keys()].some((k) => k.endsWith('wipe-unfinished.json'))).toBe(true);
        const again = checked((await made.handlers['check-demo-data'](made.context)).data);
        expect(again.datapack).toBeUndefined();
        expect(again.records.b2b_shared_catalogs.removed).toEqual([CATALOG_20.name]);
        await made.handlers['clear-demo-data'](made.context, { token: again.token, confirm: true });
        expect(made.seen.given).toHaveLength(1);
    });

    it("draws the run as rows from the first push: Uninstall the datapack, then the clear's types, without growing", async () => {
        const { handlers, context, token } = await shownWith();

        await handlers['clear-demo-data'](context, { token, confirm: true, progress: 'modal' });

        const pushed = pushedOf(context).filter((p) => p.rows);
        const labels = (p: OperationProgressPayload): string[] => (p.rows ?? []).map((r) => r.label);
        expect(labels(pushed[0])).toEqual(['Uninstall zz-test', 'Customers', 'Products']);
        expect(pushed[0].rows?.[0]).toMatchObject({ status: 'checking' });
        expect(pushed.every((p) => labels(p).length === 3)).toBe(true);
        const end = pushed[pushed.length - 1];
        expect(end).toMatchObject({ state: 'succeeded' });
        expect(end.rows?.every((r) => r.status === 'success')).toBe(true);
    });

    it('ends on the rows, amber, with Open Commerce Admin, when an order in payment review was left open', async () => {
        const review = { ...RESET_RULE_CASES[0].order, entity_id: 702, increment_id: '000000702', state: 'payment_review' };
        const { handlers, context, token } = await shownWith(setUp({}, sandbox({ orders: [review] })));

        const res = await handlers['clear-demo-data'](context, { token, confirm: true, progress: 'modal' });

        expect(res.success).toBe(true);
        const end = pushedOf(context).pop();
        expect(end?.rows?.find((r) => r.label === 'Orders')).toMatchObject({ status: 'warning', problem: { text: '1 order needs closing in the Commerce Admin.', failed: false } });
        expect(end?.warning).toBe('Some of it needs the Commerce Admin.');
        expect(end?.offer).toEqual({ action: 'open-commerce-admin' });
    });
});

describe('clear-demo-data, review fixes (step 06 C3 review)', () => {
    async function shownWith(made = setUp()) {
        const res = await made.handlers['check-demo-data'](made.context);
        return { ...made, token: checked(res.data).token };
    }
    const THEIR_CHANGES = { count: 2, kinds: [{ kind: 'products', count: 2, names: ['ZZ-JACKET'] }], sentence: 'You changed 2 things since it was installed.', alwaysSave: false };

    it('refuses for an answer before anything runs when a pack not the user\'s has changes and none was given, and the token still works', async () => {
        const made = setUp();
        made.deps.changes = async () => THEIR_CHANGES;
        const handlers = createDemoDataHandlers(made.deps);
        const { token } = await shownWith({ ...made, handlers });

        const res = await handlers['clear-demo-data'](made.context, { token, confirm: true, progress: 'modal' });

        expect(res).toMatchObject({ success: false, code: ErrorCode.CHANGES_NEED_ANSWER, error: expect.stringMatching(/^You changed 2 things since it was installed\. Nothing was cleared\. Tell the user, then call again with changes:"keep"/) });
        expect(res.error).not.toMatch(/removeData/);
        expect(made.seen.given).toStrictEqual([]);
        expect(made.store.sent).toStrictEqual([]);
        const pushed = (made.context.sendMessage as jest.Mock).mock.calls.map(([, p]) => p as OperationProgressPayload);
        expect(pushed.some((p) => p.stage !== undefined)).toBe(false);
        const again = await handlers['clear-demo-data'](made.context, { token, confirm: true, changes: 'drop' });
        expect(again.success).toBe(true);
        expect(made.seen.given).toEqual(['drop']);
    });

    it("asks nothing first for changes in the user's own pack: they are saved into it", async () => {
        const made = setUp();
        made.deps.changes = async () => ({ ...THEIR_CHANGES, packName: 'zz-test' });
        const handlers = createDemoDataHandlers(made.deps);
        const { token } = await shownWith({ ...made, handlers });

        expect((await handlers['clear-demo-data'](made.context, { token, confirm: true })).success).toBe(true);
        expect(made.seen.given).toEqual([undefined]);
    });

    it('claims the token before the removal: a second clearing of the same list at once is refused, and runs no removal', async () => {
        const made = setUp();
        let finish: () => void = () => undefined;
        const inner = made.deps.remove;
        made.deps.remove = async (...args) => {
            await new Promise<void>((resolve) => (finish = resolve));
            return inner(...args);
        };
        const handlers = createDemoDataHandlers(made.deps);
        const { token } = await shownWith({ ...made, handlers });

        const first = handlers['clear-demo-data'](made.context, { token, confirm: true });
        await new Promise((resolve) => setImmediate(resolve));
        const second = await handlers['clear-demo-data'](made.context, { token, confirm: true });
        finish();

        expect(second.error).toMatch(/no longer known/);
        expect((await first).success).toBe(true);
        expect(made.seen.given).toHaveLength(1);
    });

    it('notes what to look at again when the wipe stops after the datapack came out', async () => {
        const store = sandbox({ products: [], orders: [], customers: [ADMIN_64, BUYER_65], instance: b2bInstance() });
        const made = setUp({}, store);
        const { token } = await shownWith(made);
        const inner = made.deps.remove;
        let removed = false;
        made.deps.remove = async (...args) => ((removed = true), inner(...args));
        made.deps.commerce = async () => ({ ...store, get: (path: string) => (removed && path.startsWith('store/websites') ? Promise.reject(new Error('socket hang up')) : store.get(path)) });
        const handlers = createDemoDataHandlers(made.deps);
        const { token: fresh } = await shownWith({ ...made, handlers });
        void token;

        const res = await handlers['clear-demo-data'](made.context, { token: fresh, confirm: true });

        expect(res.success).toBe(false);
        expect(res.error).toMatch(/^Uninstalled the datapack zz-test first\. This project's websites could not be cleared\./);
        const note = [...made.files.data.entries()].find(([k]) => k.endsWith('wipe-unfinished.json'));
        expect(JSON.parse(note?.[1] ?? '{}')).toMatchObject({ groups: [25] });
    });

    it('stops naming a pack the service installed once the wipe took everything out, saving the project without it', async () => {
        const servicePack = createMockProject({ ...PROJECT, datapack: { name: 'service-pack', version: '1' } });
        // Nothing kept anywhere: with no record, anything kept might be the pack's (re-review item 1).
        const made = setUp({}, cleanStore(), servicePack);
        const { token } = await shownWith(made);

        const res = await made.handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(res.note).toMatch(/Nothing of the datapack service-pack is left in Commerce, so the project no longer uses it\.$/);
        const saved = (made.context.stateManager.saveProject as jest.Mock).mock.calls.map(([p]) => p as Project);
        expect(saved).toHaveLength(1);
        expect(saved[0]).toBe(made.current);
        expect(saved[0].datapack).toBeUndefined();
    });

    it("keeps naming a pack the service installed when a type could not be read at run time, though the list read it", async () => {
        const servicePack = createMockProject({ ...PROJECT, datapack: { name: 'service-pack', version: '1' } });
        const store = cleanStore();
        let late = false;
        const made = setUp({ commerce: async () => ({ ...store, get: (path: string) => (late && path.startsWith('categories') ? Promise.reject(new Error('The request timed out')) : store.get(path)) }) }, store, servicePack);
        const { token } = await shownWith(made);
        late = true;

        const res = await made.handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(res.success).toBe(true);
        expect(res.note).not.toMatch(/Nothing of the datapack/);
        expect(made.current.datapack).toEqual({ name: 'service-pack', version: '1' });
        expect(made.context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('keeps naming a pack the service installed when the wipe kept anything, which might be the pack\'s', async () => {
        const servicePack = createMockProject({ ...PROJECT, datapack: { name: 'service-pack', version: '1' } });
        // A category another website also shows is kept; nothing is refused or only taken off.
        const made = setUp({}, sandbox({ products: [], customers: [TEST_SITE_SHOPPER] }), servicePack);
        const { token } = await shownWith(made);

        const res = await made.handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(res.success).toBe(true);
        expect(made.current.datapack).toEqual({ name: 'service-pack', version: '1' });
    });

    it('does not say the project stopped using a service pack when saving it failed', async () => {
        const servicePack = createMockProject({ ...PROJECT, datapack: { name: 'service-pack', version: '1' } });
        const made = setUp({}, cleanStore(), servicePack);
        (made.context.stateManager.saveProject as jest.Mock).mockRejectedValue(new Error('disk full'));
        const { token } = await shownWith(made);

        const res = await made.handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(res.success).toBe(true);
        expect(res.note).not.toMatch(/no longer uses it/);
    });

    it('gives the token back when the clearing throws before any write, so Retry runs it', async () => {
        const made = setUp();
        let broken = false;
        made.deps.commerce = async () => {
            if (broken) throw new Error('socket hang up');
            return made.store;
        };
        const handlers = createDemoDataHandlers(made.deps);
        const { token } = await shownWith({ ...made, handlers });
        broken = true;

        const first = await handlers['clear-demo-data'](made.context, { token, confirm: true });
        broken = false;
        const retry = await handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(first.success).toBe(false);
        expect(made.seen.given).toHaveLength(1);
        expect(retry.success).toBe(true);
    });

    it('keeps the token claimed when the clearing throws after the uninstall began', async () => {
        const made = setUp();
        made.deps.remove = async () => {
            throw new Error('socket hang up');
        };
        const handlers = createDemoDataHandlers(made.deps);
        const { token } = await shownWith({ ...made, handlers });

        const first = await handlers['clear-demo-data'](made.context, { token, confirm: true });
        const retry = await handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(first.success).toBe(false);
        expect(retry.error).toMatch(/no longer known/);
    });

    it('keeps naming a pack the service installed when the wipe could not take everything out', async () => {
        const servicePack = createMockProject({ ...PROJECT, datapack: { name: 'service-pack', version: '1' } });
        const store = sandbox({}, (path) => path.startsWith('products/'));
        const made = setUp({}, store, servicePack);
        const { token } = await shownWith(made);

        const res = await made.handlers['clear-demo-data'](made.context, { token, confirm: true });

        expect(res.success).toBe(true);
        expect(made.current.datapack).toEqual({ name: 'service-pack', version: '1' });
        expect(made.context.stateManager.saveProject).not.toHaveBeenCalled();
    });
});
