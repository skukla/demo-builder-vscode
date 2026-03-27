/**
 * Commerce Environment Variable Key Constants
 *
 * Single source of truth for env var keys used across components.json,
 * service group definitions, handlers, and UI components. A rename here
 * triggers compile errors at every reference site.
 *
 * @module features/components/config/envVarKeys
 */

// ==========================================================
// PaaS (Adobe Commerce on-prem / DSN)
// ==========================================================

export const PAAS_URL = 'ADOBE_COMMERCE_URL';
export const PAAS_GRAPHQL_ENDPOINT = 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT';
export const PAAS_ADMIN_USERNAME = 'ADOBE_COMMERCE_ADMIN_USERNAME';
export const PAAS_ADMIN_PASSWORD = 'ADOBE_COMMERCE_ADMIN_PASSWORD';
export const PAAS_WEBSITE_CODE = 'ADOBE_COMMERCE_WEBSITE_CODE';
export const PAAS_STORE_CODE = 'ADOBE_COMMERCE_STORE_CODE';
export const PAAS_STORE_VIEW_CODE = 'ADOBE_COMMERCE_STORE_VIEW_CODE';
export const PAAS_CUSTOMER_GROUP = 'ADOBE_COMMERCE_CUSTOMER_GROUP';
export const PAAS_ENVIRONMENT_ID = 'ADOBE_COMMERCE_ENVIRONMENT_ID';

// ==========================================================
// ACCS (Adobe Commerce Cloud Service)
// ==========================================================

export const ACCS_GRAPHQL_ENDPOINT = 'ACCS_GRAPHQL_ENDPOINT';
export const ACCS_WEBSITE_CODE = 'ACCS_WEBSITE_CODE';
export const ACCS_STORE_CODE = 'ACCS_STORE_CODE';
export const ACCS_STORE_VIEW_CODE = 'ACCS_STORE_VIEW_CODE';
export const ACCS_CUSTOMER_GROUP = 'ACCS_CUSTOMER_GROUP';
export const ACCS_DISCOVERY_SERVICE_URL = 'ACCS_DISCOVERY_SERVICE_URL';
export const ACCS_CATALOG_SERVICE_ENDPOINT = 'ACCS_CATALOG_SERVICE_ENDPOINT';

// ==========================================================
// Catalog Service
// ==========================================================

export const CATALOG_API_KEY = 'ADOBE_CATALOG_API_KEY';
export const CATALOG_SERVICE_ENDPOINT = 'ADOBE_CATALOG_SERVICE_ENDPOINT';
export const PAAS_CATALOG_SERVICE_ENDPOINT = 'PAAS_CATALOG_SERVICE_ENDPOINT';

