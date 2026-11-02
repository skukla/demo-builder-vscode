/**
 * The instance-wide things a wipe judges (datapack-engine step 10, 2026-11-02): companies, shared
 * catalogs, customer groups, attribute sets, attributes and website settings. Typed to the real
 * interfaces so a shape the wipe reads cannot be invented here.
 *
 * Where each shape comes from:
 * - `GET system/config` at a website: **captured** 2026-11-02 on `justrite_test_website`
 *   (`SYSTEM_CONFIG_PAGE_TEST_WEBSITE`, with `general/country/allow`'s long list cut).
 * - A company, its hierarchy, the group renamed by its catalog: **captured** 2026-10-30, reused from
 *   `commerceB2bFixtures.ts` (`COMPANY_28_DB08`, `HIERARCHY_28_DB08`).
 * - The rest (the catalog row beyond `CATALOG_14`'s fields, attribute sets and attributes) are typed
 *   to `commerceWire.ts`; the ids and names are made up. The test website holds no customers and no
 *   products (read 2026-11-02), so none of it could be captured there.
 */

import { COMPANY_28_DB08, HIERARCHY_28_DB08 } from './commerceB2bFixtures';
import { BODEA_ID, JUSTRITE_ID, TEST_SITE_ID } from './commerceWipeFixtures';
import type { CommerceCompany, CommerceCompanyHierarchyNode, CommerceCustomer, CommerceCustomerGroup, CommerceProduct, CommerceProductAttribute, CommerceSharedCatalog, CommerceSetAttribute, CommerceSystemConfigList, CommerceSystemConfigRow } from '@/types/commerceWire';

/** `GET system/config?scope=website&scopeCode=justrite_test_website&searchCriteria[pageSize]=5`, 2026-11-02. */
export const SYSTEM_CONFIG_PAGE_TEST_WEBSITE: CommerceSystemConfigList = {
    items: [
        { path: 'login_as_customer/general/shopping_assistance_checkbox_title', value: 'Allow remote shopping assistance', scope: 'website', scope_code: 'justrite_test_website' },
        { path: 'general/country/default', value: 'US', scope: 'website', scope_code: 'justrite_test_website' },
        { path: 'general/country/allow', value: 'AF,AL,DZ', scope: 'website', scope_code: 'justrite_test_website' },
        { path: 'general/country/destinations', value: null, scope: 'website', scope_code: 'justrite_test_website' },
    ],
    search_criteria: { filter_groups: [], page_size: 5, current_page: 1 },
    total_count: 943,
};

/** What the instance holds beyond what a wipe's own website reads answer. */
export interface InstanceState {
    companies: CommerceCompany[];
    hierarchies: Record<string, CommerceCompanyHierarchyNode[]>;
    catalogs: CommerceSharedCatalog[];
    groups: CommerceCustomerGroup[];
    sets: Array<{ attribute_set_id: number; attribute_set_name: string }>;
    setAttributes: Record<string, CommerceSetAttribute[]>;
    attributes: CommerceProductAttribute[];
    /** Answer every read of these paths with a 500. */
    failing: readonly RegExp[];
    settings?: { default: CommerceSystemConfigRow[]; websites: Record<string, CommerceSystemConfigRow[]> };
    /** Everyone Commerce moved to group 1 because their group went. A wipe must leave this empty. */
    movedToGeneral: number[];
}

/** Company 28 of the live run: admin 64, buyer 65, on customer group 25. */
export const COMPANY_28 = COMPANY_28_DB08;
export const GROUP_25: CommerceCustomerGroup = { id: 25, code: 'ZZ Test Catalog' };
export const CATALOG_20: CommerceSharedCatalog = { id: 20, name: 'ZZ Test Catalog', type: 0, customer_group_id: 25, store_id: 0, tax_class_id: 3 };
export const PUBLIC_CATALOG: CommerceSharedCatalog = { id: 1, name: 'Default (General)', type: 1, customer_group_id: 1, store_id: 0, tax_class_id: 3 };

const member = (id: number, email: string, websiteId: number, company = 28, groupId = 25): CommerceCustomer => ({
    id,
    email,
    firstname: 'Zz',
    lastname: 'Buyer',
    website_id: websiteId,
    group_id: groupId,
    extension_attributes: { company_attributes: { customer_id: id, company_id: company } },
});

export const ADMIN_64 = member(64, 'db08.admin@example.com', TEST_SITE_ID);
export const BUYER_65 = member(65, 'db08.buyer@example.com', TEST_SITE_ID);
/** The same company's customer on a website not chosen: the company stays. */
export const BUYER_ON_JUSTRITE = member(65, 'db08.buyer@example.com', JUSTRITE_ID);
/** The same company's customer on a website only partly chosen when one of Bodea's stores is. */
export const ADMIN_ON_BODEA = member(64, 'db08.admin@example.com', BODEA_ID);
export const BUYER_ON_BODEA = member(65, 'db08.buyer@example.com', BODEA_ID);
/** Someone with no company on the going group, on another website: the catalog stays. */
export const STRANGER_IN_GROUP: CommerceCustomer = { id: 80, email: 'justrite.buyer@example.com', firstname: 'Jr', lastname: 'Buyer', website_id: JUSTRITE_ID, group_id: 25 };
/** Someone with no company on a group no catalog uses, on the test website. */
export const LONE_SHOPPER: CommerceCustomer = { id: 70, email: 'zz.shopper@example.com', firstname: 'Zz', lastname: 'Shopper', website_id: TEST_SITE_ID, group_id: 30 };
export const GROUP_30: CommerceCustomerGroup = { id: 30, code: 'ZZ Loose Group' };

