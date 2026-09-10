/**
 * DaLiveContentCopy — `copySingleFile`, the one write every other copy path
 * funnels through.
 *
 * What is pinned here is the DECISIONS it makes, read off the arguments its
 * collaborators receive: which host it reads (preview vs published), which
 * source URL shape it builds, which destination URL it writes to, which token
 * it carries, and which outcome each response status produces.
 */

import {
    createCopyHarness,
    mockFetch,
    mockResponse,
    mockUnreadableResponse,
    requestInitOf,
    routeFetch,
    uploadedTextOf,
    TEST_TOKEN,
    type CopyHarness,
} from './daLiveContentCopy.testUtils';
import { DaLiveAuthError } from '@/features/eds/services/types';
import { sleep } from '@/core/utils/sleep';

const SOURCE = { org: 'src-org', site: 'src-site' };
const DEST = { org: 'dest-org', site: 'dest-site' };
const LIVE = 'https://main--src-site--src-org.aem.live';
const PAGE = 'https://main--src-site--src-org.aem.page';

describe('DaLiveContentCopy.copySingleFile', () => {
    let h: CopyHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createCopyHarness();
    });

    /** Spreadsheet probe 404s, the CDN read returns HTML, the write is left to the spec. */
    function routeHtmlSource(html = '<p>hi</p>'): Array<{ url: string; init?: RequestInit }> {
        return routeFetch([
            { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
            {
                when: (u) => u.endsWith('.plain.html'),
                respond: mockResponse(200, html, 'text/html'),
            },
        ]);
    }

    describe('reading the source', () => {
        it('reads the published host and the .plain.html variant for an extensionless path', async () => {
            const calls = routeHtmlSource();

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            expect(calls.map((c) => c.url)).toContain(`${LIVE}/about.plain.html`);
        });

        it('reads the PREVIEW host when source.preview is set', async () => {
            const calls = routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                { when: (u) => u.endsWith('.plain.html'), respond: mockResponse(200, '<p/>') },
            ]);

            await h.copy.copySingleFile(
                TEST_TOKEN,
                { ...SOURCE, preview: true },
                '/.da/library/blocks/hero',
                DEST,
                '/.da/library/blocks/hero'
            );

            expect(calls.map((c) => c.url)).toContain(`${PAGE}/.da/library/blocks/hero.plain.html`);
        });

        it('reads a non-HTML path verbatim (no .plain.html suffix)', async () => {
            const calls = routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                { when: (u) => u.endsWith('.png'), respond: mockResponse(200, '', 'image/png') },
            ]);

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/hero.png', DEST, '/hero.png');

            expect(calls.map((c) => c.url)).toContain(`${LIVE}/hero.png`);
        });

        it('treats an explicit .html path as HTML and still reads .plain.html', async () => {
            const calls = routeHtmlSource();

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about.html', DEST, '/about.html');

            expect(calls.map((c) => c.url)).toContain(`${LIVE}/about.html.plain.html`);
        });

        it('reads index.plain.html for a directory path', async () => {
            const calls = routeHtmlSource();

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/', DEST, '/');

            expect(calls.map((c) => c.url)).toContain(`${LIVE}/index.plain.html`);
        });

        it('reports failure and writes nothing when the source is not OK', async () => {
            routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                { when: (u) => u.endsWith('.plain.html'), respond: mockResponse(500) },
            ]);

            const ok = await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            expect(ok).toBe(false);
            expect(h.apiClient.fetchWithRetry).not.toHaveBeenCalled();
        });

        it('reads the source under an abort signal', async () => {
            const calls = routeHtmlSource();

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            const read = calls.find((c) => c.url.endsWith('.plain.html'));
            expect(read?.init?.signal).toBeInstanceOf(AbortSignal);
        });

        it('copies a page full of links when the caller asked for no discovery', async () => {
            routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                {
                    when: (u) => u.endsWith('.plain.html'),
                    respond: mockResponse(200, '<a href="/customer/nav">nav</a>', 'text/html'),
                },
            ]);

            const ok = await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            expect(ok).toBe(true);
            expect(h.apiClient.fetchWithRetry).toHaveBeenCalledTimes(1);
        });
    });

    describe('writing to DA.live', () => {
        it('posts to the destination source endpoint with the .html document path', async () => {
            routeHtmlSource();

            const ok = await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            expect(ok).toBe(true);
            expect(h.apiClient.fetchWithRetry).toHaveBeenCalledWith(
                'https://admin.da.live/source/dest-org/dest-site/about.html',
                expect.any(Function),
                { rateLimit: 'return' }
            );
        });

        it('writes index.html for a directory destination', async () => {
            routeHtmlSource();

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/', DEST, '/');

            expect(h.apiClient.fetchWithRetry.mock.calls[0][0]).toBe(
                'https://admin.da.live/source/dest-org/dest-site/index.html'
            );
        });

        it('carries the token it was handed as a bearer credential on a POST', async () => {
            routeHtmlSource();

            await h.copy.copySingleFile('other-token', SOURCE, '/about', DEST, '/about');

            const init = requestInitOf(h.apiClient.fetchWithRetry);
            expect(init.method).toBe('POST');
            expect(init.headers).toEqual({ Authorization: 'Bearer other-token' });
            expect(init.body).toBeInstanceOf(FormData);
        });

        it('rebuilds a FRESH FormData per attempt (one-shot bodies cannot be resent)', async () => {
            routeHtmlSource();

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            expect(requestInitOf(h.apiClient.fetchWithRetry).body).not.toBe(
                requestInitOf(h.apiClient.fetchWithRetry).body
            );
        });

        it('uploads the transformed source HTML under the "data" field', async () => {
            routeHtmlSource('<img src="./media_abc123.png">');

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            // transformHtmlForDaLive rewrites the relative media URL to the source CDN.
            await expect(uploadedTextOf(h.apiClient.fetchWithRetry)).resolves.toContain(
                `${LIVE}/media_abc123.png`
            );
        });

        it('uploads the html under a text/html blob type', async () => {
            routeHtmlSource();

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            const init = requestInitOf(h.apiClient.fetchWithRetry);
            expect(((init.body as FormData).get('data') as Blob).type).toBe('text/html');
        });

        it('uploads the raw blob (no HTML transform) for binary content', async () => {
            routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                { when: (u) => u.endsWith('.png'), respond: mockResponse(200, '', 'image/png') },
            ]);

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/hero.png', DEST, '/hero.png');

            expect(h.apiClient.fetchWithRetry.mock.calls[0][0]).toBe(
                'https://admin.da.live/source/dest-org/dest-site/hero.png'
            );
            await expect(uploadedTextOf(h.apiClient.fetchWithRetry)).resolves.toBe('binary');
        });

        it('treats an HTML content-type on an extensioned path as HTML', async () => {
            routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                {
                    when: (u) => u.endsWith('.xml'),
                    respond: mockResponse(200, '<p/>', 'text/html'),
                },
            ]);

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/feed.xml', DEST, '/feed.xml');

            expect(h.apiClient.fetchWithRetry.mock.calls[0][0]).toBe(
                'https://admin.da.live/source/dest-org/dest-site/feed.xml.html'
            );
        });

        it('reports failure on a non-OK write instead of throwing', async () => {
            routeHtmlSource();
            h.apiClient.fetchWithRetry.mockResolvedValue(mockResponse(429));

            const ok = await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            expect(ok).toBe(false);
        });

        it('reports failure when the error body cannot even be read', async () => {
            routeHtmlSource();
            h.apiClient.fetchWithRetry.mockResolvedValue(mockUnreadableResponse(500));

            const ok = await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            expect(ok).toBe(false);
        });

        it('throws DaLiveAuthError on a 401 so the caller can pause and re-auth', async () => {
            routeHtmlSource();
            h.apiClient.fetchWithRetry.mockResolvedValue(mockResponse(401));

            await expect(
                h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about')
            ).rejects.toBeInstanceOf(DaLiveAuthError);
        });
    });

    describe('retrying the source read', () => {
        it('retries a network error and succeeds on a later attempt', async () => {
            let attempts = 0;
            mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
                if (init?.method === 'HEAD') return mockResponse(404);
                attempts += 1;
                if (attempts === 1) throw new Error('socket hang up');
                return mockResponse(200, '<p/>', 'text/html');
            });

            const ok = await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            expect(ok).toBe(true);
            expect(attempts).toBe(2);
            expect(sleep).toHaveBeenCalledTimes(1);
        });

        it('gives up after MAX_RETRY_ATTEMPTS source reads and reports failure', async () => {
            let attempts = 0;
            mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
                if (init?.method === 'HEAD') return mockResponse(404);
                attempts += 1;
                throw new Error('socket hang up');
            });

            const ok = await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            expect(ok).toBe(false);
            expect(attempts).toBe(3);
            // The last attempt reports rather than sleeping again.
            expect(sleep).toHaveBeenCalledTimes(2);
        });

        it('never retries an auth error — it propagates on the first attempt', async () => {
            routeHtmlSource();
            h.apiClient.fetchWithRetry.mockRejectedValue(new DaLiveAuthError('expired'));

            await expect(
                h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about')
            ).rejects.toBeInstanceOf(DaLiveAuthError);
            expect(sleep).not.toHaveBeenCalled();
            expect(h.apiClient.fetchWithRetry).toHaveBeenCalledTimes(1);
        });
    });

    describe('spreadsheets', () => {
        /** The probe says JSON, and the CDN serves the sheet rows. */
        function routeSpreadsheet(json: unknown): Array<{ url: string; init?: RequestInit }> {
            return routeFetch([
                {
                    when: (_u, i) => i?.method === 'HEAD',
                    respond: mockResponse(200, undefined, 'application/json'),
                },
                {
                    when: (u) => u.endsWith('.json'),
                    respond: mockResponse(200, json, 'application/json'),
                },
            ]);
        }

        const SHEET = { total: 1, data: [{ key: 'a', value: 'b' }] };

        it('probes <path>.json with HEAD before deciding', async () => {
            const calls = routeSpreadsheet(SHEET);

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/placeholders', DEST, '/placeholders');

            expect(calls[0]).toEqual({
                url: `${LIVE}/placeholders.json`,
                init: expect.objectContaining({ method: 'HEAD' }),
            });
        });

        it('takes the spreadsheet route and writes the sheet as an .html document', async () => {
            routeSpreadsheet(SHEET);

            const ok = await h.copy.copySingleFile(
                TEST_TOKEN,
                SOURCE,
                '/placeholders',
                DEST,
                '/placeholders'
            );

            expect(ok).toBe(true);
            expect(h.apiClient.fetchWithRetry).toHaveBeenCalledWith(
                'https://admin.da.live/source/dest-org/dest-site/placeholders.html',
                expect.any(Function),
                { rateLimit: 'return' }
            );
            await expect(uploadedTextOf(h.apiClient.fetchWithRetry)).resolves.toContain('<table');
        });

        it('always reads the spreadsheet from the PUBLISHED host, even in preview mode', async () => {
            const calls = routeSpreadsheet(SHEET);

            await h.copy.copySingleFile(
                TEST_TOKEN,
                { ...SOURCE, preview: true },
                '/placeholders',
                DEST,
                '/placeholders'
            );

            expect(calls.map((c) => c.url)).toContain(`${LIVE}/placeholders.json`);
        });

        it('is not a spreadsheet when the probe answers with a non-JSON content type', async () => {
            routeFetch([
                {
                    when: (_u, i) => i?.method === 'HEAD',
                    respond: mockResponse(200, undefined, 'text/html'),
                },
                { when: (u) => u.endsWith('.plain.html'), respond: mockResponse(200, '<p/>') },
            ]);

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            expect(h.apiClient.fetchWithRetry.mock.calls[0][0]).toBe(
                'https://admin.da.live/source/dest-org/dest-site/about.html'
            );
        });

        it('is not a spreadsheet when the probe throws', async () => {
            mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
                if (init?.method === 'HEAD') throw new Error('unreachable');
                return mockResponse(200, '<p/>', 'text/html');
            });

            const ok = await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            expect(ok).toBe(true);
        });

        it.each(['/about.html', '/about.htm', '/', '/blog/'])(
            'never probes %s — it cannot be a spreadsheet',
            async (path) => {
                const calls = routeFetch([
                    { when: (u) => u.includes('.plain.html'), respond: mockResponse(200, '<p/>') },
                ]);

                await h.copy.copySingleFile(TEST_TOKEN, SOURCE, path, DEST, path);

                expect(calls.some((c) => c.init?.method === 'HEAD')).toBe(false);
            }
        );

        it('probes a path whose HTML-looking extension is not at the END', async () => {
            const calls = routeSpreadsheet(SHEET);

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/a.htmlx', DEST, '/a.htmlx');

            expect(calls.map((c) => c.url)).toContain(`${LIVE}/a.htmlx.json`);
        });

        it('is not a spreadsheet when the probe answers JSON but is NOT ok', async () => {
            routeFetch([
                {
                    when: (_u, i) => i?.method === 'HEAD',
                    respond: mockResponse(404, undefined, 'application/json'),
                },
                { when: (u) => u.endsWith('.plain.html'), respond: mockResponse(200, '<p/>') },
            ]);

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/about', DEST, '/about');

            expect(h.apiClient.fetchWithRetry.mock.calls[0][0]).toBe(
                'https://admin.da.live/source/dest-org/dest-site/about.html'
            );
        });

        it('reads the sheet JSON under an abort signal', async () => {
            const calls = routeSpreadsheet(SHEET);

            await h.copy.copySingleFile(
                TEST_TOKEN,
                SOURCE,
                '/placeholders',
                DEST,
                '/placeholders'
            );

            const read = calls.find((c) => c.init?.method !== 'HEAD');
            expect(read?.init?.signal).toBeInstanceOf(AbortSignal);
        });

        it('uploads the sheet under a text/html blob type', async () => {
            routeSpreadsheet(SHEET);

            await h.copy.copySingleFile(
                TEST_TOKEN,
                SOURCE,
                '/placeholders',
                DEST,
                '/placeholders'
            );

            const init = requestInitOf(h.apiClient.fetchWithRetry);
            expect(((init.body as FormData).get('data') as Blob).type).toBe('text/html');
        });

        it('does not upload a sheet whose JSON response was not ok, body or no body', async () => {
            routeFetch([
                {
                    when: (_u, i) => i?.method === 'HEAD',
                    respond: mockResponse(200, undefined, 'application/json'),
                },
                {
                    when: (u) => u.endsWith('.json'),
                    respond: mockResponse(503, SHEET, 'application/json'),
                },
            ]);

            const ok = await h.copy.copySingleFile(
                TEST_TOKEN,
                SOURCE,
                '/placeholders',
                DEST,
                '/placeholders'
            );

            expect(ok).toBe(false);
            expect(h.apiClient.fetchWithRetry).not.toHaveBeenCalled();
        });

        it('reports failure when the sheet JSON cannot be fetched', async () => {
            routeFetch([
                {
                    when: (_u, i) => i?.method === 'HEAD',
                    respond: mockResponse(200, undefined, 'application/json'),
                },
                { when: (u) => u.endsWith('.json'), respond: mockResponse(500) },
            ]);

            const ok = await h.copy.copySingleFile(
                TEST_TOKEN,
                SOURCE,
                '/placeholders',
                DEST,
                '/placeholders'
            );

            expect(ok).toBe(false);
            expect(h.apiClient.fetchWithRetry).not.toHaveBeenCalled();
        });

        it('reports failure when the sheet JSON converts to nothing', async () => {
            routeSpreadsheet({ nonsense: true });

            const ok = await h.copy.copySingleFile(
                TEST_TOKEN,
                SOURCE,
                '/placeholders',
                DEST,
                '/placeholders'
            );

            expect(ok).toBe(false);
            expect(h.apiClient.fetchWithRetry).not.toHaveBeenCalled();
        });

        it('reports failure on a non-OK sheet upload', async () => {
            routeSpreadsheet(SHEET);
            h.apiClient.fetchWithRetry.mockResolvedValue(mockResponse(500));

            const ok = await h.copy.copySingleFile(
                TEST_TOKEN,
                SOURCE,
                '/placeholders',
                DEST,
                '/placeholders'
            );

            expect(ok).toBe(false);
        });

        it('throws DaLiveAuthError on a 401 sheet upload', async () => {
            routeSpreadsheet(SHEET);
            h.apiClient.fetchWithRetry.mockResolvedValue(mockResponse(401));

            await expect(
                h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/placeholders', DEST, '/placeholders')
            ).rejects.toBeInstanceOf(DaLiveAuthError);
        });

        it('reports failure (never throws) when the sheet upload errors', async () => {
            routeSpreadsheet(SHEET);
            h.apiClient.fetchWithRetry.mockRejectedValue(new Error('offline'));

            const ok = await h.copy.copySingleFile(
                TEST_TOKEN,
                SOURCE,
                '/placeholders',
                DEST,
                '/placeholders'
            );

            expect(ok).toBe(false);
        });

        it('carries the token and a POST FormData on the sheet upload', async () => {
            routeSpreadsheet(SHEET);

            await h.copy.copySingleFile(
                'sheet-token',
                SOURCE,
                '/placeholders',
                DEST,
                '/placeholders'
            );

            const init = requestInitOf(h.apiClient.fetchWithRetry);
            expect(init.method).toBe('POST');
            expect(init.headers).toEqual({ Authorization: 'Bearer sheet-token' });
        });
    });
});
