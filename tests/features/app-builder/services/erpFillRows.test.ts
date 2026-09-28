/**
 * erpFillRows — the ERP fill's sorting rules, ported from the integration's mirror and
 * structure modules: the cases the Bodea captures do not reach (configurables and their
 * variants, attribute ownership).
 */

import {
    ownershipFilter,
    partnersFrom,
    productsFrom,
    salesOrgOf,
    type CommerceCompanyRow,
    type CommerceProductRow,
} from '@/features/app-builder/services/erpFillRows';

function product(overrides: Partial<CommerceProductRow> & Pick<CommerceProductRow, 'id' | 'sku'>): CommerceProductRow {
    return { listPrice: 10, typeId: 'simple', childIds: [], optionAttributeIds: [], customAttributes: {}, ...overrides };
}

describe('productsFrom', () => {
    const shirt = product({ id: 1, sku: 'SHIRT', typeId: 'configurable', childIds: [2], optionAttributeIds: ['93'] });
    const red = product({ id: 2, sku: 'SHIRT-RED', name: 'Shirt, red', customAttributes: { color: '5' } });
    const colour = new Map([['93', { code: 'color', label: 'Colour', options: new Map([['5', 'Red']]) }]]);
    const stock = new Map([['SHIRT-RED', [{ code: 'default', quantity: 7 }, { code: 'east', quantity: 3 }]]]);

    it('makes a configurable a parent with no stock, and its variant a product naming parent and values', () => {
        const rows = productsFrom([shirt, red], stock, new Map([['default', 'Default Source']]), colour);
        expect(rows).toStrictEqual([
            { listPrice: 10, name: 'SHIRT', sku: 'SHIRT', type: 'configurable', warehouses: [] },
            {
                listPrice: 10,
                name: 'Shirt, red',
                sku: 'SHIRT-RED',
                parentSku: 'SHIRT',
                variantAttributes: [{ label: 'Colour', value: 'Red' }],
                type: 'simple',
                // A source with no known name is named by its code.
                warehouses: [
                    { code: 'default', name: 'Default Source', quantity: 7 },
                    { code: 'east', name: 'east', quantity: 3 },
                ],
            },
        ]);
    });

    it('leaves out a product with no SKU', () => {
        expect(productsFrom([product({ id: 3, sku: '' })], new Map())).toStrictEqual([]);
    });
});

describe('ownershipFilter', () => {
    it('owns everything by default', () => {
        expect(ownershipFilter({}).owns({})).toBe(true);
    });

    it('owns products whose attribute names this ERP', () => {
        const filter = ownershipFilter({ structure_owns: 'attribute', structure_owns_attribute: 'erp_owner=ACME' });
        expect(filter.owns({ customAttributes: { erp_owner: 'ACME' } })).toBe(true);
        expect(filter.owns({ customAttributes: { erp_owner: 'OTHER' } })).toBe(false);
        expect(filter.describe).toBe('products whose erp_owner is ACME');
    });

    it('owns nothing, and says so, when its setting is blank', () => {
        const filter = ownershipFilter({ structure_owns: 'attribute', structure_owns_attribute: '' });
        expect(filter.owns({ customAttributes: { erp_owner: '' } })).toBe(false);
        expect(filter.describe).toMatch(/the setting is blank/u);
    });
});

describe('salesOrgOf', () => {
    it('answers the setting, else 1000, with the name only when there is one', () => {
        expect(salesOrgOf({ structure_sales_org: 'EU01', structure_sales_org_name: 'Europe' })).toStrictEqual({
            salesOrg: 'EU01',
            salesOrgName: 'Europe',
        });
        expect(salesOrgOf(undefined)).toStrictEqual({ salesOrg: '1000' });
    });
});

describe('partnersFrom', () => {
    const company = (blocked: boolean): CommerceCompanyRow => ({
        id: 21,
        name: 'Acme',
        blocked,
        creditLimit: 5000,
        legalAddress: null,
        legalName: null,
        resellerId: null,
        vatTaxId: null,
        websiteId: null,
    });

    it("sends Commerce's company status as the website account, never as the ERP's own credit block", () => {
        const [closed] = partnersFrom([company(true)], [], new Map());
        expect(closed.websiteAccountClosed).toBe(true);
        expect(closed).not.toHaveProperty('blocked');
        const [open] = partnersFrom([company(false)], [], new Map());
        expect(open.websiteAccountClosed).toBe(false);
    });
});
