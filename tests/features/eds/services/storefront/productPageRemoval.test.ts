/**
 * removeProductPages — taking a storefront's generated product pages off Helix (EDS-26).
 *
 * Product pages (`/products/{urlKey}/{sku}`) are published through the overlay and have
 * no DA.live document. Boundaries faked: Helix (the listing of what the site has
 * published, and the page remover), the DA.live listing of authored pages under
 * `/products`, and the list of other local projects on the same repository.
 *
 * The promises under test, each asserted on what was HANDED to the remover:
 * - only generated product pages, on the SC's own site (keyed by GitHub owner/repo);
 * - nothing outside `/products/`, no authored page, never the product template;
 * - a refusal — and no Helix call at all — when another project publishes to the repo;
 * - a failed listing removes nothing and says the pages may still be live;
 * - a refused preview removal is reported as live-only, never as a clean zero.
 */

import {
    removeProductPages,
    type ProductPageRemovalDeps,
} from '@/features/eds/services/storefront/productPageRemoval';
import { createMockLogger } from '../../../../helpers/loggerFake';

const TARGET = { repoOwner: 'skukla', repoName: 'kukla-justrite' };

const PUBLISHED = [
    '/products/drum-cabinet/dc-100',
    '/products/exit-sign/es_2f20',
    '/products/default',
    '/products',
    '/products/hand-built/landing',
    '/signs',
    '/index',
    '/productsfoo/a/b',
    '/products/too/deep/path',
];

function setUp(overrides: Partial<ProductPageRemovalDeps> = {}, removal: Record<string, number> = {}) {
    const listPublishedPaths = jest.fn().mockResolvedValue(PUBLISHED);
    const unpublishPages = jest.fn(async (_o: string, _r: string, _b: string, paths: string[]) => ({
        success: true,
        count: paths.length,
        total: paths.length,
        liveFailed: 0,
        previewFailed: 0,
        ...removal,
    }));
    const deps: ProductPageRemovalDeps = {
        helix: { listPublishedPaths, unpublishPages },
        listAuthoredProductPages: jest.fn().mockResolvedValue(['/products/default', '/products/hand-built/landing']),
        otherProjectsOnRepo: jest.fn().mockResolvedValue([]),
        logger: createMockLogger(),
        ...overrides,
    };
    return { deps, listPublishedPaths, unpublishPages };
}

