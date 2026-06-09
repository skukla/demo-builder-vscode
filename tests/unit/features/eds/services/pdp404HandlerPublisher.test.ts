/**
 * Smart 404 publisher tests — Phase 1 of BYOM PDP routing.
 *
 * Covers the three pure helpers (buildSmart404Html, derivePrepublishUrl)
 * and the orchestrator (publishSmart404Handler) end-to-end.
 *
 * The publisher MUST be non-fatal at every step: any failure logs and
 * returns `{ published: false, reason }`. These tests enforce that.
 */

import {
    buildSmart404Html,
    derivePrepublishUrl,
    publishSmart404Handler,
} from '@/features/eds/services/pdp404HandlerPublisher';

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

describe('derivePrepublishUrl', () => {
    it('rewrites /render-pdp to /prepublish-pdp at the end of the path', () => {
        const overlay = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp';
        expect(derivePrepublishUrl(overlay)).toBe(
            'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp',
        );
    });

    it('strips the ?org=&site= query the overlay URL carries', () => {
        const overlay = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp?org=skukla&site=citisignal-b2b';
        expect(derivePrepublishUrl(overlay)).toBe(
            'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp',
        );
    });

    it('handles a trailing slash on /render-pdp/', () => {
        const overlay = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp/';
        expect(derivePrepublishUrl(overlay)).toBe(
            'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp',
        );
    });

    it('returns undefined for an unparseable URL', () => {
        expect(derivePrepublishUrl('not-a-url')).toBeUndefined();
        expect(derivePrepublishUrl('')).toBeUndefined();
    });

    it('returns undefined when the path does not end with /render-pdp', () => {
        expect(derivePrepublishUrl('https://example.com/api/v1/web/accs-discovery/discover-stores')).toBeUndefined();
        expect(derivePrepublishUrl('https://example.com/render-pdp/extra-segment')).toBeUndefined();
    });

    it('rejects pathologically long URLs', () => {
        const longUrl = 'https://example.com/' + 'a'.repeat(2500) + '/render-pdp';
        expect(derivePrepublishUrl(longUrl)).toBeUndefined();
    });
});

