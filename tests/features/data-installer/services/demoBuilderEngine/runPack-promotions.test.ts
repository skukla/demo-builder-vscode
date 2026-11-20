/**
 * A pack with a cart rule and its coupon, whole (datapack-engine step 11): it installs in the
 * store's order, the record names both by the pack's name with both hashes, a repeat install keeps
 * what the SC changed in the Admin, and removal takes back exactly what was made (the coupon, then
 * its rule), leaving the record gone, unless the rule holds a code the SC added.
 *
 * The store is a small fake whose answers follow the writes, in Magento's `RuleInterface` and
 * `CouponInterface` shapes; the empty search pages are the ones captured 2026-10-30.
 */

import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { installRecordPath, openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { installPack, removePack } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import type { CommerceCoupon, CommerceSalesRule } from '@/types/commerceSalesRule';
import { COUPON10, TEN_PERCENT_COUPON } from '../../../../helpers/commerceSalesRuleFixtures';
import { NOW, PACK, PROJECT, type SentCall, fakeContext, memoryFiles, page } from './demoBuilderEngine.testUtils';

const ITEMS = { cart_rules: [TEN_PERCENT_COUPON], coupons: [COUPON10] };
const GROUPS = [['Guest', 0], ['Default (General)', 1], ['Wholesale', 2], ['Retailer', 3]] as const;
const lookupGroup = (code: string) =>
    page('customerGroups/search', `&searchCriteria[filterGroups][0][filters][0][field]=customer_group_code&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(code)}`);

/** A store that holds the rules and coupons written to it. */
function liveStore() {
    const state = { rules: [] as CommerceSalesRule[], coupons: [] as CommerceCoupon[] };
    const pageOf = <T>(items: T[]) => ({ items, search_criteria: { filter_groups: [] }, total_count: items.length });
    const reads: Record<string, unknown> = {
        ...Object.fromEntries(GROUPS.map(([code, id]) => [lookupGroup(code), { items: [{ id, code }], total_count: 1 }])),
        ...Object.fromEntries(GROUPS.map(([code, id]) => [`customerGroups/${id}`, { id, code }])),
        [page('salesRules/search', filterBy('name', '10% Coupon'))]: () => pageOf(state.rules.filter((r) => r.name === '10% Coupon')),
        [page('coupons/search', filterBy('code', 'coupon10'))]: () => pageOf(state.coupons.filter((c) => c.code === 'coupon10')),
        [page('coupons/search', filterBy('rule_id', '41'))]: () => pageOf(state.coupons.filter((c) => c.rule_id === 41)),
        'salesRules/41': () => state.rules.find((r) => r.rule_id === 41) ?? null,
        'coupons/88': () => state.coupons.find((c) => c.coupon_id === 88) ?? null,
    };
    const answer = (call: SentCall): unknown => {
        const body = call.body as { rule?: CommerceSalesRule; coupon?: CommerceCoupon };
        if (call.method === 'POST' && call.path === 'salesRules') return state.rules.push({ ...body.rule!, rule_id: 41, times_used: 0 }) && state.rules[0];
        if (call.method === 'POST' && call.path === 'coupons') return state.coupons.push({ ...body.coupon!, coupon_id: 88, times_used: 0 }) && state.coupons[0];
        if (call.method === 'DELETE' && call.path === 'coupons/88') state.coupons = state.coupons.filter((c) => c.coupon_id !== 88);
        // Commerce deletes a rule's coupons with it.
        if (call.method === 'DELETE' && call.path === 'salesRules/41') {
            state.rules = [];
            state.coupons = state.coupons.filter((c) => c.rule_id !== 41);
        }
        return true;
    };
    return { state, reads, answer };
}

async function installed(files = memoryFiles()) {
    const store = liveStore();
    const ctx = await fakeContext(store.reads, store.answer);
    ctx.recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
    ctx.session.websiteId = 5;
    await installPack(ctx, ITEMS);
    return { ...store, ctx, files };
}

describe('a cart rule and its coupon, whole', () => {
    it('makes the rule, then its code on it, and records both by name with both hashes', async () => {
        const { ctx, state } = await installed();

        expect(ctx.sent.map((c) => `${c.method} ${c.path}`)).toEqual(['POST salesRules', 'POST coupons']);
        expect(state.coupons[0]).toMatchObject({ code: 'coupon10', rule_id: 41 });
        const record = ctx.recorder.created;
        expect(record.map((o) => [o.kind, o.id, o.key])).toEqual([['cart_rules', '41', '10% Coupon'], ['coupons', '88', 'coupon10']]);
        expect(record.every((o) => o.fingerprint && o.wrote)).toBe(true);
    });

    it("keeps the SC's Admin edit on a repeat install, and does not count a demo order using the rule as one", async () => {
        const { ctx, state } = await installed();
        state.rules[0] = { ...state.rules[0], discount_amount: 15, times_used: 3 };
        state.coupons[0] = { ...state.coupons[0], times_used: 3 };
        ctx.sent.length = 0;

        const outcome = await installPack(ctx, ITEMS);

        expect(ctx.sent).toStrictEqual([]);
        expect(outcome.kept).toEqual([{ kind: 'cart_rules', key: '10% Coupon' }]);
        expect(state.rules[0].discount_amount).toBe(15);
    });

    it('takes back the coupon, then its rule, and forgets the record: back to zero', async () => {
        const { state, ctx, files } = await installed();

        const result = await removePack(ctx, files, { projectPath: PROJECT, pack: PACK });

        expect(result).toMatchObject({ removed: 2, noRecord: false, kept: [] });
        expect(ctx.sent.slice(-2).map((c: SentCall) => `${c.method} ${c.path}`)).toEqual(['DELETE coupons/88', 'DELETE salesRules/41']);
        expect(state.rules).toStrictEqual([]);
        expect(state.coupons).toStrictEqual([]);
        expect(files.data.has(installRecordPath(PROJECT, PACK))).toBe(false);
    });

    it('keeps the rule, and it on the record, while it holds a code the SC added', async () => {
        const { state, ctx, files } = await installed();
        state.coupons.push({ coupon_id: 90, rule_id: 41, code: 'MINE', type: 0 });

        const result = await removePack(ctx, files, { projectPath: PROJECT, pack: PACK });

        expect(result.kept.map((k) => [k.kind, k.name, k.count, k.holds])).toEqual([['cart rule', '10% Coupon', 1, 'coupon']]);
        expect(state.rules).toHaveLength(1);
        expect(state.coupons.map((c) => c.code)).toEqual(['MINE']);
        expect((await readInstallRecord(files, PROJECT, PACK))?.created.map((o) => o.kind)).toEqual(['cart_rules']);
    });
});
