/**
 * DA.live Content Operations Tests - HTML Transformation
 *
 * Tests for HTML transformation when uploading to DA.live:
 * - Fetching .plain.html and wrapping in document structure
 * - Converting relative media URLs to absolute URLs
 * - Handling HTML-encoded query parameters
 * - Directory paths and non-media images
 * - Preserving empty structural divs
 */

import {
    createContentOperationsHarness,
    mockFetch,
    mockFetchResponse,
} from './daLiveContentOperations.testUtils';
import type { DaLiveContentDiscovery } from '@/features/eds/services/daLive/daLiveContentDiscovery';
import { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';

global.fetch = mockFetch;

describe('DaLiveContentOperations - HTML transformation', () => {
    let service: DaLiveContentOperations;
    let discovery: DaLiveContentDiscovery;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ service, discovery } =
            createContentOperationsHarness());
    });

    /**
     * Run one copy and capture what it fetched and what it posted.
     *
     * EXTRACTED 2026-08-30 (PL-9 lane A). The six tests below shared 38
     * identical lines of setup and differed only in the HTML they fed in and the
     * claim they made about the result — jscpd reported the same 39-line block
     * three times inside this one file.
     *
     * The two variations are real and are parameters, not copies:
     *   `path`        the content path discovery returns; a directory path
     *                 ('/citisignal-fr/') resolves to `<path>index.plain.html`
     *   `spreadsheetProbe`  a leading 404 for the isSpreadsheetPath HEAD. The
     *                 directory-path case does not issue it, so passing `false`
     *                 keeps that test exercising the same sequence it did before.
     */
    async function copyAndCapture(
        plainHtml: string,
        { path, spreadsheetProbe = true }: { path: string; spreadsheetProbe?: boolean },
    ): Promise<{ fetchedUrl: string | null; postedHtml: string }> {
        let fetchedUrl: string | null = null;
        let postedFormData: FormData | null = null;

        jest.spyOn(discovery, 'getContentPathsFromDaLive').mockResolvedValue([path]);

        if (spreadsheetProbe) {
            mockFetch.mockResolvedValueOnce(mockFetchResponse(404)); // isSpreadsheetPath HEAD
        }
        mockFetch
            .mockImplementationOnce(async (url: string) => {
                fetchedUrl = url;
                return {
                    ok: true,
                    status: 200,
                    headers: {
                        get: (key: string) => (key === 'content-type' ? 'text/html' : null),
                    },
                    text: async () => plainHtml,
                    blob: async () => new Blob([plainHtml], { type: 'text/html' }),
                } as Response;
            })
            .mockImplementationOnce(async (_url: string, options?: RequestInit) => {
                postedFormData = options?.body as FormData;
                return mockFetchResponse(200);
            });

        await service.copyContentFromSource(
            {
                org: 'source-org',
                site: 'source-site',
                indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
            },
            'dest-org',
            'dest-site',
        );

        // Each original test opened with `expect(postedFormData).not.toBeNull()`.
        // Folding that into the helper keeps the guarantee: without it a copy
        // that never posted would return '' and every toContain below would fail
        // with a confusing empty-string diff instead of naming the real problem.
        expect(postedFormData).not.toBeNull();
        const postedHtml = await ((postedFormData as FormData | null)!.get('data') as Blob).text();
        return { fetchedUrl, postedHtml };
    }

    const LIVE = 'https://main--source-site--source-org.aem.live';

    it('fetches .plain.html, wraps it in a document structure, and preserves images', async () => {
        const { fetchedUrl, postedHtml } = await copyAndCapture(
            `<div class="nav">
                <picture>
                    <source type="image/webp" srcset="./media_abc123.png?width=2000&format=webply">
                    <source type="image/png" srcset="./media_abc123.png?width=2000&format=png">
                    <img loading="lazy" alt="Logo" src="./media_abc123.png?width=750&format=png">
                </picture>
            </div>`,
            { path: '/nav' },
        );

        expect(fetchedUrl).toBe(`${LIVE}/nav.plain.html`);
        expect(postedHtml).toMatch(/^<body><header><\/header><main>/);
        expect(postedHtml).toMatch(/<\/main><footer><\/footer><\/body>$/);
        expect(postedHtml).toContain('<picture>');
        expect(postedHtml).toContain('<img');
    });

    it('converts relative media URLs to absolute ones for the Admin API', async () => {
        const { postedHtml } = await copyAndCapture(
            `<div>
                <img src="./media_abc123.png?width=750&format=png&optimize=medium">
            </div>`,
            { path: '/page' },
        );

        expect(postedHtml).toContain(
            `<img src="${LIVE}/media_abc123.png?width=750&format=png&optimize=medium">`,
        );
        expect(postedHtml).toMatch(/^<body><header><\/header><main>/);
    });

    it('converts relative media URLs whose query parameters are HTML-encoded', async () => {
        const { postedHtml } = await copyAndCapture(
            `<div>
                <img src="./media_abc123.png?width=750&#x26;format=png&#x26;optimize=medium">
            </div>`,
            { path: '/page' },
        );

        // The encoded entities are PRESERVED, not decoded — only the path is
        // made absolute. Copied verbatim from the original assertion.
        expect(postedHtml).toContain(
            `<img src="${LIVE}/media_abc123.png?width=750&#x26;format=png&#x26;optimize=medium">`,
        );
    });

    it('resolves a directory path to its index page', async () => {
        // No spreadsheet probe on this path — preserved from the original test.
        const { fetchedUrl } = await copyAndCapture(`<div class="home">Welcome</div>`, {
            path: '/citisignal-fr/',
            spreadsheetProbe: false,
        });

        expect(fetchedUrl).toBe(`${LIVE}/citisignal-fr/index.plain.html`);
    });

    it('leaves non-media images untouched', async () => {
        const { postedHtml } = await copyAndCapture(
            `<div>
                <img src="/images/logo.svg" alt="Logo">
            </div>`,
            { path: '/page' },
        );

        expect(postedHtml).toContain('src="/images/logo.svg"');
    });

    it('preserves empty structural divs by filling them with a placeholder', async () => {
        const { postedHtml } = await copyAndCapture(
            `<div><p><a href="/">Logo</a></p></div>
<div><ul><li>Menu</li></ul></div>
<div></div>`,
            { path: '/nav' },
        );

        expect(postedHtml).toContain('<div><p>&nbsp;</p></div>');
        expect((postedHtml.match(/<div>/g) || [])).toHaveLength(3);
    });
});
