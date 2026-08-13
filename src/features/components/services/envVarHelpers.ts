/**
 * Environment variable helper functions
 *
 * Utilities for deriving and transforming environment variable values
 * based on relationships between fields.
 */

/**
 * Derives the GraphQL endpoint from a Commerce URL.
 * PaaS backends always use {baseUrl}/graphql.
 *
 * @param commerceUrl - The Adobe Commerce base URL
 * @returns The derived GraphQL endpoint URL, or empty string if input is empty
 *
 * @example
 * deriveGraphqlEndpoint('https://my-store.adobedemo.com')
 * // Returns: 'https://my-store.adobedemo.com/graphql'
 *
 * @example
 * deriveGraphqlEndpoint('https://my-store.adobedemo.com/')
 * // Returns: 'https://my-store.adobedemo.com/graphql' (trailing slash removed)
 */
export function deriveGraphqlEndpoint(commerceUrl: string): string {
    if (!commerceUrl) return '';
    const baseUrl = commerceUrl.replace(/\/+$/, '');
    return `${baseUrl}/graphql`;
}

/**
 * ACCS tenant endpoint shape: https://{region}.api.commerce.adobe.com/{tenantId}[/graphql]
 * The admin console lives at the same region/tenant with the `api` label swapped
 * for `admin`. Anchored host match — a lookalike domain or an http endpoint
 * yields undefined (callers fall back to the user-supplied admin URL field).
 */
const ACCS_ENDPOINT_PATTERN = /^https:\/\/([a-z0-9-]+)\.api\.commerce\.adobe\.com\/([^/?#]+)/i;

/**
 * Derives the SaaS Admin Panel URL from an ACCS GraphQL/REST tenant endpoint.
 *
 * Deep-links to the dashboard route — the tenant root serves the SPA shell but
 * doesn't land on the dashboard. The console 200s every path (client-side
 * routing), so a future route change degrades to the SPA fallback, not a 404.
 *
 * @example
 * deriveAccsAdminUrl('https://na1-sandbox.api.commerce.adobe.com/UoGY.../graphql')
 * // Returns: 'https://na1-sandbox.admin.commerce.adobe.com/UoGY.../admin/admin/dashboard/'
 *
 * @returns The derived admin URL, or undefined when the endpoint doesn't match
 *          the ACCS tenant shape.
 */
export function deriveAccsAdminUrl(accsEndpoint: string | undefined): string | undefined {
    const parsed = parseAccsEndpoint(accsEndpoint);
    if (!parsed) return undefined;
    return `https://${parsed.region}.admin.commerce.adobe.com/${parsed.tenantId}/admin/admin/dashboard/`;
}

/**
 * The ACCS tenant id on its own, for callers that need the IDENTITY not a URL.
 *
 * This is the Data Installer's `commerce_instance`. Its live values were measured
 * as 21–22 character base62 nanoids carrying `site_type: "accs"`, and no REST base
 * URL appears in any installation record — the service expands the id to a base URL
 * server-side from its own configuration, so the id is what must be sent.
 *
 * @example
 * deriveAccsTenantId('https://na1-sandbox.api.commerce.adobe.com/UoGY.../graphql')
 * // Returns: 'UoGY...'
 *
 * @returns The tenant id, or undefined when the endpoint doesn't match the ACCS
 *          tenant shape. Undefined means "no answer" and must never be prefilled
 *          into a write target as a guess.
 */
export function deriveAccsTenantId(accsEndpoint: string | undefined): string | undefined {
    return parseAccsEndpoint(accsEndpoint)?.tenantId;
}

/**
 * Split an ACCS endpoint into its region and tenant id, or undefined.
 *
 * Shared by both derivations deliberately. They read the same string format, and
 * the subtle part — that a first segment of `graphql` means the tenant id is
 * absent rather than named "graphql" — is exactly the guard that would drift if
 * each parsed the endpoint its own way.
 */
function parseAccsEndpoint(
    accsEndpoint: string | undefined,
): { region: string; tenantId: string } | undefined {
    if (!accsEndpoint) return undefined;
    const match = ACCS_ENDPOINT_PATTERN.exec(accsEndpoint);
    if (!match) return undefined;
    const [, region, tenantId] = match;
    // A first segment of "graphql" means the tenant id is missing entirely.
    if (tenantId.toLowerCase() === 'graphql') return undefined;
    return { region, tenantId };
}

/**
 * Look up a config value by key across all component configs.
 *
 * Searches each component's config map for the given key, returning
 * the first non-empty string value found. Returns undefined if the
 * key is absent or empty in all components.
 */
export function lookupComponentConfigValue(
    configs: Record<string, Record<string, string | boolean | number | undefined>>,
    key: string,
): string | undefined {
    for (const componentId of Object.keys(configs)) {
        const val = configs[componentId]?.[key];
        if (val !== undefined && val !== '') return String(val);
    }
    return undefined;
}
