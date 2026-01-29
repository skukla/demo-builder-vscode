/**
 * Patch: product-link-sku-slash-encoding
 *
 * Encodes forward slashes in SKUs AFTER sanitization.
 * Works in conjunction with product-link-sku-encoding patch.
 *
 * The sanitizeName function replaces non-alphanumeric chars with dashes,
 * which destroys the slash information in SKUs like "apple-iphone-se/iphone-se".
 *
 * Important: We must encode AFTER sanitization because sanitizeName replaces
 * underscores with dashes, destroying the __ encoding.
 *
 * Strategy:
 * 1. Split SKU on "/" to get parts
 * 2. Sanitize each part separately
 * 3. Join with "__" (double underscore) as the delimiter
 * 4. getSkuFromUrl decodes __ back to / when extracting the SKU
 */

export const searchPattern = `export function getProductLink(urlKey, sku) {
  if (!urlKey) {
    console.warn('getProductLink: urlKey is missing or empty', { urlKey, sku });
  }
  if (!sku) {
    console.warn('getProductLink: sku is missing or empty', { urlKey, sku });
  }
  const sanitizedUrlKey = urlKey ? sanitizeName(urlKey) : '';
  const sanitizedSku = sku ? sanitizeName(sku) : '';
  return rootLink(\`/products/\${sanitizedUrlKey}/\${sanitizedSku}\`);
}`;

export const replacement = `export function getProductLink(urlKey, sku) {
  if (!urlKey) {
    console.warn('getProductLink: urlKey is missing or empty', { urlKey, sku });
  }
  if (!sku) {
    console.warn('getProductLink: sku is missing or empty', { urlKey, sku });
  }
  const sanitizedUrlKey = urlKey ? sanitizeName(urlKey) : '';
  // Handle SKUs containing forward slashes (e.g., "apple-iphone-se/iphone-se")
  // Split on "/", sanitize each part, then join with "__" as delimiter
  // getSkuFromUrl will decode __ back to / when extracting the SKU
  const sanitizedSku = sku
    ? sku.split('/').map(part => sanitizeName(part)).join('__')
    : '';
  return rootLink(\`/products/\${sanitizedUrlKey}/\${sanitizedSku}\`);
}`;
