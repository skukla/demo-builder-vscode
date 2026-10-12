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

        // What aem.live serves for a sheet, both shapes (captured 2026-10-12).
        const SHEET = {
            total: 1,
            limit: 1,
            offset: 0,
            data: [{ URL: '' }],
            ':type': 'sheet',
        };
        const MULTI_SHEET = {
            data: {
                total: 1,
                offset: 0,
                limit: 1,
                data: [{ Key: 'Cart.Cart.heading', Value: 'Shopping Cart ({count})' }],
            },
            dnt: {
                total: 1,
                offset: 0,
                limit: 1,
                data: [{ 'dnt-sheet': '*', 'dnt-columns': 'Key' }],
            },
            ':version': 3,
            ':names': ['data', 'dnt'],
            ':type': 'multi-sheet',
        };

        /** The JSON document a sheet copy uploaded, parsed. */
        async function uploadedDocument(): Promise<Record<string, unknown>> {
            return JSON.parse(await uploadedTextOf(h.apiClient.fetchWithRetry)) as Record<
                string,
                unknown
            >;
        }

        it('probes <path>.json with HEAD before deciding', async () => {
            const calls = routeSpreadsheet(SHEET);

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/placeholders', DEST, '/placeholders');

            expect(calls[0]).toEqual({
                url: `${LIVE}/placeholders.json`,
                init: expect.objectContaining({ method: 'HEAD' }),
            });
        });

        it('writes the sheet to the .json path, never as an .html document', async () => {
            // An HTML table posted to <path>.html is served as a page and
            // <path>.json answers 404 (measured live 2026-10-12, EDS-40).
            routeSpreadsheet(SHEET);

            const ok = await h.copy.copySingleFile(
                TEST_TOKEN,
                SOURCE,
                '/placeholders',
                DEST,
                '/placeholders'
            );

            expect(ok).toBe(true);
            expect(h.apiClient.fetchWithRetry).toHaveBeenCalledTimes(1);
            expect(h.apiClient.fetchWithRetry).toHaveBeenCalledWith(
                'https://admin.da.live/source/dest-org/dest-site/placeholders.json',
                expect.any(Function),
                { rateLimit: 'return' }
            );
        });

        it('writes a nested sheet under its own folder', async () => {
            routeSpreadsheet(MULTI_SHEET);

            await h.copy.copySingleFile(
                TEST_TOKEN,
                SOURCE,
                '/placeholders/cart',
                DEST,
                '/placeholders/cart'
            );

            expect(h.apiClient.fetchWithRetry.mock.calls[0][0]).toBe(
                'https://admin.da.live/source/dest-org/dest-site/placeholders/cart.json'
            );
        });

        it('uploads a multi-sheet source with every sheet, the do-not-translate one included', async () => {
            routeSpreadsheet(MULTI_SHEET);

            await h.copy.copySingleFile(
                TEST_TOKEN,
                SOURCE,
                '/placeholders/cart',
                DEST,
                '/placeholders/cart'
            );

            await expect(uploadedDocument()).resolves.toStrictEqual({
                data: {
                    total: 1,
                    limit: 1,
                    offset: 0,
                    data: [{ Key: 'Cart.Cart.heading', Value: 'Shopping Cart ({count})' }],
                    ':colWidths': [300, 300],
                },
                dnt: {
                    total: 1,
                    limit: 1,
                    offset: 0,
                    data: [{ 'dnt-sheet': '*', 'dnt-columns': 'Key' }],
                    ':colWidths': [300, 300],
                },
                ':names': ['data', 'dnt'],
                ':version': 3,
                ':type': 'multi-sheet',
            });
        });

        it('uploads a single-sheet source as a document whose one sheet is named data', async () => {
            routeSpreadsheet(SHEET);

            await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/redirects', DEST, '/redirects');

            await expect(uploadedDocument()).resolves.toStrictEqual({
                data: {
                    total: 1,
                    limit: 1,
                    offset: 0,
                    data: [{ URL: '' }],
                    ':colWidths': [300],
                },
                ':names': ['data'],
                ':version': 3,
                ':type': 'multi-sheet',
            });
        });

        describe('a sheet longer than one CDN page', () => {
            // The CDN pages a sheet: `total` is the whole sheet, `data` is this page.
            const row = (n: number) => ({ Source: `/old-${n}`, Destination: `/new-${n}` });
            const page = (rows: unknown[], total: number, offset: number) => ({
                total,
                offset,
                limit: rows.length,
                data: rows,
                ':type': 'sheet',
            });
            const JSON_TYPE = 'application/json';
            const head = {
                when: (_u: string, i?: RequestInit) => i?.method === 'HEAD',
                respond: mockResponse(200, undefined, JSON_TYPE),
            };
            const uploadedRows = async (sheet = 'data'): Promise<unknown[]> =>
                ((await uploadedDocument())[sheet] as { data: unknown[] }).data;

            it('reads the following pages until it holds every row, then uploads them all', async () => {
                const calls = routeFetch([
                    head,
                    {
                        when: (u) => u === `${LIVE}/redirects.json`,
                        respond: mockResponse(200, page([row(1), row(2)], 5, 0), JSON_TYPE),
                    },
                    {
                        when: (u) => u === `${LIVE}/redirects.json?offset=2&limit=2`,
                        respond: mockResponse(200, page([row(3), row(4)], 5, 2), JSON_TYPE),
                    },
                    {
                        when: (u) => u === `${LIVE}/redirects.json?offset=4&limit=2`,
                        respond: mockResponse(200, page([row(5)], 5, 4), JSON_TYPE),
                    },
                ]);

                const ok = await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/redirects', DEST, '/redirects');

                expect(ok).toBe(true);
                expect(calls.filter((c) => c.init?.method !== 'HEAD').map((c) => c.url)).toStrictEqual([
                    `${LIVE}/redirects.json`,
                    `${LIVE}/redirects.json?offset=2&limit=2`,
                    `${LIVE}/redirects.json?offset=4&limit=2`,
                ]);
                await expect(uploadedRows()).resolves.toStrictEqual([1, 2, 3, 4, 5].map(row));
                expect((await uploadedDocument()).data).toMatchObject({ total: 5, limit: 5 });
            });

            it('pages each sheet of a multi-sheet document by its own name', async () => {
                const first = {
                    ...MULTI_SHEET,
                    data: { total: 2, offset: 0, limit: 1, data: [{ Key: 'a', Value: '1' }] },
                };
                const calls = routeFetch([
                    head,
                    {
                        when: (u) => u === `${LIVE}/placeholders/cart.json`,
                        respond: mockResponse(200, first, JSON_TYPE),
                    },
                    {
                        // Asked for by name, a sheet comes back in single-sheet form.
                        when: (u) => u === `${LIVE}/placeholders/cart.json?sheet=data&offset=1&limit=1`,
                        respond: mockResponse(200, page([{ Key: 'b', Value: '2' }], 2, 1), JSON_TYPE),
                    },
                ]);

                await h.copy.copySingleFile(
                    TEST_TOKEN,
                    SOURCE,
                    '/placeholders/cart',
                    DEST,
                    '/placeholders/cart'
                );

                // `dnt` was whole on the first page, so only `data` is asked for again.
                expect(calls.filter((c) => c.url.includes('?')).map((c) => c.url)).toStrictEqual([
                    `${LIVE}/placeholders/cart.json?sheet=data&offset=1&limit=1`,
                ]);
                await expect(uploadedRows()).resolves.toStrictEqual([
                    { Key: 'a', Value: '1' },
                    { Key: 'b', Value: '2' },
                ]);
                await expect(uploadedRows('dnt')).resolves.toStrictEqual(MULTI_SHEET.dnt.data);
            });

            it('makes no second request for a sheet that arrived whole', async () => {
                const calls = routeSpreadsheet(SHEET);

                await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/redirects', DEST, '/redirects');

                expect(calls.filter((c) => c.init?.method !== 'HEAD')).toHaveLength(1);
            });

            it('stops at the first empty page and uploads the rows it has', async () => {
                // A total the server cannot back up must not spin: one empty page ends it.
                const calls = routeFetch([
                    head,
                    {
                        when: (u) => u === `${LIVE}/redirects.json`,
                        respond: mockResponse(200, page([row(1), row(2)], 9, 0), JSON_TYPE),
                    },
                    {
                        when: (u) => u.includes('?offset='),
                        respond: mockResponse(200, page([], 9, 2), JSON_TYPE),
                    },
                ]);

                const ok = await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/redirects', DEST, '/redirects');

                expect(ok).toBe(true);
                expect(calls.filter((c) => c.url.includes('?offset='))).toHaveLength(1);
                await expect(uploadedRows()).resolves.toStrictEqual([row(1), row(2)]);
            });

            it('stops when a later page cannot be read, and still uploads the first', async () => {
                routeFetch([
                    head,
                    {
                        when: (u) => u === `${LIVE}/redirects.json`,
                        respond: mockResponse(200, page([row(1)], 3, 0), JSON_TYPE),
                    },
                    { when: (u) => u.includes('?offset='), respond: mockResponse(500) },
                ]);

                const ok = await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/redirects', DEST, '/redirects');

                expect(ok).toBe(true);
                await expect(uploadedRows()).resolves.toStrictEqual([row(1)]);
            });

            it('gives up after a fixed number of pages when the total is never reached', async () => {
                // Every page answers one row and the total is out of reach.
                const calls = routeFetch([
                    head,
                    {
                        when: (u) => u.includes('/redirects.json'),
                        respond: mockResponse(200, page([row(1)], 1_000_000, 0), JSON_TYPE),
                    },
                ]);

                const ok = await h.copy.copySingleFile(TEST_TOKEN, SOURCE, '/redirects', DEST, '/redirects');

                expect(ok).toBe(true);
                expect(calls.filter((c) => c.url.includes('?offset='))).toHaveLength(50);
            });
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

        it('uploads the sheet under an application/json blob type', async () => {
            routeSpreadsheet(SHEET);

            await h.copy.copySingleFile(
                TEST_TOKEN,
                SOURCE,
                '/placeholders',
                DEST,
                '/placeholders'
            );

            const init = requestInitOf(h.apiClient.fetchWithRetry);
            expect(((init.body as FormData).get('data') as Blob).type).toBe('application/json');
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

        it('reports failure when the source JSON is not a sheet', async () => {
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
