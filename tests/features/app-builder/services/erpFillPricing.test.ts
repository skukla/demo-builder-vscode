/**
 * The reverse pricing seed's pure builders (AB-44): Commerce's custom shared catalogs and their
 * tier prices → the ERP's price groups, group memberships, and price lists.
 */
import {
    contractsFrom,
    erpGroupCode,
    partnerGroupsFrom,
    priceGroupsFrom,
    seedFrom,
    type SharedCatalog,
    type TierPrice,
} from '@/features/app-builder/services/erpFillPricing';
import type { CommerceCompanyRow } from '@/features/app-builder/services/erpFillRows';

const company = (id: number, customerGroupId: number | null): CommerceCompanyRow => ({
    id,
    name: `Company ${id}`,
    blocked: false,
    creditLimit: null,
    customerGroupId,
    legalAddress: null,
    legalName: null,
    resellerId: null,
    vatTaxId: null,
    websiteId: null,
});

const catalogs: SharedCatalog[] = [
    { id: 1, name: 'ServerSavvy Solutions', customerGroupId: 16 },
    { id: 2, name: 'Kukla Studios', customerGroupId: 19 },
];
const groupCodes = new Map<number, string>([
    [16, 'ServerSavvy Solutions'],
    [19, 'Kukla Studios'],
]);

describe('erpGroupCode', () => {
    it('upper-cases, replaces non-alphanumerics, and caps at 20', () => {
        expect(erpGroupCode('ServerSavvy Solutions')).toBe('SERVERSAVVY_SOLUTION');
        expect(erpGroupCode('Kukla Studios')).toBe('KUKLA_STUDIOS');
        expect(erpGroupCode('')).toBe('GROUP');
    });
});

describe('priceGroupsFrom', () => {
    it('a price group per custom catalog, keyed by the normalized group code', () => {
        expect(priceGroupsFrom(catalogs, groupCodes)).toEqual([
            { code: 'SERVERSAVVY_SOLUTION', name: 'ServerSavvy Solutions' },
            { code: 'KUKLA_STUDIOS', name: 'Kukla Studios' },
        ]);
    });

    it('skips a catalog whose group code could not be read', () => {
        expect(priceGroupsFrom(catalogs, new Map([[16, 'ServerSavvy Solutions']]))).toEqual([
            { code: 'SERVERSAVVY_SOLUTION', name: 'ServerSavvy Solutions' },
        ]);
    });
});

describe('partnerGroupsFrom', () => {
    it('sets each company that belongs to a catalog group; excludes companies that do not', () => {
        const companies = [company(44, 19), company(50, 16), company(99, 3)];
        expect(partnerGroupsFrom(companies, catalogs, groupCodes)).toEqual([
            { id: 'C44', priceGroup: 'KUKLA_STUDIOS' },
            { id: 'C50', priceGroup: 'SERVERSAVVY_SOLUTION' },
        ]);
    });
});

describe('contractsFrom', () => {
    const tierPrices: TierPrice[] = [
        {
            sku: 'accesspoint',
            customerGroup: 'Kukla Studios',
            quantity: 1,
            price: 149,
            priceType: 'fixed',
        },
        {
            sku: 'switchlite8',
            customerGroup: 'Kukla Studios',
            quantity: 5,
            price: 10,
            priceType: 'discount',
        },
        {
            sku: 'notowned',
            customerGroup: 'Kukla Studios',
            quantity: 1,
            price: 5,
            priceType: 'fixed',
        },
        {
            sku: 'accesspoint',
            customerGroup: 'Unlisted Group',
            quantity: 1,
            price: 99,
            priceType: 'fixed',
        },
    ];
    const catalogGroupCodes = new Set(['ServerSavvy Solutions', 'Kukla Studios']);
    const names = new Map([['KUKLA_STUDIOS', 'Kukla Studios']]);
    const owned = new Set(['accesspoint', 'switchlite8']);

    it('one contract per catalog group; fixed→price, discount→percent; only owned SKUs; only catalog groups', () => {
        expect(contractsFrom(tierPrices, catalogGroupCodes, names, owned, '2026-09-30')).toEqual([
            {
                priceGroup: 'KUKLA_STUDIOS',
                description: 'Kukla Studios',
                startingDate: '2026-09-30',
                lines: [
                    { sku: 'accesspoint', kind: 'price', price: 149, minQty: 1 },
                    { sku: 'switchlite8', kind: 'discount', percent: 10, minQty: 5 },
                ],
            },
        ]);
    });
});

describe('seedFrom', () => {
    it('assembles groups, memberships, and price lists together', () => {
        const seed = seedFrom({
            catalogs,
            groupCodes,
            companies: [company(44, 19)],
            tierPrices: [
                {
                    sku: 'accesspoint',
                    customerGroup: 'Kukla Studios',
                    quantity: 1,
                    price: 149,
                    priceType: 'fixed',
                },
            ],
            ownedSkus: new Set(['accesspoint']),
            startingDate: '2026-09-30',
        });
        expect(seed.priceGroups).toContainEqual({ code: 'KUKLA_STUDIOS', name: 'Kukla Studios' });
        expect(seed.partnerGroups).toEqual([{ id: 'C44', priceGroup: 'KUKLA_STUDIOS' }]);
        expect(seed.contracts).toEqual([
            {
                priceGroup: 'KUKLA_STUDIOS',
                description: 'Kukla Studios',
                startingDate: '2026-09-30',
                lines: [{ sku: 'accesspoint', kind: 'price', price: 149, minQty: 1 }],
            },
        ]);
    });
});
