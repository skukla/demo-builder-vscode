/**
 * Pack form: what the store holds, written back the way a pack holds it (step 05). Capture
 * writes these rows into the new version, and every fingerprint is made from them, so "edited
 * since" compares the store with itself through one transform.
 *
 * The product is a real answer: the Bodea sandbox's `GET products` page, captured 2026-09-27
 * (tests/fixtures/commerce-rest/products-page.json). The category and the attribute have no
 * captured answer in the repo: their fields are Magento's `CategoryInterface` and
 * `ProductAttributeInterface`, typed below to the interfaces the engine reads.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { StoreAttribute, StoreCategory } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import {
    ROOT_KEY,
    attributePackForm,
    categoryPackForm,
    keyOf,
    productPackForm,
} from '@/features/data-installer/services/demoBuilderEngine/packForm';
import { productLookups } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import type { CommerceBundleOption, CommerceCustomOption, CommerceProduct, CommerceProductAttribute } from '@/types/commerceWire';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const CAPTURED = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../../fixtures/commerce-rest/products-page.json'), 'utf8'),
) as { body: { items: CommerceProduct[] } };
const WATCH = CAPTURED.body.items[1];

const category = (id: number, name: string, ids: string, urlKey: string): StoreCategory => ({
    id,
    name,
    path: ids,
    is_active: true,
    position: 1,
    include_in_menu: true,
    children: '',
    custom_attributes: [
        { attribute_code: 'url_key', value: urlKey },
        { attribute_code: 'url_path', value: `x/${urlKey}` },
        { attribute_code: 'children_count', value: '0' },
        { attribute_code: 'path', value: ids },
    ],
});

const BAND_TYPE: StoreAttribute & Pick<CommerceProductAttribute, 'attribute_code' | 'default_frontend_label'> = {
    attribute_id: 180,
    attribute_code: 'band_type',
    frontend_input: 'select',
    is_user_defined: true,
    default_frontend_label: 'Band type',
    options: [{ label: ' ', value: '' }, { label: 'Sport', value: '14' }],
};

/** The store behind the captured watch: its set, two categories under root 2, its attributes. */
const STORE: Record<string, unknown> = {
    [page('products/attribute-sets/sets/list')]: { items: [{ attribute_set_id: 16, attribute_set_name: 'Wearables' }], total_count: 1 },
    'categories/2': category(2, 'Default Category', '1/2', 'default-category'),
    'categories/3': category(3, 'Wearables', '1/2/3', 'wearables'),
    'categories/9': category(9, 'Smart Watches', '1/2/3/9', 'smart-watches'),
    'products/attributes/band_type': BAND_TYPE,
    'products/attributes/tax_class_id': { attribute_code: 'tax_class_id', frontend_input: 'select', is_user_defined: false, options: [{ label: 'Taxable Goods', value: '2' }] },
    'products/attributes/options_container': { attribute_code: 'options_container', frontend_input: 'select', is_user_defined: false },
};

