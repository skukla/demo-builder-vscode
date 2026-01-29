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
 * - getProductLink: Replaces forward slashes with __ in the SKU before sanitization
 * - getSkuFromUrl: Replaces __ back to forward slashes when extracting
 *
 * Before: /products/urlKey/apple-iphone-se-iphone-se (sanitizeName loses the slash)
 * After:  /products/urlKey/apple-iphone-se__iphone-se (__ preserved, decoded on extract)
 */

export const searchPattern = `function getSkuFromUrl() {
  const path = window.location.pathname;
  const result = path.match(/\\/products\\/[\\w|-]+\\/([\\w|-]+)$/);
  return result?.[1];
}`;

export const replacement = `function getSkuFromUrl() {
  const path = window.location.pathname;
  // Match SKU after /products/{urlKey}/ - allow __ for encoded slashes
  const result = path.match(/\\/products\\/[^/]+\\/([^/]+)$/);
  // Convert __ back to / to restore original SKU for Commerce API
  return result?.[1] ? result[1].replace(/__/g, '/') : null;
}`;
