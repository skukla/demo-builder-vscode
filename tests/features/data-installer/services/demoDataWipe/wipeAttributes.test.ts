/**
 * Which attribute sets and attributes a wipe removes: only when nothing else on the instance uses
 * them. Beside each case that goes is the one that must stay; anything that cannot be proved stays.
 */

import { planWipeFor } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { removeEmptySet } from '@/features/data-installer/services/demoDataWipe/wipeAttributes';
import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { CommerceSalesRule } from '@/types/commerceSalesRule';
import { DEFAULT_SET_PRODUCT, JUSTRITE_CAN, JUSTRITE_WIPER, OWNED_PRODUCT, WIPER_1, WIPER_2, attributeInstance } from '../../../../helpers/commerceWipeInstanceFixtures';
import { sandbox } from './wipe.testUtils';

const TEST_STORE = [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }];
const NOTHING = { customers: [], orders: [] };
const ALL = [WIPER_1, WIPER_2];

const recordOf = (kind: string, id: string): InstallRecord => ({ format: 1, pack: { name: 'zz', version: '1' }, engine: 'demo-builder', startedAt: '2026-10-30T10:00:00.000Z', created: [{ kind, id }] });
const whyOf = (plan: Awaited<ReturnType<typeof planWipeFor>>, kind: string) => plan.preview.left.filter((l) => l.kind === kind);