describe('removeProductPages', () => {
    it('asks Helix what the site has published under /products, by GitHub owner and repo', async () => {
        const { deps, listPublishedPaths } = setUp();

        await removeProductPages(TARGET, deps);

        expect(listPublishedPaths).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'main', '/products/*');
    });

    it('hands the remover only generated product pages: nothing outside /products/, no authored page', async () => {
        const { deps, unpublishPages } = setUp();

        const result = await removeProductPages(TARGET, deps);

        expect(unpublishPages).toHaveBeenCalledTimes(1);
        expect(unpublishPages).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'main', [
            '/products/drum-cabinet/dc-100',
            '/products/exit-sign/es_2f20',
        ]);
        expect(result).toMatchObject({ status: 'removed', found: 2, liveRemoved: 2, previewRemoved: 2 });
        expect(result.summary).toBe('Removed 2 product pages from skukla/kukla-justrite, live and preview.');
    });

    it('never hands over the product template, even when DA.live does not list it', async () => {
        const { deps, unpublishPages } = setUp({ listAuthoredProductPages: jest.fn().mockResolvedValue([]) });

        await removeProductPages(TARGET, deps);

        const handed = unpublishPages.mock.calls[0][3];
        expect(handed).not.toContain('/products/default');
        expect(handed.every((path: string) => /^\/products\/[^/]+\/[^/]+$/.test(path))).toBe(true);
    });

    it('refuses, and calls Helix for nothing, when another project publishes to the same repository', async () => {
        const { deps, listPublishedPaths, unpublishPages } = setUp({
            otherProjectsOnRepo: jest.fn().mockResolvedValue(['Justrite B2B']),
        });

        const result = await removeProductPages(TARGET, deps);

        expect(listPublishedPaths).not.toHaveBeenCalled();
        expect(unpublishPages).not.toHaveBeenCalled();
        expect(result.status).toBe('refused');
        expect(result.summary).toBe(
            'Product pages were left published: the project "Justrite B2B" also publishes to ' +
                'skukla/kukla-justrite, and removing them would take its product pages down too.',
        );
    });

    it('names every other project in the refusal', async () => {
        const { deps } = setUp({ otherProjectsOnRepo: jest.fn().mockResolvedValue(['A', 'B']) });

        const result = await removeProductPages(TARGET, deps);

        expect(result.summary).toContain('the projects "A" and "B" also publish to skukla/kukla-justrite');
    });

    it('removes nothing when it cannot tell whether another project shares the repository', async () => {
        const { deps, unpublishPages } = setUp({
            otherProjectsOnRepo: jest.fn().mockRejectedValue(new Error('disk said no')),
        });

        const result = await removeProductPages(TARGET, deps);

        expect(unpublishPages).not.toHaveBeenCalled();
        expect(result.status).toBe('failed');
        expect(result.summary).toContain('may still be live');
    });

    it('removes nothing when Helix cannot list the pages, and does not call that zero', async () => {
        const { deps, unpublishPages } = setUp();
        (deps.helix.listPublishedPaths as jest.Mock).mockRejectedValue(new Error('401 Unauthorized'));

        const result = await removeProductPages(TARGET, deps);

        expect(unpublishPages).not.toHaveBeenCalled();
        expect(result.status).toBe('failed');
        expect(result.summary).toBe(
            "Couldn't list the product pages published on skukla/kukla-justrite (401 Unauthorized), " +
                'so none were removed. They may still be live.',
        );
    });

    it("puts a network failure in the formatter's words, not the library's", async () => {
        const { deps } = setUp();
        (deps.helix.listPublishedPaths as jest.Mock).mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED'));

        const result = await removeProductPages(TARGET, deps);

        expect(result.summary).toBe(
            "Couldn't list the product pages published on skukla/kukla-justrite (Could not connect to the " +
                'Helix service. Please check your internet connection), so none were removed. They may still be live.',
        );
        expect(result.summary).not.toContain('ECONNREFUSED');
    });

    it('removes nothing when the authored pages cannot be listed', async () => {
        const { deps, unpublishPages } = setUp({
            listAuthoredProductPages: jest.fn().mockRejectedValue(new Error('Authentication expired')),
        });

        const result = await removeProductPages(TARGET, deps);

        expect(unpublishPages).not.toHaveBeenCalled();
        expect(result.status).toBe('failed');
    });

    it('says so plainly when there was nothing published to remove', async () => {
        const { deps, unpublishPages } = setUp();
        (deps.helix.listPublishedPaths as jest.Mock).mockResolvedValue(['/products/default', '/index']);

        const result = await removeProductPages(TARGET, deps);

        expect(unpublishPages).not.toHaveBeenCalled();
        expect(result).toMatchObject({ status: 'nothing', found: 0 });
        expect(result.summary).toBe('Helix lists no product pages published on skukla/kukla-justrite.');
    });

    it('live-only fallback: says the preview copies remain when Helix refuses to remove them', async () => {
        const { deps } = setUp({}, { previewFailed: 2 });

        const result = await removeProductPages(TARGET, deps);

        expect(result).toMatchObject({ status: 'live-only', found: 2, liveRemoved: 2, previewRemoved: 0 });
        expect(result.summary).toBe(
            'Removed 2 product pages from the live site of skukla/kukla-justrite. Helix refused to remove ' +
                'the preview copy of 2 of them, so those preview copies remain.',
        );
    });

    it('says how many are still live when a live removal is refused', async () => {
        const { deps } = setUp({}, { liveFailed: 1, previewFailed: 1 });

        const result = await removeProductPages(TARGET, deps);

        expect(result.status).toBe('incomplete');
        expect(result.summary).toBe(
            'Removed 1 of 2 product pages from the live site of skukla/kukla-justrite; 1 could not be ' +
                'removed and may still be live. Helix refused to remove the preview copy of 1 of them, so ' +
                'those preview copies remain.',
        );
    });

    it('never throws: a remover that fails comes back as a failure sentence', async () => {
        const { deps } = setUp();
        (deps.helix.unpublishPages as jest.Mock).mockRejectedValue(new Error('Rate limited after 3 retries'));

        const result = await removeProductPages(TARGET, deps);

        expect(result.status).toBe('failed');
        expect(result.summary).toContain('Rate limited after 3 retries');
        expect(result.summary).toContain('may still be live');
    });
});
