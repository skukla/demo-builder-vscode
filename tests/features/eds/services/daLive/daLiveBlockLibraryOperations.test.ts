/**
 * DaLiveBlockLibraryOperations — `createJsonSpreadsheet`.
 *
 * The single write every other sheet path in this module funnels through:
 * `appendBlockToLibrary`, `removeBlockLibraryRow` and `createBlockLibrary` all
 * rewrite `.da/library/blocks.json` by calling it. So the URL it builds, the
 * DA.live native envelope it uploads and the `overwrite` flag it sets are the
 * arguments a malformed call would corrupt for all three.
 *
 * Argument-level, not call-count: a mock answers the same however it is
 * invoked, so asserting only "it was called" would pass on a request that
 * DA.live rejects.
 */

import {
    createBlockLibraryHarness,
    fetchCall,
    fakeResponse,
    readSpreadsheetBody,
    HARNESS_TOKEN,
    type BlockLibraryHarness,
} from './daLiveBlockLibraryOperations.testUtils';

describe('DaLiveBlockLibraryOperations.createJsonSpreadsheet', () => {
    let h: BlockLibraryHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createBlockLibraryHarness();
    });

    const org = 'user-org';
    const site = 'user-site';
    const rows = [
        {
            name: 'Cards',
            path: 'https://content.da.live/user-org/user-site/.da/library/blocks/cards',
        },
        {
            name: 'Hero',
            path: 'https://content.da.live/user-org/user-site/.da/library/blocks/hero',
        },
    ];

    describe('the request it sends', () => {
        it('POSTs to the DA.live source URL for the destination org and site', async () => {
            await h.ops.createJsonSpreadsheet(
                org,
                site,
                '.da/library/blocks',
                ['name', 'path'],
                rows
            );

            const [url, init] = fetchCall(h.fetchWithRetry, 0);
            expect(url).toBe(
                'https://admin.da.live/source/user-org/user-site/.da/library/blocks.json'
            );
            expect(init.method).toBe('POST');
        });

        it('carries the IMS token as a bearer header', async () => {
            await h.ops.createJsonSpreadsheet(
                org,
                site,
                '.da/library/blocks',
                ['name', 'path'],
                rows
            );

            expect(h.getImsToken).toHaveBeenCalled();
            const [, init] = fetchCall(h.fetchWithRetry, 0);
            expect(init.headers).toEqual({ Authorization: `Bearer ${HARNESS_TOKEN}` });
        });

        it('strips a leading slash from the destination path', async () => {
            await h.ops.createJsonSpreadsheet(org, site, '/.da/library/blocks', ['name'], rows);

            const [url] = fetchCall(h.fetchWithRetry, 0);
            expect(url).toBe(
                'https://admin.da.live/source/user-org/user-site/.da/library/blocks.json'
            );
        });

        it('appends .json when the path has no extension', async () => {
            await h.ops.createJsonSpreadsheet(org, site, 'data/prices', ['name'], rows);

            const [url] = fetchCall(h.fetchWithRetry, 0);
            expect(url).toBe('https://admin.da.live/source/user-org/user-site/data/prices.json');
        });

        it('does not double the extension when the path already ends in .json', async () => {
            await h.ops.createJsonSpreadsheet(org, site, 'data/prices.json', ['name'], rows);

            const [url] = fetchCall(h.fetchWithRetry, 0);
            expect(url).toBe('https://admin.da.live/source/user-org/user-site/data/prices.json');
        });
    });

    describe('the DA.live native envelope it uploads', () => {
        it('wraps the rows in the multi-sheet shape DA.live expects', async () => {
            await h.ops.createJsonSpreadsheet(
                org,
                site,
                '.da/library/blocks',
                ['name', 'path'],
                rows
            );

            const [, init] = fetchCall(h.fetchWithRetry, 0);
            expect(await readSpreadsheetBody(init.body)).toEqual({
                data: {
                    total: 2,
                    limit: 2,
                    offset: 0,
                    data: rows,
                    ':colWidths': [300, 300],
                },
                ':names': ['data'],
                ':version': 3,
                ':type': 'multi-sheet',
            });
        });

        it('sizes total, limit and colWidths from the rows and headers separately', async () => {
            await h.ops.createJsonSpreadsheet(
                org,
                site,
                '.da/library/blocks',
                ['name', 'path', 'group'],
                [rows[0]]
            );

            const [, init] = fetchCall(h.fetchWithRetry, 0);
            const body = (await readSpreadsheetBody(init.body)) as {
                data: { total: number; limit: number; ':colWidths': number[] };
            };
            expect(body.data.total).toBe(1);
            expect(body.data.limit).toBe(1);
            expect(body.data[':colWidths']).toEqual([300, 300, 300]);
        });

        it('uploads an empty sheet as a zero-row envelope rather than skipping the write', async () => {
            await h.ops.createJsonSpreadsheet(
                org,
                site,
                '.da/library/blocks',
                ['name', 'path'],
                []
            );

            const [, init] = fetchCall(h.fetchWithRetry, 0);
            const body = (await readSpreadsheetBody(init.body)) as {
                data: { total: number; data: unknown[] };
            };
            expect(body.data.total).toBe(0);
            expect(body.data.data).toStrictEqual([]);
        });

        it('sends the payload as an application/json blob under the "data" field', async () => {
            await h.ops.createJsonSpreadsheet(org, site, '.da/library/blocks', ['name'], rows);

            const [, init] = fetchCall(h.fetchWithRetry, 0);
            const blob = (init.body as FormData).get('data') as Blob;
            expect(blob.type).toBe('application/json');
        });
    });

    describe('the overwrite flag', () => {
        it('sets overwrite only when the option asks for it', async () => {
            await h.ops.createJsonSpreadsheet(org, site, '.da/library/blocks', ['name'], rows, {
                overwrite: true,
            });

            const [, init] = fetchCall(h.fetchWithRetry, 0);
            expect((init.body as FormData).get('overwrite')).toBe('true');
        });

        it('omits overwrite when the option is absent', async () => {
            await h.ops.createJsonSpreadsheet(org, site, '.da/library/blocks', ['name'], rows);

            const [, init] = fetchCall(h.fetchWithRetry, 0);
            expect((init.body as FormData).get('overwrite')).toBeNull();
        });

        it('omits overwrite when the option is explicitly false', async () => {
            await h.ops.createJsonSpreadsheet(org, site, '.da/library/blocks', ['name'], rows, {
                overwrite: false,
            });

            const [, init] = fetchCall(h.fetchWithRetry, 0);
            expect((init.body as FormData).get('overwrite')).toBeNull();
        });
    });

    describe('what it reports back', () => {
        it('returns the absolute written path on success', async () => {
            const result = await h.ops.createJsonSpreadsheet(
                org,
                site,
                '.da/library/blocks',
                ['name'],
                rows
            );

            expect(result).toEqual({ success: true, path: '/.da/library/blocks.json' });
        });

        it('names the overwrite option when DA.live reports the document already exists', async () => {
            h.fetchWithRetry.mockResolvedValue(fakeResponse(409));

            const result = await h.ops.createJsonSpreadsheet(
                org,
                site,
                '.da/library/blocks',
                ['name'],
                rows
            );

            expect(result).toEqual({
                success: false,
                path: '/.da/library/blocks.json',
                error: 'Document already exists. Use overwrite option to replace.',
            });
        });

        it('reports the status and status text for any other failure', async () => {
            h.fetchWithRetry.mockResolvedValue(
                fakeResponse(500, undefined, 'Internal Server Error')
            );

            const result = await h.ops.createJsonSpreadsheet(
                org,
                site,
                '.da/library/blocks',
                ['name'],
                rows
            );

            expect(result).toEqual({
                success: false,
                path: '/.da/library/blocks.json',
                error: 'Failed to create spreadsheet: 500 Internal Server Error',
            });
        });

        it('reports the normalized path even when the caller passed a leading slash', async () => {
            h.fetchWithRetry.mockResolvedValue(
                fakeResponse(500, undefined, 'Internal Server Error')
            );

            const result = await h.ops.createJsonSpreadsheet(
                org,
                site,
                '/data/prices',
                ['name'],
                rows
            );

            expect(result.path).toBe('/data/prices.json');
        });
    });
});
