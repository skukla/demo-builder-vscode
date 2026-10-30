/**
 * Capture for the customer and B2B kinds (datapack-engine step 08): what the record lists and the
 * installed version names, with what those need (a company's admin, every group named but
 * Commerce's own), and each catalog's assignments limited to what the capture took.
 *
 * Store answers: the captured company, customer, group and catalog item (`commerceB2bFixtures.ts`);
 * what a catalog holds in the shapes read live on 2026-10-29. Searches are not captured.
 */

import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { captureB2b } from '@/features/data-installer/services/demoBuilderEngine/captureB2b';
import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { productLookups } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import { CATALOG_14, COMPANY_21, CREATE_COMPANY_QUERY, CUSTOMER_44, GROUP_19, TEST_PASSWORD } from '../../../../helpers/commerceB2bFixtures';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const PUBLIC = { id: 1, name: 'Default (General)', customer_group_id: 1, type: 1 };
const RECORD: CreatedObject[] = [
    { kind: 'customer_groups', id: '19', key: 'Example Studios' },
    { kind: 'customers', id: '44', key: 'buyer@example.com' },
    { kind: 'b2b_shared_catalogs', id: '14', key: 'Example Studios' },
    { kind: 'b2b_companies', id: '21', key: 'Example Studios' },
    { kind: 'b2b_shared_catalog_company_assignments', id: '14/21', key: 'Example Studios/Example Studios' },
];

function store(): Record<string, unknown> {
    return {
        [page('sharedCatalog')]: { items: [PUBLIC, CATALOG_14] },
        'company/21': COMPANY_21,
        'customers/44': CUSTOMER_44,
        'customerGroups/19': GROUP_19,
        'customerGroups/1': { id: 1, code: 'General', tax_class_id: 3 },
        'sharedCatalog/14/companies': JSON.stringify(['21', '99']),
        'sharedCatalog/14/categories': [41, 77],
        'sharedCatalog/14/products': ['vrrack', 'theirs'],
        'sharedCatalog/1/companies': JSON.stringify([]),
        'sharedCatalog/1/categories': [41],
        'sharedCatalog/1/products': ['vrrack'],
        'categories/41': { id: 41, name: 'Racks', custom_attributes: [{ attribute_code: 'url_key', value: 'racks' }] },
        'categories/77': { id: 77, name: 'Theirs', custom_attributes: [{ attribute_code: 'url_key', value: 'theirs' }] },
        [page('customers/search', filterBy('email', 'buyer@example.com'))]: { items: [CUSTOMER_44] },
    };
}

const INSTALLED = {
    b2b_shared_catalog_products: { catalogs: [{ name: 'Default (General)', products: [{ sku: 'vrrack' }] }] },
};
const CATALOG = { skus: ['vrrack'], categoryKeys: new Set(['racks']), tierGroups: [] };

async function captured() {
    const ctx = await fakeContext(store());
    return captureB2b(ctx, productLookups(ctx), RECORD, INSTALLED, CATALOG);
}

describe('captureB2b', () => {
    it("reads the record's group, customer, catalog and company back in the pack's form", async () => {
        const items = await captured();

        expect(items.customer_groups).toEqual([{ customer_group: { code: 'Example Studios', tax_class_id: 3 } }]);
        expect(items.customers).toEqual([
            { customer: expect.objectContaining({ email: 'buyer@example.com', group_id: 'Example Studios' }) },
        ]);
        expect(items.b2b_shared_catalogs).toEqual([
            { sharedCatalog: { name: 'Example Studios', type: 0, store_id: 0, tax_class_id: 3, customer_group_id: 'Example Studios' } },
        ]);
        expect(items.b2b_companies).toEqual([expect.objectContaining({ query: CREATE_COMPANY_QUERY })]);
    });

    it('writes no password, and no customer row carries one', async () => {
        const items = await captured();

        expect(JSON.stringify(items)).not.toContain(TEST_PASSWORD);
        expect(items.customers).toEqual([{ customer: expect.not.objectContaining({ password: expect.anything() }) }]);
    });

    it('limits each catalog to the companies, categories and products the capture took, the public one included', async () => {
        const items = await captured();

        expect(items.b2b_shared_catalog_company_assignments).toEqual([
            { assignment: { shared_catalog_name: 'Example Studios', companies: [{ company_name: 'Example Studios' }] } },
        ]);
        expect(items.b2b_shared_catalog_categories).toEqual({
            catalogs: [
                { name: 'Default (General)', categories: [{ id: 'racks' }] },
                { name: 'Example Studios', categories: [{ id: 'racks' }] },
            ],
        });
        expect(items.b2b_shared_catalog_products).toEqual({
            catalogs: [
                { name: 'Default (General)', products: [{ sku: 'vrrack' }] },
                { name: 'Example Studios', products: [{ sku: 'vrrack' }] },
            ],
        });
    });

    it("leaves out Commerce's own groups, whichever capture names them", async () => {
        const ctx = await fakeContext(store());

        const items = await captureB2b(ctx, productLookups(ctx), [], {}, { ...CATALOG, tierGroups: [1] });

        expect(items.customer_groups).toBeUndefined();
    });

    it('reads nothing for a pack with no customers, groups, B2B or tier prices', async () => {
        const ctx = await fakeContext({});

        expect(await captureB2b(ctx, productLookups(ctx), [{ kind: 'products', id: 'vrrack' }], { products: [] }, CATALOG)).toStrictEqual({});
    });
});