describe('productPackForm', () => {
    it('names the set, categories and options a person reads, and drops what only this store means', async () => {
        const lk = productLookups(await fakeContext(STORE));

        const { product } = await productPackForm(lk, WATCH);

        expect(product.sku).toBe('DigiWristQuantum');
        expect(product.attribute_set_id).toBe('Wearables');
        expect(product).not.toHaveProperty('id');
        expect(product).not.toHaveProperty('created_at');
        expect(product).not.toHaveProperty('updated_at');
        expect(product).not.toHaveProperty('media_gallery_entries');
        expect(product.extension_attributes).toEqual({
            category_links: [
                { position: -1, category_id: 'wearables' },
                { position: -1, category_id: 'smart-watches' },
            ],
        });
        const attrs = Object.fromEntries((product.custom_attributes ?? []).map((a) => [a.attribute_code, a.value]));
        expect(attrs.band_type).toBe('Sport');
        expect(attrs.category_ids).toEqual(['wearables', 'smart-watches']);
        // A system select stays numeric both ways, as the service's own export keeps it.
        expect(attrs.tax_class_id).toBe('2');
        expect(attrs.options_container).toBe('container2');
        // An attribute the store cannot describe keeps its value as it is.
        expect(attrs.cs_manufacturer).toBe('51');
    });

    it('keeps a SKU exactly: case, slashes and all', async () => {
        const lk = productLookups(await fakeContext(STORE));

        const { product } = await productPackForm(lk, { ...WATCH, sku: 'Digi/Wrist Quantum' });

        expect(product.sku).toBe('Digi/Wrist Quantum');
    });

    it('keeps an id it cannot name, rather than guessing', async () => {
        const lk = productLookups(await fakeContext(STORE));

        const { product } = await productPackForm(lk, { ...WATCH, attribute_set_id: 99 });

        expect(product.attribute_set_id).toBe(99);
    });

    // Step 14, item 14: the id is still kept, and the save is told which, to name it in its outcome.
    it('tells the save each id it kept because it could not name it', async () => {
        const told: string[] = [];
        const lk = { ...productLookups(await fakeContext(STORE)), unnamed: (what: string, id: string) => void told.push(`${what} ${id}`) };

        await productPackForm(lk, { ...WATCH, attribute_set_id: 99, extension_attributes: { category_links: [{ category_id: '57', position: 0 }] } });

        expect(told).toEqual(['attribute set 99', 'category 57']);
    });

    // Step 14, item 12: the service's export strips these (`data_processors_export.json` L175-181).
    it("drops this store's custom option, option value and bundle option and link ids", async () => {
        const lk = productLookups(await fakeContext(STORE));
        const options: CommerceCustomOption[] = [{ option_id: 7, product_sku: 'Engraved', title: 'Engraving', type: 'drop_down', values: [{ option_type_id: 31, title: 'Gold' }] }];
        const bundle: CommerceBundleOption[] = [{ option_id: 4, title: 'Strap', product_links: [{ id: '12', option_id: 4, sku: 'Strap-Sport', qty: 1 }] }];

        const { product } = await productPackForm(lk, { ...WATCH, options, extension_attributes: { bundle_product_options: bundle } });

        expect(product.options).toEqual([{ product_sku: 'Engraved', title: 'Engraving', type: 'drop_down', values: [{ title: 'Gold' }] }]);
        expect(product.extension_attributes?.bundle_product_options).toEqual([{ title: 'Strap', product_links: [{ sku: 'Strap-Sport', qty: 1 }] }]);
    });
});

describe('categoryPackForm', () => {
    it('writes the path as its parents\' names from the store root on, and drops what the store works out', async () => {
        const lk = productLookups(await fakeContext(STORE));

        const { category: row } = await categoryPackForm(lk, category(9, 'Smart Watches', '1/2/3/9', 'smart-watches'));

        expect(row).toEqual({
            name: 'Smart Watches',
            path: 'Default Category/Wearables',
            is_active: true,
            position: 1,
            include_in_menu: true,
            custom_attributes: [{ attribute_code: 'url_key', value: 'smart-watches' }],
        });
    });

    it('gives a root category an empty path', async () => {
        const lk = productLookups(await fakeContext(STORE));

        expect((await categoryPackForm(lk, category(2, 'Default Category', '1/2', 'default-category'))).category.path).toBe('');
    });
});

describe('attributePackForm', () => {
    it('drops this store\'s ids and the empty option, keeping each option by its label', () => {
        expect(attributePackForm(BAND_TYPE)).toEqual({
            attribute: {
                attribute_code: 'band_type',
                frontend_input: 'select',
                is_user_defined: true,
                default_frontend_label: 'Band type',
                options: [{ label: 'Sport', value: 'Sport' }],
            },
        });
    });
});

describe('keyOf', () => {
    it.each([
        ['products', { product: { sku: 'VR-Rack' } }, 'VR-Rack'],
        ['product_attributes', { attribute: { attribute_code: 'band_type' } }, 'band_type'],
        ['attribute_options', { attribute_code: 'band_type', label: 'Sport' }, 'band_type/Sport'],
        ['attribute_sets', { attributeSet: { attribute_set_name: 'Wearables' } }, 'Wearables'],
        ['attribute_assign_to_set', { attributeSetId: 'Wearables', attributeCode: 'band_type' }, 'Wearables/band_type'],
        ['sources', { source: { source_code: 'east' } }, 'east'],
        ['stocks', { stock: { name: 'Bodea Stock' } }, 'Bodea Stock'],
        ['stock_source_links', { stockSourceLink: { stock_id: 'Bodea Stock', source_code: 'east' } }, 'Bodea Stock/east'],
    ])('names a %s row by what the pack calls it', (kind, row, key) => {
        expect(keyOf(kind, row)).toBe(key);
    });

    it('names a category by its place under the root, whatever the root is called', () => {
        expect(keyOf('categories', { category: { name: 'Smart Watches', path: 'Default Category/Wearables' } })).toBe('Wearables/Smart Watches');
        expect(keyOf('categories', { category: { name: 'Smart Watches', path: 'Bodea/Wearables' } })).toBe('Wearables/Smart Watches');
        expect(keyOf('categories', { category: { name: 'Bodea', path: '' } })).toBe(ROOT_KEY);
    });
});
