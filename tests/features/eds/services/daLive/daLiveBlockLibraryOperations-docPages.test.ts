/**
 * DaLiveBlockLibraryOperations — the three doc-page writers.
 *
 * `upsertBlockDocPage` overwrites, `ensureBlockDocPages` preserves, and
 * `generateStubDocPages` (reached through library creation) fills whatever the
 * first two left undocumented. The difference between overwrite and preserve is
 * the one a user notices — an authored page replaced by a generated one is an
 * edit destroyed — so the `overwrite` argument is asserted on both.
 *
 * The document envelope is asserted whole rather than by substring: DA.live
 * treats direct children of `<main>` as sections, so the inner `<div>` is what
 * makes the block render as a block.
 */

import {
    createBlockLibraryHarness,
    componentDefinition,
    docPageProbe,
    type BlockLibraryHarness,
} from './daLiveBlockLibraryOperations.testUtils';

describe('DaLiveBlockLibraryOperations doc pages', () => {
    let h: BlockLibraryHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createBlockLibraryHarness();
    });

    const org = 'user-org';
    const site = 'user-site';

    describe('upsertBlockDocPage', () => {
        it('overwrites the page so a re-run refreshes the rendered preview', async () => {
            const status = await h.ops.upsertBlockDocPage(org, site, {
                id: 'hero',
                exampleHtml: '<div class="hero">Example</div>',
            });

            expect(h.createSource).toHaveBeenCalledWith(
                org,
                site,
                '.da/library/blocks/hero.html',
                '<body><header></header><main><div><div class="hero">Example</div></div></main><footer></footer></body>',
                { overwrite: true }
            );
            expect(status).toBe('written');
        });

        it('reports failure rather than throwing when DA.live rejects the write', async () => {
            h.createSource.mockResolvedValue({ success: false, error: 'forbidden' });

            const status = await h.ops.upsertBlockDocPage(org, site, {
                id: 'hero',
                exampleHtml: '<div class="hero"></div>',
            });

            expect(status).toBe('failed');
        });

        it('reports failure rather than throwing when the write throws', async () => {
            h.createSource.mockRejectedValue(new Error('socket hang up'));

            const status = await h.ops.upsertBlockDocPage(org, site, {
                id: 'hero',
                exampleHtml: '<div class="hero"></div>',
            });

            expect(status).toBe('failed');
        });
    });

    describe('ensureBlockDocPages', () => {
        it('writes a page for a block with an example and no existing page', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));

            await h.ops.ensureBlockDocPages(org, site, [
                { title: 'Hero', id: 'hero', exampleHtml: '<div class="hero">Ex</div>' },
            ]);

            expect(h.createSource).toHaveBeenCalledWith(
                org,
                site,
                '.da/library/blocks/hero.html',
                '<body><header></header><main><div><div class="hero">Ex</div></div></main><footer></footer></body>'
            );
        });

        it('passes no overwrite option, so an authored page survives', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));

            await h.ops.ensureBlockDocPages(org, site, [
                { title: 'Hero', id: 'hero', exampleHtml: '<div class="hero"></div>' },
            ]);

            expect(h.createSource.mock.calls[0]).toHaveLength(4);
        });

        it('leaves a block that already has a doc page untouched', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['hero']));

            await h.ops.ensureBlockDocPages(org, site, [
                { title: 'Hero', id: 'hero', exampleHtml: '<div class="hero"></div>' },
            ]);

            expect(h.createSource).not.toHaveBeenCalled();
        });

        it('probes nothing when no block carries an example', async () => {
            await h.ops.ensureBlockDocPages(org, site, [{ title: 'Hero', id: 'hero' }]);

            expect(h.fetchWithRetry).not.toHaveBeenCalled();
            expect(h.createSource).not.toHaveBeenCalled();
            // Not one DA.live round-trip: no token is minted either. Without
            // this the pass could fall through to a probe of an empty list and
            // still look identical from the writes alone.
            expect(h.getImsToken).not.toHaveBeenCalled();
        });

        it('writes each page exactly once when there are more blocks than one batch', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            const many = Array.from({ length: 7 }, (_unused, i) => ({
                title: `Block ${i}`,
                id: `block-${i}`,
                exampleHtml: `<div class="block-${i}"></div>`,
            }));

            await h.ops.ensureBlockDocPages(org, site, many);

            const written = h.createSource.mock.calls.map((call) => call[2]);
            expect(written).toStrictEqual(many.map((b) => `.da/library/blocks/${b.id}.html`));
        });

        it('writes the remaining pages when one of them fails', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            h.createSource.mockImplementation(async (_o: string, _s: string, path: string) =>
                path.includes('hero')
                    ? { success: false, error: 'forbidden' }
                    : { success: true, path }
            );

            await h.ops.ensureBlockDocPages(org, site, [
                { title: 'Hero', id: 'hero', exampleHtml: '<div class="hero"></div>' },
                { title: 'Cards', id: 'cards', exampleHtml: '<div class="cards"></div>' },
            ]);

            const written = h.createSource.mock.calls.map((call) => call[2]);
            expect(written).toStrictEqual([
                '.da/library/blocks/hero.html',
                '.da/library/blocks/cards.html',
            ]);
        });

        it('writes the remaining pages when one of them throws', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            h.createSource.mockImplementation(async (_o: string, _s: string, path: string) => {
                if (path.includes('hero')) throw new Error('socket hang up');
                return { success: true, path };
            });

            await h.ops.ensureBlockDocPages(org, site, [
                { title: 'Hero', id: 'hero', exampleHtml: '<div class="hero"></div>' },
                { title: 'Cards', id: 'cards', exampleHtml: '<div class="cards"></div>' },
            ]);

            expect(h.createSource).toHaveBeenCalledTimes(2);
        });
    });

    describe('the doc-page probe', () => {
        it('HEADs each block page on the destination site with the bearer token', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));

            await h.ops.ensureBlockDocPages(org, site, [
                { title: 'Hero', id: 'hero', exampleHtml: '<div class="hero"></div>' },
            ]);

            expect(h.fetchWithRetry).toHaveBeenCalledWith(
                'https://admin.da.live/source/user-org/user-site/.da/library/blocks/hero.html',
                { method: 'HEAD', headers: { Authorization: 'Bearer mock-ims-token' } }
            );
        });

        it('treats a block whose probe throws as undocumented rather than failing', async () => {
            h.fetchWithRetry.mockRejectedValue(new Error('network down'));

            await h.ops.ensureBlockDocPages(org, site, [
                { title: 'Hero', id: 'hero', exampleHtml: '<div class="hero"></div>' },
            ]);

            expect(h.createSource).toHaveBeenCalledWith(
                org,
                site,
                '.da/library/blocks/hero.html',
                expect.stringContaining('class="hero"')
            );
        });
    });

    describe('the generated stub pages', () => {
        const runCreation = (
            blocks: Array<{ title: string; id: string }>
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
                ) => Promise<{ content: string; sha: string } | null>
            );

        it('renders the block id as a class and the title as the only copy', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));

            await runCreation([{ title: 'Store Locator', id: 'store-locator' }]);

            expect(h.createSource).toHaveBeenCalledWith(
                org,
                site,
                '.da/library/blocks/store-locator.html',
                '<body><header></header><main><div><div class="store-locator"><div><div><p>Store Locator</p></div></div></div></div></main><footer></footer></body>'
            );
        });

        it('does not stub a block that carries its own example markup', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));

            await h.ops.createBlockLibraryFromTemplate(
                org,
                site,
                'hlxsites',
                'citisignal',
                jest.fn().mockResolvedValue(
                    componentDefinition([
                        {
                            id: 'blocks',
                            components: [
                                {
                                    title: 'Hero',
                                    id: 'hero',
                                    plugins: { da: { unsafeHTML: '<div class="hero">Ex</div>' } },
                                },
                            ],
                        },
                    ])
                ) as unknown as (
                    owner: string,
                    repo: string,
                    path: string
                ) => Promise<{ content: string; sha: string } | null>
            );

            // One write only — the ensure pass. A stub on top would replace the
            // template's own example with a placeholder.
            expect(h.createSource).toHaveBeenCalledTimes(1);
            expect(h.createSource.mock.calls[0][3]).toContain('<div class="hero">Ex</div>');
        });

        it('treats a block with an empty plugins object as having no example', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));

            await h.ops.createBlockLibraryFromTemplate(
                org,
                site,
                'hlxsites',
                'citisignal',
                jest.fn().mockResolvedValue(
                    componentDefinition([
                        {
                            id: 'blocks',
                            components: [{ title: 'Hero', id: 'hero', plugins: {} }],
                        },
                    ])
                ) as unknown as (
                    owner: string,
                    repo: string,
                    path: string
                ) => Promise<{ content: string; sha: string } | null>
            );

            expect(h.createSource.mock.calls[0][3]).toContain('<p>Hero</p>');
        });

        it('does not stub a block that already has a doc page', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['store-locator']));

            await runCreation([{ title: 'Store Locator', id: 'store-locator' }]);

            expect(h.createSource).not.toHaveBeenCalled();
        });

        it('stubs every undocumented block, including ones no library installed', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));

            await runCreation([
                { title: 'Store Locator', id: 'store-locator' },
                { title: 'Accordion', id: 'accordion' },
            ]);

            const written = h.createSource.mock.calls.map((call) => call[2]);
            expect(written).toStrictEqual([
                '.da/library/blocks/store-locator.html',
                '.da/library/blocks/accordion.html',
            ]);
        });

        it('stubs each block exactly once when there are more blocks than one batch', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            const many = Array.from({ length: 7 }, (_unused, i) => ({
                title: `Block ${i}`,
                id: `block-${i}`,
            }));

            await runCreation(many);

            const written = h.createSource.mock.calls.map((call) => call[2]);
            expect(written).toStrictEqual(many.map((b) => `.da/library/blocks/${b.id}.html`));
        });

        it('writes the remaining stubs when DA.live rejects one of them', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            h.createSource.mockImplementation(async (_o: string, _s: string, path: string) =>
                path.includes('accordion')
                    ? { success: false, error: 'forbidden' }
                    : { success: true, path }
            );

            const result = await runCreation([
                { title: 'Accordion', id: 'accordion' },
                { title: 'Carousel', id: 'carousel' },
            ]);

            const written = h.createSource.mock.calls.map((call) => call[2]);
            expect(written).toStrictEqual([
                '.da/library/blocks/accordion.html',
                '.da/library/blocks/carousel.html',
            ]);
            expect(result.success).toBe(true);
        });

        it('keeps going when one stub write throws', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe([]));
            h.createSource.mockImplementation(async (_o: string, _s: string, path: string) => {
                if (path.includes('accordion')) throw new Error('socket hang up');
                return { success: true, path };
            });

            const result = await runCreation([
                { title: 'Accordion', id: 'accordion' },
                { title: 'Carousel', id: 'carousel' },
            ]);

            expect(h.createSource).toHaveBeenCalledTimes(2);
            expect(result.success).toBe(true);
        });
    });
});
