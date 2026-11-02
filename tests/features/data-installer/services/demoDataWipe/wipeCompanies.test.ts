/**
 * Which companies a wipe removes: a company whose admin and customers are all on wholly chosen
 * websites goes, with those customers; one tied to anything else stays, is named, and keeps everyone
 * in it. The company, hierarchy and refused admin delete are the live run's (`COMPANY_28_DB08`,
 * `HIERARCHY_28_DB08`, `DELETE_COMPANY_ADMIN_REFUSED_DB08`).
 */

import { planWipeFor } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { CommerceOrder } from '@/types/commerceWire';
import { ADMIN_64, ADMIN_ON_BODEA, BUYER_65, BUYER_ON_BODEA, BUYER_ON_JUSTRITE, COMPANY_28, b2bInstance } from '../../../../helpers/commerceWipeInstanceFixtures';
import { sandbox } from './wipe.testUtils';

const TEST_STORE = [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }];
const NOTHING = { products: [], orders: [] };
const nameOfCompany = COMPANY_28.company_name;

const recordOf = (kind: string, id: string): InstallRecord => ({
    format: 1,
    pack: { name: 'zz-pack', version: '1' },
    engine: 'demo-builder',
    startedAt: '2026-10-30T10:00:00.000Z',
    target: { websiteCode: 'justrite', storeCode: 'justrite_us' },
    created: [{ kind, id }],
});

const orderIn = (customerId: number, storeId: number): CommerceOrder => ({ entity_id: 800, increment_id: '000000800', customer_id: customerId, store_id: storeId, state: 'closed', status: 'closed', items: [] });

describe('decideCompanies, through the plan', () => {
    it('removes a company whose admin and customers are all on the wholly chosen website, and those customers', async () => {
        const store = sandbox({ ...NOTHING, customers: [ADMIN_64, BUYER_65], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.companyIds).toEqual(['28']);
        expect(plan.customerIds.sort()).toEqual(['64', '65']);
        expect(plan.memberOf).toEqual({ 64: '28', 65: '28' });
        expect(plan.preview.remove.companies).toEqual({ count: 1, names: [nameOfCompany] });
        expect(plan.preview.left.filter((l) => l.kind === 'companies' || l.kind === 'customers')).toStrictEqual([]);
        expect(store.sent).toStrictEqual([]);
    });

    it('keeps a company with a customer on a website not chosen, names it, and keeps everyone in it', async () => {
        const store = sandbox({ ...NOTHING, customers: [ADMIN_64, BUYER_ON_JUSTRITE], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.companyIds).toStrictEqual([]);
        expect(plan.customerIds).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual({ kind: 'companies', count: 1, names: [nameOfCompany], why: 'a customer in them is on a website not chosen' });
        expect(plan.preview.left).toContainEqual({ kind: 'customers', count: 1, names: [ADMIN_64.email], why: 'they are in a company that stays' });
    });

    it('keeps a company whose customers are on a website only partly chosen', async () => {
        const store = sandbox({ ...NOTHING, customers: [ADMIN_ON_BODEA, BUYER_ON_BODEA], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, [{ websiteCode: 'bodea', storeCode: 'bodea_store' }], { records: [] });

        expect(plan.companyIds).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'companies', names: [nameOfCompany] }));
    });

    it('keeps a company with a customer who has an order in a store not chosen, reading where each ordered', async () => {
        // View 2 is JustRite US, a store not chosen.
        const store = sandbox({ products: [], orders: [orderIn(65, 2)], customers: [ADMIN_64, BUYER_65], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.companyIds).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'companies', names: [nameOfCompany], why: 'a customer in them has an order in a store not chosen' }));
        expect(store.reads.some((path) => path.startsWith('orders?') && path.includes('field]=customer_id') && decodeURIComponent(path).includes('64,65'))).toBe(true);
    });

    it('removes a company whose customers ordered only in the chosen stores', async () => {
        const store = sandbox({ products: [], orders: [orderIn(65, 6)], customers: [ADMIN_64, BUYER_65], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.companyIds).toEqual(['28']);
    });

    it('never touches a company an install record lists, on any website', async () => {
        const store = sandbox({ ...NOTHING, customers: [ADMIN_64, BUYER_65], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [], everyRecord: [recordOf('b2b_companies', '28')] });

        expect(plan.companyIds).toStrictEqual([]);
        expect(plan.customerIds).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'companies', names: [nameOfCompany], why: expect.stringContaining('Demo Builder installed') }));
    });

    it('keeps a company holding a customer an install record lists', async () => {
        const store = sandbox({ ...NOTHING, customers: [ADMIN_64, BUYER_65], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [], everyRecord: [recordOf('customers', '65')] });

        expect(plan.companyIds).toStrictEqual([]);
    });

    it('keeps a company whose hierarchy cannot be read, rather than delete what might be another demo\'s', async () => {
        const store = sandbox({ ...NOTHING, customers: [ADMIN_64, BUYER_65], instance: b2bInstance({ failing: [/^hierarchy\//u] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.companyIds).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'companies', why: 'who is in them could not be read' }));
    });

    it('keeps a company whose admin the read does not name', async () => {
        const instance = b2bInstance({ companies: [{ ...COMPANY_28, super_user_id: undefined }] });
        const store = sandbox({ ...NOTHING, customers: [ADMIN_64, BUYER_65], instance });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.companyIds).toStrictEqual([]);
    });
});
