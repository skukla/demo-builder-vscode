/**
 * PDP URL encoding tests.
 *
 * Pins the reversible, lowercase-stable, Helix-path-safe SKU encoding used
 * to build product detail page URLs (`/products/{urlKey}/{sku}`).
 *
 * Background (ADR-007): aem.live's CDN rejects percent-encoded paths with a
 * bare 404 before the storefront renders, so `encodeURIComponent` is unusable.
 * The safe path alphabet is `[a-z0-9_-]` (Helix lowercases content-bus paths).
 * This encoder keeps `[a-z0-9-]` literal and escapes every other UTF-8 byte as
 * `_HH` (lowercase hex), so the SKU round-trips for any input while clean SKUs
 * stay byte-identical to the old slug.
 *
 * CRITICAL: this TS implementation must stay byte-for-byte identical to the
 * `encodeSkuForUrl`/`decodeSkuFromUrl` defined in the `eds-demo-patches`
 * commerce.js patches — prewarmed/published paths must match the links the
 * storefront generates. The fixture table below is the shared contract.
 */

import {
    encodeSkuForUrl,
    decodeSkuFromUrl,
    sanitizeUrlKey,
} from '@/features/eds/services/pdpUrlEncoding';

/** Shared contract: input SKU -> exact encoded URL segment. Mirror in the patch repo. */
const ENCODE_FIXTURES: ReadonlyArray<readonly [string, string]> = [
    ['DigiWristExplorer', 'digiwristexplorer'], // clean: no-op (just lowercased)
    ['24-MB01', '24-mb01'], // digits + hyphen: kept literal
    ['pulsewear-max-3', 'pulsewear-max-3'], // already a clean slug
    ['Yale UNOplus-Series A Rachet Lever Hoist',
        'yale_20unoplus-series_20a_20rachet_20lever_20hoist'], // spaces -> _20
    ['apple-iphone-se/iphone-se', 'apple-iphone-se_2fiphone-se'], // slash -> _2f
    ['A&B#1', 'a_26b_231'], // punctuation -> _HH
    ['a_b', 'a_5fb'], // literal underscore self-escapes -> _5f
    ['café', 'caf_c3_a9'], // multi-byte UTF-8: é -> _c3_a9
];

describe('encodeSkuForUrl', () => {
    it.each(ENCODE_FIXTURES)('encodes %p -> %p', (input, expected) => {
        expect(encodeSkuForUrl(input)).toBe(expected);
    });

    it('is a no-op (modulo lowercasing) for already-clean SKUs', () => {
        expect(encodeSkuForUrl('digiwristexplorer')).toBe('digiwristexplorer');
    });

    it('only ever emits characters in the Helix-safe alphabet [a-z0-9_-]', () => {
        const messy = 'Foo Bar/Baz #9 — café_ñ! @{}';
        expect(encodeSkuForUrl(messy)).toMatch(/^[a-z0-9_-]*$/);
    });

    it('output is already lowercase, so the smart-404 lowercase redirect is a no-op', () => {
        const encoded = encodeSkuForUrl('Yale UNOplus-Series A Rachet Lever Hoist');
        expect(encoded.toLowerCase()).toBe(encoded);
    });
});

describe('decodeSkuFromUrl', () => {
    it.each(ENCODE_FIXTURES)('decodes the encoding of %p back to its lowercased SKU', (input, encoded) => {
        // Round-trip is modulo case (Helix lowercases paths; Catalog Service
        // SKU lookup is case-insensitive — see ADR-007 / catalog memory).
        expect(decodeSkuFromUrl(encoded)).toBe(input.toLowerCase());
    });

    it('round-trips a spaced SKU to its exact (lowercased) value', () => {
        const sku = 'Yale UNOplus-Series A Rachet Lever Hoist';
        expect(decodeSkuFromUrl(encodeSkuForUrl(sku))).toBe('yale unoplus-series a rachet lever hoist');
    });

    it('decodes uppercased hex too (defensive against an upstream path uppercasing)', () => {
        // _20 vs _2F must both decode to the same byte; the smart-404 path
        // handling lowercases, but hex parsing must not depend on case.
        expect(decodeSkuFromUrl('a_2Fb')).toBe('a/b');
        expect(decodeSkuFromUrl('a_2fb')).toBe('a/b');
    });
});

describe('sanitizeUrlKey', () => {
    // Mirrors the storefront commerce.js `sanitizeName` so extension-built
    // paths match getProductLink's urlKey segment exactly.
    it.each([
        ['Orchard-2', 'orchard-2'],
        ['pulsewear-max-3', 'pulsewear-max-3'],
        ['Some Product Name', 'some-product-name'],
        ['café', 'cafe'], // diacritics stripped via NFD
        ['--trim--', 'trim'], // leading/trailing dashes removed
    ])('sanitizes %p -> %p', (input, expected) => {
        expect(sanitizeUrlKey(input)).toBe(expected);
    });
});
