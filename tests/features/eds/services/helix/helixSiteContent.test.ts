/**
 * HelixSiteContent — the whole-site publish policy, measured on its own
 * (EDS-8, 2026-10-08). The bulk calls and the DA.live listing are handed in,
 * so what is constrained here is the policy: discover first, bulk first, fall
 * back page-by-page, and the progress each path reports.
 */

import {
    HelixSiteContent,
    SITE_PUBLISH_PHASES,
    type HelixSiteContentDeps,
    type SitePublishProgress,
} from '@/features/eds/services/helix/helixSiteContent';
import { createMockLogger } from '../../../../helpers/loggerFake';

type Bulk = HelixSiteContentDeps['bulk'];
type BulkProgress = Parameters<Bulk['previewAllContent']>[3];

describe('HelixSiteContent.publishAllSiteContent', () => {
    let logger: ReturnType<typeof createMockLogger>;
    let previewAllContent: jest.MockedFunction<Bulk['previewAllContent']>;
    let publishAllContent: jest.MockedFunction<Bulk['publishAllContent']>;
    let listAllPages: jest.MockedFunction<HelixSiteContentDeps['discovery']['listAllPages']>;
    let previewAndPublishPage: jest.MockedFunction<HelixSiteContentDeps['previewAndPublishPage']>;
    let onProgress: jest.Mock<void, [SitePublishProgress]>;
    let site: HelixSiteContent;

    beforeEach(() => {
        logger = createMockLogger();
        previewAllContent = jest.fn().mockResolvedValue(undefined);
        publishAllContent = jest.fn().mockResolvedValue(undefined);
        listAllPages = jest.fn().mockResolvedValue(['/', '/about', '/products']);
        previewAndPublishPage = jest.fn().mockResolvedValue(undefined);
        onProgress = jest.fn();
        site = new HelixSiteContent({
            logger,
            bulk: { previewAllContent, publishAllContent },
            discovery: { listAllPages },
            previewAndPublishPage,
        });
    });

    describe('discovery', () => {
        it('refuses a repository name that is not owner/repo before touching anything', async () => {
            await expect(site.publishAllSiteContent('just-a-name')).rejects.toThrow(
                /Invalid repository name/,
            );
            expect(listAllPages).not.toHaveBeenCalled();
        });

        it('lists content from the GitHub owner/repo when no DA.live org/site is given', async () => {
            await site.publishAllSiteContent('owner/repo');

            expect(listAllPages).toHaveBeenCalledWith('owner', 'repo');
        });

        it('lists content from the DA.live org/site when they are given', async () => {
            await site.publishAllSiteContent('owner/repo', 'main', 'da-org', 'da-site');

            expect(listAllPages).toHaveBeenCalledWith('da-org', 'da-site');
            // ...but publishes against the GitHub repo, which is what Helix knows.
            expect(previewAllContent.mock.calls[0].slice(0, 2)).toEqual(['owner', 'repo']);
        });

        it('reports the discovering phase before anything is listed', async () => {
            listAllPages.mockImplementation(async () => {
                expect(onProgress).toHaveBeenCalledWith({
                    phase: SITE_PUBLISH_PHASES.DISCOVERING,
                    message: expect.any(String),
                });
                return ['/'];
            });

            await site.publishAllSiteContent('owner/repo', 'main', undefined, undefined, onProgress);

            expect(onProgress.mock.calls[0][0].phase).toBe(SITE_PUBLISH_PHASES.DISCOVERING);
        });

        it('fails when the site has no publishable pages, without calling the bulk API', async () => {
            listAllPages.mockResolvedValue([]);

            await expect(site.publishAllSiteContent('owner/repo')).rejects.toThrow(
                /No publishable pages found/,
            );
            expect(previewAllContent).not.toHaveBeenCalled();
            expect(previewAndPublishPage).not.toHaveBeenCalled();
        });
    });

    describe('the bulk path', () => {
        it('previews then publishes the discovered pages on the requested branch', async () => {
            await site.publishAllSiteContent('owner/repo', 'develop');

            const pages = ['/', '/about', '/products'];
            expect(previewAllContent).toHaveBeenCalledWith(
                'owner',
                'repo',
                'develop',
                expect.any(Function),
                pages,
            );
            expect(publishAllContent).toHaveBeenCalledWith(
                'owner',
                'repo',
                'develop',
                expect.any(Function),
                pages,
            );
            expect(previewAllContent.mock.invocationCallOrder[0]).toBeLessThan(
                publishAllContent.mock.invocationCallOrder[0],
            );
            expect(previewAndPublishPage).not.toHaveBeenCalled();
        });

        it('defaults the branch to main', async () => {
            await site.publishAllSiteContent('owner/repo');

            expect(previewAllContent.mock.calls[0][2]).toBe('main');
        });

        it('maps preview progress onto the first half and publish onto the second', async () => {
            previewAllContent.mockImplementation(async (_o, _s, _b, report?: BulkProgress) => {
                report?.(2, 3);
            });
            publishAllContent.mockImplementation(async (_o, _s, _b, report?: BulkProgress) => {
                report?.(3, 3);
            });

            await site.publishAllSiteContent('owner/repo', 'main', undefined, undefined, onProgress);

            const publishing = onProgress.mock.calls
                .map(([info]) => info)
                .filter((info) => info.phase === SITE_PUBLISH_PHASES.PUBLISHING);
            expect(publishing.map((info) => [info.current, info.total])).toEqual([
                [0, 3], // bulk preview starts
                [1, 3], // preview reported 2/3 -> floor(2/2)
                [1, 3], // bulk publish starts at floor(3/2)
                [2, 3], // publish reported 3/3 -> floor(3/2) + floor(3/2)
            ]);
        });

        it('reports completion at the full page count', async () => {
            await site.publishAllSiteContent('owner/repo', 'main', undefined, undefined, onProgress);

            expect(onProgress).toHaveBeenLastCalledWith({
                phase: SITE_PUBLISH_PHASES.COMPLETE,
                message: 'Published 3 pages to CDN',
                current: 3,
                total: 3,
            });
        });

        it('tolerates bulk progress reports when no progress callback was given', async () => {
            previewAllContent.mockImplementation(async (_o, _s, _b, report?: BulkProgress) => {
                report?.(1, 3);
            });
            publishAllContent.mockImplementation(async (_o, _s, _b, report?: BulkProgress) => {
                report?.(3, 3);
            });

            // It answers the pages it published (EDS-33: a reset compares against them).
            await expect(site.publishAllSiteContent('owner/repo')).resolves.toEqual([
                '/',
                '/about',
                '/products',
            ]);
            expect(previewAndPublishPage).not.toHaveBeenCalled();
        });
    });

    describe('the page-by-page fallback', () => {
        beforeEach(() => {
            previewAllContent.mockRejectedValue(new Error('404 Not Found'));
        });

        it('runs when the bulk path fails for any reason, and warns about it', async () => {
            await site.publishAllSiteContent('owner/repo', 'develop');

            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(previewAndPublishPage.mock.calls).toEqual([
                ['owner', 'repo', '/', 'develop'],
                ['owner', 'repo', '/about', 'develop'],
                ['owner', 'repo', '/products', 'develop'],
            ]);
            expect(publishAllContent).not.toHaveBeenCalled();
        });

        it('also runs when the bulk publish fails after a successful bulk preview', async () => {
            previewAllContent.mockResolvedValue(undefined);
            publishAllContent.mockRejectedValue(new Error('500 Internal Server Error'));

            await site.publishAllSiteContent('owner/repo');

            expect(previewAndPublishPage).toHaveBeenCalledTimes(3);
        });

        it('reports each page as it goes, then completion', async () => {
            await site.publishAllSiteContent('owner/repo', 'main', undefined, undefined, onProgress);

            const perPage = onProgress.mock.calls
                .map(([info]) => info)
                .filter((info) => info.currentPath !== undefined);
            expect(perPage).toEqual([
                {
                    phase: 'publishing',
                    message: 'Publishing to CDN (1/3)',
                    current: 0,
                    total: 3,
                    currentPath: '/',
                },
                expect.objectContaining({ current: 1, total: 3, currentPath: '/about' }),
                expect.objectContaining({ current: 2, total: 3, currentPath: '/products' }),
            ]);
            expect(onProgress).toHaveBeenLastCalledWith({
                phase: SITE_PUBLISH_PHASES.COMPLETE,
                message: 'Published 3 pages to CDN',
                current: 3,
                total: 3,
            });
        });

        it('skips a page whose publish answers 404 (no content) and keeps going', async () => {
            previewAndPublishPage.mockImplementation(async (_o, _s, path) => {
                if (path === '/about') {
                    throw new Error('Failed to preview page: 404 Not Found');
                }
            });

            await site.publishAllSiteContent('owner/repo', 'main', undefined, undefined, onProgress);

            expect(previewAndPublishPage).toHaveBeenCalledTimes(3);
            expect(onProgress).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    phase: SITE_PUBLISH_PHASES.COMPLETE,
                    message: 'Published 2 pages to CDN (1 skipped)',
                }),
            );
        });

        it('completion does not mention skipping when nothing was skipped', async () => {
            await site.publishAllSiteContent('owner/repo', 'main', undefined, undefined, onProgress);

            expect(onProgress.mock.lastCall?.[0].message).not.toMatch(/skipped/);
        });

        it('any other per-page failure stops the publish and propagates', async () => {
            previewAndPublishPage.mockImplementation(async (_o, _s, path) => {
                if (path === '/about') {
                    throw new Error('Failed to publish page: 403 Forbidden');
                }
            });

            await expect(site.publishAllSiteContent('owner/repo')).rejects.toThrow(/403/);
            expect(previewAndPublishPage).toHaveBeenCalledTimes(2);
        });
    });
});
