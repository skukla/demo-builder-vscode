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
    if (!accsEndpoint) return undefined;
    const match = ACCS_ENDPOINT_PATTERN.exec(accsEndpoint);
    if (!match) return undefined;
    const [, region, tenantId] = match;
    // A first segment of "graphql" means the tenant id is missing entirely.
    if (tenantId.toLowerCase() === 'graphql') return undefined;
    return `https://${region}.admin.commerce.adobe.com/${tenantId}/admin/admin/dashboard/`;
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
