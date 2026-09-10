/**
 * DaLiveContentOperations — reference-following discovery.
 *
 * What remains after the `extractReferencedPaths` tests moved to
 * `daLiveContentCopy-extractReferencedPaths.test.ts` on 2026-09-07 (PL-45): that
 * function is declared in `daLiveContentCopy.ts` and merely re-exported here, so
 * those tests were scored against a module they never constrain. These drive the
 * CLASS, which IS declared in this module.
 */

import {
    DaLiveContentOperations,
    type DaLiveContentSource,
    type TokenProvider,
} from '@/features/eds/services/daLive/daLiveContentOperations';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { NORMAL: 30000, QUICK: 5000 },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

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
        mockLogger = createMockLogger() as unknown as Logger;
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

        const { createPatchReport, getUnapplied } = await import('@/features/eds/services/patches/patchReportHelper');
        const report = createPatchReport();
        await service.copyContentFromSource(source(), destOrg, destSite, undefined, undefined, undefined, report);

        const unapplied = getUnapplied(report);
        expect(unapplied.some((u) => u.kind === 'reference' && u.target === '/customer/nav')).toBe(true);
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('referenced document not copied: /customer/nav'));
    });

    it('stays silent about references a later stage is configured to supply', async () => {
        // Hybrid packages copy brand content first, then overlay /customer/* from the
        // canonical B2B site. The brand source legitimately has none of those pages, so
        // auditing them here reports a gap the very next pipeline step fills — six
        // warnings on every correct create and reset, which teaches people to ignore
        // warnings. Anything OUTSIDE the deferred prefixes must still be reported.
        mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
            const method = options?.method ?? 'GET';
            if (url.includes('/list/')) return status(404);
            if (url.includes('full-index.json')) return jsonResponse({ data: [] });
            if (method === 'HEAD') return url.includes('/customer/account.plain.html') ? status(200) : status(404);
            if (method === 'POST' && url.includes('/source/')) return status(200);
            if (url === `${sourceBase}/customer/account.plain.html`) {
                return htmlResponse(
                    '<body><main><div><a href="/customer/nav">n</a><a href="/brand-page">b</a></div></main></body>',
                );
            }
            return status(404); // both references 404 on the brand source
        });

        const { createPatchReport, getUnapplied } = await import('@/features/eds/services/patches/patchReportHelper');
        const report = createPatchReport();
        report.deferredReferencePrefixes = ['/customer/'];
        await service.copyContentFromSource(source(), destOrg, destSite, undefined, undefined, undefined, report);

        const unapplied = getUnapplied(report);
        expect(unapplied.some((u) => u.kind === 'reference' && u.target === '/customer/nav')).toBe(false);
        expect(mockLogger.warn).not.toHaveBeenCalledWith(
            expect.stringContaining('referenced document not copied: /customer/nav'),
        );
        // The audit still does its job for everything else.
        expect(unapplied.some((u) => u.kind === 'reference' && u.target === '/brand-page')).toBe(true);
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('referenced document not copied: /brand-page'),
        );
    });
});
