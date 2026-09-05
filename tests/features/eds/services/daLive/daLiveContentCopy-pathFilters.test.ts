/**
 * DaLiveContentCopy — the two exported path functions.
 *
 * `filterProductOverlays` decides which `/products/*` documents survive
 * enumeration (only the default template and its children), and
 * `extractReferencedPaths` is the reference-following discovery that pulls
 * unindexed documents like `/customer/nav` from canonical. Both are pure and
 * both decide what does or does not get copied, so every rule they carry is
 * pinned here by the paths that come out.
 */

import {
    extractReferencedPaths,
    filterProductOverlays,
} from '@/features/eds/services/daLive/daLiveContentCopy';

const BASE = 'https://main--site--org.aem.live';

/** `extractReferencedPaths` over a single anchor href. */
function refsFromHref(href: string, base = BASE): string[] {
    return extractReferencedPaths(`<a href="${href}">x</a>`, base);
}

describe('filterProductOverlays', () => {
    it('keeps every non-product path untouched, in order', () => {
        const paths = ['/', '/about', '/customer/login', '/nav'];
        expect(filterProductOverlays(paths)).toEqual(paths);
    });

    it('drops product overlay documents', () => {
        expect(filterProductOverlays(['/products/sku-123', '/about'])).toEqual(['/about']);
    });

    it('keeps the default product template exactly', () => {
        expect(filterProductOverlays(['/products/default'])).toEqual(['/products/default']);
    });

    it('keeps documents nested under the default template', () => {
        expect(filterProductOverlays(['/products/default/details'])).toEqual([
            '/products/default/details',
        ]);
    });

    it('drops a path that merely starts with the default name (no slash boundary)', () => {
        // `/products/defaults` is a different document — endsWith and the
        // trailing-slash include are both boundary checks, not prefixes.
        expect(filterProductOverlays(['/products/defaults'])).toEqual([]);
    });

    it('applies the product rule anywhere in the path, not only at the start', () => {
        expect(filterProductOverlays(['/en/products/sku-1', '/en/products/default'])).toEqual([
            '/en/products/default',
        ]);
    });
});

describe('extractReferencedPaths — what counts as a reference', () => {
    it('returns a site-relative href as-is', () => {
        expect(refsFromHref('/customer/nav')).toEqual(['/customer/nav']);
    });

    it('strips the .html extension so the path matches the enumerated shape', () => {
        expect(refsFromHref('/customer/nav.html')).toEqual(['/customer/nav']);
    });

    it('rewrites an absolute same-site URL to its site-relative path', () => {
        expect(refsFromHref(`${BASE}/customer/nav`)).toEqual(['/customer/nav']);
    });

    it('drops an absolute URL on another host', () => {
        expect(refsFromHref('https://example.com/customer/nav')).toEqual([]);
    });

    it('drops a protocol-relative URL', () => {
        expect(refsFromHref('//example.com/customer/nav')).toEqual([]);
    });

    it('drops mailto: and other schemes', () => {
        expect(refsFromHref('mailto:someone@example.com')).toEqual([]);
    });

    it('drops anchors and relative links', () => {
        expect(extractReferencedPaths('<a href="#top">a</a><a href="./x">b</a>', BASE)).toEqual([]);
    });

    it('trims surrounding whitespace before deciding', () => {
        expect(refsFromHref('  /customer/nav  ')).toEqual(['/customer/nav']);
    });

    it('ignores an empty href', () => {
        expect(refsFromHref('')).toEqual([]);
    });

    it('drops the site root, however it is written', () => {
        expect(extractReferencedPaths(`<a href="/">a</a><a href="${BASE}">b</a>`, BASE)).toEqual(
            []
        );
    });

    it('strips the query string and the fragment', () => {
        expect(refsFromHref('/customer/nav?x=1#top')).toEqual(['/customer/nav']);
    });

    it('drops a path that is only a query string', () => {
        expect(refsFromHref('/?x=1')).toEqual([]);
    });

    it('deduplicates repeated references', () => {
        const html = '<a href="/customer/nav">a</a><a href="/customer/nav.html">b</a>';
        expect(extractReferencedPaths(html, BASE)).toEqual(['/customer/nav']);
    });

    it('reads single-quoted and spaced href attributes too', () => {
        expect(extractReferencedPaths("<a href = '/about'>a</a>", BASE)).toEqual(['/about']);
    });

    it('collects every reference in the document, in first-seen order', () => {
        const html = '<a href="/b">b</a><a href="/a">a</a>';
        expect(extractReferencedPaths(html, BASE)).toEqual(['/b', '/a']);
    });
});

