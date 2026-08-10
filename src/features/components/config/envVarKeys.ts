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
/**
 * User-supplied Admin Panel link — a PaaS Configure field (PaaS admin paths are
 * custom, not derivable). SaaS projects derive theirs from ACCS_GRAPHQL_ENDPOINT
 * instead (see deriveAccsAdminUrl); an explicit value anywhere still wins.
 */
export const ADMIN_PANEL_URL = 'ADOBE_COMMERCE_ADMIN_URL';
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
export const ACCS_CATALOG_SERVICE_ENDPOINT = 'ACCS_CATALOG_SERVICE_ENDPOINT';

// ==========================================================
// Catalog Service
// ==========================================================

export const CATALOG_API_KEY = 'ADOBE_CATALOG_API_KEY';
export const CATALOG_SERVICE_ENDPOINT = 'ADOBE_CATALOG_SERVICE_ENDPOINT';
export const PAAS_CATALOG_SERVICE_ENDPOINT = 'PAAS_CATALOG_SERVICE_ENDPOINT';

/**
 * Commerce store-scope keys the BACKEND component owns.
 *
 * These same keys are duplicated into other components' configs — notably mesh
 * components — and only the backend's copy is updated when the user changes
 * website / store / store view. Any resolver that picks a winner by iteration
 * order, or by a blanket "mesh wins" rule, will silently return the stale copy.
 *
 * Two resolvers hit this on 2026-08-10, each with a different arbitrary
 * tiebreak: `mergeComponentConfigs` (mesh overrode every key) and
 * `envFileGenerator`'s value lookup (first component in key order won). A
 * project moved to the `citisignal` website kept publishing and deploying
 * `base`, so the storefront queried a website with no products — every PDP
 * returned a valid 200 with an empty product block, and both republish and mesh
 * deploy reported success.
 *
 * Any new resolver over `componentConfigs` must consult the backend first for
 * these keys.
 */
export const BACKEND_OWNED_SCOPE_KEYS: readonly string[] = [
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_CUSTOMER_GROUP,
    PAAS_WEBSITE_CODE,
    PAAS_STORE_CODE,
    PAAS_STORE_VIEW_CODE,
    PAAS_CUSTOMER_GROUP,
];
