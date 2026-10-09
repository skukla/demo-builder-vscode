/**
 * unpublishLeftoverPages — after a reset republishes, take off the pages that are still
 * published but were not republished (EDS-33, the reset door).
 *
 * What these pin is WHICH paths reach Helix, asserted on the argument itself: a mock
 * that answers the same whatever it is handed cannot tell a right list from a wrong one.
 * And that the answer never reads as clean when Helix could not say what is published.
 */

import type { UnpublishPagesResult } from '@/features/eds/services/helix/helixPageDeletion';
import { unpublishLeftoverPages } from '@/features/eds/services/storefront/leftoverPages';
import type { UnpublishHelix } from '@/features/eds/services/storefront/storefrontUnpublish';
import { createMockLogger } from '../../../../helpers/loggerFake';

const SITE = { owner: 'acme', repo: 'storefront' };
const HOST = 'main--storefront--acme.aem.live';

type HelixFake = { [K in keyof UnpublishHelix]: jest.Mock<ReturnType<UnpublishHelix[K]>, Parameters<UnpublishHelix[K]>> };

function unpublishedAll(n: number): UnpublishPagesResult {
    return { success: n > 0, count: n, total: n, liveFailed: 0, previewFailed: 0 };
}

/** Helix lists `published` for the whole site and removes whatever it is handed. */
function helixFake(published: string[]): HelixFake {
    return {
        listPublishedPaths: jest
            .fn<Promise<string[]>, [string, string, string, string]>()
            .mockResolvedValue(published),
        unpublishPages: jest
            .fn<Promise<UnpublishPagesResult>, [string, string, string, string[]]>()
            .mockImplementation(async (_o, _s, _b, paths) => unpublishedAll(paths.length)),
    };
}

/** The list handed to Helix's unpublish, or undefined when it was never called. */
const unpublished = (helix: HelixFake): string[] | undefined => helix.unpublishPages.mock.calls[0]?.[3];

