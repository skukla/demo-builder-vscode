/**
 * A customer and B2B pack, whole (datapack-engine step 08): it installs in the store's order, the
 * record names every object by the pack's name for it with both hashes, and removal takes back
 * exactly what was made, newest first, leaving the record empty (rule 1: back to zero).
 *
 * The store is a small fake whose answers follow the writes, in the shapes of the captured bodies
 * (`commerceB2bFixtures.ts`); the searches and the write answers are not captured.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { installRecordPath, openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { installPack, removePack } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import type { CommerceCompany, CommerceCustomer } from '@/types/commerceWire';
import {
    BODEA_COMPANY_ROW,
    BODEA_CUSTOMER_ROWS,
    COMPANY_21,
    CUSTOMER_44,
    DELETE_COMPANY_ADMIN_REFUSED_DB08,
    PUT_CUSTOMER_COMPANY_ANSWER_DB08,
    TEST_PASSWORD,
} from '../../../../helpers/commerceB2bFixtures';
import { NOW, PACK, PROJECT, type SentCall, fakeContext, memoryFiles, page } from './demoBuilderEngine.testUtils';

const PACK_ITEMS = {
    customer_groups: [{ customer_group: { code: 'Platinum Buyer', tax_class_id: 3 } }],
    customers: [BODEA_CUSTOMER_ROWS[1]],
    b2b_shared_catalogs: [{ sharedCatalog: { name: 'Platinum Buyer', customer_group_id: 'Platinum Buyer', type: 0, store_id: 0, tax_class_id: 3 } }],
    b2b_companies: [BODEA_COMPANY_ROW],
    b2b_shared_catalog_company_assignments: [{ assignment: { shared_catalog_name: 'Platinum Buyer', companies: [{ company_name: 'Altura' }] } }],
};
const ADMIN = 'admin.altura@example.com';

/** A store that holds what was written to it. */
function liveStore() {
    const state = { groups: [] as Array<{ id: number; code: string }>, customers: [] as CommerceCustomer[], companies: [] as CommerceCompany[], catalogs: [{ id: 1, name: 'Default (General)', customer_group_id: 1, type: 1 }] as Array<Record<string, unknown>>, assigned: new Map<number, string[]>(), members: [] as number[] };
    const groupSearch = (field: string, code: string) => page('customerGroups/search', field === 'eq' ? filterBy('customer_group_code', code) : `&searchCriteria[filterGroups][0][filters][0][field]=customer_group_code&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(code)}`);
    const reads: Record<string, unknown> = {
        [groupSearch('eq', 'Platinum Buyer')]: () => ({ items: state.groups }),
        [groupSearch('lookup', 'Platinum Buyer')]: () => ({ items: state.groups }),
        [groupSearch('lookup', 'Default (General)')]: { items: [{ id: 1, code: 'Default (General)' }] },
        'customerGroups/1': { id: 1, code: 'Default (General)', tax_class_id: 3 },
        'customerGroups/31': () => state.groups[0] && { ...state.groups[0], tax_class_id: 3 },
        [page('customers/search', filterBy('email', ADMIN))]: () => ({ items: state.customers }),
        'customers/52': () => state.customers[0] ?? null,
        [page('company', filterBy('company_name', 'Altura'))]: () => ({ items: state.companies }),
        [page('company', filterBy('company_email', 'office.altura@example.com'))]: { items: [] },
        'company/30': () => state.companies[0] ?? null,
        [page('sharedCatalog')]: () => ({ items: state.catalogs }),
        'sharedCatalog/41': () => state.catalogs.find((c) => c.id === 41) ?? null,
        'sharedCatalog/41/companies': () => JSON.stringify(state.assigned.get(41) ?? []),
        'sharedCatalog/41/categories': [],
        'sharedCatalog/41/products': [],
        // Flat, the SC's members under the admin, as `GET hierarchy/28` answered live (`HIERARCHY_28_DB08`).
        'hierarchy/30': () => [...state.members.map((id) => ({ entity_id: id, entity_type: 'customer', structure_parent_id: 1 })), { entity_id: 52, entity_type: 'customer', structure_id: 1 }],
        [page('customers/search', filterBy('group_id', 31))]: () => ({ items: state.customers.filter((c) => c.group_id === 31) }),
        [page('company', filterBy('customer_group_id', 31))]: () => ({ items: state.companies.filter((c) => c.customer_group_id === 31) }),
    };
    const answer = (call: SentCall): unknown => {
        const body = call.body as Record<string, Record<string, unknown>>;
        if (call.method === 'POST' && call.path === 'customerGroups') return state.groups.push({ id: 31, code: String(body.group.code) }) && state.groups[0];
        if (call.method === 'POST' && call.path === 'customers') {
            state.customers.push({ ...CUSTOMER_44, ...(body.customer as unknown as CommerceCustomer), id: 52 });
            return state.customers[0];
        }
        if (call.method === 'POST' && call.path === 'sharedCatalog') return state.catalogs.push({ id: 41, ...body.sharedCatalog }) && 41;
        if (call.method === 'POST' && call.path === 'company') {
            state.companies.push({ ...COMPANY_21, ...(body.company as unknown as CommerceCompany), id: 30 });
            return state.companies[0];
        }
        if (call.path === 'sharedCatalog/41/assignCompanies') state.assigned.set(41, ['30']);
        if (call.path === 'sharedCatalog/41/unassignCompanies') state.assigned.set(41, []);
        if (call.method === 'DELETE' && call.path === 'company/30') state.companies = [];
        if (call.method === 'DELETE' && call.path === 'sharedCatalog/41') state.catalogs = state.catalogs.filter((c) => c.id !== 41);
        if (call.method === 'PUT' && call.path === 'customers/77/companies/30') {
            state.members.push(77);
            return PUT_CUSTOMER_COMPANY_ANSWER_DB08;
        }
        if (call.method === 'DELETE' && call.path === 'customers/52' && state.companies.length > 0) {
            throw new CommerceReadError(DELETE_COMPANY_ADMIN_REFUSED_DB08.message, DELETE_COMPANY_ADMIN_REFUSED_DB08.status);
        }
        if (call.method === 'DELETE' && call.path === 'customers/52') state.customers = [];
        if (call.method === 'DELETE' && call.path === 'customerGroups/31') state.groups = [];
        return true;
    };
    return { reads, answer, state };
}

