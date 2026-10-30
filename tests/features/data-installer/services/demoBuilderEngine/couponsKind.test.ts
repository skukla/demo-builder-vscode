/**
 * The `coupons` kind (datapack-engine step 11): each code the store lacks, made on its rule (found
 * by the rule's NAME, as the pack names it), its code kept exactly; recorded by its code; taken back
 * on its own, and with its rule by Commerce.
 *
 * Pack rows are Health & Beauty and wknd `main`'s. The coupon search's page shape is the one
 * captured empty on 2026-10-30; the coupons and rules in the answers are built here.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { CART_RULE_KIND } from '@/features/data-installer/services/demoBuilderEngine/cartRulesKind';
import {
    COUPON_KIND,
    couponPackForm,
    installCoupons,
    parseCouponRows,
    removeCoupon,
    updateCoupon,
} from '@/features/data-installer/services/demoBuilderEngine/couponsKind';
import { ownedKey } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import { COUPON10, FF2021, NO_COUPONS_PAGE, NO_RULES_PAGE } from '../../../../helpers/commerceSalesRuleFixtures';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const couponSearch = (code: string) => page('coupons/search', filterBy('code', code));
const ruleSearch = (name: string) => page('salesRules/search', filterBy('name', name));

describe('coupons install', () => {
    it("makes the code on the rule this install made, its code exactly, without Commerce's counter", async () => {
        const ctx = await fakeContext({ [couponSearch('coupon10')]: NO_COUPONS_PAGE }, () => ({ coupon_id: 88, rule_id: 41, code: 'coupon10' }));
        await ctx.recorder.record({ kind: CART_RULE_KIND, id: '41', key: '10% Coupon' });

        await installCoupons(ctx, parseCouponRows([COUPON10]));

        expect(ctx.sent).toEqual([
            { method: 'POST', path: 'coupons', body: { coupon: { code: 'coupon10', rule_id: 41, usage_limit: 0, usage_per_customer: 0, is_primary: true, type: 0 } } },
        ]);
        expect(ctx.recorder.created).toContainEqual({ kind: COUPON_KIND, id: '88', key: 'coupon10' });
    });

    it("finds a rule the store already had by its exact name, when this install did not make it", async () => {
        const rules = { items: [{ rule_id: 6, name: `${FF2021.coupon.rule_id} (old)` }, { rule_id: 7, name: FF2021.coupon.rule_id }], total_count: 2 };
        const ctx = await fakeContext({ [couponSearch('FF2021')]: NO_COUPONS_PAGE, [ruleSearch(String(FF2021.coupon.rule_id))]: rules }, () => ({ coupon_id: 90 }));

        await installCoupons(ctx, parseCouponRows([FF2021]));

        expect((ctx.sent[0].body as { coupon: { rule_id: number } }).coupon.rule_id).toBe(7);
    });

    // Step 14 item 3: skipped and named, and the rest of the pack goes on.
    it('skips the code, naming both, when the store has no rule by that name', async () => {
        const ctx = await fakeContext({ [couponSearch('FF2021')]: NO_COUPONS_PAGE, [ruleSearch(String(FF2021.coupon.rule_id))]: NO_RULES_PAGE });

        await installCoupons(ctx, parseCouponRows([FF2021]));

        expect(ctx.session.skipped?.[0]).toMatchObject({ kind: 'coupons', key: 'FF2021', reason: expect.stringContaining('The store has no cart rule named Anaïs Clément - Friends and Family Promo, so the coupon FF2021') });
        expect(ctx.sent).toStrictEqual([]);
    });

    it('leaves a code the store already has, and does not record it', async () => {
        const ctx = await fakeContext({ [couponSearch('coupon10')]: { items: [{ coupon_id: 3, rule_id: 2, code: 'coupon10' }], total_count: 1 } });

        await installCoupons(ctx, parseCouponRows([COUPON10]));

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.recorder.created).toStrictEqual([]);
    });

    it("leaves a code alone when the SC deleted the rule this engine made for it", async () => {
        const ctx = await fakeContext({ [couponSearch('coupon10')]: NO_COUPONS_PAGE });
        ctx.session.owned = new Map([[ownedKey(CART_RULE_KIND, '10% Coupon'), null]]);

        await installCoupons(ctx, parseCouponRows([COUPON10]));

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.logged.join('\n')).toContain('you deleted its cart rule');
    });

    it('refuses a coupon row with no code before anything is sent', () => {
        expect(() => parseCouponRows([{ coupon: { rule_id: 'x' } }])).toThrow("The pack's coupons are not in the shape Commerce takes");
    });
});

describe('coupons update, removal and pack form', () => {
    it("brings a code this engine made up to the pack's row with PUT coupons/{id}", async () => {
        const ctx = await fakeContext({});
        await ctx.recorder.record({ kind: CART_RULE_KIND, id: '41', key: '10% Coupon' });

        await updateCoupon(ctx, '88', { coupon: { ...COUPON10.coupon, usage_limit: 5 } });

        expect(ctx.sent).toEqual([
            { method: 'PUT', path: 'coupons/88', body: { coupon: { coupon_id: 88, code: 'coupon10', rule_id: 41, usage_limit: 5, usage_per_customer: 0, is_primary: true, type: 0 } } },
        ]);
    });

    it('takes a code back with DELETE coupons/{id}, counting already gone as done', async () => {
        const sent: string[] = [];
        await removeCoupon(async (method, path) => void sent.push(`${method} ${path}`), '88');
        await removeCoupon(async () => {
            throw new CommerceReadError('Commerce answered 404', 404);
        }, '88');

        expect(sent).toEqual(['DELETE coupons/88']);
    });

    it("names its rule as the store calls it, and leaves out Commerce's id, counter and date", async () => {
        const ctx = await fakeContext({ 'salesRules/41': { rule_id: 41, name: '10% Coupon' } });

        const form = await couponPackForm(ctx.get, { coupon_id: 88, rule_id: 41, code: 'coupon10', times_used: 4, created_at: '2026-10-30 10:00:00', usage_limit: 0, is_primary: true, type: 0 });

        expect(form).toEqual({ coupon: { code: 'coupon10', rule_id: '10% Coupon', usage_limit: 0, is_primary: true, type: 0 } });
    });
});
