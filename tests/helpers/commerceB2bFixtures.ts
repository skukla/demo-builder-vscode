/**
 * Customers, customer groups, companies and shared catalogs (datapack-engine step 08), typed to the
 * real interfaces so a shape the engine reads cannot be invented here.
 *
 * Two kinds of fixture, kept apart:
 *
 * - **Store answers.** `CUSTOMER_44`, `GROUP_19`, `COMPANY_21` and `CATALOG_14` are the bodies
 *   commerce-erp-integration CAPTURED live on the Bodea sandbox (Adobe Commerce as a Cloud
 *   Service) on 2026-09-27/28 (`test/fixtures/commerce/customer-44.json`,
 *   `customer-group-19.json`, `company-21.json`, `shared-catalogs-group-19.json`), contact
 *   details already replaced there. Copied field for field. Every other store answer a suite
 *   builds (searches, hierarchy, addresses) is NOT captured and says so where it is made.
 * - **Pack rows.** Bodea `main`'s own rows of the seven kinds, read from the Data Installer on
 *   2026-10-29 (`save_datapack_zip`, read-only), trimmed and with every email, name, street,
 *   postcode and telephone replaced. Each customer row carried a top-level `password` in the
 *   real pack; here it is GitGuardian's test value.
 */

import type { CommerceCompany, CommerceCustomer, CommerceCustomerGroup, CommerceSharedCatalog } from '@/types/commerceWire';

/** `GET customers/44`, captured. */
export const CUSTOMER_44: CommerceCustomer = {
    id: 44,
    group_id: 19,
    created_at: '2026-09-24 19:08:18',
    updated_at: '2026-09-26 10:46:56',
    created_in: 'Bodea US',
    email: 'buyer@example.com',
    firstname: 'Test',
    lastname: 'Buyer',
    store_id: 3,
    website_id: 3,
    addresses: [],
    disable_auto_group_change: 0,
    extension_attributes: {
        company_attributes: { customer_id: 44, company_id: 21, status: 1, is_default: true },
        all_company_attributes: [{ customer_id: 44, company_id: 21, status: 1, is_default: true }],
        is_subscribed: false,
        last_login_at: '2026-09-24 19:08:21',
        assistance_allowed: 2,
    },
    custom_attributes: [
        { attribute_code: 'reward_update_notification', value: '1' },
        { attribute_code: 'reward_warning_notification', value: '1' },
    ],
};

/** `GET customerGroups/19`, captured. */
export const GROUP_19: CommerceCustomerGroup = {
    id: 19,
    code: 'Example Studios',
    tax_class_id: 3,
    tax_class_name: 'Retail Customer',
    extension_attributes: { uid: 'MTk=' },
};

/** `GET company/21`, captured. */
export const COMPANY_21: CommerceCompany = {
    id: 21,
    status: 1,
    company_name: 'Example Studios',
    legal_name: 'Example Studios, LLC',
    company_email: 'company@example.com',
    street: ['1 Demo Way'],
    city: 'Springfield',
    country_id: 'US',
    region_id: '44',
    postcode: '12345',
    telephone: '5550100',
    customer_group_id: 19,
    sales_representative_id: 1,
    reject_reason: null,
    rejected_at: null,
    super_user_id: 44,
    extension_attributes: {
        is_purchase_order_enabled: false,
        is_company_address_book_enabled: false,
        is_custom_shipping_address_allowed: false,
        quote_config: { company_id: '21', is_quote_enabled: true },
    },
};

/** The one item of `GET sharedCatalog?…customer_group_id eq 19`, captured. */
export const CATALOG_14: CommerceSharedCatalog = {
    id: 14,
    name: 'Example Studios',
    description: 'Example Studios contract pricing',
    customer_group_id: 19,
    type: 0,
    created_at: '2026-09-26 10:45:43',
    created_by: 17,
    store_id: 3,
    tax_class_id: 3,
};

/** GitGuardian's value for a password in a test (memory: never a real-looking one). */
export const TEST_PASSWORD = 'fake-test-pw-not-a-secret';

/** Bodea's `customer_groups` rows, as the pack holds them. */
export const BODEA_GROUP_ROWS = [
    { customer_group: { code: 'ServerSavvy Solutions', tax_class_id: 3 } },
    { customer_group: { code: 'Platinum Buyer', tax_class_id: 3 } },
];

/** Two of Bodea's `customers` rows, contact details replaced; each carries a password. */
export const BODEA_CUSTOMER_ROWS = [
    {
        customer: {
            group_id: 'ServerSavvy Solutions',
            email: 'Admin.Savvy@Example.com',
            firstname: 'Sam',
            lastname: 'Savvy',
            gender: 2,
            addresses: [],
            disable_auto_group_change: 0,
        },
        password: TEST_PASSWORD,
    },
    {
        customer: { group_id: 'Default (General)', email: 'admin.altura@example.com', firstname: 'Alex', lastname: 'Altura', addresses: [], disable_auto_group_change: 0 },
        password: TEST_PASSWORD,
    },
];

/** The GraphQL mutation every Bodea company row carries, and capture writes. */
export const CREATE_COMPANY_QUERY = 'mutation CreateCompany($input: CompanyCreateInput!) { createCompany(input: $input) { company { id } } }';

/** One of Bodea's `b2b_companies` rows, contact details replaced. */
export const BODEA_COMPANY_ROW = {
    query: CREATE_COMPANY_QUERY,
    variables: {
        input: {
            company_name: 'Altura',
            company_email: 'office.altura@example.com',
            legal_name: 'Altura',
            legal_address: { street: ['1 Demo Way'], city: 'Springfield', country_id: 'US', postcode: '12345', telephone: '5550100', region: { region_id: 12 } },
            company_admin: { email: 'admin.altura@example.com', firstname: 'Alex', lastname: 'Altura' },
        },
    },
    extension_attributes: { quote_config: { is_quote_enabled: true }, is_purchase_order_enabled: true },
};

/** Bodea's `b2b_shared_catalogs` rows. */
export const BODEA_CATALOG_ROWS = [
    { sharedCatalog: { name: 'ServerSavvy Solutions', customer_group_id: 'ServerSavvy Solutions', type: 0, store_id: 0, tax_class_id: 3 } },
    { sharedCatalog: { name: 'Platinum Buyer', customer_group_id: 'Platinum Buyer', type: 0, store_id: 0, tax_class_id: 3 } },
];

/** Bodea's `b2b_shared_catalog_company_assignments` rows. */
export const BODEA_COMPANY_ASSIGNMENT_ROWS = [
    { assignment: { shared_catalog_name: 'Default (General)', companies: [{ company_name: 'Altura' }, { company_name: 'RackMaster' }] } },
    { assignment: { shared_catalog_name: 'ServerSavvy Solutions', companies: [{ company_name: 'ServerSavvy Solutions' }] } },
];

/** Bodea's `b2b_shared_catalog_categories`, trimmed; `id` holds a url key, and `racks` is listed twice. */
export const BODEA_CATALOG_CATEGORIES = {
    catalogs: [{ name: 'ServerSavvy Solutions', categories: [{ id: 'racks' }, { id: 'switching' }, { id: 'racks' }] }],
};

/** Bodea's `b2b_shared_catalog_products`, trimmed. */
export const BODEA_CATALOG_PRODUCTS = {
    catalogs: [{ name: 'ServerSavvy Solutions', products: [{ sku: 'vrrack' }, { sku: 'accessmesh' }] }],
};
