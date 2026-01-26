/**
 * Patch: product-link-sku-encoding
 *
 * Encodes SKUs in product links to handle special characters.
 * Product SKUs containing forward slashes (e.g., "apple-iphone-se/iphone-se")
 * create invalid URLs with extra path segments, causing 404 errors.
 *
 * Note: URL-encoding (%2F) doesn't work because the Helix CDN rejects
 * percent-encoded slashes in paths. Instead, we use double-underscore (__).
 *
 * This patch modifies:
 * - getProductLink: Replaces forward slashes with __ in the SKU
 * - getSkuFromUrl: Replaces __ back to forward slashes when extracting
 *
 * Before: /products/urlKey/apple-iphone-se/iphone-se (404 - extra segment)
 * After:  /products/urlKey/apple-iphone-se__iphone-se (valid URL)
 */

export const searchPattern = `/**
 * Extracts the SKU from the current URL path.
 * @returns {string|null} The SKU extracted from the URL, or null if not found
 */
function getSkuFromUrl() {
  const path = window.location.pathname;
  const result = path.match(/\\/products\\/[\\w|-]+\\/([\\w|-]+)$/);
  return result?.[1];
}

export function getProductLink(urlKey, sku) {
  return rootLink(\`/products/\${urlKey}/\${sku}\`.toLowerCase());
}`;

export const replacement = `/**
 * Extracts the SKU from the current URL path.
 * Handles SKUs with encoded forward slashes (__ represents /).
 * @returns {string|null} The SKU extracted from the URL, or null if not found
 */
function getSkuFromUrl() {
  const path = window.location.pathname;
  // Match SKU after /products/{urlKey}/ - allow any characters except /
  const result = path.match(/\\/products\\/[^/]+\\/([^/]+)$/);
  // Convert __ back to / to restore original SKU for Commerce API
  return result?.[1] ? result[1].replace(/__/g, '/') : null;
}

/**
 * Generates a product link URL.
 * Encodes forward slashes as __ to create valid URL paths.
 * @param {string} urlKey - The product URL key
 * @param {string} sku - The product SKU
 * @returns {string} The product link URL
 */
export function getProductLink(urlKey, sku) {
  // Replace forward slashes with __ (URL-encoding %2F rejected by CDN)
  const encodedSku = sku.replace(/\\//g, '__');
  return rootLink(\`/products/\${urlKey}/\${encodedSku}\`.toLowerCase());
}`;
