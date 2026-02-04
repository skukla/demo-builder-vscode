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
