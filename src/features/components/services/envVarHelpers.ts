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
