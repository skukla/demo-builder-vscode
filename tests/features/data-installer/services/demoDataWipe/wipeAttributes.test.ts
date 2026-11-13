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
import { decideRemovals } from '@/features/data-installer/services/demoBuilderEngine/removers';

const TEST_STORE = ['justrite_test_website'];
const NOTHING = { customers: [], orders: [] };
const ALL = [WIPER_1, WIPER_2];

const recordOf = (kind: string, id: string): InstallRecord => ({ format: 1, pack: { name: 'zz', version: '1' }, engine: 'demo-builder', startedAt: '2026-10-30T10:00:00.000Z', created: [{ kind, id }] });
const keptOf = (plan: Awaited<ReturnType<typeof planWipeFor>>, type: string) => plan.check.records[type]?.kept ?? [];

describe('decideAttributes, through the plan', () => {
    it("removes a set only the products going use, and the user's attribute it holds, after those products", async () => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributeSets).toEqual([{ id: 40, name: 'Wipers', needs: ['product:ZZ-WIPER-1', 'product:ZZ-WIPER-2'] }]);
        expect(plan.attributes).toEqual([{ code: 'wiper_size', needs: ['set:40', 'product:ZZ-WIPER-1', 'product:ZZ-WIPER-2'] }]);
        expect(plan.check.records.attribute_sets).toEqual({ removed: ['Wipers'], kept: [] });
        expect(plan.check.records.product_attributes).toEqual({ removed: ['wiper_size'], kept: [] });
    });

    it('keeps a set a product on another website is in, and the attribute that set holds, listing both', async () => {
        const store = sandbox({ ...NOTHING, products: [...ALL, JUSTRITE_WIPER], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributeSets).toStrictEqual([]);
        expect(plan.attributes).toStrictEqual([]);
        expect(keptOf(plan, 'attribute_sets')).toEqual(['Wipers']);
        expect(keptOf(plan, 'product_attributes')).toEqual(['wiper_size']);
    });

    it('never removes the Default set or a system attribute, and does not list them', async () => {
        const store = sandbox({ ...NOTHING, products: [DEFAULT_SET_PRODUCT], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributeSets).toStrictEqual([]);
        const listed = Object.values(plan.check.records).flatMap((r) => [...r.removed, ...r.kept]);
        expect(listed.some((name) => name === 'Default' || name === 'description')).toBe(false);
    });

    it('keeps an attribute the Default set holds, carried by a product going, and lists it', async () => {
        const store = sandbox({ ...NOTHING, products: [DEFAULT_SET_PRODUCT], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributes).toStrictEqual([]);
        expect(keptOf(plan, 'product_attributes')).toEqual(['cs_format']);
    });

    it('never removes an attribute an ERP integration owns, and lists it', async () => {
        const store = sandbox({ ...NOTHING, products: [OWNED_PRODUCT], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributes.map((a) => a.code)).toEqual(['wiper_size']);
        expect(keptOf(plan, 'product_attributes')).toEqual(['erp_owner', 'brand', 'erp_sync_note']);
    });

    it.each([
        ['the set', 'attribute_sets', '40'],
        ["the attribute's place in the set", 'attribute_assign_to_set', '40/wiper_size'],
    ])('never touches a set when an install record of any website lists %s', async (_what, kind, id) => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [], everyRecord: [recordOf(kind, id)] });

        expect(plan.attributeSets).toStrictEqual([]);
        expect(keptOf(plan, 'attribute_sets')).toEqual(['Wipers']);
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
        expect(keptOf(plan, 'product_attributes')).toEqual(['wiper_size']);
    });

    it('keeps an attribute a product elsewhere still carries, though no set that stays holds it', async () => {
        const stray = { ...JUSTRITE_CAN, attribute_set_id: 41, custom_attributes: [{ attribute_code: 'wiper_size', value: '9' }] };
        const store = sandbox({ ...NOTHING, products: [...ALL, stray], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributeSets.map((s) => s.id)).toEqual([40]);
        expect(plan.attributes).toStrictEqual([]);
        expect(keptOf(plan, 'product_attributes')).toEqual(['wiper_size']);
    });

    it('asks who carries it by a notnull search on its code', async () => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance() });

        await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(store.reads.some((path) => path.startsWith('products?') && path.includes('[field]=wiper_size') && path.includes('[conditionType]=notnull'))).toBe(true);
    });

    it.each([
        ['who carries it', /conditionType\]=notnull/u],
        ['the attribute itself', /^products\/attributes\/wiper_size/u],
    ])("leaves every attribute alone, marked not read, when %s can't be read", async (_what, failing) => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance({ failing: [failing] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributes).toStrictEqual([]);
        expect(plan.attributeSets.map((s) => s.id)).toEqual([40]);
        expect(plan.check.unread).toEqual({ product_attributes: 'strange' });
    });

    it('leaves every attribute alone when the sets holding them cannot be read', async () => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance({ failing: [/^products\/attribute-sets\/4\/attributes/u] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributes).toStrictEqual([]);
        expect(plan.check.unread).toEqual({ product_attributes: 'strange' });
    });

    it('leaves every set, and so every attribute, alone when the products in a set cannot be read', async () => {
        const store = sandbox({ ...NOTHING, products: ALL, instance: attributeInstance({ failing: [/field\]=attribute_set_id/u] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.attributeSets).toStrictEqual([]);
        expect(plan.attributes).toStrictEqual([]);
        expect(plan.check.unread).toEqual({ attribute_sets: 'strange', product_attributes: 'strange' });
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

/**
 * C3 review (2026-11-13), two projects: project A's datapack made `wiper_size`; a product of another
 * demo, on JustRite's website, carries it. Clear's check (as if A's datapack were gone) keeps it, and
 * A's uninstall, which Clear runs first, keeps it too: the same read decides both (`carriersOf`).
 */
describe("an attribute another demo's product carries, the check and the removal agree", () => {
    const theirs = { ...JUSTRITE_CAN, sku: 'JR-CAN-2', custom_attributes: [{ attribute_code: 'wiper_size', value: '1' }] };

    it("is kept by Clear's check and by the datapack's removal", async () => {
        const store = sandbox({ ...NOTHING, products: [WIPER_1, theirs], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });
        const removal = await decideRemovals(store.get, [{ kind: 'products', id: 'ZZ-WIPER-1' }, { kind: 'product_attributes', id: 'wiper_size' }]);

        expect(keptOf(plan, 'product_attributes')).toContain('wiper_size');
        expect(removal.take).toEqual([{ kind: 'products', id: 'ZZ-WIPER-1' }]);
        expect(removal.kept.map((k) => k.object)).toEqual([{ kind: 'product_attributes', id: 'wiper_size' }]);
    });

    // Re-review item 3: the SC's own product on the cleared website carries it. The check removes it (that
    // product goes too); Clear's uninstall, told the products the wipe deletes, takes it as well.
    it("is removed by both when only the SC's own product on the cleared website carries it besides the pack's", async () => {
        const store = sandbox({ ...NOTHING, products: [WIPER_1, { ...DEFAULT_SET_PRODUCT, custom_attributes: [{ attribute_code: 'wiper_size', value: '1' }] }], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });
        const removal = await decideRemovals(store.get, [{ kind: 'products', id: 'ZZ-WIPER-1' }, { kind: 'product_attributes', id: 'wiper_size' }], { alsoLeaving: plan.deleteSkus });
        const plain = await decideRemovals(store.get, [{ kind: 'products', id: 'ZZ-WIPER-1' }, { kind: 'product_attributes', id: 'wiper_size' }]);

        expect(plan.attributes.map((a) => a.code)).toContain('wiper_size');
        expect(removal.kept).toStrictEqual([]);
        // Plain Uninstall, told nothing, still keeps it for the SC's product.
        expect(plain.kept.map((k) => k.object.id)).toEqual(['wiper_size']);
    });

    it('CONTROL: with nobody else carrying it, both take it', async () => {
        const store = sandbox({ ...NOTHING, products: [WIPER_1], instance: attributeInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });
        const removal = await decideRemovals(store.get, [{ kind: 'products', id: 'ZZ-WIPER-1' }, { kind: 'product_attributes', id: 'wiper_size' }]);

        expect(plan.attributes.map((a) => a.code)).toContain('wiper_size');
        expect(removal.kept).toStrictEqual([]);
    });
});
