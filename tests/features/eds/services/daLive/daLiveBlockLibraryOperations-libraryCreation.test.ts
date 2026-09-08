/**
 * DaLiveBlockLibraryOperations — the `createBlockLibrary` orchestration.
 *
 * Reached through `createBlockLibraryFromTemplate`, which is the only caller.
 * This is the destructive half: it deletes seven library artifacts from a real
 * customer site before rewriting the sheet, so WHICH paths it deletes and the
 * guard that returns before deleting anything are asserted by name.
 *
 * The site-config registration is asserted for its exact title — DA.live's
 * library UI renders block lists only for a section titled exactly "Blocks"
 * and treats any other name as a blank iframe plugin.
 */

import {
    createBlockLibraryHarness,
    componentDefinition,
    docPageProbe,
    fakeResponse,
    readSpreadsheetBody,
    type BlockLibraryHarness,
} from './daLiveBlockLibraryOperations.testUtils';

describe('DaLiveBlockLibraryOperations.createBlockLibrary', () => {
    let h: BlockLibraryHarness;
    let getFileContent: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createBlockLibraryHarness();
        getFileContent = jest.fn();
    });

    const org = 'user-org';
    const site = 'user-site';

    const withBlocks = (blocks: Array<{ title: string; id: string }>): void => {
        getFileContent.mockResolvedValue(
            componentDefinition([{ id: 'blocks', components: blocks }])
        );
    };

    const run = (): Promise<{
        success: boolean;
        blocksCount: number;
        paths: string[];
        error?: string;
    }> =>
        h.ops.createBlockLibraryFromTemplate(
            org,
            site,
            'hlxsites',
            'citisignal',
            getFileContent as unknown as (
                owner: string,
                repo: string,
                path: string
            ) => Promise<{ content: string; sha: string } | null>
        );

    /** The sheet body of the one POST `createJsonSpreadsheet` makes. */
    const writtenSheetRows = async (): Promise<Array<Record<string, string>>> => {
        const post = h.fetchWithRetry.mock.calls.find(
            (call) => (call[1] as { method?: string }).method === 'POST'
        ) as [string, { body?: unknown }];
        const body = (await readSpreadsheetBody(post[1].body)) as {
            data: { data: Array<Record<string, string>> };
        };
        return body.data.data;
    };

    describe('cleaning up prior library artifacts', () => {
        it('deletes the seven artifacts previous runs could have left behind', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['cards']));
            withBlocks([{ title: 'Cards', id: 'cards' }]);

            await run();

            expect(h.deleteSource.mock.calls).toStrictEqual([
                [org, site, '.da/library/blocks.json'],
                [org, site, '.da/library/blocks.html'],
                [org, site, '.da/library/blocks.xlsx'],
                [org, site, '.da/library/storefront-blocks.json'],
                [org, site, '.da/library/storefront-blocks.html'],
                [org, site, '.da/library/block-collection.json'],
                [org, site, '.da/library/block-collection.html'],
            ]);
        });

        it('deletes nothing when no block turned out to have a doc page', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            withBlocks([{ title: 'Cards', id: 'cards' }]);

            const result = await run();

            expect(h.deleteSource).not.toHaveBeenCalled();
            expect(h.updateSiteConfig).not.toHaveBeenCalled();
            expect(result).toStrictEqual({ success: true, blocksCount: 0, paths: [] });
        });
    });

    describe('registering the library section', () => {
        it('registers exactly one section titled "Blocks" pointing at the sheet', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['cards']));
            withBlocks([{ title: 'Cards', id: 'cards' }]);

            await run();

            expect(h.updateSiteConfig).toHaveBeenCalledWith(org, site, [
                {
                    title: 'Blocks',
                    path: 'https://content.da.live/user-org/user-site/.da/library/blocks.json',
                },
            ]);
        });

        it('still writes the sheet and reports success when the config update fails', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['cards']));
            h.updateSiteConfig.mockResolvedValue({ success: false, error: 'config 403' });
            withBlocks([{ title: 'Cards', id: 'cards' }]);

            const result = await run();

            expect(await writtenSheetRows()).toHaveLength(1);
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(1);
        });
    });

    describe('the sheet it writes', () => {
        it('writes a row only for blocks that have a doc page', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['cards']));
            withBlocks([
                { title: 'Cards', id: 'cards' },
                { title: 'Hero', id: 'hero' },
            ]);

            const result = await run();

            expect(await writtenSheetRows()).toStrictEqual([
                {
                    name: 'Cards',
                    path: 'https://content.da.live/user-org/user-site/.da/library/blocks/cards',
                },
            ]);
            expect(result.blocksCount).toBe(1);
        });

        it('overwrites the sheet rather than failing on the existing one', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['cards']));
            withBlocks([{ title: 'Cards', id: 'cards' }]);

            await run();

            const post = h.fetchWithRetry.mock.calls.find(
                (call) => (call[1] as { method?: string }).method === 'POST'
            ) as [string, { body?: unknown }];
            expect((post[1].body as FormData).get('overwrite')).toBe('true');
        });

        it('reports failure naming the sheet when the write is rejected', async () => {
            h.fetchWithRetry.mockImplementation(async (url: string, init?: { method?: string }) => {
                if (init?.method === 'POST' && url.endsWith('.da/library/blocks.json')) {
                    return fakeResponse(500, undefined, 'Internal Server Error');
                }
                return docPageProbe(['cards'])(url, init);
            });
            withBlocks([{ title: 'Cards', id: 'cards' }]);

            const result = await run();

            expect(result).toStrictEqual({
                success: false,
                blocksCount: 0,
                paths: [],
                error: 'Failed to create /.da/library/blocks.json',
            });
        });
    });

    describe('the paths it hands back for publishing', () => {
        it('leads with the sheet, then one absolute path per documented block', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['cards', 'hero']));
            withBlocks([
                { title: 'Cards', id: 'cards' },
                { title: 'Hero', id: 'hero' },
            ]);

            const result = await run();

            expect(result.paths).toStrictEqual([
                '/.da/library/blocks.json',
                '/.da/library/blocks/cards',
                '/.da/library/blocks/hero',
            ]);
        });

        it('makes every path absolute — the AEM bulk API addresses from the site root', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['cards']));
            withBlocks([{ title: 'Cards', id: 'cards' }]);

            const result = await run();

            expect(result.paths.every((p) => p.startsWith('/'))).toBe(true);
        });
    });

    describe('when a collaborator throws mid-flight', () => {
        it('reports the failure instead of leaving the caller to guess', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['cards']));
            h.deleteSource.mockRejectedValue(new Error('DA.live 503'));
            withBlocks([{ title: 'Cards', id: 'cards' }]);

            const result = await run();

            expect(result).toStrictEqual({
                success: false,
                blocksCount: 0,
                paths: [],
                error: 'DA.live 503',
            });
        });
    });
});