describe('decideAttributes, through the plan', () => {
    it("removes a set only the products going use, and the user's attribute it holds, after those products", async () => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributeSets).toEqual([{ id: 40, name: 'Wipers', needs: ['product:ZZ-WIPER-1', 'product:ZZ-WIPER-2'] }]);
        expect(plan.attributes).toEqual([{ code: 'wiper_size', needs: ['set:40', 'product:ZZ-WIPER-1', 'product:ZZ-WIPER-2'] }]);
        expect(plan.preview.remove.attributeSets).toEqual({ count: 1, names: ['Wipers'] });
        expect(plan.preview.remove.attributes).toEqual({ count: 1, names: ['wiper_size'] });
    });

    it('keeps a set a product on another website is in, and the attribute that set holds, naming both', async () => {
        const store = sandbox({ ...NOTHING, products: [...ALL, JUSTRITE_WIPER], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributeSets).toStrictEqual([]);
        expect(plan.attributes).toStrictEqual([]);
        expect(whyOf(plan, 'attribute sets')).toEqual([{ kind: 'attribute sets', count: 1, names: ['Wipers'], why: 'products that stay are in them' }]);
        expect(whyOf(plan, 'attributes')).toEqual([{ kind: 'attributes', count: 1, names: ['wiper_size'], why: 'an attribute set that stays holds them' }]);
    });

    it('never removes the Default set or a system attribute, and does not report them', async () => {
        const store = sandbox({ ...NOTHING, products: [DEFAULT_SET_PRODUCT], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributeSets).toStrictEqual([]);
        expect(plan.preview.left.some((l) => l.names.includes('Default') || l.names.includes('description'))).toBe(false);
    });

    it('keeps an attribute the Default set holds, carried by a product going, and names it', async () => {
        const store = sandbox({ ...NOTHING, products: [DEFAULT_SET_PRODUCT], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributes).toStrictEqual([]);
        expect(whyOf(plan, 'attributes')).toEqual([{ kind: 'attributes', count: 1, names: ['cs_format'], why: 'an attribute set that stays holds them' }]);
    });

    it('never removes an attribute an ERP integration owns, and names it', async () => {
        const store = sandbox({ ...NOTHING, products: [OWNED_PRODUCT], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributes.map((a) => a.code)).toEqual(['wiper_size']);
        expect(whyOf(plan, 'attributes')).toEqual([{ kind: 'attributes', count: 3, names: ['erp_owner', 'brand', 'erp_sync_note'], why: 'an ERP integration owns them' }]);
    });

    it.each([
        ['the set', 'attribute_sets', '40', 'attribute sets', 'Wipers'],
        ["the attribute's place in the set", 'attribute_assign_to_set', '40/wiper_size', 'attribute sets', 'Wipers'],
    ])('never touches a set when an install record of any website lists %s', async (_what, kind, id, leftKind, name) => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [], everyRecord: [recordOf(kind, id)] });

        expect(plan.attributeSets).toStrictEqual([]);
        expect(whyOf(plan, leftKind)).toContainEqual(expect.objectContaining({ names: [name], why: 'Demo Builder installed them, so removing that datapack decides' }));
    });

    it.each([
        ['the attribute', 'product_attributes', 'wiper_size'],
        ['an option of it', 'attribute_options', 'wiper_size/77'],
    ])('never touches an attribute when an install record of any website lists %s', async (_what, kind, id) => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [], everyRecord: [recordOf(kind, id)] });

        expect(plan.attributes).toStrictEqual([]);
        expect(plan.attributeSets.map((s) => s.id)).toEqual([40]);
    });

    it('keeps an attribute a cart rule that stays tests, however deep', async () => {
        const rule = { rule_id: 9, name: 'Other demo', website_ids: [2], condition: { condition_type: 'all', conditions: [{ condition_type: 'found', conditions: [{ condition_type: 'product', attribute_name: 'wiper_size' }] }] } } as CommerceSalesRule;
        const store = sandbox({ ...NOTHING, products: ALL, rules: [rule], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributes).toStrictEqual([]);
        expect(whyOf(plan, 'attributes')).toEqual([{ kind: 'attributes', count: 1, names: ['wiper_size'], why: 'a cart rule that stays tests them' }]);
    });

    it('keeps an attribute a product elsewhere still carries, though no set that stays holds it', async () => {
        const stray = { ...JUSTRITE_CAN, attribute_set_id: 41, custom_attributes: [{ attribute_code: 'wiper_size', value: '9' }] };
        const store = sandbox({ ...NOTHING, products: [...ALL, stray], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributeSets.map((s) => s.id)).toEqual([40]);
        expect(plan.attributes).toStrictEqual([]);
        expect(whyOf(plan, 'attributes')).toEqual([{ kind: 'attributes', count: 1, names: ['wiper_size'], why: 'products that stay carry a value for them' }]);
    });

    it('asks who carries it by a notnull search on its code', async () => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance() });

        await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(store.reads.some((path) => path.startsWith('products?') && path.includes('[field]=wiper_size') && path.includes('[conditionType]=notnull'))).toBe(true);
    });

    it.each([
        ['who carries it', /conditionType\]=notnull/u],
        ['the attribute itself', /^products\/attributes\/wiper_size/u],
    ])("keeps the attribute, named, when %s can't be read", async (_what, failing) => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance({ failing: [failing] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributes).toStrictEqual([]);
        expect(whyOf(plan, 'attributes')).toEqual([{ kind: 'attributes', count: 1, names: ['wiper_size'], why: "Commerce would not say what uses them, so they can't be called unused" }]);
    });

    it('keeps every attribute when the sets holding them cannot be read', async () => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance({ failing: [/^products\/attribute-sets\/4\/attributes/u] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributes).toStrictEqual([]);
        expect(whyOf(plan, 'attributes')[0]).toMatchObject({ why: "Commerce would not say what uses them, so they can't be called unused" });
    });

    it('keeps the set, named, when the products in it cannot be read', async () => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance({ failing: [/field\]=attribute_set_id/u] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributeSets).toStrictEqual([]);
        expect(whyOf(plan, 'attribute sets')).toEqual([{ kind: 'attribute sets', count: 1, names: ['Wipers'], why: "which products are in them could not be read, so they can't be called unused" }]);
    });

    it('looks at no set when no product is going', async () => {
        const store = sandbox({ ...NOTHING, products: [JUSTRITE_WIPER], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributeSets).toStrictEqual([]);
        expect(store.reads.some((path) => path.startsWith('products/attribute-sets'))).toBe(false);
    });

    it('looks again at a set and attribute a clearing before this could not finish, under the same rules', async () => {
        const store = sandbox({ ...NOTHING, products: [], instance: attributeInstance() });
        const unfinished = { scopeKey: 'x', groups: [], sets: [40], attributes: ['wiper_size'] };

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [], unfinished });

        expect(plan.attributeSets.map((s) => s.id)).toEqual([40]);
        expect(plan.attributes.map((a) => a.code)).toEqual(['wiper_size']);
    });
});

describe('removeEmptySet', () => {
    it('deletes a set no product is in', async () => {
        const store = sandbox({ products: [], instance: attributeInstance() });

        await removeEmptySet(store, { id: 40, name: 'Wipers', needs: [] });

        expect(store.sent).toEqual([{ method: 'DELETE', path: 'products/attribute-sets/40' }]);
    });

    it('writes nothing while a product is in it: deleting the set would delete the product', async () => {
        const store = sandbox({ products: [JUSTRITE_WIPER], instance: attributeInstance() });

        await expect(removeEmptySet(store, { id: 40, name: 'Wipers', needs: [] })).rejects.toThrow('removing it would delete them');
        expect(store.sent).toStrictEqual([]);
    });
});
