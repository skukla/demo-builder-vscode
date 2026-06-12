/**
 * Reversible, lowercase-stable, Helix-path-safe SKU encoding for PDP URLs.
 *
 * Product detail pages live at `/products/{urlKey}/{sku}`. The SKU must survive
 * the round-trip `link -> URL -> read-back -> Commerce lookup`, but aem.live's
 * CDN rejects percent-encoded paths with a bare 404 *before* the storefront
 * renders (see ADR-007). The only safe path alphabet is `[a-z0-9_-]` (Helix
 * lowercases content-bus paths).
 *
 * `encodeSkuForUrl` keeps `[a-z0-9-]` literal and escapes every other UTF-8
 * byte — including `_` itself — as `_HH` (lowercase hex). So:
 *   - clean SKUs (`DigiWristExplorer`) encode to the same slug as before;
 *   - messy SKUs (`Yale UNOplus-Series A`) round-trip instead of breaking;
 *   - output is always lowercase, so the smart-404 lowercase redirect and
 *     Helix's lowercase content-bus are no-ops on it.
 * The decode recovers the SKU modulo case; Catalog Service SKU lookup is
 * case-insensitive, which the routing already relies on.
 *
 * ⚠️ COUPLING: `encodeSkuForUrl` / `decodeSkuFromUrl` here must stay byte-for-
 * byte identical to the `encodeSkuForUrl` / `decodeSkuFromUrl` defined in the
 * `skukla/eds-demo-patches` commerce.js patches. The extension builds
 * prewarm/publish paths with this module; the storefront builds the links it
 * navigates to with the patch. If they diverge, published paths stop matching
 * links and PDPs 404. Change both together; the test fixture is the contract.
 *
 * @module features/eds/services/pdpUrlEncoding
 */

const SAFE_LITERAL = /[a-z0-9-]/;

/**
 * Encode a SKU into a Helix-safe URL path segment.
 *
 * Lowercases first, then emits each UTF-8 byte either literally (when it is an
 * unreserved `[a-z0-9-]` character) or as `_HH` lowercase hex. The result is
 * always within `[a-z0-9_-]` and already lowercase.
 */
export function encodeSkuForUrl(sku: string): string {
    const bytes = new TextEncoder().encode(sku.toLowerCase());
    let out = '';
    for (const b of bytes) {
        const ch = String.fromCharCode(b);
        out += SAFE_LITERAL.test(ch) ? ch : `_${b.toString(16).padStart(2, '0')}`;
    }
    return out;
}

/**
 * Decode a `_HH`-escaped URL segment back to the original SKU (modulo case).
 *
 * `_` always introduces a two-hex-digit escape (the encoder escapes literal
 * underscores too), so parsing is unambiguous. Hex is parsed case-insensitively
 * to be robust against any upstream path uppercasing.
 *
 * Assumes well-formed (encoder-produced) input. A malformed `_` escape (missing
 * or non-hex digits) decodes to a NUL byte rather than throwing; the resulting
 * string simply fails the Commerce lookup. Callers pass encoder output, so this
 * is a defensive note, not a supported input mode.
 */
export function decodeSkuFromUrl(value: string): string {
    const bytes: number[] = [];
    for (let i = 0; i < value.length; i += 1) {
        if (value[i] === '_') {
            bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
            i += 2;
        } else {
            bytes.push(value.charCodeAt(i));
        }
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * Sanitize a urlKey into the URL's first segment, mirroring the storefront
 * `sanitizeName` (commerce.js) so extension-built paths match the urlKey
 * segment of `getProductLink` exactly: lowercase, strip diacritics, collapse
 * non-alphanumeric runs to single dashes, trim leading/trailing dashes.
 */
export function sanitizeUrlKey(urlKey: string): string {
    return urlKey
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
