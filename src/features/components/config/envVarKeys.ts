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

// ==========================================================
// ACO (Adobe Commerce Optimizer) / Experience Platform
// ==========================================================

export const ACO_API_KEY = 'ACO_API_KEY';
export const EXPERIENCE_PLATFORM_API_KEY = 'EXPERIENCE_PLATFORM_API_KEY';

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
 * these keys — call `resolveBackendOwnedScopeValue` / `applyBackendOwnedScope`
 * from `./backendOwnedScope` rather than hand-rolling a fourth copy. A third
 * resolver (the mesh staleness detector) missed this rule while it was prose
 * only, and could report a mesh clean while it served the wrong website.
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

/**
 * Commerce env-var keys whose VALUES are credentials.
 *
 * These must be stripped from any artifact that claims to be secret-free —
 * today that is the settings export (`includeSecrets: false`), which promises
 * "a secret-free copy" in the `export_project_settings` MCP description.
 *
 * **Why this list rather than `type: 'password'`.** The env-var definitions in
 * `components.json` type exactly ONE var as `password`
 * (`ADOBE_COMMERCE_ADMIN_PASSWORD`); all three API keys are typed `text`,
 * because `type` drives how the Configure field RENDERS, not whether the value
 * is sensitive. Filtering on it would strip the admin password and still write
 * three API keys into a file stamped `includesSecrets: false`.
 *
 * App Builder component secrets are NOT here: their catalog marks them
 * `type: 'secret'` and `splitAppBuilderComponentSecrets` routes them to VS Code
 * SecretStorage, so they never reach `componentConfigs` in the first place.
 *
 * A username is deliberately absent — it is half a credential, not a secret,
 * and the export stays useful for re-import with it present.
 *
 * Adding a Commerce credential? Add it here, or it ships in a "secret-free" file.
 */
export const SECRET_ENV_KEYS: readonly string[] = [
    PAAS_ADMIN_PASSWORD,
    CATALOG_API_KEY,
    ACO_API_KEY,
    EXPERIENCE_PLATFORM_API_KEY,
];

/**
 * Strip every {@link SECRET_ENV_KEYS} value from a componentConfigs map.
 *
 * Returns a new map; the input is untouched, because callers hand this the LIVE
 * `project.componentConfigs` and a mutating strip would empty the running
 * project's credentials.
 *
 * @param configs - componentConfigs, keyed by component id
 * @returns A copy with secret-valued keys removed from every component
 */
export function stripSecretValues<T>(
    configs: Record<string, Record<string, T>> | undefined,
): Record<string, Record<string, T>> {
    const out: Record<string, Record<string, T>> = {};
    for (const [componentId, config] of Object.entries(configs ?? {})) {
        const copy = { ...config };
        for (const key of SECRET_ENV_KEYS) delete copy[key];
        out[componentId] = copy;
    }
    return out;
}
