/**
 * erpAssignSelection — which products an "Assign products" covers and what writing erp_owner
 * on them would do (AB-74).
 *
 * The product shape is the Bodea sandbox's captured `GET products` page
 * (tests/fixtures/commerce-rest/products-page.json, 2026-09-27): two products, set 15 and 16,
 * categories from `extension_attributes.category_links`. The capture carries no brand and no
 * erp_owner, so the tests add those custom attributes to copies of its products.
 */

import fs from 'fs';
import path from 'path';
import {
    categoryChoicesOf,
    inSelection,
    listAssignableProducts,
    ownerBody,
    previewAssignment,
    selectionProblem,
    storeScopeOf,
    type AssignProductRow,
} from '@/features/app-builder/services/erpAssignSelection';

const FIXTURES = path.join(__dirname, '../../../fixtures/commerce-rest');

interface CapturedPage {
    items: Array<{ sku: string; custom_attributes: Array<{ attribute_code: string; value: unknown }> }>;
    total_count: number;
}

function capturedPage(): CapturedPage {
    return (JSON.parse(fs.readFileSync(path.join(FIXTURES, 'products-page.json'), 'utf8')) as { body: CapturedPage }).body;
}

/** The captured page, each product given the extra custom attributes named. */
function pageWith(extra: Record<string, Record<string, string>>): CapturedPage {
    const page = capturedPage();
    const items = page.items.map((item) => ({
        ...item,
        custom_attributes: [
            ...item.custom_attributes,
            ...Object.entries(extra[item.sku] ?? {}).map(([attribute_code, value]) => ({ attribute_code, value })),
        ],
    }));
    return { ...page, items, total_count: items.length };
}

describe('listAssignableProducts', () => {
    it('reads enabled products with their set, categories, brand label and erp_owner', async () => {
        const get = jest.fn(async (requested: string) => {
            if (requested.startsWith('products/attributes/brand')) {
                return { options: [{ value: '', label: ' ' }, { value: '212', label: 'Accuform' }] };
            }
            return pageWith({ 'essentials-plan': { brand: '212', erp_owner: 'justrite' } });
        });
        const rows = await listAssignableProducts(get);
        expect(get).toHaveBeenCalledWith(expect.stringContaining('[field]=status&searchCriteria[filter_groups][0][filters][0][value]=1'));
        expect(rows.map(({ sku, attributeSetId, categoryIds, brand, owner, websiteIds }) => ({ sku, attributeSetId, categoryIds, brand, owner, websiteIds }))).toEqual([
            { sku: 'essentials-plan', attributeSetId: 15, categoryIds: ['7'], brand: 'Accuform', owner: 'justrite', websiteIds: [2] },
            { sku: 'DigiWristQuantum', attributeSetId: 16, categoryIds: ['3', '9'], brand: undefined, owner: '', websiteIds: [2] },
        ]);
    });

    // A move of a few products reads those, not the store (owner, 2026-10-19). The "in" filter
    // answered 3 of 4 named SKUs, the made-up one left out, in 0.9 s on Justrite that day.
    it('reads only the SKUs named, a few dozen per read, by an "in" filter', async () => {
        const get = jest.fn(async (requested: string) => (requested.startsWith('products/attributes/brand') ? { options: [] } : pageWith({})));
        const skus = Array.from({ length: 60 }, (_, index) => `SKU-${index}`);
        await listAssignableProducts(get, { skus });

        const reads = get.mock.calls.map(([requested]) => String(requested)).filter((requested) => requested.startsWith('products?'));
        expect(reads).toHaveLength(2);
        expect(reads[0]).toContain('[field]=sku&searchCriteria[filter_groups][1][filters][0][value]=SKU-0,SKU-1,');
        expect(reads[0]).toContain('[condition_type]=in');
        expect(reads[1]).toContain('[value]=SKU-50,');
    });

    it('CONTROL: reads everything when a SKU has a comma, which a list cannot carry', async () => {
        const get = jest.fn(async (requested: string) => (requested.startsWith('products/attributes/brand') ? { options: [] } : pageWith({})));
        await listAssignableProducts(get, { skus: ['A,B'] });
        const reads = get.mock.calls.map(([requested]) => String(requested)).filter((requested) => requested.startsWith('products?'));
        expect(reads.every((requested) => !requested.includes('condition_type'))).toBe(true);
    });

    it('reads a free-text brand as it is stored', async () => {
        const get = jest.fn(async (requested: string) => {
            if (requested.startsWith('products/attributes/brand')) throw new Error('404');
            return pageWith({ DigiWristQuantum: { brand: 'Justrite' } });
        });
        expect((await listAssignableProducts(get))[1].brand).toBe('Justrite');
    });
});

const row = (sku: string, extra: Partial<AssignProductRow> = {}): AssignProductRow => ({
    sku,
    attributeSetId: 4,
    categoryIds: [],
    owner: '',
    websiteIds: [1],
    attributes: {},
    ...extra,
});

const ROWS = [
    row('ACC-100', { categoryIds: ['7'], brand: 'Accuform', owner: '' }),
    row('ACC-200', { categoryIds: ['7'], brand: 'Accuform', owner: 'justrite' }),
    row('ACC-300', { categoryIds: ['7'], brand: 'Accuform', owner: 'accuform' }),
    row('ACC-400', { categoryIds: ['7'], brand: 'Accuform', attributeSetId: 9 }),
    row('JR-1', { categoryIds: ['8'], brand: 'Justrite' }),
];

