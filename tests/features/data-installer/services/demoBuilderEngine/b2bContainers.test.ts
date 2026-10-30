/**
 * The container rule for the customer and B2B kinds (datapack-engine step 08, owner 2026-10-29
 * as step 05's): a company, shared catalog or customer group this engine made is kept while it
 * holds something the engine did not make or is not taking out in the same removal, and says so
 * in one line. The whole-pack removal, a reinstall and the preview all decide through
 * `decideRemovals`, so these go through it too.
 *
 * Captured live 2026-10-30 (scratch-1028, step 08's live test): `GET hierarchy/27`, what catalog 19
 * held, `GET company/27`, and the group renamed by its catalog (`commerceB2bFixtures.ts`). Not
 * captured: `GET sharedCatalog/{id}` (typed to the list item, which is), the customer and company
 * searches.
 */

import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { containersLine, decideRemovals, keptObjects } from '@/features/data-installer/services/demoBuilderEngine/removers';
import { fakeContext, page } from './demoBuilderEngine.testUtils';
import {
    CATALOG_19_CATEGORIES_DB08,
    CATALOG_19_COMPANIES_DB08,
    CATALOG_19_PRODUCTS_DB08,
    COMPANY_27_DB08,
    GROUP_24_AFTER_CATALOG_DB08,
    HIERARCHY_27_DB08,
} from '../../../../helpers/commerceB2bFixtures';

const obj = (kind: string, id: string, extra: Partial<CreatedObject> = {}): CreatedObject => ({ kind, id, ...extra });
const CATALOGS = page('sharedCatalog');

describe('a company the pack made', () => {
    const COMPANY = obj('b2b_companies', '30', { key: 'Altura', previous: { superUserId: 52 } });

    it('is taken out when it holds only its own admin and customers being taken out with it', async () => {
        const ctx = await fakeContext({ 'hierarchy/30': [{ entity_id: 52, entity_type: 'customer', children: [{ entity_id: 53, entity_type: 'customer' }] }] });

        const { take, kept } = await decideRemovals(ctx.get, [COMPANY, obj('customers', '53'), obj('customers', '52')]);

        expect(kept).toStrictEqual([]);
        expect(take).toHaveLength(3);
    });

    it('is kept while it holds a customer the pack did not make, and says so', async () => {
        const ctx = await fakeContext({
            'hierarchy/30': [{ entity_id: 52, entity_type: 'customer', children: [{ entity_id: 77, entity_type: 'customer' }] }],
            'company/30': { company_name: 'Altura' },
        });

        const { take, kept } = await decideRemovals(ctx.get, [COMPANY, obj('customers', '52')]);

        expect(take).toEqual([obj('customers', '52')]);
        expect(containersLine(kept)).toBe('Kept the company Altura: it holds 1 customer you added.');
    });

    it('is named as the store calls it now, not by the name it was installed under', async () => {
        const renamed = obj('b2b_companies', '27', { key: 'An Old Name', previous: { superUserId: 61 } });
        const ctx = await fakeContext({
            'hierarchy/27': [...HIERARCHY_27_DB08, { structure_id: 33, entity_id: 99, entity_type: 'customer', structure_parent_id: 32 }],
            'company/27': COMPANY_27_DB08,
        });

        const { kept } = await decideRemovals(ctx.get, [renamed]);

        expect(containersLine(kept)).toBe('Kept the company ZZ Test Company DB08: it holds 1 customer you added.');
    });

    it('is taken out holding only its admin, read as Commerce answered it live', async () => {
        const ctx = await fakeContext({ 'hierarchy/27': HIERARCHY_27_DB08 });

        const { kept } = await decideRemovals(ctx.get, [obj('b2b_companies', '27', { previous: { superUserId: 61 } })]);

        expect(kept).toStrictEqual([]);
    });

    it('is kept when who is in it cannot be read', async () => {
        const ctx = await fakeContext({ 'hierarchy/30': { unexpected: true } });

        const { kept } = await decideRemovals(ctx.get, [COMPANY]);

        expect(containersLine(kept)).toBe('Kept the company Altura: Demo Builder could not read who is in it.');
    });
});

