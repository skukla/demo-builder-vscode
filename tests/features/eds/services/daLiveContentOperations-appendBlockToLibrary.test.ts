/**
 * DA.live Content Operations Tests - appendBlockToLibrary (additive)
 *
 * Tests for the non-destructive `appendBlockToLibrary` method which performs
 * a read-merge-rewrite cycle on the `.da/library/blocks.json` sheet:
 *
 *   1. GET the existing sheet (404 -> empty rows).
 *   2. Idempotency: if a row with `name === title` exists, return
 *      `{ status: 'skipped-duplicate' }` without writing.
 *   3. Otherwise append the new row, rewrite the sheet with `overwrite: true`
 *      via `createJsonSpreadsheet`, and re-invoke `updateSiteConfig` with the
 *      "Blocks" section so registration is idempotent.
 *
 * Critical invariants:
 *   - NEVER calls `deleteSource` — append path is strictly additive.
 *   - Site-config section title must be exactly "Blocks" (DA.live's library UI
 *     only renders the list when the section is named that way).
 *   - Row `path` field uses content.da.live/<org>/<site>/.da/library/blocks/<id>.
 */

import {
    DaLiveContentOperations,
    type TokenProvider,
} from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
    },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

interface FetchCall { 0: string; 1?: RequestInit }

