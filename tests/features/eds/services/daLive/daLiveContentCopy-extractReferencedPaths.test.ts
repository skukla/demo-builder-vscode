/**
 * `extractReferencedPaths` — the pure path extractor.
 *
 * Split out of `daLiveContentOperations-referenceDiscovery.test.ts` on 2026-09-07
 * (PL-45). The function is DECLARED in `daLiveContentCopy.ts` and only re-exported
 * by `daLiveContentOperations.ts`, so these tests were scored against a module they
 * never constrain. The class tests that shared the file stayed behind, because they
 * DO drive `daLiveContentOperations`.
 *
 * No overlap with `daLiveContentCopy-references.test.ts`, which covers the class's
 * reference-FOLLOWING discovery and never calls this function.
 */

import { extractReferencedPaths } from '@/features/eds/services/daLive/daLiveContentCopy';

describe('extractReferencedPaths', () => {
    const base = 'https://main--boilerplate-b2b--adobe-commerce.aem.live';

    it('extracts an internal relative fragment reference (the /customer/nav case)', () => {
        const html =
            '<body><main><div class="columns"><div><div><a href="/customer/nav">/customer/nav</a></div>' +
            '<div>My account</div></div></div></main></body>';
        expect(extractReferencedPaths(html, base)).toEqual(['/customer/nav']);
    });

    it('normalizes an absolute same-site reference to a site-relative path', () => {
        const html = `<a href="${base}/customer/nav">nav</a>`;
        expect(extractReferencedPaths(html, base)).toEqual(['/customer/nav']);
    });

    it('strips a .html extension and query/hash, and dedups', () => {
        const html =
            '<a href="/customer/nav.html?x=1">a</a><a href="/customer/nav#top">b</a>';
        expect(extractReferencedPaths(html, base)).toEqual(['/customer/nav']);
    });

    it('ignores external hosts, protocol-relative, anchors, mailto, and bare relatives', () => {
        const html = [
            '<a href="https://example.com/foo">ext</a>',
            '<a href="//cdn.example.com/x">proto-rel</a>',
            '<a href="#section">anchor</a>',
            '<a href="mailto:x@y.com">mail</a>',
            '<a href="./relative">rel</a>',
            '<a href="">empty</a>',
        ].join('');
        expect(extractReferencedPaths(html, base)).toEqual([]);
    });

    it('ignores media, assets, icons, and product-overlay paths', () => {
        const html = [
            '<a href="/media_abc123.png">img</a>',
            '<a href="/icons/cart.svg">icon</a>',
            '<a href="/styles/styles.css">css</a>',
            '<a href="/products/some-shirt/SKU-1">pdp</a>',
            '<a href="/customer/nav">keep</a>',
        ].join('');
        expect(extractReferencedPaths(html, base)).toEqual(['/customer/nav']);
    });

    it('extracts a fragment-block path authored as bare text (the real /customer/nav case)', () => {
        // Verbatim from boilerplate-b2b /customer/account.plain.html: the nav is
        // referenced by an EDS fragment block whose cell text IS the path (no <a>).
        const html = '<div class="fragment"><div><div>/customer/nav</div></div></div>';
        expect(extractReferencedPaths(html, base)).toEqual(['/customer/nav']);
    });

    it('finds BOTH a fragment-text ref and an anchor link on the same page', () => {
        const html =
            '<div class="fragment"><div><div>/customer/nav</div></div></div>' +
            '<a href="/fr/">Français</a>';
        expect(extractReferencedPaths(html, base).sort()).toEqual(['/customer/nav', '/fr/']);
    });

    it('does not match a path embedded mid-text (only fragment-block paths)', () => {
        expect(extractReferencedPaths('<div>See /customer/nav for details</div>', base)).toEqual([]);
    });

    it('does NOT match a bare-path leaf outside a fragment block (precision)', () => {
        // A bare path in ordinary content is not a fragment reference — don't over-discover it.
        expect(extractReferencedPaths('<div><div>/some/stray/path</div></div>', base)).toEqual([]);
    });

    it('does not match closing tags or non-path cell text', () => {
        expect(extractReferencedPaths('<div>My account</div><div></div>', base)).toEqual([]);
    });

    it('returns an empty array when there are no links', () => {
        expect(extractReferencedPaths('<body><main>no links</main></body>', base)).toEqual([]);
    });

    it('does not return the site root', () => {
        expect(extractReferencedPaths(`<a href="/">home</a><a href="${base}/">home2</a>`, base)).toEqual([]);
    });
});
