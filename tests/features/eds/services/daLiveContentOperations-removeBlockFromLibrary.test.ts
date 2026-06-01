/**
 * DA.live Content Operations Tests - removeBlockFromLibrary (teardown)
 *
 * Inverse of `appendBlockToLibrary` + `upsertBlockDocPage`. Reverses exactly
 * two library artifacts:
 *
 *   1. Doc page — DELETE `.da/library/blocks/<blockId>.html` (the same path
 *      upsertBlockDocPage writes). Reports 'deleted' (was present), 'absent'
 *      (already gone / 404), or 'failed' (delete error).
 *   2. Sheet row — read `.da/library/blocks.json`, drop the row whose `path`
 *      ends with `/.da/library/blocks/<blockId>` (matched by blockId, not
 *      title), rewrite via createJsonSpreadsheet(overwrite:true) → 'removed'.
 *      No matching row (or 404 sheet) → 'absent', no rewrite.
 *
 * Critical invariants:
 *   - Idempotent: never throws on already-absent state.
 *   - Matches the sheet row by blockId via its path, NOT by title.
 *   - Does not delete the block's source files (out of scope here).
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

describe('DaLiveContentOperations.removeBlockFromLibrary', () => {
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

    const blockPath = (id: string): string =>
        `https://content.da.live/${org}/${site}/.da/library/blocks/${id}`;

    /**
     * Build a mock fetch covering the removal flow.
     *
     * @param existingRows  rows returned by GET on `.da/library/blocks.json`;
     *                      `undefined` simulates a 404 (sheet absent).
     * @param docExists     whether the doc-page existence probe (GET .html)
     *                      returns ok.
     * @param docDeleteStatus status returned by DELETE on the doc page.
     */
    function buildMockFetch(opts: {
        existingRows?: Array<Record<string, string>>;
        docExists?: boolean;
        docDeleteStatus?: number;
        sheetPostStatus?: number;
    } = {}) {
        const {
            existingRows,
            docExists = true,
            docDeleteStatus = 200,
            sheetPostStatus = 200,
        } = opts;

        return async (url: string, options?: RequestInit): Promise<Response> => {
            const isDocPath = url.includes(`.da/library/blocks/${blockId}.html`);
            const isSheetPath = url.includes('.da/library/blocks.json');
            const method = options?.method ?? 'GET';

            // Doc-page existence probe (GET .html)
            if (isDocPath && method === 'GET') {
                return { ok: docExists, status: docExists ? 200 : 404 } as unknown as Response;
            }
            // Doc-page DELETE
            if (isDocPath && method === 'DELETE') {
                return {
                    ok: docDeleteStatus >= 200 && docDeleteStatus < 300,
                    status: docDeleteStatus,
                    statusText: 'X',
                } as unknown as Response;
            }
            // Sheet GET
            if (isSheetPath && method === 'GET') {
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
                return { ok: true, status: 200, json: async () => sheet } as unknown as Response;
            }
            // Sheet POST (rewrite)
            if (isSheetPath && method === 'POST') {
                return {
                    ok: sheetPostStatus === 200,
                    status: sheetPostStatus,
                    statusText: 'OK',
                } as unknown as Response;
            }
            return { ok: true, status: 200 } as unknown as Response;
        };
    }

    function findSheetPostCall(): FetchCall | undefined {
        return mockFetch.mock.calls.find(
            (call: FetchCall) =>
                call[0].includes('.da/library/blocks.json') &&
                call[1]?.method === 'POST',
        );
    }

    function findDocDeleteCall(): FetchCall | undefined {
        return mockFetch.mock.calls.find(
            (call: FetchCall) =>
                call[0].includes(`.da/library/blocks/${blockId}.html`) &&
                call[1]?.method === 'DELETE',
        );
    }

    async function extractSheetRows(post: FetchCall): Promise<Array<Record<string, string>>> {
        const formData = post[1]!.body as FormData;
        const blob = formData.get('data') as Blob;
        const json = JSON.parse(await blob.text());
        return json.data.data as Array<Record<string, string>>;
    }

    it('removes the row + deletes the doc page when block is present', async () => {
        const existingRows = [
            { name: 'Cards', path: blockPath('cards') },
            { name: title, path: blockPath(blockId) },
        ];
        mockFetch.mockImplementation(buildMockFetch({ existingRows, docExists: true }));

        const result = await service.removeBlockFromLibrary(org, site, { blockId });

        expect(result).toEqual({ docPage: 'deleted', sheet: 'removed' });

        // Doc page DELETE issued at the .html path.
        expect(findDocDeleteCall()).toBeDefined();

        // Sheet rewritten with only the remaining row.
        const post = findSheetPostCall();
        expect(post).toBeDefined();
        const rows = await extractSheetRows(post!);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({ name: 'Cards', path: blockPath('cards') });
    });

    it('rewrites with empty rows when removing the last block', async () => {
        const existingRows = [{ name: title, path: blockPath(blockId) }];
        mockFetch.mockImplementation(buildMockFetch({ existingRows, docExists: true }));

        const result = await service.removeBlockFromLibrary(org, site, { blockId });

        expect(result.sheet).toBe('removed');
        const rows = await extractSheetRows(findSheetPostCall()!);
        expect(rows).toHaveLength(0);
    });

    it('matches the row by blockId via path, not by title', async () => {
        // Title differs from the slug-derived path; removal must still drop it.
        const existingRows = [
            { name: 'A Totally Different Title', path: blockPath(blockId) },
            { name: 'Cards', path: blockPath('cards') },
        ];
        mockFetch.mockImplementation(buildMockFetch({ existingRows, docExists: true }));

        const result = await service.removeBlockFromLibrary(org, site, { blockId });

        expect(result.sheet).toBe('removed');
        const rows = await extractSheetRows(findSheetPostCall()!);
        expect(rows.map(r => r.name)).toEqual(['Cards']);
    });

    it('returns sheet:absent and does NOT rewrite when no matching row exists', async () => {
        const existingRows = [{ name: 'Cards', path: blockPath('cards') }];
        mockFetch.mockImplementation(buildMockFetch({ existingRows, docExists: false }));

        const result = await service.removeBlockFromLibrary(org, site, { blockId });

        expect(result.sheet).toBe('absent');
        expect(findSheetPostCall()).toBeUndefined();
    });

    it('returns sheet:absent and does NOT rewrite when the sheet is missing (404)', async () => {
        mockFetch.mockImplementation(buildMockFetch({ existingRows: undefined, docExists: false }));

        const result = await service.removeBlockFromLibrary(org, site, { blockId });

        expect(result.sheet).toBe('absent');
        expect(findSheetPostCall()).toBeUndefined();
    });

    it('reports docPage:absent when the doc page is already gone (404 on probe)', async () => {
        const existingRows = [{ name: title, path: blockPath(blockId) }];
        mockFetch.mockImplementation(
            buildMockFetch({ existingRows, docExists: false, docDeleteStatus: 404 }),
        );

        const result = await service.removeBlockFromLibrary(org, site, { blockId });

        expect(result.docPage).toBe('absent');
    });

    it('reports docPage:failed when the doc-page delete errors', async () => {
        const existingRows = [{ name: title, path: blockPath(blockId) }];
        mockFetch.mockImplementation(
            buildMockFetch({ existingRows, docExists: true, docDeleteStatus: 500 }),
        );

        const result = await service.removeBlockFromLibrary(org, site, { blockId });

        expect(result.docPage).toBe('failed');
    });

    it('is idempotent — fully-absent block returns absent/absent and does not throw', async () => {
        mockFetch.mockImplementation(buildMockFetch({ existingRows: undefined, docExists: false }));

        await expect(
            service.removeBlockFromLibrary(org, site, { blockId }),
        ).resolves.toEqual({ docPage: 'absent', sheet: 'absent' });
    });
});
