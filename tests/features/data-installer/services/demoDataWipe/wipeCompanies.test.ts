/**
 * Which companies a wipe removes: a company whose admin and customers are all on the chosen
 * websites goes, with those customers; one tied to anything else is kept, listed without a reason,
 * and keeps everyone in it; a read that fails leaves every company alone. The company, hierarchy and refused admin delete are the live run's (`COMPANY_28_DB08`,
 * `HIERARCHY_28_DB08`, `DELETE_COMPANY_ADMIN_REFUSED_DB08`).
 */

import { planWipeFor } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { CommerceOrder } from '@/types/commerceWire';
import { ADMIN_64, BUYER_65, BUYER_ON_JUSTRITE, COMPANY_28, b2bInstance } from '../../../../helpers/commerceWipeInstanceFixtures';
import { sandbox } from './wipe.testUtils';

const TEST_STORE = ['justrite_test_website'];
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
        expect(plan.check.records.b2b_companies).toEqual({ removed: [nameOfCompany], kept: [] });
        expect(plan.check.records.customers.kept).toStrictEqual([]);
        expect(store.sent).toStrictEqual([]);
    });

    it('keeps a company with a customer on a website not chosen, names it, and keeps everyone in it', async () => {
        const store = sandbox({ ...NOTHING, customers: [ADMIN_64, BUYER_ON_JUSTRITE], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.companyIds).toStrictEqual([]);
        expect(plan.customerIds).toStrictEqual([]);
        expect(plan.check.records.b2b_companies).toEqual({ removed: [], kept: [nameOfCompany] });
        expect(plan.check.records.customers).toEqual({ removed: [], kept: [ADMIN_64.email] });
    });

    it('keeps a company with a customer who has an order in a store not chosen, reading where each ordered', async () => {
        // View 2 is JustRite US, a store not chosen.
        const store = sandbox({ products: [], orders: [orderIn(65, 2)], customers: [ADMIN_64, BUYER_65], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.companyIds).toStrictEqual([]);
        expect(plan.check.records.b2b_companies.kept).toEqual([nameOfCompany]);
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
        expect(plan.check.records.b2b_companies.kept).toEqual([nameOfCompany]);
    });

    it('keeps a company holding a customer an install record lists', async () => {
        const store = sandbox({ ...NOTHING, customers: [ADMIN_64, BUYER_65], instance: b2bInstance() });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [], everyRecord: [recordOf('customers', '65')] });

        expect(plan.companyIds).toStrictEqual([]);
    });

    it("leaves every company alone, marked not read, when a hierarchy cannot be read, rather than delete what might be another demo's", async () => {
        const store = sandbox({ ...NOTHING, customers: [ADMIN_64, BUYER_65], instance: b2bInstance({ failing: [/^hierarchy\//u] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.companyIds).toStrictEqual([]);
        expect(plan.customerIds).toStrictEqual([]);
        expect(plan.check.unread).toMatchObject({ b2b_companies: 'strange' });
    });

    it('leaves every company alone, marked not read, when the read does not name its admin', async () => {
        const instance = b2bInstance({ companies: [{ ...COMPANY_28, super_user_id: undefined }] });
        const store = sandbox({ ...NOTHING, customers: [ADMIN_64, BUYER_65], instance });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.companyIds).toStrictEqual([]);
        expect(plan.check.unread).toMatchObject({ b2b_companies: 'strange' });
    });

    it('decides nothing for a company Commerce does not have, keeping the customers who name it', async () => {
        const store = sandbox({ ...NOTHING, customers: [ADMIN_64, BUYER_65], instance: b2bInstance({ companies: [] }) });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.companyIds).toStrictEqual([]);
        expect(plan.check.records.customers.kept.sort()).toEqual([ADMIN_64.email, BUYER_65.email].sort());
        expect(plan.check.unread).toBeUndefined();
    });
});
