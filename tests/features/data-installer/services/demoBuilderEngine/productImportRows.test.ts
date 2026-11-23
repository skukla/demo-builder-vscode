/**
 * productImportRows — a pack's product record as an Import API row, or undefined when the import form
 * cannot carry it without loss (that row goes by the bulk route). Rows are Luma's, as its product-record
 * pack holds them: labels for options, url keys for categories.
 */

import type { ProductLookups } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import { importRowLookups, importRowOf } from '@/features/data-installer/services/demoBuilderEngine/productImportRows';
import { parseProductRows, type ProductRow } from '@/features/data-installer/services/demoBuilderEngine/productsKind';

const ATTRIBUTES: Record<string, { frontend_input: string; is_user_defined: boolean; options?: Array<{ label: string; value: string }> }> = {
    color: { frontend_input: 'select', is_user_defined: true, options: [{ label: 'Black', value: '49' }, { label: 'Gray', value: '52' }] },
    size: { frontend_input: 'select', is_user_defined: true, options: [{ label: 'Size 32', value: '178' }] },
    climate: { frontend_input: 'multiselect', is_user_defined: true, options: [{ label: 'Cool', value: '205' }, { label: 'Indoor', value: '207' }] },
    eco_collection: { frontend_input: 'boolean', is_user_defined: true },
    material: { frontend_input: 'text', is_user_defined: true },
    gift_wrapping_available: { frontend_input: 'select', is_user_defined: false },
};
const CATEGORIES: Record<string, { name: string; path: string }> = {
    2: { name: 'Default Category', path: '1/2' },
    20: { name: 'Men', path: '1/2/20' },
    21: { name: 'Tops', path: '1/2/20/21' },
};

const lookups = {
    attribute: async (code: string) => ATTRIBUTES[code] ?? Promise.reject(new Error(`no ${code}`)),
    categoryId: async (urlKey: string) => ({ tops: '21', men: '20' })[urlKey] ?? Promise.reject(new Error(urlKey)),
    category: async (id: string) => CATEGORIES[id] ?? null,
} as unknown as ProductLookups;

const rowOf = (product: Record<string, unknown>): ProductRow => parseProductRows([{ product: { attribute_set_id: 'Top', name: 'Chaz Hoodie', type_id: 'simple', ...product } }])[0];
const convert = (row: ProductRow, children: ProductRow[] = []) =>
    importRowOf(importRowLookups(lookups), row, new Map(children.map((c) => [c.sku.toLowerCase(), c])));

describe('importRowOf', () => {
    it('writes a simple product as import columns: categories by path, options by label, Commerce codes in words', async () => {
        const row = rowOf({
            sku: 'MH01-XS-Black',
            price: 52,
            status: 1,
            visibility: 1,
            extension_attributes: { category_links: [{ position: 0, category_id: 'tops' }] },
            custom_attributes: [
                { attribute_code: 'url_key', value: 'chaz-hoodie-xs-black' },
                { attribute_code: 'tax_class_id', value: '2' },
                { attribute_code: 'color', value: '49' },
                { attribute_code: 'climate', value: ['Cool', 'Indoor'] },
                { attribute_code: 'eco_collection', value: '1' },
                { attribute_code: 'gift_wrapping_available', value: '2' },
            ],
        });

        await expect(convert(row)).resolves.toEqual({
            sku: 'MH01-XS-Black',
            product_type: 'simple',
            attribute_set_code: 'Top',
            name: 'Chaz Hoodie',
            price: '52',
            product_online: '1',
            visibility: 'Not Visible Individually',
            url_key: 'chaz-hoodie-xs-black',
            tax_class_name: 'Taxable Goods',
            additional_attributes: 'color=Black,climate=Cool|Indoor,eco_collection=Yes',
            categories: 'Default Category/Men/Tops',
        });
    });

    it("writes a configurable's variations from its children's values, named by label", async () => {
        const kids = [rowOf({ sku: 'MP01-32-Black', custom_attributes: [{ attribute_code: 'size', value: 'Size 32' }, { attribute_code: 'color', value: 'Black' }] })];
        const parent = rowOf({
            sku: 'MP01',
            type_id: 'configurable',
            extension_attributes: {
                configurable_product_options: [{ attribute_id: 'size', label: 'Size' }, { attribute_id: 'color', label: 'Color' }],
                configurable_product_links: ['MP01-32-Black'],
            },
        });

        const converted = await convert(parent, kids);

        expect(converted).toMatchObject({
            configurable_variations: 'sku=MP01-32-Black,size=Size 32,color=Black',
            configurable_variation_labels: 'size=Size,color=Color',
        });
    });

    it.each([
        ['a gift card', { type_id: 'giftcard' }],
        ['a bundle', { type_id: 'bundle' }],
        ['custom options', { options: [{ title: 'Engraving' }] }],
        ['tier prices', { tier_prices: [{ customer_group_id: 'VIP', qty: 2, value: 40 }] }],
        ['a text value holding a comma', { custom_attributes: [{ attribute_code: 'material', value: 'Wool, Cotton' }] }],
        ['an option the store lacks', { custom_attributes: [{ attribute_code: 'color', value: 'Teal' }] }],
        ['a tax class Commerce does not ship', { custom_attributes: [{ attribute_code: 'tax_class_id', value: '7' }] }],
        ['a set named by id', { attribute_set_id: 9 }],
    ])('leaves %s to the bulk route', async (_what, product) => {
        await expect(convert(rowOf({ sku: 'X1', ...product }))).resolves.toBeUndefined();
    });

    it('leaves a configurable to the bulk route when a child is not in the pack', async () => {
        const parent = rowOf({ sku: 'MP02', type_id: 'configurable', extension_attributes: { configurable_product_options: [{ attribute_id: 'size' }], configurable_product_links: ['MP02-32'] } });

        await expect(convert(parent)).resolves.toBeUndefined();
    });
});