describe('selections', () => {
    it('matches by category, brand without case, SKU prefix without case and a SKU list', () => {
        const skus = (selection: Parameters<typeof inSelection>[1]) => ROWS.filter((r) => inSelection(r, selection)).map((r) => r.sku);
        expect(skus({ by: 'category', categoryId: 8 })).toEqual(['JR-1']);
        expect(skus({ by: 'brand', brand: ' justrite ' })).toEqual(['JR-1']);
        expect(skus({ by: 'skuPrefix', prefix: 'acc-' })).toHaveLength(4);
        expect(skus({ by: 'skus', skus: ['jr-1', 'ACC-100'] })).toEqual(['ACC-100', 'JR-1']);
    });

    it('refuses an empty selection in words', () => {
        expect(selectionProblem(undefined)).toMatch(/Pick products/u);
        expect(selectionProblem({ by: 'skus', skus: [' '] })).toBe('Paste at least one SKU.');
        expect(selectionProblem({ by: 'brand', brand: 'Accuform' })).toBeUndefined();
    });

    it('offers the labelled categories with counts, most products first, and leaves out an unlabelled one', () => {
        // 8 has no label: it is in another catalog (listCategoryLabels).
        expect(categoryChoicesOf(ROWS, new Map([['7', 'Signs']]))).toStrictEqual([{ value: '7', label: 'Signs' }]);
    });
});

describe('previewAssignment', () => {
    const input = {
        rows: ROWS,
        selection: { by: 'brand', brand: 'Accuform' } as const,
        erp: { id: 'demo-erp-2', name: 'Accuform ERP', listId: 'accuform' },
        value: 'accuform',
        owners: new Map<string, string[]>([
            ['ACC-100', ['justrite']],
            ['ACC-200', ['justrite']],
            ['ACC-300', ['accuform']],
            ['ACC-400', ['justrite']],
        ]),
        names: new Map([['justrite', 'Justrite ERP'], ['accuform', 'Accuform ERP']]),
        setsWithoutOwner: [{ id: 9, name: 'Gear', products: 1 }],
    };

    it('writes only products not already tagged and in a set that has erp_owner', () => {
        const { preview, toWrite } = previewAssignment(input);
        expect(toWrite.map((r) => r.sku)).toEqual(['ACC-100', 'ACC-200']);
        expect(preview).toStrictEqual({
            erp: input.erp,
            matched: 4,
            toWrite: 2,
            examples: ['ACC-100', 'ACC-200'],
            alreadyTagged: 1,
            movedFrom: [{ name: 'Justrite ERP', count: 2 }],
            outsideSets: { count: 1, sets: [{ id: 9, name: 'Gear', products: 1 }] },
            unknownSkus: [],
        });
    });

    it('names pasted SKUs Commerce does not have', () => {
        const { preview } = previewAssignment({ ...input, selection: { by: 'skus', skus: ['ACC-100', 'NOPE-1'] } });
        expect(preview.unknownSkus).toEqual(['NOPE-1']);
    });

    it('writes the SKU and erp_owner and nothing else', () => {
        expect(ownerBody('ACC-100', 'accuform')).toEqual({
            product: { sku: 'ACC-100', custom_attributes: [{ attribute_code: 'erp_owner', value: 'accuform' }] },
        });
    });
});

/**
 * The project's store: its website by code, and the root category its store shows. Websites are
 * the Bodea sandbox's own (`websites.json`, captured 2026-09-27); groups and views are shaped as
 * Commerce's store routes answer them, with no capture of their own.
 */
describe('storeScopeOf', () => {
    const websites = (JSON.parse(fs.readFileSync(path.join(FIXTURES, 'websites.json'), 'utf8')) as { body: unknown[] }).body;
    const GROUPS = [
        { id: 3, root_category_id: 51 },
        { id: 7, root_category_id: 88 },
    ];
    const VIEWS = [
        { id: 4, code: 'bodea_us', website_id: 3, store_group_id: 3 },
        { id: 9, code: 'bodea_b2b', website_id: 3, store_group_id: 7 },
        { id: 2, code: 'citisignal_us', website_id: 2, store_group_id: 2 },
    ];
    const get = jest.fn(async (requested: string) => {
        if (requested === 'store/websites') return websites;
        if (requested === 'store/storeGroups') return GROUPS;
        if (requested === 'store/storeViews') return VIEWS;
        throw new Error(`unexpected ${requested}`);
    });

    beforeEach(() => get.mockClear());

    it('answers the website and the root its default store shows, by the website\'s code', async () => {
        await expect(storeScopeOf(get, 'bodea')).resolves.toEqual({ websiteId: 3, websiteName: 'Bodea Website', rootCategoryId: '51' });
        expect(get).not.toHaveBeenCalledWith('store/storeViews');
    });

    it('with a store view, answers that view\'s own store and its id', async () => {
        await expect(storeScopeOf(get, 'bodea', 'bodea_b2b')).resolves.toEqual({
            websiteId: 3,
            websiteName: 'Bodea Website',
            rootCategoryId: '88',
            storeId: 9,
        });
    });

    it('answers nothing for a store view on another website', async () => {
        await expect(storeScopeOf(get, 'bodea', 'citisignal_us')).resolves.toBeUndefined();
    });

    it('answers nothing for an unknown website or none', async () => {
        await expect(storeScopeOf(get, 'acme')).resolves.toBeUndefined();
        await expect(storeScopeOf(get, undefined)).resolves.toBeUndefined();
    });
});
