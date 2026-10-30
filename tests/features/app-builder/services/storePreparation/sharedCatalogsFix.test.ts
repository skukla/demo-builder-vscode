/**
 * sharedCatalogsFix — a custom shared catalog per company without one of its own (AB-77).
 * Asserted on the Commerce fake: which companies get one (the check's own rule), the POST
 * bodies, the record, and the undo's unassign-then-delete.
 */

import { CATALOGS, COMPANIES, commerceFake } from '../../../../helpers/commercePreparationFixtures';
import { companiesNeedingCatalogs, sharedCatalogsFix } from '@/features/app-builder/services/storePreparation/sharedCatalogsFix';
import type { CommerceCustomer, CommerceSharedCatalog } from '@/types/commerceWire';

const GROUP_6_CUSTOMERS =
    'customers/search?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100' +
    '&searchCriteria[filterGroups][0][filters][0][field]=group_id&searchCriteria[filterGroups][0][filters][0][value]=6' +
    '&searchCriteria[filterGroups][0][filters][0][conditionType]=eq';

const DEPS = { websiteCode: 'acme', erpNames: [] };

/**
 * What catalog 9 lists, in the shapes read live on 2026-10-29 (scratch-1028's store, catalog 16,
 * `run_commerce_rest`, read-only): `GET sharedCatalog/{id}/companies` answered the string
 * `["23"]` (a JSON-encoded list of ids inside a JSON string, as Magento's
 * `CompanyManagementInterface::getCompanies` declares), `/categories` a list of numbers
 * (`[119,135,…]`), `/products` a list of SKU strings (`["51BSCA-BLBK",…]`).
 */
interface Lists {
    companies?: unknown;
    products?: unknown;
    categories?: unknown;
    /** `GET sharedCatalog/9`: its name now, and the group it uses. */
    catalog?: CommerceSharedCatalog;
    /** Who is in that group (`GET customers/search`, `group_id` eq). */
    groupCustomers?: unknown;
}

/** Harbor's own customer: in group 6 because the fix put Harbor in the catalog. */
const HARBOR_BUYER: CommerceCustomer = { id: 30, email: 'buyer@example.com', firstname: 'Test', lastname: 'Buyer', group_id: 6, extension_attributes: { company_attributes: { company_id: 3 } } };

function store(nextId = 9, lists: Lists = {}, catalogs = CATALOGS) {
    return commerceFake(
        {
            'sharedCatalog/9/companies': lists.companies ?? '["3"]',
            'sharedCatalog/9/products': lists.products ?? [],
            'sharedCatalog/9/categories': lists.categories ?? [],
            'sharedCatalog/9': lists.catalog ?? { id: 9, name: 'Harbor Catalog', customer_group_id: 6, type: 0 },
            [GROUP_6_CUSTOMERS]: lists.groupCustomers ?? { items: [HARBOR_BUYER] },
            'company/': COMPANIES,
            'sharedCatalog/': catalogs,
        },
        (_m, path) => (path === 'sharedCatalog' ? nextId : null),
    );
}

/** The catalog list once the fix made catalog 9. */
const WITH_HARBOR = { items: [...(CATALOGS.items ?? []), { id: 9, name: 'Harbor Catalog', customer_group_id: 6, type: 0 }] };
const RECORDED = { id: 9, name: 'Harbor Catalog', companyId: 3, companyName: 'Harbor', held: { companies: [3], products: [], categories: [] } };

describe('companiesNeedingCatalogs', () => {
    it('is the companies in no catalog, and all but the first of those sharing a custom one; public is fine', () => {
        const needing = companiesNeedingCatalogs(
            [...(COMPANIES.items ?? []), { id: 4, company_name: 'Orphan', customer_group_id: 9 }],
            CATALOGS.items ?? [],
        );
        expect(needing.map((c) => c.company_name)).toEqual(['Harbor', 'Orphan']);
    });
});

describe('preview', () => {
    it('names the catalog each company would get', async () => {
        expect(await sharedCatalogsFix.preview({ commerce: store(), ...DEPS })).toEqual({
            changes: ['Create the shared catalog Harbor Catalog and assign Harbor to it'],
        });
    });
});