describe('a shared catalog the pack made', () => {
    const CATALOG = obj('b2b_shared_catalogs', '41', { key: 'Platinum Buyer', previous: { held: { companies: [], products: [], categories: [2] } } });

    function holding(parts: { companies?: string[]; categories?: number[]; products?: string[] }): Record<string, unknown> {
        return {
            // The catalog itself, which names the group it uses: none here, so it is decided alone.
            'sharedCatalog/41': { id: 41, name: 'Platinum Buyer', type: 0 },
            'sharedCatalog/41/companies': JSON.stringify(parts.companies ?? []),
            'sharedCatalog/41/categories': parts.categories ?? [],
            'sharedCatalog/41/products': parts.products ?? [],
        };
    }

    it('is taken out holding what it held when made and what the pack assigned, going with it', async () => {
        const ctx = await fakeContext(holding({ categories: [2, 50], products: ['vrrack'] }));

        const { kept } = await decideRemovals(ctx.get, [obj('b2b_shared_catalog_products', '41/vrrack'), obj('b2b_shared_catalog_categories', '41/50'), CATALOG]);

        expect(kept).toStrictEqual([]);
    });

    it("is kept while it holds the SC's own company and product, naming both", async () => {
        const ctx = await fakeContext(holding({ companies: ['9'], products: ['vrrack', 'my-own'] }));

        const { take, kept } = await decideRemovals(ctx.get, [obj('b2b_shared_catalog_products', '41/vrrack'), CATALOG]);

        expect(take).toEqual([obj('b2b_shared_catalog_products', '41/vrrack')]);
        expect(containersLine(kept)).toBe('Kept the shared catalog Platinum Buyer: it holds 1 product and 1 company you added.');
    });
});

describe('a customer group the pack made', () => {
    const GROUP = obj('customer_groups', '31', { key: 'Platinum Buyer' });

    function store(parts: { customers?: unknown[]; companies?: unknown[]; catalogs?: unknown[] }) {
        return fakeContext({
            [page('customers/search', filterBy('group_id', 31))]: { items: parts.customers ?? [] },
            [page('company', filterBy('customer_group_id', 31))]: { items: parts.companies ?? [] },
            [CATALOGS]: { items: parts.catalogs ?? [] },
        });
    }

    it('is taken out when only things being taken out with it use it', async () => {
        const ctx = await store({ customers: [{ id: 52 }], companies: [{ id: 30 }], catalogs: [{ id: 41, name: 'Platinum Buyer', customer_group_id: 31 }] });

        const { kept } = await decideRemovals(ctx.get, [obj('b2b_companies', '30'), obj('b2b_shared_catalogs', '41'), obj('customers', '52'), GROUP]);

        expect(kept).toStrictEqual([]);
    });

    it("is kept while the SC's own customers use it: deleting it would move them to another group", async () => {
        const ctx = await store({ customers: [{ id: 52 }, { id: 80 }, { id: 81 }] });

        const { kept } = await decideRemovals(ctx.get, [obj('customers', '52'), GROUP]);

        expect(containersLine(kept)).toBe('Kept the customer group Platinum Buyer: it holds 2 customers you added.');
    });

    it('is named by its code in the store now', async () => {
        const ctx = await fakeContext({
            [page('customers/search', filterBy('group_id', 31))]: { items: [{ id: 80 }] },
            [page('company', filterBy('customer_group_id', 31))]: { items: [] },
            [CATALOGS]: { items: [] },
            'customerGroups/31': { id: 31, code: 'Platinum Buyers 2' },
        });

        const { kept } = await decideRemovals(ctx.get, [GROUP]);

        expect(containersLine(kept)).toBe('Kept the customer group Platinum Buyers 2: it holds 1 customer you added.');
    });

    it("is kept while a catalog the pack did not make uses it", async () => {
        const ctx = await store({ catalogs: [{ id: 3, name: 'Theirs', customer_group_id: 31 }, { id: 4, name: 'Other', customer_group_id: 1 }] });

        const { kept } = await decideRemovals(ctx.get, [GROUP]);

        expect(containersLine(kept)).toBe('Kept the customer group Platinum Buyer: it holds 1 shared catalog you added.');
    });
});

/**
 * A shared catalog and its customer group go or stay together (live, 2026-10-30): making a catalog
 * on a group renames the group to the catalog's name, and deleting the catalog deletes the group,
 * moving its customers to "Default (General)". Removal had kept the group for the SC's customer,
 * deleted the catalog, and so lost both while saying the group was kept.
 */