describe('unpublishLeftoverPages', () => {
    it('asks Helix what the whole site has published, on the GitHub owner/repo and main', async () => {
        const helix = helixFake([]);

        await unpublishLeftoverPages(SITE, { republished: [], alsoPublished: [] }, { helix, logger: createMockLogger() });

        expect(helix.listPublishedPaths).toHaveBeenCalledWith('acme', 'storefront', 'main', '/*');
    });

    it('unpublishes exactly the published pages the reset did not republish', async () => {
        const helix = helixFake(['/index', '/about', '/old-campaign', '/summer/lookbook']);

        const result = await unpublishLeftoverPages(
            SITE,
            { republished: ['/', '/about'], alsoPublished: [] },
            { helix, logger: createMockLogger() },
        );

        expect(helix.unpublishPages).toHaveBeenCalledTimes(1);
        expect(helix.unpublishPages.mock.calls[0].slice(0, 3)).toEqual(['acme', 'storefront', 'main']);
        expect(unpublished(helix)).toEqual(['/old-campaign', '/summer/lookbook']);
        expect(result).toEqual({
            status: 'removed',
            removed: 2,
            summary: `Took 2 pages from before the reset off ${HOST}.`,
        });
    });

    it('never lists a product page, whatever Helix says is published', async () => {
        // Step 8's pre-warm owns the product pages and runs after this; the old catalog's
        // pages were taken out before the content copy, with the shared-repository refusal.
        const helix = helixFake(['/products/drum/dc-100', '/products/default', '/Products/Shirt/S-1', '/gone']);

        await unpublishLeftoverPages(SITE, { republished: [], alsoPublished: [] }, { helix, logger: createMockLogger() });

        expect(unpublished(helix)).toEqual(['/gone']);
    });

    it('matches a folder index and a case difference to the page the reset republished', async () => {
        // Helix's spelling of a page is not guaranteed to be the publish list's: the home
        // page may come back as /index. Taking the home page down is the worst outcome.
        const helix = helixFake(['/index', '/Shop/index', '/About']);

        const result = await unpublishLeftoverPages(
            SITE,
            { republished: ['/', '/shop', '/about'], alsoPublished: [] },
            { helix, logger: createMockLogger() },
        );

        expect(helix.unpublishPages).not.toHaveBeenCalled();
        expect(result.status).toBe('none');
    });

    it('keeps the block library pages the reset published after the content', async () => {
        const helix = helixFake(['/.da/library/blocks/cards', '/stale']);

        await unpublishLeftoverPages(
            SITE,
            { republished: [], alsoPublished: ['.da/library/blocks/cards'] },
            { helix, logger: createMockLogger() },
        );

        expect(unpublished(helix)).toEqual(['/stale']);
    });

    it('leaves files that are not pages, and the folders the publish step never publishes', async () => {
        // The republish only publishes pages, so "not republished" says nothing about a
        // sheet, an image, or a page under a folder the publish step skips on purpose.
        const helix = helixFake([
            '/placeholders.json',
            '/media_abc.png',
            '/enrichment/products',
            '/experiments/test-a',
            '/metadata',
            '/stale',
        ]);

        await unpublishLeftoverPages(SITE, { republished: [], alsoPublished: [] }, { helix, logger: createMockLogger() });

        expect(unpublished(helix)).toEqual(['/stale']);
    });

    it('says so, and removes nothing, when Helix cannot say what is published', async () => {
        const helix = helixFake([]);
        helix.listPublishedPaths.mockRejectedValue(new Error('Helix refused to list the published pages (HTTP 401)'));

        const result = await unpublishLeftoverPages(
            SITE,
            { republished: ['/'], alsoPublished: [] },
            { helix, logger: createMockLogger() },
        );

        expect(helix.unpublishPages).not.toHaveBeenCalled();
        expect(result.status).toBe('not-listed');
        expect(result.removed).toBe(0);
        expect(result.summary).toBe(
            `Pages from before the reset may still be live on ${HOST}: Helix could not list what is ` +
                'published (Helix refused to list the published pages (HTTP 401)). Reset again to remove them.',
        );
    });

    it('says so, and asks Helix nothing, when it is not known what the reset republished', async () => {
        const helix = helixFake(['/stale']);

        const result = await unpublishLeftoverPages(
            SITE,
            { republished: undefined, alsoPublished: [] },
            { helix, logger: createMockLogger() },
        );

        expect(helix.listPublishedPaths).not.toHaveBeenCalled();
        expect(helix.unpublishPages).not.toHaveBeenCalled();
        expect(result.status).toBe('not-compared');
        expect(result.summary).toContain('may still be live');
    });

    it('reports pages that could not be taken off live as still live', async () => {
        const helix = helixFake(['/a', '/b', '/c']);
        helix.unpublishPages.mockResolvedValue({ success: true, count: 1, total: 3, liveFailed: 2, previewFailed: 0 });

        const result = await unpublishLeftoverPages(SITE, { republished: [], alsoPublished: [] }, { helix, logger: createMockLogger() });

        expect(result.status).toBe('some-left');
        expect(result.summary).toBe(
            `2 of 3 pages from before the reset could not be taken off ${HOST} and are still live. ` +
                'Reset again to remove them.',
        );
    });

    it('never throws when the unpublish itself fails', async () => {
        const helix = helixFake(['/a']);
        helix.unpublishPages.mockRejectedValue(new Error('admin.hlx.page unreachable'));

        const result = await unpublishLeftoverPages(SITE, { republished: [], alsoPublished: [] }, { helix, logger: createMockLogger() });

        expect(result.status).toBe('some-left');
        expect(result.summary).toContain('admin.hlx.page unreachable');
    });

    it('says there was nothing to remove when every published page was republished', async () => {
        const helix = helixFake(['/index', '/about']);

        const result = await unpublishLeftoverPages(
            SITE,
            { republished: ['/', '/about'], alsoPublished: [] },
            { helix, logger: createMockLogger() },
        );

        expect(helix.unpublishPages).not.toHaveBeenCalled();
        expect(result).toEqual({ status: 'none', removed: 0, summary: `No pages from before the reset were left on ${HOST}.` });
    });
});
