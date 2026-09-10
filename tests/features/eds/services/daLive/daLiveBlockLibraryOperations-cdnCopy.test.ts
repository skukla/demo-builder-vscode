/**
 * DaLiveBlockLibraryOperations — copying doc pages from library content
 * sources, reached through `createBlockLibraryFromTemplate`.
 *
 * Every argument here is load-bearing and none of them is visible from the
 * return value: `preview: true` (library doc pages are previewed and left
 * there, so the published host 404s for every block of every source), the
 * source org/site the page is fetched FROM, and the destination org/site it is
 * written TO. A swap of those two would copy in the wrong direction against a
 * real customer site and report success either way.
 */

import {
    createBlockLibraryHarness,
    componentDefinition,
    docPageProbe,
    type BlockLibraryHarness,
} from './daLiveBlockLibraryOperations.testUtils';

describe('DaLiveBlockLibraryOperations CDN doc-page copy', () => {
    let h: BlockLibraryHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createBlockLibraryHarness();
        h.copySingleFile.mockResolvedValue(false);
    });

    const org = 'user-org';
    const site = 'user-site';
    const collection = { org: 'aem-block-collection', site: 'library' };
    const boilerplate = { org: 'adobe', site: 'boilerplate' };

    const run = (
        blocks: Array<{ title: string; id: string; plugins?: { da?: { unsafeHTML?: string } } }>,
        sources?: Array<{ org: string; site: string }>,
        installedBlockIds?: string[]
    ): Promise<{ success: boolean; blocksCount: number; paths: string[] }> =>
        h.ops.createBlockLibraryFromTemplate(
            org,
            site,
            'hlxsites',
            'citisignal',
            jest
                .fn()
                .mockResolvedValue(
                    componentDefinition([{ id: 'blocks', components: blocks }])
                ) as unknown as (
                owner: string,
                repo: string,
                path: string
            ) => Promise<{ content: string; sha: string } | null>,
            sources,
            installedBlockIds
        );

    describe('the copy request', () => {
        it('fetches from the source preview host and writes to the destination site', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));

            await run([{ title: 'Hero', id: 'hero' }], [collection]);

            expect(h.copySingleFile).toHaveBeenCalledWith(
                'mock-ims-token',
                { org: 'aem-block-collection', site: 'library', preview: true },
                '/.da/library/blocks/hero',
                { org, site },
                '/.da/library/blocks/hero'
            );
        });

        it('tries the sources in order and stops at the first that has the page', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            h.copySingleFile.mockImplementation(
                async (_token: string, source: { org: string }) => source.org === 'adobe'
            );

            await run([{ title: 'Hero', id: 'hero' }], [boilerplate, collection]);

            expect(h.copySingleFile).toHaveBeenCalledTimes(1);
            expect(h.copySingleFile.mock.calls[0][1]).toStrictEqual({
                ...boilerplate,
                preview: true,
            });
        });

        it('falls through to the next source when the first does not have the page', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            h.copySingleFile.mockImplementation(
                async (_token: string, source: { org: string }) =>
                    source.org === 'aem-block-collection'
            );

            await run([{ title: 'Hero', id: 'hero' }], [boilerplate, collection]);

            const triedOrgs = h.copySingleFile.mock.calls.map(
                (call) => (call[1] as { org: string }).org
            );
            expect(triedOrgs).toStrictEqual(['adobe', 'aem-block-collection']);
        });
    });

    describe('which blocks it tries', () => {
        it('skips a block that already carries its own example markup', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));

            await run(
                [
                    {
                        title: 'Hero',
                        id: 'hero',
                        plugins: { da: { unsafeHTML: '<div class="hero"></div>' } },
                    },
                    { title: 'Cards', id: 'cards' },
                ],
                [collection]
            );

            const triedPaths = h.copySingleFile.mock.calls.map((call) => call[2]);
            expect(triedPaths).toStrictEqual(['/.da/library/blocks/cards']);
        });

        it('skips a block that already has a doc page on the destination', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['cards']));

            await run(
                [
                    { title: 'Cards', id: 'cards' },
                    { title: 'Hero', id: 'hero' },
                ],
                [collection]
            );

            const triedPaths = h.copySingleFile.mock.calls.map((call) => call[2]);
            expect(triedPaths).toStrictEqual(['/.da/library/blocks/hero']);
        });

        it('restricts the attempt to installed blocks when the caller names them', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));

            await run(
                [
                    { title: 'Hero', id: 'hero' },
                    { title: 'Cards', id: 'cards' },
                ],
                [collection],
                ['cards']
            );

            const triedPaths = h.copySingleFile.mock.calls.map((call) => call[2]);
            expect(triedPaths).toStrictEqual(['/.da/library/blocks/cards']);
        });

        it('tries every undocumented block when the installed list is empty', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));

            await run(
                [
                    { title: 'Hero', id: 'hero' },
                    { title: 'Cards', id: 'cards' },
                ],
                [collection],
                []
            );

            const triedPaths = h.copySingleFile.mock.calls.map((call) => call[2]);
            expect(triedPaths).toStrictEqual([
                '/.da/library/blocks/hero',
                '/.da/library/blocks/cards',
            ]);
        });

        it('makes no copy attempt when every block is already documented', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['hero']));

            await run([{ title: 'Hero', id: 'hero' }], [collection]);

            expect(h.copySingleFile).not.toHaveBeenCalled();
        });
    });
});
