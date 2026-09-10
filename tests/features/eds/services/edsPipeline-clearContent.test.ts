/**
 * EDS Pipeline — clearing a site's content and unpublishing what it published.
 *
 * The undo half of the pipeline, and the only step that DELETES: it empties
 * DA.live and then tells the CDN to forget the pages that content produced.
 * Nothing covered it (PL-22 MUT-04), which matters because the failure it hides
 * is invisible: pages that were supposed to disappear keep serving their old
 * content from the edge, and the reset that "worked" is the thing an SC then
 * demos.
 *
 * The path translation gets its own tests. `/products/index.html` in DA.live is
 * `/products` at the CDN, and unpublishing the wrong string unpublishes nothing.
 */

import { createMockLogger } from '../../../helpers/loggerFake';
import {
    basePipelineParams,
    executeEdsPipeline,
    pipelineServices,
    type EdsPipelineParams,
    type EdsPipelineServices,
} from './edsPipeline.testUtils';

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: jest.fn().mockResolvedValue(undefined),
    publishLibraryPaths: jest.fn().mockResolvedValue(undefined),
    verifyLibraryPreviewed: jest.fn().mockResolvedValue(true),
}));

type ProgressCall = {
    operation: string;
    message: string;
    subMessage?: string;
};

describe('executeEdsPipeline - clearing content', () => {
    let mockDeleteAllSiteContent: jest.Mock;
    let mockUnpublishPages: jest.Mock;
    let services: EdsPipelineServices;
    let params: EdsPipelineParams;
    let progress: ProgressCall[];
    let onProgress: (info: ProgressCall) => void;

    /** Everything cleared, nothing left to unpublish, unless a test says otherwise. */
    beforeEach(() => {
        jest.clearAllMocks();
        progress = [];
        onProgress = (info) => progress.push(info);

        mockDeleteAllSiteContent = jest.fn().mockResolvedValue({
            success: true,
            deletedCount: 0,
            deletedPaths: [],
        });
        mockUnpublishPages = jest
            .fn()
            .mockResolvedValue({ total: 0, liveFailed: 0, previewFailed: 0 });

        services = pipelineServices({
            daLiveContentOps: {
                deleteAllSiteContent: mockDeleteAllSiteContent,
                copyContentFromSource: jest.fn(),
                createBlockLibraryFromTemplate: jest.fn(),
            },
            githubFileOps: { getFileContent: jest.fn() },
            helixService: {
                purgeCacheAll: jest.fn().mockResolvedValue(undefined),
                publishAllSiteContent: jest.fn().mockResolvedValue(undefined),
                unpublishPages: mockUnpublishPages,
            } as unknown as EdsPipelineServices['helixService'],
            logger: createMockLogger(),
        });

        params = {
            ...basePipelineParams(),
            clearExistingContent: true,
            skipContent: true,
            skipPublish: true,
        };
    });

    /** The progress messages this run reported, in order. */
    const messages = () => progress.map((p) => p.message);

    describe('the delete itself', () => {
        it('does not clear anything unless the caller asked for it', async () => {
            await executeEdsPipeline(
                { ...params, clearExistingContent: false },
                services,
                onProgress
            );

            expect(mockDeleteAllSiteContent).not.toHaveBeenCalled();
        });

        it('clears the site named in the parameters', async () => {
            await executeEdsPipeline(params, services, onProgress);

            expect(mockDeleteAllSiteContent).toHaveBeenCalledWith(
                'test-org',
                'test-site',
                expect.any(Function)
            );
        });

        it('reports what it is doing before it starts', async () => {
            await executeEdsPipeline(params, services, onProgress);

            expect(progress[0]).toEqual({
                operation: 'content-clear',
                message: 'Clearing existing DA.live content...',
                subMessage: 'test-org/test-site',
            });
        });

        it('counts up as files go', async () => {
            // The delete can run for minutes on a large site; the running count
            // is the only sign it is alive.
            mockDeleteAllSiteContent.mockImplementation(
                async (
                    _org: string,
                    _site: string,
                    report: (i: { deleted: number; current: string }) => void
                ) => {
                    report({ deleted: 7, current: '/products/shoes.html' });
                    return { success: true, deletedCount: 7, deletedPaths: [] };
                }
            );

            await executeEdsPipeline(params, services, onProgress);

            expect(progress).toContainEqual({
                operation: 'content-clear',
                message: 'Clearing content (7 files removed)',
                subMessage: '/products/shoes.html',
            });
        });

        it('says how many it cleared when it is done', async () => {
            mockDeleteAllSiteContent.mockResolvedValue({
                success: true,
                deletedCount: 12,
                deletedPaths: [],
            });

            await executeEdsPipeline(params, services, onProgress);

            expect(messages()).toContain('Cleared 12 files');
        });

        it('stops the whole pipeline when the clear fails', async () => {
            // A half-cleared site copied over is worse than one that was never
            // touched: the leftovers look like content the new package shipped.
            mockDeleteAllSiteContent.mockResolvedValue({
                success: false,
                error: 'DA.live refused the delete',
                deletedCount: 0,
                deletedPaths: [],
            });

            const result = await executeEdsPipeline(params, services, onProgress);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Content clear failed: DA.live refused the delete');
            expect(mockUnpublishPages).not.toHaveBeenCalled();
        });

        it('runs with no progress callback at all', async () => {
            // The reset path calls the pipeline without one.
            mockDeleteAllSiteContent.mockImplementation(
                async (
                    _org: string,
                    _site: string,
                    report: (i: { deleted: number; current: string }) => void
                ) => {
                    report({ deleted: 1, current: '/index.html' });
                    return { success: true, deletedCount: 1, deletedPaths: [] };
                }
            );

            const result = await executeEdsPipeline(params, services);

            expect(result.success).toBe(true);
        });
    });

    describe('unpublishing what was deleted', () => {
        it('does not call the CDN when nothing was deleted', async () => {
            await executeEdsPipeline(params, services, onProgress);

            expect(mockUnpublishPages).not.toHaveBeenCalled();
        });

        it('unpublishes the deleted pages from the site branch', async () => {
            mockDeleteAllSiteContent.mockResolvedValue({
                success: true,
                deletedCount: 1,
                deletedPaths: ['/accessories.html'],
            });

            await executeEdsPipeline(params, services, onProgress);

            expect(mockUnpublishPages).toHaveBeenCalledWith('test-owner', 'test-repo', 'main', [
                '/accessories',
            ]);
        });

        it('says how many CDN pages it is unpublishing', async () => {
            mockDeleteAllSiteContent.mockResolvedValue({
                success: true,
                deletedCount: 2,
                deletedPaths: ['/a.html', '/b.html'],
            });

            await executeEdsPipeline(params, services, onProgress);

            expect(progress).toContainEqual({
                operation: 'content-clear',
                message: 'Unpublishing 2 CDN pages...',
            });
        });

        it('tells the SC when pages would not unpublish', async () => {
            // These are the pages that will NOT disappear. The reset republishes
            // over the top, so the run still succeeds — but the leftovers are a
            // fact the SC needs before they demo.
            mockDeleteAllSiteContent.mockResolvedValue({
                success: true,
                deletedCount: 60,
                deletedPaths: ['/a.html'],
            });
            mockUnpublishPages.mockResolvedValue({ total: 60, liveFailed: 52, previewFailed: 3 });

            const result = await executeEdsPipeline(params, services, onProgress);

            expect(progress).toContainEqual({
                operation: 'content-clear',
                message: '⚠️ 52 of 60 pages could not be unpublished',
            });
            expect(result.success).toBe(true);
        });

        it('stays quiet when every page unpublished', async () => {
            // The control. Without it, "always warns" would pass the test above.
            mockDeleteAllSiteContent.mockResolvedValue({
                success: true,
                deletedCount: 3,
                deletedPaths: ['/a.html'],
            });
            mockUnpublishPages.mockResolvedValue({ total: 3, liveFailed: 0, previewFailed: 0 });

            await executeEdsPipeline(params, services, onProgress);

            expect(messages().some((m) => m.includes('could not be unpublished'))).toBe(false);
        });

        it('finishes the clear even when the CDN call throws', async () => {
            mockDeleteAllSiteContent.mockResolvedValue({
                success: true,
                deletedCount: 4,
                deletedPaths: ['/a.html'],
            });
            mockUnpublishPages.mockRejectedValue(new Error('admin.hlx.page unreachable'));

            const result = await executeEdsPipeline(params, services, onProgress);

            expect(result.success).toBe(true);
            expect(messages()).toContain('Cleared 4 files');
        });
    });

    it('reports a failed unpublish with no progress callback at all', async () => {
        // The warning path has its own progress push; the reset flow calls the
        // pipeline without a callback.
        mockDeleteAllSiteContent.mockResolvedValue({
            success: true,
            deletedCount: 5,
            deletedPaths: ['/a.html'],
        });
        mockUnpublishPages.mockResolvedValue({ total: 5, liveFailed: 5, previewFailed: 0 });

        const result = await executeEdsPipeline(params, services);

        expect(result.success).toBe(true);
    });

    describe('DA.live paths become CDN paths', () => {
        /** Clear a site holding exactly these paths, and answer with what the CDN was told. */
        async function unpublishedPaths(deletedPaths: string[]): Promise<string[]> {
            mockDeleteAllSiteContent.mockResolvedValue({
                success: true,
                deletedCount: deletedPaths.length,
                deletedPaths,
            });

            await executeEdsPipeline(params, services, onProgress);

            return mockUnpublishPages.mock.calls[0]?.[3] as string[];
        }

        it('drops the .html a page is stored under', async () => {
            expect(await unpublishedPaths(['/accessories.html'])).toEqual(['/accessories']);
        });

        it('turns a folder index into the folder itself', async () => {
            expect(await unpublishedPaths(['/products/index.html'])).toEqual(['/products']);
        });

        it('turns the site index into the root', async () => {
            expect(await unpublishedPaths(['/index.html'])).toEqual(['/']);
        });

        it('leaves a page whose name merely ends in index alone', async () => {
            // `/reindex.html` is a page called reindex, not a folder index.
            expect(await unpublishedPaths(['/reindex.html'])).toEqual(['/reindex']);
        });

        it('leaves non-page files exactly as they are', async () => {
            // Images and JSON are served at the path they are stored under.
            expect(await unpublishedPaths(['/media_abc.png', '/config.json'])).toEqual([
                '/media_abc.png',
                '/config.json',
            ]);
        });

        it('strips the page extension, not one inside a folder name', async () => {
            // A folder called `docs.html` keeps its name; only the trailing
            // extension goes. An unanchored match would unpublish `/docs/start`,
            // a path the CDN has never heard of.
            expect(await unpublishedPaths(['/docs.html/start.html'])).toEqual(['/docs.html/start']);
        });

        it('leaves a stored path with no extension alone', async () => {
            // Only pages are translated. A path with no extension is not a page,
            // so it reaches the CDN exactly as DA.live held it — even when it
            // happens to end in the word the folder-index rule looks for.
            expect(await unpublishedPaths(['/legacy/index'])).toEqual(['/legacy/index']);
        });

        it('leaves an upper-case extension alone', async () => {
            // DA.live paths are lower-case; `.HTML` is treated as part of the
            // page name rather than as an extension, at both ends of this
            // translation, so the CDN is told the same string DA.live held.
            expect(await unpublishedPaths(['/Guide.HTML'])).toEqual(['/Guide.HTML']);
        });
    });
});