describe('apply', () => {
    it('POSTs a custom catalog, assigns the company to it, and records both', async () => {
        const commerce = store(9);
        const applied = await sharedCatalogsFix.apply({ commerce, ...DEPS });
        expect(commerce.writes()).toEqual([
            ['POST', 'sharedCatalog', { sharedCatalog: { name: 'Harbor Catalog', type: 0, store_id: 0, tax_class_id: 3 } }],
            ['POST', 'sharedCatalog/9/assignCompanies', { companies: [{ id: 3 }] }],
        ]);
        expect(applied).toEqual({
            changes: ['Created the shared catalog Harbor Catalog and assigned Harbor to it'],
            rejected: [],
            // What the catalog held once made, read back, so the undo can tell what was added since.
            record: { kind: 'shared-catalogs', catalogs: [RECORDED] },
        });
    });

    it('records what Commerce put in the new catalog of its own accord, so the undo does not count it as added since', async () => {
        const commerce = store(9, { categories: [2] });
        const applied = await sharedCatalogsFix.apply({ commerce, ...DEPS });
        expect(applied.record).toEqual({ kind: 'shared-catalogs', catalogs: [{ ...RECORDED, held: { companies: [3], products: [], categories: [2] } }] });
    });

    it('a refused create is named and nothing is recorded for it', async () => {
        const commerce = store();
        commerce.send.mockImplementation(async () => {
            throw new Error('Commerce answered 400 for sharedCatalog: no');
        });
        const applied = await sharedCatalogsFix.apply({ commerce, ...DEPS });
        expect(applied.rejected).toEqual(['Create the shared catalog Harbor Catalog: Commerce answered 400 for sharedCatalog: no']);
        expect(applied.record).toBeUndefined();
    });
});

