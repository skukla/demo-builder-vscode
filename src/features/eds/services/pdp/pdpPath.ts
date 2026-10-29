/**
 * The path a product's detail page lives at: `/products/{urlKey}/{sku}`, both
 * segments cleaned by `sanitizeName`.
 *
 * `sanitizeName` is Helix's own path cleaning (`@adobe/helix-shared-string`) and
 * the canonical storefront `commerce.js` copy `getProductLink` uses: lowercase,
 * strip diacritics, every run of characters outside `[a-z0-9]` becomes one `-`,
 * no leading or trailing `-`. Helix applies it to every path it publishes, so
 * any other spelling of the path is one the page never lands at — the defect
 * that 404'd every SKU containing `_` under ADR-007's `_HH` encoding.
 *
 * The cleaning loses information (`RRE-805_White` → `rre-805-white`), so the URL
 * no longer carries the real SKU. The page does: the `render-pdp` overlay writes
 * `<meta name="sku">` at publish time, and the storefront's `getProductSku()`
 * reads it before the URL. See ADR-024.
 *
 * @module features/eds/services/pdp/pdpPath
 */

/** Helix's path cleaning, byte-for-byte. Idempotent. */
export function sanitizeName(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/** The one path a product's page is published at and linked to. */
export function pdpPathFor(urlKey: string, sku: string): string {
    return `/products/${sanitizeName(urlKey)}/${sanitizeName(sku)}`;
}
