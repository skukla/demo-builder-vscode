/**
 * EDS Pipeline — clearing a site's content.
 *
 * The step that DELETES: it empties DA.live so the copy starts from a clean source.
 * Nothing covered it (PL-22 MUT-04).
 *
 * It unpublishes nothing (EDS-33, 2026-10-09). It used to unpublish every deleted page,
 * which took the storefront offline until the republish; the pages left over after the
 * republish are now taken off by a later step (`edsPipeline-leftoverPages.test.ts`).
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
                message: 'Clearing existing DA.live content',
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

    it('unpublishes nothing, even when pages were deleted', async () => {
        // The site stays up while the content is replaced; the republish overwrites it.
        mockDeleteAllSiteContent.mockResolvedValue({
            success: true,
            deletedCount: 2,
            deletedPaths: ['/index.html', '/accessories.html'],
        });

        const result = await executeEdsPipeline(params, services, onProgress);

        expect(result.success).toBe(true);
        expect(mockUnpublishPages).not.toHaveBeenCalled();
        expect(messages().some((m) => /Unpublishing|unpublished/.test(m))).toBe(false);
    });
});
