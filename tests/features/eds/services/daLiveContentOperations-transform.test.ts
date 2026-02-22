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

import { DaLiveContentOperations, type TokenProvider } from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';

// Mock the timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
    },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('DaLiveContentOperations - HTML transformation', () => {
    let service: DaLiveContentOperations;
    let mockTokenProvider: TokenProvider;
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();

        mockTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
        };

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        service = new DaLiveContentOperations(mockTokenProvider, mockLogger);
    });

    function mockFetchResponse(status: number, body?: unknown, contentType = 'text/html'): Response {
        const headers = new Map([['content-type', contentType]]);
        return {
            ok: status >= 200 && status < 300,
            status,
            statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
            headers: {
                get: (key: string) => headers.get(key.toLowerCase()) || null,
            } as unknown as Headers,
            json: jest.fn().mockResolvedValue(body),
            blob: jest.fn().mockResolvedValue(new Blob(['test content'])),
            text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : ''),
        } as unknown as Response;
    }

    it('should fetch .plain.html, wrap in document structure, and preserve images', async () => {
        const plainHtml = `<div class="nav">
                <picture>
                    <source type="image/webp" srcset="./media_abc123.png?width=2000&format=webply">
                    <source type="image/png" srcset="./media_abc123.png?width=2000&format=png">
                    <img loading="lazy" alt="Logo" src="./media_abc123.png?width=750&format=png">
                </picture>
            </div>`;

        let fetchedUrl: string | null = null;
        let postedFormData: FormData | null = null;

        mockFetch
            .mockResolvedValueOnce(mockFetchResponse(200, { data: [{ path: '/nav' }] }, 'application/json'))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockImplementationOnce(async (url: string) => {
                fetchedUrl = url;
                return {
                    ok: true,
                    status: 200,
                    headers: {
                        get: (key: string) => key === 'content-type' ? 'text/html' : null,
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

        expect(fetchedUrl).toBe('https://main--source-site--source-org.aem.live/nav.plain.html');

        expect(postedFormData).not.toBeNull();
        const postedBlob = postedFormData!.get('data') as Blob;
        const postedHtml = await postedBlob.text();

        expect(postedHtml).toMatch(/^<body><header><\/header><main>/);
        expect(postedHtml).toMatch(/<\/main><footer><\/footer><\/body>$/);
        expect(postedHtml).toContain('<picture>');
        expect(postedHtml).toContain('<img');
    });

    it('should convert relative media URLs to absolute URLs for Admin API', async () => {
        const plainHtml = `<div>
                <img src="./media_abc123.png?width=750&format=png&optimize=medium">
            </div>`;

        let postedFormData: FormData | null = null;

        mockFetch
            .mockResolvedValueOnce(mockFetchResponse(200, { data: [{ path: '/page' }] }, 'application/json'))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockImplementationOnce(async () => {
                return {
                    ok: true,
                    status: 200,
                    headers: {
                        get: (key: string) => key === 'content-type' ? 'text/html' : null,
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

        expect(postedFormData).not.toBeNull();
        const postedBlob = postedFormData!.get('data') as Blob;
        const postedHtml = await postedBlob.text();

        expect(postedHtml).toContain('<img src="https://main--source-site--source-org.aem.live/media_abc123.png?width=750&format=png&optimize=medium">');
        expect(postedHtml).toMatch(/^<body><header><\/header><main>/);
    });

    it('should convert relative media URLs with HTML-encoded query parameters', async () => {
        const plainHtml = `<div>
                <img src="./media_abc123.png?width=750&#x26;format=png&#x26;optimize=medium">
            </div>`;

        let postedFormData: FormData | null = null;

        mockFetch
            .mockResolvedValueOnce(mockFetchResponse(200, { data: [{ path: '/page' }] }, 'application/json'))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockImplementationOnce(async () => {
                return {
                    ok: true,
                    status: 200,
                    headers: {
                        get: (key: string) => key === 'content-type' ? 'text/html' : null,
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

        expect(postedFormData).not.toBeNull();
        const postedBlob = postedFormData!.get('data') as Blob;
        const postedHtml = await postedBlob.text();

        expect(postedHtml).toContain('<img src="https://main--source-site--source-org.aem.live/media_abc123.png?width=750&#x26;format=png&#x26;optimize=medium">');
    });

    it('should handle directory paths (ending with /) correctly', async () => {
        const plainHtml = `<div class="home">Welcome</div>`;

        let fetchedUrl: string | null = null;

        mockFetch
            .mockResolvedValueOnce(mockFetchResponse(200, { data: [{ path: '/citisignal-fr/' }] }, 'application/json'))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockImplementationOnce(async (url: string) => {
                fetchedUrl = url;
                return {
                    ok: true,
                    status: 200,
                    headers: {
                        get: (key: string) => key === 'content-type' ? 'text/html' : null,
                    },
                    text: async () => plainHtml,
                    blob: async () => new Blob([plainHtml], { type: 'text/html' }),
                } as Response;
            })
            .mockResolvedValueOnce(mockFetchResponse(200));

        await service.copyContentFromSource(
            {
                org: 'source-org',
                site: 'source-site',
                indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
            },
            'dest-org',
            'dest-site',
        );

        expect(fetchedUrl).toBe('https://main--source-site--source-org.aem.live/citisignal-fr/index.plain.html');
    });

    it('should preserve non-media images without modification', async () => {
        const plainHtml = `<div>
                <img src="/images/logo.svg" alt="Logo">
            </div>`;

        let postedFormData: FormData | null = null;

        mockFetch
            .mockResolvedValueOnce(mockFetchResponse(200, { data: [{ path: '/page' }] }, 'application/json'))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockImplementationOnce(async () => {
                return {
                    ok: true,
                    status: 200,
                    headers: {
                        get: (key: string) => key === 'content-type' ? 'text/html' : null,
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

        expect(postedFormData).not.toBeNull();
        const postedBlob = postedFormData!.get('data') as Blob;
        const postedHtml = await postedBlob.text();

        expect(postedHtml).toContain('src="/images/logo.svg"');
    });

    it('should preserve empty structural divs with placeholder content', async () => {
        const plainHtml = `<div><p><a href="/">Logo</a></p></div>
<div><ul><li>Menu</li></ul></div>
<div></div>`;

        let postedFormData: FormData | null = null;

        mockFetch
            .mockResolvedValueOnce(mockFetchResponse(200, { data: [{ path: '/nav' }] }, 'application/json'))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockResolvedValueOnce(mockFetchResponse(404))
            .mockImplementationOnce(async () => {
                return {
                    ok: true,
                    status: 200,
                    headers: {
                        get: (key: string) => key === 'content-type' ? 'text/html' : null,
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

        expect(postedFormData).not.toBeNull();
        const postedBlob = postedFormData!.get('data') as Blob;
        const postedHtml = await postedBlob.text();

        expect(postedHtml).toContain('<div><p>&nbsp;</p></div>');
        expect((postedHtml.match(/<div>/g) || []).length).toBe(3);
    });
});
