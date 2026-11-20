/**
 * Commerce answers for the ACO export's tests (datapack-engine step 14 item 19), typed to the
 * shapes in `src/types/acoPack.ts` so a field the export does not read cannot be invented here.
 *
 * Products follow the Bodea sandbox's captured `GET products` items
 * (`tests/fixtures/commerce-rest/products-page.json`, 2026-09-27): `category_ids` as an array of
 * strings, `category_links` with string ids and position -1, media entries with an absolute file
 * and a null label. Configurable and bundle options, attributes and categories are not captured
 * live in this repo; they follow Magento's service contracts as the service's export reads them.
 *
 * @module tests/helpers/acoFixtures
 */

import type {
    CommerceAttributeRow,
    CommerceCatalogProduct,
    CommerceCategoryRow,
    CommerceCustomerGroupRow,
    CommerceStoreConfigRow,
} from '@/types/acoPack';
import type { CommerceStoreView, CommerceWebsite } from '@/types/commerceStore';

/** An attribute row with the defaults a select attribute has. */
export function attributeRow(fields: CommerceAttributeRow): CommerceAttributeRow {
    return {
        frontend_input: 'select',
        backend_type: 'int',
        default_frontend_label: 'Color',
        ...fields,
    };
}

const urlPath = (value: string) => [{ attribute_code: 'url_path', value }];

/** Root Catalog, two store roots, and three categories under them. */
export const ACO_CATEGORIES: CommerceCategoryRow[] = [
    { id: 1, name: 'Root Catalog', parent_id: 0, path: '1' },
    {
        id: 2,
        name: 'Default Category',
        parent_id: 1,
        path: '1/2',
        custom_attributes: urlPath('default-category'),
    },
    { id: 4, name: ' Men ', parent_id: 2, path: '1/2/4', custom_attributes: urlPath('men') },
    { id: 3, name: 'Tops', parent_id: 4, path: '1/2/4/3', custom_attributes: urlPath('men/tops') },
    {
        id: 20,
        name: 'Gear Root',
        parent_id: 1,
        path: '1/20',
        custom_attributes: urlPath('gear-root'),
    },
    { id: 21, name: 'Gear', parent_id: 20, path: '1/20/21', custom_attributes: urlPath('gear') },
];

/** A product with the fields every row needs, and these on top. */
export function catalogProduct(
    sku: string,
    fields: Partial<CommerceCatalogProduct> = {},
    attributes: Record<string, unknown> = {}
): CommerceCatalogProduct {
    const custom = { url_key: sku.toLowerCase(), ...attributes };
    return {
        id: fields.id ?? 1,
        sku,
        name: `${sku} name`,
        type_id: 'simple',
        status: 1,
        visibility: 4,
        price: 10,
        ...fields,
        custom_attributes: Object.entries(custom).map(([attribute_code, value]) => ({
            attribute_code,
            value,
        })),
    };
}

/** `color` (id 93) and `size` (id 144), with the options Commerce lists for each. */
export const SUPER_ATTRIBUTES: CommerceAttributeRow[] = [
    {
        attribute_id: 93,
        attribute_code: 'color',
        default_frontend_label: 'Color',
        frontend_input: 'select',
    },
    {
        attribute_id: 144,
        attribute_code: 'size',
        default_frontend_label: 'Size',
        frontend_input: 'select',
    },
];

/** What `GET products/attributes/{code}/options` answers for each, the empty admin option first. */
export const SUPER_ATTRIBUTE_OPTIONS: Record<string, Array<{ label: string; value: string }>> = {
    color: [
        { label: ' ', value: '' },
        { label: 'Navy Blue', value: '50' },
        { label: 'Red', value: '51' },
    ],
    size: [
        { label: ' ', value: '' },
        { label: 'M', value: '167' },
        { label: 'L', value: '168' },
    ],
};

/** A configurable tee in navy (M, L) with its two simples, the parent's own color navy. */
export function configurableTee(): CommerceCatalogProduct[] {
    return [
        catalogProduct(
            'TEE',
            {
                id: 10,
                type_id: 'configurable',
                extension_attributes: {
                    configurable_product_options: [
                        {
                            attribute_id: '144',
                            label: 'Size',
                            position: 1,
                            values: [{ value_index: 167 }, { value_index: 168 }],
                        },
                        {
                            attribute_id: '93',
                            label: 'Color',
                            position: 0,
                            values: [{ value_index: 50 }],
                        },
                    ],
                    configurable_product_links: [11, 12],
                },
            },
            { color: '50', material: 'cotton' }
        ),
        catalogProduct(
            'TEE-M',
            { id: 11, visibility: 1 },
            { color: '50', size: '167', material: 'cotton' }
        ),
        catalogProduct('TEE-L', { id: 12, visibility: 1 }, { color: '50', size: '168' }),
    ];
}

/** A bundle of a required single choice (TEE-M default) and an optional multi choice. */
export function giftBundle(): CommerceCatalogProduct {
    return catalogProduct('GIFT', {
        id: 30,
        type_id: 'bundle',
        extension_attributes: {
            bundle_product_options: [
                {
                    title: 'Extras & Add-ons',
                    type: 'checkbox',
                    required: false,
                    position: 2,
                    product_links: [
                        { sku: 'MUG', qty: 2, can_change_quantity: 1, is_default: false },
                    ],
                },
                {
                    title: 'Shirt',
                    type: 'select',
                    required: true,
                    position: 1,
                    product_links: [
                        { sku: 'TEE-M', qty: 1, can_change_quantity: 0, is_default: true },
                    ],
                },
            ],
        },
    });
}

/** The Bodea sandbox's websites (`websites.json`), as `listWebsites` answers them: Admin left out. */
export const ACO_WEBSITES: CommerceWebsite[] = [
    { id: 1, code: 'base', name: 'Main Website' },
    { id: 2, code: 'citisignal', name: 'CitiSignal Website' },
];

/** A store view of each website, and a second, French one on `base`. */
export const ACO_STORE_VIEWS: CommerceStoreView[] = [
    { id: 0, code: 'admin', name: 'Admin', store_group_id: 0, website_id: 0, is_active: 1 },
    {
        id: 1,
        code: 'default',
        name: 'Default Store View',
        store_group_id: 1,
        website_id: 1,
        is_active: 1,
    },
    {
        id: 2,
        code: 'citisignal_us',
        name: 'CitiSignal US',
        store_group_id: 2,
        website_id: 2,
        is_active: 1,
    },
    { id: 4, code: 'fr', name: 'French', store_group_id: 1, website_id: 1, is_active: 1 },
];

/** Each store view's display currency (`store-configs.json` shape). */
export const ACO_STORE_CONFIGS: CommerceStoreConfigRow[] = [
    { id: 1, code: 'default', website_id: 1, default_display_currency_code: 'USD' },
    { id: 2, code: 'citisignal_us', website_id: 2, default_display_currency_code: 'usd' },
    { id: 4, code: 'fr', website_id: 1, default_display_currency_code: 'EUR' },
];

/** Commerce's four standard groups and a B2B one with a code that needs slugging. */
export const ACO_GROUPS: CommerceCustomerGroupRow[] = [
    { id: 0, code: 'NOT LOGGED IN' },
    { id: 1, code: 'General' },
    { id: 4, code: 'VIP Gold' },
];