async function installed() {
    const files = memoryFiles();
    const store = liveStore();
    const ctx = await fakeContext(store.reads, store.answer);
    const recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
    Object.assign(ctx, { recorder });
    ctx.session.websiteId = 3;
    ctx.session.storeId = 4;
    const seen: string[] = [];
    await installPack(ctx, PACK_ITEMS, (kind) => seen.push(kind));
    return { ctx, files, store, seen };
}

describe('a customer and B2B pack', () => {
    it('installs its kinds in the store\'s order and records each object by its key, hashed', async () => {
        const { ctx, files, seen } = await installed();

        expect(seen).toEqual(['customer_groups', 'customers', 'b2b_shared_catalogs', 'b2b_companies', 'b2b_shared_catalog_company_assignments']);
        expect(ctx.sent.map((c) => `${c.method} ${c.path}`)).toEqual([
            'POST customerGroups',
            'POST customers',
            'POST sharedCatalog',
            'POST company',
            'POST sharedCatalog/41/assignCompanies',
        ]);
        const record = await readInstallRecord(files, PROJECT, PACK);
        expect(record?.created.map((o) => [o.kind, o.id, o.key])).toEqual([
            ['customer_groups', '31', 'Platinum Buyer'],
            ['customers', '52', ADMIN],
            ['b2b_shared_catalogs', '41', 'Platinum Buyer'],
            ['b2b_companies', '30', 'Altura'],
            ['b2b_shared_catalog_company_assignments', '41/30', 'Platinum Buyer/Altura'],
        ]);
        expect(record?.created.every((o) => o.fingerprint !== undefined && o.wrote !== undefined)).toBe(true);
    });

    it('uses the customer the pack just made as the company admin, and never puts the password on the record', async () => {
        const { ctx, files } = await installed();

        expect((ctx.sent[3].body as { company: { super_user_id: number } }).company.super_user_id).toBe(52);
        expect([...files.data.values()].join('\n')).not.toContain(TEST_PASSWORD);
    });

    it('is taken back newest first, and the record goes: the store is as it was', async () => {
        const { ctx, files, store } = await installed();
        ctx.sent.length = 0;

        const result = await removePack(ctx, files, { projectPath: PROJECT, pack: PACK });

        expect(ctx.sent.map((c) => `${c.method} ${c.path}`)).toEqual([
            'POST sharedCatalog/41/unassignCompanies',
            'DELETE company/30',
            'DELETE sharedCatalog/41',
            'DELETE customers/52',
            'DELETE customerGroups/31',
        ]);
        expect(result).toEqual({ removed: 5, noRecord: false, kept: [] });
        expect(files.data.has(installRecordPath(PROJECT, PACK))).toBe(false);
        expect(store.state).toMatchObject({ groups: [], customers: [], companies: [], catalogs: [{ id: 1 }] });
    });

    // Live, 2026-10-30: the removal unassigned the company first (moving it and the SC's customer to
    // group 1), then Commerce refused to delete its admin, and the removal stopped half done.
    it("keeps a company holding the SC's customer whole, writing nothing, and takes it all once the customer is out", async () => {
        const { ctx, files, store } = await installed();
        await ctx.send('PUT', 'customers/77/companies/30', undefined);
        ctx.sent.length = 0;

        const kept = await removePack(ctx, files, { projectPath: PROJECT, pack: PACK });

        expect(ctx.sent).toStrictEqual([]);
        expect(kept.removed).toBe(0);
        expect((await readInstallRecord(files, PROJECT, PACK))?.created).toHaveLength(5);

        store.state.members = [];
        const emptied = await removePack(ctx, files, { projectPath: PROJECT, pack: PACK });

        expect(ctx.sent.map((c) => `${c.method} ${c.path}`)).toEqual([
            'POST sharedCatalog/41/unassignCompanies',
            'DELETE company/30',
            'DELETE sharedCatalog/41',
            'DELETE customers/52',
            'DELETE customerGroups/31',
        ]);
        expect(emptied.kept).toStrictEqual([]);
        expect(files.data.has(installRecordPath(PROJECT, PACK))).toBe(false);
    });

    it('installing again changes nothing the SC left as it was', async () => {
        const { ctx } = await installed();
        ctx.sent.length = 0;

        const outcome = await installPack(ctx, PACK_ITEMS);

        expect(ctx.sent).toStrictEqual([]);
        expect(outcome).toEqual({ kept: [], containers: [], skipped: [] });
    });

    it("keeps a company the SC changed in the Admin, and brings in the pack's change to one left as it was", async () => {
        const { ctx, store } = await installed();
        ctx.sent.length = 0;
        store.state.companies[0] = { ...store.state.companies[0], city: 'Edited In Admin' };
        const changedGroup = { customer_group: { code: 'Platinum Buyer', tax_class_id: 5 } };

        const outcome = await installPack(ctx, { ...PACK_ITEMS, customer_groups: [changedGroup] });

        expect(outcome.kept).toEqual([{ kind: 'b2b_companies', key: 'Altura' }]);
        expect(ctx.sent).toEqual([{ method: 'PUT', path: 'customerGroups/31', body: { group: { id: 31, code: 'Platinum Buyer', tax_class_id: 5 } } }]);
    });
});