describe('undo', () => {
    it('unassigns the company and deletes a catalog still holding only what the fix left', async () => {
        const commerce = store(9, {}, WITH_HARBOR);
        const undone = await sharedCatalogsFix.undo({ commerce, ...DEPS }, { kind: 'shared-catalogs', catalogs: [RECORDED] });
        expect(commerce.writes()).toEqual([
            ['POST', 'sharedCatalog/9/unassignCompanies', { companies: [{ id: 3 }] }],
            ['DELETE', 'sharedCatalog/9', undefined],
        ]);
        expect(undone).toEqual({ changes: ['Deleted the shared catalog Harbor Catalog; Harbor is back on the public catalog'], rejected: [] });
    });

    // Step 06 (AB-83, owner 2026-10-27): a catalog holding anything the fix did not put there is
    // kept, with the company still unassigned from it.
    it('keeps a catalog holding products, categories or companies the fix did not put there, still unassigning the company', async () => {
        const commerce = store(9, { companies: '["3","4"]', products: ['RACK-1', 'RACK-2'], categories: [12] }, WITH_HARBOR);
        const undone = await sharedCatalogsFix.undo({ commerce, ...DEPS }, { kind: 'shared-catalogs', catalogs: [RECORDED] });
        expect(commerce.writes()).toEqual([['POST', 'sharedCatalog/9/unassignCompanies', { companies: [{ id: 3 }] }]]);
        expect(undone).toEqual({
            changes: ['Took Harbor out of the shared catalog Harbor Catalog; Harbor is back on the public catalog'],
            rejected: [],
            kept: 'Kept the shared catalog Harbor Catalog: it holds 2 products, 1 category and 1 company Demo Builder did not put there.',
            // Owner 2026-10-29, as step 05's container rule: the kept catalog stays recorded, so a
            // later undo takes it once it is empty (rule 1).
            remaining: { kind: 'shared-catalogs', catalogs: [RECORDED] },
        });
    });

    it('deletes a kept catalog on a later undo, once what was added is gone', async () => {
        // The first undo took Harbor out; the SC has since emptied the catalog.
        const commerce = store(9, { companies: '[]' }, WITH_HARBOR);
        const undone = await sharedCatalogsFix.undo({ commerce, ...DEPS }, { kind: 'shared-catalogs', catalogs: [RECORDED] });
        expect(commerce.writes()).toEqual([['DELETE', 'sharedCatalog/9', undefined]]);
        expect(undone).toEqual({ changes: ['Deleted the shared catalog Harbor Catalog'], rejected: [] });
    });

    it('reads a record written before what the catalog held was kept as holding only its company', async () => {
        const commerce = store(9, { categories: [2] }, WITH_HARBOR);
        const { held: _held, ...old } = RECORDED;
        const undone = await sharedCatalogsFix.undo({ commerce, ...DEPS }, { kind: 'shared-catalogs', catalogs: [old] });
        expect(commerce.writes().map(([m, p]) => `${m} ${p}`)).toEqual(['POST sharedCatalog/9/unassignCompanies']);
        expect(undone.kept).toBe('Kept the shared catalog Harbor Catalog: it holds 1 category Demo Builder did not put there.');
    });

    it('leaves the company where it is when it is no longer in the catalog, and deletes the empty catalog', async () => {
        const commerce = store(9, { companies: '[]' }, WITH_HARBOR);
        const undone = await sharedCatalogsFix.undo({ commerce, ...DEPS }, { kind: 'shared-catalogs', catalogs: [RECORDED] });
        expect(commerce.writes()).toEqual([['DELETE', 'sharedCatalog/9', undefined]]);
        expect(undone.changes).toEqual(['Deleted the shared catalog Harbor Catalog']);
    });

    it('writes nothing for a catalog already deleted', async () => {
        const commerce = store(9);
        const undone = await sharedCatalogsFix.undo({ commerce, ...DEPS }, { kind: 'shared-catalogs', catalogs: [RECORDED] });
        expect(commerce.send).not.toHaveBeenCalled();
        expect(undone).toEqual({ changes: [], rejected: [] });
    });

    /*
     * Live, 2026-10-30 (scratch-1028, the datapack engine's removal): deleting a shared catalog
     * deletes its customer group too, moving the group's customers to General. A customer the SC
     * put in the group would change group without a word.
     */
    it("keeps a catalog whose customer group holds customers the fix did not put there, still unassigning the company", async () => {
        const theirs: CommerceCustomer[] = [
            { id: 31, email: 'one@example.com', firstname: 'A', lastname: 'B', group_id: 6, extension_attributes: { company_attributes: { company_id: 0 } } },
            { id: 32, email: 'two@example.com', firstname: 'C', lastname: 'D', group_id: 6 },
        ];
        const commerce = store(9, { groupCustomers: { items: [HARBOR_BUYER, ...theirs] } }, WITH_HARBOR);
        const undone = await sharedCatalogsFix.undo({ commerce, ...DEPS }, { kind: 'shared-catalogs', catalogs: [RECORDED] });
        expect(commerce.writes()).toEqual([['POST', 'sharedCatalog/9/unassignCompanies', { companies: [{ id: 3 }] }]]);
        expect(undone).toEqual({
            changes: ['Took Harbor out of the shared catalog Harbor Catalog; Harbor is back on the public catalog'],
            rejected: [],
            kept: 'Kept the shared catalog Harbor Catalog: its customer group holds 2 customers Demo Builder did not put there.',
            remaining: { kind: 'shared-catalogs', catalogs: [RECORDED] },
        });
    });

    it('reads the group from the catalog itself, and who is in it, before writing anything', async () => {
        const commerce = store(9, {}, WITH_HARBOR);
        await sharedCatalogsFix.undo({ commerce, ...DEPS }, { kind: 'shared-catalogs', catalogs: [RECORDED] });
        expect(commerce.get).toHaveBeenCalledWith('sharedCatalog/9');
        expect(commerce.get).toHaveBeenCalledWith(GROUP_6_CUSTOMERS);
        const lastRead = Math.max(...commerce.get.mock.invocationCallOrder);
        expect(Math.min(...commerce.send.mock.invocationCallOrder)).toBeGreaterThan(lastRead);
    });

    it('writes nothing when who is in the group cannot be read', async () => {
        const commerce = store(9, { groupCustomers: () => Promise.reject(new Error('Commerce answered 503')) }, WITH_HARBOR);
        const undone = await sharedCatalogsFix.undo({ commerce, ...DEPS }, { kind: 'shared-catalogs', catalogs: [RECORDED] });
        expect(commerce.send).not.toHaveBeenCalled();
        expect(undone.rejected).toEqual(['Undo the shared catalog Harbor Catalog: Commerce answered 503']);
    });

    it('names a kept catalog as the store calls it now', async () => {
        const renamed: CommerceSharedCatalog = { id: 9, name: 'Harbor Contract Prices', customer_group_id: 6, type: 0 };
        const commerce = store(9, { products: ['RACK-1'], catalog: renamed }, WITH_HARBOR);
        const undone = await sharedCatalogsFix.undo({ commerce, ...DEPS }, { kind: 'shared-catalogs', catalogs: [RECORDED] });
        expect(undone.kept).toBe('Kept the shared catalog Harbor Contract Prices: it holds 1 product Demo Builder did not put there.');
    });

    it('deletes nothing, and names why, when a list comes back in a shape it does not read', async () => {
        const commerce = store(9, { products: { items: 'unexpected' } }, WITH_HARBOR);
        const undone = await sharedCatalogsFix.undo({ commerce, ...DEPS }, { kind: 'shared-catalogs', catalogs: [RECORDED] });
        expect(commerce.send).not.toHaveBeenCalled();
        expect(undone.rejected).toEqual(["Undo the shared catalog Harbor Catalog: Commerce answered the catalog's products in a shape Demo Builder does not read."]);
    });
});