describe('buildSmart404Html', () => {
    const triggerUrl = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp';

    it('substitutes the trigger URL, org, and site into the template', () => {
        const html = buildSmart404Html(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(html).toContain(triggerUrl);
        expect(html).toContain('org=skukla');
        expect(html).toContain('site=citisignal-b2b');
    });

    it('URL-encodes org and site values that contain special characters', () => {
        const html = buildSmart404Html(triggerUrl, 'my org', 'site-with/slash');
        expect(html).toContain('org=my%20org');
        expect(html).toContain('site=site-with%2Fslash');
    });

    it('embeds the PDP-shape regex so non-PDP 404s show the plain fallback', () => {
        const html = buildSmart404Html(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(html).toContain('/products/');
        expect(html).toContain('Page Not Found');
    });

    it('embeds the infinite-loop guard using the pdpRetry sentinel', () => {
        const html = buildSmart404Html(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(html).toContain('pdpRetry');
        expect(html).toContain('Product not available');
    });

    it('produces a complete HTML document with body content', () => {
        const html = buildSmart404Html(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(html).toMatch(/^<!DOCTYPE html>/);
        expect(html).toContain('<html');
        expect(html).toContain('</html>');
        expect(html).toContain('<script>');
        expect(html).toContain('<main></main>');
    });
});

describe('publishSmart404Handler', () => {
    const repoOwner = 'skukla';
    const repoName = 'citisignal-b2b';
    const daLiveOrg = 'skukla';
    const daLiveSite = 'citisignal-b2b';
    const overlayUrl = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp';

    let mockHelix: { previewAndPublishPage: jest.Mock };
    let mockDaOps: { createSource: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        mockHelix = { previewAndPublishPage: jest.fn().mockResolvedValue(undefined) };
        mockDaOps = { createSource: jest.fn().mockResolvedValue({ success: true, path: '/404.html' }) };
    });

    it('publishes the page on the happy path', async () => {
        const result = await publishSmart404Handler(
            mockHelix as never, mockDaOps as never,
            daLiveOrg, daLiveSite, repoOwner, repoName, overlayUrl, mockLogger as never,
        );

        expect(result).toEqual({ published: true });
        expect(mockDaOps.createSource).toHaveBeenCalledWith(
            daLiveOrg, daLiveSite, '/404.html',
            expect.stringContaining('/prepublish-pdp'),
            { overwrite: true },
        );
        expect(mockHelix.previewAndPublishPage).toHaveBeenCalledWith(repoOwner, repoName, '/404');
    });

    it('skips when BYOM is disabled (overlayUrl is undefined)', async () => {
        const result = await publishSmart404Handler(
            mockHelix as never, mockDaOps as never,
            daLiveOrg, daLiveSite, repoOwner, repoName, undefined, mockLogger as never,
        );

        expect(result).toEqual({ published: false, reason: 'BYOM disabled' });
        expect(mockDaOps.createSource).not.toHaveBeenCalled();
        expect(mockHelix.previewAndPublishPage).not.toHaveBeenCalled();
    });

    it('skips when the overlay URL cannot be parsed', async () => {
        const result = await publishSmart404Handler(
            mockHelix as never, mockDaOps as never,
            daLiveOrg, daLiveSite, repoOwner, repoName, 'not-a-url', mockLogger as never,
        );

        expect(result.published).toBe(false);
        expect(result.reason).toBe('invalid overlay URL');
        expect(mockDaOps.createSource).not.toHaveBeenCalled();
    });

    it('skips when the overlay URL is the wrong shape', async () => {
        const result = await publishSmart404Handler(
            mockHelix as never, mockDaOps as never,
            daLiveOrg, daLiveSite, repoOwner, repoName,
            'https://example.com/api/v1/web/accs-discovery/discover-stores',
            mockLogger as never,
        );

        expect(result.published).toBe(false);
        expect(result.reason).toBe('invalid overlay URL');
    });

    it('skips gracefully when DA.live write fails', async () => {
        mockDaOps.createSource.mockResolvedValue({ success: false, path: '/404.html', error: 'auth expired' });
        const result = await publishSmart404Handler(
            mockHelix as never, mockDaOps as never,
            daLiveOrg, daLiveSite, repoOwner, repoName, overlayUrl, mockLogger as never,
        );

        expect(result.published).toBe(false);
        expect(result.reason).toContain('DA write failed');
        expect(result.reason).toContain('auth expired');
        expect(mockHelix.previewAndPublishPage).not.toHaveBeenCalled();
    });

    it('skips gracefully when Helix preview/publish throws', async () => {
        mockHelix.previewAndPublishPage.mockRejectedValue(new Error('Helix admin 502'));
        const result = await publishSmart404Handler(
            mockHelix as never, mockDaOps as never,
            daLiveOrg, daLiveSite, repoOwner, repoName, overlayUrl, mockLogger as never,
        );

        expect(result.published).toBe(false);
        expect(result.reason).toContain('Helix publish failed');
        expect(result.reason).toContain('Helix admin 502');
        // DA write still happened — the 404 page is in DA, just not yet on the live tier
        expect(mockDaOps.createSource).toHaveBeenCalled();
    });

    it('passes the storefront org and site through to the published HTML', async () => {
        await publishSmart404Handler(
            mockHelix as never, mockDaOps as never,
            'custom-org', 'custom-site', repoOwner, repoName, overlayUrl, mockLogger as never,
        );

        const writtenHtml = mockDaOps.createSource.mock.calls[0][3] as string;
        expect(writtenHtml).toContain('org=custom-org');
        expect(writtenHtml).toContain('site=custom-site');
    });
});
