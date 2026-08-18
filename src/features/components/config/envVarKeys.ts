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

/**
 * ACCS credential pair — the IMS OAuth Server-to-Server model, which is the
 * best-practice credential for a SaaS instance.
 *
 * Optional on the component: an ACCS project is created and runs without these,
 * and they are needed only to import sample data. Making them required would put a
 * Developer Console trip in front of every project.
 *
 * The client id is NOT a secret — it is public by design, and only its paired
 * secret belongs in {@link SECRET_ENV_KEYS}.
 */
export const ACCS_OAUTH_CLIENT_ID = 'ACCS_OAUTH_CLIENT_ID';
export const ACCS_OAUTH_CLIENT_SECRET = 'ACCS_OAUTH_CLIENT_SECRET';
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
 * That instruction is now ENFORCED — `tests/sop/credential-env-vars-registered.test.ts`
 * fails on a credential-shaped var in the catalog that is neither listed here nor
 * documented as an exception, so forgetting is loud rather than silent.
 */
export const SECRET_ENV_KEYS: readonly string[] = [
    PAAS_ADMIN_PASSWORD,
    ACCS_OAUTH_CLIENT_SECRET,
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
        out[componentId] = stripSecretKeys(config);
    }
    return out;
}

/**
 * Strip secrets from ONE flat env map.
 *
 * `componentConfigs` is not the only place a manifest keeps env values. Four other
 * fields hold flat snapshots — `meshState.envVars`, `edsStorefrontState.envVars`,
 * `frontendEnvState.envVars` and each `appBuilderComponents[id].envVars` — and
 * they are staleness baselines, so they carry whatever was set at the time,
 * `ADOBE_CATALOG_API_KEY` included.
 *
 * Stripping only `componentConfigs` left those readable through `get_project`,
 * one field over from the leak that motivated the strip in the first place.
 *
 * @param values - a flat env map
 * @returns a copy with every {@link SECRET_ENV_KEYS} entry removed
 */
export function stripSecretKeys<T>(values: Record<string, T> | undefined): Record<string, T> {
    const copy = { ...(values ?? {}) };
    for (const key of SECRET_ENV_KEYS) delete copy[key];
    return copy;
}

/**
 * Every place a project manifest keeps env values, stripped in one call.
 *
 * Callers that hand a whole manifest to something outward-facing — the
 * `get_project` MCP response, a settings export — must not have to remember the
 * list. Enumerated here so adding a field to the manifest and forgetting it is a
 * change in ONE place rather than a silent leak in several.
 *
 * @param manifest - a parsed `.demo-builder.json`
 * @returns a shallow copy with every env-carrying field stripped
 */
export function stripManifestSecrets<T extends Record<string, unknown>>(manifest: T): T {
    const out = { ...manifest } as Record<string, unknown>;

    if (out.componentConfigs) {
        out.componentConfigs = stripSecretValues(
            out.componentConfigs as Record<string, Record<string, unknown>>,
        );
    }

    // Staleness baselines. Each holds whatever env was set when it was captured.
    for (const field of ['meshState', 'edsStorefrontState', 'frontendEnvState']) {
        const state = out[field] as { envVars?: Record<string, unknown> } | undefined;
        if (state?.envVars) {
            out[field] = { ...state, envVars: stripSecretKeys(state.envVars) };
        }
    }

    // Per-integration snapshots, keyed by component id.
    const components = out.appBuilderComponents as
        | Record<string, { envVars?: Record<string, unknown>; providesEnvVars?: Record<string, unknown> }>
        | undefined;
    if (components) {
        const safe: Record<string, unknown> = {};
        for (const [id, entry] of Object.entries(components)) {
            safe[id] = {
                ...entry,
                ...(entry?.envVars ? { envVars: stripSecretKeys(entry.envVars) } : {}),
                ...(entry?.providesEnvVars
                    ? { providesEnvVars: stripSecretKeys(entry.providesEnvVars) }
                    : {}),
            };
        }
        out.appBuilderComponents = safe;
    }

    return out as T;
}
