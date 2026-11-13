/**
 * What a demo uses (walk F85): a save from a pack takes it all, and leaves out the rest of the four
 * kinds Commerce keeps for the whole instance. The store here is shared by two demos, as
 * Scratch 1028 is: website 1 is this demo's, website 2 another's.
 *
 * Its answers are typed to the interfaces the engine reads; the rules were read live on Scratch
 * 1028, 2026-11-09 (`demoUses.ts`), including an attribute that sits in one of the demo's sets with
 * no value on any of its products (`cs_format` there), which the demo does not use.
 */

import { fakeContext } from './demoBuilderEngine.testUtils';
import { filtersOf, matches } from './memoryStore.routes.testUtils';
import { demoUses } from '@/features/data-installer/services/demoBuilderEngine/demoUses';
import type { CommerceSalesRule } from '@/types/commerceSalesRule';
import type {
    CommerceCompanyRow,
    CommerceCustomer,
    CommerceCustomerGroup,
    CommerceProduct,
    CommerceProductAttribute,
    CommerceSharedCatalog,
} from '@/types/commerceWire';

const THIS_SITE = 1;

const CUSTOMERS: CommerceCustomer[] = [
    {
        id: 1,
        email: 'buyer@acme.example.com',
        firstname: 'Ana',
        lastname: 'Buyer',
        website_id: THIS_SITE,
        group_id: 21,
        extension_attributes: { company_attributes: { company_id: 7 } },
    },
    {
        id: 2,
        email: 'shopper@else.example.com',
        firstname: 'Sam',
        lastname: 'Shopper',
        website_id: 2,
        group_id: 22,
    },
];
const RULES: CommerceSalesRule[] = [
    { rule_id: 1, name: 'Spring Sale', website_ids: [THIS_SITE], customer_group_ids: [23] },
    { rule_id: 2, name: 'Their Sale', website_ids: [2], customer_group_ids: [24] },
];
const COMPANIES: CommerceCompanyRow[] = [
    { id: 7, company_name: 'Acme', customer_group_id: 25 },
    { id: 8, company_name: 'Elsewhere Ltd', customer_group_id: 26 },
];
const GROUPS: CommerceCustomerGroup[] = [
    { id: 0, code: 'NOT LOGGED IN' },
    { id: 1, code: 'General' },
    ...[21, 22, 23, 24, 25, 26, 27].map((id) => ({ id, code: `Group ${id}` })),
];
const CATALOGS: CommerceSharedCatalog[] = [
    { id: 1, name: 'Default (General)', type: 1, customer_group_id: 1 },
    { id: 14, name: 'Acme Catalog', type: 0, customer_group_id: 25 },
    { id: 15, name: 'Their Catalog', type: 0, customer_group_id: 26 },
];
const SETS = [
    { attribute_set_id: 4, attribute_set_name: 'Default', entity_type_id: 4 },
    { attribute_set_id: 16, attribute_set_name: 'Wearables', entity_type_id: 4 },
    { attribute_set_id: 17, attribute_set_name: 'Phones', entity_type_id: 4 },
];
const ATTRIBUTES: CommerceProductAttribute[] = [
    {
        attribute_code: 'color',
        frontend_input: 'select',
        default_frontend_label: 'Color',
        is_user_defined: true,
    },
    {
        attribute_code: 'cs_format',
        frontend_input: 'select',
        default_frontend_label: 'Format',
        is_user_defined: true,
    },
];
const PRODUCTS: CommerceProduct[] = [
    {
        sku: 'tee',
        name: 'Tee',
        type_id: 'simple',
        attribute_set_id: 16,
        extension_attributes: { website_ids: [THIS_SITE] },
        custom_attributes: [{ attribute_code: 'color', value: '49' }],
    },
    {
        sku: 'phone',
        name: 'Phone',
        type_id: 'simple',
        attribute_set_id: 17,
        extension_attributes: { website_ids: [2] },
        custom_attributes: [{ attribute_code: 'cs_format', value: '5' }],
    },
];

const all = <T>(items: T[]) => ({ items, total_count: items.length });

/** The products that pass every filter of the path, as Commerce answers and counts them. */
function productsFor(path: string) {
    const f = filtersOf(path);
    const valued = [...f.entries()].filter(([, filter]) => filter.condition === 'notnull');
    return all(
        PRODUCTS.filter(
            (p) =>
                (p.extension_attributes?.website_ids ?? [])
                    .map(String)
                    .includes(f.get('website_id')?.value ?? '') &&
                matches(f.get('type_id'), p.type_id) &&
                matches(f.get('attribute_set_id'), p.attribute_set_id) &&
                valued.every(([code, filter]) =>
                    matches(
                        filter,
                        p.custom_attributes?.find((a) => a.attribute_code === code)?.value
                    )
                )
        )
    );
}

const ROUTES: Record<string, (path: string) => unknown> = {
    'customers/search': (path) =>
        all(
            CUSTOMERS.filter(
                (c) => String(c.website_id) === filtersOf(path).get('website_id')?.value
            )
        ),
    'salesRules/search': () => all(RULES),
    company: () => all(COMPANIES),
    'customerGroups/search': () => all(GROUPS),
    sharedCatalog: () => all(CATALOGS),
    'products/attributes': () => all(ATTRIBUTES),
    'products/attribute-sets/sets/list': () => all(SETS),
    products: productsFor,
};

async function store() {
    const ctx = await fakeContext();
    const asked: string[] = [];
    ctx.get = async (path) => {
        asked.push(path);
        return ROUTES[path.split('?')[0]](path);
    };
    ctx.session.websiteId = THIS_SITE;
    return { ctx, asked };
}

const ids = (items: Array<{ id: string }>) => items.map((i) => i.id);

describe('what this demo uses, of the kinds Commerce keeps for the whole instance', () => {
    it("takes a group its customer, its cart rule or its company is in, and leaves the other demo's", async () => {
        const { ctx } = await store();

        const groups = await demoUses(ctx).of('customer_groups');

        expect(ids(groups)).toEqual(['21', '23', '25']);
    });

    it('takes a shared catalog for one of those groups', async () => {
        const { ctx } = await store();

        const catalogs = await demoUses(ctx).of('b2b_shared_catalogs');

        expect(ids(catalogs)).toEqual(['14']);
    });

    it('reads the groups once for the groups and the catalogs', async () => {
        const { ctx, asked } = await store();
        const uses = demoUses(ctx);

        await uses.of('customer_groups');
        await uses.of('b2b_shared_catalogs');

        expect(asked.filter((path) => path.startsWith('customers/search'))).toHaveLength(1);
    });

    it("takes an attribute set one of its products has, by Commerce's count", async () => {
        const { ctx } = await store();

        const sets = await demoUses(ctx).of('attribute_sets');

        expect(ids(sets)).toEqual(['16']);
    });

    it('takes an attribute only when one of its products has a value for it', async () => {
        const { ctx } = await store();

        const attributes = await demoUses(ctx).of('product_attributes');

        expect(ids(attributes)).toEqual(['color']);
    });

    it("takes every one of its website's products: they are all the demo's", async () => {
        const { ctx } = await store();

        const products = await demoUses(ctx).of('products');

        expect(ids(products)).toEqual(['tee']);
    });
});
