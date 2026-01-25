/**
 * Patch: product-link-sku-encoding
 *
 * URL-encodes SKUs in product links to handle special characters.
 * Product SKUs containing forward slashes (e.g., "apple-iphone-se/iphone-se")
 * create invalid URLs with extra path segments, causing 404 errors.
 *
 * This patch modifies:
 * - getProductLink: URL-encodes the SKU parameter
 * - getSkuFromUrl: Updates regex and decodes URL-encoded SKUs
 *
 * Before: /products/urlKey/apple-iphone-se/iphone-se (404 - extra segment)
 * After:  /products/urlKey/apple-iphone-se%2Fiphone-se (valid URL)
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
 * Handles URL-encoded SKUs (e.g., SKUs containing forward slashes encoded as %2F).
 * @returns {string|null} The SKU extracted from the URL, or null if not found
 */
function getSkuFromUrl() {
  const path = window.location.pathname;
  // Match URL-encoded or plain SKU after /products/{urlKey}/
  const result = path.match(/\\/products\\/[^/]+\\/(.+)$/);
  return result?.[1] ? decodeURIComponent(result[1]) : null;
}

/**
 * Generates a product link URL.
 * URL-encodes the SKU to handle special characters like forward slashes.
 * @param {string} urlKey - The product URL key
 * @param {string} sku - The product SKU
 * @returns {string} The product link URL
 */
export function getProductLink(urlKey, sku) {
  // URL-encode the SKU to handle special characters (e.g., forward slashes)
  const encodedSku = encodeURIComponent(sku);
  return rootLink(\`/products/\${urlKey}/\${encodedSku}\`.toLowerCase());
}`;