/** A company on group 25 with admin 64 and buyer 65, on its shared catalog: what the live run built. */
export function b2bInstance(overrides: Partial<InstanceState> = {}): InstanceState {
    return {
        companies: [COMPANY_28],
        hierarchies: { 28: HIERARCHY_28_DB08 },
        catalogs: [PUBLIC_CATALOG, CATALOG_20],
        groups: [GROUP_25, GROUP_30],
        sets: [],
        setAttributes: {},
        attributes: [],
        failing: [],
        movedToGeneral: [],
        ...overrides,
    };
}

/** Commerce's Default set, a set only the test website's products use, and one JustRite's do. */
export const DEFAULT_SET = { attribute_set_id: 4, attribute_set_name: 'Default' };
export const WIPERS_SET = { attribute_set_id: 40, attribute_set_name: 'Wipers' };
export const JUSTRITE_SET = { attribute_set_id: 41, attribute_set_name: 'Cans' };

const carrying = (sku: string, setId: number, codes: string[], websites: number[] = [TEST_SITE_ID]): CommerceProduct => ({
    id: Number(sku.replace(/\D/gu, '')) || 1,
    sku,
    name: sku,
    type_id: 'simple',
    visibility: 4,
    attribute_set_id: setId,
    custom_attributes: codes.map((attribute_code) => ({ attribute_code, value: '1' })),
    extension_attributes: { website_ids: websites },
});

export const WIPER_1 = carrying('ZZ-WIPER-1', 40, ['wiper_size', 'description']);
export const WIPER_2 = carrying('ZZ-WIPER-2', 40, ['wiper_size']);
/** On JustRite's website, in the going set: the set stays. */
export const JUSTRITE_WIPER = carrying('JR-WIPER', 40, ['wiper_size'], [JUSTRITE_ID]);
/** On JustRite's website, in its own set, carrying an attribute the going set also holds. */
export const JUSTRITE_CAN = carrying('JR-CAN', 41, ['can_size'], [JUSTRITE_ID]);
/** On the test website, in the Default set, carrying an attribute the Default set holds. */
export const DEFAULT_SET_PRODUCT = carrying('ZZ-PLAIN', 4, ['cs_format']);
/** On the test website, carrying an ERP integration's attribute. */
export const OWNED_PRODUCT = carrying('ZZ-OWNED', 40, ['erp_owner', 'brand', 'erp_sync_note']);

export const USER_ATTRIBUTE = (attribute_code: string): CommerceProductAttribute => ({ attribute_code, frontend_input: 'text', is_user_defined: true });
export const SYSTEM_ATTRIBUTE = (attribute_code: string): CommerceProductAttribute => ({ attribute_code, frontend_input: 'textarea', is_user_defined: false });

/** Attribute set 40 holding `wiper_size`, the Default set holding `description` and `cs_format`, 41 holding `can_size`. */
export function attributeInstance(overrides: Partial<InstanceState> = {}): InstanceState {
    return b2bInstance({
        companies: [],
        hierarchies: {},
        catalogs: [],
        groups: [],
        sets: [DEFAULT_SET, WIPERS_SET, JUSTRITE_SET],
        setAttributes: {
            4: [{ attribute_code: 'description' }, { attribute_code: 'cs_format' }],
            40: [{ attribute_code: 'wiper_size' }, { attribute_code: 'description' }],
            41: [{ attribute_code: 'can_size' }, { attribute_code: 'description' }],
        },
        attributes: [USER_ATTRIBUTE('wiper_size'), USER_ATTRIBUTE('can_size'), USER_ATTRIBUTE('cs_format'), SYSTEM_ATTRIBUTE('description'), USER_ATTRIBUTE('erp_owner'), USER_ATTRIBUTE('brand'), USER_ATTRIBUTE('erp_sync_note')],
        ...overrides,
    });
}

const row = (path: string, value: string | null, scope: 'default' | 'website', code?: string): CommerceSystemConfigRow => ({ path, value, scope, ...(code ? { scope_code: code } : {}) });

/** A website's values against the Default scope's: one the same, one set on the website, a base URL, a credential, one with no default. */
export function settingsInstance(overrides: Partial<InstanceState> = {}): InstanceState {
    const code = 'justrite_test_website';
    return b2bInstance({
        companies: [],
        hierarchies: {},
        catalogs: [],
        groups: [],
        settings: {
            default: [
                row('general/country/default', 'US', 'default'),
                row('sales/totals_sort/tax', '40', 'default'),
                row('web/secure/base_url', 'https://default.example.com/', 'default'),
                row('carriers/ups/password', '******', 'default'),
                row('general/store_information/name', null, 'default'),
                row('payment/companycredit/active', '0', 'default'),
            ],
            websites: {
                [code]: [
                    row('general/country/default', 'US', 'website', code),
                    row('sales/totals_sort/tax', '41', 'website', code),
                    row('web/secure/base_url', 'https://test.example.com/', 'website', code),
                    row('carriers/ups/password', '******', 'website', code),
                    row('general/store_information/name', 'ZZ Test Store', 'website', code),
                    row('payment/companycredit/active', '1', 'website', code),
                    row('general/country/destinations', null, 'website', code),
                ],
                bodea: [row('sales/totals_sort/tax', '50', 'website', 'bodea')],
                justrite: [row('sales/totals_sort/tax', '60', 'website', 'justrite')],
            },
        },
        ...overrides,
    });
}
