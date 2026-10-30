/**
 * Cart rules in a store wipe (datapack-engine step 11). A rule is website-scoped, and one rule can
 * span websites, so the unambiguous part is built:
 *
 * - a rule on ONLY wholly chosen websites is deleted, and Commerce takes its coupons with it;
 * - a rule also on a website not chosen is only taken off the chosen ones;
 * - a rule on a website only PARTLY chosen is left, and said why (a store not chosen sells there);
 * - a rule an install record lists, or one holding a coupon one lists, is left to the pack's removal.
 *
 * The rules are built here in `RuleInterface`'s shape; the sandbox is the wipe suites' fake.
 */

import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { planWipeFor, withinPlan } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { clearShown, runWipe } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import type { CommerceCoupon, CommerceSalesRule } from '@/types/commerceSalesRule';
import { BODEA_ID, JUSTRITE_ID, TEST_SITE_ID } from '../../../../helpers/commerceWipeFixtures';
import { PROJECT_RECORDS, sandbox, writesOf } from './wipe.testUtils';

const TEST_STORE = [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }];
const BODEA_STORE = [{ websiteCode: 'bodea', storeCode: 'bodea_store' }];

const rule = (rule_id: number, name: string, website_ids: number[]): CommerceSalesRule => ({
    rule_id,
    name,
    website_ids,
    customer_group_ids: [0, 1],
    is_active: true,
    simple_action: 'by_percent',
    discount_amount: 10,
    coupon_type: 'NO_COUPON',
});

const RULES = [
    rule(101, 'ZZ Test Only', [TEST_SITE_ID]),
    rule(102, 'ZZ Test And JustRite', [TEST_SITE_ID, JUSTRITE_ID]),
    rule(103, 'JustRite Only', [JUSTRITE_ID]),
    rule(104, 'ZZ Installed', [TEST_SITE_ID]),
    rule(105, 'ZZ Holds An Installed Code', [TEST_SITE_ID]),
    rule(106, 'Bodea Spring', [BODEA_ID]),
];
const COUPONS: CommerceCoupon[] = [{ coupon_id: 501, rule_id: 105, code: 'ZZINSTALLED', type: 0 }, { coupon_id: 502, rule_id: 101, code: 'ZZONLY', type: 0 }];

const RECORDS: InstallRecord[] = [
    {
        ...PROJECT_RECORDS[0],
        created: [...PROJECT_RECORDS[0].created, { kind: 'cart_rules', id: '104', key: 'ZZ Installed' }, { kind: 'coupons', id: '501', key: 'ZZINSTALLED' }],
    },
];

const withRules = () => sandbox({ rules: structuredClone(RULES), coupons: structuredClone(COUPONS) });

describe('planWipe with cart rules', () => {
    it('deletes a rule on only the chosen websites, and takes one also on another website off the chosen one', async () => {
        const plan = await planWipeFor(withRules().get, TEST_STORE, RECORDS);

        expect(plan.ruleIds).toEqual(['101']);
        expect(plan.ruleTakeOff).toEqual([{ id: '102', websiteIds: [JUSTRITE_ID] }]);
        expect(plan.preview.remove.cartRules).toEqual({ count: 1, names: ['ZZ Test Only'] });
        expect(plan.preview.rulesTakenOff).toEqual({ count: 1, names: ['ZZ Test And JustRite'] });
    });

    it("leaves what an install record lists, and a rule holding a code one lists, never another website's", async () => {
        const plan = await planWipeFor(withRules().get, TEST_STORE, RECORDS);

        expect(plan.ruleIds).not.toContain('104');
        expect(plan.ruleIds).not.toContain('103');
        expect(plan.preview.left).toContainEqual({ kind: 'cart rules', count: 1, names: ['ZZ Holds An Installed Code'], why: 'they hold a coupon Demo Builder installed' });
        expect(plan.preview.installed).toMatchObject({ cart_rules: 1, coupons: 1 });
    });

    it('leaves a rule on a website only partly chosen, and says why', async () => {
        const plan = await planWipeFor(withRules().get, BODEA_STORE, RECORDS);

        expect(plan.ruleIds).toStrictEqual([]);
        expect(plan.ruleTakeOff).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual({
            kind: 'cart rules',
            count: 1,
            names: ['Bodea Spring'],
            why: 'they apply on a website a store not chosen also sells on',
        });
    });

    it('reads no rules as none on a store that does not answer the route', async () => {
        const plan = await planWipeFor(sandbox().get, TEST_STORE, PROJECT_RECORDS);

        expect(plan.ruleIds).toStrictEqual([]);
        expect(plan.preview.remove.cartRules.count).toBe(0);
    });

    it('stops a plan that would now take a rule the list did not hold', async () => {
        const shown = await planWipeFor(sandbox().get, TEST_STORE, PROJECT_RECORDS);
        const now = await planWipeFor(withRules().get, TEST_STORE, RECORDS);

        expect(withinPlan(shown, now)).toBe(false);
        expect(withinPlan(now, now)).toBe(true);
    });
});

describe('runWipe with cart rules', () => {
    it("deletes the rule with DELETE salesRules/{id}, and takes the other off with its whole body and the chosen website out", async () => {
        const store = withRules();
        const plan = await planWipeFor(store.get, TEST_STORE, RECORDS);

        const outcome = await runWipe(store, plan);

        const writes = writesOf(store.sent);
        expect(writes).toContainEqual({ method: 'DELETE', path: 'salesRules/101' });
        expect(writes).toContainEqual({ method: 'PUT', path: 'salesRules/102' });
        expect(store.sent.find((c) => c.path === 'salesRules/102')?.body).toEqual({ rule: { ...RULES[1], website_ids: [JUSTRITE_ID] } });
        expect(store.data.rules?.map((r) => r.rule_id)).toEqual([102, 103, 104, 105, 106]);
        expect(store.data.coupons?.map((c) => c.code)).toEqual(['ZZINSTALLED']);
        expect(outcome.removed).toMatchObject({ cartRules: 1, rulesTakenOff: 1 });
        expect(outcome.sentence).toContain('1 cart rule');
        expect(outcome.sentence).toContain('Took 1 cart rule other websites also use off the chosen websites.');
    });

    it('clears only what the list it was shown holds', async () => {
        const store = withRules();
        const shown = await planWipeFor(store.get, TEST_STORE, RECORDS);

        await clearShown(store, shown, RECORDS);

        expect(writesOf(store.sent).filter((w) => w.path.startsWith('salesRules/'))).toEqual([
            { method: 'DELETE', path: 'salesRules/101' },
            { method: 'PUT', path: 'salesRules/102' },
        ]);
    });
});
