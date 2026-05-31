/**
 * ConnectStoreStepContent - Shared Test Fixtures
 *
 * Pure mock field/service-group fixtures and env-var key constants used across
 * the ConnectStoreStepContent test suites. Not a `*.test.tsx` file, so Jest does
 * not run it directly. Contains no jest.mock wiring (kept in the test files).
 */

export interface MockServiceGroup {
    id: string;
    label: string;
    fields: MockField[];
}

export interface MockField {
    key: string;
    label: string;
    type: string;
    required?: boolean;
    placeholder?: string;
    description?: string;
    componentIds: string[];
    options?: Array<{ value: string; label: string }>;
    default?: string | boolean;
    validation?: { pattern?: string; message?: string };
}

// ---------------------------------------------------------------------------
// Env var key constants (matching real values from envVarKeys.ts)
// ---------------------------------------------------------------------------

export const ACCS_ENDPOINT_KEY = 'ACCS_GRAPHQL_ENDPOINT';
export const PAAS_URL = 'ADOBE_COMMERCE_URL';
export const PAAS_ADMIN_USERNAME = 'ADOBE_COMMERCE_ADMIN_USERNAME';
export const PAAS_ADMIN_PASSWORD = 'ADOBE_COMMERCE_ADMIN_PASSWORD';
export const PAAS_WEBSITE_CODE = 'ADOBE_COMMERCE_WEBSITE_CODE';
export const PAAS_STORE_CODE = 'ADOBE_COMMERCE_STORE_CODE';
export const PAAS_STORE_VIEW_CODE = 'ADOBE_COMMERCE_STORE_VIEW_CODE';
export const ACCS_WEBSITE_CODE = 'ACCS_WEBSITE_CODE';
export const ACCS_STORE_CODE = 'ACCS_STORE_CODE';
export const ACCS_STORE_VIEW_CODE = 'ACCS_STORE_VIEW_CODE';
export const ACCS_CUSTOMER_GROUP = 'ACCS_CUSTOMER_GROUP';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** ACCS connection field — always visible */
export const accsEndpointField: MockField = {
    key: ACCS_ENDPOINT_KEY,
    label: 'GraphQL Endpoint',
    type: 'url',
    required: true,
    placeholder: 'https://...',
    componentIds: ['accs'],
};

/** PaaS connection fields — always visible */
export const paasUrlField: MockField = {
    key: PAAS_URL,
    label: 'Commerce URL',
    type: 'url',
    required: true,
    placeholder: 'https://...',
    componentIds: ['adobe-commerce'],
};

export const paasUsernameField: MockField = {
    key: PAAS_ADMIN_USERNAME,
    label: 'Admin Username',
    type: 'text',
    required: true,
    componentIds: ['adobe-commerce'],
};

export const paasPasswordField: MockField = {
    key: PAAS_ADMIN_PASSWORD,
    label: 'Admin Password',
    type: 'password',
    required: true,
    componentIds: ['adobe-commerce'],
};

/** Store code fields — hidden until discovery completes */
export const paasWebsiteCodeField: MockField = {
    key: PAAS_WEBSITE_CODE,
    label: 'Website Code',
    type: 'select',
    required: true,
    componentIds: ['adobe-commerce'],
};

export const paasStoreCodeField: MockField = {
    key: PAAS_STORE_CODE,
    label: 'Store Code',
    type: 'select',
    required: true,
    componentIds: ['adobe-commerce'],
};

export const paasStoreViewCodeField: MockField = {
    key: PAAS_STORE_VIEW_CODE,
    label: 'Store View Code',
    type: 'select',
    required: true,
    componentIds: ['adobe-commerce'],
};

export const accsWebsiteCodeField: MockField = {
    key: ACCS_WEBSITE_CODE,
    label: 'Website Code',
    type: 'select',
    required: true,
    componentIds: ['accs'],
};

export const accsStoreCodeField: MockField = {
    key: ACCS_STORE_CODE,
    label: 'Store Code',
    type: 'select',
    required: true,
    componentIds: ['accs'],
};

export const accsStoreViewCodeField: MockField = {
    key: ACCS_STORE_VIEW_CODE,
    label: 'Store View Code',
    type: 'select',
    required: true,
    componentIds: ['accs'],
};

export const accsCustomerGroupField: MockField = {
    key: ACCS_CUSTOMER_GROUP,
    label: 'Customer Group',
    type: 'text',
    required: false,
    componentIds: ['accs'],
};

/** PaaS service group with connection + store fields */
export const paasServiceGroup: MockServiceGroup = {
    id: 'adobe-commerce',
    label: 'Adobe Commerce',
    fields: [
        paasUrlField,
        paasUsernameField,
        paasPasswordField,
        paasWebsiteCodeField,
        paasStoreCodeField,
        paasStoreViewCodeField,
    ],
};

/** ACCS service group with connection + store + other fields */
export const accsServiceGroup: MockServiceGroup = {
    id: 'accs',
    label: 'Adobe Commerce Cloud',
    fields: [
        accsEndpointField,
        accsWebsiteCodeField,
        accsStoreCodeField,
        accsStoreViewCodeField,
        accsCustomerGroupField,
    ],
};

/** Non-store service group (e.g., Catalog Service) */
export const catalogServiceGroup: MockServiceGroup = {
    id: 'catalog',
    label: 'Catalog Service',
    fields: [
        {
            key: 'ADOBE_CATALOG_API_KEY',
            label: 'API Key',
            type: 'text',
            required: true,
            componentIds: ['catalog-service'],
        },
    ],
};
