/**
 * The one entry point that builds a storefront's DA.live block library (step-02): it gathers the
 * storefront's block folders, Adobe's library from whichever content source the package names,
 * each installed library's site and example pages, the real uses on the library sites and the
 * storefront's content sources, and the pages the storefront already has; then hands the list to
 * the writer. Network reads go through the shared site fake; what is asserted is what the writer
 * is handed. Adobe's sheets are the 2026-11-23 captures (tests/fixtures/eds/block-library).
 * Which existing pages are kept or replaced, and the expired sign-in, are in
 * `storefrontBlockLibrary-pages.test.ts`.
 */

import * as vscode from 'vscode';
import { restoreFetch } from '../../../../helpers/siteFetchFake';
import {
    B2B,
    B2B_SITE,
    BRAND,
    ISLE5_LIVE,
    ISLE5_SITE,
    PARAMS,
    SERVED,
    STOREFRONT_TREE,
    WIDGET_JS,
    WRITTEN,
    harness,
} from './storefrontBlockLibrary.testUtils';
import {
    TEMPLATE_SOURCE,
    type ShippedBlockExample,
} from '@/features/eds/services/blockLibrary/shippedBlockExamples';
import { buildStorefrontBlockLibrary } from '@/features/eds/services/blockLibrary/storefrontBlockLibrary';

const SHIPPED: ShippedBlockExample = { description: 'A sample.', html: '<h2>A</h2><div class="widget"></div>' };