describe('extractReferencedPaths — what is deliberately not a reference', () => {
    it.each([
        '/img.png',
        '/img.JPEG',
        '/img.jpg',
        '/anim.gif',
        '/logo.svg',
        '/photo.webp',
        '/fav.ico',
        '/styles.css',
        '/app.js',
        '/data.json',
        '/doc.pdf',
        '/clip.mp4',
        '/font.woff',
        '/font.woff2',
        '/font.ttf',
    ])('drops the media/asset URL %s', (href) => {
        expect(refsFromHref(href)).toEqual([]);
    });

    it('drops media_ hash URLs wherever they sit in the path', () => {
        expect(refsFromHref('/en/media_1a2b3c')).toEqual([]);
    });

    it('drops the icons and styles directories', () => {
        expect(
            extractReferencedPaths('<a href="/icons/x"></a><a href="/styles/y"></a>', BASE)
        ).toEqual([]);
    });

    it('keeps a path containing a colon that is not a scheme', () => {
        // The scheme test is anchored: a colon further along the path is content.
        expect(refsFromHref('/blog/a:b')).toEqual(['/blog/a:b']);
    });

    it('keeps a path whose first segment is digits followed by a colon', () => {
        expect(refsFromHref('/2024:review')).toEqual(['/2024:review']);
    });

    it('keeps a path whose media extension is not at the END', () => {
        expect(refsFromHref('/blog/my.jsonx')).toEqual(['/blog/my.jsonx']);
    });

    it('strips .html only at the end, never mid-path', () => {
        expect(refsFromHref('/a.html.b')).toEqual(['/a.html.b']);
    });

    it('drops a path that COLLAPSES to the site root once .html is stripped', () => {
        // `/.html` -> `/` at the extension strip, after the earlier root guard
        // has already run. Only the final guard can catch it.
        expect(refsFromHref('/.html')).toEqual([]);
    });

    it('drops product overlays, which the copy pipeline handles elsewhere', () => {
        expect(refsFromHref('/products/sku-1')).toEqual([]);
    });

    it('keeps a path that merely contains "icons" further down', () => {
        expect(refsFromHref('/blog/icons-explained')).toEqual(['/blog/icons-explained']);
    });
});

describe('extractReferencedPaths — the EDS fragment-block convention', () => {
    const fragmentBlock = (path: string): string =>
        `<div class="fragment"><div><div>${path}</div></div></div>`;

    it('reads the path out of a fragment block with no anchor', () => {
        expect(extractReferencedPaths(fragmentBlock('/customer/nav'), BASE)).toEqual([
            '/customer/nav',
        ]);
    });

    it('reads a fragment block whose class list carries other classes', () => {
        const html = '<div class="fragment block"><div><div>/customer/nav</div></div></div>';
        expect(extractReferencedPaths(html, BASE)).toEqual(['/customer/nav']);
    });

    it('ignores a bare path outside a fragment block', () => {
        expect(extractReferencedPaths('<div><div>/customer/nav</div></div>', BASE)).toEqual([]);
    });

    it('ignores a class that merely contains the word fragment', () => {
        const html = '<div class="fragments"><div><div>/customer/nav</div></div></div>';
        expect(extractReferencedPaths(html, BASE)).toEqual([]);
    });

    it('reads a fragment block whose class list carries other classes FIRST', () => {
        const html = '<div class="cards fragment"><div><div>/customer/nav</div></div></div>';
        expect(extractReferencedPaths(html, BASE)).toEqual(['/customer/nav']);
    });

    it('reads a fragment block laid out across lines', () => {
        const html = '<div class="fragment">\n  <div><div>/customer/nav</div></div>\n</div>';
        expect(extractReferencedPaths(html, BASE)).toEqual(['/customer/nav']);
    });

    it('reads the WHOLE nested path, not a trailing segment of it', () => {
        const html = '<div class="fragment"><div><div> /customer/nav </div></div></div>';
        expect(extractReferencedPaths(html, BASE)).toEqual(['/customer/nav']);
    });

    it('merges anchor and fragment references into one deduped list', () => {
        const html = `<a href="/about">a</a>${fragmentBlock('/customer/nav')}`;
        expect(extractReferencedPaths(html, BASE)).toEqual(['/about', '/customer/nav']);
    });

    it('returns nothing for HTML with no references at all', () => {
        expect(extractReferencedPaths('<p>hello</p>', BASE)).toEqual([]);
    });
});
