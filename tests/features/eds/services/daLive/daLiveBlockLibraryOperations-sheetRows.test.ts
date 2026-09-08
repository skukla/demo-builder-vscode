/**
 * DaLiveBlockLibraryOperations — appending to and removing from the sheet.
 *
 * `appendBlockToLibrary` and `removeBlockFromLibrary` are the non-destructive
 * pair: both read `.da/library/blocks.json`, change one row, and rewrite. The
 * rewrite goes out with `overwrite: true`, so a read that returned the wrong
 * rows would silently delete every other block in a customer's library. That is
 * why the rows handed to the rewrite are asserted whole, and why the read
 * failure path is asserted to write NOTHING.
 */

import {
    createBlockLibraryHarness,
    fakeResponse,
    fakeSheet,
    readSpreadsheetBody,
    sheetProbe,
    HARNESS_TOKEN,
    type BlockLibraryHarness,
} from './daLiveBlockLibraryOperations.testUtils';

describe('DaLiveBlockLibraryOperations sheet rows', () => {
    let h: BlockLibraryHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createBlockLibraryHarness();
    });

    const org = 'user-org';
    const site = 'user-site';
    const sheetUrl = 'https://admin.da.live/source/user-org/user-site/.da/library/blocks.json';
    const cardsRow = {
        name: 'Cards',
        path: 'https://content.da.live/user-org/user-site/.da/library/blocks/cards',
    };
    const heroRow = {
        name: 'Hero',
        path: 'https://content.da.live/user-org/user-site/.da/library/blocks/hero',
    };

    /** The rewrite POST, as `[url, init]`. */
    const rewritePost = (): [string, { body?: unknown }] =>
        h.fetchWithRetry.mock.calls.find(
            (call) => (call[1] as { method?: string }).method === 'POST'
        ) as [string, { body?: unknown }];

    /** The rows handed to the rewrite POST. */
    const rewrittenRows = async (): Promise<Array<Record<string, string>>> => {
        const body = (await readSpreadsheetBody(rewritePost()[1].body)) as {
            data: { data: Array<Record<string, string>> };
        };
        return body.data.data;
    };

    describe('reading the sheet', () => {
        it('GETs the sheet for this org and site with the bearer token', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe([]));

            await h.ops.appendBlockToLibrary(org, site, { blockId: 'hero', title: 'Hero' });

            expect(h.fetchWithRetry).toHaveBeenNthCalledWith(1, sheetUrl, {
                method: 'GET',
                headers: { Authorization: `Bearer ${HARNESS_TOKEN}` },
            });
        });

        it('refuses to rewrite a sheet it could not read', async () => {
            h.fetchWithRetry.mockImplementation(async (_url: string, init?: { method?: string }) =>
                init?.method === 'GET' ? fakeResponse(503) : fakeResponse(200)
            );

            await expect(
                h.ops.appendBlockToLibrary(org, site, { blockId: 'hero', title: 'Hero' })
            ).rejects.toThrow();

            const posts = h.fetchWithRetry.mock.calls.filter(
                (call) => (call[1] as { method?: string }).method === 'POST'
            );
            expect(posts).toStrictEqual([]);
        });

        it('names the operation when it builds the read error', async () => {
            h.fetchWithRetry.mockImplementation(async (_url: string, init?: { method?: string }) =>
                init?.method === 'GET' ? fakeResponse(503) : fakeResponse(200)
            );

            await expect(
                h.ops.appendBlockToLibrary(org, site, { blockId: 'hero', title: 'Hero' })
            ).rejects.toThrow();

            expect(h.createErrorFromResponse).toHaveBeenCalledWith(
                expect.objectContaining({ status: 503 }),
                'read block library sheet'
            );
        });
    });

    describe('appendBlockToLibrary', () => {
        it('creates the sheet with the one row when none existed', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe(null));

            const result = await h.ops.appendBlockToLibrary(org, site, {
                blockId: 'hero',
                title: 'Hero',
            });

            expect(await rewrittenRows()).toStrictEqual([heroRow]);
            expect(result).toStrictEqual({ status: 'created', siteConfigRegistered: true });
        });

        it('keeps every pre-existing row when appending', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe([cardsRow]));

            const result = await h.ops.appendBlockToLibrary(org, site, {
                blockId: 'hero',
                title: 'Hero',
            });

            expect(await rewrittenRows()).toStrictEqual([cardsRow, heroRow]);
            expect(result.status).toBe('appended');
        });

        it('rewrites with overwrite set, since the sheet already exists', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe([cardsRow]));

            await h.ops.appendBlockToLibrary(org, site, { blockId: 'hero', title: 'Hero' });

            expect((rewritePost()[1].body as FormData).get('overwrite')).toBe('true');
        });

        it('rewrites the same sheet it read, under the two library columns', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe([cardsRow]));

            await h.ops.appendBlockToLibrary(org, site, { blockId: 'hero', title: 'Hero' });

            const [url, init] = rewritePost();
            expect(url).toBe(sheetUrl);
            const body = (await readSpreadsheetBody(init.body)) as {
                data: { ':colWidths': number[] };
            };
            // One width per header: the sheet is written with ['name', 'path'].
            expect(body.data[':colWidths']).toStrictEqual([300, 300]);
        });

        it('treats a sheet body with no data envelope as an empty sheet', async () => {
            h.fetchWithRetry.mockImplementation(async (_url: string, init?: { method?: string }) =>
                init?.method === 'GET' ? fakeResponse(200, {}) : fakeResponse(200)
            );

            const result = await h.ops.appendBlockToLibrary(org, site, {
                blockId: 'hero',
                title: 'Hero',
            });

            expect(await rewrittenRows()).toStrictEqual([heroRow]);
            expect(result.status).toBe('appended');
        });

        it('treats a null sheet body as an empty sheet', async () => {
            // DA.live answering 200 with a JSON `null` body. The read must come
            // back as "no rows", not throw — a throw here aborts the append and
            // leaves the block out of the library with no failure reported.
            h.fetchWithRetry.mockImplementation(async (_url: string, init?: { method?: string }) =>
                init?.method === 'GET' ? fakeResponse(200, null) : fakeResponse(200)
            );

            const result = await h.ops.appendBlockToLibrary(org, site, {
                blockId: 'hero',
                title: 'Hero',
            });

            expect(await rewrittenRows()).toStrictEqual([heroRow]);
            expect(result.status).toBe('appended');
        });

        it('writes nothing when a row of that title is already there', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe([heroRow]));

            const result = await h.ops.appendBlockToLibrary(org, site, {
                blockId: 'hero',
                title: 'Hero',
            });

            const posts = h.fetchWithRetry.mock.calls.filter(
                (call) => (call[1] as { method?: string }).method === 'POST'
            );
            expect(posts).toStrictEqual([]);
            expect(result.status).toBe('skipped-duplicate');
        });

        it('still re-registers the config on a duplicate, to repair config drift', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe([heroRow]));

            const result = await h.ops.appendBlockToLibrary(org, site, {
                blockId: 'hero',
                title: 'Hero',
            });

            expect(h.updateSiteConfig).toHaveBeenCalledWith(org, site, [
                {
                    title: 'Blocks',
                    path: 'https://content.da.live/user-org/user-site/.da/library/blocks.json',
                },
            ]);
            expect(result.siteConfigRegistered).toBe(true);
        });

        it('reports the config failure without failing the append', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe([]));
            h.updateSiteConfig.mockResolvedValue({ success: false, error: 'config 403' });

            const result = await h.ops.appendBlockToLibrary(org, site, {
                blockId: 'hero',
                title: 'Hero',
            });

            // The sheet was present (empty, but a 200), so this is an append.
            expect(result).toStrictEqual({ status: 'appended', siteConfigRegistered: false });
        });

        it('throws when the rewrite is rejected, rather than reporting a row that is not there', async () => {
            h.fetchWithRetry.mockImplementation(async (_url: string, init?: { method?: string }) =>
                init?.method === 'GET' ? fakeResponse(404) : fakeResponse(500, undefined, 'Error')
            );

            await expect(
                h.ops.appendBlockToLibrary(org, site, { blockId: 'hero', title: 'Hero' })
            ).rejects.toThrow('Failed to write block library sheet');
        });

        it('names the DA.live failure in the throw rather than a placeholder', async () => {
            // The whole message, not its prefix: whoever reads this in the logs
            // needs the status DA.live actually returned to tell a 503 from a
            // permissions refusal.
            h.fetchWithRetry.mockImplementation(async (_url: string, init?: { method?: string }) =>
                init?.method === 'GET'
                    ? fakeResponse(200, fakeSheet([]))
                    : fakeResponse(503, undefined, 'Service Unavailable')
            );

            await expect(
                h.ops.appendBlockToLibrary(org, site, { blockId: 'hero', title: 'Hero' })
            ).rejects.toThrow(
                'Failed to write block library sheet: Failed to create spreadsheet: 503 Service Unavailable'
            );
        });
    });

    describe('removeBlockFromLibrary — the doc page', () => {
        it('deletes the page this module wrote and reports it was there', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe(null));
            h.sourceExists.mockResolvedValue(true);

            const result = await h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' });

            expect(h.sourceExists).toHaveBeenCalledWith(org, site, '.da/library/blocks/hero.html');
            expect(h.deleteSource).toHaveBeenCalledWith(org, site, '.da/library/blocks/hero.html');
            expect(result.docPage).toBe('deleted');
        });

        it('reports absent when the page was already gone', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe(null));
            h.sourceExists.mockResolvedValue(false);

            const result = await h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' });

            expect(result.docPage).toBe('absent');
        });

        it('reports failed when the delete itself reported an error', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe(null));
            h.sourceExists.mockResolvedValue(true);
            h.deleteSource.mockResolvedValue({ success: false, error: 'forbidden' });

            const result = await h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' });

            expect(result.docPage).toBe('failed');
        });

        it('leaves the block source files alone — only the library artifacts go', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe(null));

            await h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' });

            expect(h.deleteSource.mock.calls).toStrictEqual([
                [org, site, '.da/library/blocks/hero.html'],
            ]);
        });
    });

    describe('removeBlockFromLibrary — the sheet row', () => {
        it('matches the row by blockId in its path, not by its title', async () => {
            const renamedRow = {
                name: 'Something Else Entirely',
                path: 'https://content.da.live/user-org/user-site/.da/library/blocks/hero',
            };
            h.fetchWithRetry.mockImplementation(sheetProbe([cardsRow, renamedRow]));

            const result = await h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' });

            expect(await rewrittenRows()).toStrictEqual([cardsRow]);
            expect(result.sheet).toBe('removed');
        });

        it('reads and rewrites the same sheet URL', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe([cardsRow, heroRow]));

            await h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' });

            expect(h.fetchWithRetry).toHaveBeenCalledWith(sheetUrl, {
                method: 'GET',
                headers: { Authorization: `Bearer ${HARNESS_TOKEN}` },
            });
            const [url, init] = rewritePost();
            expect(url).toBe(sheetUrl);
            expect((init.body as FormData).get('overwrite')).toBe('true');
            const body = (await readSpreadsheetBody(init.body)) as {
                data: { ':colWidths': number[] };
            };
            expect(body.data[':colWidths']).toStrictEqual([300, 300]);
        });

        it('keeps a row that carries no path at all rather than dropping it', async () => {
            const pathlessRow = { name: 'Hand-added' };
            h.fetchWithRetry.mockImplementation(
                sheetProbe([pathlessRow as Record<string, string>, heroRow])
            );

            const result = await h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' });

            expect(await rewrittenRows()).toStrictEqual([pathlessRow]);
            expect(result.sheet).toBe('removed');
        });

        it('rewrites an empty sheet when the last row goes', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe([heroRow]));

            const result = await h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' });

            expect(await rewrittenRows()).toStrictEqual([]);
            expect(result.sheet).toBe('removed');
        });

        it('leaves the sheet untouched when no row matches', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe([cardsRow]));

            const result = await h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' });

            const posts = h.fetchWithRetry.mock.calls.filter(
                (call) => (call[1] as { method?: string }).method === 'POST'
            );
            expect(posts).toStrictEqual([]);
            expect(result.sheet).toBe('absent');
        });

        it('reports absent rather than throwing when the sheet is missing', async () => {
            h.fetchWithRetry.mockImplementation(sheetProbe(null));

            const result = await h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' });

            expect(result.sheet).toBe('absent');
        });

        it('does not match a block whose id merely starts the same', async () => {
            const heroBannerRow = {
                name: 'Hero Banner',
                path: 'https://content.da.live/user-org/user-site/.da/library/blocks/hero-banner',
            };
            h.fetchWithRetry.mockImplementation(sheetProbe([heroBannerRow]));

            const result = await h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' });

            expect(result.sheet).toBe('absent');
        });

        it('throws when the rewrite is rejected, rather than reporting a removal that did not happen', async () => {
            h.fetchWithRetry.mockImplementation(async (_url: string, init?: { method?: string }) =>
                init?.method === 'GET'
                    ? fakeResponse(200, { data: { data: [heroRow] } })
                    : fakeResponse(500, undefined, 'Error')
            );

            await expect(
                h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' })
            ).rejects.toThrow('Failed to rewrite block library sheet');
        });

        it('names the DA.live failure in the throw rather than a placeholder', async () => {
            h.fetchWithRetry.mockImplementation(async (_url: string, init?: { method?: string }) =>
                init?.method === 'GET'
                    ? fakeResponse(200, fakeSheet([heroRow]))
                    : fakeResponse(503, undefined, 'Service Unavailable')
            );

            await expect(
                h.ops.removeBlockFromLibrary(org, site, { blockId: 'hero' })
            ).rejects.toThrow(
                'Failed to rewrite block library sheet: Failed to create spreadsheet: 503 Service Unavailable'
            );
        });
    });
});
