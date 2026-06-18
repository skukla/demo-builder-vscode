/**
 * Account-chrome overlay — tests.
 *
 * Hybrid packages source brand/catalog content from one site but the B2B account
 * chrome (auth pages + the /customer/nav fragment) from the canonical B2B content
 * site. `overlayAccountChrome` copies that chrome from the second source on top of
 * the already-copied brand content — pulled live from the public CDN, no fork.
 */

import {
    DaLiveContentOperations,
    type TokenProvider,
} from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';

jest.mock('@/core/utils/timeoutConfig', () => ({ TIMEOUTS: { NORMAL: 30000, QUICK: 5000 } }));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('overlayAccountChrome', () => {
    const accountOrg = 'adobe-commerce';
    const accountSite = 'boilerplate-b2b';
    const base = `https://main--${accountSite}--${accountOrg}.aem.live`;
    const destOrg = 'user-org';
    const destSite = 'user-site';

    let service: DaLiveContentOperations;
    let logger: Logger;

    const ACCOUNT_HTML = '<body><main><div class="columns"><div><a href="/customer/nav">nav</a></div><div class="commerce-account">Account</div></div></main></body>';
    const NAV_HTML = '<body><main><div><ol><li>My account</li><li>Purchase Orders</li><li>Quotes</li></ol></div></main></body>';

    function ok(body?: string, contentType = 'text/html'): Response {
        return {
            ok: true, status: 200,
            headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
            text: async () => body ?? '', json: async () => ({}), blob: async () => new Blob([body ?? '']),
        } as unknown as Response;
    }
    function notFound(): Response {
        return { ok: false, status: 404, headers: { get: () => null }, text: async () => '', json: async () => ({}), blob: async () => new Blob([]) } as unknown as Response;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;
        const tokenProvider: TokenProvider = { getAccessToken: jest.fn().mockResolvedValue('mock-ims-token') };
        service = new DaLiveContentOperations(tokenProvider, logger);
    });

    it('copies the account page + /customer/nav from the account source', async () => {
        mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
            const method = options?.method ?? 'GET';
            if (method === 'POST' && url.includes('/source/')) return ok();
            if (method === 'HEAD') {
                if (url === `${base}/customer/account.plain.html`) return ok();
                return notFound(); // login + create-account absent on this source
            }
            if (url === `${base}/customer/account.plain.html`) return ok(ACCOUNT_HTML);
            if (url === `${base}/customer/nav.plain.html`) return ok(NAV_HTML);
            return notFound();
        });

        const result = await service.overlayAccountChrome({ org: accountOrg, site: accountSite }, destOrg, destSite);

        expect(result.copiedFiles).toContain('/customer/account');
        expect(result.copiedFiles).toContain('/customer/nav');
        // /customer/nav written to the destination
        const postedNav = mockFetch.mock.calls.some(
            ([u, o]) => typeof u === 'string' && u.includes(`/source/${destOrg}/${destSite}/customer/nav.html`) && (o as RequestInit | undefined)?.method === 'POST',
        );
        expect(postedNav).toBe(true);
    });

    it('only copies auth pages that exist on the account source (no stubs)', async () => {
        mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
            const method = options?.method ?? 'GET';
            if (method === 'POST' && url.includes('/source/')) return ok();
            if (method === 'HEAD') return url === `${base}/customer/account.plain.html` ? ok() : notFound();
            if (url === `${base}/customer/account.plain.html`) return ok('<body><main><div class="commerce-account">A</div></main></body>');
            return notFound();
        });

        const result = await service.overlayAccountChrome({ org: accountOrg, site: accountSite }, destOrg, destSite);
        expect(result.copiedFiles).toEqual(['/customer/account']);
        expect(result.copiedFiles).not.toContain('/customer/login');
    });

    it('no-ops cleanly when the account source has no auth pages', async () => {
        mockFetch.mockImplementation(async () => notFound());
        const result = await service.overlayAccountChrome({ org: accountOrg, site: accountSite }, destOrg, destSite);
        expect(result).toEqual({ success: true, copiedFiles: [], failedFiles: [], totalFiles: 0 });
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('no auth pages found'));
    });
});