describe('buildStorefrontBlockLibrary', () => {
    afterEach(() => restoreFetch());

    // Adobe's accordion, columns and fragment are left out: this storefront has no folder for
    // them (EDS-71 step 5). metadata and section-metadata have no folder anywhere and stay.
    it('hands the writer Adobe\'s blocks it has code for, then every other folder', async () => {
        const h = harness();

        const result = await buildStorefrontBlockLibrary(h.deps, PARAMS);

        expect(result).toBe(WRITTEN);
        expect(h.blockLibOps.writeStorefrontBlockLibrary).toHaveBeenCalledWith(
            'user-org', 'user-site', expect.anything(),
        );
        expect(h.written().blocks.map((block) => block.id)).toEqual([
            'hero', 'cards', 'metadata', 'section-metadata',
            'carousel', 'tabs', 'widget', 'commerce-cart',
        ]);
        expect(h.exampleOf('hero')).toEqual({
            kind: 'adobe', source: { ...B2B_SITE, path: '/docs/library/blocks/hero' },
        });
        expect(h.exampleOf('cards')).toEqual({ kind: 'existing' });
        expect(h.exampleOf('tabs')).toEqual({
            kind: 'library', source: { ...ISLE5_SITE, path: '/.da/library/blocks/tabs' },
        });
        expect(h.exampleOf('carousel')).toMatchObject({ kind: 'library-use', from: '/home' });
        expect(h.exampleOf('commerce-cart')).toMatchObject({ kind: 'real-use', from: '/cart' });
        expect(h.exampleOf('widget')).toEqual({ kind: 'placeholder' });
    });

    it('uses a shipped example where the storefront\'s own pages have no use, with their photos', async () => {
        const photoPage = '<div><div class="hero"><div><div><picture>'
            + '<img src="./media_1.jpeg?width=750" alt=""></picture></div></div></div></div>';
        const h = harness({ ...SERVED, [`${BRAND}/about.plain.html`]: photoPage }, [], new Map([
            [TEMPLATE_SOURCE, new Map([['widget', SHIPPED], ['commerce-cart', SHIPPED]])],
        ]));

        await buildStorefrontBlockLibrary(h.deps, PARAMS);

        expect(h.exampleOf('widget')).toEqual({ kind: 'shipped', source: TEMPLATE_SOURCE, example: SHIPPED });
        expect(h.exampleOf('commerce-cart')).toMatchObject({ kind: 'real-use', from: '/cart' });
        expect(h.written().photos).toEqual([`${BRAND}/media_1.jpeg`]);
    });

    it('takes a library\'s shipped example over the template\'s, a library with no site too', async () => {
        const own: ShippedBlockExample = { description: 'Ours.', html: '<div class="carousel"></div>' };
        // Demo Builder Blocks has no content site and is read at its newest release.
        const releases = 'https://api.github.com/repos/skukla/demo-builder-block-library/releases?per_page=20';
        const served = { ...SERVED, [releases]: [{ tag_name: 'v1.0.0-beta.1', prerelease: true, draft: false }] };
        // An SC on the default update channel, which reads a component's betas.
        (vscode.workspace.getConfiguration as jest.Mock).mockImplementationOnce(() => ({
            get: (key: string, fallback?: unknown) => (key === 'updateChannel' ? 'stable' : fallback),
        }));
        const h = harness(served, [], new Map([
            [TEMPLATE_SOURCE, new Map([['carousel', SHIPPED]])],
            ['demo-builder-blocks', new Map([['carousel', own]])],
        ]));

        await buildStorefrontBlockLibrary(h.deps, PARAMS);

        expect(h.exampleOf('carousel')).toEqual({
            kind: 'shipped', source: 'demo-builder-blocks', example: own,
        });
        expect(h.listRepoFiles).toHaveBeenCalledWith('skukla', 'demo-builder-block-library', 'v1.0.0-beta.1');
    });

    it('reads the storefront\'s folders at main and asks for pages it already has', async () => {
        const h = harness();

        await buildStorefrontBlockLibrary(h.deps, PARAMS);

        expect(h.listRepoFiles).toHaveBeenCalledWith('sc', 'store', 'main');
        expect(h.listRepoFiles).toHaveBeenCalledWith('stephen-garner-adobe', 'isle5', 'main');
        const [org, site, asked] = h.blockLibOps.getBlocksWithDocs.mock.calls[0];
        expect([org, site]).toEqual(['user-org', 'user-site']);
        expect(asked.map((block: { id: string }) => block.id).sort()).toEqual([
            'accordion', 'cards', 'carousel', 'columns', 'commerce-cart', 'fragment', 'hero',
            'metadata', 'section-metadata', 'tabs', 'widget',
        ]);
    });

    it('tries the content source for Adobe\'s library first, then the account source', async () => {
        const h = harness();

        await buildStorefrontBlockLibrary(h.deps, PARAMS);

        const asked = h.site.asked();
        expect(asked.indexOf(`${BRAND}/docs/library/blocks.json`))
            .toBeLessThan(asked.indexOf(`${B2B}/docs/library/blocks.json`));
        expect(h.written().templates).toEqual({
            source: B2B_SITE,
            entries: [
                { id: 'product-details-page', title: 'Product Details Page Template' },
                { id: 'category-page', title: 'Category Page Template' },
            ],
        });
    });

    it('shapes a placeholder from the storefront\'s code, the default when a read fails', async () => {
        const h = harness();
        h.getFileContent.mockImplementation(async (_o: string, _r: string, path: string) => {
            if (path === 'blocks/widget/widget.js') return WIDGET_JS;
            throw new Error('GitHub 502');
        });

        await buildStorefrontBlockLibrary(h.deps, PARAMS);
        const { placeholderFor } = h.written();

        expect(await placeholderFor('widget')).toEqual({ rows: 1, columns: 3, variants: [] });
        expect(h.getFileContent).toHaveBeenCalledWith('sc', 'store', 'blocks/widget/widget.js', 'main');
        expect(await placeholderFor('tabs')).toEqual({ rows: 1, columns: 1, variants: [] });
    });

    it('lists no Adobe blocks or templates when no content source has Adobe\'s library', async () => {
        const h = harness();

        await buildStorefrontBlockLibrary(h.deps, { ...PARAMS, accountContentSource: undefined });

        expect(h.written().templates).toBeUndefined();
        expect(h.written().blocks.map((block) => block.id)).toEqual([
            'cards', 'carousel', 'hero', 'tabs', 'widget', 'commerce-cart',
        ]);
        expect(h.exampleOf('hero')).toEqual({ kind: 'placeholder' });
    });

    it('reads an added demo\'s content site as an example site for every block', async () => {
        const DEMO = 'https://main--demo-site--demo-org.aem.page';
        const h = harness({ ...SERVED, [`${DEMO}/docs/library/blocks/widget.plain.html`]: '<div></div>' });

        await buildStorefrontBlockLibrary(h.deps, {
            ...PARAMS, demoSite: { org: 'demo-org', site: 'demo-site' },
        });

        expect(h.exampleOf('widget')).toEqual({
            kind: 'library',
            source: { org: 'demo-org', site: 'demo-site', path: '/docs/library/blocks/widget' },
        });
    });

    it('writes nothing when the storefront\'s block folders cannot be read', async () => {
        const h = harness();
        h.listRepoFiles.mockRejectedValue(new Error('GitHub 502'));

        const result = await buildStorefrontBlockLibrary(h.deps, PARAMS);

        expect(h.blockLibOps.writeStorefrontBlockLibrary).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false,
            blocksCount: 0,
            paths: [],
            error: 'The storefront\'s blocks could not be read from GitHub, so the block list in '
                + 'DA.live was left unchanged.',
        });
    });

    it('degrades a failed read to no example source, never throwing', async () => {
        const h = harness(SERVED, [`${ISLE5_LIVE}/full-index.json`, `${B2B}/cart.plain.html`]);
        h.listRepoFiles.mockImplementation(async (owner: string) => {
            if (owner === 'sc') return STOREFRONT_TREE;
            throw new Error('GitHub 404');
        });

        await buildStorefrontBlockLibrary(h.deps, PARAMS);

        expect(h.exampleOf('tabs')).toEqual({ kind: 'placeholder' });
        expect(h.exampleOf('carousel')).toEqual({ kind: 'placeholder' });
        expect(h.exampleOf('commerce-cart')).toEqual({ kind: 'placeholder' });
    });
});