describe('a shared catalog and its customer group', () => {
    const CATALOG = obj('b2b_shared_catalogs', '19', { key: 'ZZ Test Catalog DB08', previous: { held: { companies: [], products: [], categories: [] } } });
    const GROUP = obj('customer_groups', '24', { key: 'ZZ Test Buyers DB08' });
    const COMPANY = obj('b2b_companies', '27', { key: 'ZZ Test Company DB08', previous: { superUserId: 61 } });
    /** The test pack's record, newest first, as a whole-pack removal walks it. */
    const NEWEST_FIRST = [
        obj('b2b_shared_catalog_products', '19/db08-widget'),
        obj('b2b_shared_catalog_categories', '19/210'),
        obj('b2b_shared_catalog_company_assignments', '19/27'),
        COMPANY,
        CATALOG,
        obj('customers', '62'),
        obj('customers', '61'),
        GROUP,
    ];

    function store(groupCustomers: number[], extra: Record<string, unknown> = {}) {
        return fakeContext({
            'sharedCatalog/19': { id: 19, name: 'ZZ Test Catalog DB08', type: 0, customer_group_id: 24 },
            'sharedCatalog/19/companies': CATALOG_19_COMPANIES_DB08,
            'sharedCatalog/19/categories': CATALOG_19_CATEGORIES_DB08,
            'sharedCatalog/19/products': CATALOG_19_PRODUCTS_DB08,
            'hierarchy/27': HIERARCHY_27_DB08,
            'customerGroups/24': GROUP_24_AFTER_CATALOG_DB08,
            [page('customers/search', filterBy('group_id', 24))]: { items: groupCustomers.map((id) => ({ id })) },
            [page('company', filterBy('customer_group_id', 24))]: { items: [{ id: 27 }] },
            [CATALOGS]: { items: [{ id: 19, name: 'ZZ Test Catalog DB08', customer_group_id: 24 }] },
            ...extra,
        });
    }

    it("keeps the catalog with its group while the group holds the SC's customer, in one line", async () => {
        const ctx = await store([61, 62, 99]);

        const { take, kept } = await decideRemovals(ctx.get, NEWEST_FIRST);

        expect(take.map((o) => `${o.kind}/${o.id}`)).toEqual([
            'b2b_shared_catalog_products/19/db08-widget',
            'b2b_shared_catalog_categories/19/210',
            'b2b_shared_catalog_company_assignments/19/27',
            'b2b_companies/27',
            'customers/62',
            'customers/61',
        ]);
        expect(keptObjects(kept)).toEqual([CATALOG, GROUP]);
        expect(containersLine(kept)).toBe(
            'Kept the shared catalog ZZ Test Catalog DB08 and its customer group ZZ Test Catalog DB08: the customer group holds 1 customer you added.',
        );
    });

    it('reads which group the catalog uses from the catalog itself', async () => {
        const ctx = await store([99]);
        const get = jest.spyOn(ctx, 'get');

        await decideRemovals(ctx.get, NEWEST_FIRST);

        expect(get).toHaveBeenCalledWith('sharedCatalog/19');
    });

    it("keeps the group with its catalog while the catalog holds the SC's product", async () => {
        const ctx = await store([61, 62], { 'sharedCatalog/19/products': ['db08-widget', 'my-own'] });

        const { take, kept } = await decideRemovals(ctx.get, NEWEST_FIRST);

        expect(take).not.toContainEqual(GROUP);
        expect(keptObjects(kept)).toEqual([CATALOG, GROUP]);
        expect(containersLine(kept)).toBe(
            'Kept the shared catalog ZZ Test Catalog DB08 and its customer group ZZ Test Catalog DB08: the shared catalog holds 1 product you added.',
        );
    });

    it('takes both out once neither holds anything of the SC\'s', async () => {
        const ctx = await store([61, 62]);

        const { take, kept } = await decideRemovals(ctx.get, NEWEST_FIRST);

        expect(kept).toStrictEqual([]);
        expect(take).toEqual(NEWEST_FIRST);
    });

    it('keeps a catalog whose group is not going with it: Commerce would delete the group too', async () => {
        const ctx = await store([], {
            'customerGroups/24': { id: 24, code: 'Their Buyers' },
            'sharedCatalog/19/companies': '[]',
            'sharedCatalog/19/categories': [],
            'sharedCatalog/19/products': [],
        });

        const { take, kept } = await decideRemovals(ctx.get, [CATALOG]);

        expect(take).toStrictEqual([]);
        expect(containersLine(kept)).toBe(
            'Kept the shared catalog ZZ Test Catalog DB08: deleting it would delete the customer group Their Buyers too, which is staying.',
        );
    });
});
