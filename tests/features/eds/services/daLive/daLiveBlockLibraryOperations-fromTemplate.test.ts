/**
 * DaLiveBlockLibraryOperations — `createBlockLibraryFromTemplate`.
 *
 * The READ half of library creation: fetch `component-definition.json` from the
 * template repo, flatten every group into block descriptors, and hand them to
 * `createBlockLibrary`. Its three early returns are what keep a template with
 * no blocks from writing anything to a customer's DA.live site, so each is
 * asserted by the writes that did NOT happen, not only by the return value.
 */

import {
    createBlockLibraryHarness,
    componentDefinition,
    docPageProbe,
    readSpreadsheetBody,
    type BlockLibraryHarness,
} from './daLiveBlockLibraryOperations.testUtils';

describe('DaLiveBlockLibraryOperations.createBlockLibraryFromTemplate', () => {
    let h: BlockLibraryHarness;
    let getFileContent: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createBlockLibraryHarness();
        getFileContent = jest.fn();
    });

    const org = 'user-org';
    const site = 'user-site';
    const templateOwner = 'hlxsites';
    const templateRepo = 'citisignal';

    const run = (
        sources?: Array<{ org: string; site: string }>,
        installedBlockIds?: string[]
    ): Promise<{ success: boolean; blocksCount: number; paths: string[]; error?: string }> =>
        h.ops.createBlockLibraryFromTemplate(
            org,
            site,
            templateOwner,
            templateRepo,
            getFileContent as unknown as (
                owner: string,
                repo: string,
                path: string
            ) => Promise<{ content: string; sha: string } | null>,
            sources,
            installedBlockIds
        );

    /** No block anywhere has a doc page, so nothing is ever verified. */
    const nothingDocumented = (): void => {
        h.fetchWithRetry.mockImplementation(docPageProbe([]));
    };

    describe('reading the template definition', () => {
        it('asks the template repo for component-definition.json by owner and repo', async () => {
            nothingDocumented();
            getFileContent.mockResolvedValue(componentDefinition([]));

            await run();

            expect(getFileContent).toHaveBeenCalledWith(
                templateOwner,
                templateRepo,
                'component-definition.json'
            );
        });

        it('writes nothing when the template has no component-definition.json', async () => {
            getFileContent.mockResolvedValue(null);

            const result = await run();

            expect(result).toStrictEqual({ success: true, blocksCount: 0, paths: [] });
            expect(h.createSource).not.toHaveBeenCalled();
            expect(h.deleteSource).not.toHaveBeenCalled();
            expect(h.updateSiteConfig).not.toHaveBeenCalled();
        });

        it('writes nothing when the file exists but its content is empty', async () => {
            getFileContent.mockResolvedValue({ content: '', sha: 'abc' });

            const result = await run();

            expect(result).toStrictEqual({ success: true, blocksCount: 0, paths: [] });
            expect(h.deleteSource).not.toHaveBeenCalled();
        });

        it('writes nothing when the definition declares no blocks', async () => {
            getFileContent.mockResolvedValue(
                componentDefinition([{ id: 'blocks', components: [] }])
            );

            const result = await run();

            expect(result).toStrictEqual({ success: true, blocksCount: 0, paths: [] });
            expect(h.deleteSource).not.toHaveBeenCalled();
            expect(h.updateSiteConfig).not.toHaveBeenCalled();
        });
    });

    describe('flattening groups into blocks', () => {
        it('takes components from EVERY group, not only the one named "blocks"', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['cards', 'product-teaser']));
            getFileContent.mockResolvedValue(
                componentDefinition([
                    { id: 'blocks', components: [{ title: 'Cards', id: 'cards' }] },
                    {
                        id: 'product',
                        components: [{ title: 'Product Teaser', id: 'product-teaser' }],
                    },
                ])
            );

            const result = await run();

            expect(result.blocksCount).toBe(2);
            expect(result.paths).toStrictEqual([
                '/.da/library/blocks.json',
                '/.da/library/blocks/cards',
                '/.da/library/blocks/product-teaser',
            ]);
        });

        it('carries each block title and id through to the sheet row', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['store-locator']));
            getFileContent.mockResolvedValue(
                componentDefinition([
                    { components: [{ title: 'Store Locator', id: 'store-locator' }] },
                ])
            );

            await run();

            const sheetWrite = h.fetchWithRetry.mock.calls.find(
                (call) => (call[1] as { method?: string }).method === 'POST'
            ) as [string, { body?: unknown }];
            const body = (await readSpreadsheetBody(sheetWrite[1].body)) as {
                data: { data: Array<Record<string, string>> };
            };
            expect(body.data.data).toStrictEqual([
                {
                    name: 'Store Locator',
                    path: 'https://content.da.live/user-org/user-site/.da/library/blocks/store-locator',
                },
            ]);
        });

        it('reads a block example from plugins.da.unsafeHTML', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            getFileContent.mockResolvedValue(
                componentDefinition([
                    {
                        components: [
                            {
                                title: 'Hero',
                                id: 'hero',
                                plugins: { da: { unsafeHTML: '<div class="hero">Example</div>' } },
                            },
                        ],
                    },
                ])
            );

            await run();

            expect(h.createSource).toHaveBeenCalledWith(
                org,
                site,
                '.da/library/blocks/hero.html',
                '<body><header></header><main><div><div class="hero">Example</div></div></main><footer></footer></body>'
            );
        });

        it('tolerates a definition with no groups key at all', async () => {
            nothingDocumented();
            getFileContent.mockResolvedValue({ content: JSON.stringify({}), sha: 'abc' });

            const result = await run();

            expect(result).toStrictEqual({ success: true, blocksCount: 0, paths: [] });
        });

        it('tolerates a group with no components key', async () => {
            nothingDocumented();
            getFileContent.mockResolvedValue(componentDefinition([{ id: 'blocks' }]));

            const result = await run();

            expect(result).toStrictEqual({ success: true, blocksCount: 0, paths: [] });
        });
    });

    describe('passing the optional arguments through', () => {
        it('forwards the content sources so undocumented blocks are fetched from them', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            h.copySingleFile.mockResolvedValue(false);
            getFileContent.mockResolvedValue(
                componentDefinition([{ components: [{ title: 'Hero', id: 'hero' }] }])
            );

            await run([{ org: 'aem-block-collection', site: 'library' }]);

            expect(h.copySingleFile).toHaveBeenCalledWith(
                'mock-ims-token',
                { org: 'aem-block-collection', site: 'library', preview: true },
                '/.da/library/blocks/hero',
                { org, site },
                '/.da/library/blocks/hero'
            );
        });

        it('forwards installedBlockIds so native template blocks are not CDN-probed', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            h.copySingleFile.mockResolvedValue(false);
            getFileContent.mockResolvedValue(
                componentDefinition([
                    {
                        components: [
                            { title: 'Hero', id: 'hero' },
                            { title: 'Cards', id: 'cards' },
                        ],
                    },
                ])
            );

            await run([{ org: 'aem-block-collection', site: 'library' }], ['cards']);

            const probedPaths = h.copySingleFile.mock.calls.map((call) => call[2]);
            expect(probedPaths).toStrictEqual(['/.da/library/blocks/cards']);
        });

        it('skips the CDN copy entirely when no content sources are given', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            getFileContent.mockResolvedValue(
                componentDefinition([{ components: [{ title: 'Hero', id: 'hero' }] }])
            );

            await run();

            expect(h.copySingleFile).not.toHaveBeenCalled();
        });

        it('skips the CDN copy when the content source list is empty', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            getFileContent.mockResolvedValue(
                componentDefinition([{ components: [{ title: 'Hero', id: 'hero' }] }])
            );

            await run([]);

            expect(h.copySingleFile).not.toHaveBeenCalled();
        });
    });

    describe('when the template cannot be read', () => {
        it('reports the parse failure without writing anything', async () => {
            getFileContent.mockResolvedValue({ content: 'not json', sha: 'abc' });

            const result = await run();

            expect(result.success).toBe(false);
            expect(result.blocksCount).toBe(0);
            expect(result.paths).toStrictEqual([]);
            expect(result.error).toBeDefined();
            expect(h.deleteSource).not.toHaveBeenCalled();
            expect(h.updateSiteConfig).not.toHaveBeenCalled();
        });

        it('reports the fetch failure message when getFileContent throws', async () => {
            getFileContent.mockRejectedValue(new Error('GitHub 404'));

            const result = await run();

            expect(result).toStrictEqual({
                success: false,
                blocksCount: 0,
                paths: [],
                error: 'GitHub 404',
            });
        });
    });
});
