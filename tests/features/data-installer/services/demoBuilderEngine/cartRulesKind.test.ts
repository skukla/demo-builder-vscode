/**
 * The `cart_rules` kind (datapack-engine step 11): make the rules the store lacks on the install
 * target's website, with this store's group, category and set ids in them; leave the ones it has;
 * record what was made by the rule's name; take back exactly that.
 *
 * Pack rows are Health & Beauty, Carvello and wknd `main`'s (`commerceSalesRuleFixtures.ts`). The
 * rule searches' page shape is the one captured empty on 2026-10-30; the items in them are built
 * here, typed to `RuleInterface`.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import {
    CART_RULE_KIND,
    installCartRules,
    parseCartRuleRows,
    removeCartRule,
    rulePackForm,
    updateCartRule,
} from '@/features/data-installer/services/demoBuilderEngine/cartRulesKind';
import { ownedKey } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import { productLookups } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import type { CommerceSalesRule } from '@/types/commerceSalesRule';
import { BEAUTY_PURCHASE, FRIENDS_AND_FAMILY, MILE_SERVICE, NO_RULES_PAGE, WIPER_FLUID } from '../../../../helpers/commerceSalesRuleFixtures';
import { by, fakeContext, page } from './demoBuilderEngine.testUtils';

const ruleSearch = (name: string) => page('salesRules/search', filterBy('name', name));
const group = (code: string, id: number) => ({ [page('customerGroups/search', by('customer_group_code', code))]: { items: [{ id, code }], total_count: 1 } });
const category = (urlKey: string, id: number) => ({ [page('categories/list', by('url_key', urlKey))]: { items: [{ id, path: `1/2/${id}` }], total_count: 1 } });
const TARGET_WEBSITE = 5;

async function storeWith(reads: Record<string, unknown>, answer: unknown = { rule_id: 41 }) {
    const ctx = await fakeContext(reads, () => answer);
    ctx.session.websiteId = TARGET_WEBSITE;
    return ctx;
}

describe('cart_rules install', () => {
    it("makes a rule the store lacks on the install target's website, with this store's ids, and records it by its name", async () => {
        const reads = { [ruleSearch(BEAUTY_PURCHASE.rule.name)]: NO_RULES_PAGE, ...group('VIP', 7), ...category('skincare', 41), ...category('beauty', 42), ...category('hair-care', 43) };
        const ctx = await storeWith(reads);

        await installCartRules(ctx, parseCartRuleRows([BEAUTY_PURCHASE]));

        const { times_used: _used, website_ids: _sites, customer_group_ids: _groups, action_condition: _action, ...rest } = BEAUTY_PURCHASE.rule;
        expect(ctx.sent).toEqual([
            {
                method: 'POST',
                path: 'salesRules',
                body: {
                    rule: {
                        ...rest,
                        website_ids: [TARGET_WEBSITE],
                        customer_group_ids: [7],
                        action_condition: {
                            ...BEAUTY_PURCHASE.rule.action_condition,
                            conditions: [{ condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product', operator: '==', attribute_name: 'category_ids', value: '41,42,43' }],
                        },
                    },
                },
            },
        ]);
        expect(ctx.recorder.created).toEqual([{ kind: CART_RULE_KIND, id: '41', key: BEAUTY_PURCHASE.rule.name }]);
    });

    it('turns an attribute set named inside a subselect into its id, and leaves a SKU as it is', async () => {
        const groups = { ...group('Guest', 0), ...group('Default (General)', 1), ...group('Wholesale', 2), ...group('Retailer', 3) };
        const ctx = await storeWith({ [ruleSearch(WIPER_FLUID.rule.name)]: NO_RULES_PAGE, ...groups });
        ctx.session.setIds.set('Wipers', 14);

        await installCartRules(ctx, parseCartRuleRows([WIPER_FLUID]));

        const rule = (ctx.sent[0].body as { rule: CommerceSalesRule }).rule;
        expect(rule.customer_group_ids).toEqual([0, 1, 2, 3]);
        expect(rule.condition?.conditions?.[0].conditions?.[0]).toEqual({ condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product', operator: '==', attribute_name: 'attribute_set_id', value: '14' });
        expect(rule.condition?.conditions?.[0].attribute_name).toBe('qty');
        expect(rule.action_condition?.conditions?.[0].value).toBe('53081');
    });

    it('sends a customer segment condition as it is, and says so in Debug Logs', async () => {
        const groups = { ...group('Guest', 0), ...group('Default (General)', 1), ...group('Wholesale', 2), ...group('Retailer', 3) };
        const ctx = await storeWith({ [ruleSearch(MILE_SERVICE.rule.name)]: NO_RULES_PAGE, ...groups });

        await installCartRules(ctx, parseCartRuleRows([MILE_SERVICE]));

        expect((ctx.sent[0].body as { rule: CommerceSalesRule }).rule.condition).toEqual(MILE_SERVICE.rule.condition);
        expect(ctx.logged.join('\n')).toContain('names a customer segment');
    });

    it('leaves a rule the store already has by that exact name, and does not record it', async () => {
        const found = { items: [{ rule_id: 9, name: FRIENDS_AND_FAMILY.rule.name }], total_count: 1 };
        const ctx = await storeWith({ [ruleSearch(FRIENDS_AND_FAMILY.rule.name)]: found });

        await installCartRules(ctx, parseCartRuleRows([FRIENDS_AND_FAMILY]));

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.recorder.created).toStrictEqual([]);
    });

    it('does not take a rule whose name only resembles the one asked for that one', async () => {
        const near = { items: [{ rule_id: 9, name: `${FRIENDS_AND_FAMILY.rule.name} (old)` }], total_count: 1 };
        const ctx = await storeWith({ [ruleSearch(FRIENDS_AND_FAMILY.rule.name)]: near, ...group('VIP', 7) });

        await installCartRules(ctx, parseCartRuleRows([FRIENDS_AND_FAMILY]));

        expect(ctx.sent.map((c) => c.path)).toEqual(['salesRules']);
    });

    it('leaves deleted a rule this engine made and the SC deleted since', async () => {
        const ctx = await storeWith({});
        ctx.session.owned = new Map([[ownedKey(CART_RULE_KIND, FRIENDS_AND_FAMILY.rule.name), null]]);

        await installCartRules(ctx, parseCartRuleRows([FRIENDS_AND_FAMILY]));

        expect(ctx.sent).toStrictEqual([]);
    });

    it('stops before writing when the install target names no website', async () => {
        const ctx = await fakeContext({});

        await expect(installCartRules(ctx, parseCartRuleRows([FRIENDS_AND_FAMILY]))).rejects.toThrow('names no website');
        expect(ctx.sent).toStrictEqual([]);
    });

    it("stops when Commerce does not answer the new rule's id", async () => {
        const ctx = await storeWith({ [ruleSearch(FRIENDS_AND_FAMILY.rule.name)]: NO_RULES_PAGE, ...group('VIP', 7) }, {});

        await expect(installCartRules(ctx, parseCartRuleRows([FRIENDS_AND_FAMILY]))).rejects.toThrow("did not answer the new cart rule");
    });

    it('refuses a pack row with no name before anything is sent', () => {
        expect(() => parseCartRuleRows([{ rule: { description: 'x' } }])).toThrow("The pack's cart rules are not in the shape Commerce takes");
    });
});

describe('cart_rules update and removal', () => {
    it("brings a rule this engine made up to the pack's row with PUT salesRules/{id}", async () => {
        const ctx = await storeWith(group('VIP', 7));

        await updateCartRule(ctx, '41', { rule: { ...FRIENDS_AND_FAMILY.rule, discount_amount: 25 } });

        expect(ctx.sent).toHaveLength(1);
        expect(ctx.sent[0].method).toBe('PUT');
        expect(ctx.sent[0].path).toBe('salesRules/41');
        expect((ctx.sent[0].body as { rule: CommerceSalesRule }).rule).toMatchObject({ rule_id: 41, discount_amount: 25, website_ids: [TARGET_WEBSITE], customer_group_ids: [7] });
    });

    it('takes a rule back with DELETE salesRules/{id}, counting already gone as done', async () => {
        const sent: string[] = [];
        await removeCartRule(async (method, path) => void sent.push(`${method} ${path}`), '41');
        await removeCartRule(async () => {
            throw new CommerceReadError('Commerce answered 404', 404);
        }, '41');

        expect(sent).toEqual(['DELETE salesRules/41']);
    });
});

describe('cart_rules pack form', () => {
    it("turns this store's ids back into names and leaves out what only this store means", async () => {
        const ctx = await fakeContext({
            'customerGroups/7': { id: 7, code: 'VIP' },
            'categories/41': { id: 41, name: 'Skincare', custom_attributes: [{ attribute_code: 'url_key', value: 'skincare' }] },
        });
        const stored: CommerceSalesRule = {
            ...(BEAUTY_PURCHASE.rule as CommerceSalesRule),
            rule_id: 41,
            website_ids: [5],
            customer_group_ids: [7],
            times_used: 3,
            action_condition: {
                condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product\\Combine',
                conditions: [{ condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product', operator: '==', attribute_name: 'category_ids', value: '41' }],
                aggregator_type: 'any',
                operator: null,
                value: '1',
            },
        };

        const { rule } = await rulePackForm(productLookups(ctx), stored);

        expect(rule).not.toHaveProperty('rule_id');
        expect(rule).not.toHaveProperty('times_used');
        expect(rule).not.toHaveProperty('website_ids');
        expect(rule.customer_group_ids).toEqual(['VIP']);
        expect(rule.action_condition?.conditions?.[0].value).toBe('skincare');
        expect(rule.name).toBe(BEAUTY_PURCHASE.rule.name);
    });

    it('keeps a group id it cannot name, as the export keeps it', async () => {
        const ctx = await fakeContext({});

        const { rule } = await rulePackForm(productLookups(ctx), { name: 'x', customer_group_ids: [99] });

        expect(rule.customer_group_ids).toEqual([99]);
    });
});
