/**
 * Helix API Client Tests
 *
 * Verifies the vscode-free HTTP wrapper for admin.hlx.page:
 * - URL construction (preview/<env> vs live/<env>, branch + path normalization)
 * - Required headers (x-auth-token, x-content-source-authorization)
 * - Error classes for 401, 403, and non-OK responses
 * - previewAndPublishPage chains preview then publish
 */

import {
    HelixApiError,
    previewAndPublishPage,
    previewPage,
    publishPage,
    unpublishPage,
    type HelixTokens,
} from '@/features/eds/services/helixApiClient';

const TOKENS: HelixTokens = {
    githubToken: 'gh-token-abc',
    contentSourceAuthorization: 'Bearer dalive-ims-xyz',
};

describe('helixApiClient', () => {
    let mockFetch: jest.Mock;
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
        // @ts-expect-error overriding for tests
        global.fetch = mockFetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe('previewPage', () => {
        it('POSTs to admin.hlx.page/preview/<org>/<site>/<branch><path>', async () => {
            await previewPage('myorg', 'mysite', '/products', 'main', TOKENS);

            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/preview/myorg/mysite/main/products',
                expect.objectContaining({ method: 'POST' }),
            );
        });

        it('normalizes a path missing the leading slash', async () => {
            await previewPage('myorg', 'mysite', 'products', 'main', TOKENS);

            const url = mockFetch.mock.calls[0][0] as string;
            expect(url).toBe('https://admin.hlx.page/preview/myorg/mysite/main/products');
        });

        it('attaches x-auth-token and x-content-source-authorization headers', async () => {
            await previewPage('myorg', 'mysite', '/', 'main', TOKENS);

            const init = mockFetch.mock.calls[0][1] as RequestInit;
            const headers = init.headers as Record<string, string>;
            expect(headers['x-auth-token']).toBe('gh-token-abc');
            // The content-source-authorization value is now pre-resolved by the
            // caller (DaLiveContentSource → `Bearer <imsToken>`); byte-identical wire.
            expect(headers['x-content-source-authorization']).toBe('Bearer dalive-ims-xyz');
        });

        it('omits x-content-source-authorization when none is provided (AEM owns read auth server-side)', async () => {
            await previewPage('myorg', 'mysite', '/', 'main', { githubToken: 'gh-token-abc' });

            const init = mockFetch.mock.calls[0][1] as RequestInit;
            const headers = init.headers as Record<string, string>;
            expect(headers['x-auth-token']).toBe('gh-token-abc');
            // No empty `Bearer ` — the header is absent entirely.
            expect(headers).not.toHaveProperty('x-content-source-authorization');
        });

        it('throws HelixApiError(401) on 401', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });

            await expect(previewPage('o', 's', '/', 'main', TOKENS)).rejects.toMatchObject({
                name: 'HelixApiError',
                status: 401,
            });
        });

        it('throws HelixApiError(403) on 403', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });

            await expect(previewPage('o', 's', '/', 'main', TOKENS)).rejects.toMatchObject({
                name: 'HelixApiError',
                status: 403,
            });
        });

        it('throws HelixApiError(status) on other non-OK responses', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' });

            await expect(previewPage('o', 's', '/', 'main', TOKENS)).rejects.toMatchObject({
                name: 'HelixApiError',
                status: 500,
            });
        });
    });

    describe('publishPage', () => {
        it('POSTs to admin.hlx.page/live/<org>/<site>/<branch><path>', async () => {
            await publishPage('myorg', 'mysite', '/', 'main', TOKENS);

            const url = mockFetch.mock.calls[0][0] as string;
            expect(url).toBe('https://admin.hlx.page/live/myorg/mysite/main/');
        });
    });

    describe('previewAndPublishPage', () => {
        it('calls preview then publish in order', async () => {
            await previewAndPublishPage('o', 's', '/', 'main', TOKENS);

            expect(mockFetch).toHaveBeenCalledTimes(2);
            const previewUrl = mockFetch.mock.calls[0][0] as string;
            const publishUrl = mockFetch.mock.calls[1][0] as string;
            expect(previewUrl).toContain('/preview/');
            expect(publishUrl).toContain('/live/');
        });

        it('aborts the chain if preview fails', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });

            await expect(previewAndPublishPage('o', 's', '/', 'main', TOKENS)).rejects.toBeInstanceOf(HelixApiError);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('defaults path to "/" and branch to "main"', async () => {
            await previewAndPublishPage('o', 's', undefined as never, undefined as never, TOKENS);

            const previewUrl = mockFetch.mock.calls[0][0] as string;
            expect(previewUrl).toBe('https://admin.hlx.page/preview/o/s/main/');
        });
    });

    describe('unpublishPage', () => {
        it('DELETEs the live partition then the preview partition', async () => {
            await unpublishPage('myorg', 'mysite', '/.da/library/blocks/hero-cta', 'main', TOKENS);

            expect(mockFetch).toHaveBeenCalledTimes(2);
            const liveCall = mockFetch.mock.calls[0];
            const previewCall = mockFetch.mock.calls[1];
            expect(liveCall[0]).toBe(
                'https://admin.hlx.page/live/myorg/mysite/main/.da/library/blocks/hero-cta',
            );
            expect((liveCall[1] as RequestInit).method).toBe('DELETE');
            expect(previewCall[0]).toBe(
                'https://admin.hlx.page/preview/myorg/mysite/main/.da/library/blocks/hero-cta',
            );
            expect((previewCall[1] as RequestInit).method).toBe('DELETE');
        });

        it('treats 404 (already absent) as success on both partitions', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

            await expect(unpublishPage('o', 's', '/p', 'main', TOKENS)).resolves.toBe(true);
        });

        it('returns false (non-fatal) on a 403 auth failure', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });

            await expect(unpublishPage('o', 's', '/p', 'main', TOKENS)).resolves.toBe(false);
        });

        it('throws HelixApiError on a 5xx response', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Unavailable' });

            await expect(unpublishPage('o', 's', '/p', 'main', TOKENS)).rejects.toBeInstanceOf(HelixApiError);
        });

        it('defaults path to "/" and branch to "main"', async () => {
            await unpublishPage('o', 's', undefined as never, undefined as never, TOKENS);

            expect(mockFetch.mock.calls[0][0]).toBe('https://admin.hlx.page/live/o/s/main/');
        });
    });

    describe('does not import vscode', () => {
        it('module file has no `import * as vscode` or `from "vscode"`', () => {

            const fs = require('fs') as typeof import('fs');

            const path = require('path') as typeof import('path');
            const source = fs.readFileSync(
                path.join(__dirname, '../../../../src/features/eds/services/helixApiClient.ts'),
                'utf-8',
            );
            expect(source).not.toMatch(/from\s+['"]vscode['"]/);
            expect(source).not.toMatch(/require\(['"]vscode['"]\)/);
        });
    });
});