describe('DaLiveContentOperations.appendBlockToLibrary', () => {
    let service: DaLiveContentOperations;
    let mockTokenProvider: TokenProvider;
    let mockLogger: Logger;

    const org = 'user-org';
    const site = 'user-site';
    const blockId = 'hero-cta';
    const title = 'Hero CTA';

    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();

        mockTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
        };

        mockLogger = {
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        service = new DaLiveContentOperations(mockTokenProvider, mockLogger);
    });

    /**
     * Helper: build a mock fetch that responds to the read-merge-rewrite flow.
     *
     * @param existingRows - rows returned by the GET on `.da/library/blocks.json`.
     *                       Pass `undefined` to simulate a 404 (sheet not present).
     * @param trackPosts   - optional sink so tests can inspect the rewrite body.
     */
    function buildMockFetch(opts: {
        existingRows?: Array<Record<string, string>>;
        sheetGetStatus?: number;
        configGetStatus?: number;
        configPostStatus?: number;
        sheetPostStatus?: number;
    } = {}) {
        const {
            existingRows,
            sheetGetStatus,
            configGetStatus = 200,
            configPostStatus = 200,
            sheetPostStatus = 200,
        } = opts;

        return async (url: string, options?: RequestInit): Promise<Response> => {
            // GET on the sheet
            if (
                url.includes('/source/') &&
                url.includes('.da/library/blocks.json') &&
                (!options?.method || options.method === 'GET')
            ) {
                if (sheetGetStatus !== undefined && sheetGetStatus !== 200) {
                    return {
                        ok: false,
                        status: sheetGetStatus,
                        statusText: 'Error',
                        text: async () => '',
                    } as unknown as Response;
                }
                if (existingRows === undefined) {
                    return { ok: false, status: 404 } as unknown as Response;
                }
                const sheet = {
                    data: {
                        total: existingRows.length,
                        limit: existingRows.length,
                        offset: 0,
                        data: existingRows,
                        ':colWidths': [300, 300],
                    },
                    ':names': ['data'],
                    ':version': 3,
                    ':type': 'multi-sheet',
                };
                return {
                    ok: true,
                    status: 200,
                    json: async () => sheet,
                } as unknown as Response;
            }

            // POST on the sheet (rewrite)
            if (
                url.includes('/source/') &&
                url.includes('.da/library/blocks.json') &&
                options?.method === 'POST'
            ) {
                return {
                    ok: sheetPostStatus === 200,
                    status: sheetPostStatus,
                    statusText: 'OK',
                } as unknown as Response;
            }

            // GET on config
            if (url.includes('/config/') && (!options?.method || options.method === 'GET')) {
                return {
                    ok: configGetStatus === 200,
                    status: configGetStatus,
                    json: async () => ({}),
                } as unknown as Response;
            }

            // POST on config
            if (url.includes('/config/') && options?.method === 'POST') {
                return {
                    ok: configPostStatus === 200,
                    status: configPostStatus,
                    text: async () => '',
                } as unknown as Response;
            }

            // DELETE — should NEVER be called by appendBlockToLibrary
            if (options?.method === 'DELETE') {
                return { ok: true, status: 200 } as unknown as Response;
            }

            return { ok: true, status: 200 } as unknown as Response;
        };
    }

    function findSheetPostCall(): FetchCall | undefined {
        return mockFetch.mock.calls.find(
            (call: FetchCall) =>
                call[0].includes('/source/') &&
                call[0].includes('.da/library/blocks.json') &&
                call[1]?.method === 'POST',
        );
    }

    async function extractSheetRows(post: FetchCall): Promise<Array<Record<string, string>>> {
        const formData = post[1]!.body as FormData;
        const blob = formData.get('data') as Blob;
        const json = JSON.parse(await blob.text());
        return json.data.data as Array<Record<string, string>>;
    }

    it('creates new .da/library/blocks.json with one row when sheet does not exist (404)', async () => {
        mockFetch.mockImplementation(buildMockFetch({ existingRows: undefined }));

        const result = await service.appendBlockToLibrary(org, site, {
            blockId,
            title,
        });

        expect(result.status).toBe('created');
        expect(result.siteConfigRegistered).toBe(true);

        const post = findSheetPostCall();
        expect(post).toBeDefined();
        const rows = await extractSheetRows(post!);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({
            name: title,
            path: `https://content.da.live/${org}/${site}/.da/library/blocks/${blockId}`,
        });
    });

    it('appends a new row when sheet exists with other blocks', async () => {
        const existingRows = [
            { name: 'Cards', path: `https://content.da.live/${org}/${site}/.da/library/blocks/cards` },
            { name: 'Hero', path: `https://content.da.live/${org}/${site}/.da/library/blocks/hero` },
        ];
        mockFetch.mockImplementation(buildMockFetch({ existingRows }));

        const result = await service.appendBlockToLibrary(org, site, {
            blockId,
            title,
        });

        expect(result.status).toBe('appended');
        expect(result.siteConfigRegistered).toBe(true);

        const post = findSheetPostCall();
        const rows = await extractSheetRows(post!);
        expect(rows).toHaveLength(3);
        expect(rows.map(r => r.name)).toEqual(['Cards', 'Hero', title]);
    });

    it('returns skipped-duplicate when sheet already has a row with matching name', async () => {
        const existingRows = [
            { name: title, path: `https://content.da.live/${org}/${site}/.da/library/blocks/${blockId}` },
        ];
        mockFetch.mockImplementation(buildMockFetch({ existingRows }));

        const result = await service.appendBlockToLibrary(org, site, {
            blockId,
            title,
        });

        expect(result.status).toBe('skipped-duplicate');
        // No rewrite POST when skipping.
        expect(findSheetPostCall()).toBeUndefined();
    });

    it('re-invokes updateSiteConfig with title "Blocks" on every call (idempotent registration)', async () => {
        mockFetch.mockImplementation(buildMockFetch({ existingRows: [] }));

        await service.appendBlockToLibrary(org, site, { blockId, title });

        const configPost = mockFetch.mock.calls.find(
            (call: FetchCall) =>
                call[0].includes('/config/') &&
                call[1]?.method === 'POST',
        );
        expect(configPost).toBeDefined();
        const formData = configPost![1]!.body as FormData;
        const configJson = JSON.parse(formData.get('config') as string);
        expect(configJson.library).toBeDefined();
        expect(configJson.library.data).toHaveLength(1);
        expect(configJson.library.data[0].title).toBe('Blocks');
        expect(configJson.library.data[0].path).toBe(
            `https://content.da.live/${org}/${site}/.da/library/blocks.json`,
        );
    });

    it('does NOT call deleteSource — append path must be non-destructive', async () => {
        const existingRows = [
            { name: 'Cards', path: `https://content.da.live/${org}/${site}/.da/library/blocks/cards` },
        ];
        mockFetch.mockImplementation(buildMockFetch({ existingRows }));

        await service.appendBlockToLibrary(org, site, { blockId, title });

        const deleteCalls = mockFetch.mock.calls.filter(
            (call: FetchCall) => call[1]?.method === 'DELETE',
        );
        expect(deleteCalls).toHaveLength(0);
    });

    it('propagates non-404 errors (e.g., 403) without writing', async () => {
        mockFetch.mockImplementation(
            buildMockFetch({ existingRows: undefined, sheetGetStatus: 403 }),
        );

        await expect(
            service.appendBlockToLibrary(org, site, { blockId, title }),
        ).rejects.toThrow();

        // No write attempted.
        expect(findSheetPostCall()).toBeUndefined();
    });

    it('the new row path uses content.da.live/{org}/{site}/.da/library/blocks/{blockId} exactly', async () => {
        mockFetch.mockImplementation(buildMockFetch({ existingRows: [] }));

        await service.appendBlockToLibrary(org, site, {
            blockId: 'my-cool-block',
            title: 'My Cool Block',
        });

        const post = findSheetPostCall();
        const rows = await extractSheetRows(post!);
        expect(rows[0].path).toBe(
            `https://content.da.live/${org}/${site}/.da/library/blocks/my-cool-block`,
        );
    });
});
