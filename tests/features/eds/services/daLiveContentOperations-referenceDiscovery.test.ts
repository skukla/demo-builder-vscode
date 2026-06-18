/**
 * DA.live Content Operations Tests — reference-following discovery
 *
 * Covers the fix for the "silently-dropped content" bug class: pages can embed
 * other authored documents (e.g. the account page embeds the /customer/nav
 * fragment) that are not in the content index and not in any hardcoded backfill
 * list. `extractReferencedPaths` finds those internal references and
 * `copyContentFromSource` follows them so the copy pipeline pulls them from
 * canonical.
 */

import {
    DaLiveContentOperations,
    extractReferencedPaths,
    type DaLiveContentSource,
    type TokenProvider,
} from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { NORMAL: 30000, QUICK: 5000 },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

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

    it('does not match a path embedded mid-text (only whole-cell paths)', () => {
        expect(extractReferencedPaths('<div>See /customer/nav for details</div>', base)).toEqual([]);
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

describe('copyContentFromSource — reference-following discovery', () => {
    const sourceOrg = 'adobe-commerce';
    const sourceSite = 'boilerplate-b2b';
    const destOrg = 'user-org';
    const destSite = 'user-site';
    const sourceBase = `https://main--${sourceSite}--${sourceOrg}.aem.live`;

    let service: DaLiveContentOperations;
    let mockLogger: Logger;

    const ACCOUNT_HTML =
        '<body><main><div class="columns"><div>' +
        '<div><a href="/customer/nav">/customer/nav</a></div>' +
        '<div class="commerce-account">My account</div>' +
        '</div></div></main></body>';
    // The nav fragment carries the permission-gated menu rows — and crucially NO
    // hrefs, so following it does not trigger further discovery.
    const NAV_HTML =
        '<body><main><div><ol><li>My account</li><li>Purchase Orders</li>' +
        '<li>Quotes</li><li>Requisition Lists</li></ol></div></main></body>';
    const ABOUT_HTML = '<body><main><div>About us</div></main></body>';

    function htmlResponse(text: string): Response {
        return {
            ok: true,
            status: 200,
            headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html' : null) },
            text: async () => text,
            blob: async () => new Blob([text]),
            json: async () => ({}),
        } as unknown as Response;
    }
    function jsonResponse(body: unknown): Response {
        return {
            ok: true,
            status: 200,
            headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
            json: async () => body,
            text: async () => JSON.stringify(body),
        } as unknown as Response;
    }
    function status(code: number): Response {
        return {
            ok: code >= 200 && code < 300,
            status: code,
            statusText: code === 404 ? 'Not Found' : 'OK',
            headers: { get: () => null },
            text: async () => '',
            json: async () => ({}),
            blob: async () => new Blob([]),
        } as unknown as Response;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;
        const tokenProvider: TokenProvider = { getAccessToken: jest.fn().mockResolvedValue('mock-ims-token') };
        service = new DaLiveContentOperations(tokenProvider, mockLogger);

        mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
            const method = options?.method ?? 'GET';

            // Force the CDN-index fallback: the DA.live list API is unavailable
            // (user not in the source org) — exactly the b2b-package situation.
            if (url.includes('/list/')) return status(404);

            // Content index: only /about is indexed (NOT /customer/account or /customer/nav).
            if (url.includes('full-index.json')) return jsonResponse({ data: [{ path: '/about' }] });

            if (method === 'HEAD') {
                // Auth-page existence probe now targets `.plain.html` (Step 2 fix):
                // the account page exists; login/create-account do not.
                if (url.includes('/customer/account.plain.html')) return status(200);
                // spreadsheets, isSpreadsheet checks, bare fragment probes, other auth pages
                return status(404);
            }

            // Destination writes succeed.
            if (method === 'POST' && url.includes('/source/')) return status(200);

            // Source copies (.plain.html GET).
            if (url === `${sourceBase}/customer/account.plain.html`) return htmlResponse(ACCOUNT_HTML);
            if (url === `${sourceBase}/customer/nav.plain.html`) return htmlResponse(NAV_HTML);
            if (url === `${sourceBase}/about.plain.html`) return htmlResponse(ABOUT_HTML);

            return status(404);
        });
    });

    function source(): DaLiveContentSource {
        return { org: sourceOrg, site: sourceSite, indexUrl: `${sourceBase}/full-index.json` };
    }

    it('follows the account page reference and copies the /customer/nav fragment', async () => {
        const result = await service.copyContentFromSource(source(), destOrg, destSite);

        // The fragment was fetched from canonical…
        expect(mockFetch).toHaveBeenCalledWith(
            `${sourceBase}/customer/nav.plain.html`,
            expect.objectContaining({ signal: expect.anything() }),
        );
        // …and written to the destination DA.live site.
        const postedNav = mockFetch.mock.calls.some(
            ([u, o]) =>
                typeof u === 'string' &&
                u.includes(`/source/${destOrg}/${destSite}/customer/nav.html`) &&
                (o as RequestInit | undefined)?.method === 'POST',
        );
        expect(postedNav).toBe(true);
        expect(result.copiedFiles).toContain('/customer/nav');
    });

    it('copies the account page itself (probe uses .plain.html, not the login-gated bare URL)', async () => {
        const result = await service.copyContentFromSource(source(), destOrg, destSite);
        expect(mockFetch).toHaveBeenCalledWith(`${sourceBase}/customer/account.plain.html`, { method: 'HEAD' });
        expect(result.copiedFiles).toContain('/customer/account');
    });

    it('does not fail the whole copy when a discovered reference 404s', async () => {
        // Account page references a dead link in addition to the real fragment.
        mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
            const method = options?.method ?? 'GET';
            if (url.includes('/list/')) return status(404);
            if (url.includes('full-index.json')) return jsonResponse({ data: [] });
            if (method === 'HEAD') return url.includes('/customer/account.plain.html') ? status(200) : status(404);
            if (method === 'POST' && url.includes('/source/')) return status(200);
            if (url === `${sourceBase}/customer/account.plain.html`) {
                return htmlResponse('<body><main><div><a href="/customer/nav">n</a><a href="/dead-link">d</a></div></main></body>');
            }
            if (url === `${sourceBase}/customer/nav.plain.html`) return htmlResponse(NAV_HTML);
            return status(404); // /dead-link.plain.html → 404
        });

        const result = await service.copyContentFromSource(source(), destOrg, destSite);
        expect(result.success).toBe(true);
        expect(result.copiedFiles).toContain('/customer/nav');
        expect(result.copiedFiles).not.toContain('/dead-link');
    });

    it('completeness audit reports a referenced doc that could not be copied', async () => {
        mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
            const method = options?.method ?? 'GET';
            if (url.includes('/list/')) return status(404);
            if (url.includes('full-index.json')) return jsonResponse({ data: [] });
            if (method === 'HEAD') return url.includes('/customer/account.plain.html') ? status(200) : status(404);
            if (method === 'POST' && url.includes('/source/')) return status(200);
            if (url === `${sourceBase}/customer/account.plain.html`) {
                return htmlResponse('<body><main><div><a href="/customer/nav">n</a></div></main></body>');
            }
            return status(404); // /customer/nav.plain.html → 404 (genuinely missing)
        });

        const { createPatchReport, getUnapplied } = await import('@/features/eds/services/patchReportHelper');
        const report = createPatchReport();
        await service.copyContentFromSource(source(), destOrg, destSite, undefined, undefined, undefined, report);

        const unapplied = getUnapplied(report);
        expect(unapplied.some((u) => u.kind === 'reference' && u.target === '/customer/nav')).toBe(true);
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('referenced document not copied: /customer/nav'));
    });
});
