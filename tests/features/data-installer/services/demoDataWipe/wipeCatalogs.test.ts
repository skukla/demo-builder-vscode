/**
 * Which shared catalogs and customer groups a wipe removes: a catalog and its group are one unit
 * (live, 2026-10-30), and they go only when nobody who stays uses them, so nobody lands in General.
 */

import { planWipeFor } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { removeEmptyGroup } from '@/features/data-installer/services/demoDataWipe/wipeCatalogs';
import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceCustomer } from '@/types/commerceWire';
import { ADMIN_64, BUYER_65, CATALOG_20, COMPANY_28, GROUP_25, GROUP_30, LONE_SHOPPER, PUBLIC_CATALOG, STRANGER_IN_GROUP, b2bInstance } from '../../../../helpers/commerceWipeInstanceFixtures';
import { sandbox } from './wipe.testUtils';

const TEST_STORE = [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }];
const NOTHING = { products: [], orders: [] };
const GOING = [ADMIN_64, BUYER_65];

const recordOf = (kind: string, id: string): InstallRecord => ({ format: 1, pack: { name: 'zz', version: '1' }, engine: 'demo-builder', startedAt: '2026-10-30T10:00:00.000Z', created: [{ kind, id }] });
const ruleNaming = (groupIds: number[]): CommerceSalesRule => ({ rule_id: 9, name: 'JustRite Ten', website_ids: [2], customer_group_ids: groupIds } as CommerceSalesRule);

