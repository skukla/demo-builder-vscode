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
    daLiveToken: 'dalive-ims-xyz',
};

describe('helixApiClient', () => {
    let mockFetch: jest.Mock;
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
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
            expect(headers['x-content-source-authorization']).toBe('Bearer dalive-ims-xyz');
        });

        // The 2026-08-22 consolidation's bug fix. Once a site carries any
        // access.admin role — which the setup pipeline itself grants — the
        // admin API closes to callers without an accepted admin identity, and
        // the GitHub token is not one (helixService documented this; the
        // client silently lacked the header, so MCP-driven publishes failed
        // on exactly the protected sites the extension had just created).
        // Same drift class as the DELETE credential caught 2026-08-04.
        it('sends the DA.live Bearer as Authorization — protected sites refuse without it', async () => {
            await previewPage('myorg', 'mysite', '/', 'main', TOKENS);
            await publishPage('myorg', 'mysite', '/', 'main', TOKENS);

            for (const call of mockFetch.mock.calls) {
                const headers = (call[1] as RequestInit).headers as Record<string, string>;
                expect(headers.Authorization).toBe('Bearer dalive-ims-xyz');
            }
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

        // DELETE takes a DIFFERENT credential from publish, and this is the one
        // Helix behaviour the project has pinned as definitive (ADR-002): the
        // Admin API refuses `DELETE /live` while the source still exists in
        // fstab.yaml, and the tested matrix was GitHub token -> 403, API key ->
        // 403, DA.live IMS Bearer -> 204. Only the Bearer bypasses it.
        //
        // REGRESSION (found 2026-08-04 by a parallel-implementation audit): this
        // client reused `buildHeaders` — the PUBLISH credential — for DELETE, so
        // it sent x-auth-token + x-content-source-authorization and NO
        // Authorization header, while its docstring claimed it "Mirrors
        // helixService.deleteResource semantics". Semantics, yes; credentials,
        // no. The 403 is swallowed as a non-fatal 'partial', so the failure never
        // surfaced.
        it('sends the DA.live Bearer as Authorization — the only credential that bypasses the 403', async () => {
            await unpublishPage('myorg', 'mysite', '/p', 'main', TOKENS);

            for (const call of mockFetch.mock.calls) {
                const headers = (call[1] as RequestInit).headers as Record<string, string>;
                expect(headers.Authorization).toBe('Bearer dalive-ims-xyz');
            }
        });

        // The publish credential must not ride along: the matrix says the GitHub
        // token 403s, and sending both leaves it ambiguous which one Helix honours.
        it('does not send the publish credential on a DELETE', async () => {
            await unpublishPage('myorg', 'mysite', '/p', 'main', TOKENS);

            for (const call of mockFetch.mock.calls) {
                const headers = (call[1] as RequestInit).headers as Record<string, string>;
                expect(headers['x-auth-token']).toBeUndefined();
            }
        });

        // Control: PUBLISH keeps its own credential. Without this, deleting the
        // publish headers outright would satisfy both assertions above.
        // Rewritten 2026-08-22: this test used to pin publish as having NO
        // Authorization header — a belief the spine sweep overturned (without
        // it, publishes fail on the admin-protected sites the setup pipeline
        // creates). Publish now sends the GitHub token AND the DA.live Bearer;
        // DELETE remains Bearer-only per the ADR-002 matrix.
        it('PUBLISH sends x-auth-token AND the DA.live Bearer', async () => {
            await publishPage('myorg', 'mysite', '/p', 'main', TOKENS);

            const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<
                string,
                string
            >;
            expect(headers['x-auth-token']).toBe('gh-token-abc');
            expect(headers.Authorization).toBe('Bearer dalive-ims-xyz');
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