describe('decideCatalogs, through the plan', () => {
    it('takes a catalog and its group as one, with what the customers and company going need gone first', async () => {
        const store = sandbox({ ...NOTHING, customers: GOING, instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.groups).toEqual([
            { groupId: 25, groupName: GROUP_25.code, catalog: { id: 20, name: CATALOG_20.name }, needs: ['company:28', 'customer:64', 'customer:65'] },
        ]);
        expect(plan.preview.remove.catalogs).toEqual({ count: 1, names: [CATALOG_20.name] });
        expect(plan.preview.remove.customerGroups).toEqual({ count: 0, names: [] });
    });

    it('keeps the catalog and its group when a customer on another website is in the group, and names it', async () => {
        const store = sandbox({ ...NOTHING, customers: [...GOING, STRANGER_IN_GROUP], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.groups).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual({
            kind: 'shared catalogs',
            count: 1,
            names: [CATALOG_20.name],
            why: 'a customer, company or cart rule that stays uses them, and removing them would move those customers to General',
        });
    });

    it('keeps them when a company that stays is on the group', async () => {
        const other = { ...COMPANY_28, id: 99, company_name: 'Another Demo Co', super_user_id: 500 };
        const store = sandbox({ ...NOTHING, customers: GOING, instance: b2bInstance({ companies: [COMPANY_28, other] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.companyIds).toEqual(['28']);
        expect(plan.groups).toStrictEqual([]);
    });

    it('keeps them when a company in the wipe stays, since everyone in it stays too', async () => {
        const instance = b2bInstance({ failing: [/^hierarchy\//u] });
        const store = sandbox({ ...NOTHING, customers: GOING, instance });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.groups).toStrictEqual([]);
    });

    it('keeps them when a cart rule that stays names the group', async () => {
        const store = sandbox({ ...NOTHING, customers: GOING, rules: [ruleNaming([1, 25])], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.groups).toStrictEqual([]);
    });

    it('takes them when the cart rule naming the group goes in the same wipe', async () => {
        const rule = { ...ruleNaming([25]), website_ids: [5] };
        const store = sandbox({ ...NOTHING, customers: GOING, rules: [rule], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.ruleIds).toEqual(['9']);
        expect(plan.groups.map((g) => g.groupId)).toEqual([25]);
    });

    it.each([0, 1, 2, 3])("never takes Commerce's own group %i, and does not read who uses it", async (groupId) => {
        const shopper: CommerceCustomer = { ...LONE_SHOPPER, group_id: groupId };
        const store = sandbox({ ...NOTHING, customers: [shopper], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.customerIds).toEqual(['70']);
        expect(plan.groups).toStrictEqual([]);
        expect(store.reads.some((path) => path.includes('field]=group_id'))).toBe(false);
    });

    it('never takes the public catalog, whatever group it is on', async () => {
        const instance = b2bInstance({ catalogs: [{ ...PUBLIC_CATALOG, customer_group_id: 30 }] });
        const store = sandbox({ ...NOTHING, customers: [LONE_SHOPPER], instance });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.groups).toStrictEqual([]);
    });

    it('takes a group no catalog uses on its own, once its one customer is going', async () => {
        const store = sandbox({ ...NOTHING, customers: [LONE_SHOPPER], instance: b2bInstance({ companies: [], hierarchies: {} }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.groups).toEqual([{ groupId: 30, groupName: GROUP_30.code, needs: ['customer:70'] }]);
        expect(plan.preview.remove.customerGroups).toEqual({ count: 1, names: [GROUP_30.code] });
    });

    it('keeps a group a customer who stays is in, and names it as a customer group', async () => {
        const other: CommerceCustomer = { ...STRANGER_IN_GROUP, group_id: 30 };
        const store = sandbox({ ...NOTHING, customers: [LONE_SHOPPER, other], instance: b2bInstance({ companies: [], hierarchies: {} }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.groups).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'customer groups', names: [GROUP_30.code] }));
    });

    it.each([
        ['the catalog', 'b2b_shared_catalogs', '20'],
        ['the group', 'customer_groups', '25'],
        ["an assignment to the catalog", 'b2b_shared_catalog_products', '20/ZZ-SKU'],
    ])('never touches them when an install record of any website lists %s', async (_what, kind, id) => {
        const store = sandbox({ ...NOTHING, customers: GOING, instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [], everyRecord: [recordOf(kind, id)] });

        expect(plan.groups).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'shared catalogs', why: 'Demo Builder installed them, so removing that datapack decides' }));
    });

    it('keeps them, named, when who uses the group cannot be read', async () => {
        const store = sandbox({ ...NOTHING, customers: GOING, instance: b2bInstance({ failing: [/^company\?/u] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.groups).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'shared catalogs', why: 'who uses them could not be read' }));
    });

    it('keeps a group with no catalog, named by its id, when the group itself cannot be read', async () => {
        const store = sandbox({ ...NOTHING, customers: [LONE_SHOPPER], instance: b2bInstance({ companies: [], hierarchies: {}, failing: [/^customerGroups\/30/u] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.groups).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual({ kind: 'customer groups', count: 1, names: ['group 30'], why: 'who uses them could not be read' });
    });

    it('looks again at a group a clearing before this could not finish, under the same rules', async () => {
        const store = sandbox({ ...NOTHING, customers: [], instance: b2bInstance({ companies: [], hierarchies: {} }) });
        const unfinished = { scopeKey: 'x', groups: [25], sets: [], attributes: [] };

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [], unfinished });

        expect(plan.groups.map((g) => g.catalog?.id)).toEqual([20]);
    });

    it('reads no catalog at all when nobody going is in a group of its own', async () => {
        const store = sandbox({ ...NOTHING, customers: [], instance: b2bInstance() });

        await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(store.reads.some((path) => path.startsWith('sharedCatalog'))).toBe(false);
    });
});

describe('removeEmptyGroup', () => {
    const UNIT = { groupId: 25, groupName: GROUP_25.code, catalog: { id: 20, name: CATALOG_20.name }, needs: [] };

    it('deletes the catalog, then the group, and counts the group gone with it as gone', async () => {
        const store = sandbox({ customers: [], instance: b2bInstance({ companies: [] }) });

        await removeEmptyGroup(store, UNIT);

        expect(store.sent).toEqual([
            { method: 'DELETE', path: 'sharedCatalog/20' },
            { method: 'DELETE', path: 'customerGroups/25' },
        ]);
        expect(store.data.instance?.movedToGeneral).toStrictEqual([]);
    });

    it('writes nothing when a customer has joined the group since the plan, so nobody lands in General', async () => {
        const store = sandbox({ customers: [STRANGER_IN_GROUP], instance: b2bInstance({ companies: [] }) });

        await expect(removeEmptyGroup(store, UNIT)).rejects.toThrow('1 customers or companies are still in it, and removing it would move them to General');
        expect(store.sent).toStrictEqual([]);
    });

    it('writes nothing when a company is on the group now', async () => {
        const store = sandbox({ customers: [], instance: b2bInstance() });

        await expect(removeEmptyGroup(store, UNIT)).rejects.toThrow('still in it');
        expect(store.sent).toStrictEqual([]);
    });
});
